from __future__ import annotations

from dataclasses import dataclass

from .backer_model import ACCEPT, APPEAL
from .court_model import CourtResult
from .judge_model import FAIL, PASS


FINAL_PASS = "FINAL_PASS"
VERDICT_FAIL = "VERDICT_FAIL"
PROTOCOL_FAIL = "PROTOCOL_FAIL"


@dataclass(frozen=True)
class WorkflowResult:
    model: str
    court1_verdict: str | None
    court2_verdict: str | None
    dao_decision: str | None
    final_state: str
    substantively_resolved: bool
    terminally_complete: bool
    court2_opened: bool
    valid_court_rewards: int
    payout_assumed: bool = False


def _substantive_state(verdict: str) -> str:
    if verdict == PASS:
        return FINAL_PASS
    if verdict == FAIL:
        return VERDICT_FAIL
    raise ValueError(f"invalid substantive verdict: {verdict}")


def _resolved(
    model: str,
    court1: CourtResult,
    *,
    dao_decision: str | None = None,
    court2: CourtResult | None = None,
    valid_rewards: int = 1,
) -> WorkflowResult:
    final_court = court2 if court2 is not None else court1
    if not final_court.valid or final_court.verdict is None:
        raise ValueError("a substantive workflow result requires a valid court")
    return WorkflowResult(
        model=model,
        court1_verdict=court1.verdict,
        court2_verdict=None if court2 is None else court2.verdict,
        dao_decision=dao_decision,
        final_state=_substantive_state(final_court.verdict),
        substantively_resolved=True,
        terminally_complete=True,
        court2_opened=court2 is not None,
        valid_court_rewards=valid_rewards,
    )


def _protocol_fail(
    model: str,
    court1_verdict: str | None,
    *,
    dao_decision: str | None = None,
    court2_opened: bool = False,
    valid_rewards: int = 0,
) -> WorkflowResult:
    return WorkflowResult(
        model=model,
        court1_verdict=court1_verdict,
        court2_verdict=None,
        dao_decision=dao_decision,
        final_state=PROTOCOL_FAIL,
        substantively_resolved=False,
        terminally_complete=True,
        court2_opened=court2_opened,
        valid_court_rewards=valid_rewards,
    )


def run_b0(initial_court1: CourtResult) -> WorkflowResult:
    if initial_court1.valid:
        return _resolved("B0", initial_court1)
    return _protocol_fail("B0", None)


def _bounded_court1(
    initial_court1: CourtResult, replacement_court1: CourtResult
) -> CourtResult | None:
    if initial_court1.valid:
        return initial_court1
    if replacement_court1.valid:
        if set(initial_court1.judge_ids) & set(replacement_court1.judge_ids):
            raise ValueError("Court 1 replacement overlaps prior assignment")
        return replacement_court1
    return None


def run_b1(
    initial_court1: CourtResult, replacement_court1: CourtResult
) -> WorkflowResult:
    court1 = _bounded_court1(initial_court1, replacement_court1)
    if court1 is None:
        return _protocol_fail("B1", None)
    return _resolved("B1", court1)


def run_b2(
    initial_court1: CourtResult,
    replacement_court1: CourtResult,
    *,
    dao_decision: str,
    court2: CourtResult,
    replacement_court2: CourtResult,
    dao_voters: tuple[str, ...] = (),
) -> WorkflowResult:
    if dao_decision not in (ACCEPT, APPEAL):
        raise ValueError("DAO must be finalized as ACCEPT or APPEAL")
    court1 = _bounded_court1(initial_court1, replacement_court1)
    if court1 is None:
        return _protocol_fail("B2", None)
    if dao_decision == ACCEPT:
        return _resolved("B2", court1, dao_decision=ACCEPT)

    excluded = set(initial_court1.judge_ids) | set(dao_voters)
    if not initial_court1.valid:
        excluded |= set(replacement_court1.judge_ids)
    if excluded & set(court2.judge_ids):
        raise ValueError("Court 2 contains a forbidden prior assignee or DAO voter")
    if court2.valid:
        return _resolved(
            "B2", court1, dao_decision=APPEAL, court2=court2, valid_rewards=2
        )
    if set(court2.judge_ids) & set(replacement_court2.judge_ids):
        raise ValueError("Court 2 replacement overlaps prior assignment")
    if excluded & set(replacement_court2.judge_ids):
        raise ValueError("Court 2 replacement contains a forbidden identity")
    if replacement_court2.valid:
        return _resolved(
            "B2",
            court1,
            dao_decision=APPEAL,
            court2=replacement_court2,
            valid_rewards=2,
        )
    return _protocol_fail(
        "B2",
        court1.verdict,
        dao_decision=APPEAL,
        court2_opened=True,
        valid_rewards=1,
    )
