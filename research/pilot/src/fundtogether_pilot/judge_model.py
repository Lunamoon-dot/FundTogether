from __future__ import annotations

from dataclasses import dataclass

from .random_streams import KeyedRandom


PASS = "PASS"
FAIL = "FAIL"


def opposite(verdict: str) -> str:
    if verdict == PASS:
        return FAIL
    if verdict == FAIL:
        return PASS
    raise ValueError(f"unsupported verdict: {verdict}")


@dataclass(frozen=True)
class SyntheticCase:
    replication_id: int
    scenario_id: str
    truth: str
    shared_probability: float | None


@dataclass(frozen=True)
class JudgeObservation:
    judge_id: str
    correct: bool
    nonreveal: bool
    colluding: bool
    potential_vote: str
    counted_vote: str | None


class JudgeModel:
    def __init__(
        self,
        random: KeyedRandom,
        accuracy: float,
        rho: float,
        nonreveal_probability: float = 0.0,
    ) -> None:
        if not 0.0 < accuracy < 1.0:
            raise ValueError("accuracy must be strictly between 0 and 1")
        if not 0.0 <= rho < 1.0:
            raise ValueError("rho must be in [0, 1)")
        if not 0.0 <= nonreveal_probability <= 1.0:
            raise ValueError("nonreveal_probability must be in [0, 1]")
        self.random = random
        self.accuracy = accuracy
        self.rho = rho
        self.nonreveal_probability = nonreveal_probability

    def create_case(self, replication_id: int, scenario_id: str) -> SyntheticCase:
        truth = (
            PASS
            if self.random.bernoulli(
                0.5, replication_id, "case.truth", (scenario_id,)
            )
            else FAIL
        )
        shared_probability: float | None = None
        if self.rho > 0.0:
            concentration = 1.0 / self.rho - 1.0
            alpha = self.accuracy * concentration
            beta = (1.0 - self.accuracy) * concentration
            shared_probability = self.random.beta(
                alpha,
                beta,
                replication_id,
                "case.shared_difficulty",
                (scenario_id,),
            )
        return SyntheticCase(replication_id, scenario_id, truth, shared_probability)

    def observe(
        self,
        case: SyntheticCase,
        judge_id: str,
        *,
        colluding: bool = False,
        attacker_target: str = FAIL,
        coordinated_nonreveal: bool = False,
        coordinated_group: str = "attacker-group",
        coordinated_probability: float = 0.0,
    ) -> JudgeObservation:
        probability = (
            self.accuracy
            if case.shared_probability is None
            else case.shared_probability
        )
        correct = self.random.bernoulli(
            probability,
            case.replication_id,
            "judge_case.correctness",
            (case.scenario_id, judge_id),
        )
        if coordinated_nonreveal:
            nonreveal = self.random.bernoulli(
                coordinated_probability,
                case.replication_id,
                "judge.collusion",
                (case.scenario_id, coordinated_group, "nonreveal"),
            )
        else:
            nonreveal = self.random.bernoulli(
                self.nonreveal_probability,
                case.replication_id,
                "judge_case.nonreveal",
                (case.scenario_id, judge_id),
            )
        potential_vote = (
            attacker_target
            if colluding
            else case.truth
            if correct
            else opposite(case.truth)
        )
        return JudgeObservation(
            judge_id=judge_id,
            correct=correct,
            nonreveal=nonreveal,
            colluding=colluding,
            potential_vote=potential_vote,
            counted_vote=None if nonreveal else potential_vote,
        )
