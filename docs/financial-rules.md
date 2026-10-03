# FundTogether Financial Rules — MVP

> **Status:** Approved MVP baseline for implementation
> **Version:** 0.3-draft
> **Updated:** 2026-10-03
> **Related:** [Protocol specification](./protocol-spec.md), [State machine](./state-machine.md)

## 1. Accounting principles

All token amounts are integer values in the donation token's smallest unit. The implementation uses Solidity integers and JavaScript/TypeScript `bigint`; floating point is forbidden for financial calculations.

Arc is a network evaluation candidate, not a deployed integration. If selected,
retain ERC20 units (6 decimals) for USDC donation/bond/refund accounting; native
gas units are 18 decimals over the same balance. Gas is a separate expense, not
a deduction from recorded donation or refund entitlement. Direct transactions
need fee reserve; operator gas funds remain separate from escrow/bond. See
[Arc accounting and validation requirements](../v0.2/FundTogether_Arc_Evaluation_v0.1.md).

The contract must preserve conservation of funds:

```text
escrow balance
+ released amount
+ refund obligations
+ bond balance
+ approved slash allocation
= token inflows - token outflows
```

The exact bookkeeping representation may differ between contract modules, but every transfer must belong to one explicit obligation.

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
- The contract records the contribution and emits `ContributionReceived`.
- A contribution cannot be silently changed by backend metadata.

Approved funding rule: accept donations only in `FUNDING` and strictly before the deadline. Reject amounts above the remaining goal; reaching the goal immediately moves the campaign to `FUNDED`.

## 4. Milestone release

`activateMilestone` requires the organizer, FUNDED or MILESTONE_SETTLED,
the next sequential index and sufficient locked bond. Activation moves no tokens.
On 2026-10-03 the user accepted the proposed 72-hour default; admin changes are
deferred. submitEvidence stores a nonzero immutable commitment and sets
The admission implementation now sets reviewEnd = verification timestamp + 72 hours.
Submission alone creates a pending version with reviewEnd = 0 and moves no tokens.
Admin assignment/reassignment and verifier accept/reject also move no tokens.
Rejected versions retain their history; organizer may submit a new version.

An eligible donor can challenge strictly before reviewEnd. A challenge blocks
release; disputed outcomes, slashing and recovery remain unimplemented.
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

Normal completion or an approved normal failure returns the remaining bond according to the terminal rule. Misconduct may allocate an explicitly bounded slash amount to the refund pool.

The exact slash formula is still an open item. Until it is specified, no implementation may infer a slash amount from a UI status or from an arbitrary resolver input.

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

The contract must define how any rounding dust is retained or allocated. MVP default: dust remains in the contract and is visible as unallocated dust; it is not silently transferred to an admin.

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

The proportional formula above remains design guidance for later post-funded outcomes, not implemented behavior.

## 7. Bond allocation on misconduct

The contract must distinguish:

```text
bond returned to organizer
bond allocated to refund pool
bond retained as unresolved obligation, if explicitly allowed
```

MVP recommendation: any slash amount selected by an authorized resolver is transferred to the campaign refund pool, capped by the remaining bond. The exact cap and resolver outcome encoding must be approved before contract freeze.

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

## 10. Open items before financial freeze

The [reviewed layered verification design](./verification-and-disputes.md) adds
no new payout authority to organizers or verifiers. A timely pending challenge
must hold settlement; only authenticated permitted verdicts can authorize later
financial transitions. A backend "resolved" flag is insufficient. RESUBMIT moves
no money, retains prior hashes and requires a new review round. Exact terminal
slash/refund formulas and timeout effects remain unapproved and unimplemented.

1. Refund composition for failures after funding or milestone releases.
2. Recovery for persistent token transfer failures.
3. Exact misconduct slash formula and resolver payload.
4. Dust destination after proportional refund rounding.
5. Treatment of unexpected token transfers into the contract.

## 11. Arc financial readiness — TODO

Arc is the preferred production candidate, not an accepted deployment. Retain
ERC20 accounting for donations/bond/refunds; native USDC fees are caller costs
even though the two interfaces share a balance. Unexpected native inflows and
sub-token-unit dust do not create contributor rights.

Token blocklist/failed transfers can prevent settlement/refund. Current atomic
rollback protects recorded state on a revert but does not provide eventual
recovery. Define and validate a recovery policy before real funds; do not add an
admin sweep over donor escrow or bond. See
[Arc validation plan](../v0.2/FundTogether_Arc_Evaluation_v0.1.md).

