# FundTogether Completion and Surplus Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old one-time full-escrow payout flow with a Resolver-approved completion flow that releases `goal` to the Creator and makes `raised - goal` claimable pro-rata by every Backer, either as a refund or a Creator donation.

**Architecture:** The contract remains the financial authority. It will accept a Creator completion request only after the existing final-PDF release and challenge gates, let an authorized Resolver approve or reject without a new timer, and expose a one-time Backer surplus claim. The backend stores the private completion dossier and indexed claims; the frontend renders role-specific review and settlement actions; the indexer derives all canonical statuses from events.

**Tech Stack:** Solidity 0.8.24, Foundry, OpenZeppelin SafeERC20/ReentrancyGuard, NestJS/TypeScript, Drizzle/PostgreSQL, MinIO, React/Vite, viem/wagmi, Anvil chain 31339, MockUSDC with 6 decimals.

**Spec:** `docs/superpowers/specs/2026-10-18-fundtogether-completion-surplus-settlement-design.md`

## Global Constraints

- Keep FundTogether scoped to `COMICS_ARTBOOK`, one standard digital PDF tier, MockUSDC, and local chain `31339`.
- The financial formula is `surplus = max(raised - goal, 0)` and `share = surplus * backerContribution / raised`, using integer base units only.
- Completion approval pays exactly `goal` to the frozen Creator wallet and leaves only `raised - goal` in escrow for Backer settlement.
- Completion approval, surplus claims, refunds, pledge custody, and transfer authorization are contract-owned; backend rows and UI state cannot manufacture financial success.
- `COMPLETED` means Resolver-approved completion and may retain a non-zero escrow surplus until Backers claim it.
- Backers have exactly two MVP destinations: `REFUND_TO_BACKER` and `DONATE_TO_CREATOR`; no Admin destination or fee split is implemented.
- Preserve the existing production evidence, final-PDF, release, challenge, dispute, entitlement, and refund boundaries unless this plan explicitly changes them.
- No fixed Resolver wait is added to completion review; existing release challenge/deadline rules remain separate.
- Every wallet action must distinguish request, submission, mined receipt, canonical event, indexer projection, and UI confirmation.
- Preserve unrelated dirty source changes and never print or commit local credentials, private keys, seed phrases, or tokens.

## Review Focus

- `raised <= goal`: completion succeeds but creates no surplus claim pool. Test in Task 1.
- Unequal Backer contributions: every Backer receives a pro-rata share, not only the first or last Backer. Test in Task 1 and Task 8.
- Integer rounding: the final claim receives only the deterministic remaining base units; total claims equal the pool. Test in Task 1.
- Duplicate or changed destination: a Backer cannot claim twice or switch from refund to Creator donation after confirmation. Test in Task 1 and Task 6.
- Stale receipt/database state: a submitted transaction or stale projection never displays completed/claimed financial state. Test in Task 4 and Task 7.

## Current Files and Responsibilities

- `contracts/src/campaigns/FundTogetherCampaign.sol`: campaign state machine, completion authority, surplus accounting, claim transfers, and canonical events.
- `contracts/test/unit/Campaigns/CampaignEscrow.t.sol`: Foundry state-transition, access-control, conservation, replay, and failed-transfer tests.
- `backend/src/blockchain/deployment.ts` and `backend/src/blockchain/generated/campaigns/`: ABI, ABI hash, policy hash, and deployment identity consumed by API/indexer.
- `backend/src/indexer/campaign-indexer.service.ts`: receipt validation, event replay, canonical campaign snapshots, completion projections, and surplus-claim projections.
- `backend/src/database/schema/campaigns.schema.ts` and `backend/drizzle/fundtogether/`: completion dossier, private file, decision, and surplus-claim projection schema.
- `backend/src/modules/payout/`: replace the old payout dossier/controller with a completion dossier service/controller; no old payout route may remain active.
- `frontend/src/features/campaigns/api/campaigns.ts`: chain snapshot, completion request, claim projection, and transaction action types.
- `frontend/src/features/campaigns/transactions/useTransaction.ts` and `recovery.ts`: ABI calls and recovery labels for completion and surplus claims.
- `frontend/src/features/campaigns/shared/ui/CompletionSettlementPanel.tsx`: role-specific Creator, Resolver, and Backer UI for completion review and settlement.
- `frontend/src/features/campaigns/public/Page.tsx`, `resolver/Console.tsx`, `shared/ui/CreatorTaskCard.tsx`, `shared/ui/ActivationPanel.tsx`, and `shared/ui/campaignState.ts`: route wiring, task copy, and state labels.
- `docs/campaigns/WORKFLOWS.md`, `FINANCIAL_POLICY_V1.md`, `POST_MVP_WORKFLOW.md`, and `MANUAL_TEST_GUIDE.md`: executable product policy and manual test instructions.

## Implementation Tasks

### Task 1: Replace contract payout semantics with completion and surplus settlement

**Files:**
- Modify: `contracts/src/campaigns/FundTogetherCampaign.sol`
- Test: `contracts/test/unit/Campaigns/CampaignEscrow.t.sol`

**Interfaces:**
- Produce `State.COMPLETION_REQUESTED` at the existing numeric slot currently used by `PAYOUT_REQUESTED`, while retaining `State.COMPLETED` as the next state.
- Produce `enum SurplusChoice { REFUND_TO_BACKER, DONATE_TO_CREATOR }`.
- Produce `requestCompletion(uint256 campaignId, bytes32 dossierHash)`, `approveCompletion(uint256 campaignId, bytes32 dossierHash, bytes32 decisionHash)`, `rejectCompletion(uint256 campaignId, bytes32 dossierHash, bytes32 decisionHash)`, `claimSurplus(uint256 campaignId, SurplusChoice choice)`, and `claimableSurplus(uint256 campaignId, address backer) view returns (uint256)`.
- Produce canonical `CompletionRequested`, `CompletionApproved`, `CompletionRejected`, and `SurplusClaimed` events containing campaign ID, hashes, actors, choice, recipient, and exact amount where relevant.

- [x] **Step 1: Replace the old payout tests with failing completion/settlement tests.** Cover: only the Creator can request after `RELEASED`, challenge deadline, and zero disputes; Resolver approval/rejection; no fixed Resolver timer; `raised <= goal`; `raised - goal`; unequal contributions; final rounding remainder; refund/donate choices; duplicate claim; unauthorized direct RPC; and failed token transfer rollback.
- [x] **Step 2: Run the focused Foundry tests and verify they fail for the old behavior.**

Run from `contracts`:

```powershell
forge test --match-path test/unit/Campaigns/CampaignEscrow.t.sol -vv
```

Expected: failures identify old `requestPayout`/`approvePayout` assumptions, missing completion functions, and missing surplus accounting.
- [x] **Step 3: Implement the minimum contract state and accounting.** Replace old payout-only storage/events/functions with completion request fields, surplus pool snapshots, per-campaign Backer claimant tracking, and `SurplusChoice`. Keep `SafeERC20`, `nonReentrant`, frozen Creator wallet, and state-before-transfer ordering.
- [x] **Step 4: Implement exact state gates.** `requestCompletion` is Creator-only and requires `RELEASED`, passed challenge deadline, and zero disputes. Resolver approval/rejection is Primary-or-Backup authorization without a new seven-day payout delay. Rejection returns to `RELEASED`; approval freezes `raised`, computes `max(raised - goal, 0)`, sets `escrowed` to that surplus, transfers exactly `goal` to the frozen Creator wallet, and enters `COMPLETED` atomically.
- [x] **Step 5: Implement one-time pro-rata claims.** Calculate each Backer's floor share from the completion snapshot. The final eligible claimant receives the remaining pool base units, bounded by the pool. Mark the claimant before `_transfer`; a failed transfer must revert the mark and preserve retryability. Refund sends to `msg.sender`; donation sends only to the frozen Creator.
- [x] **Step 6: Remove old payout paths and update cancellation/refund guards.** No `requestPayout`, `approvePayout`, `rejectPayout`, or arbitrary payout alias remains in the Campaign ABI. A pending completion request blocks cancellation/refunds; `COMPLETED` blocks funding/refund transitions while allowing claims.
- [x] **Step 7: Run the focused Foundry tests and verify they pass.**

Expected: all completion, access-control, conservation, replay, rounding, and transfer-failure tests pass.
- [x] **Step 8: Run the full Campaign contract test set.**

Run: `forge test --match-path test/unit/Campaigns -vv`

Expected: PASS with no old payout test or state expectation remaining, and with `goal + surplusPool == raised` after completion.

### Task 2: Version and regenerate the Campaign deployment artifacts

**Files:**
- Modify: `contracts/src/campaigns/FundTogetherCampaign.sol` policy hash string
- Modify: `backend/src/blockchain/deployment.ts`
- Modify: `backend/scripts/campaigns/deploy-campaign.cjs`
- Modify: `frontend/src/lib/web3/deployment-policy.ts`
- Modify: `frontend/src/features/campaigns/transactions/useTransaction.ts`
- Modify: `frontend/src/features/campaigns/transactions/recovery.ts`
- Regenerate: `backend/src/blockchain/generated/campaigns/fund-together-campaign.abi.json` and deployment manifest outputs
- Test: `backend/src/blockchain/deployment.spec.ts`, `backend/scripts/campaigns/artifact-contract.test.cjs`, `backend/scripts/campaigns/start-services.test.cjs`

**Interfaces:**
- Use policy hash `keccak256("campaigns-local-escrow-v5")` and ABI version `campaigns-local-v5` consistently across contract, backend, frontend, manifest validation, and runtime checks.
- Transaction actions become `requestCompletion`, `approveCompletion`, `rejectCompletion`, and `claimSurplus`; old payout actions are removed from active Campaign paths.

- [x] **Step 1: Add failing artifact/deployment assertions.** Assert v5 identity, the four new functions/events, `claimableSurplus`, and absence of old payout functions.
- [x] **Step 2: Run artifact/deployment tests and verify they fail against v4/old ABI.**
- [x] **Step 3: Update the policy/version gates and generate artifacts.** Run from `backend`:

```powershell
npm run artifacts:campaigns
```

Do not hand-edit generated ABI JSON. Update any checked-in fallback manifest only through the repository's existing generation path.
- [x] **Step 4: Run deployment/artifact tests and verify they pass.**
- [x] **Step 5: Run `npm run build --prefix backend` and confirm the backend accepts only the v5 ABI/policy identity.**

### Task 3: Add completion dossier and surplus projection storage/API

**Files:**
- Create: `backend/drizzle/fundtogether/0008_campaign_completion_surplus.sql`
- Modify: `backend/src/database/schema/campaigns.schema.ts`
- Create/modify: `backend/src/modules/completion/schemas/completion.schema.ts`
- Create/modify: `backend/src/modules/completion/services/completion.service.ts`
- Create/modify: `backend/src/modules/completion/controllers/completion.controller.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/modules/completion/tests/completion.service.spec.ts`
- Test: `backend/src/modules/completion/tests/completion-http.spec.ts`

**Interfaces:**
- `POST /v1/fundtogether/campaigns/:id/completion-requests` accepts `title`, `summary`, `reason`, and optional private `files[]`; it does not accept a payout amount or destination.
- `GET /v1/fundtogether/campaigns/:id/completion-requests` returns authorized dossier revisions and decisions.
- `GET /v1/fundtogether/campaigns/:id/completion-requests/:requestId/files/:fileId` returns an authenticated private file.
- `POST /v1/fundtogether/completion-requests/:requestId/decisions` accepts `APPROVE`, `CHANGES_REQUESTED`, or `REJECT` plus a bounded reason and returns a decision hash for the Resolver wallet transaction.
- `GET /v1/fundtogether/campaigns/:id/surplus-claims` returns canonical claim projections; no backend endpoint can mark a claim successful.
- `CompletionService.create`, `list`, `readFile`, `prepareDecision`, and `listClaims` own validation, ACL, private storage, and projection reads.

- [x] **Step 1: Add failing service/HTTP tests.** Test Creator-only submission, optional first dossier files, revision after rejection, Resolver-only decision preparation, canonical Backer/Resolver/Creator read access, unrelated-user denial, and no accepted `amount`/`destination` fields.
- [x] **Step 2: Run the focused backend tests and verify they fail because the completion module/routes/schema do not exist.**
- [x] **Step 3: Add migration 0008 and Drizzle schema.** Create completion request, private file, decision, and surplus claim projection tables. Keep old 0007 tables untouched as historical rows; remove all active service/controller references to them rather than destructively dropping data.
- [x] **Step 4: Implement `CompletionService`.** Gate dossier creation on canonical `RELEASED`, passed challenge deadline, and zero disputes; compute a deterministic dossier hash over campaign/stream/commitment/revision/form/file hashes; permit optional files; store files in existing private storage; make revisions immutable; and do not accept a Creator payout amount because the contract settles exactly `goal`.
- [x] **Step 5: Implement Resolver decision preparation and ACL.** Require the DB Resolver role and canonical `COMPLETION_REQUESTED` state. Record decision hash off-chain, but leave the financial transition to `approveCompletion`/`rejectCompletion` receipt processing.
- [x] **Step 6: Register the new controller/service and remove the active old payout controller/service routes.** Ensure old `/payout-requests` endpoints cannot create or decide financial actions.
- [x] **Step 7: Run migration and focused tests.**

Run from `backend`:

```powershell
npm run db:fundtogether:migrate
npm test -- --runInBand src/modules/completion/tests/completion.service.spec.ts src/modules/completion/tests/completion-http.spec.ts
```

Expected: PASS; a backend row alone must never be reported as completion or settlement success.

### Task 4: Update the indexer and canonical chain projection

**Files:**
- Modify: `backend/src/indexer/campaign-indexer.service.ts`
- Modify: `backend/src/indexer/tests/campaign-indexer.integration.spec.ts`
- Modify: `backend/src/modules/campaigns/services/publication.service.ts` if snapshot serialization needs the new fields
- Modify: `frontend/src/features/campaigns/api/campaigns.ts` shared snapshot types as needed by the backend contract

**Interfaces:**
- Extend `CampaignChain.snapshot` with completion hash/timestamp/decision hash, surplus pool/raised snapshot/claimed amount/claimant count, and Backer count.
- Receipt action validation must recognize `requestCompletion`, `approveCompletion`, `rejectCompletion`, and `claimSurplus` with exact expected function arguments and event hashes.
- Canonical sync must project `CompletionRequested`, `CompletionApproved`, `CompletionRejected`, and `SurplusClaimed` idempotently by stream, transaction hash, log index, and block hash.

- [x] **Step 1: Add failing integration tests.** Cover request/decision/claim event matching, claim choice and amount, wrong hash rejection, replayed sync, and canonical claim projection after a receipt.
- [x] **Step 2: Run the focused integration test and verify it fails against old event names/ABI.**
- [x] **Step 3: Update receipt validation and snapshot reads.** Require completion dossier/decision hashes to match DB records, require the frozen Creator/Resolver actor, and reject a receipt that only has a wallet submission without a successful canonical event.
- [x] **Step 4: Update sync projections.** Match claims by campaign, backer wallet, choice, recipient, and amount; mark noncanonical rows unavailable after reorg; never create duplicate claim rows on replay.
- [x] **Step 5: Run the integration test and the full Campaign backend suite.**

Run from `backend`:

```powershell
npm test -- --runInBand src/indexer/tests/campaign-indexer.integration.spec.ts
npm run test:campaigns
```

Expected: PASS with canonical states distinguished from submitted/indexing states.

### Task 5: Replace frontend payout UI with completion and Backer settlement UI

**Files:**
- Create: `frontend/src/features/campaigns/shared/ui/CompletionSettlementPanel.tsx`
- Delete after route replacement: `frontend/src/features/campaigns/shared/ui/PayoutRequestPanel.tsx`
- Modify: `frontend/src/features/campaigns/public/Page.tsx`
- Modify: `frontend/src/features/campaigns/api/campaigns.ts`
- Modify: `frontend/src/features/campaigns/transactions/useTransaction.ts`
- Modify: `frontend/src/features/campaigns/transactions/recovery.ts`
- Modify: `frontend/src/features/campaigns/shared/ui/campaignState.ts`
- Modify: `frontend/src/features/campaigns/shared/ui/ActivationPanel.tsx`
- Modify: `frontend/src/features/campaigns/shared/ui/CreatorTaskCard.tsx`
- Modify: `frontend/src/features/campaigns/resolver/Console.tsx`
- Modify: relevant Campaign CSS/test scripts under `frontend/scripts/`

**Interfaces:**
- `campaignApi.completionRequests`, `createCompletionRequest`, `completionFile`, `prepareCompletionDecision`, and `surplusClaims` replace payout API calls.
- `claimSurplus` sends `[campaignId, choice]`, where `choice=0` is refund and `choice=1` is Creator donation; `expectedWallet` is the connected canonical Backer wallet.
- Completion requests are available only in the canonical post-release eligible state; Backer settlement controls appear only after canonical `COMPLETED`.

- [x] **Step 1: Add failing frontend assertions.** Assert no payout wording/CTA remains; Creator sees completion request; Resolver sees approve/reject without countdown; Backer sees dossier and exactly two settlement choices; claimed state disables both choices.
- [x] **Step 2: Run frontend tests and verify they fail against the old payout panel and action names.**
- [x] **Step 3: Implement API/types and transaction actions.** Add v5 snapshot fields, request/decision/claim types, canonical status copy, wallet recovery labels, and exact contract arguments.
- [x] **Step 4: Implement `CompletionSettlementPanel`.** Reuse existing authenticated private-file download and review surfaces, show completion request history, show the Backer's exact `claimableSurplus` quote from the contract, and refresh only after canonical receipt/indexer confirmation.
- [x] **Step 5: Wire Creator, Resolver, and Backer modes.** Creator submits the dossier; Resolver prepares a reason and signs the decision; Backer chooses refund or Creator donation. Do not render an Admin destination or a payout amount form.
- [x] **Step 6: Update state/task copy and remove stale challenge-to-payout instructions.** Keep release challenge copy where it still applies, but replace “requestPayout/full escrow payout” with “request completion/surplus settlement”.
- [x] **Step 7: Run frontend tests and build.**

Run from `frontend`:

```powershell
npm test
npm run build
```

Expected: PASS with no active Campaign code referencing old payout actions or labels.

### Task 6: Update policy and workflow documentation

**Files:**
- Modify: `docs/campaigns/WORKFLOWS.md`
- Modify: `docs/campaigns/FINANCIAL_POLICY_V1.md`
- Modify: `docs/campaigns/POST_MVP_WORKFLOW.md`
- Modify: `docs/campaigns/MANUAL_TEST_GUIDE.md`
- Modify: `docs/superpowers/specs/2026-10-18-fundtogether-payout-request-flow-design.md` with a superseded notice
- Modify: `docs/superpowers/plans/2026-10-18-fundtogether-payout-request-flow.md` with a superseded notice

- [x] **Step 1: Replace the old one-time payout state diagrams and tables.** Document `RELEASED -> COMPLETION_REQUESTED -> COMPLETED -> SURPLUS_CLAIMABLE`, `raised - goal`, pro-rata Backer allocation, two destinations, no Admin split, and Resolver-only approval.
- [x] **Step 2: Document custody and failure rules.** State that completion approval does not automatically empty escrow; claim transfers are separate, one-time, guarded, and retryable after failed transfer.
- [x] **Step 3: Update the manual matrix.** Add unequal Backer contribution, rejected completion, re-submission, refund choice, Creator donation choice, duplicate claim, `raised <= goal`, and refresh/indexer recovery cases.
- [x] **Step 4: Run link/text checks and review for contradictions.** No current Campaign guide may say that `requestPayout`, full escrow payout, Admin fee split, or a fixed Resolver payout timer is active.

### Task 7: Run full automated verification before any runtime reset

**Files:**
- No source changes expected; inspect the full diff and generated artifacts.

- [x] **Step 1: Run Foundry Campaign tests.**

```powershell
Push-Location contracts
forge test --match-path test/unit/Campaigns -vv
Pop-Location
```

- [x] **Step 2: Run backend build, focused completion/indexer tests, and full Campaign tests.**

```powershell
Push-Location backend
npm run build
npm test -- --runInBand src/modules/completion/tests src/indexer/tests/campaign-indexer.integration.spec.ts
npm run test:campaigns
Pop-Location
```

- [x] **Step 3: Run frontend tests/build and repository hygiene checks.**

```powershell
Push-Location frontend
npm test
npm run build
Pop-Location
git diff --check
```

- [x] **Step 4: Search for stale active payout behavior.**

Run: `rg -n "requestPayout|approvePayout|rejectPayout|PAYOUT_REQUESTED|full-escrow payout|PayoutRequestPanel" contracts backend/src frontend/src docs/campaigns`

Expected: only explicit superseded-history notes or migration compatibility references remain; no active route, ABI action, UI CTA, or policy rule uses the old flow.

### Task 8: Reset disposable runtime, redeploy v5, seed, and execute the manual flow

**Files:**
- Runtime only: `.local/fundtogether/`, Docker volumes, generated deployment manifest.
- Preserve: all source files and unrelated worktree changes.

- [x] **Step 1: Back up the current disposable runtime.** Create a new timestamped directory under `.local/fundtogether/reset-backups/`; move Anvil state/manifest files there after stopping the API, web, and chain supervisor. Do not overwrite the existing `20261018-payout-final-reset` backup.
- [x] **Step 2: Recreate the isolated runtime.** Use the existing approved reset sequence: compose `down -v`, run `backend/scripts/campaigns/start-services.ps1`, run `npm run seed:accounts --prefix backend`, and verify chain `31339`, policy `campaigns-local-escrow-v5`, ABI `campaigns-local-v5`, and generated contract bytecode.
- [x] **Step 3: Execute the manual happy path with two unequal Backers.** Create/fund a campaign with goal `100`, then pledge `40` from Backer A and `160` from Backer B. Verify `raised=200`, `surplus=100`, and expected shares `20` and `80`.
- [x] **Step 4: Exercise completion review.** Creator submits completion dossier, Resolver rejects once, Creator submits a revision, Resolver approves without waiting seven days, and verify the campaign becomes canonical `COMPLETED` while escrow still contains the surplus pool.
- [x] **Step 5: Exercise both Backer destinations.** Backer A claims refund and Backer B donates to Creator. Verify the completion receipt paid exactly `goal` to Creator, `SurplusClaimed` events contain the correct pro-rata amounts, one claim per Backer, no Admin transfer, unchanged entitlement records, and no duplicate after refresh/replay.
- [x] **Step 6: Exercise the negative paths.** Verify no surplus when `raised <= goal`, unauthorized completion/claim calls revert, wrong hash/choice/duplicate calls revert, failed token transfer rolls back, and stale submitted/indexing UI never claims success.
- [x] **Step 7: Capture verification evidence.** Record deployment manifest, canonical transaction hashes, indexer projections, contract snapshot, claim amounts, and test commands/results without exposing credentials.

## Completion Criteria

The implementation is complete only when all of the following are evidenced:

- Contract tests prove Resolver-gated completion, pro-rata accounting, exact two-choice claims, rounding conservation, replay resistance, and failed-transfer rollback.
- ABI/deployment identity is v5 and no active Campaign path exposes old payout methods.
- Backend stores/reveals only authorized completion dossiers and projects canonical events idempotently.
- UI shows the Creator completion request, Resolver decision, and Backer-specific refund/Creator-donation choices with canonical transaction status.
- Documentation and manual test guide match the executable state machine.
- Fresh local runtime passes the two-Backer unequal-contribution flow and its rejection/duplicate/failure branches.
