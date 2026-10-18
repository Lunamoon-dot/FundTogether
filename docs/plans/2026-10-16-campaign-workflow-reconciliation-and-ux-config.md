# FundTogether Workflow Reconciliation and UX Configuration Plan

> **For agentic workers:** Use the repository's approved execution workflow and update each checkbox only after the corresponding verification passes.

**Goal:** Make the current FundTogether workflows use one consistent application, publication, contract, indexer, entitlement, and recovery model across Creator, Resolver, Admin, and Backer surfaces.

**Scope:** Reconcile the already-built activation, pledge preflight, transaction recovery, review gating, delivery, and operational UI. This plan is a workflow correction and UX alignment pass; it does not introduce a new product flow.

**Architecture:**

```text
Campaign campaign row + review history
              │
              ├── publication binding + canonical indexer snapshot
              │                         │
              │                         └── contract lifecycle state
              │
              └── role-specific operational summary
                         │
                         ├── Creator Studio
                         ├── Resolver Queue
                         ├── Admin Exceptions
                         └── Backer detail / pledge preflight
```

**Source of truth:** PostgreSQL application status remains the review/application source. The Campaign contract and its canonical indexed binding remain the source for publication, funding, production, release, refund, and settlement state. Browser recovery state is advisory only and never grants a financial right.

**References:** `docs/research-direction.md`, `docs/PROJECT_OVERVIEW.md`, `docs/campaigns/WORKFLOWS.md`, `PRODUCT.md`, and `docs/plans/2026-10-15-campaign-activation-pledge-recovery.md`.

## Global Constraints

- Keep the product boundary at `COMICS_ARTBOOK`, one `STANDARD` tier, one `DIGITAL_DOWNLOAD` PDF, and one canonical entitlement per accepted pledge log.
- Do not change the Campaign contract, ABI, deployment identity, payout rules, refund rules, challenge windows, fee policy, or financial policy.
- Do not add a second financial source of truth by mirroring the Campaign binding into legacy `reward_campaigns.onchain_campaign_id`.
- Do not reintroduce physical fulfilment, shipping, inventory, multiple tiers, progressive funding, Reward Pass, or public/real-money launch behavior.
- Keep all token comparisons and progress calculations integer-safe with `bigint` or base-unit strings.
- Treat a submitted hash, mined receipt, or database message as incomplete until the expected event is canonical and the expected indexed projection/entitlement exists.
- Check the linked wallet, connected account, chain `31339`, deployment identity, and expected actor before every signing operation.
- Never retry an uncertain transaction automatically.
- Preserve existing dirty changes outside this plan. Contract changes, migration changes, and unrelated files must be separated or explicitly confirmed before a later commit.

## Canonical Workflow Model

The UI must derive its state from these independent dimensions:

| Dimension | Values | Meaning |
|---|---|---|
| Application status | `DRAFT`, `FROZEN`, `UNDER_REVIEW_PRIVATE`, `COMMUNITY_REVIEW`, `APPROVED`, `STOPPED` | Server-owned review and dossier lifecycle |
| Publication status | `NOT_PUBLISHED`, `ORPHANED`, `ON_CHAIN_CONFIRMED` | Current Campaign binding for the active deployment stream |
| Contract state | `FUNDING`, `PRODUCTION`, `RELEASE_REVIEW`, `RELEASED`, `REFUNDING`, `SETTLED` | On-chain financial and delivery lifecycle |
| Backer access | `PENDING_RELEASE`, `DOWNLOAD_ELIGIBLE`, `DELIVERY_UNAVAILABLE`, `REFUND_ELIGIBLE`, `REFUNDED`, `ORPHANED` | Account-bound entitlement projection |
| Transaction lifecycle | `preflight`, `awaiting_signature`, `submitted`, `receipt_confirmed`, `indexing`, `canonical`, `failed` | Recovery and operational progress only |

Required precedence:

```text
APPROVED + NOT_PUBLISHED       → activation pending, no pledge
APPROVED + ORPHANED            → recovery required, no pledge
APPROVED + ON_CHAIN_CONFIRMED
  + FUNDING                    → pledge preflight may become ready
  + any later contract state   → show lifecycle action, no pledge
```

`APPROVED` must never be rendered as proof of publication or funding.

---

## Task 1: Add one Campaign operational summary for all role surfaces

**Purpose:** Stop Creator, Resolver, and Admin dashboards from reading legacy `onchainCampaignId`/`projection` fields while the Campaign indexer writes to `campaignsChainCampaigns`.

**Files:**
- Modify: `backend/src/reward/reward-campaigns-publication.service.ts`
- Modify: `backend/src/reward/reward-campaigns-chain.controller.ts`
- Modify: `backend/src/reward/reward-campaigns.controller.ts`
- Modify: `frontend/src/lib/api/campaigns.ts`
- Modify: `frontend/src/lib/api/reward.ts` only if an existing role endpoint is replaced
- Test: existing Campaign HTTP tests plus a focused operational-summary test

**Interface:** Return a role-neutral summary containing:

```ts
{
  campaignId: string;
  applicationStatus: string;
  publicationStatus: 'NOT_PUBLISHED' | 'ORPHANED' | 'ON_CHAIN_CONFIRMED';
  onchainCampaignId: string | null;
  contractState: number | null;
  snapshot: CampaignChainSnapshot | null;
  bindingTransactionHash: string | null;
}
```

**Steps:**

- [x] Add a bounded batch lookup for the current Campaign deployment stream. It must distinguish no binding, non-canonical/orphaned binding, and one canonical binding without relying on `reward_campaigns.onchain_campaign_id`.
- [x] Keep the existing per-campaign `chain` endpoint behavior and reuse the same derivation rules for the batch summary.
- [x] Add authenticated role-filtered access for Creator, Resolver, and Admin views. Enforce role/ownership on the server; do not let the client choose another user's scope.
- [x] Include the binding transaction hash or event identity when available so orphaned recovery does not depend solely on browser `localStorage`.
- [x] Ensure the summary cannot expose private identity declarations, private samples, object keys, or final PDF bytes.
- [x] Add assertions for `NOT_PUBLISHED`, `ORPHANED`, canonical `FUNDING`, canonical later states, and a campaign with no legacy on-chain ID.

**Verification:** A canonical Campaign binding is visible in the role summary even when the legacy campaign row has `onchainCampaignId = null`; an orphaned binding is not funding-visible.

## Task 2: Reconfigure Creator, Resolver, and Admin workflow surfaces

**Purpose:** Make every operational surface use the same summary and stop presenting `APPROVED` as an action state by itself.

**Files:**
- Modify: `frontend/src/features/campaigns/RewardCreatorStudio.tsx`
- Modify: `frontend/src/features/campaigns/RewardResolverConsole.tsx`
- Modify: `frontend/src/features/campaigns/ui/ReviewQueue.tsx`
- Modify: `frontend/src/features/campaigns/RewardAdminConsole.tsx`
- Modify: `frontend/src/features/campaigns/ui/ExceptionList.tsx`
- Modify: `frontend/src/features/campaigns/ui/campaignState.ts`
- Modify: `frontend/src/lib/api/campaigns.ts`
- Test: `frontend/scripts/campaigns-operational-boundaries.test.mjs`

**Required behavior:**

- [x] Creator Studio shows editable preparation only for `DRAFT`, `FROZEN`, or the correction loop. `APPROVED` shows activation; `ORPHANED` shows recovery; canonical `FUNDING` shows tracking/production context.
- [x] Resolver Queue separates `UNDER_REVIEW_PRIVATE`, `COMMUNITY_REVIEW`, activation recovery, active funding, production/release review, refunding, and settled campaigns.
- [x] An approved campaign with a canonical `FUNDING` binding leaves the “Chờ kích hoạt” queue.
- [x] Admin loads Campaign operational data through an Campaign endpoint, not `/v1/fundtogether/public/campaigns`, which intentionally excludes Campaign.
- [x] Admin exception copy distinguishes application approval, missing publication, orphaned binding, indexer pending, and canonical funding.
- [x] No Admin action can rebind a campaign, move funds, approve a payout, or mutate refund state.
- [x] Technical codes remain available in disclosures/logical assertions, while primary labels are plain-language Vietnamese.

**Verification:** For one fixture in each canonical state, Creator, Resolver, Admin, and public detail produce compatible labels and next actions.

## Task 3: Harden activation and pledge transaction reconciliation

**Purpose:** Make recovery prove the expected campaign/action instead of accepting any successful Campaign-contract transaction.

**Files:**
- Modify: `backend/src/reward/reward-campaigns-chain.controller.ts`
- Modify: `backend/src/reward/reward-campaigns-indexer.service.ts`
- Modify: `frontend/src/lib/api/campaigns.ts`
- Modify: `frontend/src/features/campaigns/useCampaignTransaction.ts`
- Modify: `frontend/src/features/campaigns/campaigns-transaction-recovery.ts`
- Test: `backend/src/reward/reward-campaigns-chain-http.spec.ts` or the closest existing Campaign HTTP suite

**Request contract:** The authenticated sync request must carry enough context to validate the intended operation:

```ts
{
  txHash: string;
  campaignId: string;
  action: 'approveCampaign' | 'createCampaign' | 'pledge';
}
```

**Steps:**

- [x] Validate receipt success, canonical block identity, deployment identity, expected event, and expected campaign/terms before returning `ON_CHAIN_CONFIRMED`.
- [x] For `approveCampaign`, require the exact approved commitment terms and the authorized Resolver actor.
- [x] For `createCampaign`, require the matching `CampaignCreated` event and canonical binding to the requested campaign row.
- [x] For `pledge`, require the matching `Pledged` event, active campaign ID, exact standard price, connected linked wallet, and canonical entitlement.
- [x] Return an explicit non-success state for pending, reverted, unrelated, or not-yet-indexed transactions; do not make the frontend infer success from a generic receipt.
- [x] Keep existing transaction hashes public-only. Never persist signatures, private keys, wallet seeds, token data, or secrets.
- [x] Clear only the action-specific recovery record after the expected canonical result. Do not clear every transaction for the campaign.
- [x] Preserve disconnect/change-wallet recovery and wrong-Resolver-wallet blocking before signing.

**Verification:** A successful transaction for another campaign or another Campaign action cannot clear the current recovery record or produce a false activation/pledge success.

## Task 4: Correct Backer preflight and two-step approval UX

**Purpose:** Make the pledge CTA safe when reads fail and make the MockUSDC approval prerequisite understandable without creating a second top-level pledge action.

**Files:**
- Modify: `frontend/src/features/campaigns/ui/CampaignPledgePreflight.tsx`
- Modify: `frontend/src/features/campaigns/ui/CampaignTransactionStatus.tsx`
- Modify: `frontend/src/features/campaigns/useCampaignTransaction.ts`
- Modify: `frontend/src/features/campaigns/ui/CampaignCommitmentCard.tsx`
- Modify: `frontend/src/features/campaigns/Campaign.tsx`
- Modify: `frontend/src/features/campaigns/reward.css`
- Test: `frontend/scripts/campaigns-pledge-preflight.test.mjs`

**Steps:**

- [x] Treat balance, allowance, linked-wallet, chain, entitlement, and campaign-read errors as not-ready states. Never render `READY` while a required read failed or is unresolved.
- [x] Keep the CTA gated by `ON_CHAIN_CONFIRMED + FUNDING (0)`, signed-in account, linked wallet, chain `31339`, no current entitlement, and sufficient `bigint` balance.
- [x] Show the exact MockUSDC amount, one-PDF entitlement, escrow boundary, and possible network gas before the first wallet request.
- [x] Present approval as `Bước 1/2` and pledge as `Bước 2/2`; keep one user-facing pledge journey and do not describe approval as a completed pledge.
- [x] If approval succeeds but pledge is rejected, show that allowance exists but no pledge was recorded, then allow the pledge step after a fresh preflight.
- [x] If a pledge hash exists, show reconciliation as the primary action and suppress a second pledge CTA until the result is definitively failed/reverted and entitlement is rechecked.
- [x] If an entitlement is `ORPHANED`, explain the old canonical stream and do not silently treat it as a current successful pledge.

**Verification:** Query errors never enable signing; approval rejection, approval success/pledge rejection, submitted pledge, canonical pledge, and duplicate-entitlement cases each render distinct copy and actions.

## Task 5: Make orphaned activation recovery actionable

**Purpose:** Provide a recovery path when browser-local transaction state is missing or stale.

**Files:**
- Modify: `backend/src/reward/reward-campaigns-publication.service.ts`
- Modify: `backend/src/reward/reward-campaigns-chain.controller.ts`
- Modify: `frontend/src/features/campaigns/ui/CampaignActivationPanel.tsx`
- Modify: `frontend/src/features/campaigns/Campaign.tsx`
- Modify: `frontend/src/features/campaigns/campaigns-transaction-recovery.ts`
- Test: activation boundary and recovery assertions

**Steps:**

- [x] Show the canonical/non-canonical binding identity and transaction hash when the server has it.
- [x] Make “Đối chiếu lại transaction” perform a server-backed lookup when no local recovery record exists; it must not become a create-campaign shortcut.
- [x] Keep `ORPHANED` non-funding-visible until the server confirms a canonical binding for the exact frozen commitment.
- [x] If the binding was reorged or belongs to another deployment stream, explain that a new activation is not automatically authorized and preserve the reviewed terms.
- [x] Keep the Resolver/Creator action-specific wallet guards and do not accept client-supplied alternate terms or payout addresses.

**Verification:** Clearing browser storage does not make an orphaned campaign unrecoverable, and no orphaned state exposes a Backer pledge CTA.

## Task 6: Revalidate review gating and delivery handoffs

**Purpose:** Ensure the newly configured activation/pledge workflow does not regress private review, correction, production evidence, PDF release, or entitlement access.

**Files:**
- Review: `backend/src/reward/reward-campaigns.service.ts`
- Review: `backend/src/reward/reward-campaigns-delivery.service.ts`
- Review: `backend/src/reward/reward-campaigns-delivery.policy.ts`
- Review: `frontend/src/features/campaigns/CampaignReview.tsx`
- Review: `frontend/src/features/campaigns/ui/ReviewQueue.tsx`
- Review: `docs/campaigns/WORKFLOWS.md`
- Review: `PRODUCT.md`
- Verify only: `backend/drizzle/reward/0008_reward_campaigns_review_policy.sql`, `backend/drizzle/reward/0009_campaigns_review_gating.sql`

**Checks:**

- [x] `UNDER_REVIEW_PRIVATE` remains Resolver-only and never appears in public review/funding feeds.
- [x] `COMMUNITY_REVIEW` remains non-pledge and attributable feedback does not approve, publish, or move funds.
- [x] `CHANGES_REQUESTED` returns the same campaign row to editable `DRAFT` while preserving review history and invalidating the old active snapshot.
- [x] Production evidence upload is allowed only in the contract's production state and final PDF upload only after production approval.
- [x] Download access requires canonical entitlement, accepted release hashes, and verified private bytes; missing files produce `DELIVERY_UNAVAILABLE` and a Resolver-visible issue.
- [x] Refund eligibility, refund transition, refund claim, payout, report, and challenge remain distinct states/actions.
- [x] Confirm the required review-gating migrations are applied in the target local database before runtime acceptance; build/lint alone is insufficient.

## Verification Matrix

Run focused checks in this order:

1. Backend operational summary and exact receipt/event validation.
2. Frontend campaign-state, dashboard grouping, activation, recovery, and pledge-preflight assertions.
3. Existing backend Jest suites for Campaign review/delivery/indexing.
4. Existing frontend test runner and production build/lint.
5. Foundry tests only if the current dirty contract changes are intentionally part of this work; otherwise keep them outside this plan.

Manual acceptance must cover:

| Scenario | Expected result |
|---|---|
| Approved, no binding | Activation only; no pledge |
| Approved, orphaned binding | Recovery only; no pledge |
| Canonical funding | One guarded pledge journey |
| Wrong chain/wallet/account | No signing; actionable recovery |
| Balance/allowance read failure | No `READY` CTA |
| Approval succeeds, pledge rejected | No entitlement; pledge step can resume |
| Pledge submitted, page reload | Hash restored; reconcile before retry |
| Pledge receipt not indexed | Pending canonical state; no duplicate pledge |
| Canonical pledge | Entitlement appears; no second pledge |
| Production/PDF unavailable | No false download success; Resolver issue |
| Refund eligible/refunded | Claim flow only; no download or payout confusion |

## Out of Scope

- New contract functions, ABI changes, deployment changes, migrations authored for this plan, payout/refund policy changes, fees, challenge-window changes, or physical fulfilment.
- Automatic transaction retry, automatic refund transitions, or an admin manual rebind action.
- Broad renaming of legacy Reward code before a verified Campaign replacement exists.
- External UI research claims or fabricated Mobbin references.

## Definition of Done

- [x] All role surfaces consume the same Campaign operational summary.
- [x] No dashboard derives Campaign funding state from the legacy `onchainCampaignId` field.
- [x] Activation and pledge reconciliation validate the expected event and canonical projection.
- [x] Preflight fails closed on read errors and all financial comparisons remain `bigint`-safe.
- [x] Orphaned recovery works with and without browser-local transaction state.
- [x] Review, delivery, entitlement, refund, and download state boundaries remain intact.
- [ ] Focused tests, existing suites, build, lint, and the manual matrix pass with evidence recorded in `docs/PROJECT_PROGRESS.md`.
- [x] Unrelated dirty contract/migration changes are separated or explicitly included before any commit.

Verification note: implementation, focused suites, existing Campaign/frontend suites, builds, frontend lint, local migrations, and the automated browser matrix pass. The combined verification checkbox above remains open because backend ESLint 9 has no repository config, and human MetaMask acceptance was not performed. See `docs/PROJECT_PROGRESS.md` for exact evidence.
