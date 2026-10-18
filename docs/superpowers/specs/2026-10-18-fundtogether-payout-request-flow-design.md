# FundTogether payout request flow

> **SUPERSEDED — 2026-10-18:** This historical design was replaced by
> [FundTogether completion and surplus settlement](C:/Users/dell/Desktop/FundTogether/docs/superpowers/specs/2026-10-18-fundtogether-completion-surplus-settlement-design.md).
> It is retained to explain the earlier payout proposal and is not current
> product policy, contract behavior, API behavior, or UI behavior.

Status: Proposed design for review
Date: 2026-10-18
Scope: FundTogether Reward Crowdfunding MVP (`COMICS_ARTBOOK`, one digital PDF tier, local chain 31339)

## 1. Decision

Payout is a two-party financial workflow, not a permissionless transfer button.

The Creator submits a payout dossier containing a form and supporting files. The
dossier is visible to the campaign's Backers and Resolver. The Creator anchors
the submitted dossier on-chain with `requestPayout`. The Resolver reviews the
dossier and Backer feedback, then either requests changes/rejects the request or
approves it with `approvePayout`. Only the approval transaction moves escrow.

The MVP uses one final payout for the campaign. The requested amount is a
required field and must equal the eligible escrow balance; partial or staged
payouts are explicitly out of scope for this change.

## 2. Problem and current root cause

The current contract exposes `payout(campaignId)` without Creator or Resolver
authorization. It checks only `RELEASED`, the challenge deadline and the absence
of open disputes, then transfers escrow to the frozen Creator wallet. The current
frontend renders `Trả Creator khi đủ điều kiện` for any logged-in user in state
3. This protects the recipient but does not express the required business
boundary or provide an auditable payout dossier.

The replacement must make the request and Resolver decision explicit on-chain and
keep the dossier itself off-chain/private.

## 3. Goals

- Give the Creator a visible, auditable payout-request workflow.
- Let authenticated campaign Backers and Resolver inspect the submitted dossier.
- Let Backers submit comments/issues without granting them financial authority.
- Require Resolver approval before escrow can move.
- Bind the Resolver decision to the exact form and file hashes the Creator sent.
- Preserve the frozen Creator payout wallet and full-escrow accounting.
- Preserve retry safety when token transfer or indexing fails.
- Keep financial truth in the contract and derived status in the indexer/database.

## 4. Non-goals

- Partial, staged, milestone or expense-by-expense payouts.
- Backer voting or Backer approval of payout.
- Public unauthenticated access to payout documents.
- Changing the frozen payout wallet during payout review.
- Automatic payout after a timer.
- Backend-created payout success without an on-chain receipt.

## 5. State machine

```text
FUNDING
  -> ACTIVE
  -> RELEASE_REVIEW
  -> RELEASED
       challenge window expires and no dispute remains
  -> PAYOUT_REQUESTED
       Resolver approves
  -> COMPLETED

Any eligible unpaid failure/dispute path -> REFUNDING
```

`PAYOUT_REQUESTED` is a real contract state. It is not inferred only from a
database row or a frontend flag. Because the local runtime can be reset and
redeployed, the new contract may use an explicit enum member without preserving
the old numeric state layout.

## 6. On-chain design

### 6.1 Campaign fields

Add payout request data to the campaign record:

- `payoutRequestHash`: immutable hash of the submitted dossier revision.
- `payoutAmount`: requested amount in MockUSDC base units.
- `payoutRequestedAt`: request timestamp.
- `payoutDecisionHash`: optional hash of the Resolver decision/reason.

The request hash commits to campaign ID, commitment hash, Creator wallet,
deployment, amount, form fields, file hashes and request revision. The contract
does not store the files or free-form text.

### 6.2 Functions and events

```solidity
requestPayout(uint256 campaignId, bytes32 requestHash, uint256 amount)
approvePayout(uint256 campaignId, bytes32 requestHash, bytes32 decisionHash)
rejectPayout(uint256 campaignId, bytes32 requestHash, bytes32 decisionHash)
```

`requestPayout`:

- Caller must be the campaign Creator.
- State must be `RELEASED`.
- Challenge deadline must have passed.
- `openDisputes` must be zero.
- `requestHash` and `amount` must be non-zero.
- `amount` must equal the current escrow balance.
- No other payout request may be pending.
- Transition: `RELEASED -> PAYOUT_REQUESTED`.
- Emit `PayoutRequested`.

`approvePayout`:

- Caller must be Primary Resolver, or Backup after the existing takeover delay.
- State must be `PAYOUT_REQUESTED`.
- The supplied request hash must match the stored hash.
- No open dispute may exist.
- Set state to `COMPLETED` and escrow to zero before transfer.
- Transfer exactly `payoutAmount` to the frozen Creator wallet.
- Emit `PayoutApproved` and `PaidOut`.
- A failed token transfer must revert the entire transaction and leave the
  request retryable.

`rejectPayout`:

- Caller must satisfy the same Resolver authority rule.
- State must be `PAYOUT_REQUESTED`.
- Store/emit the decision hash and return to `RELEASED`.
- The off-chain reason is retained with the immutable request revision.
- Creator may submit a new revision after correcting the dossier.

No generic `payout()` function remains that can be called by arbitrary wallets.

## 7. Off-chain payout dossier

### 7.1 Dossier contents

The minimum form contains:

- requested amount;
- short title/summary;
- detailed reason for payout;
- amount explanation or breakdown;
- supporting file metadata and SHA-256 hashes;
- request revision and campaign commitment reference.

The amount is represented as an integer decimal/base-unit-safe value. The
backend rejects floating-point or ambiguous token amounts.

### 7.2 Storage and access

- Files are stored in the existing private object storage boundary.
- Public campaign pages do not expose object keys or bearer URLs.
- Creator, Resolver and canonical Backers of the campaign may list and download
  the submitted dossier using authenticated, short-lived access tickets.
- A file replacement creates a new request revision and new hash; an accepted
  request revision is immutable.

### 7.3 Backend records and endpoints

Add a payout-request domain record linked to the campaign, commitment, Creator,
request revision, request hash, amount, status, file hashes and transaction
receipts. Suggested lifecycle:

```text
DRAFT -> SUBMITTED_ON_CHAIN -> UNDER_REVIEW -> CHANGES_REQUESTED/REJECTED
                                         -> APPROVED -> PAID_OUT
```

The backend owns dossier validation, access control and projection. It does not
authorize or manufacture the payout. On-chain events remain authoritative for
`PAYOUT_REQUESTED`, `PAYOUT_APPROVED`, `PAID_OUT` and `REFUNDING`.

## 8. UI behavior

### Creator

- Show the payout form only when the campaign is `RELEASED`, the challenge
  deadline has passed and there are no open disputes.
- Show the requested amount and escrow balance side by side.
- Require form completion and file upload before enabling the wallet transaction.
- After the receipt, show `Đã gửi yêu cầu giải ngân · Chờ Resolver`.
- On rejection/requested changes, show the reason and permit a new revision.

### Backer

- Show the submitted payout dossier after it is anchored on-chain.
- Allow file viewing/downloading and comments/issues.
- Do not show approve/reject or financial transaction controls.
- Clearly state that Backer feedback is advisory; Resolver makes the decision.

### Resolver

- Show the exact requested amount, escrow balance, form, files, hashes and
  Backer feedback.
- Provide `Duyệt giải ngân` and `Yêu cầu sửa/Từ chối` actions.
- Require the Resolver decision reason to be recorded off-chain and committed
  by hash in the on-chain transaction.
- Display Primary/Backup takeover eligibility explicitly.

## 9. Transaction and synchronization rules

Every financial action follows:

```text
preflight -> wallet signature -> submitted -> receipt confirmed
          -> canonical event -> idempotent indexer -> database/UI
```

The UI must not report payout success after wallet submission alone. A request
is not `SUBMITTED_ON_CHAIN` until `PayoutRequested` is in a successful receipt;
the campaign is not `COMPLETED` until `PaidOut` is canonical and indexed.

## 10. Test plan

### Contract tests

- Creator can request only after release/challenge eligibility.
- Backer, Creator-as-Resolver and unrelated wallets cannot approve.
- Resolver cannot request on behalf of Creator.
- Wrong hash, zero amount and amount different from escrow revert.
- Open challenge/dispute blocks request and approval.
- Primary approval succeeds; Backup is blocked before takeover delay and works
  after it.
- Rejection returns to `RELEASED` and permits a new request revision.
- Duplicate request/approval cannot move funds twice.
- Failed token transfer preserves escrow and a retryable request.
- Frozen payout wallet receives the exact escrow amount.

### Backend/indexer tests

- Dossier ACL: Creator, campaign Backer and Resolver can read; unrelated user
  cannot.
- Hash reconstruction matches the on-chain request hash.
- File replacement creates a new revision instead of mutating an old one.
- Event replay is idempotent.
- Reverted/submitted/indexing states never become paid out.

### Frontend tests

- Creator sees request form only at the eligible state.
- Backer sees the dossier but no approval CTA.
- Resolver sees approve/reject controls only for a valid Resolver wallet.
- Request, rejection and approval transaction recovery states are rendered.
- The old generic `Trả Creator khi đủ điều kiện` action is absent.

### Manual happy path

1. Reach `RELEASED` and wait/tune chain time beyond `challengeDeadline`.
2. Creator fills the payout form and uploads a PDF/supporting document.
3. Creator signs `requestPayout` and waits for canonical indexing.
4. Backer opens the dossier, downloads the file and posts feedback.
5. Resolver reviews the dossier and feedback.
6. Resolver approves the matching request hash.
7. Verify `PaidOut`, `COMPLETED`, escrow zero and Creator balance increase.
8. Replay/refresh all clients and verify no duplicate request or payout.

## 11. Reset and implementation order

After this design is approved:

1. Write the implementation plan and add failing contract tests.
2. Update the contract and Foundry tests.
3. Regenerate ABI/deployment artifacts.
4. Add backend dossier schema, private file access and event projections.
5. Add frontend Creator, Backer and Resolver surfaces.
6. Run backend, frontend and contract suites.
7. Reset only the disposable local Anvil/DB/MinIO runtime, redeploy and seed
   fresh fixtures.
8. Run the manual happy path and refund/rejection/retry branches.

The repository's existing unrelated dirty changes must be preserved. A runtime
reset does not authorize deleting source history or unrelated working-tree work.

## 12. Open decision before implementation

This plan assumes one final payout where `requestedAmount == escrowed`. Supporting
partial payouts would require a separate accounting design for remaining escrow,
multiple requests and refunds, and should not be mixed into this MVP change.
