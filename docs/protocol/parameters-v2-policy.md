# FundTogether VNext V2 — PR0 Parameter Registry

> **Status:** PR0 policy candidate. Values marked
> `PROPOSED_PENDING_APPROVAL` are not deployed runtime parameters.
>
> **Policy version:** `fundtogether-vnext-v2-pr0-policy-20261025`
>
> **Deployment boundary:** disposable Anvil/MockUSDC research only after the
> approval gate. No public-chain, real-money, migration, or production claim.

This registry is the numeric companion to
`FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V2.md` and
`PR0_POLICY_FINALIZATION.md`. Existing campaigns and review cases keep their
original policy identity.

## Commitment schema

The campaign commitment hash covers one canonical, ordered object containing:

```text
policyVersion, chainId, token, creator, payoutWallet,
milestones[] = {
  milestoneId, deliverableCommitment, acceptanceCriteriaHash,
  fundingTarget, creatorPayoutBudget, judgeRewardRateBps,
  submissionDeadline, fundingDeadline, publicationPolicy,
  evidenceDisclosurePolicy, daoFormulaVersion, resetPolicyVersion
}
```

The serialization is length-delimited and canonical before hashing. The
contract stores the hash and the exact frozen values needed for settlement;
PostgreSQL and UI payloads are projections and cannot amend the commitment.
Any field that can move funds or select authority must be present before the
first funding window opens.

## Machine-readable identity

<!-- vnext-v2-pr0-policy-json
{
  "policyVersion": "fundtogether-vnext-v2-pr0-policy-20261025",
  "asset": "MockUSDC",
  "tokenDecimals": 6,
  "referenceCourtSize": 3,
  "maxValidCourts": 2,
  "rewardRateBps": 100,
  "basisPointsDenominator": 10000,
  "rewardRounding": "floor",
  "daoFormulaVersion": "CWQ-1",
  "daoParticipationThresholdBps": 2000,
  "daoTiePolicy": "ACCEPT",
  "daoSnapshot": "at-dao-open",
  "daoContributionCapUnits": "uint128_max",
  "daoTotalWeightArithmetic": "checked_uint256",
  "maxResetsPerCourt": 1,
  "maxResetsPerCase": 2,
  "resetPenaltyBpsOfLockedStake": 1000,
  "resetPenaltyMinimumUnits": "1",
  "resetFundingSource": "offending_locked_stake_only",
  "publicationPolicy": "PUBLICATION_PRE_FUND_V1",
  "publicationRewardRateBps": 0,
  "refundDustPolicy": "canonical_address_prefix"
}
-->

## Policy parameters

| Parameter | Candidate value | Status | Freeze point / owner |
| --- | ---: | --- | --- |
| `referenceCourtSize` | `3` | `LOCKED` | V2 campaign policy / JuryReview |
| `maxValidCourts` | `2` (`Court 1` + one `Court 2`) | `LOCKED` | Milestone policy |
| `rewardRateBps` | `100` (1% example/default) | `PROPOSED_PENDING_APPROVAL` | Per milestone before funding / CampaignEscrowV2 |
| `basisPointsDenominator` | `10,000` | `PROPOSED_PENDING_APPROVAL` | Policy version |
| `rewardRounding` | floor in token base units | `PROPOSED_PENDING_APPROVAL` | Reward freeze / CampaignEscrowV2 |
| `daoFormulaVersion` | `CWQ-1` | `PROPOSED_PENDING_APPROVAL` | DAO opening / BackerAppealDAO |
| `daoParticipationThresholdBps` | `2,000` (20% effective weight) | `PROPOSED_PENDING_APPROVAL` | DAO opening / BackerAppealDAO |
| `daoTiePolicy` | `ACCEPT` | `PROPOSED_PENDING_APPROVAL` | DAO policy |
| `daoSnapshot` | confirmed contributions at DAO open | `PROPOSED_PENDING_APPROVAL` | DAO opening / indexer projection |
| `maxResetsPerCourt` | `1` | `PROPOSED_PENDING_APPROVAL` | Case creation / JuryReviewV2 |
| `maxResetsPerCase` | `2` | `PROPOSED_PENDING_APPROVAL` | Case creation / JuryReviewV2 |
| `resetPenaltyBpsOfLockedStake` | `1,000` (10%) | `PROPOSED_PENDING_APPROVAL` | Invalid-court settlement / JuryRegistryV2 |
| `resetPenaltyMinimumUnits` | `1` base unit when locked stake is nonzero | `PROPOSED_PENDING_APPROVAL` | Invalid-court settlement |
| `resetFundingSource` | offending locked stake only | `PROPOSED_PENDING_APPROVAL` | JuryRegistryV2 / reset pool |
| `publicationPolicy` | `PUBLICATION_PRE_FUND_V1` | `PROPOSED_PENDING_APPROVAL` | Campaign policy |
| `publicationRewardRateBps` | `0` | `PROPOSED_PENDING_APPROVAL` | Publication case creation |
| `refundDustPolicy` | deterministic prefix by ascending canonical address | `PROPOSED_PENDING_APPROVAL` | Refund snapshot |

## Frozen reward, reserve and payout arithmetic

All values are unsigned integer token base units. A milestone is rejected if
any checked multiplication/addition overflows, if the reward unit is zero when
the policy requires a nonzero reward, or if the reserve would consume the full
target.

```text
judgeRewardUnit    = floor(fundingTarget × judgeRewardRateBps / 10,000)
maxReviewReserve   = judgeRewardUnit × referenceCourtSize × maxValidCourts
creatorPayoutBudget = fundingTarget - maxReviewReserve
```

The reserve is a maximum for valid Court 1/Court 2 service rewards. An invalid
court earns no service reward. Reset penalties never consume this reserve.

For a funded milestone, settlement is conservation-preserving:

```text
Raised = CreatorPaid + JudgePaid + Refunded + EscrowRemaining
```

`EscrowRemaining` is read after all already-authorized payments. Therefore an
unused reserve is refundable through the remaining escrow balance and is never
added again as a separate inflow. A funding-window failure creates no review
reward and refunds the confirmed contribution snapshot.

### Required numeric vectors

| Case | Inputs | Expected result |
| --- | --- | --- |
| V1 | target `1,000`, rate `100` bps, 3 seats, 2 valid courts | unit `10`, reserve `60`, creator budget `940` |
| V2 | target `1,000`, Court 1 valid PASS, DAO `ACCEPT` | creator `940`, Judge paid `30`, refundable remainder `30` |
| V3 | target `1,000`, DAO `APPEAL`, Court 2 valid PASS | creator `940`, Judge paid `60`, refundable remainder `0` |
| V4 | target `1,000`, DAO `APPEAL`, Court 2 valid FAIL | creator `0`, Judge paid `60`, Backer refund `940` |
| V5 | target `1,001`, rate `100` bps | unit `10`, reserve `60`, creator budget `941`; one base unit is preserved in accounting |
| V6 | target `1` base unit, rate `100` bps | unit `0`; reject when nonzero reward is required |
| V7 | pre-funding deadline failure | creator `0`, Judge paid `0`, refund pool equals raised |
| V8 | invalid court reset | invalid court Judge paid `0`; each missing Judge pays the reset penalty from locked stake only |

## CWQ-1 exact formula and vectors

The formula uses base units and an integer square root:

```text
w_i = floor_sqrt(c_i)
```

No floating point, division by a changing total, or wallet normalization is
allowed. `c_i` is snapshotted once; later contributions do not affect the
ballot. The implementation must reject a contribution above the configured
`uint128` per-wallet cap and use checked `uint256` sums.

| Vector | Snapshot contributions (base units) | Weights | Expected outcome |
| --- | --- | --- | --- |
| Q1 | `[1, 4, 9]` | `[1, 2, 3]` | if first two vote ACCEPT and third APPEAL: ACCEPT `3`, APPEAL `3` → tie → ACCEPT |
| Q2 | `[1,000,000, 4,000,000, 9,000,000]` | `[1,000, 2,000, 3,000]` | ACCEPT `3,000` vs APPEAL `3,000` → tie → ACCEPT |
| Q3 | `[4, 4, 9]` | `[2, 2, 3]` | ACCEPT `4` vs APPEAL `3` → ACCEPT |
| Q4 | `[9, 16]` | `[3, 4]` | APPEAL `4` vs ACCEPT `3` → APPEAL if threshold is met |
| Q5 | `[2, 3]` | `[1, 1]` | opposite choices tie → ACCEPT |
| Q6 | one wallet `[9,000,000]` | `[3,000]` | nine wallets `[1,000,000]` each produce `[1,000]` each; this demonstrates the accepted wallet-splitting risk |
| Q7 | snapshot `[1,000,000]`, then contribution after DAO opens | only `1,000` counts | later contribution is excluded |
| Q8 | same wallet submits two ballots | n/a | second ballot reverts / is ignored by canonical event identity |
| Q9 | `c_i > uint128_max` or checked sum overflow | n/a | ballot opening/contribution snapshot rejects before weight calculation |

Participation is `W_cast / W_total`; with the proposed 20% threshold, an
unmet threshold follows `daoTiePolicy = ACCEPT`. The threshold remains an
approval gate because V2 did not previously freeze a quorum value.

## Reset penalty arithmetic

```text
penalty_i = min(lockedCaseStake_i,
                max(1, floor(lockedCaseStake_i × 1,000 / 10,000)))
```

The maximum per-court reset inflow is the sum of the three seat penalties. The
pool is not a promise to Backers or the creator; it can distribute only its
actual balance. A replacement Judge cannot claim a reset payment twice.

## Freeze and change rules

1. A campaign stores this `policyVersion` and the exact values used by its
   commitment.
2. Reward rate, target, creator payout budget, reserve formula, DAO formula,
   reset cap and publication boundary freeze before the relevant case/funding
   window opens.
3. A policy change creates a new version and never rewrites an existing case.
4. PR1–PR4 must ship tests for every value that can move funds before the value
   is promoted from `PROPOSED_PENDING_APPROVAL` to `APPROVED`.
