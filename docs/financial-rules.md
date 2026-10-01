# FundTogether Financial Rules — MVP

> **Status:** Approved MVP baseline for implementation
> **Version:** 0.3-draft
> **Updated:** 2026-10-02
> **Related:** [Protocol specification](./protocol-spec.md), [State machine](./state-machine.md)

## 1. Accounting principles

All token amounts are integer values in the donation token's smallest unit. The implementation uses Solidity integers and JavaScript/TypeScript `bigint`; floating point is forbidden for financial calculations.

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
BondReq = max(milestone budgets)
```

This formula assumes sequential milestones and must be re-evaluated if the contract later allows overlapping milestones or multiple active spending requests.

## 3. Contributions and funding

- A contribution must be greater than zero.
- The campaign must be in a fundable state.
- The donation token must be the configured ERC20 token.
- Contributions after the funding deadline are rejected unless the finalization rule explicitly permits them.
- The contract records the contribution and emits `ContributionReceived`.
- A contribution cannot be silently changed by backend metadata.

The exact rule for a goal reached before the deadline remains an open contract parameter: either finalize immediately or allow funding until the deadline. The selected rule must be consistent across state machine, UI and tests.

## 4. Milestone release

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

1. Goal-reached-before-deadline finalization rule.
2. Exact normal-failure refund pool composition.
3. Exact misconduct slash formula and resolver payload.
4. Dust destination after proportional refund rounding.
5. Treatment of unexpected token transfers into the contract.

