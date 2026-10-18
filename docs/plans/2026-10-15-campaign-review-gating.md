# Campaign Review Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate private Resolver intake from public community review for Campaign while preserving one canonical campaign row across correction cycles.

**Architecture:** Campaign submissions use `UNDER_REVIEW_PRIVATE` until a Resolver explicitly opens `COMMUNITY_REVIEW`. The existing `reward_campaigns` row remains the aggregate root; `revision`, `frozenSnapshot`, and `commitmentHash` identify the current submission, while `reward_reviews` remains append-only decision history. Public endpoints expose only `COMMUNITY_REVIEW` and later `APPROVED` states.

**Tech Stack:** NestJS, Drizzle/PostgreSQL, React/TypeScript, Node test runner, Jest/Supertest.

**Spec:** `docs/specs/2026-10-15-campaign-review-gating-design.md`

## Global Constraints

- Apply the new states only to Campaign (`COMICS_ARTBOOK`); preserve legacy Reward `UNDER_REVIEW` behavior.
- Do not create a new campaign row for a correction cycle.
- Do not expose `UNDER_REVIEW_PRIVATE` through public endpoints or Backer feed.
- Do not open pledge or move funds from `COMMUNITY_REVIEW`.
- Keep prior review rows and feedback records for audit; active feedback must target the current snapshot.
- Do not add an automatic review deadline.
- Preserve existing private sample and identity access controls.
- Use `apply_patch` for source edits and do not stage or remove unrelated worktree changes.

## Review Focus

- Stale public access: a private submission must return no public preview and no public review-list item. Test in the Campaign HTTP suite.
- Unauthorized state transition: a non-Resolver cannot open community review. Test in the Campaign HTTP suite.
- Duplicate queue cards: correction cycles reuse the same campaign ID and the Resolver response contains one campaign with review history. Test in the Resolver-facing frontend/API coverage.
- Stale feedback: feedback targeting a prior commitment is rejected or excluded from the active count/list after a new snapshot is frozen. Test in the delivery HTTP suite.
- Legacy isolation: legacy campaigns can still use `UNDER_REVIEW` and existing Resolver transitions. Run the existing reward acceptance tests.

### Task 1: Add Campaign review states and migrate existing public review rows

**Files:**
- Modify: `backend/src/database/schema/reward.schema.ts`
- Create: `backend/drizzle/reward/0009_campaigns_review_gating.sql`
- Test: `backend/src/reward/reward-campaigns-review-http.spec.ts`

**Interfaces:**
- Produces database-accepted statuses `UNDER_REVIEW_PRIVATE` and `COMMUNITY_REVIEW`.
- Keeps legacy `UNDER_REVIEW` in the shared status constraint.

- [ ] **Step 1: Write the failing migration/state test**

  Add assertions that an Campaign submission uses `UNDER_REVIEW_PRIVATE`, that an existing Campaign `UNDER_REVIEW` row is treated as `COMMUNITY_REVIEW` after migration, and that legacy `UNDER_REVIEW` remains accepted.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `npm.cmd run test -- --runInBand src/reward/reward-campaigns-review-http.spec.ts`

  Expected: FAIL because the service still writes `UNDER_REVIEW` and the schema constraint has no new Campaign values.

- [ ] **Step 3: Implement the schema and migration**

  Add both new values to the Drizzle check and create migration `0009`. The migration must update only `COMICS_ARTBOOK` rows currently in `UNDER_REVIEW` to `COMMUNITY_REVIEW`; it must not rewrite legacy-category rows.

- [ ] **Step 4: Run the focused test and isolated migration verification**

  Run: `npm.cmd run test -- --runInBand src/reward/reward-campaigns-review-http.spec.ts`

  Expected: The schema/state assertions pass; transition assertions may remain red until Task 2.

### Task 2: Implement private submission, Resolver opening, and current decision boundaries

**Files:**
- Modify: `backend/src/reward/reward-campaigns.service.ts`
- Modify: `backend/src/reward/reward-campaigns.controller.ts`
- Modify: `backend/src/reward/reward-campaigns-delivery.service.ts`
- Test: `backend/src/reward/reward-campaigns-review-http.spec.ts`
- Test: `backend/src/reward/reward-campaigns-delivery-http.spec.ts`

**Interfaces:**
- Adds `POST /v1/fundtogether/campaigns/campaigns/:id/open-community-review`.
- Adds `RewardCampaignService.openCommunityReview(id, resolverUserId)`.
- `submit()` writes `UNDER_REVIEW_PRIVATE`.
- `review()` accepts only `COMMUNITY_REVIEW` and retains outcome mapping to `APPROVED`, `DRAFT`, or `STOPPED`.

- [ ] **Step 1: Write failing HTTP tests**

  Cover: submit returns private status; public review list/detail do not expose it; non-Resolver opening returns `403`; Resolver opening changes the same campaign row to `COMMUNITY_REVIEW`; review is rejected while private and accepted after opening; funding remains empty during community review.

- [ ] **Step 2: Run the focused backend tests to verify the failures**

  Run: `npm.cmd run test -- --runInBand src/reward/reward-campaigns-review-http.spec.ts src/reward/reward-campaigns-delivery-http.spec.ts`

  Expected: FAIL on the new status, endpoint, and public-boundary assertions.

- [ ] **Step 3: Implement the service/controller transitions**

  Use the existing Resolver role check and row lock in a transaction. `openCommunityReview` must require a current frozen snapshot and private status, then update only the existing campaign row. Change public preview/list and delivery/sample/feedback gates to accept only `COMMUNITY_REVIEW` and `APPROVED`; leave legacy delivery behavior untouched where it is not Campaign-specific.

- [ ] **Step 4: Run the focused backend tests**

  Run: `npm.cmd run test -- --runInBand src/reward/reward-campaigns-review-http.spec.ts src/reward/reward-campaigns-delivery-http.spec.ts`

  Expected: PASS with zero failures.

### Task 3: Scope active feedback to the current frozen snapshot

**Files:**
- Modify: `backend/src/reward/reward-campaigns-delivery.service.ts`
- Modify: `backend/src/reward/reward-campaigns.service.ts`
- Test: `backend/src/reward/reward-campaigns-delivery-http.spec.ts`

**Interfaces:**
- Active feedback validation accepts the current `commitmentHash` or a hash belonging to the current frozen snapshot evidence.
- Active feedback listing/count excludes targets from prior commitments; stored historical rows remain in PostgreSQL.

- [ ] **Step 1: Write failing stale-feedback tests**

  Create a first frozen commitment, store feedback against its hash, create a corrected second frozen commitment on the same campaign, then assert old feedback is not counted or returned as active and is rejected as a new target for the current round.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `npm.cmd run test -- --runInBand src/reward/reward-campaigns-delivery-http.spec.ts`

  Expected: FAIL because the current implementation counts/returns all feedback by campaign ID.

- [ ] **Step 3: Implement current-snapshot filtering**

  Derive allowed active targets from the current commitment hash and current snapshot evidence hashes. Keep historical rows untouched; use the current target set for active Resolver/Creator feedback and public `feedbackCount`.

- [ ] **Step 4: Run the focused delivery tests**

  Run: `npm.cmd run test -- --runInBand src/reward/reward-campaigns-delivery-http.spec.ts`

  Expected: PASS with old feedback retained in storage but excluded from the active round.

### Task 4: Update Resolver, Creator, and Backer UX for the gated states

**Files:**
- Modify: `frontend/src/lib/api/reward.ts`
- Modify: `frontend/src/features/campaigns/CampaignReview.tsx`
- Modify: `frontend/src/features/campaigns/RewardResolverConsole.tsx`
- Modify: `frontend/src/features/campaigns/RewardCreatorStudio.tsx`
- Modify: `frontend/src/features/campaigns/Campaign.tsx`
- Test: `frontend/scripts/campaigns-studio.test.mjs`
- Test: `frontend/scripts/campaigns-public-surfaces.test.mjs`

**Interfaces:**
- Adds frontend status values and `openCampaignCommunityReview(id)` API call.
- Resolver shows one card per campaign, an explicit open action for private submissions, and decision controls only for community review.
- Creator sees waiting/private copy until Resolver opens community review.
- Backer sees a clearly non-approved community-review label and no pledge action.

- [ ] **Step 1: Write failing frontend assertions**

  Assert that private status renders no community link/feed item and shows the Resolver open action; community status renders feedback and decision controls; review history is collapsed under one campaign card; Backer copy says the campaign is not approved.

- [ ] **Step 2: Run the frontend scripts to verify the failures**

  Run from `frontend`: `npm.cmd test`.

  Expected: FAIL because the current UI only knows `UNDER_REVIEW` and exposes the community surface immediately.

- [ ] **Step 3: Implement the UI changes**

  Keep the existing campaign card keyed by campaign ID. Render only the current campaign snapshot and put `campaign.reviews` in a collapsible history section. Do not create or map one UI card per review row.

- [ ] **Step 4: Run the frontend focused tests**

  Run from `frontend`: `node --test scripts/campaigns-studio.test.mjs scripts/campaigns-public-surfaces.test.mjs`.

  Expected: PASS with the new state labels and visibility rules.

### Task 5: Full verification and runtime migration check

**Files:**
- Verify: all files changed by Tasks 1–4

- [ ] **Step 1: Run backend Campaign and acceptance tests**

  Run from `backend`: `npm.cmd run test:campaigns` and the relevant `npm.cmd run test -- --runInBand src/reward/reward-http-acceptance.spec.ts`.

- [ ] **Step 2: Run frontend build/tests**

  Run from `frontend`: `npm.cmd test` and `npm.cmd run build`.

- [ ] **Step 3: Apply/check the isolated migration without resetting data**

  Run: `node backend/scripts/campaigns/migrate-isolated.cjs` from the repository root, then query the current campaign status and confirm no campaign IDs were duplicated.

- [ ] **Step 4: Verify runtime boundaries**

  Confirm public review endpoint returns only `COMMUNITY_REVIEW`, private status returns no public preview, Resolver can open the same campaign ID, and funding endpoint remains empty until the existing approved/on-chain flow.
