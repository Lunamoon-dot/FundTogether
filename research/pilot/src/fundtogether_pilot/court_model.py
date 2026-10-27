from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from .judge_model import FAIL, PASS, JudgeObservation
from .random_streams import KeyedRandom


@dataclass(frozen=True)
class CourtResult:
    judge_ids: tuple[str, str, str]
    observations: tuple[JudgeObservation, JudgeObservation, JudgeObservation]
    valid: bool
    verdict: str | None


@dataclass(frozen=True)
class CcpsSettlement:
    locked_stake_per_judge: int
    gross_slash: int
    penalties: dict[str, int]
    compensation: dict[str, int]
    finalizer_allowance: int
    net_attacker_loss_before_gas: int | None
    milestone_escrow_effect: int


def evaluate_court(observations: Iterable[JudgeObservation]) -> CourtResult:
    items = tuple(observations)
    if len(items) != 3:
        raise ValueError("a reference court requires exactly three Judges")
    identities = tuple(item.judge_id for item in items)
    if len(set(identities)) != 3:
        raise ValueError("court Judge identities must be unique")
    if any(item.counted_vote is None for item in items):
        return CourtResult(identities, items, False, None)  # type: ignore[arg-type]
    pass_votes = sum(item.counted_vote == PASS for item in items)
    verdict = PASS if pass_votes >= 2 else FAIL
    return CourtResult(identities, items, True, verdict)  # type: ignore[arg-type]


def select_judges(
    random: KeyedRandom,
    replication_id: int,
    candidates: Iterable[str],
    *,
    case_id: str,
    court_level: str,
    attempt: int,
    excluded: Iterable[str] = (),
) -> tuple[str, str, str]:
    excluded_set = set(excluded)
    eligible = sorted({candidate for candidate in candidates if candidate not in excluded_set})
    if len(eligible) < 3:
        raise ValueError("fewer than three eligible Judge identities")
    ordered = random.ordered(
        eligible,
        replication_id,
        "court.selection",
        (case_id, court_level, attempt),
    )
    selected = tuple(ordered[:3])
    return selected  # type: ignore[return-value]


def settle_ccps(
    judge_ids: Iterable[str],
    offender_ids: Iterable[str],
    *,
    finalizer_id: str,
    disruption_allowance: int,
    finalization_allowance: int,
    case_stake_requirement: int,
    deposited_stake: int,
    attacker_controlled_ids: Iterable[str] = (),
) -> CcpsSettlement:
    judges = tuple(judge_ids)
    offenders = tuple(sorted(offender_ids))
    if len(judges) != 3 or len(set(judges)) != 3:
        raise ValueError("CCPS-1 requires three unique assigned Judges")
    if not set(offenders).issubset(judges):
        raise ValueError("offenders must be assigned Judges")
    if disruption_allowance < 0 or finalization_allowance < 3:
        raise ValueError("invalid CCPS-1 allowance")
    reset_cost_max = 2 * disruption_allowance + finalization_allowance
    locked = max(case_stake_requirement, reset_cost_max)
    if deposited_stake < locked:
        raise ValueError("insufficient pre-assignment collateral")
    if not offenders:
        return CcpsSettlement(locked, 0, {j: 0 for j in judges}, {}, 0, 0, 0)

    total = (3 - len(offenders)) * disruption_allowance + finalization_allowance
    quotient, remainder = divmod(total, len(offenders))
    penalties = {judge: 0 for judge in judges}
    for rank, offender in enumerate(offenders):
        penalties[offender] = quotient + (1 if rank < remainder else 0)
    compensation = {
        judge: disruption_allowance
        for judge in judges
        if judge not in offenders and disruption_allowance > 0
    }
    compensation[finalizer_id] = compensation.get(finalizer_id, 0) + finalization_allowance
    if sum(penalties.values()) != sum(compensation.values()):
        raise AssertionError("CCPS-1 conservation failure")

    controlled = set(attacker_controlled_ids)
    net_loss: int | None = None
    if controlled:
        controlled_slash = sum(
            amount for judge, amount in penalties.items() if judge in controlled
        )
        controlled_receipts = sum(
            amount for recipient, amount in compensation.items() if recipient in controlled
        )
        net_loss = controlled_slash - controlled_receipts
    return CcpsSettlement(
        locked_stake_per_judge=locked,
        gross_slash=sum(penalties.values()),
        penalties=penalties,
        compensation=compensation,
        finalizer_allowance=finalization_allowance,
        net_attacker_loss_before_gas=net_loss,
        milestone_escrow_effect=0,
    )
