# FundTogether VNext — Remediation Parameter Registry V2

> **Status:** Frozen local research policy only. This registry is for the
> disposable Anvil/MockUSDC implementation and does not authorize public-chain,
> real-money or production custody.
>
> **Policy version:** `fundtogether-vnext-local-v2-remediation`
>
> **Supersedes:** `parameters-v1.md` for the remediation rules listed below.
> Existing campaigns and review cases are never reinterpreted under this
> version.

## Machine-readable identity

The runtime identity test reads this block. Deployment scripts and the runtime
verifier must agree with it before a local acceptance run is considered valid.

<!-- vnext-policy-json
{
  "policyVersion": "fundtogether-vnext-local-v2-remediation",
  "chainId": 31339,
  "asset": "MockUSDC",
  "tokenDecimals": 6,
  "minimumStakeFloorUnits": "10000000",
  "riskMultiplierBps": 500,
  "milestoneSubmissionWindowSeconds": 604800,
  "correctionWindowSeconds": 604800,
  "challengeWindowSeconds": 604800,
  "judgeEnrollmentWindowSeconds": 172800,
  "commitWindowSeconds": 86400,
  "revealWindowSeconds": 86400,
  "appealWindowSeconds": 172800,
  "randomnessTimeoutSeconds": 172800,
  "maximumAppealRounds": 2,
  "maximumRetriesPerReviewLevel": 2,
  "maximumMilestoneCorrections": 1,
  "minoritySlashBps": 500,
  "appealBondUnits": "1000000",
  "nonRevealPenaltyUnits": "0"
}
-->

## Remediation rules

| Parameter | Frozen local value | Contract rule / owner |
| --- | ---: | --- |
| `minimumStakeFloor` | 10 MockUSDC (`10000000` units) | Every registered case, JuryRegistry/JuryReview |
| `riskMultiplierBps` | `500` (5%) | Required case stake is `max(floor, ceil(risk × bps / 10000))` |
| `milestoneSubmissionWindow` | 7 days | Starts when funding succeeds; timeout is permissionless |
| `correctionWindow` | 7 days | Starts when a substantive milestone review returns `VERDICT_FAIL` |
| `challengeWindow` | 7 days | Must close before an exact milestone payout |
| `judgeEnrollmentWindow` | 48 hours | Existing V1 review timing |
| `commitWindow` | 24 hours | Existing V1 review timing |
| `revealWindow` | 24 hours | All three assigned Judges must reveal |
| `appealWindow` | 48 hours | Starts after the latest valid round |
| `randomnessTimeout` | 48 hours | No randomness is a substantive FAIL |
| `maximumAppealRounds` | 2 | Fresh, non-overlapping Judge pool per appeal |
| `maximumRetriesPerReviewLevel` | 2 | Only protocol failure can retry |
| `maximumMilestoneCorrections` | 1 | Correction keeps the frozen budget and criteria |
| `minoritySlashBps` | `500` (5%) | Only substantive minority slashing; protocol failure does not slashing-score a side |
| `nonRevealPenalty` | 0 | Missing reveal makes the court invalid; it does not create a substantive FAIL |
| `appealBond` | 1 MockUSDC (`1000000` units) | Refunded when the appeal family reaches finality |
| `challenge` | Disabled | No challenge-open or challenge-resolution path in the active local policy |

## Binding remediation decisions

1. The sum of all immutable milestone budgets MUST equal the funding goal.
2. A registered case is the only case to which a Judge may reserve stake. An
   un-enrolled reservation can be released permissionlessly after enrollment
   closes; an enrolled reservation can be settled exactly once.
3. Court membership comes from a frozen seed-derived permutation, not from the
   order in which callers materialize courts. A reference court has three
   unique Judges and resolves by two-of-three majority.
4. A valid substantive `PASS` or `FAIL` cannot be retried. Ties, invalid
   courts, no-quorum and randomness failures use bounded protocol retries and
   eventually become `PROTOCOL_FAIL`.
5. Refund allocation is frozen from the canonical contribution snapshot before
   any claim. Entitlements are stored per contributor, so claim order cannot
   change the result and zero-token rounding claims remain claimable once.
6. Event, projection and stream checkpoint writes are one database transaction.
   The event identity is `(streamId, transactionHash, logIndex)` and the stream
   encodes chain ID, escrow address and genesis hash.

## Financial boundary

The CampaignEscrowVNext contract owns contribution escrow, milestone payout,
refund allocation and refund claims. JuryRegistry/JuryReview own Judge stake,
slash and reward ledgers. PostgreSQL is an indexed read model; it cannot create
a payout, refund, completion or review outcome.

The local conservation target is:

```text
received contributions = paid milestone budgets + claimed refunds + remaining escrow
```

The registry's Judge stake and reward pools are separate from Backer escrow.

## Public-chain gate

This version is not a public-chain readiness claim. Before any public or
real-asset deployment, the project still needs a production randomness choice,
evidence-availability guarantees, fee/reward economics, gas limits for the
maximum Judge snapshot, independent contract audit and a new policy version.
