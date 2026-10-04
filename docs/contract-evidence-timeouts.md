# Evidence timeout and recovery defaults

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

The initial slice was verified by compilation only. A subsequent 2026-10-04
readiness review ran the existing suite: 128 tests passed and one failed. The
failing test, `testFuzzRejectedVersionsRetainHistory`, assumes up to eight
rejections and unchanged escrow/bond balances, conflicting with the new
three-submission limit and terminal failure/bond return. No timeout-specific
tests were added during the review; runtime financial safety remains unverified.
Before integration,
verify deadline-minus-one/exact/plus-one boundaries; all three rejection/expiry
rounds; reassignment without extension; old-version decisions; partial-release
refunds across multiple donors; rounding; failed transfers; callbacks; repeated
finalization/claims; and isolation of campaigns sharing one token.

Use deadline getters and Foundry time advancement rather than lowering production
constants for tests. Challenge screening, resolver committee/quorum, appeals,
misconduct/slash and CHALLENGED exit remain separate pending slices.
