# Editions Review Policy and Public Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Editions workflow explicit by recording the Resolver review start, preserving the repeatable correction loop, and separating review, activation-pending, and funding public surfaces.

**Architecture:** Keep an auditable review-start timestamp on `reward_campaigns` and remove the fixed deadline. `submit-review` records when Resolver review starts; Resolver closes the review under the agreed policy. `CHANGES_REQUESTED` clears the active marker and returns the Creator to editable `DRAFT`. Public list endpoints derive funding visibility from canonical indexed Editions chain state, while review and activation-pending visibility derive from the database review state.

**Tech Stack:** NestJS, Drizzle/PostgreSQL, Jest/Supertest, React 19, TanStack Query, TypeScript, Vite.

**Spec:** `docs/superpowers/specs/2026-10-14-editions-review-funding-surfaces-design.md`

## Global Constraints

- Resolver review has no fixed deadline or automatic expiry.
- An `UNDER_REVIEW` campaign remains actionable until Resolver decides; it never auto-approves, auto-rejects, opens pledge, or moves funds.
- Only a `RESOLVER` can approve, request changes, or reject an Editions commitment; Creator/community users cannot decide review state.
- `CHANGES_REQUESTED` returns the campaign to `DRAFT`, clears the active frozen commitment, and permits another Creator edit/freeze/submit cycle.
- Funding visibility requires an intact approved commitment, a canonical indexed Editions binding, and chain state `FUNDING` (`state === 0`).
- Do not reset PostgreSQL, Anvil, MinIO, existing campaigns, indexed history, token balances, pledges, refunds, or entitlements.
- Do not change smart-contract financial transitions in this scope.

## Review Focus

- A first `submit-review` must record a review start without a deadline; test this in the review HTTP suite.
- An old review start must still allow a Resolver decision; test review after an arbitrary delay.
- `CHANGES_REQUESTED` must clear the active review window and allow a new submission; test the second cycle and stale commitment rejection.
- An approved but not-yet-published campaign must not appear in the funding surface; test an unbound approved row.
- Creator view must be read-only for community feedback while a community/backer view can submit advisory feedback; test the presentation helper and preserve the backend ACL.

### Task 1: Record the Resolver review start

**Files:**
- Create: `backend/drizzle/reward/0006_editions_review_sla.sql`
- Modify: `backend/scripts/reward/migrate-isolated.cjs`
- Modify: `backend/src/database/schema/reward.schema.ts`
- Test: `backend/src/reward/reward-editions-review-http.spec.ts`

**Interfaces:**
- Produces an auditable nullable `reviewStartedAt` campaign field.
- Removes the unused fixed review deadline field.

- [ ] **Step 1: Write the failing review tests**

  Add tests that submit a frozen commitment and assert:
  - `reviewStartedAt` is present.
  - There is no fixed deadline or automatic expiry.
  - An old `reviewStartedAt` does not prevent the Resolver from approving the exact commitment.
  - `CHANGES_REQUESTED` returns `DRAFT` and sets both active review timestamps to `null`.

- [ ] **Step 2: Run the focused tests and verify the expected failure**

  Run from `backend`:

  ```powershell
  npm test -- --runInBand src/reward/reward-editions-review-http.spec.ts
  ```

  Expected: failure because the schema and review transitions do not yet expose or populate the timestamps.

- [ ] **Step 3: Add the additive migration and Drizzle fields**

  Add `review_started_at timestamptz` and `review_deadline_at timestamptz` to `reward_campaigns`, update the migration runner list with `0006_reward_editions_review_sla`, and add matching nullable timestamp fields to `rewardCampaigns`.

- [ ] **Step 4: Implement the state transition timestamps**

  In `RewardEditionsService.submit`, set `reviewStartedAt` using one `now` value. In `review`, clear it only for `CHANGES_REQUESTED`; preserve the review record in `reward_reviews`. Do not add a timer or background state mutation.

- [ ] **Step 5: Run the focused tests and verify they pass**

  Run the same Jest command. Expected: all review HTTP tests pass, including delayed decision and repeat-cycle cases.

- [ ] **Step 6: Verify the additive migration against fresh and current databases**

  Run the existing migration verification path and query the current database schema. Expected: migration `0006_reward_editions_review_sla` is recorded, existing campaign rows remain present, and no chain/indexer data changes.

- [ ] **Step 7: Commit the data/state change**

  ```powershell
  git add backend/drizzle/reward/0006_reward_editions_review_sla.sql backend/scripts/reward/migrate-isolated.cjs backend/src/database/schema/reward.schema.ts backend/src/reward/reward-editions.service.ts backend/src/reward/reward-editions-review-http.spec.ts
  git commit -m "feat: record Editions Resolver review SLA"
  ```

### Task 2: Expose review timing and explicit public surfaces

**Files:**
- Modify: `backend/src/reward/reward-editions.service.ts`
- Modify: `backend/src/reward/reward-editions.controller.ts`
- Modify: `backend/src/reward/reward-editions-publication.service.ts`
- Modify: `frontend/src/lib/api/editions.ts`
- Test: `backend/src/reward/reward-editions-delivery-http.spec.ts`

**Interfaces:**
- Adds `reviewStartedAt` to the redacted preview DTO; no deadline or time-derived review state is exposed.
- Adds `GET /v1/reward/public/editions/funding`, `/review`, and `/activation`.
- Keeps `GET /v1/reward/public/editions/:id` available for redacted detail previews.
- `RewardEditionsService.publicList(status: 'UNDER_REVIEW' | 'APPROVED')` returns only the requested database review status.
- `RewardEditionsPublicationService.canonicalCampaignStates()` returns `Promise<Map<string, number>>` for the current indexer stream after `runOnce()`.
- `RewardEditionsPreviewController` owns `review()`, `activation()`, `funding()`, and `preview()` handlers and decorates each DTO with `surface: 'REVIEW' | 'ACTIVATION_PENDING' | 'FUNDING'`.

- [ ] **Step 1: Write failing HTTP tests for the three list surfaces**

  Assert that:
  - `/review` returns only `UNDER_REVIEW` campaigns and includes the review start time.
  - `/activation` returns approved campaigns without a canonical funding binding.
  - `/funding` excludes `UNDER_REVIEW`, unbound `APPROVED`, orphaned bindings, and non-funding chain states.

- [ ] **Step 2: Run the public-surface tests and verify they fail**

  Run the focused backend spec. Expected: 404 or incorrect mixed results because the explicit routes and DTO fields do not exist.

- [ ] **Step 3: Implement redacted preview timing and list methods**

  Add the review start time to `publicPreview`, keep private identity/sample/object fields redacted, and add list methods with status-specific filters.

- [ ] **Step 4: Implement canonical funding filtering**

  Use the existing publication/indexer read model to include a campaign in `/funding` only when its current stream binding is canonical and its indexed snapshot has `state === 0`. Treat missing, orphaned, stale, or non-funding bindings as not funding-visible.

- [ ] **Step 5: Add the frontend API types and methods**

  Update `EditionsPreview` and `editionsApi` with the review-start field and the three list calls. Keep all values read-only and server-derived.

- [ ] **Step 6: Run backend and frontend type checks**

  ```powershell
  cd backend; npm run build
  cd ..\frontend; npm run build
  ```

  Expected: both commands exit 0.

- [ ] **Step 7: Run the focused HTTP tests and commit**

  ```powershell
  cd backend; npm test -- --runInBand src/reward/reward-editions-delivery-http.spec.ts src/reward/reward-editions-review-http.spec.ts
  git add backend/src/reward backend/src/database frontend/src/lib/api/editions.ts
  git commit -m "feat: separate Editions review and funding surfaces"
  ```

### Task 3: Make the frontend workflow unambiguous

**Files:**
- Modify: `frontend/src/features/reward/EditionsCampaign.tsx`
- Modify: `frontend/src/features/reward/RewardResolverConsole.tsx`
- Modify: `frontend/src/features/reward/RewardCreatorStudio.tsx`
- Create or modify: `frontend/src/features/reward/editions-surface.ts`
- Test: `frontend/scripts/editions-surface.test.mjs`

**Interfaces:**
- `getEditionsSurfaceCopy(surface)` returns stable Vietnamese labels and explanations for `REVIEW`, `ACTIVATION_PENDING`, and `FUNDING`.
- `EditionsCommunity` accepts a viewer mode and renders a submission form only for community/backer and Resolver views, not Creator view.

- [ ] **Step 1: Write failing frontend presentation tests**

  Test the exact copy and visibility rules:
  - `UNDER_REVIEW` says “Đang thẩm định”, “chưa mở pledge”, and explains that timing follows the agreed Resolver process.
  - `APPROVED` without binding says “Đã duyệt, chờ Creator kích hoạt”.
  - `FUNDING` says pledge is open.
  - Creator mode has no community submission form.
  - Community/Resolver mode retains the advisory feedback form.

- [ ] **Step 2: Run the frontend test and verify it fails**

  ```powershell
  cd frontend; npm test -- editions-surface.test.mjs
  ```

  Expected: missing surface helper or incorrect current copy/visibility.

- [ ] **Step 3: Implement surface copy and feed sections**

  Replace the single mixed Editions feed with separate sections backed by the three server endpoints. Render pledge controls only when the detail surface is `FUNDING` and the canonical chain snapshot also confirms funding state.

- [ ] **Step 4: Explain policy-controlled review in Creator and public detail views**

  Show that the review has started and is controlled by Resolver policy. Explain that no timer auto-approves or opens pledge. Keep the Creator action path focused on waiting for Resolver or editing only after `CHANGES_REQUESTED`.

- [ ] **Step 5: Make Creator feedback read-only and retain Resolver/community feedback paths**

  Pass explicit viewer mode to `EditionsCommunity`; remove the Creator submission form while keeping feedback visibility allowed by the existing backend ACL. Do not expose raw UUIDs as the primary UX label.

- [ ] **Step 6: Run frontend tests, lint, and build**

  ```powershell
  npm test
  npm run lint
  npm run build
  ```

  Expected: all tests pass, lint has no errors, and the production build exits 0.

- [ ] **Step 7: Commit the UX change**

  ```powershell
  git add frontend/src frontend/scripts
  git commit -m "feat: clarify Editions review and funding UX"
  ```

### Task 4: Align documentation and perform full verification

**Files:**
- Modify: `docs/reward/WORKFLOWS.md`
- Modify: `docs/reward/EDITIONS_MANUAL_TEST_GUIDE.md`
- Modify: `docs/PROJECT_OVERVIEW.md`

- [ ] **Step 1: Update the state and timing documentation**

  Document policy-controlled Resolver review, the unlimited correction loop, and the distinction between review status, activation, and chain funding state. Replace any wording that says the feed mixes `UNDER_REVIEW` and `APPROVED`.

- [ ] **Step 2: Update the manual test sequence**

  Add a test for visible review start, delayed-but-actionable review, `CHANGES_REQUESTED`, Creator resubmission, approval, two-step activation, and funding-only pledge visibility.

- [ ] **Step 3: Run the full verification suite**

  ```powershell
  cd backend; npm run test:editions; npm run build
  cd ..\frontend; npm test; npm run lint; npm run build
  cd ..; git diff --check
  ```

  Expected: all required suites exit 0; any pre-existing unrelated formatting warning is reported separately and not silently ignored.

- [ ] **Step 4: Verify current local data without reset**

  Confirm the current campaign, `reward_reviews`, `editions_feedback`, chain bindings, entitlements, and migration records still exist. Confirm no Anvil snapshot, token balance, pledge, refund, or entitlement was reset.

- [ ] **Step 5: Commit documentation and final verification record**

  ```powershell
  git add docs/reward
  git commit -m "docs: document Editions Resolver review SLA"
  ```
