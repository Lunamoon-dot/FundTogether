# FundTogether completion and surplus settlement

Status: Proposed design for review  
Date: 2026-10-18  
Scope: FundTogether Reward Crowdfunding MVP (`COMICS_ARTBOOK`, one digital PDF tier, local chain 31339)

## 1. Decision

The previous staged-payout design is replaced. The Creator does not withdraw
arbitrary amounts while production is in progress. Escrow remains locked until
the Creator submits a completion request and the Resolver approves it.

After approval, exactly the campaign goal is released to the frozen Creator
wallet. The campaign's overfunding surplus is then made claimable by every
canonical Backer in proportion to that Backer's total contribution. Each Backer
chooses either to receive the share personally or to donate that share to the
Creator. An Admin destination and fee split are deferred.

For this MVP:

```text
surplus = max(raised - goal, 0)
backerShare = surplus * backerContribution / raised
```

All values are MockUSDC base units and use integer arithmetic. The contract
must account for rounding dust deterministically so the surplus cannot be
claimed twice or become silently unaccounted.

## 2. Why the previous workflow is removed

The current payout implementation lets a Creator submit a full-escrow payout
only after `RELEASED` and the challenge deadline, while the backend requires
supporting files before the first request. That does not model the desired
business rule. A payout is not an expense-by-expense withdrawal; it is the
settlement result of an accepted campaign.

The replacement must therefore remove the old `requestPayout`/`approvePayout`
meaning from the product flow and introduce an explicit completion review and
surplus settlement boundary.

## 3. Goals

- Require a Creator completion request before campaign settlement.
- Give Resolver sole financial authority to approve or reject completion.
- Keep all escrow locked until the Resolver approval is canonical.
- Calculate surplus from `raised - goal`, not from an arbitrary Creator amount.
- Allocate surplus pro-rata across every Backer's canonical contribution.
- Let each Backer choose refund or Creator donation exactly once.
- Preserve Backer reward entitlement; surplus settlement is a separate transfer
  and does not silently remove a pledged reward package.
- Keep dossier files private while exposing their metadata and review context to
  authorized campaign participants.
- Make contract events and indexer projections idempotent and auditable.

## 4. Non-goals

- Admin/platform destination or 80/20 fee splitting.
- Arbitrary partial Creator payouts before completion.
- Backer voting or Backer approval of completion.
- Automatic completion based only on reaching the goal.
- A fixed Resolver decision timer.
- A new payout request for every production expense.

## 5. State machine

The existing production and final-PDF evidence flow remains the evidence path.
The settlement boundary becomes explicit:

```text
FUNDING
  -> ACTIVE
  -> RELEASE_REVIEW
  -> RELEASED                    Resolver accepts final PDF/evidence
       -> COMPLETION_REQUESTED   Creator anchors completion dossier after challenge
            -> RELEASED          Resolver rejects or requests changes
       -> COMPLETED              Resolver approves on-chain
            -> SURPLUS_CLAIMABLE Backers choose refund or Creator donation
```

`COMPLETED` means that the Resolver accepted the completed campaign. It does
not mean that all escrow is already zero: the goal has been paid to the Creator,
and the remaining escrow is the surplus claim pool until each Backer claims or
donates their calculated surplus share.

The existing refund path remains available before completion when its current
failure/dispute conditions are met. A pending completion request must block
campaign cancellation and refund opening until Resolver decides it.

## 6. Completion dossier

### 6.1 Creator submission

The Creator submits a private completion dossier containing:

- completion summary;
- final production status and explanation;
- final PDF/evidence references already required by the Campaign workflow;
- optional supporting files;
- a deterministic dossier hash committed on-chain.

The dossier is not itself financial authority. It is the evidence Resolver uses
to decide whether the campaign can enter `COMPLETED`.

### 6.2 Access

- Creator can create and revise a rejected/requested-change dossier.
- Resolver can inspect the dossier and record a decision.
- Canonical Backers can inspect the dossier, download authorized private files,
  and leave advisory feedback.
- Backers cannot approve completion or move escrow.
- Public unauthenticated pages do not expose private object keys or bearer URLs.

## 7. On-chain design

### 7.1 Campaign accounting

The campaign needs explicit completion and surplus fields:

- `completionRequestHash`;
- `completionRequestedAt`;
- `completionDecisionHash`;
- `surplusPool`;
- `surplusRaisedSnapshot`;
- `surplusClaimed`;
- `surplusClaimantCount`;
- `backerCount`.

The contract must also track whether an address is a unique Backer for the
campaign and whether that address has already chosen a surplus destination.
`raised` is frozen by the transition to `COMPLETED`; no new pledge is possible
after that transition.

### 7.2 Functions

The exact names may follow the current ABI conventions, but the authority must
be equivalent to:

```solidity
requestCompletion(uint256 campaignId, bytes32 dossierHash)
approveCompletion(uint256 campaignId, bytes32 dossierHash, bytes32 decisionHash)
rejectCompletion(uint256 campaignId, bytes32 dossierHash, bytes32 decisionHash)
claimSurplus(uint256 campaignId, SurplusChoice choice)
```

`requestCompletion`:

- caller must be the frozen Creator wallet;
- campaign must be `RELEASED`;
- the existing release challenge deadline must have passed;
- `openDisputes` must be zero;
- dossier and hash must be non-zero;
- only one completion request may be pending;
- transition to `COMPLETION_REQUESTED`;
- no token transfer occurs.

`approveCompletion`:

- caller must be an authorized Resolver wallet;
- request hash and decision hash must match non-zero values;
- no fixed seven-day wait is applied;
- compute `surplusPool = raised > goal ? raised - goal : 0`;
- snapshot `raised` for the pro-rata calculation;
- set `escrowed` to `surplusPool` and transfer exactly `goal` to the frozen
  Creator wallet;
- transition to `COMPLETED`;
- emit a canonical completion event containing the Creator settlement amount and
  surplus pool.

The goal transfer and state transition are atomic. If the token transfer fails,
completion approval reverts and the request remains retryable.

`rejectCompletion`:

- caller must be an authorized Resolver wallet;
- request hash and decision hash must match;
- no token transfer occurs;
- return to `RELEASED` and retain the decision for the off-chain audit trail;
- Creator may submit a corrected revision.

`claimSurplus`:

- caller must have a positive canonical contribution;
- caller may claim once only;
- campaign must be `COMPLETED`;
- `REFUND_TO_BACKER` transfers the calculated share to the caller;
- `DONATE_TO_CREATOR` transfers the calculated share to the frozen Creator
  wallet;
- emit the choice, recipient and exact amount;
- reject every duplicate claim.

The Resolver does not choose a Backer's destination and cannot redirect a
Backer's share to another Backer.

### 7.3 Pro-rata and rounding

The intended share is:

```solidity
floor(surplusPool * pledged[campaignId][backer] / surplusRaisedSnapshot)
```

Because MockUSDC uses integer base units, the implementation must also account
for the final rounding remainder. The simplest bounded-MVP rule is:

- every claimant except the final claimant receives the floor share;
- the final eligible claimant receives the remaining unclaimed surplus;
- `surplusClaimed` must equal `surplusPool` after the last claimant;
- the final claimant cannot receive more than the remaining pool.

The UI and API must display the deterministic calculated share before the
Backer signs the claim transaction.

## 8. Backend and indexer

The payout request tables become completion-request tables, or receive a new
completion-request domain table if preserving historical data is safer. A
request record stores:

- campaign and commitment identity;
- revision and dossier hash;
- private file metadata/hashes;
- Resolver decision and decision hash;
- request, decision and settlement transaction receipts;
- canonical projection status.

Suggested lifecycle:

```text
DRAFT -> SUBMITTED_ON_CHAIN -> UNDER_REVIEW
                             -> CHANGES_REQUESTED/REJECTED
                             -> APPROVED
```

The indexer must project:

- `CompletionRequested`;
- `CompletionApproved` or `CompletionRejected`;
- `SurplusClaimed`;
- canonical campaign snapshot and remaining claimable pool.

Event matching must use campaign ID, dossier/decision hash, actor, amount and
transaction identity. It must not infer success from a wallet submission or a
database row alone.

## 9. UI behavior

### Creator

- After production is complete, show `Gửi yêu cầu hoàn thành`.
- Show dossier fields and private file upload.
- After signing, show submitted/receipt/indexing states separately.
- On rejection, show Resolver reason and allow a new revision.
- Do not show an arbitrary payout amount form.

### Resolver

- Show completion dossier, hashes, final evidence and Backer feedback.
- Show `Duyệt hoàn thành` and `Từ chối/Yêu cầu sửa`.
- No seven-day payout countdown.
- The decision transaction is the only action that changes completion status.

### Backer

- Before completion: inspect dossier/review context and comment where allowed.
- After canonical completion: show the Backer's exact pro-rata surplus amount.
- Offer exactly two actions: `Nhận lại tiền` or `Tặng Creator`.
- After a confirmed claim, disable both actions and show the recipient and
  amount from the canonical event.
- Do not show an Admin option in this MVP.

## 10. Financial invariants

1. No Creator or Backer can transfer escrow before Resolver completion approval.
2. At completion, `goal + surplusPool == raised` and `escrowed == surplusPool`.
3. Every Backer's share is based on that Backer's full canonical contribution.
4. A Backer can settle at most once.
5. Refund and Creator donation are mutually exclusive destinations.
6. The total of all canonical `SurplusClaimed` amounts equals `surplusPool`.
7. The Creator wallet is the frozen settlement recipient; client-provided wallets are
   ignored.
8. Failed goal or surplus token transfers revert the transaction and preserve the
   request/unclaimed balance.
9. Completion and claim transactions are idempotently projected by the indexer.
10. Backer entitlement records are not deleted or silently reduced by surplus
    settlement.

## 11. Test plan

### Contract

- Creator can submit completion; Backer and Resolver cannot submit for Creator.
- Resolver approval changes state and creates the surplus pool.
- Resolver rejection returns to `ACTIVE` without moving funds.
- Approval does not require a fixed timer.
- `raised <= goal` creates no surplus claim pool.
- Two or more Backers receive shares proportional to their total contribution.
- A Backer may choose refund or Creator donation once, never twice.
- The final rounding remainder is distributed and cannot become stuck.
- A Backer cannot claim on behalf of another Backer.
- Failed token transfer rolls back the claim.
- Direct RPC calls by unauthorized wallets revert.

### Backend/indexer/frontend

- Completion dossier ACL is Creator/Resolver/canonical Backer only.
- First submission, revision, rejection and re-submission are idempotent.
- Canonical event matching rejects wrong dossier/decision hashes.
- Backer UI shows only its own pro-rata share and two destinations.
- Resolver UI has no payout timer and no Backer approval control.
- Refresh/replay does not duplicate completion or surplus claims.

## 12. Open policy to defer, not invent now

This MVP does not add an expiry or sweep timer for Backer surplus claims. An
unclaimed share remains claimable by its Backer. A later policy can define
unclaimed-fund expiry, but it must be separately approved because it changes
fund ownership.

## 13. Implementation order

After this design is approved:

1. Write the implementation plan and failing contract tests.
2. Replace the old payout contract path with completion and surplus settlement.
3. Regenerate ABI/deployment artifacts and update indexer event handling.
4. Add the backend completion dossier and settlement projection.
5. Replace the frontend payout panel with completion and Backer settlement UI.
6. Run contract, backend and frontend suites.
7. Back up and reset the disposable Anvil/DB/MinIO runtime, redeploy, and seed.
8. Execute the manual flow with multiple Backers and unequal contribution sizes.

The source worktree remains untouched by a runtime reset; unrelated dirty files
must be preserved.
