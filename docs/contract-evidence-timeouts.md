# Evidence timeout and recovery defaults

**2026-10-05 amendment:** [MVP milestone completion](./mvp-milestone-completion.md)
keeps these prototype activation/evidence/admission limits, but new MVP deployment
uses the existing resolver instead of assigned verifier admission. Case response
and resolution add fixed 7-day windows; STOP/timeout uses the same no-slash
unreleased-escrow refund and separate bond return. The prototype details below
do not imply that old deployed campaigns acquired the new case exits.

Date: 2026-10-04. The user authorized reasonable, testable prototype defaults.
These values are Solidity constants, not admin-editable durations. Existing
deployments would need redeployment; no upgrade or live deployment is claimed.

## Timing and transitions

| Stage | Default | Start | Expiry action |
|---|---|---|---|
| Activate milestone | 7 days | Funding reaches goal, or previous milestone settles | Anyone calls `finalizeMilestoneTimeout` -> FAILED |
| Initial evidence | 30 days | Milestone activation | Same timeout action -> FAILED |
| Admission | 72 hours | Each submission, including assignment time | Anyone calls `expireSubmission` for exact current version |
| Correction | 7 days | Rejection or explicit expiry of version 1/2 | Resubmit before deadline, otherwise FAILED |
| Donor challenge review | 72 hours | Verifier acceptance | Existing challenge/settlement rules |

At most 3 submissions per milestone. Rejection or expiry of version 3 enters
FAILED. Expired admissions also consume a version: an unavailable verifier can
therefore end a campaign after bounded retries, without attributing misconduct
to the organizer. Admin may assign another eligible verifier within the original
deadline; reassignment does not reset it. This availability trade-off is explicit.

Actions require `timestamp < deadline`; timeouts require `timestamp >= deadline`.
A deadline alone changes no storage: someone must submit a timeout transaction.
There is no automatic acceptance or release. Correction time begins when the
reject/expiry transaction executes, not retroactively at the admission deadline.

The appended FAILED and EXPIRED enum values preserve existing numeric values.
Submission hashes, reviewer decisions and per-version admission deadlines remain
stored. Expiry records EXPIRED, leaving verifier identity/time and reason empty;
it does not invent a verifier rejection. Every retry needs a new assignment.

## Financial behavior

Donors own the unreleased escrow; the organizer owns the separately recorded
bond. Current or future milestone budgets are never paid by a timeout. Anyone
can execute an eligible timeout, but cannot choose beneficiaries or amounts.
Final rejection is authorized by the assigned active verifier and triggers only
the predetermined failure rule, with no arbitrary payout or slash input.

```text
refundPool = totalContributed - totalReleased
donor entitlement = floor(contribution * refundPool / totalContributed)
```

OpenZeppelin Math.mulDiv avoids multiplication overflow. Pre-funded refunds
remain exact because totalReleased is zero. Claims are individual, once only,
with no expiration. Zero-rounded claims mark the claim without transferring zero.
Rounding dust stays in the contract; unsolicited tokens never enter the pool.
There is no donor loop, timeout bounty, fee, slash or clawback of earlier releases.

Terminal state, snapshot and bond return are atomic and guarded against reentry.
If bond transfer fails, the complete terminal action reverts and can be retried;
if a donor transfer fails, that claim flag reverts. A permanently blocked bond
recipient can still prevent finalization, matching the existing atomic design.
Independent bond recovery is pending. Terminal state guards prevent repeated
finalization; claim flags prevent repeated refunds.

## Verification scope

The initial compilation-only slice and readiness review (128 passing tests,
one outdated test failing) are retained in PROJECT_PROGRESS.md as history.
On 2026-10-04, the rejection-history test was corrected to the approved
MAX_SUBMISSIONS limit and its distinct intermediate/terminal financial outcomes.
Production contract code and financial rules were not changed.

The new [timeout suite](../contracts/test/unit/FundTogether/FundTogetherTimeout.t.sol)
contains 24 tests, including ten fuzz tests. The full Foundry suite passed
153 tests across 12 suites with zero failures/skips, using
`forge test --summary --fuzz-runs 1024`; each of its 14 fuzz tests ran 1,024 cases.

Verified cases include:

- Deadline-minus-one/exact/plus-one activation, evidence, admission and correction.
- Expiry without an assigned verifier and delayed execution starting a fresh
  correction window; reassignment/revocation without extending admission.
- Fresh assignments, retained hash/status/deadline/decision history, mixed
  rejection/expiry sequences through version 3, and old-version rejection.
- Terminal failure events, bond recipient, snapshot and repeated-action guards;
  accepted/challenged evidence and completed campaigns cannot use these timeouts.
- All four terminal paths after partial release, two-donor proportional refunds
  in either claim order, rounding/zero claims, unexpected tokens and isolation.
- Failed bond/claim transfers with rollback and retry, and token callbacks
  attempting nested timeout/refund calls during bond return.

The failed-bond tests confirm an existing recovery limitation: a permanently
blocked organizer recipient prevents the atomic terminal action and therefore
prevents opening donor refunds. Separate bond recovery is still TODO. Passing
these unit/fuzz tests does not establish production token compatibility,
deployment, browser interaction or integrated event indexing.

Use deadline getters and Foundry time advancement rather than lowering production
constants for tests. Challenge screening, resolver committee/quorum, appeals,
misconduct/slash and CHALLENGED exit remain separate pending slices.
