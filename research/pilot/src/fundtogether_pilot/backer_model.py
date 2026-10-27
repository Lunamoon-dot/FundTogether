from __future__ import annotations

from dataclasses import dataclass

from .random_streams import KeyedRandom


APPEAL = "APPEAL"
ACCEPT = "ACCEPT"


@dataclass(frozen=True)
class BackerObservation:
    backer_id: str
    private_signal: bool
    participated: bool
    ballot_preference: str
    cast_ballot: str | None


class SignalOracle:
    """Simulator-only truth-conditioned signal generator.

    The returned private signal, not the truth or Court correctness flag, is the
    only input exposed to the Backer behavior model.
    """

    def __init__(
        self, random: KeyedRandom, sensitivity: float, false_alarm: float
    ) -> None:
        if not 0.0 <= sensitivity <= 1.0 or not 0.0 <= false_alarm <= 1.0:
            raise ValueError("signal rates must be in [0, 1]")
        self.random = random
        self.sensitivity = sensitivity
        self.false_alarm = false_alarm

    def generate(
        self,
        replication_id: int,
        scenario_id: str,
        backer_id: str,
        *,
        court_incorrect: bool,
    ) -> bool:
        probability = self.sensitivity if court_incorrect else self.false_alarm
        return self.random.bernoulli(
            probability,
            replication_id,
            "backer.signal",
            (scenario_id, backer_id),
        )

    def generate_from_uniform(self, uniform_draw: float, *, court_incorrect: bool) -> bool:
        """Apply this treatment's threshold to a shared counterfactual draw."""
        if not 0.0 <= uniform_draw < 1.0:
            raise ValueError("uniform_draw must be in [0, 1)")
        probability = self.sensitivity if court_incorrect else self.false_alarm
        return uniform_draw < probability


class BackerBehavior:
    def __init__(self, random: KeyedRandom, participation_probability: float) -> None:
        if not 0.0 <= participation_probability <= 1.0:
            raise ValueError("participation_probability must be in [0, 1]")
        self.random = random
        self.participation_probability = participation_probability

    def observe(
        self,
        replication_id: int,
        scenario_id: str,
        backer_id: str,
        private_signal: bool,
    ) -> BackerObservation:
        participated = self.random.bernoulli(
            self.participation_probability,
            replication_id,
            "backer.participation",
            (scenario_id, backer_id),
        )
        preference = APPEAL if private_signal else ACCEPT
        return BackerObservation(
            backer_id=backer_id,
            private_signal=private_signal,
            participated=participated,
            ballot_preference=preference,
            cast_ballot=preference if participated else None,
        )

    def observe_from_uniform(
        self,
        replication_id: int,
        scenario_id: str,
        backer_id: str,
        private_signal: bool,
        participation_draw: float,
    ) -> BackerObservation:
        """Use a caller-supplied paired participation draw.

        The legacy ``observe`` method remains keyed by ``scenario_id`` for
        PILOT-01 compatibility. Comparative experiments use this method so a
        signal treatment cannot regenerate participation observations.
        """
        if not 0.0 <= participation_draw < 1.0:
            raise ValueError("participation_draw must be in [0, 1)")
        participated = participation_draw < self.participation_probability
        preference = APPEAL if private_signal else ACCEPT
        return BackerObservation(
            backer_id=backer_id,
            private_signal=private_signal,
            participated=participated,
            ballot_preference=preference,
            cast_ballot=preference if participated else None,
        )
