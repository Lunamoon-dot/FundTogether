# FundTogether VNext — Parameter Registry V1

> **Status:** Frozen local research policy `fundtogether-vnext-local-v1`.
> This version enables reproducible Anvil/MockUSDC implementation only; it is
> not public-chain or real-money financial policy.

**Spec:** [FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md](FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md)
**Pilot chain:** Anvil `31339`
**Pilot asset:** MockUSDC with integer token units

## 1. Protocol rules already fixed by the target design

| Parameter | Target rule | Status |
| --- | --- | --- |
| Campaign creation | Any wallet may create a proposal | LOCKED |
| Reference court size | Exactly 3 unique Judges | LOCKED |
| Seat voting power | One vote per assigned seat | LOCKED |
| Court result | At least 2 PASS → PASS; at least 2 FAIL → FAIL | LOCKED |
| Judge selection | Uniform/random assignment using a verifiable seed | LOCKED |
| Multi-court count | `K = floor(N / 3)` when multi-court mode is enabled | LOCKED |
| Court invalidity | V1 reference requires all 3 assigned Judges to reveal | PROPOSED V1 RULE |
| Tie | `TIED`, never substantive FAIL | LOCKED |
| Base/Appeal overlap | A Judge cannot participate in both for one case | LOCKED |
| Payout gate | Exact evidence revision + `FINAL_PASS` + challenge condition | LOCKED |
| Protocol failure | No valid substantive result after retry/timeout → `PROTOCOL_FAIL` | LOCKED |
| Refund | Canonical contribution and fixed refund snapshot | LOCKED |
| Financial source | Campaign/Jury contracts, not database or Admin | LOCKED |

## 2. Frozen local research profile

These values are copied from the spec's illustrative starting profile so local
simulation has a reproducible shape. They remain changeable only through a new
parameter version and must not be presented as production policy.

| Parameter | Frozen local value | Representation / owner |
| --- | ---: | --- |
| `stakeAsset` | MockUSDC, 6 decimals, chain `31339` | contract deployment / protocol owner |
| `minimumStakeFloor` | 10 MockUSDC | `uint256` token units / JuryRegistry |
| `riskClass` | `COMICS_ARTBOOK_STANDARD` | enum in campaign terms / protocol owner |
| `riskMultiplier` | 5% | integer basis points `500` / protocol owner |
| `judgeEnrollmentWindow` | 48 hours | seconds / JuryReview |
| `commitWindow` | 24 hours | seconds / JuryReview |
| `revealWindow` | 24 hours | seconds / JuryReview |
| `appealWindow` | 48 hours | seconds / JuryReview |
| `randomnessTimeout` | 48 hours | seconds / JuryReview |
| `challengeWindow` | 7 days | seconds / CampaignEscrowVNext |
| `maximumAppealRounds` | 2 | count / JuryReview |
| `maximumRetriesPerReviewLevel` | 2 | count / JuryReview |
| `maximumMilestoneCorrections` | 1 | count / CampaignEscrowVNext |
| `minoritySlashRate` | 5% of locked case stake | basis points `500` / JuryReview |
| `nonRevealPenalty` | 0; invalid court becomes `PROTOCOL_FAIL` | token units / policy owner |
| `baseReviewFee` | 0 MockUSDC | token units; no separate fee in local slice |
| `appealBond` | 1 MockUSDC | token units, refunded after finality / JuryReview |
| `challengeBond` | 0 MockUSDC | token units; eligible Backer only / CampaignEscrowVNext |
| `overfunding` | reject contribution above goal | `ContributionExceedsGoal` / CampaignEscrowVNext |
| `courtMode` | all `K = floor(N / 3)` courts | frozen policy enum / JuryReview |
| `courtAggregation` | strict majority; tie → `PROTOCOL_FAIL` | contract rule / JuryReview |
| `evidenceAvailability` | private MinIO bytes must match hash; missing/mismatch → timeout/fail | backend + contract deadline / protocol owner |
| `rewardSource` | minority slash pool only; dust remains in case pool | separate Judge ledger / JuryRegistry |

## 3. Production boundary still requiring a new policy version

The local policy above has explicit values for every transition used by the
research implementation. The following remain prohibited for public-chain
acceptance until a new policy version, owner, tests and deployment review exist:

| Decision | Local boundary | Why public acceptance remains blocked |
| --- | --- | --- |
| Randomness | local deterministic provider | production-compatible verifiable randomness is not selected |
| Retry policy | bounded local retry with terminal protocol-failure fallback | liveness and gas behavior require full review |
| Evidence availability | private MinIO + explicit fail path | storage guarantees are not a chain property |
| Review fee market | zero local fee | public fee funding and anti-griefing economics are untested |
| Public token/custody | MockUSDC only | no real-money or public-chain launch |

## 4. Parameter freeze rules

1. A campaign stores `policyVersion` and the exact policy values required to
   interpret its commitment.
2. Enrollment snapshot freezes eligibility, case stake, pool identity and
   randomness request before assignment.
3. A review round cannot change its timing, slash rate, court rule or appeal
   limit after the first commit.
4. A correction creates a new evidence revision and case identity but cannot
   change the original acceptance criteria or milestone payout.
5. A parameter change creates a new version; it never mutates existing cases.
6. Every parameter that can move funds has a precondition, postcondition,
   timeout, event and invariant test.

## 5. Minimum conservation examples

For every campaign:

```text
R = received contributions
P = successful Creator milestone payouts
F = successful Backer refunds
E = remaining contribution escrow

R = P + F + E
P <= fundingGoal
sum(milestonePayouts) <= fundingGoal
```

Judge stake and reviewer fees are separate ledgers. A reviewer reward or slash
must not spend Backer contribution escrow unless the campaign commitment and
parameter version explicitly include that budget.

## 6. Local policy acceptance checklist

- [x] All local financial decisions have a value, owner and policy version.
- [x] Each value has integer units and no floating-point implementation path.
- [x] The state machine references this version's local rules.
- [ ] Foundry invariant tests cover every value that affects a financial transition.
- [ ] The indexer stores the policy version and event identity.
- [ ] The UI displays the relevant policy version and pending/terminal reason.
- [x] A parameter change cannot rewrite an existing campaign or review case.
