# FundTogether Editions Activation and Pledge Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn an approved FundTogether Editions dossier into a recoverable `APPROVED → FUNDING → canonical pledge` journey without changing the contract or financial policy.

**Architecture:** Reuse the existing Editions contract, indexer, `publication-terms`, `chain`, and `sync-receipt` endpoints. Add a small frontend transaction-recovery layer backed only by public transaction hashes in browser storage, then compose dedicated activation and pledge-preflight surfaces around the existing `useEditionsTransaction` hook. The chain remains authoritative; local UI recovery state never grants funding, entitlement, download, refund, or payout rights.

**Tech Stack:** React 19, TypeScript, TanStack Query, Wagmi/Viem, existing Editions ABI and deployment verifier, NestJS API endpoints already under `/v1/reward/editions`.

**Spec:** `docs/research-direction.md`, `docs/PROJECT_OVERVIEW.md`, `docs/reward/EDITIONS_LOCAL_FINANCIAL_POLICY_V1.md`, `PRODUCT.md`, and the approved 2026-10-15 activation/pledge-recovery scope in chat.

> **Execution note:** Per the current user scope, focused test-file and commit steps are intentionally not counted in this implementation pass. Code changes were verified with the frontend production build and lint.

## Global Constraints

- Keep FundTogether Editions limited to `COMICS_ARTBOOK`, one `STANDARD` tier, one `DIGITAL_DOWNLOAD` PDF, and one canonical entitlement per accepted pledge log.
- Do not change `FundTogetherEditions.sol`, the Editions ABI, deployment manifest, payout rules, refund rules, challenge windows, fees, or policy version `editions-local-escrow-v1`.
- Do not add a transaction-attempt database table in this slice; browser recovery stores only the campaign, action, public transaction hash, lifecycle stage, and timestamps.
- Treat `ON_CHAIN_CONFIRMED` plus the canonical indexer binding as the only condition that makes a campaign funding-visible; a submitted or mined transaction alone is insufficient.
- Treat a pledge as complete only after successful receipt, `sync-receipt`, canonical indexer processing, and entitlement creation.
- Use `bigint`/base-unit strings for all token comparisons and display calculations; do not convert financial values to floating point.
- Check the linked account, connected wallet, chain `31339`, deployment identity, and expected actor before every signing operation.
- For `RESOLVER`, reject a wrong connected wallet before nonce/challenge/signature or contract signing; keep disconnect/change-wallet recovery available.
- Never retry an uncertain pledge automatically. The recovery action must reconcile the existing hash before offering a new transaction.
- Do not reintroduce physical fulfilment, shipping, inventory, multiple tiers, progressive funding, Reward Pass, or public/real-money launch behavior.
- Test additions and command output are verification checkpoints only; they are not counted as separate product scope for this plan.

## Review Focus

- A transaction is submitted or mined but indexer synchronization fails or the page reloads: retain the hash and offer status reconciliation, never a duplicate pledge CTA.
- A Resolver connects the wrong wallet: block signing before the wallet proof/signature path while leaving wallet disconnect/change available.
- A campaign is approved but `NOT_PUBLISHED` or `ORPHANED`: show activation/recovery state and never show a Backer pledge action.
- A campaign has a canonical binding but is not in contract state `FUNDING (0)`: show the actual lifecycle state and do not expose pledge.
- A Backer has the wrong account, chain, token balance, allowance, or an existing entitlement: explain the missing prerequisite and keep the single pledge action gated.

---

### Task 1: Durable Editions transaction recovery

**Files:**
- Create: `frontend/src/features/reward/editions-transaction-recovery.ts`
- Create: `frontend/src/features/reward/ui/EditionsTransactionStatus.tsx`
- Modify: `frontend/src/features/reward/useEditionsTransaction.ts`
- Modify: `frontend/src/features/reward/reward.css`
- Test: `frontend/scripts/editions-transaction-recovery.test.mjs`

**Interfaces:**

- `EditionsTransactionAction = 'approveCampaign' | 'createCampaign' | 'pledge' | 'reviewProduction' | 'reviewRelease' | 'challengeRelease' | 'resolveChallenge' | 'finalizeFunding' | 'startRefunds' | 'claimRefund' | 'payout' | 'cancelCampaign'`
- `EditionsTransactionStage = 'preflight' | 'awaiting_signature' | 'submitted' | 'receipt_confirmed' | 'indexing' | 'canonical' | 'failed'`
- `EditionsTransactionRecord`:

  ```ts
  {
    userId: string;
    campaignId: string;
    action: EditionsTransactionAction;
    txHash?: `0x${string}`;
    stage: EditionsTransactionStage;
    updatedAt: string;
    error?: string;
  }
  ```
- `getEditionsTransactionStorageKey(userId: string, campaignId: string, action: EditionsTransactionAction): string`
- `loadEditionsTransaction(userId: string, campaignId: string, action: EditionsTransactionAction): EditionsTransactionRecord | null`
- `saveEditionsTransaction(record: EditionsTransactionRecord): void`
- `clearEditionsTransaction(userId: string, campaignId: string, action: EditionsTransactionAction): void`
- `EditionsTransactionStatus({ record, onReconcile, busy }: { record: EditionsTransactionRecord | null; onReconcile?: () => void; busy?: boolean }): JSX.Element`
- Extend `useEditionsTransaction` to return `{ transaction, reconcile, send, busy, notice, error, address }`. `reconcile()` must return `'PENDING' | 'ON_CHAIN_CONFIRMED'` and clear the record only after `editionsApi.sync(txHash)` returns `ON_CHAIN_CONFIRMED`.

- [x] **Step 1: Define the storage record and stage transitions**

  Use the namespace `fundtogether:editions-tx:v1:<userId>:<campaignId>:<action>`. Persist no signature, private key, wallet seed, or token data. Treat malformed or stale JSON as absent rather than throwing during page load.

- [ ] **Step 2: Add the failing recovery assertions**

  Pin that a submitted hash survives a reload, `reconcile()` does not clear a pending receipt, a canonical sync clears the record, and an error record renders a recovery action instead of a second pledge action.

- [x] **Step 3: Extend `useEditionsTransaction`**

  Save `submitted` immediately after `writeContract`, save `receipt_confirmed` after a successful receipt, save `indexing` before `editionsApi.sync`, and save `canonical` only after the server confirms canonical processing. `reconcile()` must inspect the existing hash with the current chain client and then call the existing server sync endpoint; it must never call `writeContract`.

- [x] **Step 4: Implement `EditionsTransactionStatus`**

  Render Vietnamese lifecycle copy for wallet request, submitted, receipt, indexer pending, canonical, and failure states. Display the public hash in a technical disclosure. The primary recovery action is “Kiểm tra trạng thái”, not “Gửi lại giao dịch”.

- [ ] **Step 5: Run the focused verification**

  Run: `node --test frontend/scripts/editions-transaction-recovery.test.mjs`

  Expected: all recovery state assertions pass and no private signing material is written to browser storage.

- [ ] **Step 6: Commit the transaction recovery primitive**

  ```powershell
  git add frontend/src/features/reward/editions-transaction-recovery.ts frontend/src/features/reward/ui/EditionsTransactionStatus.tsx frontend/src/features/reward/useEditionsTransaction.ts frontend/src/features/reward/reward.css frontend/scripts/editions-transaction-recovery.test.mjs
  git commit -m "feat: add Editions transaction recovery state"
  ```

### Task 2: First-class APPROVED-to-FUNDING activation surface

**Files:**
- Create: `frontend/src/features/reward/ui/EditionsActivationPanel.tsx`
- Modify: `frontend/src/features/reward/EditionsCampaign.tsx`
- Modify: `frontend/src/features/reward/RewardResolverConsole.tsx`
- Modify: `frontend/src/features/reward/ui/campaignState.ts`
- Modify: `frontend/src/features/reward/reward.css`
- Test: `frontend/scripts/editions-activation.test.mjs`

**Interfaces:**

- `EditionsActivationPanel({ mode, terms, chain, transaction, busy, onRefresh, onActivate, onReconcile }: { mode: 'creator' | 'resolver'; terms?: EditionsTerms; chain?: EditionsChain; transaction: EditionsTransactionRecord | null; busy: boolean; onRefresh: () => void; onActivate: () => void; onReconcile: () => void }): JSX.Element`
- `getCampaignUiState` accepts an optional `publicationStatus?: 'NOT_PUBLISHED' | 'ORPHANED' | 'ON_CHAIN_CONFIRMED'` and uses it only for UI presentation; it must not become a second backend state store.

- [ ] **Step 1: Add activation-state assertions**

  Pin that `APPROVED + NOT_PUBLISHED` shows activation pending, `APPROVED + ORPHANED` shows recovery required, and `ON_CHAIN_CONFIRMED + snapshot.state === 0` shows funding available. None of these non-funding states may render a pledge action.

- [x] **Step 2: Implement `EditionsActivationPanel`**

  Show the frozen commitment hash, creator wallet, exact goal/price/deadline terms, publication status, and current transaction lifecycle. Use one primary action according to the actor: Primary Resolver signs `approveCampaign`; Creator creates the campaign only after `onchainApproved` is true. The component must not construct alternate terms or accept a client-supplied payout address.

- [x] **Step 3: Move the inline publication block out of `EditionsCampaign`**

  Keep query ownership and contract argument construction in the existing campaign container, but render the dedicated panel for authenticated Creator/Resolver views. Reuse `editionsApi.terms`, `editionsApi.chain`, and `useEditionsTransaction`; do not add a new endpoint or duplicate publication state.

- [x] **Step 4: Make the Resolver queue point to the activation action**

  For an approved campaign, the Resolver workspace must link to the activation panel and explain whether the next action is signing the exact terms or waiting for the Creator transaction. Preserve the existing Resolver-only role and wallet guards.

- [ ] **Step 5: Run the focused verification**

  Run: `node --test frontend/scripts/editions-activation.test.mjs`

  Expected: activation actions are actor-specific, stale or orphaned publication never becomes funding-visible, and technical status codes are not the primary user-facing label.

- [ ] **Step 6: Commit the activation surface**

  ```powershell
  git add frontend/src/features/reward/ui/EditionsActivationPanel.tsx frontend/src/features/reward/EditionsCampaign.tsx frontend/src/features/reward/RewardResolverConsole.tsx frontend/src/features/reward/ui/campaignState.ts frontend/src/features/reward/reward.css frontend/scripts/editions-activation.test.mjs
  git commit -m "feat: add Editions activation workspace"
  ```

### Task 3: Canonical Backer pledge preflight

**Files:**
- Create: `frontend/src/features/reward/ui/EditionsPledgePreflight.tsx`
- Modify: `frontend/src/features/reward/EditionsCampaign.tsx`
- Modify: `frontend/src/features/reward/ui/EditionsCommitmentCard.tsx`
- Modify: `frontend/src/features/reward/reward.css`
- Test: `frontend/scripts/editions-pledge-preflight.test.mjs`

**Interfaces:**

- `EditionsPledgePreflight({ campaignId, activeId, price, chain, deployment, entitlement, transaction, busy, onPledge, onReconcile }: { campaignId: string; activeId: bigint; price: string; chain: EditionsChain; deployment: EditionsDeployment; entitlement: EditionsEntitlement | null; transaction: EditionsTransactionRecord | null; busy: boolean; onPledge: () => void; onReconcile: () => void }): JSX.Element`
- `PledgeReadiness = 'READY' | 'SIGN_IN_REQUIRED' | 'WALLET_REQUIRED' | 'WRONG_CHAIN' | 'INSUFFICIENT_BALANCE' | 'ALREADY_PLEDGED' | 'NOT_FUNDING' | 'INDEXER_PENDING'`

- [ ] **Step 1: Add Backer preflight assertions**

  Pin that pledge is available only for `ON_CHAIN_CONFIRMED` with `snapshot.state === 0`, no existing entitlement, the linked wallet on chain `31339`, and sufficient MockUSDC balance. Pin that `APPROVED`, `NOT_PUBLISHED`, `ORPHANED`, production, refunding, and settled states render no pledge button.

- [x] **Step 2: Implement readiness checks with base-unit values**

  Use the configured Editions token and contract addresses. Compare `balance` and `allowance` against the exact string price as `bigint`; do not calculate a decimal balance with `Number`. Keep approval as an internal prerequisite of the existing `useEditionsTransaction.send(..., { pledgePrice })` path, not as a second user-facing pledge action.

- [x] **Step 3: Implement the single pledge action**

  Render the exact price, one-PDF entitlement, escrow boundary, and transaction lifecycle. Call `onPledge` only when readiness is `READY`; the callback must invoke `tx.send('pledge', [activeId], { pledgePrice: price })`. If a previous submitted hash exists, render `EditionsTransactionStatus` and reconcile before enabling another pledge attempt.

- [x] **Step 4: Integrate the preflight into campaign detail**

  Replace the raw pledge button in `EditionsCampaign` with the preflight component. Refresh chain and entitlement queries only after canonical sync, and keep the existing account-bound entitlement/download/refund behavior unchanged.

- [ ] **Step 5: Run the focused verification**

  Run: `node --test frontend/scripts/editions-pledge-preflight.test.mjs`

  Expected: only one funding CTA exists, all non-funding states are safe, and a submitted/uncertain transaction cannot produce a duplicate pledge action.

- [ ] **Step 6: Commit the pledge preflight**

  ```powershell
  git add frontend/src/features/reward/ui/EditionsPledgePreflight.tsx frontend/src/features/reward/EditionsCampaign.tsx frontend/src/features/reward/ui/EditionsCommitmentCard.tsx frontend/src/features/reward/reward.css frontend/scripts/editions-pledge-preflight.test.mjs
  git commit -m "feat: add canonical Editions pledge preflight"
  ```

### Task 4: Recovery copy, operational boundaries, and progress record

**Files:**
- Modify: `frontend/src/features/reward/EditionsCampaign.tsx`
- Modify: `frontend/src/features/reward/RewardAdminConsole.tsx`
- Modify: `frontend/src/features/reward/ui/ExceptionList.tsx`
- Modify: `frontend/src/features/reward/reward.css`
- Modify: `PRODUCT.md`
- Modify: `docs/PROJECT_PROGRESS.md`
- Test: `frontend/scripts/editions-operational-boundaries.test.mjs`

**Interfaces:**

- `EditionsCampaign` must distinguish application status (`APPROVED`), publication status (`NOT_PUBLISHED | ORPHANED | ON_CHAIN_CONFIRMED`), contract lifecycle (`FUNDING`, `PRODUCTION`, `REFUNDING`, `SETTLED`), and personal entitlement access.
- `ExceptionList` receives only operational exceptions derived from existing loaded responses; it must not invent financial state or mutate campaign state.

- [ ] **Step 1: Add operational boundary assertions**

  Pin that Admin/Resolver copy distinguishes “approved but not activated”, “transaction/indexer pending”, “orphaned binding”, and “canonical funding”. Pin that no application-only status is presented as proof of on-chain funding.

- [x] **Step 2: Surface actionable exceptions**

  Add compact exception messages for stale activation, orphaned binding, and indexer pending states. Link each exception to the relevant campaign activation/detail route. Do not add a manual database rebind or an Admin financial action.

- [x] **Step 3: Update the backer journey documentation**

  Update `PRODUCT.md` to describe the durable transaction recovery step and the rule that pledge completion requires receipt plus canonical indexer entitlement. Update `docs/PROJECT_PROGRESS.md` with the implemented activation/recovery boundary and clearly retain manual wallet acceptance and public-launch limitations as unverified/deferred.

- [ ] **Step 4: Run the focused verification**

  Run: `node --test frontend/scripts/editions-operational-boundaries.test.mjs`

  Expected: exception copy remains state-accurate and the active Editions surface never treats an application row, submitted hash, or receipt alone as a completed pledge.

- [ ] **Step 5: Commit the operational boundary update**

  ```powershell
  git add frontend/src/features/reward/EditionsCampaign.tsx frontend/src/features/reward/RewardAdminConsole.tsx frontend/src/features/reward/ui/ExceptionList.tsx frontend/src/features/reward/reward.css PRODUCT.md docs/PROJECT_PROGRESS.md frontend/scripts/editions-operational-boundaries.test.mjs
  git commit -m "docs: record Editions activation recovery boundaries"
  ```

## Execution Order

1. Task 1 establishes the transaction lifecycle and recovery contract.
2. Task 2 turns approved dossiers into a clear activation handoff.
3. Task 3 exposes pledge only after canonical funding and protects the Backer retry path.
4. Task 4 aligns operational surfaces and documentation with the executable behavior.

No Solidity, ABI, migration, financial-policy, payout, refund, or physical-fulfilment work is included in this plan.

## Self-Review Checklist

- [x] Every persisted state is recoverable from a public transaction hash and revalidated against chain/indexer state.
- [x] Every money-related action remains guarded by the existing linked-wallet and deployment checks.
- [x] `APPROVED`, publication status, contract state, and entitlement access remain separate fields.
- [x] No task introduces a second source of financial truth or an invented inventory/quantity rule.
- [x] The plan can be implemented without changing the Editions contract or adding a database migration.
