# Campaign Review Conversation and Escalation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement lifecycle-aware Campaign review: advisory Community Review before funding, revision-linked Creator responses, canonical funded Backer-Creator threads, and Resolver escalation without allowing messages to mutate financial state.

**Architecture:** Keep `campaigns_feedback` as immutable attributable observations. Add separate append-only Creator response, Backer-Creator message, and Resolver escalation records. Server policy gates use the current frozen commitment, canonical Campaign indexer stream, contract state, and active entitlement; the contract remains the financial authority.

**Tech Stack:** NestJS, TypeScript, Zod, Drizzle/PostgreSQL, React 19, TanStack Query, Vite SSR tests, Jest, existing Campaign indexer and contract projection.

**Spec:** `docs/specs/2026-10-16-campaign-review-conversation-escalation-design.md`

## Global Constraints

- Campaign only: `COMICS_ARTBOOK`, one digital PDF tier; do not reintroduce legacy charity or physical fulfilment behavior.
- `campaigns_feedback` remains append-only and is never converted into a general chat table.
- Creator cannot create ordinary feedback on the Creator's own campaign.
- A submitted wallet transaction is not a canonical pledge; require receipt, canonical indexer projection and active non-refunded entitlement.
- Messages, Creator responses and escalation records never move funds or directly mutate contract state.
- Current commitment/evidence targets and snapshot lineage are validated server-side.
- Never expose private storage object keys or sample/PDF bytes through review records.
- Preserve unrelated dirty worktree changes; only commit files belonging to this plan.

## Review Focus

- A Creator response must link only to feedback belonging to the same campaign and must not edit the linked feedback; covered by the Creator-response service tests.
- A correction response must be attached to the new frozen commitment/revision atomically; covered by submit-review HTTP tests.
- A Backer thread must require canonical Campaign entitlement and a successful production-eligible contract state, not a UI funding percentage; covered by the review policy and HTTP tests.
- Orphaned/refunded/non-canonical entitlements and non-participants must be rejected; covered by thread authorization tests.
- Resolver escalation must expose context without creating a financial transition; covered by escalation HTTP tests and frontend state tests.

---

### Task 1: Establish the canonical review conversation policy

**Files:**
- Create: `backend/src/reward/reward-campaigns-review-conversation.policy.ts`
- Test: `backend/src/reward/reward-campaigns-review-conversation.policy.spec.ts`
- Modify: `backend/src/database/schema/campaigns.schema.ts` only if a shared type is required by the policy

**Interfaces:**
- Produces pure functions consumed by the service: `isPostFundingReviewState(state: CampaignChainSnapshot['state'] | null): boolean`, `canOpenBackerReview(input): boolean`, and `reviewThreadStatus`/`reviewEscalationStatus` literal types.
- The policy input must include canonical binding status, chain snapshot, entitlement `canonical/refunded/backerUserId`, campaign creator ID, and authenticated user ID.

- [ ] **Step 1: Write failing unit tests** for state `FUNDING` rejection, `ACTIVE`/`RELEASE_REVIEW`/`RELEASED`/`COMPLETED` acceptance, refunding rejection, missing binding rejection, non-canonical entitlement rejection, refunded entitlement rejection, wrong user rejection, and valid backer acceptance.
- [ ] **Step 2: Run the focused policy test** from `backend`: `npm test -- --runInBand reward-campaigns-review-conversation.policy.spec.ts`; confirm the new module/tests fail because the policy module is absent.
- [ ] **Step 3: Implement the pure policy module** with no database or RPC calls. Use the contract enum values from `FundTogetherCampaign.sol`, not UI labels or numeric literals scattered through controllers.
- [ ] **Step 4: Run the focused policy test** and confirm all cases pass.
- [ ] **Step 5: Commit** `test/reward: define canonical review conversation gate`.

### Task 2: Add append-only persistence for responses, threads, messages and escalations

**Files:**
- Modify: `backend/src/database/schema/campaigns.schema.ts`
- Modify: `backend/src/database/schema/index.ts` only if export wiring requires it
- Create: `backend/drizzle/reward/0010_campaigns_review_conversations.sql`
- Test: `backend/src/database/schema/campaigns-review-conversation.schema.spec.ts` or the existing migration/schema test location after locating its convention

**Interfaces:**
- Produces Drizzle tables: `campaignsCreatorResponses`, `campaignsCreatorResponseFeedback`, `campaignsReviewThreads`, `campaignsReviewMessages`, and `campaignsReviewEscalations`.
- Required fields and checks:
  - Creator response: campaign, creator, body, submission revision, commitment hash, created timestamp.
  - Response link: response ID + feedback ID composite primary key and foreign keys.
  - Thread: campaign, backer, target hash, commitment snapshot hash, status, timestamps.
  - Message: thread, author, author role at write, body, timestamp; no update/delete columns/API.
  - Escalation: thread, opener, reason, status, optional Resolver/outcome/note/timestamps.
- Status checks must be database constraints, not only TypeScript unions.

- [ ] **Step 1: Write schema/migration assertions** for table names, FK relationships, composite uniqueness, allowed statuses, append-only shape, and indexes on campaign/backer/thread/status.
- [ ] **Step 2: Run the focused schema/migration test** and observe failure because the new tables/SQL do not exist.
- [ ] **Step 3: Add Drizzle definitions and migration `0010`**. Use `on delete cascade` only for link rows where deleting the parent is already an allowed migration behavior; do not add destructive cascades to campaign history.
- [ ] **Step 4: Run migration/schema verification** against the isolated test database and confirm the constraints are created.
- [ ] **Step 5: Commit** `feat/reward: persist Campaign review conversations`.

### Task 3: Implement Creator revision responses linked to Backer feedback

**Files:**
- Modify: `backend/src/reward/reward-campaigns.schema.ts`
- Modify: `backend/src/reward/reward-campaigns.controller.ts`
- Modify: `backend/src/reward/reward-campaigns.service.ts`
- Modify: `backend/src/reward/reward-campaigns-delivery.service.ts`
- Modify: `backend/src/reward/reward-campaigns-delivery.controller.ts` only if the feedback DTO needs a response-specific read route
- Modify: `backend/src/database/schema/campaigns.schema.ts` only for DTO-facing types, not behavior
- Test: `backend/src/reward/reward-campaigns-http.spec.ts`
- Test: `backend/src/reward/reward-campaigns-delivery-http.spec.ts`
- Test: `backend/src/reward/reward-campaigns-review-http.spec.ts`

**Interfaces:**
- Extend `submit-review` input from `{ revision }` to `{ revision, responseBody?: string, relatedFeedbackIds?: string[] }`.
- Return response records through the authenticated feedback read DTO without exposing feedback outside the existing role/author visibility boundary.
- Response link semantics are “related to”; they do not mark a feedback row resolved.

- [ ] **Step 1: Write failing HTTP tests** for: first submission without prior feedback succeeds; correction submission with prior feedback requires a bounded response; response accepts several valid feedback IDs; foreign campaign feedback ID is rejected; Creator cannot call ordinary feedback POST; response and new review submission are created atomically.
- [ ] **Step 2: Run only the new/affected backend HTTP tests** and confirm failures are due to missing schema/API behavior.
- [ ] **Step 3: Add Zod validation**: response body 10–3000 trimmed characters when supplied, related IDs unique and bounded, and require a response body when the campaign has prior feedback/review context.
- [ ] **Step 4: Implement the transaction in `RewardCampaignService.submit`**: lock campaign, validate revision and frozen commitment, validate linked feedback IDs belong to the campaign, update `UNDER_REVIEW_PRIVATE`, insert Creator response and link rows in the same transaction, then return the updated campaign.
- [ ] **Step 5: Extend feedback read DTOs** so Creator/Resolver receive active feedback plus historical rows needed to link a correction response, while a normal community/backer user receives only permitted rows and linked responses. Do not weaken private feedback visibility.
- [ ] **Step 6: Run affected backend HTTP tests** and confirm they pass.
- [ ] **Step 7: Run the full backend Jest suite** from `backend` and fix only regressions caused by the new response payload.
- [ ] **Step 8: Commit** `feat/reward: link Creator revision responses to feedback`.

### Task 4: Add Creator response UI to the revision submission boundary

**Files:**
- Modify: `frontend/src/lib/api/reward.ts`
- Modify: `frontend/src/lib/api/campaigns.ts`
- Modify: `frontend/src/features/campaigns/CampaignReview.tsx`
- Modify: `frontend/src/features/campaigns/reward.css`
- Test: `frontend/scripts/campaigns-draft.test.mjs`
- Test: `frontend/scripts/campaigns-delivery.test.mjs`

**Interfaces:**
- `submitCampaignReview(id, revision, input?)` sends the exact backend payload and returns `RewardCampaign`.
- Feedback response types expose `history`, `responses`, and `relatedFeedbackIds` without exposing private storage fields.

- [ ] **Step 1: Write failing SSR tests** for a correction submission showing a general Creator response field, selectable concrete Backer feedback chips, a summary that links selected review IDs, and no field on ordinary draft save.
- [ ] **Step 2: Run the focused frontend tests** and confirm the new response controls are absent.
- [ ] **Step 3: Add the response composer** beside the existing `FROZEN` “Gửi Resolver thẩm định” action. Load feedback history only in the frozen submission context; render human-readable review excerpts with stable IDs as links/chips.
- [ ] **Step 4: Submit response body plus selected feedback IDs** only when the Creator sends the frozen revision to Resolver. Keep draft save and freeze behavior unchanged.
- [ ] **Step 5: Render existing Creator responses in Creator/Resolver review surfaces** as append-only revision context, with links back to the concrete feedback cards.
- [ ] **Step 6: Run affected frontend tests**, then `npm test` from `frontend`.
- [ ] **Step 7: Commit** `feat(frontend): add Creator revision feedback responses`.

### Task 5: Implement canonical Backer-Creator review threads

**Files:**
- Create: `backend/src/reward/reward-campaigns-review-conversation.service.ts`
- Create: `backend/src/reward/reward-campaigns-review-conversation.controller.ts`
- Modify: `backend/src/reward/reward.module.ts` if the new service/controller must be registered explicitly
- Modify: `backend/src/reward/reward-campaigns.schema.ts`
- Modify: `frontend/src/lib/api/campaigns.ts`
- Test: `backend/src/reward/reward-campaigns-review-conversation-http.spec.ts`
- Test: `frontend/scripts/campaigns-delivery.test.mjs`

**Interfaces:**
- Backend service methods:
  - `openThread(campaignId, userId, input: { targetHash: string; body: string }): Promise<ReviewThread>`
  - `thread(threadId, userId): Promise<ReviewThreadDetail>`
  - `message(threadId, userId, input: { body: string }): Promise<ReviewMessage>`
- Use the policy from Task 1 and the existing `RewardCampaignIndexerService`/`RewardCampaignPublicationService` to re-read canonical state.
- Thread detail includes only authorized participants plus the Creator/Resolver escalation context.

- [ ] **Step 1: Write failing HTTP tests** for valid active-state/canonical-entitlement thread creation, duplicate active thread reuse, rejection during `FUNDING`, rejection for missing/orphaned/refunded entitlement, rejection for wrong user, participant-only read/post, append-only message order, and current target-hash validation.
- [ ] **Step 2: Run the focused HTTP test** and confirm failure because the controller/service/routes do not exist.
- [ ] **Step 3: Implement service/controller authorization** with server-side session identity, campaign ownership, canonical stream check, active entitlement check, and current production/evidence target validation.
- [ ] **Step 4: Implement idempotent thread creation** inside a transaction: validate the bounded opening body, return an existing active thread for the same Backer/campaign/target when present, or insert the thread and its first Backer message.
- [ ] **Step 5: Implement append-only participant messages** with `BACKER`/`CREATOR` role-at-write captured server-side. Creator can reply only to their campaign; Backer can reply only to their own thread.
- [ ] **Step 6: Run the focused backend thread tests**, then the full backend Jest suite.
- [ ] **Step 7: Commit** `feat/reward: add canonical Backer Creator review threads`.

### Task 6: Implement Resolver escalation and formal outcome boundary

**Files:**
- Modify: `backend/src/reward/reward-campaigns-review-conversation.service.ts`
- Modify: `backend/src/reward/reward-campaigns-review-conversation.controller.ts`
- Modify: `backend/src/reward/reward-campaigns.schema.ts`
- Test: `backend/src/reward/reward-campaigns-review-conversation-http.spec.ts`
- Test: existing Campaign challenge/dispute HTTP specs where the boundary is shared

**Interfaces:**
- Service methods:
  - `escalate(threadId, backerUserId, input: { reason: string }): Promise<Escalation>`
  - `listResolverCases(resolverUserId): Promise<ResolverCaseSummary[]>`
  - `resolveEscalation(escalationId, resolverUserId, input: { outcome: 'RESOLVED' | 'DISMISSED' | 'FORMAL_DISPUTE'; note: string }): Promise<Escalation>`
  - `requestCreatorResponse(escalationId, resolverUserId, input: { body: string }): Promise<ReviewMessage>`
- Resolver outcome is recorded in the new escalation record; `FORMAL_DISPUTE` only creates an explicit handoff/reference and never directly updates an entitlement or contract.

- [ ] **Step 1: Write failing tests** for Backer-only escalation, duplicate active escalation idempotence, Resolver-only case list/detail, Resolver request for Creator clarification, mandatory outcome note, rejection by non-Resolver, and proof that escalation/outcome does not mutate contract/indexer/entitlement rows.
- [ ] **Step 2: Run the focused tests** and confirm the new endpoints fail before implementation.
- [ ] **Step 3: Implement escalation transitions** `OPEN`, `AWAITING_CREATOR_RESPONSE`, `RESOLVED`, `DISMISSED`, `FORMAL_DISPUTE` with row locks and append-only messages/outcomes.
- [ ] **Step 4: Include complete context in Resolver case DTO**: thread messages, linked feedback, campaign commitment, relevant evidence hashes, canonical chain snapshot and entitlement identity without private object keys.
- [ ] **Step 5: Run focused and full backend tests**.
- [ ] **Step 6: Commit** `feat/reward: add Resolver escalation cases`.

### Task 7: Build Backer and Resolver frontend surfaces

**Files:**
- Modify: `frontend/src/lib/api/campaigns.ts`
- Modify: `frontend/src/features/campaigns/Campaign.tsx`
- Modify: `frontend/src/features/campaigns/RewardResolverConsole.tsx`
- Create: `frontend/src/features/campaigns/ui/CampaignReviewThread.tsx`
- Create: `frontend/src/features/campaigns/ui/CampaignResolverCase.tsx` if the Resolver case is too large for the console
- Modify: `frontend/src/features/campaigns/reward.css`
- Test: `frontend/scripts/campaigns-delivery.test.mjs`
- Test: `frontend/scripts/campaigns-studio.test.mjs`

**Interfaces:**
- Frontend API functions mirror Task 5/6 exact routes and return typed thread/escalation DTOs.
- Campaign view chooses mode from canonical chain/entitlement data; it never enables the thread from `raised` alone.

- [ ] **Step 1: Write failing SSR tests** for pre-funding advisory-only view, funded Backer thread CTA, Creator participant reply, Backer escalation CTA after an unresolved exchange, Resolver case list/context, and absence of financial action in thread controls.
- [ ] **Step 2: Run focused frontend tests** and confirm expected controls are missing.
- [ ] **Step 3: Add `CampaignReviewThread`** with append-only message display, participant composer, target/evidence context, loading/error states and escalation status.
- [ ] **Step 4: Add Backer eligibility gate** from canonical chain/entitlement query; keep the existing funding summary, pledge, download and challenge surfaces separate.
- [ ] **Step 5: Add Resolver case context/actions** to Resolver Console; formal outcome controls must be visually and semantically separate from normal messages.
- [ ] **Step 6: Run focused tests, frontend full test suite, build and lint**.
- [ ] **Step 7: Commit** `feat(frontend): add Campaign review conversation surfaces`.

### Task 8: End-to-end verification and documentation alignment

**Files:**
- Modify: `docs/PROJECT_PROGRESS.md` only with verified implementation evidence
- Modify: `docs/campaigns/MANUAL_TEST_GUIDE.md` with the new role/lifecycle scenarios
- Test: existing backend and frontend suites
- Test: local browser flow using a reset local deployment/database only if the runtime is already the active Reward identity

- [ ] **Step 1: Run fresh backend migration verification** for the new migration on an isolated database and an upgrade path.
- [ ] **Step 2: Run backend full suite from `backend`**, including all Campaign HTTP, indexer, policy and contract-adjacent tests.
- [ ] **Step 3: Run frontend `npm test`, `npm run build`, `npm run lint`, and `git diff --check` for plan files.
- [ ] **Step 4: Run manual scenarios**: pre-funding feedback → Creator tagged response → Resolver review; canonical pledge/index → Backer thread → Creator reply → escalation → Resolver outcome; orphan/refunded entitlement rejection.
- [ ] **Step 5: Inspect diff for unrelated edits and record any deferred minor findings in the execution ledger.
- [ ] **Step 6: Commit** `test/reward: verify Campaign review conversations end to end`.

## Completion contract

The feature is complete only when every task above has a failing-test-first record, its focused and full suites are green, migrations apply cleanly, no message path mutates financial state, and the manual scenarios distinguish `COMMUNITY_REVIEW` from canonical funded/production review.
