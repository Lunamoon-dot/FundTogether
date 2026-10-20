# FundTogether VNext Audit Remediation Protocol Specification

> **Status:** Proposed implementation specification. This document is a
> design artifact, not evidence that the current checkout or local runtime
> satisfies the rules below.
>
> **Date:** 2026-10-20
>
> **Policy version:** `fundtogether-vnext-local-v2-remediation`
>
> **Supersedes for affected rules:** the corresponding retry, settlement,
> budget, deadline, stake, assignment, refund and persistent-indexer rules in
> [VNext Protocol Specification V1](../../protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md).
> Unaffected V1 rules remain in force.

## 1. Purpose

This specification defines the protocol behavior required to remediate the
security and architecture audit findings P0-01 through P1-10. It is the
contract and indexer design boundary for the next implementation plan.

The target remains a pure permissionless protocol:

- any wallet can create a campaign proposal;
- Backer funds remain in contract escrow;
- Judge enrollment, assignment, voting, retry, appeal and settlement are
  permissionless subject to contract guards;
- no Resolver, Admin, backend operator or PostgreSQL row can choose a verdict,
  release funds or open a refund outside an on-chain rule;
- accepted Sybil, collusion, bribery, inactive-Judge and incorrect-majority
  risks are not replaced with a trusted reviewer.

This specification does not add physical fulfilment, NFT, marketplace,
charity, real-money or public-chain deployment. The local target remains one
`COMICS_ARTBOOK` campaign, one `STANDARD` tier, one private
`DIGITAL_DOWNLOAD` PDF, MockUSDC and chain `31339`.

## 2. Finding coverage

| Finding | Required protocol change | Acceptance section |
| --- | --- | --- |
| P0-01 | Valid substantive result cannot enter retry | 6.2, 13.1 |
| P0-02 | Case settlement is exactly-once, including zero slash | 6.3, 9.4, 13.2 |
| P0-03 | Milestone budget exactly accounts for the funding goal | 5.3, 9.1, 13.3 |
| P1-04 | Creator submission and correction have permissionless timeouts | 7, 13.4 |
| P1-05 | Risk-adjusted case stake is immutable and enforced | 8.1, 13.5 |
| P1-06 | Registry reservations require a real open case and recover before enrollment | 8.2, 13.6 |
| P1-07 | Refund allocation consumes the entire refund pool deterministically | 9.3, 13.7 |
| P1-08 | Court membership is independent of assignment call order | 6.4, 13.8 |
| P1-09 | Event, projection and checkpoint writes are atomic and replay-safe | 10.2, 13.9 |
| P1-10 | Persistent indexer covers all canonical financial transitions | 10.3, 13.10 |

## 3. Normative language and source-of-truth boundary

The terms **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative.

```text
Wallet transaction
    -> Campaign/Jury contract
    -> canonical event
    -> transactional persistent indexer
    -> PostgreSQL projection
    -> API/UI read model
```

### 3.1. On-chain authority

The contracts are authoritative for:

- campaign terms needed for custody and state transitions;
- contribution balances, funding result and escrow balance;
- milestone state, evidence revision identity and payout amount;
- review case identity, policy version, stake, snapshot, assignment, votes,
  quorum, retry, appeal and final ruling;
- Judge settlement, refund pool, refund allocation and claim uniqueness.

### 3.2. Off-chain metadata and files

PostgreSQL MAY store campaign text, review reasoning, account metadata and
indexed projections. MinIO MAY store private evidence bytes and the final PDF.
The backend MUST NOT turn a database row, upload status or API response into a
financial success state.

An evidence hash commits to bytes. It does not prove authorship, quality,
delivery, legality or real-world truth.

### 3.3. Transaction lifecycle

The frontend and API MUST distinguish:

```text
wallet request -> submitted -> mined -> canonical receipt -> indexed projection
```

Only the canonical receipt proves that the contract transition happened. Only
the projection proves that the read model has observed the event. A submitted
transaction MUST NOT render `PAID`, `REFUNDED`, `FINAL_PASS` or `SLASHED`.

## 4. Local remediation policy

The following values are frozen for the local research implementation. A
public-chain or real-asset deployment requires a new policy version.

| Parameter | Local value | Rule |
| --- | ---: | --- |
| `minimumStakeFloor` | 10 MockUSDC | Integer token units |
| `riskMultiplierBps` | 500 | 5% of case risk value |
| `milestoneSubmissionWindow` | 7 days | Starts when the milestone becomes active |
| `correctionWindow` | 7 days | Starts when correction is opened |
| `judgeEnrollmentWindow` | 48 hours | Existing V1 value |
| `commitWindow` | 24 hours | Existing V1 value |
| `revealWindow` | 24 hours | Existing V1 value |
| `appealWindow` | 48 hours | Existing V1 value |
| `randomnessTimeout` | 48 hours | Existing V1 value |
| `challengeWindow` | 7 days | Existing V1 value |
| `maximumAppealRounds` | 2 | Existing V1 value |
| `maximumRetriesPerReviewLevel` | 2 | Existing V1 value |
| `maximumMilestoneCorrections` | 1 | Existing V1 value |
| `appealBond` | 1 MockUSDC | Returned to requester when the appeal reaches finality |
| `appealRiskValue` | Root-case risk value | Same required-stake formula as the appealed case |
| `courtSize` | 3 | Exactly three unique Judges |
| `courtMode` | `K = floor(N / 3)` | Local all-court mode |
| `courtAggregation` | Strict majority | Tie becomes protocol failure/retry |
| `maxEligibleJudges` | 300 | Local research gas cap, not a scalability claim |
| `refundClaimExpiry` | None | Unclaimed entitlements remain pull-claimable |

Every campaign and review case MUST store `policyVersion` and the exact values
needed to interpret its commitment. Existing cases MUST NOT be reinterpreted
under this policy version.

## 5. Campaign terms and escrow accounting

### 5.1. Frozen campaign commitment

Before funding opens, the Creator MUST commit:

- Creator payout wallet;
- supported token and chain;
- funding goal and funding deadline;
- ordered milestone identifiers;
- acceptance criteria hash for each milestone;
- evidence submission and correction policy;
- exact milestone payout amount;
- review, appeal, challenge and refund policy versions;
- protocol version and parameter set.

After funding begins, the contract MUST reject changes to the goal, milestone
order, acceptance criteria, payout amount, Creator payout wallet and policy
version.

### 5.2. Funding constraints

- A contribution above the remaining goal MUST revert.
- Funding success occurs only when `raised == fundingGoal` before the funding
  deadline.
- Funding success changes the campaign to `MILESTONES_RUNNING`; it never pays
  the Creator.
- Funding failure opens a refund pool equal to the canonical amount raised.

### 5.3. Exact milestone budget rule

For this policy version:

```text
sum(all milestone budgets) == fundingGoal
```

`createCampaign` MUST reject both `sum(budgets) > goal` and
`sum(budgets) < goal`.

The campaign MUST enter `COMPLETED` only after every frozen milestone budget
has been paid exactly once. Under the exact-budget and no-overfunding rules,
completion leaves zero contribution escrow for that campaign.

This version does not support a reserve budget or completion surplus. A future
surplus policy MUST define a separate pool, recipient entitlement, dust rule,
event set and conservation proof before implementation.

### 5.4. Campaign financial invariant

For every campaign:

```text
R = P + F + E

R = received contribution
P = successful milestone payouts
F = successful Backer refunds
E = remaining campaign escrow
```

The contract MUST enforce:

- `P <= fundingGoal`;
- each milestone is paid at most once;
- `F` never exceeds the refund pool;
- failed token transfers revert the state change;
- no transition can spend the same escrow amount twice.

## 6. Review case lifecycle

### 6.1. Case identity

Every case MUST bind:

```text
chainId
protocolVersion
policyVersion
campaignId
milestoneId or publication marker
evidenceRevision
reviewCaseId
roundId
caseKind
creator
riskValue
requiredCaseStake
```

The identity and evidence revision are immutable after case creation.

### 6.2. Retry eligibility

`courtFinalized == true` MUST NOT be used as a retry condition by itself.

The review engine MUST maintain an explicit round status:

```text
ENROLLMENT_OPEN
SNAPSHOT_PENDING
ASSIGNMENT_PENDING
VOTING
PROVISIONAL_PASS
PROVISIONAL_FAIL
RETRY_ELIGIBLE
APPEAL_WINDOW
FINAL_PASS
VERDICT_FAIL
PROTOCOL_FAIL
SETTLED
```

`openRetry` is valid only when the current round is `RETRY_ELIGIBLE`. A round
becomes `RETRY_ELIGIBLE` only for one of these reasons:

- enrollment closed with fewer than three eligible Judges;
- randomness or snapshot timeout;
- a required court is invalid because quorum/reveal rules failed;
- a court result is tied;
- the configured multi-court aggregation cannot be completed by its deadline;
- the previous retry round was itself protocol-invalid and retry count remains
  below the frozen maximum.

`openRetry` MUST revert when any valid substantive aggregate result is already
`PROVISIONAL_PASS` or `PROVISIONAL_FAIL`. A valid substantive result enters
the appeal window; it never enters protocol retry.

`PROTOCOL_FAIL` is an operational result. It MUST NOT be represented as
`VERDICT_FAIL` or used as proof of Creator misconduct.

### 6.3. Exactly-once case settlement

The review engine MUST settle every enrolled Judge case exactly once.

Settlement is atomic with Registry settlement:

1. reject if `reviewCaseSettled[caseId]` is already true;
2. calculate slash and winner totals;
3. settle every enrolled Judge in the Registry;
4. settle reward accounting, including a zero reward;
5. set `reviewCaseSettled[caseId] = true`;
6. emit `ReviewCaseSettled`.

The local settled flag MUST be written even when:

- `totalSlash == 0`;
- `winners == 0`;
- reward per winner rounds to zero.

`_settleAllRounds` MUST skip cases already marked settled. Root, retry and
appeal cases each have their own settlement identity. A successful settlement
MUST NOT be attempted again merely because a later final-ruling call walks the
same round list.

If any Registry settlement fails, the whole transaction MUST revert and leave
all settlement flags unchanged so the same canonical transition can be retried.

### 6.4. Deterministic multi-court assignment

At snapshot finalization, the engine freezes:

- eligible Judge addresses in canonical order;
- each Judge's case stake;
- snapshot block and randomness seed identifier;
- `N`, `K = floor(N / 3)` and the assignment permutation.

The assignment permutation is created once from the frozen list and seed. For
the local cap, the contract MAY store the resulting permutation directly. A
future production version MAY generate it in bounded batches, but the final
permutation MUST be committed before any court assignment is accepted.

Court `k` reads these positions from the frozen permutation:

```text
seat 0 = permutation[3*k]
seat 1 = permutation[3*k + 1]
seat 2 = permutation[3*k + 2]
```

`assignCourt(caseId, k)` only materializes the already-determined seats. It
MUST NOT select a new address based on which other court was assigned first.
Each address can appear in at most one seat for the round. Assignment call
order MUST NOT change any seat.

The local `maxEligibleJudges = 300` remains an explicit research cap. It MUST
not be described as unrestricted public-chain scale.

## 7. Milestone liveness and correction

### 7.1. Deadline fields

Every milestone stores or derives from frozen policy:

```text
submissionDeadline
correctionDeadline
correctionCount
evidenceRevision
```

The first milestone's `submissionDeadline` is set when funding succeeds:

```text
fundingFinalizedAt + milestoneSubmissionWindow
```

The next milestone's deadline is set when the previous milestone is paid:

```text
previousPayoutAt + milestoneSubmissionWindow
```

When a substantive `VERDICT_FAIL` opens correction, the contract sets:

```text
correctionDeadline = verdictFinalizedAt + correctionWindow
```

Each correction creates a new evidence revision and review case but cannot
change acceptance criteria, payout amount, Creator payout wallet or policy
version.

### 7.2. Permissionless timeout transitions

Any caller MAY trigger the following when the corresponding deadline has
expired:

```text
MILESTONE_ACTIVE + submissionDeadline expired
    -> terminal campaign failure -> REFUNDING

CORRECTION + correctionDeadline expired
    -> terminal campaign failure -> REFUNDING

REVIEW_ENROLLMENT / voting deadline expired
    -> RETRY_ELIGIBLE when retryCount < maximumRetriesPerReviewLevel
    -> PROTOCOL_FAIL when retryCount == maximumRetriesPerReviewLevel
```

Creator inactivity MUST NOT leave contribution escrow without a public
terminal path. A timeout is an operational state transition and MUST NOT be
described as a factual verdict against the Creator.

### 7.3. Appeal requester policy

For this remediation version, both of the following MAY open an appeal when
the case is in its appeal window and the bond is paid:

- an eligible Backer with a nonzero canonical contribution;
- the Creator for a publication or milestone `VERDICT_FAIL` concerning that
  Creator's campaign.

The appeal opens a fresh non-overlapping Appeal Pool. The requester cannot
choose Judges or rewrite the evidence commitment. An appeal bond is accounted
separately. Under this local policy, the exact `appealBond` is returned to the
requester when the appeal reaches finality, regardless of whether the appeal
confirms or changes the substantive result. A valid appeal does not itself
reverse the ruling.

## 8. Judge stake and Registry safety

### 8.1. Risk-adjusted minimum stake

At case creation, the review engine computes and stores:

```text
requiredCaseStake = max(
    minimumStakeFloor,
    ceil(riskMultiplierBps * riskValue / 10_000)
)
```

For integer arithmetic:

```text
ceil(x * bps / 10_000) = (x * bps + 9_999) / 10_000
```

The risk value is:

- `fundingGoal` for publication review;
- the frozen milestone budget for a milestone review;
- the root-case risk value for an appeal review.

`enroll` MUST require the caller's case stake to be at least
`requiredCaseStake`. A nonzero stake below the requirement MUST revert.

Stake amount, risk value, policy version and required minimum MUST be frozen
before enrollment closes. A later metadata update MUST NOT reduce the required
stake.

### 8.2. Valid reservation and recovery

Before any Judge can reserve stake, the review engine MUST register the case in
the Registry with:

```text
reviewCaseId
caseKind
enrollmentDeadline
requiredCaseStake
poolId
caseStatus = ENROLLMENT_OPEN
```

`reserveCaseStake` MUST reject:

- an unknown case;
- a case outside its enrollment window;
- a case not accepting reservations;
- an amount below the required case stake;
- an amount above available deposited stake.

If a wallet reserves stake but is not enrolled before the enrollment deadline,
any caller MAY call:

```text
releaseUnenrolledCaseStake(reviewCaseId, judge)
```

This transition returns the reservation to the Judge's available balance and
emits `UnenrolledCaseStakeReleased`. Once the Judge is enrolled or assigned,
this recovery path MUST revert; the stake then follows review settlement.

The Registry MUST keep available, reserved, settled and reward balances in
separate integer ledgers. A reservation for a fake case or abandoned
pre-enrollment attempt MUST NOT remain permanently locked.

## 9. Refund and conservation policy

### 9.1. Refund opening

`openRefunds` MUST:

- record the terminal reason;
- set `refundPool = currentEscrow`;
- freeze `refundSnapshot = totalCanonicalContribution`;
- freeze the contributor order and prefix contribution data;
- emit `CampaignRefundsOpened(campaignId, refundPool, refundSnapshot, reason)`.

The refund pool MUST never include already-paid milestone amounts.

### 9.2. Canonical refund entitlement

Only a wallet with a canonical contribution in the frozen snapshot has a
refund entitlement. The backend MUST NOT create or increase this entitlement.

The contract MUST reject a second claim for the same campaign and Backer.
Failed token transfers MUST revert the claim marker and accounting update.

### 9.3. Deterministic rounding allocation

At refund opening, contributors are assigned a canonical index based on their
first contribution ordering. For contributor `i`:

```text
prefix_i        = contribution of all contributors with index <= i
prefix_previous = contribution of all contributors with index < i

claimable_i = floor(refundPool * prefix_i / refundSnapshot)
            - floor(refundPool * prefix_previous / refundSnapshot)
```

The contract MUST use the frozen prefix values, not the caller's claim order.
Therefore:

```text
sum(claimable_i for every contributor) == refundPool
```

Some contributors MAY receive a mathematically valid zero-token entitlement;
that entitlement is not hidden dust because every token unit in the pool is
assigned exactly once by the prefix allocation. A zero-token claim MUST still
be recorded exactly once and MUST NOT permit a later nonzero claim.

Refunds remain pull-claimable without expiry. A campaign can be economically
settled even while an individual entitlement remains unclaimed because the
unclaimed amount is a known canonical liability, not an unowned balance.

### 9.4. Refund invariants

The contract MUST maintain:

- `totalRefundEntitlement == refundPool`;
- `totalRefundClaimed <= refundPool`;
- `totalRefundClaimed + totalUnclaimedEntitlement == refundPool`;
- no Backer can claim more than their frozen entitlement;
- no payout transition can spend refund pool balance.

## 10. Canonical persistent indexer

### 10.1. Event identity

The persistent event identity MUST include:

```text
chainId
contractAddress
transactionHash
logIndex
```

The unique database key MUST reject a duplicate delivery of the same canonical
log. Block number alone is not an event identity.

### 10.2. Atomic event/projection/checkpoint processing

For each log, the indexer MUST execute one database transaction:

```text
BEGIN
  INSERT canonical event identity
  IF inserted:
      apply the event-specific projection transition
  ELSE:
      skip the projection transition
  update stream checkpoint for the processed canonical range
COMMIT
```

The event insert, projection updates and checkpoint update MUST commit or roll
back together. A crash before commit MUST leave no event marker or partial
projection, so replay is safe. A crash after commit MUST cause replay to skip
the already-applied event.

Additive fields such as `paidOut`, `enrolledCount` and `refunded` MUST never be
incremented solely because a handler was called. The inserted-event guard or a
projection event identity MUST prove that the delta is new.

### 10.3. Required persistent event coverage

The persistent indexer MUST project all canonical events that affect a read
model, including at minimum:

| Event group | Required events |
| --- | --- |
| Campaign | `CampaignCreated`, `PublicationEvidenceSubmitted`, `PublicationFinalized`, `ContributionReceived`, `FundingFinalized`, `CampaignRefundsOpened`, `CampaignCompleted` |
| Milestone | `MilestoneEvidenceSubmitted`, `MilestoneRevisionSubmitted`, `MilestonePaid` |
| Challenge | `ChallengeOpened`, `ChallengeResolved` |
| Review | `ReviewCaseCreated`, `JudgeEnrolled`, `JurySnapshotFinalized`, `CourtAssigned`, `VoteCommitted`, `VoteRevealed`, `CourtFinalized`, `ReviewRoundFinalized`, `AppealOpened`, `ReviewRetryOpened`, `FinalRulingEstablished`, `AppealRoundFinalized`, `ReviewCaseSettled` |
| Refund | `BackerRefundClaimed` |
| Judge ledger | `CaseStakeReserved`, `UnenrolledCaseStakeReleased`, `CaseStakeSettled`, `JudgeSlashed`, `JudgeRewardAccrued`, `JudgeRewardClaimed` |

The in-memory projector MAY remain as a pure reducer test fixture, but it MUST
not be treated as proof that PostgreSQL persistence is correct. Persistent
integration tests MUST replay real event payloads through the DB transaction
path.

### 10.4. Projection authority rule

The indexer MAY mark a projection stale or incomplete when events are missing.
It MUST NOT synthesize a payout, refund, final ruling or completion from an
off-chain API request. The read model MUST expose enough canonical event and
checkpoint information to diagnose lag.

## 11. State transition table

Every implementation transition MUST document actor, guard, state write, fund
movement, event, replay guard, failure behavior and postcondition.

| Transition | Caller | Required guard | Result |
| --- | --- | --- | --- |
| `createCampaign` | Any wallet | Exact budget sum and valid commitment | Immutable campaign proposal |
| `finalizeFunding` | Permissionless | Funding deadline or exact goal | `FUNDED` or `REFUNDING` |
| `submitMilestoneEvidence` | Creator | Active milestone and before deadline | New immutable revision and case |
| `expireMilestoneSubmission` | Permissionless | Submission deadline expired | Terminal refund path |
| `finalizeCorrectionFailure` | Permissionless | Correction deadline expired | Terminal refund path |
| `registerReviewCase` | Review engine | New case and frozen risk policy | Registry enrollment opened |
| `reserveCaseStake` | Judge | Registered open case and sufficient stake | Case reservation |
| `releaseUnenrolledCaseStake` | Permissionless | Reservation exists, no enrollment, deadline expired | Available stake restored |
| `finalizeSnapshot` | Permissionless | Enrollment closed and valid seed | Frozen permutation |
| `assignCourt` | Permissionless | Snapshot finalized and court unassigned | Materialized deterministic seats |
| `openRetry` | Permissionless | Explicit `RETRY_ELIGIBLE` status | New retry case or terminal protocol failure |
| `openAppeal` | Eligible Backer or Creator | Valid substantive result, window and bond | New Appeal case |
| `finalizeRuling` | Permissionless | Appeal/review finality conditions | `FINAL_PASS`, `VERDICT_FAIL` or `PROTOCOL_FAIL` |
| `settleCase` | Permissionless external caller | Case final and not settled | Exactly-once Judge settlement |
| `payMilestone` | Permissionless | Final pass, challenge closed, exact budget unpaid | One exact payout |
| `openRefunds` | Permissionless | Terminal campaign path | Frozen refund pool and allocation |
| `claimRefund` | Entitled Backer | Frozen entitlement and not claimed | One exact refund transfer |

## 12. Failure behavior

The protocol MUST fail closed when:

- a valid final PASS is absent;
- the evidence revision does not match the review case;
- court assignment is duplicated or non-unique;
- a Judge has not locked the required stake;
- appeal or challenge finality has not passed;
- escrow or refund pool is insufficient;
- a token transfer fails;
- a duplicate payout, refund or settlement is attempted;
- an indexer event is malformed or not canonical.

No backend outage, missing UI page or stale projection can authorize a fund
movement. All eligible timeout and terminal transitions MUST remain callable by
any wallet.

## 13. Verification requirements

### 13.1. P0-01 regression

Test `test_CannotRetrySubstantivePass` and
`test_CannotRetrySubstantiveFail` MUST prove:

- a valid court result can enter the appeal window;
- `openRetry` reverts after that result;
- the review case identity and provisional result remain unchanged.

### 13.2. P0-02 regression

Test `test_RetryThenFinalSettlementWorks` MUST create a protocol-failure retry
with enrolled Judges, finalize the retry/root flow, and assert:

- every Judge stake is settled once;
- `reviewCaseSettled` is true even with zero slash;
- final ruling does not revert with `CaseAlreadySettled`;
- replaying settlement reverts or no-ops without moving funds twice.

### 13.3. P0-03 regression

Test `test_BudgetMismatchCannotStrandFunds` MUST assert:

- `budgetTotal < goal` reverts;
- `budgetTotal > goal` reverts;
- all successful milestone payouts consume exactly the funded goal;
- no `COMPLETED` campaign has a residual contribution escrow under this policy.

### 13.4. Liveness regressions

Tests MUST cover:

- `test_CreatorInactiveOpensRefundAfterSubmissionDeadline`;
- `test_CorrectionTimeoutOpensRefund`;
- `test_TimeoutIsPermissionless`;
- timeout calls before deadline revert;
- timeout calls after deadline do not require Creator, Admin or Resolver.

### 13.5. Stake regressions

Tests MUST cover:

- `test_EnforceRiskAdjustedMinimumStake`;
- `test_RequiredCaseStakeIsFrozen`;
- `test_UnknownCaseCannotReserveStake`;
- `test_UnenrolledStakeCanBeRecovered`;
- `test_EnrolledStakeCannotUsePreEnrollmentRecovery`.

The tests MUST use at least one case where the floor dominates and one case
where the risk-adjusted amount dominates.

### 13.6. Assignment regressions

`test_AssignmentIndependentOfCallOrder` MUST create identical snapshots and
seeds, assign courts in opposite orders, and assert identical seat addresses.
It MUST also assert three unique Judges per court and no Judge reuse.

### 13.7. Refund regressions and invariants

`test_AllRefundClaimsConsumeSnapshotPool` MUST use contribution and pool values
that produce rounding remainders. It MUST assert:

```text
sum(entitlement) == refundPool
sum(claimed) + sum(unclaimed) == refundPool
```

The same Backer claiming twice MUST revert. Claim order permutations MUST
produce the same entitlement for every Backer.

### 13.8. Review and economic invariants

Foundry invariant tests MUST cover at minimum:

- no unauthorized escrow release;
- no payout above the frozen milestone budget;
- no double payout;
- no double refund;
- no double case settlement;
- no Judge assignment duplication;
- no vote by an unassigned Judge;
- one vote per assigned Judge;
- case stake cannot exceed deposited stake;
- settled stake cannot become locked again;
- `R = P + F + E`;
- total refund entitlement equals the refund pool;
- retry cannot discard a substantive result;
- timeout eventually reaches a caller-triggerable terminal path.

### 13.9. Persistent indexer regressions

Backend integration tests MUST use the real persistent service and database
transaction boundary, not only the in-memory reducer. Required tests include:

- `test_IndexedPayoutReplayIsIdempotent`;
- `test_IndexedEnrollmentReplayIsIdempotent`;
- `test_CrashBeforeCommitReplaysExactlyOnce`;
- `test_PersistentRefundEventsUpdateCampaignProjection`;
- `test_PersistentCompletionEventUpdatesCampaignProjection`;
- `test_MissingOrMalformedEventDoesNotAdvanceCheckpoint`;
- replaying a block range twice produces identical projection values.

### 13.10. Runtime acceptance gate

The local acceptance run MUST use disposable Anvil/PostgreSQL/MinIO state and
at least these wallets:

- Creator;
- two or more Backers;
- three or more Judges;
- one permissionless timeout/settlement caller.

The run MUST demonstrate both a successful milestone payout and a terminal
refund path, compare contract balances with indexed projections, and record
wallet request, mined receipt, canonical event and indexed projection status.

Passing unit tests without this vertical evidence MUST NOT be reported as
full end-to-end acceptance.

## 14. Implementation boundaries

The implementation plan MUST keep these responsibilities separate:

| Component | Responsibility |
| --- | --- |
| `CampaignEscrowVNext` | Campaign commitment, funding, milestone deadlines, payout, challenge and refund accounting |
| `JuryReview` | Case lifecycle, snapshots, deterministic assignment, votes, retry, appeal, finality and Judge settlement |
| `JuryRegistry` | Deposited stake, valid case reservations, unenrolled recovery and settled/reward ledgers |
| Persistent indexer | Canonical event transaction, projection update, checkpoint and replay safety |
| PostgreSQL/API | Metadata, private-file references, indexed reads and stale-state diagnostics |
| React frontend | Wallet transaction lifecycle, evidence workflow and canonical/read-model presentation |

No component may silently take authority assigned to another boundary. In
particular, the backend MUST NOT implement a hidden Resolver by deciding which
review result or financial event is valid.

## 15. Out of scope for this remediation version

- public-chain randomness provider selection;
- real token or public-money deployment;
- unrestricted Judge count beyond the local research cap;
- redesign of the product into multiple tiers or asset types;
- factual truth oracle for evidence;
- Sybil identity resolution;
- marketplace, NFT, shipping or physical fulfilment;
- a new surplus/reserve-budget economy;
- unrelated legacy Resolver migration outside the VNext paths.

## 16. Definition of done for the remediation spec

The implementation is not ready to claim Gate Z until all of the following
are true:

- all ten audit findings have a passing regression test;
- the contract invariants pass with generated stateful sequences;
- assignment results are independent of transaction order;
- risk stake and recovery rules are enforced on-chain;
- refund allocation sums exactly to the pool;
- persistent indexer replay is idempotent and transactionally safe;
- every canonical financial transition is projected;
- local runtime demonstrates payout and refund conservation;
- no Resolver/Admin/backend authority is required for the target flow;
- production/public-chain limitations remain explicitly documented.

