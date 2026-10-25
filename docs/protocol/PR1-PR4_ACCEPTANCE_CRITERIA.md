# VNext PR0 — Acceptance Criteria for PR1–PR4

These gates are the minimum evidence required for the first four runtime PRs.
They are Foundry-first and assume the policy registry is approved before code
can use pending values. A green test against the current VNext contracts does
not satisfy a V2 gate unless the test names the V2 deployment identity and
state transition.

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
immutable milestone commitment, active-milestone pointer, funding deadline,
per-milestone contribution ledger, exact-target guard and funding-failure
refund snapshot. Keep reward settlement, Court/DAO, indexer projections and UI
out of PR1. This slice is small enough to prove custody and ordering before
any reviewer or creator payout path can move funds.

### Contract/state tests

- [ ] Campaign creation rejects empty milestone arrays, unequal field arrays,
  zero targets, invalid deadlines and a commitment hash that does not cover the
  complete ordered array.
- [ ] Only the active milestone accepts contributions; a later milestone and a
  previously paid/failed milestone revert.
- [ ] `raised + amount <= fundingTarget` is checked atomically; exact-boundary
  funding succeeds and any over-target amount reverts without a partial token
  transfer.
- [ ] Repeated contributions from one Backer sum correctly; a replayed
  canonical event or transaction identity cannot double-credit the projection.
- [ ] Funding success closes the contribution window but does not pay the
  creator or open the next milestone.
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
- [ ] Judge reward, creator payout and Backer refund claims are pull-based and
  duplicate calls cannot spend twice.

### Invariant gates

- [ ] For every milestone: `Raised + ExplicitInflows = CreatorPaid +
  JudgePaid + Refunded + EscrowRemaining + ExplicitOutflows`.
- [ ] `JudgePaid <= maxReviewReserve`, `CreatorPaid <= creatorPayoutBudget`,
  and `CreatorPaid > 0` implies `FINAL_PASS`.
- [ ] Failed ERC20 transfers revert the state transition and keep the claim
  retryable.

## PR3 — Court Reset and procedural penalties

**Purpose:** make invalid courts recoverable, bounded and financially explicit.

### Contract/state tests

- [ ] Missing commit or reveal marks the court invalid; it cannot become PASS,
  FAIL, DAO-final or a creator payout.
- [ ] Each missing Judge pays the registry formula from locked case stake;
  non-offending stake is released; invalid-court service reward is zero.
- [ ] One, two and three offending Judges produce the exact sum of independent
  penalties; no penalty exceeds the offender's locked stake.
- [ ] Reset compensation is sourced only from the reset pool and cannot debit
  milestone contribution escrow or `maxReviewReserve`.
- [ ] Replacement court has a new `courtId` and `resetId`, three unique Judges,
  no prior case Judge overlap, and preserved invalid-court history.
- [ ] One Court 1 reset and one Court 2 reset are allowed; a further invalid
  path becomes `PROTOCOL_FAIL` and does not create another appeal.
- [ ] Reset never increments the Court 2 allowance and never reverses a valid
  substantive verdict.

### Invariant/authorization gates

- [ ] Reset count is bounded in fuzz tests and cannot wrap.
- [ ] A caller cannot select replacement Judges, change penalty values, or
  claim a reset payment twice.
- [ ] If the reset pool is empty or insufficient, no hidden debt or Backer
  charge is created.

## PR4 — BackerAppealDAO and one Court 2

**Purpose:** implement the approved contribution-weighted quadratic policy and
the DAO gate for a single Court 2.

### DAO tests

- [ ] The snapshot is immutable and includes only confirmed contributions before
  DAO opening; later contributions do not change weight.
- [ ] `CWQ-1` reproduces Q1–Q9 exactly with integer square root, checked sums,
  per-wallet cap and no floating point.
- [ ] Each eligible wallet casts one `ACCEPT` or `APPEAL`; duplicate ballots,
  invalid formula versions and replayed ballot events are rejected/idempotent.
- [ ] The approved participation threshold and tie rule are tested; APPEAL is
  the only path that opens Court 2.
- [ ] Court 1 Judges and Court 2 Judges are rejected from the same-case DAO
  under the approved conflict policy.
- [ ] The DAO cannot submit PASS/FAIL or directly pay a creator/Backer.

### Court 2 and settlement tests

- [ ] Court 2 has three new unique Judges, no Court 1 overlap, the same evidence
  revision and acceptance criteria hash, and a separate pool/case identity.
- [ ] At most one Court 2 can open; Court 2 invalidity follows PR3 reset and
  terminal rules.
- [ ] Court 2 PASS and FAIL reproduce the exact PR2 settlement vectors and keep
  Court 1 history immutable.
- [ ] Publication cases use `PUBLICATION_PRE_FUND_V1`: no BackerDAO electorate,
  no milestone reward and no retrospective snapshot.

## PR gate and evidence format

Each PR must link its Foundry test output, invariant output, policy version and
event/state transition table. A PR is not accepted because a database
projection or UI label looks correct; the canonical contract receipt and event
must prove the transition.
