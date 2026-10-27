from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable

from .backer_model import BackerBehavior, SignalOracle
from .dao_model import WalletSnapshot
from .judge_model import JudgeModel, JudgeObservation, SyntheticCase
from .random_streams import STREAM_VERSION, KeyedRandom


@dataclass(frozen=True)
class SignalTreatment:
    treatment_id: str
    sensitivity: float
    false_alarm: float


@dataclass(frozen=True)
class BaseScenario:
    replication_id: int
    base_case_id: str
    ground_truth: str
    case_latent: float | None
    judge_population: tuple[str, ...]
    judge_stake_state: tuple[tuple[str, int], ...]
    judge_control_state: tuple[str, ...]
    backer_population: tuple[str, ...]
    contribution_snapshot: tuple[WalletSnapshot, ...]
    overlap_ratio_requested: float
    overlap_judge_count: int
    overlap_ratio_realized: float
    judge_backer_overlap_judges: tuple[str, ...]
    attacker_capital: int
    potential_judge_behaviors: tuple[tuple[str, JudgeObservation], ...]
    random_stream_version: str
    judge_accuracy: float
    rho: float
    nonreveal_probability: float
    creator_id: str
    judge_pool_level: str
    judge_pool_size: int

    @property
    def case(self) -> SyntheticCase:
        return SyntheticCase(
            self.replication_id,
            self.base_case_id,
            self.ground_truth,
            self.case_latent,
        )

    @property
    def potential_behaviors(self) -> dict[str, JudgeObservation]:
        return dict(self.potential_judge_behaviors)


def _check_probability(name: str, value: float) -> None:
    if not 0.0 <= value <= 1.0:
        raise ValueError(f"{name} must be in [0, 1]")


def _overlap_judge_count(judge_count: int, ratio: float) -> int:
    _check_probability("judge_backer_overlap_ratio", ratio)
    # The experiment uses nearest-integer, half-up rounding so a requested
    # ratio has one deterministic realized role assignment across replays.
    return min(judge_count, int(math.floor(judge_count * ratio + 0.5)))


def make_signal_treatments(values: Iterable[dict[str, object]]) -> tuple[SignalTreatment, ...]:
    treatments = tuple(
        SignalTreatment(
            str(value["treatment_id"]),
            float(value["sensitivity"]),
            float(value["false_alarm"]),
        )
        for value in values
    )
    if not treatments:
        raise ValueError("at least one signal treatment is required")
    if len({treatment.treatment_id for treatment in treatments}) != len(treatments):
        raise ValueError("signal treatment ids must be unique")
    for treatment in treatments:
        _check_probability("sensitivity", treatment.sensitivity)
        _check_probability("false_alarm", treatment.false_alarm)
    return treatments


def generate_base_scenario(
    random: KeyedRandom,
    *,
    replication_id: int,
    base_case_id: str,
    judge_pool_size: int,
    backers_per_case: int,
    judge_accuracy: float,
    rho: float,
    nonreveal_probability: float,
    creator_id: str,
    judge_pool_level: str = "unspecified",
    contribution_scale: int = 1_000_000,
    judge_stake: int = 50,
    attacker_capital: int = 0,
    judge_backer_overlap_ratio: float = 1.0,
) -> BaseScenario:
    if judge_pool_size < 3:
        raise ValueError("judge_pool_size must be at least three non-creator Judges")
    if backers_per_case < 1:
        raise ValueError("backers_per_case must be positive")
    if contribution_scale < 0 or judge_stake < 0 or attacker_capital < 0:
        raise ValueError("base-world capital values cannot be negative")

    judge_ids = tuple(f"judge-{index:03d}" for index in range(judge_pool_size))
    judge_population = (*judge_ids, creator_id)
    overlap_judge_count = _overlap_judge_count(judge_pool_size, judge_backer_overlap_ratio)
    if overlap_judge_count > backers_per_case:
        raise ValueError(
            "backers_per_case must be at least the realized Judge–Backer overlap count"
        )
    overlap_judges = judge_ids[:overlap_judge_count]
    backer_population = (
        *overlap_judges,
        *(f"backer-{index:03d}" for index in range(backers_per_case - overlap_judge_count)),
    )
    contributions = tuple(
        WalletSnapshot(wallet_id, (index + 1) ** 2 * contribution_scale)
        for index, wallet_id in enumerate(backer_population)
    )

    judge_model = JudgeModel(
        random,
        judge_accuracy,
        rho,
        nonreveal_probability,
    )
    case = judge_model.create_case(replication_id, base_case_id)
    potential = tuple(
        (
            judge_id,
            judge_model.observe(case, judge_id),
        )
        for judge_id in judge_population
    )
    return BaseScenario(
        replication_id=replication_id,
        base_case_id=base_case_id,
        ground_truth=case.truth,
        case_latent=case.shared_probability,
        judge_population=judge_population,
        judge_stake_state=tuple((judge_id, judge_stake) for judge_id in judge_population),
        judge_control_state=(),
        backer_population=backer_population,
        contribution_snapshot=contributions,
        overlap_ratio_requested=judge_backer_overlap_ratio,
        overlap_judge_count=overlap_judge_count,
        overlap_ratio_realized=overlap_judge_count / judge_pool_size,
        judge_backer_overlap_judges=overlap_judges,
        attacker_capital=attacker_capital,
        potential_judge_behaviors=potential,
        random_stream_version=STREAM_VERSION,
        judge_accuracy=judge_accuracy,
        rho=rho,
        nonreveal_probability=nonreveal_probability,
        creator_id=creator_id,
        judge_pool_level=judge_pool_level,
        judge_pool_size=judge_pool_size,
    )


def shared_signal_draw(
    random: KeyedRandom,
    *,
    replication_id: int,
    base_case_id: str,
    backer_id: str,
) -> float:
    return random.uniform(
        replication_id,
        "backer.signal",
        (base_case_id, backer_id, "shared-treatment-draw"),
    )


def shared_participation_draw(
    random: KeyedRandom,
    *,
    replication_id: int,
    base_case_id: str,
    backer_id: str,
) -> float:
    return random.uniform(
        replication_id,
        "backer.participation",
        (base_case_id, backer_id, "shared-treatment-draw"),
    )


def generate_backer_observations(
    random: KeyedRandom,
    base: BaseScenario,
    treatment: SignalTreatment,
    *,
    court_incorrect: bool,
    participation_probability: float,
) -> tuple[dict[str, object], ...]:
    _check_probability("participation_probability", participation_probability)
    oracle = SignalOracle(random, treatment.sensitivity, treatment.false_alarm)
    behavior = BackerBehavior(random, participation_probability)
    observations: list[dict[str, object]] = []
    for backer_id in base.backer_population:
        signal = oracle.generate_from_uniform(
            shared_signal_draw(
                random,
                replication_id=base.replication_id,
                base_case_id=base.base_case_id,
                backer_id=backer_id,
            ),
            court_incorrect=court_incorrect,
        )
        behavior_observation = behavior.observe_from_uniform(
            base.replication_id,
            base.base_case_id,
            backer_id,
            signal,
            shared_participation_draw(
                random,
                replication_id=base.replication_id,
                base_case_id=base.base_case_id,
                backer_id=backer_id,
            ),
        )
        observations.append(
            {
                "backer_id": backer_id,
                "private_signal": behavior_observation.private_signal,
                "participated": behavior_observation.participated,
                "ballot_preference": behavior_observation.ballot_preference,
                "cast_ballot": behavior_observation.cast_ballot,
            }
        )
    return tuple(observations)
