from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable

from .backer_model import ACCEPT, APPEAL


UINT128_MAX = 2**128 - 1
UINT256_MAX = 2**256 - 1
DAO_BPS_DENOMINATOR = 10_000


@dataclass(frozen=True)
class WalletSnapshot:
    wallet_id: str
    contribution: int
    court1_assignee: bool = False


@dataclass(frozen=True)
class DaoResult:
    decision: str
    total_weight: int
    cast_weight: int
    accept_weight: int
    appeal_weight: int
    eligible_wallets: tuple[str, ...]
    voters: tuple[str, ...]


class BackerDao:
    def __init__(
        self,
        snapshot: Iterable[WalletSnapshot],
        participation_threshold_bps: int = 2_000,
        contribution_cap: int = UINT128_MAX,
    ) -> None:
        if not 0 <= participation_threshold_bps <= DAO_BPS_DENOMINATOR:
            raise ValueError("participation threshold must be in [0, 10000]")
        self.threshold_bps = participation_threshold_bps
        self.contribution_cap = contribution_cap
        self.weights: dict[str, int] = {}
        seen: set[str] = set()
        for wallet in snapshot:
            if wallet.wallet_id in seen:
                raise ValueError("duplicate wallet in contribution snapshot")
            seen.add(wallet.wallet_id)
            if wallet.contribution < 0 or wallet.contribution > contribution_cap:
                raise ValueError("snapshot contribution outside configured cap")
            if wallet.court1_assignee:
                continue
            weight = math.isqrt(wallet.contribution)
            if weight > 0:
                self.weights[wallet.wallet_id] = weight
        self.ballots: dict[str, str] = {}

    @property
    def total_weight(self) -> int:
        return sum(self.weights.values())

    def cast(self, wallet_id: str, choice: str) -> None:
        if choice not in (ACCEPT, APPEAL):
            raise ValueError("ballot must be ACCEPT or APPEAL")
        if wallet_id not in self.weights:
            raise ValueError("ineligible DAO voter")
        if wallet_id in self.ballots:
            raise ValueError("duplicate DAO ballot")
        self.ballots[wallet_id] = choice

    def finalize(self) -> DaoResult:
        accept_weight = sum(
            self.weights[wallet]
            for wallet, choice in self.ballots.items()
            if choice == ACCEPT
        )
        appeal_weight = sum(
            self.weights[wallet]
            for wallet, choice in self.ballots.items()
            if choice == APPEAL
        )
        cast_weight = accept_weight + appeal_weight
        total_weight = self.total_weight
        left = cast_weight * DAO_BPS_DENOMINATOR
        right = total_weight * self.threshold_bps
        if left > UINT256_MAX or right > UINT256_MAX:
            raise OverflowError("CWQ-1 threshold product exceeds uint256")
        decision = (
            APPEAL
            if total_weight > 0 and left >= right and appeal_weight > accept_weight
            else ACCEPT
        )
        return DaoResult(
            decision=decision,
            total_weight=total_weight,
            cast_weight=cast_weight,
            accept_weight=accept_weight,
            appeal_weight=appeal_weight,
            eligible_wallets=tuple(sorted(self.weights)),
            voters=tuple(sorted(self.ballots)),
        )


def evaluate_vector(contributions: Iterable[int], choices: Iterable[str]) -> DaoResult:
    contribution_values = list(contributions)
    choice_values = list(choices)
    if len(contribution_values) != len(choice_values):
        raise ValueError("contribution and choice lengths differ")
    dao = BackerDao(
        WalletSnapshot(f"wallet-{index}", contribution)
        for index, contribution in enumerate(contribution_values)
    )
    for index, choice in enumerate(choice_values):
        dao.cast(f"wallet-{index}", choice)
    return dao.finalize()


def deterministic_counterexamples() -> list[dict[str, object]]:
    q6_unsplit = evaluate_vector([9_000_000], [APPEAL])
    q6_split = evaluate_vector([1_000_000] * 9, [APPEAL] * 9)
    q10_unsplit = evaluate_vector([16_000_000, 9_000_000], [ACCEPT, APPEAL])
    q10_split = evaluate_vector(
        [16_000_000] + [1_000_000] * 9, [ACCEPT] + [APPEAL] * 9
    )
    return [
        {
            "scenario_id": "Q6",
            "initial_wallet_distribution": [9_000_000],
            "split_wallet_distribution": [1_000_000] * 9,
            "total_contribution_before": 9_000_000,
            "total_contribution_after": 9_000_000,
            "accept_weight": 0,
            "appeal_weight_before": q6_unsplit.appeal_weight,
            "appeal_weight_after": q6_split.appeal_weight,
            "dao_decision_before": q6_unsplit.decision,
            "dao_decision_after": q6_split.decision,
            "result": "PASS"
            if (q6_unsplit.appeal_weight, q6_split.appeal_weight) == (3_000, 9_000)
            else "FAIL",
        },
        {
            "scenario_id": "Q10",
            "initial_wallet_distribution": [16_000_000, 9_000_000],
            "split_wallet_distribution": [16_000_000] + [1_000_000] * 9,
            "total_contribution_before": 25_000_000,
            "total_contribution_after": 25_000_000,
            "accept_weight": q10_split.accept_weight,
            "appeal_weight_before": q10_unsplit.appeal_weight,
            "appeal_weight_after": q10_split.appeal_weight,
            "dao_decision_before": q10_unsplit.decision,
            "dao_decision_after": q10_split.decision,
            "result": "PASS"
            if (
                q10_unsplit.accept_weight,
                q10_unsplit.appeal_weight,
                q10_unsplit.decision,
                q10_split.accept_weight,
                q10_split.appeal_weight,
                q10_split.decision,
            )
            == (4_000, 3_000, ACCEPT, 4_000, 9_000, APPEAL)
            else "FAIL",
        },
    ]
