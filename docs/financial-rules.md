# FundTogether Financial Rules — MVP

> **Status:** Approved MVP baseline for implementation
> **Version:** 0.3-draft
> **Updated:** 2026-10-06
> **Related:** [Protocol specification](./protocol-spec.md), [State machine](./state-machine.md)

**2026-10-05 approved amendment:** [MVP case STOP/timeout](./mvp-milestone-completion.md)
uses `refundPool = totalContributed - totalReleased`; bond returns separately to
the organizer, with no slash, fee or caller reward. Each donor claims
`floor(contribution * refundPool / totalContributed)` once; no donor loop or claim
expiry, rounding dust remains in escrow without an administrative sweep. Earlier
misconduct/bond allocation formulas below are deferred post-MVP design.

**Recovery implementation:** new MVP source credits bond to the same organizer
instead of transferring it during terminal transitions. Donor refund availability
does not depend on organizer transfer success. [Financial recovery](./financial-recovery.md)
describes retry, local timeout worker, deployment-reset identity and dust counters.
Combined isolated behavior verification and claim UI/indexing are recorded in
[milestone lifecycle](./milestone-lifecycle.md) and progress. Real browser acceptance
and a separate application MVP deployment remain pending.

**2026-10-06 priority:** [business validation and MVP consolidation](./business-validation-and-mvp-hardening.md).
Baseline accounting is unchanged. The organizer's working capital, the purpose
of retaining a no-slash bond, and the practical costs/limits of refunds need
validation before expansion. MVP bond is not donor compensation or insurance;
STOP/timeout cannot claw back previously released budgets. Atomic bond-return
descriptions below concern the prototype; new MVP uses independent pull credit.

## 1. Accounting principles

All token amounts are integer values in the donation token's smallest unit. The implementation uses Solidity integers and JavaScript/TypeScript `bigint`; floating point is forbidden for financial calculations.

Arc is a network evaluation candidate, not a deployed integration. If selected,
retain ERC20 units (6 decimals) for USDC donation/bond/refund accounting; native
gas units are 18 decimals over the same balance. Gas is a separate expense, not
a deduction from recorded donation or refund entitlement. Direct transactions
need fee reserve; operator gas funds remain separate from escrow/bond. See
[Arc accounting and validation requirements](../v0.2/FundTogether_Arc_Evaluation_v0.1.md).

For the new no-slash MVP, exact-transfer token accounting must preserve funds
per token across all campaigns. Define each campaign's remaining donor custody
as `totalContributed - totalReleased - refundPaid`. Before refund it is future
milestone escrow; after snapshot it is unclaimed entitlements plus retained dust.
The immutable refund pool must not be added again as separate cash custody:

```text
contract token balance >= sum across campaigns using that token of:
  remaining donor custody + locked bond + unclaimed organizer bond credit

at a refund snapshot:
  refundPool = totalContributed - totalReleased
  refundPool = successful refund payouts + unclaimed entitlements + rounding dust
```

With no unsolicited inflows, exact transfers and no other obligations, the
custody inequality is equality. Unsolicited transfers do not create donor,
organizer or administrator withdrawal rights. Every outflow must consume one
explicit obligation; funds of another campaign cannot cover an accounting deficit.

## 2. Variables

For campaign `c`:

```text
G        = funding goal
T        = total accepted contributions
D        = funding deadline
B[m]     = budget of milestone m
B_max    = max(B[m])
BondReq  = required organizer bond
R        = amount released from campaign escrow
P        = refund pool snapshot
C_i      = donor i's contribution weight at snapshot
Claim_i  = amount already claimed by donor i
```

MVP baseline:

```text
G = sum(milestone budgets)
BondReq = max(milestone budgets)
```

Approved on 2026-10-03: the organizer supplies a non-empty ordered budget list.
Every budget must be positive. The contract derives goal and required bond from
that list; neither amount is an independent organizer input. Budgets are fixed
at creation and cannot be edited after approval or publication. Overflow or an
invalid budget reverts the entire creation, including partial storage writes.

This formula assumes sequential milestones and must be re-evaluated if the contract later allows overlapping milestones or multiple active spending requests.

## 3. Contributions and funding

- A contribution must be greater than zero.
- The campaign must be in a fundable state.
- The donation token must be the configured ERC20 token.
- Contributions after the funding deadline are rejected unless the finalization rule explicitly permits them.
- The contract records the contribution and emits `DonationReceived`.
- A contribution cannot be silently changed by backend metadata.

Approved funding rule: accept donations only in `FUNDING` and strictly before the deadline. Reject amounts above the remaining goal; reaching the goal immediately moves the campaign to `FUNDED`.

## 4. Milestone release

**Business interpretation:** activation pays no budget. The organizer performs
work and supplies evidence before settlement pays the committed budget. An
organizer who relies on this escrow to finance that work needs a separately
justified cash-flow model. No advance or vendor payment is authorized by this
document. The v0.2 pre-verification exposure/bond argument must be reassessed
against this reimbursement model; see research questions B02/B03.

The following assigned-verifier and atomic final-bond details describe the
prototype. New MVP uses resolver admission, bounded case recovery and bond
credit; donor budget settlement still requires a successful token transfer.

`activateMilestone` requires the organizer, FUNDED or MILESTONE_SETTLED,
the next sequential index and sufficient locked bond. Activation moves no tokens.
On 2026-10-03 the user accepted the proposed 72-hour default; admin changes are
deferred. submitEvidence stores a nonzero immutable commitment. Admission sets
reviewEnd = verification timestamp + 72 hours.
Submission alone creates a pending version with reviewEnd = 0 and moves no tokens.
Admin assignment/reassignment and verifier accept/reject also move no tokens.
Rejected versions retain their history; organizer may submit a new version.

An eligible donor can challenge strictly before reviewEnd. A challenge blocks
release; the prototype has no challenge exit. New MVP permits only the approved
CONTINUE/RESUBMIT/STOP and timeout paths; slashing remains deferred.
Anyone can settle IN_REVIEW at or after reviewEnd if no challenge was opened.
Settlement transfers exactly the committed budget to the organizer, marks the
milestone SETTLED, increments totalReleased and advances currentMilestoneIndex.
No caller reward or fees are deducted by the protocol.

Final settlement marks COMPLETED and returns the full remaining bond in the
same transaction. A failed release or bond transfer rolls back all transfers
and state changes; the caller can retry. Repeated settlement is rejected.
With exact-transfer tokens, remaining donor escrow = totalContributed - totalReleased;
the bond is a separate obligation. No post-funded refund snapshot is created by
normal settlement. Unsolicited transfers do not increase a milestone payout.

For sequential milestone `m`:

```text
released[m] ≤ B[m]
```

Settlement may release at most the committed budget for that milestone. The contract must not release the next milestone before the previous milestone reaches its terminal settlement state.

The MVP baseline uses release after successful settlement. Controlled withdrawals, vendor payments and partial expense requests are deferred.

## 5. Bond

The organizer locks `BondReq` in the same ERC20 token used for donations. The bond is separate from donor escrow and must be tracked separately in accounting and events.

Normal completion or an approved failure returns the remaining bond according
to the deployment's terminal rule. MVP never allocates bond to donor refunds;
misconduct slashing is a deferred proposal, not an available remedy.

The exact future slash formula is open. No implementation may infer a slash
from a UI status, timeout or arbitrary resolver input. Holding bond alone does
not prove deterrence, compensate donors or establish the truth of evidence.

For cancellation or funding failure before `FUNDED`, the full locked bond returns to the organizer in the same transaction that creates the refund snapshot. Set the recorded bond amount to zero and clear `bondLocked` before transferring. A failed transfer reverts the entire terminal transition, allowing a retry once the token transfer can succeed. No bond slash applies to this path. A terminal campaign cannot lock bond again.

The organizer may cancel in `DRAFT`, `APPROVED` or `FUNDING`, even after the funding deadline. This recovers a bond on an unpublished campaign without requiring resolver approval or publication. With no locked bond, cancellation skips the token transfer and emits no `BondReturned` event. Unpublished campaigns have no accepted donations, so their refund snapshot is zero.

## 6. Refund pool and entitlement

The refund pool is immutable once the contract creates the refund snapshot:

```text
P = amount explicitly allocated for donor refunds
```

At snapshot time, the contract records the contribution weights that are eligible under the campaign's terminal rule. A proportional entitlement can be represented as:

```text
entitlement_i = floor(C_i × P / sum(C_j))
claimable_i    = entitlement_i - Claim_i
```

MVP policy: round down in token base units, keep dust in escrow indefinitely,
allow claims without expiry, and provide no admin sweep or last-claimant bonus.
Let S be successful payouts and U unclaimed entitlements. Then
`P = S + U + D`, where `D = P - sum(entitlement_i)` across all contributors.
`P - S` is not dust while U remains. For N contributing wallets, `0 <= D < N`
base units; a zero-contributor pool is zero. The UI explains this policy without
claiming the overall contract balance is a measured dust amount.

The donor claims only `claimable_i`. A second claim cannot transfer additional funds.

### Implemented pre-funded refund path

Before funding succeeds, no milestone funds have been released. The approved rule simplifies to:

```text
P = T
entitlement_i = C_i
```

`contributions[campaignId][donor]` accumulates successful donations. Cancellation or deadline failure snapshots `refundPool = totalContributed` once; the pool value remains unchanged after claims. Each donor calls `claimRefund(campaignId)` for their full contribution, with `claimedRefund` preventing a second payment. There is no donor loop or rounding in this path, and claims have no expiry.

Bond and unsolicited token transfers are excluded from the snapshot. Refunds go only to the calling donor; organizers, resolvers and deadline-finalization callers cannot redirect them. Claim flags are written before the transfer; a failed transfer rolls them back. OpenZeppelin `ReentrancyGuard` protects fund-moving entry points against token callbacks.

This prototype assumes a standard ERC20 with exact transfers, as provided by MockUSDC. Fee-on-transfer and rebasing tokens are unsupported. A token that persistently rejects the organizer's bond transfer also prevents terminal finalization and donor claims; the approved same-transaction design has no separate bond recovery path yet.

### Implemented evidence/activation failure refunds — 2026-10-04

The user authorized prototype timeout defaults and their non-slashing fallback.
Organizer activation/submission inactivity, or rejection/expiry of the final
allowed evidence version, enters FAILED. The immutable snapshot is:

```text
P = T - R
entitlement_i = floor(C_i * P / T)
```

`claimRefund` uses OpenZeppelin `Math.mulDiv` for full-precision integer
calculation. With R = 0 this preserves exact pre-funded refunds. Contributions
cannot increase after funding completes. Retained prior releases are not
clawed back. Bond is returned separately in the terminal transaction; no slash,
caller reward, verifier fee or unsolicited-token allocation is introduced.
Refunds go only to each calling contributor, once, without expiry or a donor loop.
Zero-rounded entitlements are marked claimed without a zero token transfer.
Rounding dust stays in the contract; there is no admin sweep.

All terminal state/snapshot/bond changes revert if the bond transfer fails.
Each failed donor transfer also rolls back its claim flag. The existing
limitation for permanently blocked organizer transfers remains: atomic bond
return can prevent finalization. Dispute/misconduct allocation and an independent
bond recovery path are still pending in this prototype. These paths have later
regression evidence recorded in progress; this does not remove the atomic-bond
limitation. New MVP separates bond credit from refund availability, with isolated
verification in financial recovery.

## 7. Bond allocation on misconduct — post-MVP

The contract must distinguish:

```text
bond returned to organizer
bond allocated to refund pool
bond retained as unresolved obligation, if explicitly allowed
```

Deferred proposal: a permitted resolver verdict triggers a predefined slash
formula/allocation to the campaign refund pool, capped by the remaining bond.
Resolver input must not arbitrarily choose the amount, percentage or recipient.
MVP has no slash. Future formula/verdict approval is required before introducing
that post-MVP mechanism.

## 8. Rounding and token decimals

- Token decimals are read from configuration or deployment metadata; the contract must not assume six decimals for every ERC20.
- All ratios round down to the smallest token unit unless a different rule is explicitly documented.
- Tests must cover zero remainder, one-unit remainder and large contribution imbalance.
- The protocol must never use a JavaScript number to represent a token amount.

## 9. Financial invariants

The first contract test suite must encode at least:

```text
INV-01  No release exceeds a milestone budget.
INV-02  No milestone settles more than once.
INV-03  No donor claims more than their snapshot entitlement.
INV-04  Bond is separate from donor escrow.
INV-05  Sequential milestones cannot be bypassed.
INV-06  A failed transition does not change balances.
INV-07  Total outflows cannot exceed recorded inflows plus allowed balances.
INV-08  Refund snapshot values do not change after claims begin.
INV-09  A slash cannot exceed remaining bond.
INV-10  A challenge alone does not automatically slash funds.
```

## 10. Recovery decisions and remaining verification before financial freeze

The [reviewed layered verification design](./verification-and-disputes.md) adds
no new payout authority to organizers or verifiers. A timely pending challenge
must hold settlement; only authenticated permitted verdicts can authorize later
financial transitions. A backend "resolved" flag is insufficient. RESUBMIT moves
no money, retains prior hashes and requires a new review round. User-approved
STOP/timeout uses pool C - R, separate bond return and no misconduct slash.

| Case | New MVP implementation | Remaining gate |
|---|---|---|
| Bond transfer refused | Pull credit; donor snapshot independent; false/revert tests and claim UI/indexing pass | Token issuer must permit eventual payout |
| Refund transfer refused | Claim right/counters revert; independent retry/receipt/index tests pass | Issuer restrictions and exact-transfer token qualification |
| No caller at deadline | Permissionless timeout; worker RPC outage/unknown-send/restart tests pass on isolated chain | Fund/run caller continuously; production keeper |
| Chain reset/reorg | Anchored streams and canonical replay/reset/reorg tests pass; fresh MVP instance ID | Restore saved application chain or explicitly plan new deployment |
| Rounding/unclaimed escrow | Floor, O(1) counters; fuzz/claim-order/dust regression passes | Retain unclaimed obligations and dust; no sweep |
| Unexpected inventory | No new rights/sweep; inventory/replacement-guard regression passes | Operator inventory before any deployment replacement |

Verification as of 2026-10-06: 200 contract tests and isolated publication,
refund and [milestone lifecycle](./milestone-lifecycle.md) smokes pass. This
does not upgrade the current prototype or establish real-token/Arc readiness.

Any future dust destination or recipient reassignment needs a separate protocol
decision. Persistent issuer-wide freezes cannot be fixed by a backend flag.
Exact-transfer token qualification remains required.

## 11. Arc financial readiness — TODO

Arc is the preferred production candidate, not an accepted deployment. Retain
ERC20 accounting for donations/bond/refunds; native USDC fees are caller costs
even though the two interfaces share a balance. Unexpected native inflows and
sub-token-unit dust do not create contributor rights.

New MVP separates bond credit from donor refund availability and preserves rights
on failed claims. An issuer can still block a beneficiary/escrow; milestone budget
payout still needs a successful transfer. Compile checks do not establish eventual
liquidity. Local combined tests and claim UI/indexing have recorded evidence;
issuer recovery/custody, target-network and production keeper validation remain
gates before real funds. No admin sweep or substitute
recipient is added. See
[Arc validation plan](../v0.2/FundTogether_Arc_Evaluation_v0.1.md).

