# FundTogether VNext — Protocol Specification V2 (Design Proposal)

> Status: proposed design for review, 2026-10-25. This document does not
> change the current runtime, deployed commitments, or the V1 reference.
> FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md, the current financial policy, and
> the checked-out contracts remain authoritative until this proposal is
> explicitly adopted as a versioned policy.
>
> Scope: sequential milestone funding, fixed-percentage Judge rewards,
> Court 1 plus BackerDAO appeal, and one bounded Court 2. Runtime changes,
> deployment, chain reset, live-parameter changes, and CEAV research changes
> are out of scope for this task.

## 1. Executive decision

V2 changes the unit of funding from one campaign-level goal to an ordered
series of independently funded milestones. The creator freezes every
milestone before opening the campaign. Backers fund only the active milestone;
the contract rejects any amount above that milestone target.

Funding success is custody only. It does not pay the creator. Once the target
is reached, the milestone closes funding, keeps the target in escrow, and
starts evidence review. A canonical Court 1 result opens a BackerDAO window.
ACCEPT keeps that result; APPEAL opens at most one new Court 2. Court 2 may
replace the Court 1 result. A Judge who fails to commit or reveal creates a
Court Reset, not an appeal and not a substantive failure.

Each milestone freezes a Judge reward rate and maximum review reserve before
funding starts. The reward is a percentage of that milestone target for each
Judge, with integer-token rounding. Creator payout is the target less the
maximum reserve, so it cannot be zero or negative.

The existing pure-decentralized boundary remains:

* the Campaign contract owns contribution custody and financial transitions;
* Jury contracts own assignment, votes, resets, appeals and Judge settlement;
* BackerDAO owns only the appeal decision;
* PostgreSQL, MinIO, the API and the UI provide projections and evidence
  access but cannot create a financial outcome.

## 2. Decision register

The labels below prevent a draft assumption from being mistaken for an
approved runtime rule.

### 2.1. Locked decisions carried into V2

| ID | Decision |
| --- | --- |
| L1 | Any wallet may create a campaign proposal. |
| L2 | The product remains one COMICS_ARTBOOK campaign, one STANDARD tier and one DIGITAL_DOWNLOAD PDF. Physical fulfilment, NFT, marketplace, charity and real-money launch remain out of scope. |
| L3 | Creator, Admin, Resolver, backend and database rows cannot approve, reject, pay or refund escrow. |
| L4 | Campaign funds stay in contract escrow until the exact state transition that authorizes payout or refund. |
| L5 | Judge assignment is permissionless and stake-backed. A reference court has three unique Judges and each seat has one vote. |
| L6 | Commit–reveal remains the default vote privacy mechanism. A commitment binds chain, protocol version, campaign, milestone, evidence revision, case, round, court, Judge, vote and salt. |
| L7 | Creator cannot review the creator's own case. Existing same-campaign Backer/Judge conflict rules remain unless V2 explicitly versions a replacement. |
| L8 | Court history is retained: assignments, votes, reveals, reasoning/evidence references, revisions, timestamps and outcomes. |
| L9 | PROTOCOL_FAIL is distinct from VERDICT_FAIL; it is not evidence that the creator or a minority Judge was factually wrong. |
| L10 | A correction revision cannot change the original acceptance criteria or payout amount. |
| L11 | Stake accounting is separate from contribution escrow. A stake transfer into a reward or compensation pool is an explicit inflow. |
| L12 | Integer-safe token amounts and pull-based settlement are required. A submitted transaction is not a successful financial action until its canonical receipt and event are observed. |
| L13 | CEAV-M1 remains an independent research artifact. Its runtime signals, purchased information, trusted audit oracle and high/low effort mechanism are not reintroduced into V2. |

### 2.2. V2 decisions requested by the task

| ID | Decision |
| --- | --- |
| V2-L1 | All milestones are declared before campaign funding opens. |
| V2-L2 | Milestones are funded sequentially. The next milestone cannot open until the previous milestone is PAID. |
| V2-L3 | A milestone has its own target, creator payout budget, Judge reward rate, evidence commitment, submission deadline and funding deadline. |
| V2-L4 | Overfunding is rejected atomically; no contribution can make a milestone balance exceed its frozen target. |
| V2-L5 | A valid Court 1 produces a provisional PASS or FAIL. BackerDAO can ACCEPT or APPEAL; it cannot directly change the verdict. |
| V2-L6 | APPEAL selects three new Judges for one Court 2. A Court 2 Judge cannot be a Court 1 Judge for the same review case. |
| V2-L7 | Missing commit or reveal invalidates that court and triggers reset/reselection. Reset does not consume the one Court 2 allowance. |
| V2-L8 | Judge reward is a fixed percentage of the milestone target for each Judge and is locked before the milestone accepts contributions. |
| V2-L9 | A valid review reward is paid from the milestone frozen review reserve. Unused reserve is refundable to Backers. |
| V2-L10 | No minority-vote slash, retrospective alignment bonus or high/low effort reward is introduced in this runtime version. |
| V2-L11 | Quorum is provisionally assumed to be reached for BackerDAO; this task does not extend the quorum/liveness research. |

### 2.3. Provisional assumptions

| ID | Assumption | Why provisional |
| --- | --- | --- |
| P1 | The percentage denominator is 10,000 basis points and reward rounding uses floor integer division in token units. | The task requires safe rounding but does not name a denominator or dust policy. |
| P2 | The maximum rewardable valid courts per milestone is two: Court 1 and one Court 2. Resets are not rewardable extra courts. | The task gives the two-court example but does not state whether a reset consumes reserve. |
| P3 | A valid court earns the same fixed reward per assigned Judge regardless of PASS or FAIL. An invalid court earns no service reward. | This is the least complex reading of “review hợp lệ”. |
| P4 | A PROTOCOL_FAIL milestone pays no creator amount and refunds remaining milestone escrow after any explicitly accrued valid service reward. | The task distinguishes protocol failure but does not specify reward disposition. |
| P5 | BackerDAO voting is snapshot-based when the DAO window opens; later contributions do not change the ballot. | A stable snapshot prevents weight changing during the window. |
| P6 | V2 DAO applies to milestone cases after a milestone is funded. Publication review occurs before a Backer exists and needs a separate policy decision. | This avoids inventing a pre-funding electorate. |
| P7 | The eligible Judge set is assumed to contain enough non-conflicted, sufficiently staked wallets for every required assignment. | This task does not extend liveness research for an exhausted Judge pool. |

### 2.4. Open issues and implementation blockers

| ID | Issue | Impact | Gate |
| --- | --- | --- | --- |
| O1 | CWQ-1, snapshot, threshold, tie and overflow policy remain proposed. Wallet splitting can increase weight. | Blocking PR4 and full policy adoption; not isolated PR1 funding code. | Approve the named formula, snapshot/caps, threshold/tie rule and explicit Sybil limitation. |
| O2 | Publication has no pre-funding Backer electorate; PUBLICATION_PRE_FUND_V1 is proposed. | Blocking publication integration/user funding, not PR1's Foundry fixture. | Approve pre-funding Court 1 only and bounded correction/deadlines. |
| O3 | Cost coverage and bounded invalid-court duties require approval of CCPS-1. | Blocking PR3; undercollateralized assignment must be impossible. | Freeze reset limits, maximum cost, per-seat collateral and single-total multi-offender allocation. |
| O4 | CCPS-1 proposes a closed cost schedule funded only from offending locked stake. | Blocking PR3 cost/recipient accounting; not a PR1 funding input. | Approve fixed allowances, zero variable reimbursement, recipients and funded claims; never use contribution/reserve funds. |
| O5 | Reasoning and evidence references are required for public audit, but canonical storage and disclosure format is not specified on-chain. | P1 / auditability. A database-only reasoning field cannot be authoritative. | Freeze a signed/off-chain schema and an on-chain content hash/event binding. |
| O6 | Treatment of a Court 2 that is repeatedly reset or reaches PROTOCOL_FAIL is not specified. | P1 / terminal behavior. The system must fail closed without unlimited correction. | Freeze bounded reset/retry transitions and residual refund policy. |
| O7 | DAO-TEMPORAL-1 proposes Court 1 exclusion at DAO open and actual DAO-voter exclusion from later Court 2 selection. | Blocking PR4; future assignment cannot change past votes. | Approve each new restriction separately; preserve locked Court 1/Court 2 isolation and immutable DAO history. |
| O8 | Publication reward funding before any backer contribution is not specified. | P1 / accounting. A nonzero publication reward cannot be charged to a nonexistent milestone pool. | Keep local publication fee zero or define creator-prefunding/external subsidy. |

PR0 closes the documentation disposition without closing a runtime gate by
implication. The authoritative dispositions, proposed values, approval owners
and exact test vectors are maintained in
[PR0_POLICY_FINALIZATION.md](PR0_POLICY_FINALIZATION.md) and
[parameters-v2-policy.md](parameters-v2-policy.md). Any item marked
`PROPOSED_PENDING_APPROVAL` remains blocked for runtime implementation.

### 2.5. PR0 policy package

PR0 preserves every locked decision above and records a concrete candidate for
each O1–O8. The candidate package has three deliberate boundaries:

* BackerDAO remains a two-choice ACCEPT/APPEAL ballot. `CWQ-1` uses an integer
  square-root of the contribution snapshot as the candidate quadratic weight;
  it does not claim to solve wallet splitting or Sybil behavior.
* Publication review is pre-funding, Court 1 only, with no BackerDAO electorate
  and no local milestone reward. A future non-zero publication subsidy requires
  a separate prefunded policy version.
* Court Reset is bounded and separate from appeal. CCPS-1 requires per-seat
  collateral for the maximum cancelled-court cost before assignment. Offenders
  split one cost total from locked stake; the milestone contribution escrow
  and valid-court reserve are not charged. Fixed allowances and recipient rules
  remain pending, with no variable actual-gas reimbursement.

The PR1–PR4 acceptance gates are in
[PR1-PR4_ACCEPTANCE_CRITERIA.md](PR1-PR4_ACCEPTANCE_CRITERIA.md). These files
are policy-review artifacts; they do not imply that the current VNext runtime
implements V2.

## 3. Current repository audit

This audit describes the checkout as found on 2026-10-25. The worktree is
already dirty with unrelated staged and unstaged changes; those changes are
preserved and are not proof of an accepted release.

### 3.1. Implemented or partially implemented VNext slices

| Area | Current evidence | Classification |
| --- | --- | --- |
| Campaign escrow | contracts/src/campaigns/CampaignEscrowVNext.sol creates frozen campaign terms, accepts MockUSDC, tracks contributions, milestone evidence, payout and pro-rata refunds. | Partially implemented VNext slice. |
| Judge registry | contracts/src/jury/JuryRegistry.sol separates deposited, available and case-locked stake, and exposes bounded settlement/reward claims. | Partially implemented VNext slice. |
| Jury review | contracts/src/jury/JuryReview.sol implements enrollment, random permutation, three-Judge courts, commit–reveal, retries, a bond-based appeal and bounded settlement. | Partially implemented VNext slice. |
| Events | contracts/src/interfaces/IVNextEvents.sol contains campaign, contribution, evidence, assignment, vote, retry, appeal, ruling, settlement, payout and refund events. | Current VNext event surface, not V2. |
| Indexer | backend/src/indexer/vnext-indexer.service.ts and vnext-event-projector.ts persist canonical events, projections, assignments and Judge ledgers with idempotency/reorg support. | Implemented projection slice. |
| Evidence | backend/src/modules/campaigns/services/vnext-evidence.service.ts checks canonical hashes, private storage integrity and access based on creator/challenger/Judge projections. | Implemented off-chain evidence slice. |
| API/UI | backend/src/modules/campaigns/controllers/vnext.controller.ts exposes read models and on-chain reconciliation. frontend/src/features/campaigns/vnext/VNextJudgePage.tsx exposes enrollment, commit, reveal, court finalization and reward-claim actions. | Partial read/Judge journey. |
| Tests | Foundry unit, fuzz and invariant suites cover current VNext funding, payout/refund, court assignment, settlement, replay and conservation slices. | Evidence for named slices only. |

### 3.2. Missing or incompatible with V2

| Required V2 behavior | Current checkout finding |
| --- | --- |
| Per-milestone funding target/deadline/contribution ledger | CampaignEscrowVNext has one campaign goal, one campaign fundingDeadline and one contribution ledger. Milestone budgets are payouts, not funding targets. |
| Sequential milestone funding | Funding finalization moves the whole campaign to MILESTONES_RUNNING; it does not open a milestone-specific funding window. |
| Fixed percentage Judge reward | JuryReview uses a risk-adjusted stake and JuryRegistry credits rewards from slash proceeds. There is no frozen judgeRewardRate, maximum two-court reserve or creator payout reduced by that reserve. |
| BackerDAO | No DAO contract, ballot projection, quadratic formula, contribution snapshot, ACCEPT/APPEAL event or DAO finalization path exists. |
| Court 1/Court 2 semantics | Existing openAppeal creates a fresh review round with a bond and allows a configured maximum number of appeal rounds. It is not a single DAO-gated Court 2. |
| Court reset penalties | Invalid/no-reveal cases can retry and stake can settle, but V2 procedural penalty amount, reset identity and multi-offender allocation are absent. |
| Reasoning/evidence references in canonical vote history | Evidence bytes are private/off-chain and vote events contain only vote values and commitments. A canonical reasoning/reference hash schema is not present in the contract event surface. |
| V2 reserve accounting | Current campaign conservation is raised = paidOut + refunded + remaining escrow for contribution custody. Judge rewards are a separate registry/stake flow, not a milestone-funded reserve. |
| Per-milestone DAO/indexer/UI projections | Existing Drizzle tables contain campaign/milestone/review/challenge/Judge projections but no milestone funding ledger, DAO ballot, reset ledger or reserve settlement rows. |
| Publication DAO | Current publication review is created before contributions exist, so new BackerDAO cannot apply without a new electorate policy. |

### 3.3. Historical and research material

Resolver/Admin workflows and older milestone documents under docs/archive/
are historical traceability, not V2 authority.

The research repository at
C:\Users\dell\Desktop\fundtogether_data_analyzing contains CEAV-M1
specifications, implementation, verification scripts, synthetic fixtures and
research reports. Its current boundary is useful for V2 only as a warning:
CEAV-M1 V3.3 is an incentive-neutral, report-sensitive synthetic model with
declared assumptions; it does not model stake, Jury assignment, BackerDAO,
slashing, appeals, correction, escrow or blockchain custody. Its signals,
purchased information, trusted audit oracle and high/low effort variables must
not be copied into V2 runtime.

## 4. Protocol V1 to V2 gap analysis

| V1/current rule | V2 requested rule | Change needed | Risk if left as-is |
| --- | --- | --- | --- |
| One campaign goal and deadline | One target and deadline per sequential milestone | New immutable milestone funding commitment and active-milestone pointer | Backers can fund the wrong economic unit; later payouts can spend earlier funds. |
| Milestone budget means creator payout | Milestone target, creator payout and review reserve are separate | Add fundingTarget, creatorPayoutBudget, judgeRewardRate and maxReviewReserve | Reward reserve is absent and creator payout can be miscomputed. |
| Contribution ledger is campaign-wide | Contribution ledger is milestone-scoped | contribution[campaign][milestone][backer] and milestone totals | Refund attribution and conservation cannot distinguish milestones. |
| Court result can enter appeal by creator/backer call | Court 1 result opens DAO; DAO decides ACCEPT/APPEAL | New DAO case identity and canonical decision event | A single wallet can buy an appeal; no contribution-weighted governance. |
| Multiple review rounds are appeal-like | At most one Court 2; reset is separate | Separate resetId from appealRoundId and exclude prior Judges | Invalid rounds can consume appeal capacity or repeat Judges. |
| Rewards are slash redistribution | Valid Judges receive fixed reward from milestone pool | Reserve and pull settlement ledger | Review service can be unpaid or silently consume Judge stake. |
| Court invalidity has retry behavior | Non-reveal has penalty, reset and re-selection | Freeze penalty/collateral and preserve invalid history | A no-show can grief liveness without a bounded cost. |
| DB mirrors current VNext events | DB projects DAO/reset/reserve history | Additive event and table versioning | UI may show a verdict or reward the chain cannot justify. |

The gap is architectural, not a parameter tweak. Current CampaignEscrowVNext
and JuryReview should be treated as a VNext baseline for a new V2 deployment,
not as an in-place storage-compatible upgrade.

## 5. V2 frozen campaign and milestone model

### 5.1. Campaign commitment

Before the campaign becomes pledgeable, the creator freezes:

* creator and payout wallet;
* token, chain and policy version;
* ordered milestone count;
* every milestone target, payout budget, reward rate and timing policy;
* acceptance-criteria hashes and deliverable identifiers;
* evidence and reasoning disclosure policy;
* applicable Court and DAO policy identifiers;
* a commitment hash covering the complete ordered array and economic manifest,
  with an immutable typed schema/version and full values at campaign creation.

The registry's proposed `FTV2-COMMIT-2` binds reward/reserve/payout, reset
costs/collateral/limits/recipients, DAO/conflicts, publication/correction and
reasoning/evidence policy. No later case, funding window or DAO opening can
fill in missing economics or point the campaign at a changed policy version.
PR1's isolated Foundry fixture may commit complete test-only values without
approving them; it cannot accept user funding or be retrofitted into a funded
campaign. Full adoption requires all committed policies approved/integrated.

The campaign total target is:

~~~text
CampaignTarget = Σ fundingTarget[m]
~~~

CampaignTarget is an informational aggregate. Custody and authorization remain
milestone-scoped. A milestone cannot be opened or funded out of order.

### 5.2. Milestone record

The contract record is immutable except for state, counters and case pointers:

| Field | Meaning | Freeze point |
| --- | --- | --- |
| milestoneId | Ordered zero-based identifier | Campaign creation |
| deliverableCommitment | Hash/reference for deliverable description | Campaign creation |
| acceptanceCriteriaHash | Acceptance standard used by both courts | Campaign creation |
| fundingTarget | Maximum accepted contribution | Campaign creation |
| creatorPayoutBudget | Maximum creator payout after review reserve | Campaign creation |
| judgeRewardRateBps | Fixed percentage per Judge | Campaign creation |
| judgeRewardUnit | Integer reward per Judge in token units | Campaign creation |
| maxReviewReserve | judgeRewardUnit × 3 × 2 | Campaign creation |
| evidenceCommitment | Hash of exact evidence revision | Evidence submission |
| submissionDeadline | Exact time or immutable activation-relative rule | Campaign creation; rule instantiated at activation |
| fundingDeadline | Exact time or immutable activation-relative rule | Campaign creation; rule instantiated at activation |
| financialStatus | Funding, reserve, payout, refund and settlement state | Contract transitions |
| reviewStatus | Court, DAO, reset and final ruling state | Contract transitions |

No later transaction can change fundingTarget, acceptanceCriteriaHash,
creatorPayoutBudget, judgeRewardUnit or the frozen payout wallet.

### 5.3. Reward calculation and safe rounding

The proposed basis-point calculation is:

~~~text
judgeRewardUnit = floor(fundingTarget × judgeRewardRateBps / 10,000)
maxReviewReserve = judgeRewardUnit × courtSize × maxValidCourts
                  = judgeRewardUnit × 3 × 2
creatorPayoutBudget = fundingTarget - maxReviewReserve
~~~

The contract rejects a milestone when:

* judgeRewardRateBps is outside the policy range;
* judgeRewardUnit is zero if policy requires a nonzero reward;
* maxReviewReserve is greater than or equal to fundingTarget;
* creatorPayoutBudget is zero;
* multiplication or addition overflows the token-unit type.

Floor rounding is conservative: it cannot overpay a Judge or make the reserve
larger than the frozen target. Percentage remainder stays in milestone
accounting and is included in the frozen creator budget on FINAL_PASS or in the
remaining refund balance on failure; it is not silently assigned to an
operator. The registry contains the exact vectors and approval status.

## 6. Sequential milestone funding state machine

The active pointer prevents a later milestone from consuming or reserving funds
while an earlier milestone is unresolved.

~~~text
CAMPAIGN_CREATED
      ↓ publication gate (if enabled by campaign policy)
MILESTONE_0_FUNDING_OPEN
      ├── deadline + raised < target
      │       → MILESTONE_FUNDING_FAILED → MILESTONE_REFUNDING
      └── raised == target
              → MILESTONE_FUNDED
              → EVIDENCE_PENDING
              → COURT_1
                   ├── valid provisional verdict → BACKER_DAO
                   │       ├── ACCEPT → FINAL_RULING
                   │       └── APPEAL → COURT_2
                   │                         ├── valid verdict → FINAL_RULING
                   │                         └── invalid → COURT_RESET
                   ├── invalid/no-show → COURT_RESET
                   └── reset limit / timeout → PROTOCOL_FAIL

FINAL_RULING
      ├── FINAL_PASS → JUDGE_SETTLEMENT → MILESTONE_PAYOUT → NEXT_MILESTONE_FUNDING
      ├── VERDICT_FAIL → CORRECTION (bounded) or MILESTONE_REFUNDING
      └── PROTOCOL_FAIL → MILESTONE_REFUNDING

LAST_MILESTONE_PAID → CAMPAIGN_COMPLETED
ANY TERMINAL MILESTONE_FAILURE → CAMPAIGN_REFUNDING_REMAINDER
~~~

Required guards:

1. openMilestoneFunding(m) succeeds only when m is active and every prior
   milestone is PAID.
2. contribute(m, amount) succeeds only in FUNDING_OPEN and when
   raised[m] + amount is at most fundingTarget[m].
3. Reaching fundingTarget[m] closes contributions; it does not pay anyone.
4. Deadline failure refunds confirmed contributions before any review reward.
5. submitEvidence(m, revision) is accepted only after FUNDED and before the
   frozen submission deadline.
6. payMilestone(m) requires canonical final pass, completed Judge settlement,
   no active DAO/appeal/reset, paid[m] false and sufficient escrow.
7. openMilestoneFunding(m+1) is callable only after payMilestone(m) succeeds.
8. Terminal failure refunds remaining escrow for failed and future milestones;
   earlier paid milestones are not rolled back.

## 7. Court, reset and appeal state machine

### 7.1. Court 1

Court 1 freezes the evidence revision, acceptance criteria hash, eligible
Judge snapshot, random seed identifier, required stake and deadlines. The
creator is excluded from the eligible set, and any other same-case conflict
rule is applied before assignment. Exactly three distinct eligible Judges are
assigned. Each Judge independently commits PASS or FAIL with a salt and then
reveals the same vote and salt, together with the required reasoning and
evidence-reference commitment.

~~~text
COURT_1_ENROLLMENT
      ↓ snapshot + collateral coverage guard + random assignment
COURT_1_COMMIT
      ↓ commit deadline
COURT_1_REVEAL
      ├── all three reveal → COURT_1_VALID → PROVISIONAL_PASS/FAIL
      └── any required duty missed → COURT_1_INVALID → RESET_PENDING
~~~

The provisional verdict is a contract result, not a database interpretation.
When all required reveals are valid, the contract immediately opens the
BackerDAO window and freezes contributions, eligibility and prior Court 1
assignment history. Court 2 is not assigned at this point. The contract emits
complete vote/reveal history and the reasoning/evidence reference hash for
each Judge position.

### 7.2. Court Reset

A reset is procedural recovery for an invalid court under the proposed
`CCPS-1` cost schedule:

1. after the original reveal deadline, mark the court INVALID and classify
   each assigned seat once for missed commit and/or valid reveal;
2. atomically debit the pre-reserved offender locks and credit the fixed
   compensation claims; settle costs even if this attempt is terminal;
3. release remaining stake, preserve history and the once-only settlement
   identity, with zero valid-service reward for the invalid court;
4. if the level's reset is still available, randomly draw three new eligible
   Judges, exclude every prior case assignee (and Court 2 DAO voters under
   O7), and lock sufficient fresh collateral before assignment;
5. open a new commit/reveal window with a new courtId and resetId; otherwise
   enter `PROTOCOL_FAIL` without a replacement.

```text
Before assignment:
  resetCostMax = 2D + F
  requiredLockedStake = max(caseStakeRequirement, resetCostMax) per seat
  D >= 0; F >= 3 base units; three independent sufficient reservations

Invalid court with n offenders (1..3):
  totalResetCompensation = (3 - n)D + F
  penalty_i = equal share of this ONE total among offenders
              + deterministic remainder by ascending canonical address
  compliant-seat penalty = 0
  compensation credits = D per compliant seat + F once to finalizer

Valid court (n = 0): totalResetCompensation = 0; no procedural slash
```

The registry defines the exact integer allocation and R1–R10. Fixed D/F
allowances compensate cancelled work/finalization by convention; variable
actual-cost reimbursement is disabled (cap 0), and unprovable damages are
excluded. Every seat must cover sole-offender liability before assignment.
An insufficient lock prevents assignment rather than creating unpaid debt.
Stake reserved elsewhere cannot be reused.

The unsupported percentage slash is replaced by cost coverage. Slash equals
funded compensation credits, kept outside contribution escrow and valid-court
reward reserve. Claims are pull-based and once-only; failed transfers leave
the funded claim retryable without blocking a replacement. An unassigned
timeout creates no assigned-duty claim or debt.

One reset per Court level and two per case are proposed. An invalid replacement
at either level is terminal even if the other level has an unused reset.
At most three invalid settlements are reachable in a milestone case because
Court 1 must become valid before Court 2. D/F, collateral, recipients, caps and
O6 terminal disposition remain `PROPOSED_PENDING_APPROVAL`.

A reset never becomes Court 2, consumes the appeal allowance, reverses a
substantive verdict or justifies minority-vote slashing.

### 7.3. BackerDAO appeal

After valid Court 1, the contract opens a DAO ballot for canonical contributors
to that milestone. The ballot has only two decisions:

| Choice | Effect |
| --- | --- |
| ACCEPT | Close appeal and establish the Court 1 substantive result as final. |
| APPEAL | Finalize DAO, consume the one Court 2 allowance, then randomly assign a new three-Judge review over the same evidence revision and criteria. |

The DAO does not submit PASS or FAIL and cannot directly flip Court 1. Its only
authority is choosing whether Court 2 opens.

PR0 names the candidate contribution-weighted quadratic formula `CWQ-1`:
`effectiveWeight = floor_sqrt(snapshotContributionInTokenBaseUnits)`. The DAO
must bind the formula version, snapshot identity, participation threshold, tie
rule, checked overflow bounds and one-ballot replay guard. The formula and
vectors remain `PROPOSED_PENDING_APPROVAL` until the policy owner signs them
off; a deployment missing any of those fields must reject the DAO policy.
Weights are contribution-based, not identity-based. Wallet splitting can
increase weight and change the outcome (Q6/Q10); CWQ-1 does not guarantee
Sybil resistance, incentive compatibility or collusion resistance.

Under the proposed `DAO-TEMPORAL-1`, DAO opening excludes only Court 1
assignees already recorded, including invalid/replacement history. They are
excluded from eligible votes and the denominator before the immutable snapshot
is sealed. Court 2 assignments do not yet exist and cannot be used as DAO
exclusions. Rejected ballots never mutate the frozen denominator.

After finalized APPEAL, freeze all valid DAO voters (ACCEPT and APPEAL) for
the proposed Court 2 voter exclusion. Assignment cannot retroactively change
eligibility, ballots, weight, participation or the DAO decision. These added
conflict restrictions are pending; Court 1/Court 2 isolation is already locked.

### 7.4. Court 2

Court 2 reuses the exact evidence revision and acceptance criteria and has:

* three new unique Judges;
* no Judge who occupied any Court 1 seat for the case, including invalid and
  replacement attempts (locked isolation);
* selection only after finalized DAO APPEAL, with exclusion of all actual
  valid DAO voters under the proposed O7 restriction, also on replacement;
* a separate court/pool identity;
* its own commit/reveal deadlines and history;
* authority to establish final substantive PASS or FAIL.

Court 2 may replace the provisional Court 1 result and becomes the source of
the final substantive verdict. Only one Court 2 is permitted per case. If
Court 2 is invalid, use reset; do not create another appeal round. Failure to
find eligible candidates follows the approved bounded timeout/protocol-failure
path, never erasure of past DAO votes or ad hoc relaxation of conflicts.

## 8. Financial accounting model

### 8.1. Ledgers

Use separate logical ledgers (reserve and creator budget are allocations of
contribution escrow, not additional assets):

1. Contribution escrow: canonical Backer contributions for that milestone.
2. Review reserve: frozen maximum for valid Court 1/Court 2 service rewards.
3. Creator payout: frozen creator payout budget.
4. Judge stake: Judge collateral, never counted as Backer contribution.
5. Invalid-court compensation: debited offender stake and fully funded D/F
   claims, outside contribution escrow and valid-service Judge rewards.

One physical escrow contract is acceptable, but logical sub-balances must make
it impossible to promise one token to both a creator and a Backer.

### 8.2. Conservation

For milestone m:

~~~text
Raised_m = CreatorPaid_m + JudgePaid_m + Refunded_m + EscrowRemaining_m
ResetSlashCollected = ResetCompensationPaid + ResetCompensationUnclaimed
~~~

CCPS-1 moves offending locked stake only into the separate funded compensation
ledger. It is never a milestone inflow, contribution, valid-service reward or
Backer refund. Judge stake deposits/withdrawals remain in JuryRegistry; reserve
and creator allocations are not counted a second time as assets.

`JudgePaid_m` includes valid-service funds irrevocably isolated into a funded
Judge claim ledger at settlement, including unclaimed earned rewards. A later
withdrawal reduces that ledger, not milestone escrow a second time. Refunds
exclude earned funded obligations even when no Judge has withdrawn yet;
unearned reserve remains refundable. The funded service amount cannot also
be promised to Backers:

~~~text
JudgePaid_m = JudgeRewardClaimed_m + JudgeRewardUnclaimed_m
~~~

Mandatory bounds:

~~~text
0 <= CreatorPaid_m <= creatorPayoutBudget_m
JudgePaid_m <= maxReviewReserve_m
CreatorPaid_m > 0 implies finalOutcome_m == FINAL_PASS
paid[m] is true at most once
refundClaimed[m][backer] is true at most once
rewardClaimed[case][judge] is true at most once
~~~

### 8.3. Required settlement examples

For fundingTarget 1,000, Judge reward rate 1%, court size 3 and two valid
courts:

~~~text
judgeRewardUnit       = 10
maxReviewReserve      = 60
creatorPayoutBudget   = 940
~~~

* Court 1 valid PASS, DAO ACCEPT: creator 940, Court 1 Judges 30, Backers
  receive unused reserve 30.
* DAO APPEAL, Court 2 valid PASS: creator 940, both courts receive 60.
* DAO APPEAL, Court 2 valid FAIL: creator 0, both courts receive 60, Backers
  receive remaining 940.
* Funding fails before review: creator 0, Judge reward 0, every confirmed
  contribution is refundable.
* A reset invalidates a court: no service reward for that invalid court; its
  procedural penalty follows the frozen policy and cannot exceed locked stake.

### 8.4. Refunds

Refund entitlements use the milestone contribution snapshot after earned
obligations are isolated. Claims are pull-based, idempotent and tied to the
canonical contributor address. Rounding dust uses a deterministic
prefix or equivalent total-conserving allocation and never depends on claim
order.

For a failed funding window, RefundPool_m equals Raised_m and no review reward
is created. For terminal reviewed failure:

~~~text
RefundPool_m = Raised_m - CreatorPaid_m - JudgePaid_m
~~~

`RefundPool_m` is evaluated from the remaining escrow after already-authorized
payments. Unused reserve is therefore already included in the expression and
must not be added again. Reset penalties are a separate stake inflow and are
not silently mixed into Backer refunds.

## 9. Actor × action × authorization matrix

| Actor | Action | Required on-chain guard | Financial authority |
| --- | --- | --- | --- |
| Any wallet | Create campaign | Valid frozen commitment, complete milestone array and policy hash | None until a later transition |
| Creator | Open/submit evidence | Active milestone, creator wallet, deadline, exact criteria and revision | Cannot pay self directly |
| Backer | Fund active milestone | Funding open, canonical token transfer, amount at most remaining target | Own contribution claim only |
| Backer | Vote in BackerDAO | Eligible snapshot contributor under approved prior-assignment conflict policy, one ballot, DAO window, valid formula | ACCEPT/APPEAL only |
| Judge | Deposit/lock stake | Registry balance and case eligibility | Own stake collateral only |
| Judge | Commit/reveal | Assigned seat and correct case/court/deadline/commitment | No direct payout authority |
| Permissionless caller | Finalize funding, court, DAO, payout or refund | Frozen deadline and state guards | Cannot redirect another claim |
| Jury contract | Assign/reset/settle | Configured registry, random seed, unique Judge and limits | Frozen reward/penalty claims only |
| Campaign contract | Pay creator or refund Backer | Canonical result, reserve settlement and exact milestone state | Sole contribution-custody authority |
| Backend/indexer | Index, reconcile and expose reads | Canonical receipt/event and idempotent stream | No authority |
| Evidence service | Store and serve evidence | Authenticated access and hash/integrity match | No authority |
| Admin/operator | Maintain infrastructure | Operational credentials only | No financial/review authority |

## 10. Economic attack and failure scenarios

| Scenario | Expected V2 behavior | Residual risk / required test |
| --- | --- | --- |
| Contribution races at target | ERC20 transfer and target guard are atomic; excess reverts | Fuzz exact boundary and concurrent-looking calls. |
| Creator changes criteria | Criteria hash and payout budget are immutable; new bytes need a revision under same criteria | Replay and altered-criteria tests. |
| Judge collusion/bribery | Commit–reveal hides votes before reveal; it does not claim truthfulness | Accepted research limitation. |
| Judge non-reveal griefing | Court invalid, reset selected, offending stake penalized by frozen rule | O3 blocks implementation until penalty/cap are fixed. |
| Multiple offending Judges | Split one CCPS-1 cost total among offenders; pre-lock each seat for sole-offender liability | R1–R10, exact bound and no duplicate compensation. |
| Court 1 minority is factually correct | Majority/DAO/Court 2 can still choose the other result; no automatic minority slash | Preserve as limitation. |
| Backer whale or wallet splitting | Contribution-based CWQ-1 can reward splitting; no Sybil/incentive/collusion guarantee | Q6/Q10; O1 gates PR4, no new Sybil research. |
| Judge votes in own DAO appeal | Snapshot known Court 1 conflicts; exclude actual DAO voters from later Court 2 if approved | Temporal O7 tests; future assignments cannot alter past votes. |
| Court 2 reverses Court 1 | Settlement consumes Court 2 final result; Court 1 history remains immutable | Both reversal directions. |
| Invalid Court 2 | Reset, no second appeal, no substantive result from invalid court | Reset identity and appeal counter tests. |
| Duplicate payout/reward/refund | Per-milestone, per-case and per-claim flags prevent double spend | Invariant and race tests. |
| Token transfer failure | Revert state change; claim remains retryable | Reverting/fee-on-transfer token tests. |
| Stale or reorged indexer | UI exposes submitted/mined/canonical/indexed stages; chain is authority | Replay/reorg and no DB-only payout tests. |
| Evidence unavailable | Review cannot claim evidence-ready; timeout follows frozen policy | Availability/timeout tests. |
| Reset cost exceeds locked stake | Reject policy/assignment before obligations exist; never truncate promised compensation or borrow escrow | CCPS-1 collateral proof; O3/O4 gate PR3. |

## 11. Backend, frontend and indexer impact

### 11.1. Backend/API

The backend adds read and transaction-preparation surfaces only:

* milestone funding progress, remaining target and funding deadline;
* reserve breakdown: target, creator payout, reward unit, max reserve, accrued,
  claimed and refundable;
* DAO snapshot, ballot window, formula version, vote receipt and final choice;
* Court 1/Court 2/reset history, assignments, vote/reveal status,
  reasoning/reference hashes and settlement state;
* requested, submitted, mined, canonical and indexed wallet transaction stages.

SIWE identifies a wallet session. It does not create BackerDAO weight or grant
review authority. The API must never accept a client verdict or financial
amount as authoritative.

### 11.2. Frontend

The UI must expose:

~~~text
MILESTONE FUNDING → FUNDED → EVIDENCE → COURT 1 → DAO ACCEPT/APPEAL
→ COURT 2 or FINAL → JUDGE SETTLEMENT → PAYOUT/REFUND → NEXT MILESTONE
~~~

Required views are the active funding panel, reserve/payout ledger, DAO ballot
with formula version and snapshot timestamp, Court 1/Court 2 history,
reset/penalty status and canonical transaction status.

### 11.3. Indexer and storage

The indexer must be additive and idempotent. New projections are required for
milestone funding, milestone contributions, review reserves, BackerDAO ballots
and votes, court history and resets, Judge reasoning references, reward claims
and procedural penalties.

Evidence bytes and reasoning documents remain off-chain. Their canonical hash,
case identity, revision and access policy are indexed from events; PostgreSQL
cannot establish a verdict or payment.

## 12. Canonical V2 events

V2 should retain current event identity fields and add:

* CampaignCreated(campaignId, termsHash, policyVersion)
* MilestoneFundingOpened(campaignId, milestoneId, target, deadline)
* MilestoneContributionReceived(campaignId, milestoneId, backer, amount, cumulative)
* MilestoneFundingFinalized(campaignId, milestoneId, successful, raised)
* MilestoneRewardPolicyFrozen(campaignId, milestoneId, rateBps, rewardUnit, maxReserve, creatorPayout)
* MilestoneEvidenceSubmitted(campaignId, milestoneId, revision, evidenceHash, criteriaHash, caseId)
* CourtAssigned(caseId, roundId, courtId, resetId, judgeOne, judgeTwo, judgeThree)
* VoteCommitted(caseId, roundId, courtId, resetId, judge, commitment)
* VoteRevealed(caseId, roundId, courtId, resetId, judge, vote, reasoningHash, referenceHash)
* CourtFinalized(caseId, roundId, courtId, resetId, outcome, validity)
* CourtReset(caseId, resetId, previousCourtId, replacementCourtId)
* CourtInvalidated(caseId, courtId, attemptIndex, offenderCount, compensationTotal)
* JudgeProceduralPenalty(caseId, courtId, attemptIndex, judge, amount)
* ResetCompensationAccrued(caseId, courtId, attemptIndex, recipient, amount)
* BackerDaoOpened(caseId, snapshotId, formulaVersion, deadline)
* BackerDaoVoteCast(caseId, voter, choice, effectiveWeight)
* BackerDaoFinalized(caseId, choice, snapshotWeight, acceptWeight, appealWeight)
* AppealOpened(caseId, court2CaseId)
* FinalRulingEstablished(caseId, outcome, sourceCourt)
* JudgeRewardAccrued(caseId, milestoneId, judge, amount, reserveRemaining)
* JudgeRewardClaimed(caseId, judge, amount)
* MilestoneReserveRefunded(campaignId, milestoneId, amount)
* MilestonePaid(campaignId, milestoneId, creator, amount)
* MilestoneRefundsOpened(campaignId, milestoneId, pool, snapshot)
* BackerRefundClaimed(campaignId, milestoneId, backer, amount)

The exact ABI is a deliverable of each consuming implementation after its
scoped policy approvals. Invalid-court compensation events use the unique
attempt identity even when terminal invalidity creates no new resetId.

## 13. Contract decomposition and compatibility

| Component | V2 responsibility |
| --- | --- |
| CampaignEscrowV2 | Frozen campaign/milestone terms, sequential funding, contribution ledgers, reward reserve ledger, creator payout, milestone refund and terminal state. |
| JuryRegistryV2 | Judge stake deposit, available/locked balances, case collateral, procedural penalty bounds and reward claims. |
| JuryReviewV2 | Court 1, Court 2, commit–reveal, assignment uniqueness, resets, final ruling and Judge service reward authorization. |
| BackerAppealDAO | Contribution snapshot, formula-versioned ACCEPT/APPEAL ballot and one final DAO decision per Court 1 case. |
| V2Indexer | Canonical event consumption and projections; no financial inference from PostgreSQL. |

This is a logical decomposition, not a claim that new contracts already exist.
Current VNext contracts are not storage-compatible with per-milestone funding
or DAO state. Existing campaigns and review cases remain on their original
policy; a V2 deployment should be a new deployment identity and indexer stream.
A migration of live balances requires a separately approved, audited bridge or
is out of scope.

## 14. Research boundary

The proposed runtime does not claim to solve truthful voting, factual
correctness, evidence quality, Sybil resistance, stake concentration,
collusion, bribery, liveness under unavailable Judges or failed randomness,
BackerDAO formula quality before O1, high-effort information acquisition or
ground-truth verification.

Candidate research direction:
Cost and Decision Quality of DAO-Governed Randomized Jury Appeals in Sequential
Crowdfunding.

Potential baselines are single Court, random appeal and DAO-governed appeal.
Metrics include false approval/rejection, appeal rate, review cost, settlement
latency, decision accuracy and pool efficiency. These are research proposals,
not runtime acceptance claims.

CEAV-M1 results may inform research framing and negative-boundary language.
They do not authorize a signal, purchased-information, trusted-audit or
high/low-effort mechanism in FundTogether V2.

## 15. Incremental implementation plan

No step below is authorized by this task to modify runtime code. Each step is a
future, independently reviewable pull request after policy gates pass.

| PR | Deliverable | Required tests/gates |
| --- | --- | --- |
| 0 | Publish V2 candidate identity, O1–O8 dispositions, scoped approval gates and complete commitment schema | [PR0 policy record](PR0_POLICY_FINALIZATION.md), [registry](parameters-v2-policy.md), exact DAO vectors and arithmetic overflow vectors |
| 1 | Add isolated Foundry funding fixture: complete immutable terms/identity, targets, active pointer, deadlines, contribution ledger and no-overfunding | Ordering, exact target, funding-failure refund and failed-transfer tests; no dependency on PR4 numeric approval or user funding |
| 2 | Add fixed Judge reward policy, reserve accounting, creator payout budget and pull settlement | Exact numeric examples, conservation invariant and reward/remainder/dust tests |
| 3 | Add Court reset identity, procedural penalty and bounded replacement selection | Missing commit/reveal, one/two/three offender, collateral bound and reset-not-appeal tests |
| 4 | Add BackerAppealDAO with frozen quadratic formula and one Court 2 | Snapshot, one ballot, formula/overflow, ACCEPT/APPEAL, tie/quorum and no-overlap tests |
| 5 | Bind Court 1/Court 2 evidence revision, reasoning/reference hash and final ruling to CampaignEscrowV2 | Replay, changed criteria, wrong revision, reversal and protocol-fail tests |
| 6 | Add idempotent V2 indexer schema, events, reorg handling and projections | Event replay, duplicate logs, reorg rollback and projection-vs-chain reconciliation |
| 7 | Add backend reads and Creator/Backer/Judge UI journeys | SIWE binding, transaction lifecycle, no DB-only authority, accessibility and recovery tests |
| 8 | Run disposable local Anvil acceptance and security/invariant review | Foundry unit/fuzz/invariants, backend/frontend suites, clean deployment identity and conservation report |

## 16. Test matrix and acceptance criteria

| Requirement | Minimum evidence |
| --- | --- |
| All milestones frozen before funding | Contract test rejects missing arrays, unequal lengths, zero targets and post-open mutation |
| Sequential funding | State-machine tests prove only active milestone accepts contributions |
| No overfunding | Fuzzed contribution boundary and concurrent-looking calls |
| Fixed reward reserve | Deterministic token-decimal, floor-rounding, reserve-cap and payout-positivity vectors |
| Court 1 validity | Three unique Judges, required reveals and invalid court never becoming a verdict |
| Court reset | CCPS-1 R1–R10, pre-assignment coverage, one compensation total, terminal invalidity settlement, fresh Judges and reset not Court 2 |
| DAO governance | Approved formula version, snapshot, one ballot, quadratic vectors, threshold/tie policy and ACCEPT/APPEAL only |
| Court 2 isolation | Random assignment after finalized APPEAL, no Court 1 overlap, proposed actual-voter exclusion, unchanged past DAO votes and at most one appeal |
| Final settlement | Court 1 ACCEPT and Court 2 PASS/FAIL reproduce exact accounting examples |
| Protocol failure | No creator payout, no minority slash and residual refund per adopted policy |
| Conservation | Per-milestone and campaign roll-up invariants with explicit inflow/outflow identities |
| Claim uniqueness | Duplicate payout, reward and refund calls cannot spend twice |
| Authority | Unauthorized creator/Judge/DAO/backend calls revert; database edits do not change chain |
| Evidence integrity | Bytes match canonical hash; unavailable evidence cannot be shown as accepted |
| Indexing | Canonical events are idempotent/reorg-safe; projections never override chain reads |
| Research boundary | No CEAV signal/X/high-effort/trusted-audit field appears in V2 runtime or ABI |

Each implementation PR is gated only by its consumed policy fields; see the
[dependency matrix](PR1-PR4_ACCEPTANCE_CRITERIA.md#dependency-matrix). PR1's
Foundry-only funding fixture has no direct dependency on CWQ-1, DAO thresholds
or reset costs. It must seal complete test terms, cannot fabricate PAID or
open M2, and cannot accept user funding. Full V2 campaign adoption requires
all committed policies approved/versioned and integrated conservation/state-
machine tests passing before any contribution is enabled.

## 17. Compatibility risks

* Storage/ABI: per-milestone funding and DAO state cannot be appended safely to
  current VNext storage without a dedicated upgrade design.
* Economic commitments: current VNext campaigns treat milestone budgets as
  payouts and have no fixed Judge reserve; existing campaigns cannot be
  reinterpreted under V2.
* Review history: existing appeal rounds and V2 Court 2 differ; indexers must
  preserve old round semantics and add V2 fields rather than relabel events.
* Token custody: moving fixed rewards from campaign escrow to Judge registry
  introduces a token-flow edge requiring authorization and conservation proof.
* Frontend assumptions: current UI exposes direct openAppeal, payMilestone and
  Judge reward claims; V2 gates actions on DAO, reset and reserve state.
* Publication: a pre-funding publication case has no BackerDAO electorate; this
  is a policy boundary, not a UI omission.
* Indexer schema: current projections lack milestone funding, DAO, reset and
  reserve rows; migration must be additive and deployment-scoped.

## 18. Conclusion

The current checkout demonstrates a meaningful pure-decentralized VNext slice,
but it does not implement the requested sequential milestone funding,
BackerDAO appeal, single Court 2, Court Reset penalties or fixed percentage
Judge reward reserve. Those differences affect custody, authorization, state
identity and accounting; UI labels or database projections cannot solve them.

This document is a design proposal and audit, not a compatibility or deployment
claim. PR0 supplies concrete pending policy candidates and scoped approval
gates. PR1 can be prepared as an isolated funding fixture from locked funding
decisions; PR2/PR3/PR4 still require their financial/reset/DAO approvals. No
runtime implementation or live financial parameter change is authorized by
this remediation.
