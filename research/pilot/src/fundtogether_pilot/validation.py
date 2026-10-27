from __future__ import annotations

import csv
import hashlib
import importlib.metadata
import json
import math
import platform
from pathlib import Path
from typing import Any, Iterable

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.stats import norm

from .backer_model import ACCEPT, APPEAL, BackerBehavior, SignalOracle
from .config import PilotConfig
from .court_model import evaluate_court, settle_ccps
from .dao_model import BackerDao, WalletSnapshot, deterministic_counterexamples
from .judge_model import JudgeModel
from .random_streams import STREAM_VERSION, KeyedRandom
from .workflows import run_b0, run_b1, run_b2


RAW_REQUIRED_FIELDS = {
    "replication_id",
    "scenario_id",
    "model",
    "seed",
    "case_truth",
    "case_latent",
    "judge_accuracy_configured",
    "rho_configured",
    "judge_correctness_observed",
    "nonreveal_configured",
    "court1_verdict",
    "court2_verdict",
    "dao_decision",
    "final_state",
    "substantively_resolved",
    "terminally_complete",
}


class JsonlWriter:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.handle = path.open("w", encoding="utf-8", newline="\n")
        self.count = 0

    def write(self, record: dict[str, Any]) -> None:
        missing = RAW_REQUIRED_FIELDS - record.keys()
        if missing:
            raise ValueError(f"raw record missing fields: {sorted(missing)}")
        self.handle.write(
            json.dumps(record, sort_keys=True, separators=(",", ":"), allow_nan=False)
            + "\n"
        )
        self.count += 1

    def close(self) -> None:
        self.handle.close()


def _base_record(
    config: PilotConfig,
    replication_id: int,
    scenario_id: str,
    model: str,
) -> dict[str, Any]:
    return {
        "replication_id": replication_id,
        "scenario_id": scenario_id,
        "model": model,
        "seed": config.master_seed,
        "case_truth": None,
        "case_latent": None,
        "judge_accuracy_configured": None,
        "rho_configured": None,
        "judge_correctness_observed": None,
        "nonreveal_configured": None,
        "court1_verdict": None,
        "court2_verdict": None,
        "dao_decision": None,
        "final_state": None,
        "substantively_resolved": False,
        "terminally_complete": False,
    }


def _mean_ci(values: Iterable[float], confidence: float) -> tuple[float, float, float, float]:
    array = np.asarray(list(values), dtype=float)
    if array.size == 0:
        return math.nan, math.nan, math.nan, math.nan
    mean = float(np.mean(array))
    standard_error = float(np.std(array, ddof=1) / math.sqrt(array.size)) if array.size > 1 else 0.0
    z = float(norm.ppf(0.5 + confidence / 2.0))
    return mean, standard_error, max(0.0, mean - z * standard_error), min(1.0, mean + z * standard_error)


def _correlation_ci(
    first: Iterable[float], second: Iterable[float], confidence: float
) -> tuple[float | None, float | None, float | None, float | None]:
    x = np.asarray(list(first), dtype=float)
    y = np.asarray(list(second), dtype=float)
    if x.size < 4 or np.std(x) == 0.0 or np.std(y) == 0.0:
        return None, None, None, None
    observed = float(np.corrcoef(x, y)[0, 1])
    clipped = float(np.clip(observed, -0.999999999, 0.999999999))
    z_value = math.atanh(clipped)
    z_se = 1.0 / math.sqrt(x.size - 3)
    critical = float(norm.ppf(0.5 + confidence / 2.0))
    lower = math.tanh(z_value - critical * z_se)
    upper = math.tanh(z_value + critical * z_se)
    standard_error = (1.0 - clipped**2) * z_se
    return observed, standard_error, lower, upper


def _status(error: float, standard_error: float, floor: float, multiplier: float) -> tuple[str, float]:
    tolerance = max(floor, multiplier * standard_error)
    return ("PASS" if error <= tolerance else "FAIL"), tolerance


def _judge_validation(
    config: PilotConfig, random: KeyedRandom, raw: JsonlWriter
) -> list[dict[str, Any]]:
    tolerance = config["calibration_tolerances"]
    confidence = float(tolerance["confidence_level"])
    multiplier = float(tolerance["standard_error_multiplier"])
    rows: list[dict[str, Any]] = []
    for scenario in config["judge_scenarios"]:
        scenario_id = scenario["scenario_id"]
        accuracy = float(scenario["accuracy"])
        rho = float(scenario["rho"])
        model = JudgeModel(random, accuracy, rho)
        case_means: list[float] = []
        pair_left: list[float] = []
        pair_right: list[float] = []
        cross_left: list[float] = []
        cross_right: list[float] = []
        court1_means: list[float] = []
        court2_means: list[float] = []
        for replication_id in range(int(config["judge_replications"])):
            case = model.create_case(replication_id, scenario_id)
            observations = [
                model.observe(case, f"court{court}-judge{seat}")
                for court in (1, 2)
                for seat in range(3)
            ]
            values = [float(observation.correct) for observation in observations]
            court1 = evaluate_court(observations[:3])
            court2 = evaluate_court(observations[3:])
            case_means.append(float(np.mean(values)))
            court1_means.append(float(np.mean(values[:3])))
            court2_means.append(float(np.mean(values[3:])))
            pair_left.append(values[0])
            pair_right.append(values[1])
            cross_left.append(values[0])
            cross_right.append(values[3])
            record = _base_record(config, replication_id, scenario_id, "judge_calibration")
            record.update(
                {
                    "case_truth": case.truth,
                    "case_latent": case.shared_probability,
                    "judge_accuracy_configured": accuracy,
                    "rho_configured": rho,
                    "judge_correctness_observed": [bool(value) for value in values],
                    "nonreveal_configured": 0.0,
                    "court1_verdict": court1.verdict,
                    "court2_verdict": court2.verdict,
                }
            )
            raw.write(record)

        observed_accuracy, accuracy_se, accuracy_low, accuracy_high = _mean_ci(
            case_means, confidence
        )
        observed_rho, rho_se, rho_low, rho_high = _correlation_ci(
            pair_left, pair_right, confidence
        )
        cross_corr, cross_se, cross_low, cross_high = _correlation_ci(
            cross_left, cross_right, confidence
        )
        if observed_rho is None or rho_se is None:
            raise AssertionError("Judge correlation was undefined")
        accuracy_status, accuracy_tolerance = _status(
            abs(observed_accuracy - accuracy),
            accuracy_se,
            float(tolerance["accuracy_absolute_floor"]),
            multiplier,
        )
        correlation_status, correlation_tolerance = _status(
            abs(observed_rho - rho),
            rho_se,
            float(tolerance["correlation_absolute_floor"]),
            multiplier,
        )
        court1_accuracy = float(np.mean(court1_means))
        court2_accuracy = float(np.mean(court2_means))
        cross_status = "PASS"
        if cross_corr is None:
            cross_status = "FAIL"
        elif rho == 0.0 and abs(cross_corr) > correlation_tolerance:
            cross_status = "FAIL"
        elif rho > 0.0 and cross_corr <= 0.0:
            cross_status = "FAIL"
        rows.append(
            {
                "scenario_id": scenario_id,
                "configured_accuracy": accuracy,
                "observed_accuracy": observed_accuracy,
                "accuracy_absolute_error": abs(observed_accuracy - accuracy),
                "accuracy_standard_error_clustered_by_case": accuracy_se,
                "accuracy_ci_low": accuracy_low,
                "accuracy_ci_high": accuracy_high,
                "accuracy_tolerance": accuracy_tolerance,
                "accuracy_validation_status": accuracy_status,
                "configured_rho": rho,
                "observed_pairwise_correlation": observed_rho,
                "correlation_absolute_error": abs(observed_rho - rho),
                "correlation_standard_error_independent_case_pairs": rho_se,
                "correlation_ci_low": rho_low,
                "correlation_ci_high": rho_high,
                "correlation_tolerance": correlation_tolerance,
                "correlation_validation_status": correlation_status,
                "court1_accuracy": court1_accuracy,
                "court2_accuracy": court2_accuracy,
                "court_accuracy_difference": court2_accuracy - court1_accuracy,
                "cross_court_correlation": cross_corr,
                "cross_court_correlation_se": cross_se,
                "cross_court_ci_low": cross_low,
                "cross_court_ci_high": cross_high,
                "cross_court_validation_status": cross_status,
                "judge_overlap_count": 0,
            }
        )
    return rows


def _nonreveal_validation(
    config: PilotConfig, random: KeyedRandom, raw: JsonlWriter
) -> list[dict[str, Any]]:
    tolerance = config["calibration_tolerances"]
    confidence = float(tolerance["confidence_level"])
    multiplier = float(tolerance["standard_error_multiplier"])
    rows: list[dict[str, Any]] = []
    for probability in config["nonreveal_probabilities"]:
        probability = float(probability)
        scenario_id = f"ordinary_{probability:.2f}"
        model = JudgeModel(random, 0.70, 0.30, probability)
        case_rates: list[float] = []
        pair_left: list[float] = []
        pair_right: list[float] = []
        for replication_id in range(int(config["nonreveal_replications"])):
            case = model.create_case(replication_id, scenario_id)
            observations = [model.observe(case, f"judge-{index}") for index in range(6)]
            flags = [float(observation.nonreveal) for observation in observations]
            case_rates.append(float(np.mean(flags)))
            pair_left.append(flags[0])
            pair_right.append(flags[1])
            court = evaluate_court(observations[:3])
            record = _base_record(config, replication_id, scenario_id, "ordinary_nonreveal")
            record.update(
                {
                    "case_truth": case.truth,
                    "case_latent": case.shared_probability,
                    "judge_accuracy_configured": 0.70,
                    "rho_configured": 0.30,
                    "judge_correctness_observed": [
                        observation.correct for observation in observations
                    ],
                    "nonreveal_configured": probability,
                    "nonreveal_observed": [
                        observation.nonreveal for observation in observations
                    ],
                    "court1_verdict": court.verdict,
                    "court1_valid": court.valid,
                }
            )
            raw.write(record)
        observed, standard_error, lower, upper = _mean_ci(case_rates, confidence)
        error = abs(observed - probability)
        status, accepted_tolerance = _status(
            error,
            standard_error,
            float(tolerance["rate_absolute_floor"]),
            multiplier,
        )
        pair_corr, _, _, _ = _correlation_ci(pair_left, pair_right, confidence)
        rows.append(
            {
                "scenario_id": scenario_id,
                "model": "independent",
                "configured_nonreveal": probability,
                "observed_nonreveal": observed,
                "absolute_error": error,
                "standard_error_clustered_by_case": standard_error,
                "ci_low": lower,
                "ci_high": upper,
                "tolerance": accepted_tolerance,
                "pairwise_correlation": pair_corr,
                "validation_status": status,
            }
        )

    scenario_id = "coordinated_0.20"
    model = JudgeModel(random, 0.70, 0.30, 0.0)
    case_rates = []
    all_match = []
    for replication_id in range(int(config["nonreveal_replications"])):
        case = model.create_case(replication_id, scenario_id)
        observations = [
            model.observe(
                case,
                f"attacker-judge-{index}",
                coordinated_nonreveal=True,
                coordinated_probability=0.20,
            )
            for index in range(3)
        ]
        flags = [observation.nonreveal for observation in observations]
        case_rates.append(float(np.mean(flags)))
        all_match.append(len(set(flags)) == 1)
        court = evaluate_court(observations)
        record = _base_record(config, replication_id, scenario_id, "coordinated_nonreveal")
        record.update(
            {
                "case_truth": case.truth,
                "case_latent": case.shared_probability,
                "judge_accuracy_configured": 0.70,
                "rho_configured": 0.30,
                "judge_correctness_observed": [
                    observation.correct for observation in observations
                ],
                "nonreveal_configured": 0.20,
                "nonreveal_observed": flags,
                "court1_verdict": court.verdict,
                "court1_valid": court.valid,
            }
        )
        raw.write(record)
    observed, standard_error, lower, upper = _mean_ci(case_rates, confidence)
    status, accepted_tolerance = _status(
        abs(observed - 0.20),
        standard_error,
        float(tolerance["rate_absolute_floor"]),
        multiplier,
    )
    if not all(all_match):
        status = "FAIL"
    rows.append(
        {
            "scenario_id": scenario_id,
            "model": "shared_group_control",
            "configured_nonreveal": 0.20,
            "observed_nonreveal": observed,
            "absolute_error": abs(observed - 0.20),
            "standard_error_clustered_by_case": standard_error,
            "ci_low": lower,
            "ci_high": upper,
            "tolerance": accepted_tolerance,
            "within_group_match_rate": float(np.mean(all_match)),
            "validation_status": status,
        }
    )
    return rows


def _signal_validation(
    config: PilotConfig, random: KeyedRandom, raw: JsonlWriter
) -> list[dict[str, Any]]:
    tolerance = config["calibration_tolerances"]
    confidence = float(tolerance["confidence_level"])
    multiplier = float(tolerance["standard_error_multiplier"])
    rows: list[dict[str, Any]] = []
    contribution_scale = 1_000_000
    backer_count = int(config["backers_per_case"])
    contributions = [(index + 1) ** 2 * contribution_scale for index in range(backer_count)]
    for scenario in config["signal_scenarios"]:
        scenario_id = str(scenario["scenario_id"])
        sensitivity = float(scenario["sensitivity"])
        false_alarm = float(scenario["false_alarm"])
        oracle = SignalOracle(random, sensitivity, false_alarm)
        behavior = BackerBehavior(
            random, float(config["backer_participation_probability"])
        )
        judge_model = JudgeModel(random, 0.70, 0.30)
        incorrect_case_signal_rates: list[float] = []
        correct_case_signal_rates: list[float] = []
        participation_rates: list[float] = []
        appeal_signal_rates: list[float] = []
        dao_if_incorrect: list[float] = []
        dao_if_correct: list[float] = []
        harmful_appeals = 0
        for replication_id in range(int(config["signal_replications"])):
            case = judge_model.create_case(replication_id, f"signal-{scenario_id}")
            judges = [judge_model.observe(case, f"court1-judge-{index}") for index in range(3)]
            court1 = evaluate_court(judges)
            if not court1.valid or court1.verdict is None:
                raise AssertionError("signal calibration Court 1 unexpectedly invalid")
            court_incorrect = court1.verdict != case.truth
            snapshot = [
                WalletSnapshot(f"backer-{index}", contributions[index])
                for index in range(backer_count)
            ]
            dao = BackerDao(snapshot)
            observations = []
            for index in range(backer_count):
                backer_id = f"backer-{index}"
                signal = oracle.generate(
                    replication_id,
                    scenario_id,
                    backer_id,
                    court_incorrect=court_incorrect,
                )
                observation = behavior.observe(
                    replication_id, scenario_id, backer_id, signal
                )
                observations.append(observation)
                if observation.cast_ballot is not None:
                    dao.cast(backer_id, observation.cast_ballot)
            result = dao.finalize()
            signals = [float(observation.private_signal) for observation in observations]
            participation = [float(observation.participated) for observation in observations]
            case_signal_rate = float(np.mean(signals))
            if court_incorrect:
                incorrect_case_signal_rates.append(case_signal_rate)
                dao_if_incorrect.append(float(result.decision == APPEAL))
            else:
                correct_case_signal_rates.append(case_signal_rate)
                dao_if_correct.append(float(result.decision == APPEAL))
                harmful_appeals += int(result.decision == APPEAL)
            participation_rates.append(float(np.mean(participation)))
            appeal_signal_rates.append(case_signal_rate)
            record = _base_record(config, replication_id, scenario_id, "backer_signal")
            record.update(
                {
                    "case_truth": case.truth,
                    "case_latent": case.shared_probability,
                    "judge_accuracy_configured": 0.70,
                    "rho_configured": 0.30,
                    "judge_correctness_observed": [judge.correct for judge in judges],
                    "nonreveal_configured": 0.0,
                    "court1_verdict": court1.verdict,
                    "court1_incorrect": court_incorrect,
                    "private_signals": [
                        observation.private_signal for observation in observations
                    ],
                    "participation": [
                        observation.participated for observation in observations
                    ],
                    "ballot_preferences": [
                        observation.ballot_preference for observation in observations
                    ],
                    "cast_ballots": [
                        observation.cast_ballot for observation in observations
                    ],
                    "dao_decision": result.decision,
                    "dao_accept_weight": result.accept_weight,
                    "dao_appeal_weight": result.appeal_weight,
                }
            )
            raw.write(record)

        observed_sensitivity, sensitivity_se, sensitivity_low, sensitivity_high = _mean_ci(
            incorrect_case_signal_rates, confidence
        )
        observed_false_alarm, false_alarm_se, false_alarm_low, false_alarm_high = _mean_ci(
            correct_case_signal_rates, confidence
        )
        sensitivity_status, sensitivity_tolerance = _status(
            abs(observed_sensitivity - sensitivity),
            sensitivity_se,
            float(tolerance["rate_absolute_floor"]),
            multiplier,
        )
        false_alarm_status, false_alarm_tolerance = _status(
            abs(observed_false_alarm - false_alarm),
            false_alarm_se,
            float(tolerance["rate_absolute_floor"]),
            multiplier,
        )
        rows.append(
            {
                "scenario_id": scenario_id,
                "configured_sensitivity": sensitivity,
                "observed_sensitivity": observed_sensitivity,
                "sensitivity_standard_error_clustered_by_case": sensitivity_se,
                "sensitivity_ci_low": sensitivity_low,
                "sensitivity_ci_high": sensitivity_high,
                "sensitivity_tolerance": sensitivity_tolerance,
                "sensitivity_validation_status": sensitivity_status,
                "configured_false_alarm": false_alarm,
                "observed_false_alarm": observed_false_alarm,
                "false_alarm_standard_error_clustered_by_case": false_alarm_se,
                "false_alarm_ci_low": false_alarm_low,
                "false_alarm_ci_high": false_alarm_high,
                "false_alarm_tolerance": false_alarm_tolerance,
                "false_alarm_validation_status": false_alarm_status,
                "participation_rate": float(np.mean(participation_rates)),
                "appeal_signal_rate": float(np.mean(appeal_signal_rates)),
                "alpha_appeal": float(np.mean(dao_if_incorrect)),
                "beta_appeal": float(np.mean(dao_if_correct)),
                "incorrect_case_count": len(incorrect_case_signal_rates),
                "correct_case_count": len(correct_case_signal_rates),
                "harmful_appeal_count_when_court1_correct": harmful_appeals,
            }
        )
    return rows


def _workflow_validation(
    config: PilotConfig, random: KeyedRandom, raw: JsonlWriter
) -> list[dict[str, Any]]:
    counts: dict[str, dict[str, int]] = {
        model: {"trials": 0, "substantive": 0, "protocol_fail": 0, "terminal": 0}
        for model in ("B0", "B1", "B2")
    }
    model = JudgeModel(random, 0.70, 0.30, 0.20)
    for replication_id in range(int(config["workflow_replications"])):
        case = model.create_case(replication_id, "workflow")
        attempts = []
        for attempt_name in ("court1", "court1-reset", "court2", "court2-reset"):
            observations = [
                model.observe(case, f"{attempt_name}-judge-{seat}") for seat in range(3)
            ]
            attempts.append(evaluate_court(observations))
        dao_decision = (
            APPEAL
            if random.bernoulli(
                0.5, replication_id, "dao.ballot", ("workflow", "finalized-decision")
            )
            else ACCEPT
        )
        results = [
            run_b0(attempts[0]),
            run_b1(attempts[0], attempts[1]),
            run_b2(
                attempts[0],
                attempts[1],
                dao_decision=dao_decision,
                court2=attempts[2],
                replacement_court2=attempts[3],
            ),
        ]
        if results[0].court1_verdict != (attempts[0].verdict if attempts[0].valid else None):
            raise AssertionError("B0 Court 1 drifted from common initial observations")
        for result in results:
            if not result.terminally_complete:
                raise AssertionError("workflow did not reach exactly one terminal state")
            if result.payout_assumed:
                raise AssertionError("smoke workflow assumed payout")
            counts[result.model]["trials"] += 1
            counts[result.model]["substantive"] += int(result.substantively_resolved)
            counts[result.model]["protocol_fail"] += int(
                result.final_state == "PROTOCOL_FAIL"
            )
            counts[result.model]["terminal"] += int(result.terminally_complete)
            record = _base_record(config, replication_id, "workflow", result.model)
            record.update(
                {
                    "case_truth": case.truth,
                    "case_latent": case.shared_probability,
                    "judge_accuracy_configured": 0.70,
                    "rho_configured": 0.30,
                    "judge_correctness_observed": [
                        [observation.correct for observation in attempt.observations]
                        for attempt in attempts
                    ],
                    "nonreveal_configured": 0.20,
                    "court1_verdict": result.court1_verdict,
                    "court2_verdict": result.court2_verdict,
                    "dao_decision": result.dao_decision,
                    "final_state": result.final_state,
                    "substantively_resolved": result.substantively_resolved,
                    "terminally_complete": result.terminally_complete,
                    "court2_opened": result.court2_opened,
                    "valid_court_rewards": result.valid_court_rewards,
                    "payout_assumed": result.payout_assumed,
                    "initial_court1_judges": list(attempts[0].judge_ids),
                }
            )
            raw.write(record)
    return [
        {
            "model": name,
            "trials": values["trials"],
            "substantive_resolution_rate": values["substantive"] / values["trials"],
            "protocol_failure_rate": values["protocol_fail"] / values["trials"],
            "terminal_completion_rate": values["terminal"] / values["trials"],
            "classification_validation_status": "PASS"
            if values["terminal"] == values["trials"]
            else "FAIL",
        }
        for name, values in counts.items()
    ]


def _random_stream_validation(random: KeyedRandom) -> list[dict[str, Any]]:
    replay_first = [
        random.uniform(index, "judge_case.correctness", ("judge-1",))
        for index in range(100)
    ]
    replay_second = [
        random.uniform(index, "judge_case.correctness", ("judge-1",))
        for index in range(100)
    ]
    before = random.uniform(7, "judge_case.correctness", ("court1", "judge-1"))
    _ = [random.uniform(7, "backer.signal", ("extra", index)) for index in range(100)]
    after = random.uniform(7, "judge_case.correctness", ("court1", "judge-1"))
    domain_a = [random.uniform(index, "case.truth", ("independence",)) for index in range(4000)]
    domain_b = [
        random.uniform(index, "backer.signal", ("independence",)) for index in range(4000)
    ]
    correlation = float(np.corrcoef(domain_a, domain_b)[0, 1])
    distinct = len(
        {
            random.uniform(index, "court.assignment", ("replication",))
            for index in range(100)
        }
    )
    return [
        {
            "check": "bit_for_bit_replay",
            "observed": replay_first == replay_second,
            "validation_status": "PASS" if replay_first == replay_second else "FAIL",
        },
        {
            "check": "unrelated_draw_order_independence",
            "observed": before == after,
            "validation_status": "PASS" if before == after else "FAIL",
        },
        {
            "check": "unrelated_domain_correlation",
            "observed": correlation,
            "tolerance": 0.05,
            "validation_status": "PASS" if abs(correlation) < 0.05 else "FAIL",
        },
        {
            "check": "replication_identity_distinctness",
            "observed": distinct,
            "expected": 100,
            "validation_status": "PASS" if distinct == 100 else "FAIL",
        },
    ]


def _deterministic_validation(config: PilotConfig) -> list[dict[str, Any]]:
    rows = deterministic_counterexamples()
    fixture = config["candidate_policy_fixture"]
    judges = ("A", "B", "C")
    finalizer = "FINALIZER"
    settlement = settle_ccps(
        judges,
        judges,
        finalizer_id=finalizer,
        disruption_allowance=int(fixture["reset_disruption_allowance_units"]),
        finalization_allowance=int(fixture["reset_finalization_allowance_units"]),
        case_stake_requirement=int(fixture["case_stake_requirement"]),
        deposited_stake=int(fixture["judge_deposited_stake"]),
        attacker_controlled_ids=(*judges, finalizer),
    )
    rows.append(
        {
            "scenario_id": "R3",
            "locked_stake_per_judge": settlement.locked_stake_per_judge,
            "gross_slash": settlement.gross_slash,
            "penalties": settlement.penalties,
            "compensation_recipient": finalizer,
            "finalizer_allowance": settlement.finalizer_allowance,
            "same_actor_controls_judges_and_finalizer": True,
            "net_attacker_loss_before_gas": settlement.net_attacker_loss_before_gas,
            "milestone_escrow_effect": settlement.milestone_escrow_effect,
            "result": "PASS"
            if (
                settlement.locked_stake_per_judge == 23
                and settlement.gross_slash == 3
                and sorted(settlement.penalties.values()) == [1, 1, 1]
                and settlement.compensation == {finalizer: 3}
                and settlement.net_attacker_loss_before_gas == 0
                and settlement.milestone_escrow_effect == 0
            )
            else "FAIL",
        }
    )
    return rows


def _write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    keys: list[str] = []
    for row in rows:
        for key in row:
            if key not in keys:
                keys.append(key)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    key: json.dumps(value, sort_keys=True)
                    if isinstance(value, (dict, list, tuple))
                    else value
                    for key, value in row.items()
                }
            )


def _write_figures(output: Path, summary: dict[str, Any]) -> None:
    figure_dir = output / "figures"
    figure_dir.mkdir(parents=True, exist_ok=True)
    judges = summary["judge_calibration"]
    scenarios = [row["scenario_id"] for row in judges]

    fig, axis = plt.subplots(figsize=(8, 5))
    configured = [row["configured_accuracy"] for row in judges]
    observed = [row["observed_accuracy"] for row in judges]
    errors = [
        row["accuracy_ci_high"] - row["observed_accuracy"] for row in judges
    ]
    axis.errorbar(configured, observed, yerr=errors, fmt="o", capsize=4)
    axis.plot([0.5, 0.9], [0.5, 0.9], linestyle="--", color="black", linewidth=1)
    accuracy_offsets = [(5, -15), (5, 15), (5, -5), (5, 6), (5, 6), (5, 6)]
    for x, y, label, offset in zip(configured, observed, scenarios, accuracy_offsets):
        axis.annotate(label, (x, y), xytext=offset, textcoords="offset points")
    axis.set(xlabel="Configured accuracy", ylabel="Observed accuracy", title="PILOT-01 Judge accuracy calibration")
    axis.grid(alpha=0.25)
    fig.tight_layout()
    fig.savefig(figure_dir / "judge_accuracy.png", dpi=160)
    plt.close(fig)

    fig, axis = plt.subplots(figsize=(8, 5))
    configured_rho = [row["configured_rho"] for row in judges]
    observed_rho = [row["observed_pairwise_correlation"] for row in judges]
    rho_errors = [
        row["correlation_ci_high"] - row["observed_pairwise_correlation"]
        for row in judges
    ]
    axis.errorbar(configured_rho, observed_rho, yerr=rho_errors, fmt="o", capsize=4)
    axis.plot([-0.05, 0.65], [-0.05, 0.65], linestyle="--", color="black", linewidth=1)
    correlation_offsets = [(5, 6), (5, 6), (5, 14), (5, 6), (5, -15), (5, -4)]
    for x, y, label, offset in zip(
        configured_rho, observed_rho, scenarios, correlation_offsets
    ):
        axis.annotate(label, (x, y), xytext=offset, textcoords="offset points")
    axis.set(xlabel="Configured rho", ylabel="Observed fixed-pair correlation", title="PILOT-01 shared-case correlation calibration")
    axis.grid(alpha=0.25)
    fig.tight_layout()
    fig.savefig(figure_dir / "judge_correlation.png", dpi=160)
    plt.close(fig)

    signals = summary["backer_signal_calibration"]
    x = np.arange(len(signals))
    width = 0.35
    fig, axis = plt.subplots(figsize=(9, 5))
    axis.bar(x - width / 2, [row["observed_sensitivity"] for row in signals], width, label="Observed sensitivity")
    axis.bar(x + width / 2, [row["observed_false_alarm"] for row in signals], width, label="Observed false alarm")
    axis.scatter(x - width / 2, [row["configured_sensitivity"] for row in signals], marker="x", color="black", label="Configured")
    axis.scatter(x + width / 2, [row["configured_false_alarm"] for row in signals], marker="x", color="black")
    axis.set_xticks(x, [row["scenario_id"] for row in signals])
    axis.set_ylim(0, 1)
    axis.set(ylabel="Probability", title="PILOT-01 Backer private-signal calibration")
    axis.legend()
    axis.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    fig.savefig(figure_dir / "backer_signal.png", dpi=160)
    plt.close(fig)

    nonreveal = summary["nonreveal_calibration"]
    fig, axis = plt.subplots(figsize=(8, 5))
    axis.scatter(
        [row["configured_nonreveal"] for row in nonreveal],
        [row["observed_nonreveal"] for row in nonreveal],
    )
    axis.plot([0, 0.22], [0, 0.22], linestyle="--", color="black", linewidth=1)
    nonreveal_offsets = [(5, 5), (5, 5), (5, 10), (5, -15)]
    for row, offset in zip(nonreveal, nonreveal_offsets):
        axis.annotate(
            row["scenario_id"],
            (row["configured_nonreveal"], row["observed_nonreveal"]),
            xytext=offset,
            textcoords="offset points",
        )
    axis.set(xlabel="Configured non-reveal probability", ylabel="Observed non-reveal probability", title="PILOT-01 non-reveal calibration")
    axis.grid(alpha=0.25)
    fig.tight_layout()
    fig.savefig(figure_dir / "nonreveal.png", dpi=160)
    plt.close(fig)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_jsonl_schema(path: str | Path) -> int:
    count = 0
    with Path(path).open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            record = json.loads(line)
            missing = RAW_REQUIRED_FIELDS - record.keys()
            if missing:
                raise ValueError(f"line {line_number} missing {sorted(missing)}")
            count += 1
    if count == 0:
        raise ValueError("raw JSONL is empty")
    return count


def run_pilot(config: PilotConfig, output: str | Path) -> dict[str, Any]:
    output_path = Path(output)
    table_dir = output_path / "tables"
    raw_path = output_path / "raw" / "pilot_01.jsonl"
    output_path.mkdir(parents=True, exist_ok=True)
    random = KeyedRandom(config.master_seed)
    raw = JsonlWriter(raw_path)
    try:
        summary = {
            "judge_calibration": _judge_validation(config, random, raw),
            "nonreveal_calibration": _nonreveal_validation(config, random, raw),
            "backer_signal_calibration": _signal_validation(config, random, raw),
            "workflow_classification": _workflow_validation(config, random, raw),
            "random_stream_validation": _random_stream_validation(random),
            "deterministic_counterexamples": _deterministic_validation(config),
        }
    finally:
        raw.close()

    for name, rows in summary.items():
        _write_csv(table_dir / f"{name}.csv", rows)
    _write_figures(output_path, summary)
    schema_records = validate_jsonl_schema(raw_path)
    raw_sha256 = _sha256(raw_path)
    dependencies = {
        name: importlib.metadata.version(name)
        for name in ("numpy", "scipy", "matplotlib", "pytest")
    }
    manifest = {
        "repository_commit": config["repository_commit"],
        "research_spec_commit": config["research_spec_commit"],
        "research_pr": config["research_pr"],
        "model_version": config["model_version"],
        "workflow_model_version": config["workflow_model_version"],
        "policy_version": config["policy_version"],
        "python_version": platform.python_version(),
        "dependency_versions": dependencies,
        "random_stream_version": STREAM_VERSION,
        "master_seed": config.master_seed,
        "scenario_grid": {
            "judge": config["judge_scenarios"],
            "nonreveal": config["nonreveal_probabilities"],
            "signal": config["signal_scenarios"],
        },
        "replication_counts": {
            "judge": config["judge_replications"],
            "nonreveal": config["nonreveal_replications"],
            "signal": config["signal_replications"],
            "workflow": config["workflow_replications"],
        },
        "calibration_tolerances": config["calibration_tolerances"],
        "raw_record_count": schema_records,
        "raw_sha256": raw_sha256,
    }
    summary_path = output_path / "summary.json"
    manifest_path = output_path / "manifest.json"
    summary_path.write_text(
        json.dumps(summary, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    checksums = {
        "raw/pilot_01.jsonl": raw_sha256,
        "summary.json": _sha256(summary_path),
        "manifest.json": _sha256(manifest_path),
    }
    (output_path / "checksums.sha256").write_text(
        "".join(f"{digest}  {name}\n" for name, digest in sorted(checksums.items())),
        encoding="utf-8",
    )
    return {"summary": summary, "manifest": manifest, "checksums": checksums}
