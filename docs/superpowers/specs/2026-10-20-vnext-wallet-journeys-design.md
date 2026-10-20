# FundTogether VNext Wallet Journeys — Implementation Specification

Status: implementation slice for the local permissionless protocol target. This document does not claim that the whole VNext A–Z roadmap is complete.

## Decision

Wallet actions are sent directly to the VNext contracts after the frontend verifies the connected SIWE wallet, local chain, deployment identity, and generated ABI identity. The backend supplies metadata, public projections, assigned-case projections, and canonical transaction status; it never decides a Judge verdict or creates financial truth.

```text
wallet
  -> viem simulation and transaction request
  -> mined receipt
  -> VNext canonical event index
  -> transaction status / projection API
  -> UI lifecycle state
```

The UI must distinguish `wallet_requested`, `submitted`, `receipt_confirmed`, `indexed`, and `failed`. A mined receipt is not the same as an indexed canonical event.

## Scope of this slice

| Actor | Implemented action surface | Contract authority |
|---|---|---|
| Creator | create a campaign proposal and submit evidence revisions for every indexed milestone | CampaignEscrowVNext |
| Backer | approve token, contribute, finalize funding after the deadline, freeze refund allocations, claim refund | MockUSDC / CampaignEscrowVNext |
| Judge | approve token, deposit and withdraw stake, reserve stake, enroll, commit and reveal vote | MockUSDC / JuryRegistry / JuryReview |
| Any wallet | permissionless funding/milestone/court finalizers exposed by the current contract | CampaignEscrowVNext / JuryReview |

`approveCampaign` is not a VNext action. Creator `createCampaign` opens the publication case; `finalizePublication` materializes the canonical Judge outcome before funding. Funding remains open until `fundingDeadline`; the finalization button is disabled before that time. Contract state, not the UI, remains the enforcement boundary.

## Identity and signing checks

Before a non-read transaction is signed, the frontend checks:

- the SIWE-linked wallet is the active wallet;
- the connected chain is `31339`;
- the manifest is `fundtogether-vnext-local-v2-remediation`;
- required contract addresses are configured;
- manifest genesis and bytecode hashes match the local deployment;
- the generated Campaign ABI hash matches the manifest ABI identity.

The transaction helper simulates the exact call first, records the submitted hash, waits for the receipt, and then polls canonical VNext events for non-token actions. Token approval stops at receipt confirmation because ERC20 approval is outside the current VNext event stream.

## Judge commit–reveal

The commit hash is generated with the same ABI tuple as `JuryTypes.voteCommitment`:

```text
chainId, protocolVersion, campaignId, milestoneId,
evidenceRevision, caseNumber, roundId, courtId,
judgeAddress, vote(uint8), salt(bytes32)
```

Reveal is enabled only when the locally recomputed commitment equals the on-chain commitment. The UI does not treat a local hash as evidence that the contract accepted a vote.

## Read APIs

- `GET /v1/fundtogether/vnext/deployment`
- `GET /v1/fundtogether/vnext/campaigns/:campaignId`
- `GET /v1/fundtogether/vnext/campaigns/:campaignId/milestones`
- `GET /v1/fundtogether/vnext/reviews`
- `GET /v1/fundtogether/vnext/reviews/assigned` for the authenticated SIWE wallet
- `GET /v1/fundtogether/vnext/reviews/:reviewCaseId/assignments`
- `GET /v1/fundtogether/vnext/reviews/:reviewCaseId/evidence`
- `POST /v1/fundtogether/vnext/reviews/:reviewCaseId/evidence`
- `GET /v1/fundtogether/vnext/reviews/:reviewCaseId/evidence/:evidenceHash/file`
- `GET /v1/fundtogether/vnext/transactions/:transactionHash`

Public review data contains indexed case and assignment projections only. Private evidence bytes require SIWE authentication and are readable only by the Creator wallet or a canonical assigned Judge; uploads must match the indexed evidence hash and are frozen after Judge enrollment.

## Canonical milestone projection boundary

The Campaign contract emits `MilestoneReviewStateChanged` whenever a review
case changes to a retry/appeal case or `syncFinalRuling` materializes a ruling,
including the state, outcome, challenge deadline, and correction deadline.
It emits `PublicationReviewCaseChanged` when a publication retry/appeal changes
the case pointer. The indexer projects these events idempotently; it must not
infer milestone finality from a Judge vote row or from a successful wallet
receipt alone.

## Acceptance requirements

1. No VNext UI path calls `approveCampaign`.
2. Funding finalization cannot be initiated before the funding deadline.
3. Amount inputs are integer token units; no floating-point money conversion is allowed.
4. Every submitted transaction exposes a lifecycle state and hash or an actionable error.
5. A transaction is labelled `indexed` only after the canonical event projection contains its normalized hash.
6. Judge reveal is disabled for a commitment mismatch.
7. Case evidence upload rejects a byte hash mismatch and an unrelated wallet cannot list or download it.
8. Milestone retry/appeal/sync actions update the indexed case pointer only after their canonical state event is observed.
9. Backend build and frontend type/build checks pass; contract/runtime acceptance remains a separate gate requiring Forge and Anvil.

## Explicit non-goals

This slice does not complete private assigned dossier delivery for every appeal/retry round, full backer balance/refund read models, production reward economics, multi-court operational limits, or full runtime acceptance. Those remain roadmap work and must be versioned against the protocol spec before implementation.
