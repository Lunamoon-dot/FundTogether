# Campaign R3 — approved local financial policy v1

> **Historical pre-reset policy:** Superseded on 2026-10-20 by
> [FINANCIAL_POLICY_V2_DECENTRALIZED.md](FINANCIAL_POLICY_V2_DECENTRALIZED.md).
> The Resolver, Backup Resolver and Admin authority described below belongs to
> the old local runtime and must not be used for new protocol design.

Status: **APPROVED LOCAL POLICY**, 2026-10-13. The user selected option 1
(approve the entire local proposal), adding that Resolver decides and community
participates in checking the detailed requests. R2–R5 now have automated local
acceptance and main-runtime verification; exact evidence and limitations are in
[PROJECT_PROGRESS.md](../PROJECT_PROGRESS.md). No public/real-asset launch is
authorized. Financial policy version: `campaigns-local-escrow-v6`.

## Research limitation

This policy secures custody and constrains financial transitions on the local
Campaign contract, but it does not decentralize evidence verification. Resolver
roles remain trusted decision-makers, while Community Review remains advisory.
The policy must not be described as decentralized governance, trustless
verification or a reviewer-reward mechanism. Any reviewer pool, voting,
staking/reward or challenge-governance proposal requires a separate, evaluated
policy and is not enabled by this version.

## Approved local policy

| Gate | Approved local rule |
| --- | --- |
| D02 | Resolver-approved Creator disbursements are allowed while funding is `ACTIVE`. Every request must include a private file explaining in detail how the requested money will be used. From the second request onward, it must also include separate evidence showing how the previous disbursement was used. Resolver decides with no fixed timer. Each approved disbursement is an advance against the frozen goal and the sum of Creator disbursements cannot exceed that goal. |
| D03 | Creator cannot review their own campaign/release. Primary Resolver reviews and resolves disputes; distinct backup may take over after 7 days of primary inactivity for those review steps. Either Resolver role may finalize funding after the deadline; neither may change the Creator wallet or frozen terms. A Resolver may approve or reject an `ACTIVE` disbursement request immediately; no fixed Resolver decision timer applies. After release and the challenge window, the Creator submits a completion dossier without an amount or destination. Approval pays only the remaining `goal - creatorPaid` to the frozen Creator wallet. |
| D04 | Goal failure, cancellation before completion, no production completion/Creator confirmation by the production policy timeout, no accepted PDF by the Creator-confirmed release deadline plus 7 days, or unresolved dispute timeout: full refund from intact escrow. Accepted release has a 7-day challenge period. A timely open dispute blocks completion. After completion, the remaining `raised - goal` is a separate surplus claim pool; each canonical Backer can claim once and choose refund to self or donation to Creator. |
| D05 | Overfunding allowed until funding deadline; all accepted pledges follow the same frozen price, terms and refund rule. No fabricated stock limit. |
| D07 | A wallet may submit repeated fixed-price pledges per campaign and may buy multiple units in one transaction. Each quantity is a positive integer, each canonical pledge log creates one nontransferable entitlement record with its quantity, and the contract charges `price × quantity`. No gifting, transfers or additional paid tiers. Multiple wallets are not represented as unique humans. |
| D08 | No automatic download expiry or unilateral revocation of a valid entitlement. Local availability only; no promise of permanent hosting. Orphaned/reverted/refunded pledges cannot download. No DRM claim. |
| D09 | Zero platform fee. Approved disbursements count toward the goal. Completion sends only the remaining `goal - creatorPaid` to the verified Creator wallet. Any `raised - goal` surplus is allocated pro-rata across all canonical Backers; each Backer chooses self-refund or donation to Creator. There is no Admin destination or split in this MVP. |
| D10 | Local chain 31339 and MockUSDC only. No public chain, real-asset or legal launch acceptance. |
| D11 | Existing technical duration 1–60 days and positive uint256 base-unit amounts; fixed price cannot exceed goal. The release deadline is not part of initial campaign terms; Creator confirms it only after production evidence is accepted. No additional business price/goal cap. |
| D12 | Frozen terms cannot change. Creator may cancel before completion, opening full refunds. Material revision requires a new campaign. An accepted PDF is immutable; resolving a broken file cannot silently replace its hash. |

### Delivery dates in the v3 interface

Campaign creation and Community Review do not collect an estimated delivery range or a mandatory release deadline:

- The initial commitment hash binds the work, price, goal and funding duration only. Delivery estimates are not financial promises and are not stored in the current Campaign draft/preparation contract.
- The contract starts with `releaseDeadline = 0`. After funding succeeds, the Creator submits production evidence and the Resolver only accepts or rejects that evidence.
- Once the evidence is accepted, the Creator explicitly confirms campaign completion and provides the release deadline in `confirmCampaignCompletion`. That transaction is the only normal transition that sets the on-chain release policy.
- If production evidence or Creator confirmation does not happen within the fixed 30-day production policy timeout after funding, anyone may open refunds. After confirmation, the accepted-PDF deadline plus the 7-day grace period governs the release timeout.

## Custody and migration consequence

Backers own refundable claims while funds are in escrow. Only contract transitions
may authorize refunds, disbursements, goal settlement, or surplus claims. A Creator
disbursement starts with an off-chain request form; every revision includes a detailed
use-of-funds explanation file, while later revisions also include separate evidence of
prior use. An eligible Resolver may approve
or reject the matching request hash; only approval moves the requested amount to the
frozen Creator wallet. The Creator later anchors an off-chain completion dossier with
`requestCompletion`; an eligible Resolver may
approve the exact request hash with `approveCompletion` or return it to `RELEASED`
with `rejectCompletion`. Approval pays exactly the goal and leaves any surplus in
escrow. Failed token transfers revert state; a completion or claim cannot execute
twice. The released PDF and download logs never manufacture an on-chain payment or
claim.

The disbursement path is deliberately narrow: no arbitrary wallet payout, no
automatic timer, no amount above the remaining goal, and no backend-only success.
The contract/deployment, ABI, indexer stream and conservation tests are versioned
with this policy. Existing campaign obligations and their supported contract/API
paths must remain intact.

## Resolver and community review

Resolver makes campaign, release and dispute decisions, with the stated backup
and timeout rules. Community members can inspect public frozen PDF terms, content
outline, budget, evidence plan, hashes and decision outcomes, and submit attributable
comments/reports for Resolver review. Comments are not votes, payment approvals or
proof that a file was delivered. Private identity evidence, object keys and final
PDF remain private; comments cannot grant download entitlement.

Backers can submit a timely on-chain challenge before completion. Detailed requests
in this model are content/release/evidence review requests plus disbursement requests;
the first disbursement needs a use-of-funds explanation file, but does not need production/PDF evidence. Upholding a release challenge stops the campaign and opens
refunds for the whole unpaid escrow; dismissing it keeps the release challenge
deadline intact. Community reports support review without granting arbitrary
accounts power to lock escrow indefinitely.

The digital slice passed before R5 retirement. A separate user instruction
authorized reconciliation and physical removal; guarded migration 0005 preserves
the audited historical fixtures and all financial rows. This financial policy
alone does not authorize deleting historical obligations.

## Implemented contract transitions and accounting (local prototype)

`FundTogetherCampaign.sol` is the only current financial contract. Historical
contract records are decoded separately and are not part of the Campaign wire flow.

```text
Resolver approves exact creator + commitment + goal + price + duration
  -> Creator consumes approval once
  -> FUNDING (repeated fixed-price pledges; positive quantities; no stock cap)
  -> funding deadline reached
       insufficient goal -> REFUNDING
       goal reached -> ACTIVE
  -> Creator submits disbursement form + use-of-funds explanation file
       second and later requests also include previous-use evidence
  -> Resolver approves -> amount advances to Creator against remaining goal
  -> Resolver rejects -> no transfer; Creator may submit a revised request
  -> Creator submits production hash -> Resolver/eligible backup reviews
  -> Creator confirms campaign completion + release deadline
  -> Creator submits PDF + release-evidence hashes -> RELEASE_REVIEW
  -> Resolver/eligible backup accepts -> RELEASED (7-day challenge window)
  -> no unresolved challenge after window
  -> Creator submits completion dossier -> COMPLETION_REQUESTED
  -> eligible Resolver approves exact request -> COMPLETED
       exact goal -> frozen Creator wallet
       raised - goal -> pro-rata surplus claim pool
       each Backer -> refund to self OR donate to Creator

Any unpaid state -> Creator cancellation -> REFUNDING
No production completion/Creator confirmation by the 30-day production policy timeout -> permissionless REFUNDING
No accepted release by Creator-confirmed deadline + 7 days -> permissionless REFUNDING
Unresolved challenge at first-challenge time + 30 days -> permissionless REFUNDING
Resolver upholds a release challenge -> REFUNDING
```

| Transfer | Funds / caller / failure / repeat rule |
| --- | --- |
| Pledge | Backer authorizes their fixed price. Contract records one claim and exact inbound transfer atomically. Failure/inexact transfer reverts both. No backend-created payment record grants a claim. |
| Refund | Backer's wallet claims its full fixed price in REFUNDING. Anyone can trigger eligible deadline transitions, but cannot redirect another backer's claim. Set refunded and subtract escrow before the guarded token transfer; failure reverts state and permits retry; a successful claim cannot repeat. |
| Disbursement request | Only the frozen Creator may submit a request while `ACTIVE`, with a non-zero amount no greater than escrow and the remaining goal. Off-chain storage requires a use-of-funds explanation file on every request and separate previous-use evidence from revision 2 onward. The request hash commits the form plus both file categories; the contract records the pending hash and amount but moves no funds. |
| Disbursement decision | Only Primary/Backup Resolver may approve or reject the matching request hash. Approval transfers the exact requested amount to the frozen Creator wallet and increments `creatorPaid`; rejection clears the pending request without transfer. There is no fixed Resolver timer. |
| Completion request | Only the frozen Creator may submit one dossier after `RELEASED`, an expired challenge window and zero open disputes. The dossier and optional private file hashes are committed by `requestHash`; no amount or destination is accepted and the contract enters `COMPLETION_REQUESTED` without moving funds. |
| Completion decision | An eligible Resolver may approve, request changes, or reject the matching request hash immediately. A non-approval stores the decision hash and returns to `RELEASED`; a corrected immutable revision may be requested later. Backer feedback is advisory and never authorizes payment. |
| Goal settlement | `approveCompletion` sets `COMPLETED`, pays only the remaining `goal - creatorPaid` to the frozen Creator wallet, and leaves `raised - goal` in escrow as `surplusPool`. Earlier approved disbursements count toward the goal. Failure reverts state and transfer; approval cannot execute twice. |
| Surplus claim | Every canonical Backer is eligible by their contribution share, not by a selected list. `claimSurplus` can run once per Backer with `REFUND_TO_BACKER` or `DONATE_TO_CREATOR`; the final claimant receives any integer-rounding remainder. A failed transfer reverts the claim so it can be retried. |

The contract uses OpenZeppelin SafeERC20/ReentrancyGuard and verifies exact balance
changes. Accounting for accepted pledges is `raised = escrowed + refunds + goalSettlement + surplusClaims`;
unsolicited token transfers do not create claims. Admin and backend hold no token
transfer authority. The dependency is the verified local MockUSDC deployment;
support for arbitrary fee/rebasing/frozen tokens is not claimed.

Before funds exist, primary Resolver approves campaign terms on chain. After funds
exist, backup review becomes available 7 days after the pending production/release
request or individual challenge; completion decisions have no extra waiting timer.
Requests cannot be overwritten while pending.
Release acceptance is immutable. A first-challenge deadline is not extended by
subsequent challenges; resolving one challenge cannot erase another open challenge.
These are implementation details of the approved timeout policy, not new public
financial promises.
