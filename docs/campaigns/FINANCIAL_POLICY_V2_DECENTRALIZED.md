# Campaign Financial Policy V2 — Pure Decentralized Review

> **Status:** Current target policy direction, decided 2026-10-20. The local
> research values are frozen in [Parameter Registry V1](../protocol/parameters-v1.md);
> public-chain economics are not approved.
>
> **Detailed reference:** [VNext Protocol Specification V1](../protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md)

## Policy boundary

This policy replaces Resolver-controlled publication, production review,
completion, challenge resolution and payout with permissionless stake-backed
Judge cases. The old FINANCIAL_POLICY_V1.md remains available as a historical
pre-reset policy and must not be used for new contract behavior.

## Locked decisions

| ID | Decision |
| --- | --- |
| D20 | Any wallet may create a campaign proposal. Creator identity/profile verification is not a protocol funding gate. |
| D21 | Backer pledges enter Campaign escrow. A pledge does not grant automatic Judge power. |
| D22 | A Judge must lock stake to enter or be selected for a review case. One assigned seat has one vote. |
| D23 | The reference court contains three unique Judges and resolves with two-of-three majority. |
| D24 | A campaign may open additional three-Judge courts as scale/value requires, but court aggregation must be an explicit contract rule. |
| D25 | Creator milestone evidence must be committed before review. A passed case and challenge condition are required before payout. |
| D26 | No Resolver, Admin, backend, database row or private operator key may approve a financial transition. |
| D27 | Refunds, payout, timeouts and challenges are permissionless contract actions once their conditions are met. |
| D28 | The protocol accepts Sybil, collusion, bribery, inactive-Judge and incorrect-majority risk; it does not claim factual truth from stake or hashes. |
| D29 | Each case freezes eligibility, locked case stake, pool identity, snapshot and randomness identifier before assignment. |
| D30 | Each assigned seat has one vote; stake does not multiply vote weight. |
| D31 | Base and Appeal Judge pools cannot overlap within one case. |
| D32 | Review outcomes distinguish `FINAL_PASS`, `VERDICT_FAIL` and `PROTOCOL_FAIL`. |
| D33 | `PROTOCOL_FAIL` does not imply Creator fault and does not trigger minority slashing. |
| D34 | A correction revision cannot change the original acceptance criteria or payout amount. |
| D35 | Partial refund uses a fixed snapshot pool and cannot exceed available escrow. |

## State machine

    FUNDING
      → goal reached
    FUNDED / MILESTONE_ACTIVE
      → evidence submitted
    EVIDENCE_REVIEW_OPEN
      ├── provisional PASS → APPEAL_WINDOW → FINAL_PASS → CHALLENGE_WINDOW → MILESTONE_RELEASED
      ├── provisional FAIL → APPEAL_WINDOW → VERDICT_FAIL → CORRECTION or REFUNDING
      └── INVALID/TIED/NO_QUORUM → retry or deterministic PROTOCOL_FAIL

The contract must not release funds merely because the funding goal was met,
because a vote transaction was submitted, or because PostgreSQL says a review
passed.

For `N` eligible Judges, the reference multi-court formation is `K = floor(N / 3)`.
A V1 court is valid only when its three assigned Judges reveal on time. The
contract policy defines whether a case uses one court or all `K` courts. When
multi-court is enabled, `PassCourts > K/2` is PASS, `FailCourts > K/2` is FAIL,
and equal counts are `TIED`; aggregation is never inferred by the UI.

## Fund ownership and movement

1. Backers own refundable claims while their MockUSDC is in escrow.
2. The Campaign contract custody is the financial source of truth.
3. A milestone payout moves only the frozen milestone amount to the frozen
   Creator wallet after the canonical PASS conditions.
4. A refund moves only the eligible Backer's own claim.
5. A transfer failure reverts the state change and allows retry.
6. A payout or refund cannot execute twice.
7. The indexer records the event; it never creates the right.

For `R` received contribution, `P` successful payout, `F` successful refund and
`E` remaining escrow:

```text
R = P + F + E
P <= Goal
sum(MilestonePaid) <= Goal
```

After partial payout, the default refund snapshot is `RefundPool = R - P` and
each Backer claim is pro-rata from that fixed pool. A funding failure before
payout refunds the full confirmed contribution.

## Judge economics: local research profile and public boundary

The local implementation uses the explicit, non-public values in the Parameter
Registry V1: MockUSDC stake, 10 MockUSDC floor, 48h/24h/24h review windows,
48h appeal/randomness timeout, 7d challenge window, two appeal rounds, 5%
coherence slash after substantive finality, zero non-reveal penalty, a 1
MockUSDC appeal bond and a zero local review/challenge fee. These values are
research parameters, not claims of economic safety.

A minority vote is not itself proof of misconduct. Coherence slash is eligible
only after substantive finality; a protocol failure has no winning factual
side. Public deployment still requires a new policy version for randomness,
retry/liveness, fee funding, evidence availability and real-token custody.

## Accounting invariant

For every campaign, the contract must be able to reconcile:

    accepted pledges
      = escrow remaining
      + completed milestone payouts
      + refunds
      + explicitly defined fees/rewards/surplus

No backend action, evidence upload, Judge vote or download event creates a
financial balance by itself.

## Required invariant coverage before implementation

The contract test plan must cover:

1. conservation of raised, paid, refunded and escrowed funds;
2. one payout per milestone and exact evidence-revision binding;
3. stake reservation never exceeding deposited stake;
4. unique Judge seats and non-overlapping Base/Appeal pools;
5. exactly three assigned Judges per valid court;
6. slash bounded by locked stake and applied at most once;
7. finality immune to Creator, Admin and backend changes;
8. refund claims bounded by the snapshot pool;
9. terminal transition callable by any caller after frozen retry/deadline limits.
