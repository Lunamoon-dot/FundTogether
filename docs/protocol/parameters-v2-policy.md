# FundTogether VNext V2 — PR0 Parameter Registry

> **Status:** PR0 policy candidate. Values marked
> `PROPOSED_PENDING_APPROVAL` are not deployed runtime parameters.
>
> **Policy version:** `fundtogether-vnext-v2-pr0-remediation-20261025`
>
> **Deployment boundary:** disposable Anvil/MockUSDC research only after the
> approval gate. No public-chain, real-money, migration, or production claim.

This registry is the numeric companion to
`FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V2.md` and
`PR0_POLICY_FINALIZATION.md`. Existing campaigns and review cases keep their
original policy identity.

## Commitment schema and versioning

The proposed schema identity is `FTV2-COMMIT-2`. At **campaign creation**,
before any contribution, freeze the complete ordered campaign object:

```text
commitmentSchemaVersion, policyVersion, policyManifestHash,
chainId, token, creator, payoutWallet,
milestones[] = {
  milestoneId, deliverableCommitment, acceptanceCriteriaHash,
  fundingTarget, creatorPayoutBudget, judgeRewardRateBps,
  judgeRewardUnit, maxReviewReserve, submissionDeadline, fundingDeadline
}
```

`policyManifestHash` commits the complete canonical policy preimage, including
reward denominator/rate bounds/reserve/rounding/refunds, CCPS-1 cost schedule,
case-stake requirement, recipients, reset/terminal limits, CWQ-1/snapshot/caps/
threshold/tie/conflicts/Court 2 selection, publication/correction and evidence
disclosure/reasoning rules. Every required field and sub-policy version is
present; a formula identifier alone or a mutable registry pointer is not a
complete economic commitment.

Use `keccak256(abi.encode(...))` over a versioned typed schema and ordered
arrays, not ambiguous concatenation or a hash of arbitrary JSON. The exact
typed encoding must be pinned and tested by the consuming implementation;
this Markdown JSON is a review registry, not its Solidity hash preimage.
The contract retains the exact values needed for validation/settlement and
the immutable hash. PostgreSQL/UI cannot amend them.

Deadlines (or their exact activation-relative rules) and economic values are
committed at creation. Activation and case/DAO opening instantiate these
frozen rules and take historical snapshots; they cannot set new rates, fees,
caps or conflicts. Changing any economic field/schema requires a new policy
identity and new campaign/deployment. Existing commitments keep their original
version. There is no optional later attachment of missing economics.

PR1 may use a complete, explicitly populated **Foundry-only** test manifest
under `fundtogether-vnext-v2-pr1-funding-fixture`. Pending policy values there
are test data, not approval. PR1 validates commitment completeness/immutability
and its funding rules without executing reward, reset or DAO economics.
Incomplete manifests are rejected rather than populated later. This fixture
must not accept user funding or be upgraded into a funded V2 campaign.
A usable campaign needs all its committed policies approved and integrated
before contributions are enabled.

## Machine-readable identity

All monetary sample values below are token **base units**. In particular D=10
and F=3 are small arithmetic fixtures, not calibrated service prices or an
adequate stake recommendation. Only the listed `lockedParameters` are already
locked decisions; all other new choices remain `PROPOSED_PENDING_APPROVAL`.

<!-- vnext-v2-pr0-policy-json
{
  "policyVersion": "fundtogether-vnext-v2-pr0-remediation-20261025",
  "supersedesCandidate": "fundtogether-vnext-v2-pr0-policy-20261025",
  "policyStatus": "PROPOSED_PENDING_APPROVAL",
  "commitmentSchemaVersion": "FTV2-COMMIT-2",
  "pr1FixtureDeploymentIdentity": "fundtogether-vnext-v2-pr1-funding-fixture",
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
  "daoEmptyElectoratePolicy": "ACCEPT",
  "daoSnapshot": "at-dao-open",
  "daoContributionCapUnits": "uint128_max",
  "daoTotalWeightArithmetic": "checked_uint256",
  "daoConflictPolicyVersion": "DAO-TEMPORAL-1",
  "daoExcludeAssignedBeforeOpen": true,
  "daoExcludedAssignmentHistory": "all_court1_attempts",
  "court2SelectionAfter": "dao_finalized_appeal",
  "court2ExcludeCourt1Judges": true,
  "court2ExcludeDaoVoters": "all_valid_accept_or_appeal_ballots",
  "daoRetroactiveVoteChanges": false,
  "resetPolicyVersion": "CCPS-1",
  "maxResetsPerCourt": 1,
  "maxResetsPerCase": 2,
  "resetDisruptionAllowanceUnits": "10",
  "resetFinalizationAllowanceUnits": "3",
  "resetFinalizationAllowanceMinimumUnits": "3",
  "resetCostMaxUnits": "23",
  "resetFixtureCaseStakeRequirementUnits": "23",
  "requiredLockedStakeRule": "max(caseStakeRequirement,resetCostMax)",
  "resetOffenderAllocation": "equal_split_remainder_ascending_canonical_address",
  "resetRecipients": "compliant_invalid_court_judges_and_successful_finalizer",
  "actualCostReimbursementCapUnits": "0",
  "resetFundingSource": "offending_locked_stake_only",
  "publicationPolicy": "PUBLICATION_PRE_FUND_V1",
  "publicationRewardRateBps": 0,
  "refundDustPolicy": "canonical_address_prefix",
  "lockedParameters": [
    "referenceCourtSize",
    "maxValidCourts",
    "court2ExcludeCourt1Judges"
  ],
  "pendingParameterGroups": [
    "commitment_schema",
    "reward_and_refund_economics",
    "CCPS-1_and_limits",
    "CWQ-1_and_threshold",
    "DAO-TEMPORAL-1",
    "publication_boundary"
  ]
}
-->

## Policy parameters and consuming approval gate

| Parameter / rule | Candidate value | Status | Freeze point / direct PR |
| --- | --- | --- | --- |
| `referenceCourtSize` | `3` | `LOCKED` | Campaign creation / Court logic |
| `maxValidCourts` | `2` (Court 1 + one Court 2) | `LOCKED` | Campaign creation / PR2 |
| `commitmentSchemaVersion` | `FTV2-COMMIT-2` | `PROPOSED_PENDING_APPROVAL` | Campaign creation; identity/completeness required by PR1, full adoption before user funding |
| `rewardRateBps` | `100` (1% example, Creator sets the frozen rate) | `PROPOSED_PENDING_APPROVAL` | Campaign creation / PR2 |
| `basisPointsDenominator`, `rewardRounding` | `10,000`, floor base units | `PROPOSED_PENDING_APPROVAL` | Campaign creation / PR2 |
| `refundDustPolicy` | Prefix by ascending canonical address | `PROPOSED_PENDING_APPROVAL` | Campaign creation / PR2 |
| `resetPolicyVersion` | `CCPS-1` | `PROPOSED_PENDING_APPROVAL` | Campaign creation, copied to each attempt / PR3 |
| `resetDisruptionAllowanceUnits` (D) | `10` base units | `PROPOSED_PENDING_APPROVAL` | Campaign creation / PR3 |
| `resetFinalizationAllowanceUnits` (F) | `3` base units, minimum `3` | `PROPOSED_PENDING_APPROVAL` | Campaign creation / PR3 |
| `resetCostMax` | `2 × D + F = 23` base units in fixture | `PROPOSED_PENDING_APPROVAL` | Computed/checked before assignment / PR3 |
| `requiredLockedStake` | `max(caseStakeRequirement, resetCostMax)` per seat | `PROPOSED_PENDING_APPROVAL` | Rule at creation; reservation before each assignment / PR3 |
| Reset allocation / recipients | One cost total split equally among offenders; remainder by address; compliant seats get D, finalizer gets F | `PROPOSED_PENDING_APPROVAL` | Campaign creation / PR3 |
| `actualCostReimbursementCapUnits` | `0` (fixed allowances only) | `PROPOSED_PENDING_APPROVAL` | Campaign creation / PR3 |
| `maxResetsPerCourt`, `maxResetsPerCase` | `1`, `2` | `PROPOSED_PENDING_APPROVAL` | Campaign creation / PR3 |
| `resetFundingSource` | Offending locked stake only | `PROPOSED_PENDING_APPROVAL` | Source segregation preserves the locked stake-only no-vote decision / PR3 |
| `daoFormulaVersion` | `CWQ-1` | `PROPOSED_PENDING_APPROVAL` | Campaign creation / PR4 |
| `daoParticipationThresholdBps` | `2,000` (20% effective weight) | `PROPOSED_PENDING_APPROVAL` | Campaign creation / PR4 |
| `daoTiePolicy`, `daoEmptyElectoratePolicy` | `ACCEPT` | `PROPOSED_PENDING_APPROVAL` | Campaign creation / PR4 |
| `daoSnapshot` | Confirmed contributions/eligibility at DAO open | `PROPOSED_PENDING_APPROVAL` | Rule at creation, historical snapshot at opening / PR4 |
| DAO cap / sums | `uint128_max` per wallet, checked `uint256` sums/products | `PROPOSED_PENDING_APPROVAL` | Campaign creation / PR4 |
| `daoConflictPolicyVersion` | `DAO-TEMPORAL-1` | `PROPOSED_PENDING_APPROVAL` | Campaign creation / PR4 |
| DAO exclusion | All Court 1 assignees known at DAO open, including invalid attempts | `PROPOSED_PENDING_APPROVAL` | Snapshot at DAO opening / PR4 |
| Court 2 excludes Court 1 Judges | `true` | `LOCKED` | Same case, including reset history |
| Court 2 additionally excludes actual DAO voters | All valid ACCEPT or APPEAL ballots, including on Court 2 replacement | `PROPOSED_PENDING_APPROVAL` | After DAO finalizes APPEAL / PR4 |
| No retrospective DAO changes | Future assignments never change past votes/snapshot/denominator | Temporal correctness requirement | Throughout PR4 |
| `publicationPolicy`, `publicationRewardRateBps` | `PUBLICATION_PRE_FUND_V1`, `0` | `PROPOSED_PENDING_APPROVAL` | Campaign creation / publication consumer (O2/O8) |

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

For this identity, `JudgePaid` means valid-service funds transferred or
irrevocably isolated into the funded Judge claim ledger at settlement. It
includes earned claims not yet withdrawn; their later withdrawal is not a
second milestone debit. `JudgePaid = JudgeRewardClaimed + JudgeRewardUnclaimed`.
Refund snapshots exclude these funded obligations even if no Judge has
claimed yet. An unearned reserve unit remains in `EscrowRemaining` and is
refundable exactly once.

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
| V8 | invalid court reset | valid-service Judge paid `0`; CCPS-1 compensation is funded from offending locked stake only (R1–R10), outside milestone escrow |

## CWQ-1 exact formula and vectors

Weight is contribution-based, not identity-based. The formula uses base units
and an integer square root:

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
| Q9 | `c_i > uint128_max` or checked sum/product overflow | n/a | contribution/snapshot or decision calculation rejects safely; no wrapped weight or threshold |
| Q10 | Opponent ACCEPT `[16,000,000]`; attacker APPEAL `[9,000,000]`, or splits that same amount into nine `[1,000,000]` wallets | Opponent `4,000`; attacker unsplit `3,000`, split `9,000` | All vote, so threshold is met: unsplit ACCEPT wins `4,000:3,000`; split APPEAL wins `9,000:4,000` |

Participation is `W_cast / W_total`, where the denominator includes only
eligible snapshot wallets after the proposed Court 1 conflict exclusion.
Use checked integer cross-products `W_cast × 10000 >= W_total × thresholdBps`.
Zero eligible weight, an unmet threshold or a tie defaults to `ACCEPT`.
These choices remain `PROPOSED_PENDING_APPROVAL`.

Q6 and Q10 show that wallet splitting can increase voting power and change
the result without increasing total contribution. CWQ-1 is not Sybil-resistant;
it has no validated incentive-compatibility or collusion-resistance guarantee.
A ballot still chooses only ACCEPT/APPEAL, never PASS/FAIL. No alternative
Sybil mechanism, linear vote or one-wallet-one-vote substitution is proposed.

### DAO conflict timeline (DAO-TEMPORAL-1, pending)

```text
Court 1 (including invalid/replacement assignment history)
  → valid provisional verdict
  → DAO_OPEN: freeze contributions, eligible set, W_total, prior Court 1 assignees
  → DAO_CLOSED:
       ACCEPT → finalize Court 1; no Court 2 assignment
       APPEAL → freeze all valid DAO voters → random Court 2 assignment
                  → exclude Court 1/prior case assignees, creator and DAO voters
```

There is no future Court 2 list at DAO opening. Forbidden Court 1 ballots
revert without changing the already frozen denominator. Court 2 (and any
replacement) never modifies past ballots, snapshot, weight or DAO outcome.
If exclusion leaves insufficient eligible Judges, use the approved bounded
timeout/protocol-failure rule; never erase votes or relax conflicts ad hoc.
The exclusion of Court 1 assignees from DAO and of actual DAO voters from
Court 2 are new pending restrictions, separate from locked court isolation.

## Cost-Coverage Procedural Slashing (CCPS-1)

### Cost schedule and collateral proof

A compliant seat has completed both required commit and valid reveal by the
original deadlines. At invalid-court settlement, count each non-compliant
assigned seat once, irrespective of vote content. A minority valid vote is
never procedural misconduct.

```text
D = resetDisruptionAllowanceUnits >= 0
F = resetFinalizationAllowanceUnits >= 3 base units
resetCostMax = 2 × D + F
requiredLockedStake = max(caseStakeRequirement, resetCostMax)

n == 0: totalResetCompensation = 0; all penalty_i = 0
1 <= n <= 3:
    totalResetCompensation = (3 - n) × D + F
    q = totalResetCompensation div n
    r = totalResetCompensation mod n
    penalty_i = q + (offenderRank_i < r ? 1 : 0)  # offenders only
    penalty_i = 0                               # compliant seats
```

Sort offenders by ascending canonical address before allocating the remainder.
Checked arithmetic and three sufficient separate locks are pre-assignment
guards. `caseStakeRequirement` is the case's already committed stake rule;
the fixture uses 23. A higher requirement increases the lock, not the penalty.
Stake available for other cases/withdrawal excludes all existing reservations.

The sole-offender bound is `2D + F`; for any offender count, total liability
is at most that bound. Equal allocation yields `sum(penalty_i) =
totalResetCompensation`, with each penalty within its own lock and positive
for every offender because `F >= 3`. An undercollateralized seat prevents
assignment; truncating penalties with `min(stake, cost)` is not a substitute
for this coverage guard. No 10% stake rule is used.

D is a fixed cancelled-work allowance per compliant Judge; F is a fixed
allowance to the successful permissionless invalid-court finalizer. These are
conventional costs, not a measurement of actual work, gas or truth. Actual
on-chain token debits can be verifiable, but variable actual-cost reimbursement
is disabled in this version (cap 0). Off-chain invoices, profit, reputational
loss and unprovable delay damages are not compensable. A changed cost scope
requires a new approved policy version.

### Settlement and reset limits

```text
sum(penalty_i) = totalResetCompensation = (3 - n) × D + F    # invalid court only
ResetSlashCollected = ResetCompensationPaid + ResetCompensationUnclaimed
Raised_m = CreatorPaid_m + JudgePaid_m + Refunded_m + EscrowRemaining_m
```

Atomically debit offending locks and credit funded pull claims: D per compliant
seat and F to the finalizer. The invalid court earns zero valid-service reward.
No milestone/reserve funds enter the reset pool; no reset stake inflow is
added to Backer refunds or counted as a valid Judge reward. If a finalizer is
also a recipient seat, its two distinct cost components are credited once
each, not duplicated. A failed claim transfer reverts only that claim and
leaves the already funded entitlement retryable.

Use a once-only invalid-court settlement identity
`(policyVersion, caseId, courtLevel, courtId, attemptIndex)`, including a
terminal invalid attempt for which no replacement opens. Neither a missing
commit plus missing reveal nor two reset calls may slash the same seat twice.
Replacement requires a settled invalid attempt and three new eligible Judges,
each with fresh sufficient locked stake; past case Judges are excluded.
No assignment means no assigned-duty penalty or compensation debt.

At most one reselection is allowed per Court level, at most two per case.
A replacement invalidity at either level is terminal even if the other level
has unused allowance. There are at most four court attempts in a milestone
case, and at most **three invalid settlements** on a reachable path: Court 1
must become valid to reach Court 2. Thus case compensation is at most
`3 × resetCostMax`, funded from separate offender locks at each attempt.
Publication has no Court 2 and at most two invalid settlements. Claims do not
block replacement or convert reset into an appeal.

### Required reset vectors

D=10, F=3, `resetCostMax=23`, fixture `caseStakeRequirement=23`.
Unless stated otherwise, each Judge locks 50 base units, and addresses A < B < C.
All numeric prices and limits remain `PROPOSED_PENDING_APPROVAL`.

| Vector | Offenders / boundary | Penalties [A,B,C] | Compensation / expected result |
| --- | --- | --- | --- |
| R1 | A fails to reveal; B/C compliant | [23,0,0] | Total 23 = B 10 + C 10 + finalizer 3 |
| R2 | A/B fail to reveal; C compliant | [7,6,0] | Total 13 = C 10 + finalizer 3; one cost total split between two offenders |
| R3 | A/B/C fail to reveal | [1,1,1] | Total 3 = finalizer 3; no compliant-seat credit |
| R4 | A fails to reveal; each lock exactly 23 | [23,0,0] | Total 23; A remaining lock 0; full collateral-boundary coverage |
| R5 | Any required seat offers lock 22 | n/a | Reject before assignment; no compensation obligation created |
| R6 | Court 1 R1 → replacement valid → DAO APPEAL → Court 2 R2 → replacement valid | Per-attempt R1 + R2, fresh Judges | Two resets, total 36; target 1000 = creator 940 + valid Judge reward 60; stake 36 = compensation 36 separately |
| R7 | All commit/reveal, including a valid minority vote | [0,0,0] | Total 0; no procedural slash or finalizer allowance |
| R8 | Court 1 R1 → replacement valid → DAO APPEAL → Court 2 R1 → replacement R1 invalid | Three R1 settlements, fresh Judges | Two resets, total 69; terminal PROTOCOL_FAIL, no third reselection; target 1000 = valid Court 1 reward 30 + refund 970; creator 0 |
| R9 | A misses both commit and reveal | [23,0,0] | One seat violation, total 23 rather than two penalties |
| R10 | D=10, F=2 | n/a | Reject invalid policy before assignment (F must be at least 3 base units) |

## Freeze and change rules

1. A campaign stores its schema/version, full policy manifest hash and exact
   settlement inputs at creation, before any funding.
2. Snapshotting contributions or Judge eligibility later never amends the
   precommitted economics or past DAO votes.
3. The predecessor identity remains immutable. This remediation uses a new
   candidate identity; future changes also require a new version.
4. Each PR needs approval only for the policy it consumes, as specified in
   [PR0 approval gates](PR0_POLICY_FINALIZATION.md#approval-gates-by-consuming-pr)
   and [acceptance criteria](PR1-PR4_ACCEPTANCE_CRITERIA.md). PR1's Foundry
   fixture is independent of PR4 numeric approval; it is not a pledgeable
   campaign with missing economics.
5. Full campaign adoption requires the complete approved policy, typed
   commitment encoding, integrated settlement and relevant tests. Tests alone
   never promote a pending policy to `APPROVED`.
