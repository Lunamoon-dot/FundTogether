from __future__ import annotations

import csv
import hashlib
import importlib.metadata
import json
import platform
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from .backer_model import ACCEPT, APPEAL
from .config import PilotConfig
from .comparative_metrics import build_metrics
from .comparative_schema import (
    MODEL_VERSION,
    SCHEMA_VERSION,
    validate_comparative_jsonl_schema,
    validate_comparative_records,
)
from .court_model import CourtResult, evaluate_court, select_judges
from .dao_model import BackerDao, WalletSnapshot
from .judge_model import FAIL, PASS, JudgeObservation
from .random_streams import KeyedRandom
from .scenarios import (
    BaseScenario,
    SignalTreatment,
    generate_backer_observations,
    generate_base_scenario,
    make_signal_treatments,
)


@dataclass(frozen=True)
class CourtAttempt:
    level: str
    attempt: int
    judge_ids: tuple[str, ...]
    result: CourtResult | None
    failure_reason: str | None

    @property
    def assigned(self) -> bool:
        return bool(self.judge_ids)


def _jsonable(value: object) -> object:
    if isinstance(value, tuple):
        return [_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    return value


def _attempt(
    random: KeyedRandom,
    base: BaseScenario,
    *,
    level: str,
    attempt: int,
    excluded: set[str],
) -> CourtAttempt:
    candidates = [judge for judge in base.judge_population if judge != base.creator_id]
    try:
        judge_ids = select_judges(
            random,
            base.replication_id,
            candidates,
            case_id=base.base_case_id,
            court_level=level,
            attempt=attempt,
            excluded=excluded,
        )
    except ValueError:
        reason = (
            "COURT1_INSUFFICIENT_JUDGE_SUPPLY"
            if level == "court1" and attempt == 0
            else "COURT1_RESET_INSUFFICIENT_JUDGE_SUPPLY"
            if level == "court1"
            else "COURT2_INSUFFICIENT_JUDGE_SUPPLY"
            if attempt == 0
            else "COURT2_RESET_INSUFFICIENT_JUDGE_SUPPLY"
        )
        return CourtAttempt(level, attempt, (), None, reason)
    observations: tuple[JudgeObservation, ...] = tuple(
        base.potential_behaviors[judge_id] for judge_id in judge_ids
    )
    result = evaluate_court(observations)
    if result.valid:
        return CourtAttempt(level, attempt, judge_ids, result, None)
    reason = (
        "COURT1_NONREVEAL_FAILURE"
        if level == "court1" and attempt == 0
        else "COURT1_RESET_NONREVEAL_FAILURE"
        if level == "court1"
        else "COURT2_NONREVEAL_FAILURE"
        if attempt == 0
        else "COURT2_RESET_NONREVEAL_FAILURE"
    )
    return CourtAttempt(level, attempt, judge_ids, result, reason)


def _court1_attempts(random: KeyedRandom, base: BaseScenario) -> tuple[CourtAttempt, CourtAttempt | None]:
    initial = _attempt(random, base, level="court1", attempt=0, excluded=set())
    if initial.result is None or initial.result.valid:
        return initial, None
    replacement = _attempt(
        random,
        base,
        level="court1",
        attempt=1,
        excluded=set(initial.judge_ids),
    )
    return initial, replacement


def _final_court1(
    model: str,
    initial: CourtAttempt,
    replacement: CourtAttempt | None,
) -> tuple[CourtAttempt | None, str | None]:
    if initial.result is None:
        return None, initial.failure_reason
    if initial.result.valid:
        return initial, None
    if replacement is None:
        raise AssertionError("invalid Court 1 must have a bounded replacement attempt")
    if replacement.result is not None and replacement.result.valid:
        return replacement, None
    return None, replacement.failure_reason


def _blank_record(config: PilotConfig, base: BaseScenario, treatment: SignalTreatment, model: str) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "experiment_id": config["experiment_id"],
        "model_version": config["model_version"],
        "workflow_model_version": config["workflow_model_version"],
        "replication_id": base.replication_id,
        "base_case_id": base.base_case_id,
        "treatment_id": treatment.treatment_id,
        "model": model,
        "seed": config.master_seed,
        "random_stream_version": base.random_stream_version,
        "ground_truth": base.ground_truth,
        "case_latent": base.case_latent,
        "judge_accuracy_configured": base.judge_accuracy,
        "rho_configured": base.rho,
        "nonreveal_configured": base.nonreveal_probability,
        "signal_sensitivity": treatment.sensitivity,
        "signal_false_alarm": treatment.false_alarm,
        "judge_population": list(base.judge_population),
        "judge_stake_state": dict(base.judge_stake_state),
        "judge_control_state": list(base.judge_control_state),
        "backer_population": list(base.backer_population),
        "contribution_snapshot": [
            {"wallet_id": wallet.wallet_id, "contribution": wallet.contribution}
            for wallet in base.contribution_snapshot
        ],
        "attacker_capital": base.attacker_capital,
        "judge_pool_level": base.judge_pool_level,
        "judge_pool_size": base.judge_pool_size,
        "court1_initial_judges": [],
        "court1_initial_valid": False,
        "court1_initial_verdict": None,
        "court1_reset_judges": [],
        "court1_reset_valid": False,
        "court1_reset_verdict": None,
        "court1_final_judges": [],
        "court1_final_valid": False,
        "court1_verdict": None,
        "dao_finalized": None if model != "B2" else False,
        "dao_decision": None,
        "dao_eligible_wallets": None,
        "dao_voters": None,
        "dao_total_weight": None,
        "dao_cast_weight": None,
        "dao_accept_weight": None,
        "dao_appeal_weight": None,
        "backer_observations": None,
        "court2_opened": False,
        "court2_judges": [] if model == "B2" else [],
        "court2_valid": False,
        "court2_verdict": None,
        "court2_reset_judges": [] if model == "B2" else [],
        "court2_reset_valid": False,
        "court2_reset_verdict": None,
        "court2_final_judges": [] if model == "B2" else [],
        "court2_final_valid": False,
        "court2_final_verdict": None,
        "final_verdict": None,
        "final_state": "PROTOCOL_FAIL",
        "substantively_resolved": False,
        "terminally_complete": True,
        "failure_reason": None,
        "courts_attempted": 0,
        "valid_courts": 0,
        "procedural_resets": 0,
        "assigned_judge_seats": 0,
        "ballots_cast": None,
        "court2_assignments": 0,
        "valid_court_rewards": 0,
        "payout_assumed": False,
    }


def _apply_attempt(record: dict[str, Any], attempt: CourtAttempt, *, reset: bool) -> None:
    record["courts_attempted"] += 1
    record["assigned_judge_seats"] += len(attempt.judge_ids)
    if attempt.result is not None and attempt.result.valid:
        record["valid_courts"] += 1
    if reset:
        record["procedural_resets"] += 1
    if attempt.level == "court1" and not reset:
        record["court1_initial_judges"] = list(attempt.judge_ids)
        record["court1_initial_valid"] = bool(attempt.result and attempt.result.valid)
        record["court1_initial_verdict"] = attempt.result.verdict if attempt.result else None
    elif attempt.level == "court1":
        record["court1_reset_judges"] = list(attempt.judge_ids)
        record["court1_reset_valid"] = bool(attempt.result and attempt.result.valid)
        record["court1_reset_verdict"] = attempt.result.verdict if attempt.result else None
    elif not reset:
        record["court2_judges"] = list(attempt.judge_ids)
        record["court2_valid"] = bool(attempt.result and attempt.result.valid)
        record["court2_verdict"] = attempt.result.verdict if attempt.result else None
        record["court2_assignments"] += int(attempt.assigned)
    else:
        record["court2_reset_judges"] = list(attempt.judge_ids)
        record["court2_reset_valid"] = bool(attempt.result and attempt.result.valid)
        record["court2_reset_verdict"] = attempt.result.verdict if attempt.result else None
        record["court2_assignments"] += int(attempt.assigned)


def _set_substantive_result(record: dict[str, Any], final: CourtAttempt) -> None:
    if final.result is None or not final.result.valid or final.result.verdict is None:
        raise ValueError("substantive result requires a valid Court")
    record["court1_final_judges"] = list(final.judge_ids)
    record["court1_final_valid"] = True
    record["court1_verdict"] = final.result.verdict


def _finalize(record: dict[str, Any], verdict: str | None, failure_reason: str | None = None) -> dict[str, Any]:
    if verdict not in {None, PASS, FAIL}:
        raise ValueError("unsupported final verdict")
    record["final_verdict"] = verdict
    record["failure_reason"] = failure_reason
    record["substantively_resolved"] = verdict is not None
    record["final_state"] = "FINAL_PASS" if verdict == PASS else "VERDICT_FAIL" if verdict == FAIL else "PROTOCOL_FAIL"
    record["valid_court_rewards"] = record["valid_courts"]
    return record


def _run_b0(
    config: PilotConfig,
    base: BaseScenario,
    treatment: SignalTreatment,
    initial: CourtAttempt,
) -> dict[str, Any]:
    record = _blank_record(config, base, treatment, "B0")
    _apply_attempt(record, initial, reset=False)
    if initial.result is None:
        return _finalize(record, None, initial.failure_reason)
    if not initial.result.valid:
        return _finalize(record, None, "COURT1_NONREVEAL_FAILURE")
    _set_substantive_result(record, initial)
    return _finalize(record, initial.result.verdict)


def _run_b1(
    config: PilotConfig,
    base: BaseScenario,
    treatment: SignalTreatment,
    initial: CourtAttempt,
    replacement: CourtAttempt | None,
) -> dict[str, Any]:
    record = _blank_record(config, base, treatment, "B1")
    _apply_attempt(record, initial, reset=False)
    if initial.result is None:
        return _finalize(record, None, initial.failure_reason)
    if initial.result.valid:
        _set_substantive_result(record, initial)
        return _finalize(record, initial.result.verdict)
    if replacement is None:
        raise AssertionError("B1 invalid Court 1 lacks replacement")
    _apply_attempt(record, replacement, reset=True)
    if replacement.result is None:
        return _finalize(record, None, replacement.failure_reason)
    if not replacement.result.valid:
        return _finalize(record, None, replacement.failure_reason)
    _set_substantive_result(record, replacement)
    return _finalize(record, replacement.result.verdict)


def _dao_for_b2(
    config: PilotConfig,
    random: KeyedRandom,
    base: BaseScenario,
    treatment: SignalTreatment,
    record: dict[str, Any],
    final_court1: CourtAttempt,
) -> str:
    court1_history = set(record["court1_initial_judges"]) | set(record["court1_reset_judges"])
    snapshot = tuple(
        WalletSnapshot(wallet.wallet_id, wallet.contribution, wallet.wallet_id in court1_history)
        for wallet in base.contribution_snapshot
    )
    dao = BackerDao(
        snapshot,
        participation_threshold_bps=int(config["candidate_policy_fixture"]["dao_participation_threshold_bps"]),
        contribution_cap=int(config["candidate_policy_fixture"]["dao_contribution_cap"]),
    )
    court1_incorrect = final_court1.result is None or final_court1.result.verdict != base.ground_truth
    observations = generate_backer_observations(
        random,
        base,
        treatment,
        court_incorrect=court1_incorrect,
        participation_probability=float(config["backer_participation_probability"]),
    )
    typed_observations: list[dict[str, object]] = []
    for observation in observations:
        backer_id = str(observation["backer_id"])
        eligible = backer_id in dao.weights
        cast_ballot = observation["cast_ballot"] if eligible else None
        if cast_ballot is not None:
            dao.cast(backer_id, str(cast_ballot))
        typed_observations.append({**observation, "eligible": eligible, "cast_ballot": cast_ballot})
    result = dao.finalize()
    record["dao_finalized"] = True
    record["dao_decision"] = result.decision
    record["dao_eligible_wallets"] = list(result.eligible_wallets)
    record["dao_voters"] = list(result.voters)
    record["dao_total_weight"] = result.total_weight
    record["dao_cast_weight"] = result.cast_weight
    record["dao_accept_weight"] = result.accept_weight
    record["dao_appeal_weight"] = result.appeal_weight
    record["backer_observations"] = typed_observations
    record["ballots_cast"] = len(result.voters)
    return result.decision


def _run_b2(
    config: PilotConfig,
    random: KeyedRandom,
    base: BaseScenario,
    treatment: SignalTreatment,
    initial: CourtAttempt,
    replacement: CourtAttempt | None,
) -> dict[str, Any]:
    record = _blank_record(config, base, treatment, "B2")
    _apply_attempt(record, initial, reset=False)
    if initial.result is None:
        return _finalize(record, None, initial.failure_reason)
    if initial.result.valid:
        final_court1 = initial
    else:
        if replacement is None:
            raise AssertionError("B2 invalid Court 1 lacks replacement")
        _apply_attempt(record, replacement, reset=True)
        if replacement.result is None:
            return _finalize(record, None, replacement.failure_reason)
        if not replacement.result.valid:
            return _finalize(record, None, replacement.failure_reason)
        final_court1 = replacement
    _set_substantive_result(record, final_court1)
    dao_decision = _dao_for_b2(config, random, base, treatment, record, final_court1)
    if dao_decision == ACCEPT:
        return _finalize(record, final_court1.result.verdict)

    record["court2_opened"] = True
    excluded = set(record["court1_initial_judges"]) | set(record["court1_reset_judges"]) | set(record["dao_voters"])
    first_court2 = _attempt(
        random,
        base,
        level="court2",
        attempt=0,
        excluded=excluded,
    )
    _apply_attempt(record, first_court2, reset=False)
    if first_court2.result is None:
        return _finalize(record, None, first_court2.failure_reason)
    if first_court2.result.valid:
        record["court2_final_judges"] = list(first_court2.judge_ids)
        record["court2_final_valid"] = True
        record["court2_final_verdict"] = first_court2.result.verdict
        return _finalize(record, first_court2.result.verdict)

    replacement_court2 = _attempt(
        random,
        base,
        level="court2",
        attempt=1,
        excluded=excluded | set(first_court2.judge_ids),
    )
    _apply_attempt(record, replacement_court2, reset=True)
    if replacement_court2.result is None:
        return _finalize(record, None, replacement_court2.failure_reason)
    if not replacement_court2.result.valid:
        return _finalize(record, None, replacement_court2.failure_reason)
    record["court2_final_judges"] = list(replacement_court2.judge_ids)
    record["court2_final_valid"] = True
    record["court2_final_verdict"] = replacement_court2.result.verdict
    return _finalize(record, replacement_court2.result.verdict)


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


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _write_figures(output: Path, scenario_rows: list[dict[str, Any]]) -> list[str]:
    figure_dir = output / "figures"
    figure_dir.mkdir(parents=True, exist_ok=True)
    models = ["B0", "B1", "B2"]
    grouped: dict[str, dict[str, float | None]] = {}
    for row in scenario_rows:
        if row["treatment_id"] not in {"informative", "misleading"}:
            continue
        if row["nonreveal_configured"] != 0.0 or row["rho_configured"] != 0.30 or row["judge_pool_level"] != "large":
            continue
        grouped.setdefault(row["treatment_id"], {})[row["model"]] = row["substantive_resolution_rate"]
    labels = ["informative", "misleading"]
    x = list(range(len(labels)))
    width = 0.25
    fig, axis = plt.subplots(figsize=(8, 5))
    for index, model in enumerate(models):
        values = [grouped.get(label, {}).get(model) for label in labels]
        axis.bar([position + (index - 1) * width for position in x], [value or 0.0 for value in values], width, label=model)
    axis.set_xticks(x, labels)
    axis.set_ylim(0, 1)
    axis.set_ylabel("Substantive resolution rate")
    axis.set_title("SIM-01 paired exploratory resolution")
    axis.legend()
    axis.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    fig.savefig(figure_dir / "comparative_resolution.png", dpi=160)
    plt.close(fig)

    fig, axis = plt.subplots(figsize=(8, 5))
    for label, marker in (("informative", "o"), ("misleading", "x")):
        row_values = [
            row for row in scenario_rows
            if row["treatment_id"] == label
            and row["model"] == "B2"
            and row["nonreveal_configured"] == 0.0
            and row["rho_configured"] == 0.30
            and row["judge_pool_level"] == "large"
        ]
        if row_values:
            row = row_values[0]
            axis.scatter([row["dao_appeal_rate"]], [row["beneficial_reversal_rate"]], marker=marker, label=label)
    axis.set_xlabel("DAO appeal rate")
    axis.set_ylabel("Beneficial reversal rate among Court 2 openings")
    axis.set_title("SIM-01 DAO reversal diagnostics")
    axis.set_xlim(-0.02, 1.02)
    axis.set_ylim(-0.02, 1.02)
    axis.grid(alpha=0.25)
    axis.legend()
    fig.tight_layout()
    fig.savefig(figure_dir / "dao_reversal_diagnostics.png", dpi=160)
    plt.close(fig)
    return ["figures/comparative_resolution.png", "figures/dao_reversal_diagnostics.png"]


def _analytical_sanity_checks(config: PilotConfig, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for nonreveal in config["nonreveal_probabilities"]:
        cell = [
            record for record in records
            if record["judge_pool_level"] == "large"
            and record["rho_configured"] == 0.0
            and record["nonreveal_configured"] == float(nonreveal)
            and record["treatment_id"] == "informative"
        ]
        by_model = {
            model: [record for record in cell if record["model"] == model]
            for model in ("B0", "B1")
        }
        p = float(nonreveal)
        q = (1.0 - p) ** 3
        expected = {
            "B0": q,
            "B1": 1.0 - (1.0 - q) ** 2,
        }
        for model in ("B0", "B1"):
            observed_rows = by_model[model]
            observed = sum(int(record["substantively_resolved"]) for record in observed_rows) / len(observed_rows)
            error = abs(observed - expected[model])
            rows.append(
                {
                    "check": "closed_form_nonreveal_resolution",
                    "model": model,
                    "nonreveal_probability": p,
                    "formula": "q=(1-p)^3" if model == "B0" else "1-(1-q)^2",
                    "expected": expected[model],
                    "observed": observed,
                    "absolute_error": error,
                    "observations": len(observed_rows),
                    "applicable": True,
                    "validation_status": "PASS" if error <= float(config["analytical_sanity_tolerance"]) else "FAIL",
                }
            )
    return rows


def run_comparative(config: PilotConfig, output: str | Path) -> dict[str, Any]:
    output_path = Path(output)
    raw_path = output_path / "raw" / "sim_01.jsonl"
    output_path.mkdir(parents=True, exist_ok=True)
    random = KeyedRandom(config.master_seed)
    treatments = make_signal_treatments(config["signal_scenarios"])
    records: list[dict[str, Any]] = []
    pool_levels = tuple(config["judge_pool_levels"])
    replication_sequence = 0
    for pool in pool_levels:
        pool_id = str(pool["pool_id"])
        pool_size = int(pool["judge_count"])
        for rho in config["rho_levels"]:
            for nonreveal in config["nonreveal_probabilities"]:
                for replication_id in range(int(config["replications_per_cell"])):
                    global_replication_id = replication_sequence
                    replication_sequence += 1
                    base_case_id = (
                        f"{config['experiment_id']}/{pool_id}/rho-{float(rho):.2f}/"
                        f"nonreveal-{float(nonreveal):.2f}/rep-{global_replication_id}"
                    )
                    base = generate_base_scenario(
                        random,
                        replication_id=global_replication_id,
                        base_case_id=base_case_id,
                        judge_pool_size=pool_size,
                        backers_per_case=int(config["backers_per_case"]),
                        judge_accuracy=float(config["judge_accuracy"]),
                        rho=float(rho),
                        nonreveal_probability=float(nonreveal),
                        creator_id=str(config["creator_id"]),
                        judge_pool_level=pool_id,
                        judge_stake=int(config["judge_stake"]),
                        attacker_capital=int(config["attacker_capital"]),
                    )
                    initial, replacement = _court1_attempts(random, base)
                    for treatment in treatments:
                        records.append(_run_b0(config, base, treatment, initial))
                        records.append(_run_b1(config, base, treatment, initial, replacement))
                        records.append(_run_b2(config, random, base, treatment, initial, replacement))

    validate_comparative_records(records)
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    with raw_path.open("w", encoding="utf-8", newline="\n") as handle:
        for record in records:
            handle.write(json.dumps(_jsonable(record), sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n")
    validate_comparative_jsonl_schema(raw_path)

    summary = build_metrics(records)
    summary["analytical_sanity_checks"] = _analytical_sanity_checks(config, records)
    table_dir = output_path / "tables"
    _write_csv(table_dir / "scenario_summary.csv", summary["scenario_summary"])
    _write_csv(table_dir / "paired_comparisons.csv", summary["paired_comparisons"])
    _write_csv(table_dir / "diagnostics.csv", summary["diagnostics"])
    figure_paths = _write_figures(output_path, summary["scenario_summary"])
    raw_sha256 = _sha256(raw_path)
    dependencies = {
        name: importlib.metadata.version(name)
        for name in ("numpy", "scipy", "matplotlib", "pytest")
    }
    manifest = {
        "experiment_id": config["experiment_id"],
        "schema_version": config["schema_version"],
        "model_version": config["model_version"],
        "workflow_model_version": config["workflow_model_version"],
        "repository_commit": config["repository_commit"],
        "research_spec_commit": config["research_spec_commit"],
        "python_version": platform.python_version(),
        "dependency_versions": dependencies,
        "random_stream_version": config["random_stream_version"],
        "master_seed": config.master_seed,
        "replications_per_cell": config["replications_per_cell"],
        "cell_count": len(pool_levels) * len(config["rho_levels"]) * len(config["nonreveal_probabilities"]),
        "signal_treatments": config["signal_scenarios"],
        "raw_record_count": len(records),
        "raw_sha256": raw_sha256,
        "figure_paths": figure_paths,
        "uncertainty_treatment": config["uncertainty_treatment"],
    }
    summary_payload = {**summary, "manifest": manifest}
    summary_path = output_path / "summary.json"
    manifest_path = output_path / "manifest.json"
    summary_path.write_text(json.dumps(summary_payload, indent=2, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")
    checksums = {
        "raw/sim_01.jsonl": raw_sha256,
        "summary.json": _sha256(summary_path),
        "manifest.json": _sha256(manifest_path),
        **{path: _sha256(output_path / path) for path in figure_paths},
        "tables/scenario_summary.csv": _sha256(table_dir / "scenario_summary.csv"),
        "tables/paired_comparisons.csv": _sha256(table_dir / "paired_comparisons.csv"),
        "tables/diagnostics.csv": _sha256(table_dir / "diagnostics.csv"),
    }
    (output_path / "checksums.sha256").write_text(
        "".join(f"{digest}  {name}\n" for name, digest in sorted(checksums.items())),
        encoding="utf-8",
    )
    return {"summary": summary_payload, "manifest": manifest, "checksums": checksums}
