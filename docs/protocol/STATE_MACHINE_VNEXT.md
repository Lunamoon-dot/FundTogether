# FundTogether VNext — Canonical State Machine

> **Status:** Design contract for the pure-decentralized implementation. The
> current checkout is not evidence that these states are implemented.

**Reference:** [Protocol Specification V1](FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md)
**Parameters:** [Parameter Registry V1](parameters-v1.md)

## 1. Identifier model

Every review and financial action must bind these identifiers:

| Identifier | Meaning | Must be immutable after |
| --- | --- | --- |
| `campaignId` | Campaign escrow instance | creation |
| `milestoneId` | Ordered milestone in a campaign | funding starts |
| `commitmentHash` | Frozen campaign/milestone terms | funding starts |
| `acceptanceCriteriaHash` | Acceptance criteria | funding starts |
| `evidenceRevision` | Monotonic evidence submission version | case enrollment |
| `reviewCaseId` | One review decision for one revision | case creation |
| `roundId` | Base/retry/appeal round | round creation |
| `courtId` | One group of three Judge seats | assignment |
| `judgeAddress` | Wallet assigned to one seat | assignment |
| `policyVersion` | Exact rules used for the case | case creation |
| `randomnessRequestId` | Seed request/receipt identity | snapshot |

## 2. Campaign machine

```text
CREATED
  └─ freeze commitment → FUNDING

FUNDING
  ├─ deadline + goal not reached → GOAL_FAILED → REFUNDING
  └─ goal reached → FUNDED → MILESTONES_RUNNING

MILESTONES_RUNNING
  ├─ next milestone available → MILESTONE_ACTIVE
  ├─ all milestone payouts complete → COMPLETED
  └─ terminal failure → REFUNDING_REMAINDER

REFUNDING / REFUNDING_REMAINDER
  └─ refund pool opened → REFUND_SETTLED when all claims are settled or expired
```

`FUNDED` and `MILESTONES_RUNNING` never authorize Creator payout by themselves.

## 3. Milestone and review machine

```text
PENDING
  └─ submit evidence revision → SUBMITTED

SUBMITTED
  └─ enroll window opens → REVIEW_ENROLLMENT

REVIEW_ENROLLMENT
  ├─ snapshot + assignment → BASE_REVIEW
  └─ insufficient Judges after deadline → RETRY_PENDING

BASE_REVIEW
  ├─ all courts valid → PROVISIONAL_RULING
  ├─ invalid court / missing reveal → RETRY_PENDING
  └─ tie → RETRY_PENDING

PROVISIONAL_RULING
  └─ appeal window → APPEAL_WINDOW

APPEAL_WINDOW
  ├─ valid appeal → APPEAL_REVIEW → APPEAL_WINDOW
  └─ no valid appeal → FINAL_RULING

FINAL_RULING
  ├─ FINAL_PASS → PAYABLE → CHALLENGE_WINDOW → PAID
  ├─ VERDICT_FAIL → CORRECTION or TERMINAL_FAILURE
  └─ PROTOCOL_FAIL → TERMINAL_FAILURE
```

`FINAL_PASS` is the only substantive result that can enter payout eligibility.
`VERDICT_FAIL` is a factual protocol verdict that may receive bounded correction;
`PROTOCOL_FAIL` is an operational failure and does not prove Creator fault.

## 4. Review case machine

| State | Entry guard | Exit action | Terminal/failure behavior |
| --- | --- | --- | --- |
| `REVIEW_ENROLLMENT` | Evidence revision exists and deadline not expired | Freeze eligible pool | Retry or `PROTOCOL_FAIL` |
| `ASSIGNED` | Snapshot and seed finalized | Store exactly 3 unique seats per court | Invalid assignment blocks round |
| `COMMIT` | Assigned Judge and before commit deadline | Store commitment hash | Duplicate/late commit reverts |
| `REVEAL` | Valid commitment and before reveal deadline | Store vote and salt | Wrong reveal reverts; missing reveal invalidates V1 court |
| `PROVISIONAL_RULING` | All required courts valid | Start appeal window | Tie/retry never becomes PASS |
| `APPEAL_WINDOW` | Provisional result exists | Open non-overlapping appeal or finalize | Expiry finalizes last provisional result |
| `FINAL_RULING` | Appeal ended or final appeal settled | Authorize correction/payout/terminal path | Creator/Admin/backend cannot rewrite |
| `SETTLED` | Judge reward/slash calculation complete | Unlock or expose claim | Duplicate settlement reverts |

## 5. Judge seat machine

```text
AVAILABLE_STAKE
  └─ enroll + reserve case stake → CASE_LOCKED

CASE_LOCKED
  └─ court assignment → ASSIGNED

ASSIGNED
  └─ commit before deadline → COMMITTED

COMMITTED
  └─ valid reveal before deadline → REVEALED

REVEALED
  └─ final ruling → FINAL_SETTLEMENT

FINAL_SETTLEMENT
  ├─ vote consistent with substantive ruling → REWARD/UNLOCK
  ├─ vote opposite substantive ruling → SLASH/REWARD/UNLOCK
  └─ protocol failure/no-show policy → NO_WINNER_SETTLEMENT/UNLOCK
```

No-show cash penalty on `PROTOCOL_FAIL` is not assumed; it requires a parameter
decision. A Judge cannot withdraw locked stake until all related obligations and
settlement windows are complete.

## 6. Transition contract

Every implementation transition must document:

```text
transition name
actor / permissionless caller rule
preconditions
state written
funds moved, if any
event emitted
deadline / timeout
replay guard
failure behavior
postcondition / invariant
```

The minimum financial transitions are:

| Transition | Funds | Required canonical guard |
| --- | --- | --- |
| `createCampaign` | none | Frozen commitment and valid publication result |
| `contribute` | Backer → escrow | Campaign is in `FUNDING` |
| `finalizeFunding` | none | Deadline/goal rule |
| `submitEvidence` | none | Next milestone and unchanged criteria |
| `finalizeReview` | Judge settlement only | Valid court/round aggregation |
| `openAppeal` | Appeal bond/fee | Provisional ruling and deadline |
| `releaseMilestone` | escrow → frozen Creator wallet | `FINAL_PASS`, challenge closed, unpaid |
| `openRefunds` | none | Funding/terminal failure and snapshot |
| `claimRefund` | escrow → canonical Backer | Unclaimed pro-rata entitlement |
| `claimJudgeSettlement` | Judge ledger | Exactly once after final settlement |

## 7. State-machine acceptance tests

- [ ] Every state has at least one legal transition and one invalid transition.
- [ ] Every terminal state rejects payout, correction and new review unless the
  state table explicitly allows it.
- [ ] A duplicate transaction cannot move the same escrow or Judge position
  twice.
- [ ] A caller can trigger eligible timeout/terminal transitions without Admin.
- [ ] An indexer can derive state from canonical events without guessing.
- [ ] The UI does not render `PAID`, `REFUNDED`, `FINAL_PASS` or `SLASHED` from
  submitted transaction status alone.
