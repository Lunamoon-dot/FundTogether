# VNext PR0 — Acceptance Criteria for PR1–PR4

These gates are the minimum evidence required for the first four runtime PRs.
They are Foundry-first. Each PR requires approval for the policy it consumes;
complete campaign adoption remains a separate gate. Pending values can be
explicit test fixtures, not authority for user funding. A green test against
the current VNext contracts does not satisfy a V2 gate unless the test names
the V2 deployment identity and state transition.

## Dependency matrix

| Slice | Direct approval / specification gate | Does not block isolated implementation |
| --- | --- | --- |
| PR1: funding fixture | Immutable complete commitment identity, targets, sequential pointer, deadlines, canonical contribution ledger, no-overfunding and exact funding-failure refund | PR4 CWQ-1/threshold/conflicts and PR3 reset prices; no DAO/reset/reward execution in PR1 |
| PR2: financial accounting | Reward rate/range, denominator, reserve, creator payout, valid-reward accrual, refund and rounding/dust policy | DAO weighting and reset cost amounts |
| PR3: Court Reset | CCPS-1 eligible costs, collateral reservation, allocation/recipients, reset limits, procedural failure and O6 terminal policy | DAO weight formula; integration uses the accepted PR2 accounting |
| PR4: BackerDAO / Court 2 | CWQ-1, snapshot/caps, participation threshold, zero-weight/tie rule, time-ordered conflicts and random Court 2 assignment | Publication O2/O8 and reasoning O5 gate their consumers; integrated Court 2 depends on PR2/PR3 |
| Usable campaign / user funding | All campaign-committed policies approved, complete typed manifest/hash frozen at creation, publication/evidence gates and integrated custody/settlement verified | No missing-policy or later-fill exception |

All new CCPS-1, CWQ-1 and DAO-TEMPORAL-1 choices remain
`PROPOSED_PENDING_APPROVAL`. This matrix permits preparing PR1's isolated
Foundry slice; this PR0 remediation implements no PR1 runtime files.

## Shared gates for PR1–PR4

- [ ] Every financial action is authorized by the contract state machine; API,
  UI and PostgreSQL projections cannot create a financial result.
- [ ] All money is integer token base units with checked arithmetic and
  `SafeERC20` failure rollback.
- [ ] Submitted, mined, canonical and indexed transaction states remain
  distinct.
- [ ] Every event carries the V2 policy/deployment identity where needed, and
  replaying the same canonical log cannot double-credit a ledger.
- [ ] Existing VNext campaigns are not migrated or reinterpreted.

## PR1 — Per-milestone funding

**Purpose:** add immutable milestone targets, ordered activation, deadlines and
contribution ledgers.

### Smallest safe PR1 slice

Use a new V2 deployment identity and a Foundry-only fixture. Add only the
immutable complete campaign/milestone commitment, active-milestone pointer,
funding deadline, per-milestone contribution ledger, exact-target guard and
funding-failure refund snapshot. Keep reward settlement, Court/DAO, indexer
projections and UI out of PR1. This slice proves custody and ordering before
any reviewer or creator payout path can move funds. The fixture uses
`fundtogether-vnext-v2-pr1-funding-fixture` and a complete explicit test
manifest with immutable hash/schema version. It cannot accept user funding or
be promoted into a funded campaign by attaching economic parameters later.

### Contract/state tests

- [ ] Campaign creation rejects empty milestone arrays, unequal field arrays,
  zero targets, invalid deadlines and a commitment hash that does not cover the
  complete ordered array and complete policy manifest. Reject missing policy
  identity, schema version, mandatory economics or a mutable registry alias;
  tests pin a typed encoding and distinguish fixture data from approved policy.
- [ ] Every immutable reward, reset, DAO/conflict, publication and evidence
  field/hash is sealed at creation, including exact deadline or relative-time
  rules. Attempts to attach/change economics after creation revert.
- [ ] Only the active milestone accepts contributions; a later milestone and a
  previously paid/failed milestone revert.
- [ ] `raised + amount <= fundingTarget` is checked atomically; exact-boundary
  funding succeeds and any over-target amount reverts without a partial token
  transfer.
- [ ] Repeated contributions from one Backer sum correctly; a replayed
  canonical event or transaction identity cannot double-credit the projection.
- [ ] Funding success closes the contribution window but does not pay the
  creator or open the next milestone. PR1 cannot fabricate PASS or mark a
  funded milestone PAID; M2 remains closed. M1 successful payout activation
  is tested at integration with accepted review/settlement, not a PR1 bypass.
- [ ] Funding deadline failure opens the exact contribution refund snapshot and
  creates no review reward.
- [ ] Unauthorized creator/backend/database calls cannot advance the active
  pointer or alter a contribution.

### Fuzz/invariant gates

- [ ] Fuzz contribution amounts around zero, exact target and target + 1.
- [ ] Prove per milestone `raised <= fundingTarget` and sequential activation.
- [ ] Prove token transfer failure leaves state, totals and refund entitlement
  unchanged.

## PR2 — Reward, reserve and settlement accounting

**Approval gate:** reward/range, reserve, payout, refunds, floor rounding and
canonical-address dust allocation. DAO/reset parameters do not gate isolated
accounting tests. Test outcome fixtures do not authorize live verdicts.

**Purpose:** freeze the per-milestone percentage, reserve and creator payout.

### Contract/state tests

- [ ] Implement the registry formula with floor token-unit rounding and reject
  overflow, zero reward when disallowed, reserve `>= target`, or zero creator
  payout.
- [ ] Reproduce vectors V1–V8 from `parameters-v2-policy.md` exactly.
- [ ] A valid Court 1 or Court 2 pays the same fixed reward per assigned Judge
  for PASS and FAIL; an invalid court pays zero service reward.
- [ ] Court 1 ACCEPT settles one court; Court 1 APPEAL plus valid Court 2 settles
  two courts; Court 2 reversal changes only the final substantive outcome.
- [ ] FINAL_PASS pays the frozen creator budget at most once. Any failed or
  protocol-failed outcome pays the creator zero.
- [ ] Unused reserve and any remaining escrow are refundable exactly once; no
  reserve unit is counted both in `JudgePaid` and `Refunded`.
- [ ] Freeze refunds before Judges withdraw their earned rewards: `JudgePaid`
  already includes the irrevocably funded unclaimed reward ledger. Refunds
  exclude earned obligations; a later reward withdrawal creates no second
  milestone debit.
- [ ] Judge reward, creator payout and Backer refund claims are pull-based and
  duplicate calls cannot spend twice.

### Invariant gates

- [ ] For every milestone: `Raised = CreatorPaid + JudgePaid + Refunded +
  EscrowRemaining`. The independent reset ledger proves
  `ResetSlashCollected = ResetCompensationPaid + ResetCompensationUnclaimed`;
  reset stake is never a milestone inflow or refund.
- [ ] `JudgePaid <= maxReviewReserve`, `CreatorPaid <= creatorPayoutBudget`,
  and `CreatorPaid > 0` implies `FINAL_PASS`.
- [ ] Failed ERC20 transfers revert the state transition and keep the claim
  retryable.

## PR3 — Court Reset and procedural penalties

**Approval gate:** CCPS-1 cost scope/D/F, case stake requirement, recipients,
allocation, one reset per level/two per case and O6 terminal behavior.

**Purpose:** make invalid courts recoverable, bounded and financially explicit.

### Contract/state tests

- [ ] Missing commit or reveal marks the court invalid; it cannot become PASS,
  FAIL, DAO-final or a creator payout.
- [ ] Before every original/replacement assignment, all three seats reserve
  `requiredLockedStake = max(caseStakeRequirement, resetCostMax)`, with
  `resetCostMax = 2D + F`, checked arithmetic, D >= 0 and F >= 3 base units.
  An insufficient lock or collateral already reserved elsewhere rejects
  assignment; deposited-but-unavailable stake cannot satisfy the guard.
- [ ] At the original reveal deadline, each missing Judge is counted once for
  missing commit and/or valid reveal. Reproduce R1–R10 from the registry,
  including one, two and three offenders, exact collateral, repeated resets
  and no misconduct. Valid minority votes pay no procedural penalty.
- [ ] `totalResetCompensation = (3-n)D + F` for n > 0, otherwise 0.
  `penalty_i` divides this one total among offenders by canonical address;
  remainder allocation is deterministic, every offender pays >= 1 base unit,
  and the sum equals the single compensation amount within each lock.
- [ ] Atomic settlement debits offender locks, credits D per compliant seat
  and F once to the successful finalizer, then unlocks the remaining stake.
  Invalid-court valid-service reward is zero; cancellation compensation and
  valid replacement reward use separate ledgers.
- [ ] Reset compensation is sourced only from the reset pool and cannot debit
  milestone contribution escrow or `maxReviewReserve`.
- [ ] Replacement court has a new `courtId` and `resetId`, three unique Judges,
  no prior case Judge overlap, and preserved invalid-court history.
- [ ] One Court 1 reset and one Court 2 reset are allowed. A replacement
  invalidity at either level becomes `PROTOCOL_FAIL`, even if the other
  level's reset is unused. Settle that terminal invalid court's costs exactly
  once; no further replacement or appeal opens.
- [ ] Reproduce the reachable two-reset R6 path (36 compensation) and terminal
  R8 path (69 compensation); at most three invalid settlements per milestone
  case, with fresh independently sufficient locks at each assignment.
- [ ] Reset never increments the Court 2 allowance and never reverses a valid
  substantive verdict.

### Invariant/authorization gates

- [ ] Reset count is bounded in fuzz tests and cannot wrap.
- [ ] A caller cannot select replacement Judges, change penalty values, or
  claim a reset payment twice.
- [ ] `ResetSlashCollected = ResetCompensationPaid + ResetCompensationUnclaimed`
  and all claims are fully funded when credited. Zero/insufficient collateral
  rejects assignment, not a later unpaid liability; no assignment means no
  assigned-duty compensation claim.
- [ ] Variable actual-cost reimbursement is disabled (cap 0); fixed D/F cannot
  be replaced by caller invoices, gas-price claims or unprovable damages.
- [ ] Duplicate/concurrent invalidation and claim attempts cannot double slash
  or compensate. A finalizer also eligible for D gets only its two distinct
  components once each. Failed token transfer leaves the funded claim
  retryable without blocking a replacement.
- [ ] Milestone accounting is unchanged by reset compensation; earned valid
  replacement rewards still consume at most the original two-court reserve.

## PR4 — BackerAppealDAO and one Court 2

**Approval gate:** CWQ-1, snapshot/caps/checked arithmetic, threshold, empty-
electorate/tie rule, DAO-TEMPORAL-1 conflicts and Court 2 assignment. New
conflict exclusions remain pending; Court 1/Court 2 isolation stays locked.

**Purpose:** implement the approved contribution-weighted quadratic policy and
the DAO gate for a single Court 2.

### DAO tests

- [ ] The snapshot is immutable and includes only confirmed contributions before
  DAO opening; later contributions do not change weight.
- [ ] `CWQ-1` reproduces Q1–Q10 exactly with integer square root, checked sums,
  per-wallet cap and no floating point.
- [ ] Each eligible wallet casts one `ACCEPT` or `APPEAL`; duplicate ballots,
  invalid formula versions and replayed ballot events are rejected/idempotent.
- [ ] The approved participation threshold and tie rule are tested; APPEAL is
  the only path that opens Court 2.
- [ ] At DAO opening there is no Court 2 assignment. Under the approved
  conflict policy, freeze all prior Court 1 assignees (including invalid/
  replacement history) and exclude them from both eligible ballots and
  `W_total`. Rejected ballots do not mutate that denominator or escrow rights.
- [ ] Q6 and Q10 prove split-wallet advantage with equal total contribution;
  Q10 changes ACCEPT into APPEAL at full participation. Document that weights
  are contribution-based, with no Sybil, incentive-compatibility or collusion-
  resistance claim.
- [ ] Use checked integer cross-products for participation; zero eligible
  weight, unmet threshold and a tie follow the approved ACCEPT default.
- [ ] The DAO cannot submit PASS/FAIL or directly pay a creator/Backer.

### Court 2 and settlement tests

- [ ] Court 2 assignment is random and occurs only after DAO finalized APPEAL.
  It has three new unique Judges, no Court 1/prior case assignee overlap, the
  same evidence revision/criteria and a separate pool/court identity.
- [ ] Under the approved proposed restriction, exclude **all actual valid DAO
  voters**, ACCEPT and APPEAL, from Court 2 and its replacement. A non-voting
  Backer is not excluded by that restriction alone.
- [ ] Record the DAO snapshot, ballots, weights, denominator and finalized
  decision before Court 2 selection; all remain identical afterward. No
  retrospective vote invalidation or denominator adjustment is permitted.
- [ ] If conflicts exhaust eligible Court 2 candidates, use the approved
  timeout/protocol-failure path; never erase ballots, reopen DAO or relax
  conflicts. ACCEPT opens no Court 2.
- [ ] At most one Court 2 can open; Court 2 invalidity follows PR3 reset and
  terminal rules.
- [ ] Court 2 PASS and FAIL reproduce the exact PR2 settlement vectors and keep
  Court 1 history immutable.
- [ ] When publication is integrated under approved O2/O8, cases use
  `PUBLICATION_PRE_FUND_V1`: no BackerDAO electorate, no milestone reward and
  no retrospective snapshot. This integration is not a PR1 fixture gate.

## PR gate and evidence format

Each PR must link its Foundry test output, invariant output, policy version and
event/state transition table. A PR is not accepted because a database
projection or UI label looks correct; the canonical contract receipt and event
must prove the transition.
