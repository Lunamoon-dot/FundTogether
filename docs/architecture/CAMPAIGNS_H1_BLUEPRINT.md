# FundTogether — H1 Technical Blueprint (Corrected)

> **Historical pre-reset blueprint:** Superseded on 2026-10-20 by
> [PURE_DECENTRALIZED_PROTOCOL.md](PURE_DECENTRALIZED_PROTOCOL.md). This file
> documents the old Resolver-controlled H1 architecture and is retained only
> for implementation history.

> **Previous filename:** `docs/architecture/CAMPAIGNS_H1_BLUEPRINT.md`.
>
> **Status:** `ACTIVE_CAMPAIGN_DIRECTION`
>
> **Source of truth:** [research-direction.md](../research-direction.md), [PROJECT_OVERVIEW.md](../PROJECT_OVERVIEW.md), and [FINANCIAL_POLICY_V1.md](../campaigns/FINANCIAL_POLICY_V1.md).

## 1. Correction to the previous proposal

The previous version described a progressive-advance crowdfunding system. That is
not the current FundTogether product direction. It introduced `FundingRequest`,
creator advances, expense reconciliation, outcome-exposure caps, continuous
spending challenges, and a shared refund vault. Those features are deferred and
must not be treated as approved Campaign behavior.

H1 remains the narrow FundTogether pilot:

- one `COMICS_ARTBOOK` campaign;
- one `STANDARD` tier;
- one fixed-price `DIGITAL_DOWNLOAD` PDF tier; each pledge log records one or more package units;
- local MockUSDC on chain `31339`;
- full pledge custody until payout or refund;
- no creator advance, partial disbursement, inventory, shipping, or NFT flow.

`FundTogetherCampaign.sol` remains the financial contract for this scope. H1 does
not add `FundTogetherProgressiveEscrow.sol` or
`FundTogetherRefundVault.sol`, and does not modify existing V1 obligations.

## 2. Current architecture

```text
React Campaign UI
    -> NestJS Reward API
        -> PostgreSQL metadata and indexed projections
        -> MinIO private evidence and final PDF
        -> FundTogetherCampaign.sol on local Anvil
            -> canonical events
                -> idempotent indexer
                    -> PostgreSQL projection and public audit views
```

Blockchain is the source of truth for pledge, refund, dispute, and payout
transitions. A wallet-submitted transaction is not treated as complete until the
canonical receipt and idempotent indexer projection exist.

### Publication authorization: current H1 flow and deferred EIP-712 option

The current H1 deployment separates Resolver authorization from Creator campaign
creation:

```text
Primary Resolver → approveCampaign(exact terms)
  → approvedTerms[termsHash] = true
Creator → createCampaign(exact terms)
  → consumes the approval and emits CampaignCreated
```

The database `APPROVED` status is an off-chain review decision. It is not proof
that the contract has an approved terms hash. The Creator transaction is allowed
only after the Primary Resolver approval is mined and the UI/backend has read the
canonical `approvedTerms` value. The backend must not custody or use the
Resolver's private key to automate this signature.

As a post-MVP UX improvement, a separately versioned contract may support an
EIP-712 typed-data Resolver signature submitted by the Creator through a
`createCampaignWithApproval` function. The signed payload must bind the Creator,
commitment, all campaign terms, `chainId`, `verifyingContract`, nonce and expiry;
the contract must recover the configured Resolver and reject replayed or expired
signatures. This option is documentation-only and is not part of the current H1
ABI, deployment, or acceptance criteria.

## 3. Financial state machine

```text
FUNDING
   | funding deadline reached and raised >= goal
   v
ACTIVE
   | production evidence accepted
   v
RELEASE_REVIEW
   | final PDF and release evidence accepted
   v
RELEASED
   | 7-day challenge window expires with no open dispute
   v
COMPLETED
   | payout of the remaining escrow to the frozen creator wallet

Any eligible failure, cancellation, or upheld release challenge
   -> REFUNDING
```

Required money-flow rules:

1. Each backer may make repeated fixed-price pledges per campaign. Every pledge carries a positive quantity, and the contract charges `price × quantity`.
2. The contract holds the full pledge. No funds are sent to the creator before
   the accepted PDF release reaches the payout condition.
3. A refund claim returns the backer's full accumulated pledge amount from the intact campaign escrow, exactly once.
4. Payout and refund claims update state before the guarded token transfer; a
   failed transfer reverts and a successful claim cannot repeat.
5. Download access and optional backer confirmation are separate from payout and
   do not manufacture financial state.

## 4. Review and challenge policy

Challenge is **not continuous across spending**, because Campaign has no spending
pipeline. The current release challenge flow is:

- Resolver reviews the frozen campaign terms, production evidence, and final PDF.
- A backer may challenge an accepted release during the 7-day challenge window.
- An open challenge blocks payout.
- Resolver or the eligible backup resolves the challenge with a decision hash.
- An upheld release challenge opens refunds for the unpaid escrow.
- A dismissed challenge leaves the release window and payout guards intact.
- An unresolved challenge reaches the permissionless dispute timeout after 30
  days and can make the campaign refund-eligible.
- Backup review becomes available after 7 days of primary inactivity.

The creator cannot review their own campaign or release. A PDF hash accepted for
release is immutable; download availability is not evidence that the backer
accepted the product.

## 5. Approved local parameters

These values are the current local contract/policy parameters, not progressive
funding gates:

| Parameter | Value | Meaning |
|---|---:|---|
| `chainId` | `31339` | Local Anvil only |
| `supportedToken` | MockUSDC | Exact-transfer local token |
| `REVIEW_TAKEOVER` | 7 days | Backup review after primary inactivity |
| `CHALLENGE_WINDOW` | 7 days | Release challenge window |
| `RELEASE_GRACE` | 7 days | Missing-release refund grace period |
| `DISPUTE_TIMEOUT` | 30 days | Permissionless exit for unresolved dispute |
| campaign duration | 1–60 days | Existing local term validation |
| creator advance | none | Full pledge remains in escrow until payout/refund |
| outcome exposure cap | not applicable | No progressive disbursement exists |
| per-request cap | not applicable | No `FundingRequest` exists |
| refund vault | none | Refunds remain campaign-scoped in the Campaign escrow |

## 6. Conservation invariant

For each campaign, accepted pledge accounting is:

```text
raised = escrowed + refunded + payout
```

The equation is evaluated using canonical contract state. Unsolicited token
transfers do not create backer claims, and a database record or uploaded file does
not create a payment, refund, or payout.

## 7. Canonical events and indexer requirements

The indexer must consume the contract events using an idempotent identity such as
`chainId + transactionHash + logIndex`:

- `CampaignApproved`
- `CampaignCreated`
- `Pledged`
- `FundingFinalized`
- `ProductionSubmitted`
- `ProductionReviewed`
- `ReleaseSubmitted`
- `ReleaseReviewed`
- `ReleaseChallenged`
- `ChallengeResolved`
- `RefundsOpened`
- `Refunded`
- `PaidOut`

The UI may display submitted, mined, indexed, and available states separately.
It must not label a pledge, refund, or payout as recorded from a wallet request
alone.

## 8. H1 verification scope

The relevant executable verification is the Campaign suite, including:

- positive-quantity pledges, repeated pledges by one wallet, and exact `price × quantity` accounting;
- funding success and failure transitions;
- production and final PDF review guards;
- release challenge boundary and open-dispute payout blocking;
- resolver backup takeover and dispute timeout;
- full refund claim and duplicate-claim rejection;
- payout only after the release challenge window;
- exact conservation of escrow, refunds, and payout;
- unchanged V1 deployment/ABI/indexer obligations.

The previously created progressive-interface scaffold and its test have been
removed. No progressive contract, ABI, or test is part of the active Campaign
runtime or H1 acceptance.

## 9. Explicitly deferred

The following require a new product decision and a separately versioned policy
before any implementation:

- creator advances and progressive disbursement;
- funding requests and expense reconciliation;
- 50% outcome-exposure accounting;
- continuous challenge across expenses or milestones;
- proportional or supplemental refund rounds;
- shared refund-vault custody;
- physical fulfilment, NFT, marketplace, mainnet, and real-asset support.
- EIP-712 off-chain Resolver approval and `createCampaignWithApproval`; this
  requires a new contract version, replay-protection tests, and a migration plan.

Until that decision exists, these items are documentation-only history and are
not part of H1 acceptance.
