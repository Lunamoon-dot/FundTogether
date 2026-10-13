# Editions R3 — approved local financial policy v1

Status: **APPROVED LOCAL POLICY**, 2026-10-13. The user selected option 1
(approve the entire local proposal), adding that Resolver decides and community
participates in checking the detailed requests. R2–R5 now have automated local
acceptance and main-runtime verification; exact evidence and limitations are in
[PROJECT_PROGRESS.md](../PROJECT_PROGRESS.md). No public/real-asset launch is
authorized. Financial policy version: `editions-local-escrow-v1`.

## Approved local policy

| Gate | Approved local rule |
| --- | --- |
| D02 | No advance payment. Contract holds all pledges until the reviewed PDF is available and the release challenge period has ended. This requires creators to fund production themselves. |
| D03 | Creator cannot review their own campaign/release. Primary Resolver reviews and resolves disputes; distinct backup may take over after 7 days of primary inactivity. Neither may change the payout wallet or frozen terms. A dispute unresolved for 30 days causes refund eligibility before any payout. |
| D04 | Goal failure, cancellation before payout, no accepted PDF by frozen release deadline plus 7 days, or unresolved dispute timeout: full refund from intact escrow. Accepted release has a 7-day challenge period. A timely open dispute blocks payout. After payout, no automatic contract refund; downloadable availability and issue reporting remain separate from acceptance. |
| D05 | Overfunding allowed until funding deadline; all accepted pledges follow the same frozen price, terms and refund rule. No fabricated stock limit. |
| D07 | Exactly one fixed-price pledge per wallet per campaign; one nontransferable entitlement per canonical pledge log. No quantities, gifting, transfers or additional paid tiers. Multiple wallets are not represented as unique humans. |
| D08 | No automatic download expiry or unilateral revocation of a valid entitlement. Local availability only; no promise of permanent hosting. Orphaned/reverted/refunded pledges cannot download. No DRM claim. |
| D09 | Zero platform fee. Full eligible escrow goes to the frozen, verified creator wallet. |
| D10 | Local chain 31339 and MockUSDC only. No public chain, real-asset or legal launch acceptance. |
| D11 | Existing technical duration 1–60 days and positive uint256 base-unit amounts; fixed price cannot exceed goal. Release window must end after funding deadline. No additional business price/goal cap. |
| D12 | Frozen terms cannot change. Creator may cancel before payout, opening full refunds. Material revision requires a new campaign. An accepted PDF is immutable; resolving a broken file cannot silently replace its hash. |

## Custody and migration consequence

Backers own refundable claims while funds are in escrow. Only contract transitions
may authorize refunds or the final creator payout. Failed token transfers revert
state; a claim/payout cannot execute twice. Permissionless deadline transitions
provide an exit if creator and reviewers disappear. The released PDF and download
logs never manufacture an on-chain payment or claim.

This policy differs from the existing advance/spending/proportional-refund
contract. It needs a separately versioned contract/deployment, ABI,
indexer stream and conservation/timeout/refund tests. Existing campaign obligations
and their supported contract/API paths must remain intact.

## Resolver and community review

Resolver makes campaign, release and dispute decisions, with the stated backup
and timeout rules. Community members can inspect public frozen PDF terms, content
outline, budget, evidence plan, hashes and decision outcomes, and submit attributable
comments/reports for Resolver review. Comments are not votes, payment approvals or
proof that a file was delivered. Private identity evidence, object keys and final
PDF remain private; comments cannot grant download entitlement.

Backers can submit a timely on-chain challenge before payout. Detailed requests
in this model are content/release/evidence review requests; advance spending is
not reintroduced. Upholding a release challenge stops the campaign and opens
refunds for the whole unpaid escrow; dismissing it keeps the release challenge
deadline intact. Community reports support review without granting arbitrary
accounts power to lock escrow indefinitely.

The digital slice passed before R5 retirement. A separate user instruction
authorized reconciliation and physical removal; guarded migration 0005 preserves
the audited historical fixtures and all financial rows. This financial policy
alone does not authorize deleting historical obligations.

## Implemented contract transitions and accounting (local prototype)

`FundTogetherEditions.sol` is separate from `FundTogetherReward.sol`.

```text
Resolver approves exact creator + commitment + goal + price + duration + release deadline
  -> Creator consumes approval once
  -> FUNDING (one fixed-price pledge per wallet; no stock cap)
  -> funding deadline reached
       insufficient goal -> REFUNDING
       goal reached -> ACTIVE
  -> Creator submits production hash -> Resolver/eligible backup reviews
  -> Creator submits PDF + release-evidence hashes -> RELEASE_REVIEW
  -> Resolver/eligible backup accepts -> RELEASED (7-day challenge window)
  -> no unresolved challenge after window -> COMPLETED and payout

Any unpaid state -> Creator cancellation -> REFUNDING
No accepted release by deadline + 7 days -> permissionless REFUNDING
Unresolved challenge at first-challenge time + 30 days -> permissionless REFUNDING
Resolver upholds a release challenge -> REFUNDING
```

| Transfer | Funds / caller / failure / repeat rule |
| --- | --- |
| Pledge | Backer authorizes their fixed price. Contract records one claim and exact inbound transfer atomically. Failure/inexact transfer reverts both. No backend-created payment record grants a claim. |
| Refund | Backer's wallet claims its full fixed price in REFUNDING. Anyone can trigger eligible deadline transitions, but cannot redirect another backer's claim. Set refunded and subtract escrow before the guarded token transfer; failure reverts state and permits retry; a successful claim cannot repeat. |
| Payout | Anyone may trigger the eligible transition, but funds go only to the frozen Creator wallet. Requires RELEASED, expired challenge window and zero open disputes. Set COMPLETED and escrow to zero before transfer; failure reverts state and permits retry. No post-payout refund is created. |

The contract uses OpenZeppelin SafeERC20/ReentrancyGuard and verifies exact balance
changes. Accounting for accepted pledges is `raised = escrowed + refunds + payout`;
unsolicited token transfers do not create claims. Admin and backend hold no token
transfer authority. The dependency is the verified local MockUSDC deployment;
support for arbitrary fee/rebasing/frozen tokens is not claimed.

Before funds exist, primary Resolver approves campaign terms on chain. After funds
exist, backup review becomes available 7 days after the pending production/release
request or individual challenge. Requests cannot be overwritten while pending.
Release acceptance is immutable. A first-challenge deadline is not extended by
subsequent challenges; resolving one challenge cannot erase another open challenge.
These are implementation details of the approved timeout policy, not new public
financial promises.
