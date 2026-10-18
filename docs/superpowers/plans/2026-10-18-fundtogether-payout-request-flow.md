# FundTogether Payout Request Flow Implementation Plan

> **SUPERSEDED — 2026-10-18:** This historical plan was replaced by
> [FundTogether completion and surplus settlement](C:/Users/dell/Desktop/FundTogether/docs/superpowers/plans/2026-10-18-fundtogether-completion-surplus-settlement.md).
> It is retained for audit history only and must not be used as the current
> implementation contract.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the permissionless final `payout()` transition with an auditable Creator-requested and Resolver-approved payout flow, including a private payout dossier, canonical indexer projection, and clear Creator/Backer/Resolver boundaries.

**Architecture:** The contract remains the financial authority. The Creator creates a private off-chain dossier, then anchors its immutable revision and exact amount with `requestPayout`. The Resolver reviews that dossier and Backer feedback, records a decision dossier, and signs `approvePayout` or `rejectPayout`. PostgreSQL stores metadata and projection, MinIO stores private files, and the indexer promotes UI state only from canonical `PayoutRequested`, `PayoutApproved`, `PaidOut`, and refund events.

**Tech Stack:** Solidity/Foundry, OpenZeppelin-style ERC20 transfer boundary, NestJS/TypeScript, Drizzle/PostgreSQL, MinIO/S3-compatible private storage, viem/Wagmi, React/Vite, existing hash-based FundTogether routes, local Anvil chain `31339`.

**Spec:** [2026-10-18-fundtogether-payout-request-flow-design.md](C:/Users/dell/Desktop/FundTogether/docs/superpowers/specs/2026-10-18-fundtogether-payout-request-flow-design.md)

## Global Constraints

- Preserve unrelated dirty working-tree changes. Do not reset source history or delete existing fixtures during implementation.
- Do not report a submitted wallet transaction as success. The success boundary is: receipt confirmed, expected event present, canonical indexer projection updated.
- Contract state, escrow, request hash, decision hash and paid amount are financial truth. Backend rows, files and UI labels are derived or evidentiary only.
- The MVP has one final payout and requires `requestedAmount == escrowed`. No partial, staged or timer-only payout.
- Only the frozen Creator wallet may request payout and receive funds. Only Primary Resolver, or Backup after the existing takeover delay, may approve/reject.
- Payout documents remain private. Never expose MinIO object keys or bearer URLs through public campaign responses.
- Amounts use integer decimal/base-unit strings and `bigint`; no floating-point amount calculation.
- A request/decision must be idempotent across wallet retry, receipt reconciliation and indexer replay.
- Local runtime reset is a final verification step only, after source tests pass; it may reset disposable Anvil/DB/MinIO state but must not remove source changes.

## Review Focus

- Contract authorization and state transitions cannot be bypassed through DevTools or direct RPC calls.
- `PAYOUT_REQUESTED` cannot be cancelled, refunded, approved twice, or silently treated as `COMPLETED`.
- Failed token transfer leaves the request and escrow retryable.
- Resolver approval binds to the exact request hash; rejection preserves immutable history and permits a new revision.
- Creator, canonical Backer, Resolver and unrelated-user access boundaries are enforced server-side, not only by hidden buttons.
- All old `payout` action/event assumptions, numeric state mappings, docs and manual tests are updated consistently.

---

## Task 1 — Add failing contract tests for the new payout boundary

**Files:**

- Modify `contracts/test/unit/Campaigns/CampaignEscrow.t.sol`.
- Keep existing setup helpers and fixture accounts; replace tests that call the old `payout(uint256)` API with the new request/decision flow.

**Steps:**

- [ ] Add tests that create a released campaign, advance beyond `challengeDeadline`, and assert only the Creator can call `requestPayout(id, requestHash, escrowed)`.
- [ ] Assert request rejects zero hash, zero amount, amount different from escrow, early challenge deadline, open disputes, wrong state, Backer caller, and Resolver caller.
- [ ] Assert `PayoutRequested` is emitted and `campaign(id).state` becomes `PAYOUT_REQUESTED` without moving escrow.
- [ ] Assert Primary Resolver can approve the matching request hash, Backup is blocked before takeover delay and can approve after it, and unrelated callers cannot approve/reject.
- [ ] Assert approval sets state/escrow before transfer, emits `PayoutApproved` and `PaidOut`, and pays the frozen Creator wallet exactly once.
- [ ] Assert wrong request hash, zero decision hash, duplicate approval, and approval after rejection revert.
- [ ] Assert rejection stores/emits the decision hash, returns to `RELEASED`, and allows a new request revision without allowing funds to move.
- [ ] Assert a failing token transfer reverts the whole approval and preserves `PAYOUT_REQUESTED`, request data and escrow.
- [ ] Assert `cancelCampaign` and refund paths cannot bypass a pending payout request.
- [ ] Run the focused test before implementation and record the expected compile/test failure:

```powershell
cd C:\Users\dell\Desktop\FundTogether\contracts
forge test --match-path test/unit/Campaigns/CampaignEscrow.t.sol
```

## Task 2 — Implement the contract state machine and authorization

**Files:**

- Modify `contracts/src/campaigns/FundTogetherCampaign.sol`.
- Modify the focused contract tests from Task 1 only as needed to match the final ABI and revert behavior.

**Steps:**

- [ ] Add `PAYOUT_REQUESTED` to `State` and payout fields to `Campaign`: request hash, amount, requested timestamp and decision hash. Keep the new local deployment enum layout explicit because the disposable local chain is redeployed.
- [ ] Add dedicated errors/events for invalid payout request, unauthorized payout decision and request mismatch; keep error messages/decode signatures useful to the frontend.
- [ ] Implement `requestPayout(uint256,bytes32,uint256)` with Creator-only authorization, `RELEASED`, expired challenge window, zero open disputes, exact escrow amount and non-zero inputs.
- [ ] Implement `approvePayout(uint256,bytes32,bytes32)` with Resolver/Backup takeover authorization, matching request hash, zero disputes, state-before-transfer accounting, exact frozen Creator recipient and retry-safe revert behavior.
- [ ] Implement `rejectPayout(uint256,bytes32,bytes32)` with the same Resolver authority and return to `RELEASED` while retaining the decision hash and request history in events.
- [ ] Remove the generic `payout(uint256)` entry point and its permissionless transfer behavior.
- [ ] Update `cancelCampaign` and `startRefunds` guards so a pending payout request cannot be converted into an unauthorized refund path; preserve the existing pre-payout cancellation policy where it is still explicitly allowed.
- [ ] Run all Campaign Foundry tests, including fuzz tests, and fix every stale old-state expectation:

```powershell
cd C:\Users\dell\Desktop\FundTogether\contracts
forge test --match-path test/unit/Campaigns
```

## Task 3 — Regenerate verified ABI and deployment artifacts

**Files:**

- Regenerate `backend/src/blockchain/generated/campaigns/fund-together-campaign.abi.json` through the existing `npm run artifacts:campaigns` path.
- Regenerate/update the local deployment manifest and contract bytecode artifact consumed by `backend/src/blockchain/deployment.ts` and the frontend transaction layer.
- Update any ABI fixture or artifact hash assertions under `backend/src/blockchain` and `frontend/src/features/campaigns`.

**Steps:**

- [ ] Run the repository’s existing artifact command from `backend`, not an ad-hoc copy:

```powershell
cd C:\Users\dell\Desktop\FundTogether\backend
npm run artifacts:campaigns
```

- [ ] Verify the generated ABI contains `requestPayout`, `approvePayout`, `rejectPayout`, the payout events and the new campaign tuple fields, and no callable `payout` function.
- [ ] Verify `abiVersion`, `abiHash`, `contractCodeHash`, deployment block and genesis hash are regenerated as one consistent manifest set.
- [ ] Add/update an artifact test that rejects a runtime with stale ABI/bytecode rather than allowing the frontend to submit against the wrong contract.

## Task 4 — Add payout dossier persistence, validation and private access

**Files:**

- Modify `backend/src/database/schema/campaigns.schema.ts` to add `CampaignChainSnapshot` payout fields and the payout request/decision/file tables.
- Create `backend/drizzle/fundtogether/0007_campaign_payout_requests.sql` (or the next migration number actually available when implementation starts).
- Create `backend/src/modules/payout/schemas/payout.schema.ts`.
- Create `backend/src/modules/payout/services/payout.service.ts`.
- Create `backend/src/modules/payout/controllers/payout.controller.ts` and register the controller/provider in `backend/src/app.module.ts`.
- Add `backend/src/modules/payout/tests/payout.service.spec.ts` and `backend/src/modules/payout/tests/payout-http.spec.ts`.

**Steps:**

- [ ] Define `campaignPayoutRequests` with campaign/stream/creator/commitment references, revision, request hash, integer amount, title, summary, reason, breakdown, lifecycle status, request/decision/paid transaction hashes, decision metadata and timestamps.
- [ ] Define `campaignPayoutRequestFiles` with request reference, private object ID, original display name, media type, byte size and SHA-256; enforce bounded file count/size and immutable revision rows.
- [ ] Add immutable decision rows so rejection/change requests do not overwrite the previous Resolver reason or hash.
- [ ] Validate the Creator form with strict Zod schemas: amount as a decimal integer string, bounded text fields, at least one supporting file, allowed document/PDF media types, and no unknown fields.
- [ ] On `POST /v1/fundtogether/campaigns/:id/payout-requests`, require Creator ownership, canonical `RELEASED` state, expired challenge deadline, zero open disputes, amount equal to canonical escrow and no pending request; store files privately and return the revision plus `requestHash` needed by the wallet transaction.
- [ ] On `GET` request/list endpoints, allow only the Creator, Resolver role and users with a canonical campaign entitlement; redact object IDs and return short-lived authenticated file access routes.
- [ ] Add Resolver decision preparation endpoint that stores an immutable reason/outcome record and returns `decisionHash`; do not mark the request approved from this endpoint.
- [ ] Add request revision behavior: rejected/changes-requested request remains readable, while a new request creates a new revision and new file hashes.
- [ ] Test unrelated-user denial, non-canonical backer denial, stale commitment denial, amount mismatch, duplicate revision, file integrity, and private download ACL.

## Task 5 — Make indexer and receipt synchronization payout-aware

**Files:**

- Modify `backend/src/indexer/campaign-indexer.service.ts`.
- Modify `backend/src/modules/campaigns/controllers/chain.controller.ts`.
- Modify `backend/src/modules/campaigns/services/publication.service.ts` only where the canonical snapshot/status response needs payout data.
- Modify `backend/src/modules/payout/services/payout.service.ts` to consume canonical events as projections, not as authority.
- Extend `backend/src/indexer/tests/campaign-indexer.integration.spec.ts` and relevant delivery HTTP tests.

**Steps:**

- [ ] Replace `payout` in `CampaignTransactionAction` and `expectedEvent` with `requestPayout -> PayoutRequested`, `approvePayout -> PayoutApproved` and `rejectPayout -> PayoutRejected`.
- [ ] Extend the sync action Zod enum and transaction decoding checks so function name, campaign ID, request hash, amount and actor are matched to the authenticated user and expected dossier.
- [ ] Extend `CampaignChainSnapshot` serialization with payout request hash, amount, requested timestamp and decision hash; refresh the canonical campaign snapshot when payout events appear, not only when `CampaignCreated` is replayed.
- [ ] Add a canonical status mapping for `PAYOUT_REQUESTED` and ensure `COMPLETED` is only projected after `PaidOut`, never after `PayoutRequested` or a successful wallet submission alone.
- [ ] On `PayoutRequested`, transition the exact dossier revision to `SUBMITTED_ON_CHAIN`/`UNDER_REVIEW` only after the canonical receipt and matching hash/amount are verified.
- [ ] On `PayoutRejected`, persist the decision outcome and return the current UI projection to the eligible released state; do not treat it as paid.
- [ ] On `PayoutApproved` and `PaidOut`, attach transaction hashes and mark the request `APPROVED`/`PAID_OUT` only when the corresponding canonical events are present; verify paid amount equals the request and escrow reaches zero.
- [ ] Make event replay idempotent and test submitted, reverted, unrelated, reorged and indexer-lag states.
- [ ] Remove all backend references that would accept a generic `payout` receipt.

## Task 6 — Update frontend transaction types, recovery and API contracts

**Files:**

- Modify `frontend/src/features/campaigns/api/campaigns.ts`.
- Modify `frontend/src/features/campaigns/transactions/useTransaction.ts`.
- Modify `frontend/src/features/campaigns/transactions/recovery.ts`.
- Modify `frontend/src/features/campaigns/shared/ui/campaignState.ts` and other shared state helpers that use numeric contract states.
- Add frontend API/types for payout dossier and decision preparation, keeping wallet transaction actions separate from HTTP dossier actions.
- Extend `frontend/scripts/campaigns-transaction-recovery.test.mjs`, `campaigns-operational-boundaries.test.mjs` and add `frontend/scripts/campaigns-payout.test.mjs` if a dedicated fixture is clearer.

**Steps:**

- [ ] Remove `payout` from all transaction action unions, recovery records and expected-event logic; add `requestPayout`, `approvePayout`, `rejectPayout`.
- [ ] Add typed `CampaignPayoutRequest`, file metadata, decision and lifecycle DTOs, plus `CampaignChain` payout snapshot fields.
- [ ] Make `useTransaction` submit only the three new ABI methods, use role-specific `expectedWallet`, and retain the existing preflight → receipt → canonical sync lifecycle.
- [ ] Improve error decoding for payout-specific custom errors and stale request/decision hash failures without displaying raw ABI noise as the primary user message.
- [ ] Ensure transaction recovery can reconcile each new action independently and never clears a pending request after only a wallet notification.
- [ ] Add numeric state constants or one shared mapping so the inserted `PAYOUT_REQUESTED` state does not leave stale `COMPLETED`, refund or production labels in the UI.

## Task 7 — Build the Creator, Backer and Resolver payout surfaces

**Files:**

- Modify `frontend/src/features/campaigns/public/Page.tsx` to remove the old generic payout button and render role-specific payout state.
- Modify `frontend/src/features/campaigns/creator/Studio.tsx`, `frontend/src/features/campaigns/shared/ui/CreatorTaskCard.tsx` and/or add `frontend/src/features/campaigns/creator/PayoutRequestPanel.tsx` for the Creator form and task route.
- Modify `frontend/src/features/campaigns/resolver/Console.tsx` and/or add `frontend/src/features/campaigns/resolver/PayoutReviewPanel.tsx` for Resolver review/decision actions.
- Modify the Backer/community surface used by `Page.tsx` and `Community.tsx` to show dossier files, hashes and feedback controls without financial CTAs.
- Modify `frontend/src/features/campaigns/shared/styles.css` only for the new form/review states, matching existing layout conventions.

**Steps:**

- [ ] Creator: show the request form only when canonical state is `RELEASED`, challenge deadline has passed and no disputes are open; display escrow and required payout amount side by side.
- [ ] Creator: require title/summary/reason/breakdown and supporting file upload, create the off-chain dossier first, then call `requestPayout` with the returned hash and exact amount.
- [ ] Creator: show clear `submitted`, `receipt confirmed`, `waiting for indexer`, `rejected/changes requested` and `paid out` states; never show success on transaction submission alone.
- [ ] Backer: show the canonical submitted dossier and private file access only after `PayoutRequested`; allow advisory comments/issues; hide approve/reject/request/cancel financial controls.
- [ ] Resolver: show exact amount versus escrow, request revision/hash, file hashes, Backer feedback and Primary/Backup eligibility; prepare a decision record before wallet approval/rejection.
- [ ] Resolver: call `approvePayout` or `rejectPayout` with the matching request/decision hashes and correct expected Resolver wallet; show canonical result after indexer sync.
- [ ] Remove the text/action `Trả Creator khi đủ điều kiện` and all direct `tx.send('payout', ...)` paths.
- [ ] Test role visibility, route presence, state gating, wrong-wallet messaging, rejection/retry rendering and the absence of the old generic payout CTA.

## Task 8 — Update policy docs and manual test scenarios

**Files:**

- Modify `docs/campaigns/FINANCIAL_POLICY_V1.md`.
- Modify `docs/campaigns/WORKFLOWS.md`.
- Modify `docs/campaigns/POST_MVP_WORKFLOW.md` where current-state text still says permissionless payout.
- Modify `docs/campaigns/MANUAL_TEST_GUIDE.md`.
- Modify `docs/campaigns/README.md` or `docs/campaigns/SCOPE.md` only if their current payout boundary is contradicted.

**Steps:**

- [ ] Replace “anyone may trigger payout” with the explicit Creator request → Resolver decision boundary and contract-enforced permissions.
- [ ] Document `PAYOUT_REQUESTED`, request/decision hashes, one final full-escrow payout, rejection/revision and transfer-failure retry semantics.
- [ ] Document that Backer feedback is visible/advisory and does not grant approval power.
- [ ] Update the manual flow from `RELEASED -> COMPLETED/payout` to `RELEASED -> PAYOUT_REQUESTED -> COMPLETED`, including a rejection branch and no-bypass direct RPC test.
- [ ] Keep research direction and MVP boundaries explicit: no partial/staged payout or automated timer payout.

## Task 9 — Run full verification, reset disposable runtime, and execute the happy path

**Files:**

- No source files should be changed in this task unless verification exposes a defect; if a defect is found, return to the relevant task and add a regression test first.
- Use the existing runtime launcher and disposable local state directories only.

**Steps:**

- [ ] Run contract tests and fuzz tests.
- [ ] Run backend Campaign suites and the full Jest suite from `backend`.
- [ ] Run frontend tests and TypeScript/Vite build from `frontend`.
- [ ] Run the existing runtime reset/redeploy procedure for Anvil, PostgreSQL and MinIO, then seed fresh local accounts/MockUSDC. Preserve the source working tree.
- [ ] Execute the manual happy path: accepted release → challenge deadline → Creator dossier/file upload → Creator `requestPayout` → canonical index → Backer view/feedback → Resolver decision → canonical `PaidOut` → `COMPLETED`, escrow zero, exact Creator balance increase.
- [ ] Execute rejection/new-revision, wrong-wallet/direct-RPC denial, failed-token-transfer retry, indexer replay and refund-path checks.
- [ ] Capture final command results and confirm no remaining old `payout` contract/API/frontend/docs references except historical migration/test notes that are explicitly labeled.

Suggested verification commands:

```powershell
cd C:\Users\dell\Desktop\FundTogether\contracts
forge test

cd C:\Users\dell\Desktop\FundTogether\backend
npm run test:campaigns
npm test -- --runInBand
npm run build

cd C:\Users\dell\Desktop\FundTogether\frontend
npm.cmd test
npm.cmd run build
```

## Completion Criteria

- The contract has no permissionless `payout()` function.
- A direct RPC call by Backer, Creator-as-non-resolver, unrelated wallet or DevTools caller cannot move escrow.
- A Creator can submit exactly one full-escrow request revision after release eligibility, and a Resolver can approve/reject it with an immutable decision hash.
- Backers and Resolver can inspect the private dossier under server-enforced ACL; unrelated users cannot.
- The UI has no generic payout button and accurately distinguishes request submitted, canonical review, approval and paid-out states.
- Contract, backend, frontend and documentation suites pass, and the reset local runtime completes the manual happy path plus rejection/retry/refund branches.
