# FundTogether Creator Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the active FundTogether surfaces into a coherent creator/editorial experience with clear state-driven actions, truthful lightweight charts, and role-specific workspaces.

**Architecture:** Preserve the existing hash routes, API contracts, wallet hooks, and financial state machine. Add a small shared UI layer for state presentation, editorial cards, next actions, timelines, and SVG/CSS charts, then compose it into the existing PublicArea, campaign, Creator, Resolver, Admin, and Account surfaces. Work is delivered in independently testable phases so a visual change never silently changes on-chain behavior.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Query, Wagmi/Viem, existing CSS files, Node test runner, oxlint. No chart dependency is added in this plan.

**Spec:** `docs/specs/2026-10-15-campaign-creator-editorial-redesign-design.md`

## Global Constraints

- Apply the redesign only to FundTogether: `COMICS_ARTBOOK`, one standard digital-download PDF, MockUSDC pledge, review, evidence, delivery, disputes, and refunds.
- Keep existing hash route slugs, form field names, role guards, wallet hooks, API contracts, contract calls, and financial transitions compatible.
- Treat the smart contract as financial source of truth and distinguish wallet request, submitted, canonical receipt, indexed projection, and UI state.
- Use friendly Vietnamese state labels in primary UI; keep raw enum codes only in technical details or diagnostics.
- A chart must use data already available from a trusted response and must include an accessible text summary and an empty state.
- Do not add a chart dependency, database table, financial transition, automatic decision, or database reset for visual work.
- Preserve visible focus, semantic headings, contrast, reduced-motion behavior, and mobile collapse below 768px.

## Review Focus

- A stale or missing indexer binding must not look like a live funding campaign; test the explicit synchronization message and disabled pledge action.
- An empty Resolver queue must be compact and useful; test the idle message, count, and refresh action without rendering a giant placeholder dashboard.
- A Creator receiving `CHANGES_REQUESTED` must return to the current editable revision and exact wizard step; test that the first step is not forced.
- A Backer must never see a pledge action for private review, community review, activation-pending, or refund states; test state/action combinations.
- A submitted wallet transaction must not be presented as completed; test the four-stage transaction copy and query invalidation boundary.

---

### Task 1: Shared Campaign UI foundation and application shell

**Files:**
- Create: `frontend/src/features/campaigns/ui/campaignState.ts`
- Create: `frontend/src/features/campaigns/ui/CampaignStatusBadge.tsx`
- Create: `frontend/src/features/campaigns/ui/NextActionCard.tsx`
- Create: `frontend/src/features/explore/CampaignAppShell.tsx`
- Modify: `frontend/src/features/explore/PublicArea.tsx`
- Modify: `frontend/src/features/explore/PublicArea.css`
- Modify: `frontend/src/features/campaigns/reward.css`
- Test: `frontend/scripts/campaigns-ui-foundation.test.mjs`
- Test: `frontend/scripts/campaigns-public-surfaces.test.mjs`

**Interfaces:**
- `getCampaignUiState(input: { status?: string | null; chainState?: number | null; access?: string | null; role?: 'public' | 'creator' | 'resolver' | 'backer' }): CampaignUiState`
- `CampaignStatusBadge({ state }: { state: CampaignUiState }): JSX.Element`
- `NextActionCard({ state, action, href, disabled }: { state: CampaignUiState; action?: string; href?: string; disabled?: boolean }): JSX.Element`
- `CampaignAppShell({ path, session, sessionLoading, error, onSession, children }: PublicAreaProps & { children: React.ReactNode }): JSX.Element`

- [ ] **Step 1: Write failing state and shell tests**

  Add assertions that `getCampaignUiState` maps `COMMUNITY_REVIEW`,
  `APPROVED`, `FUNDING`, `REFUND_ELIGIBLE`, and `REFUNDED` to friendly
  labels, actors, and next actions. Render the shell and assert that active
  navigation, role-gated navigation, environment context, and account access
  remain present. Assert that a technical code is not the primary label.

- [ ] **Step 2: Run the foundation tests and verify RED**

  Run: `npm test -- --test-name-pattern="state|shell|navigation"` from
  `frontend`.

  Expected: FAIL because the new state mapper, shared components, and shell
  are not defined.

- [ ] **Step 3: Implement the state presentation primitives**

  Add the typed UI-only mapping in `campaignState.ts`. Keep chain state and
  access precedence explicit: a canonical funding state is pledgeable only
  when the caller is allowed to pledge; a refund entitlement is a Backer
  claim state, not a campaign funding state. Render `technicalCode` only in a
  disclosure owned by the caller.

- [ ] **Step 4: Extract the shared Campaign shell**

  Move the current sidebar, role-gated links, environment label, account
  entry, footer, and page-content wrapper from `PublicArea.tsx` into
  `CampaignAppShell.tsx`. Keep route matching and child selection in
  `PublicArea.tsx`; pass the current page as children. Use the existing route
  slugs and labels, with the creator/editorial visual hierarchy and compact
  responsive navigation.

- [ ] **Step 5: Add the shared visual tokens and states**

  Add CSS variables for editorial ink, paper, moss, berry accent, muted text,
  borders, focus ring, and state tones in the existing CSS scope. Add compact
  empty, loading, error, and synchronization styles. Do not remove unrelated
  pre-existing worktree CSS.

- [ ] **Step 6: Run the foundation tests and verify GREEN**

  Run: `npm test -- --test-name-pattern="state|shell|navigation"` from
  `frontend`.

  Expected: PASS, with existing public-surface assertions still passing.

- [ ] **Step 7: Commit the foundation**

  ```bash
  git add frontend/src/features/campaigns/ui/campaignState.ts frontend/src/features/campaigns/ui/CampaignStatusBadge.tsx frontend/src/features/campaigns/ui/NextActionCard.tsx frontend/src/features/explore/CampaignAppShell.tsx frontend/src/features/explore/PublicArea.tsx frontend/src/features/explore/PublicArea.css frontend/src/features/campaigns/reward.css frontend/scripts/campaigns-ui-foundation.test.mjs frontend/scripts/campaigns-public-surfaces.test.mjs
  git commit -m "feat: add Campaign editorial app foundation"
  ```

### Task 2: Backer discovery, campaign detail, and library

**Files:**
- Create: `frontend/src/features/campaigns/ui/EditorialCampaignCard.tsx`
- Create: `frontend/src/features/campaigns/ui/CampaignProgressChart.tsx`
- Create: `frontend/src/features/campaigns/ui/CampaignTimeline.tsx`
- Modify: `frontend/src/features/campaigns/Campaign.tsx`
- Modify: `frontend/src/features/campaigns/reward.css`
- Modify: `frontend/scripts/campaigns-public-surfaces.test.mjs`
- Modify: `frontend/scripts/campaigns-delivery.test.mjs`

**Interfaces:**
- `EditorialCampaignCard({ campaign, state, href }: { campaign: Campaign; state: CampaignUiState; href: string }): JSX.Element`
- `CampaignProgressChart({ pledged, goal }: { pledged: string; goal: string }): JSX.Element`
- `CampaignTimeline({ events }: { events: Array<{ label: string; detail: string; tone: 'done' | 'current' | 'pending' }> }): JSX.Element`

- [ ] **Step 1: Write failing editorial surface tests**

  Extend public-surface tests to assert three compact shelves, one primary
  action per campaign card, a friendly state label, and the absence of pledge
  controls in review/activation/refund states. Add delivery assertions for a
  failed campaign showing one refund next action and no production workflow.

- [ ] **Step 2: Run the focused tests and verify RED**

  Run: `npm test -- --test-name-pattern="public Campaign|community review|refund campaign|my rewards"` from `frontend`.

  Expected: FAIL for the new editorial structure and chart/timeline output.

- [ ] **Step 3: Implement editorial campaign cards and the progress chart**

  Create the card with a cover-like visual anchor using available campaign
  preview data, title/pitch, friendly state, progress data, and one CTA. The
  progress chart must use integer-safe strings/BigInt-derived text and expose a
  text summary such as `10 MockUSDC trên mục tiêu 100 MockUSDC`; never use
  floating point for money calculations.

- [ ] **Step 4: Recompose `CampaignFeed` and `CampaignCommunityReviewPage`**

  Replace tall generic panels with compact editorial shelves and compact
  empty states. Keep the separate review page and explain that community
  feedback is advisory and does not open pledge.

- [ ] **Step 5: Recompose `Campaign` and `CampaignLibrary`**

  Place story/content in the main column and the state-aware summary card in
  a sticky side column on desktop. Add a timeline for known lifecycle events.
  Move hashes, storage metadata, and technical transaction details behind
  disclosures. Keep refund/download entitlement behavior from the existing
  implementation unchanged while replacing raw-code-first presentation.

- [ ] **Step 6: Add responsive and empty-state styles**

  At widths below 768px, collapse the campaign summary below the story header,
  make cards full-width, and keep the primary action visible. Ensure empty
  shelves do not create large blank dashboard blocks.

- [ ] **Step 7: Run focused tests and verify GREEN**

  Run: `npm test -- --test-name-pattern="public Campaign|community review|refund campaign|my rewards|delivery"` from `frontend`.

  Expected: PASS, including existing refund/delivery safety assertions.

- [ ] **Step 8: Commit the backer/editorial surfaces**

  ```bash
  git add frontend/src/features/campaigns/ui/EditorialCampaignCard.tsx frontend/src/features/campaigns/ui/CampaignProgressChart.tsx frontend/src/features/campaigns/ui/CampaignTimeline.tsx frontend/src/features/campaigns/Campaign.tsx frontend/src/features/campaigns/reward.css frontend/scripts/campaigns-public-surfaces.test.mjs frontend/scripts/campaigns-delivery.test.mjs
  git commit -m "feat: redesign Campaign discovery and campaign surfaces"
  ```

### Task 3: Creator production workspace and focused wizard

**Files:**
- Create: `frontend/src/features/campaigns/ui/CreatorPipeline.tsx`
- Create: `frontend/src/features/campaigns/ui/CreatorTaskCard.tsx`
- Modify: `frontend/src/features/campaigns/RewardCreatorStudio.tsx`
- Modify: `frontend/src/features/campaigns/CampaignReview.tsx`
- Modify: `frontend/src/features/campaigns/reward.css`
- Modify: `frontend/scripts/campaigns-studio.test.mjs`

**Interfaces:**
- `CreatorPipeline({ campaigns }: { campaigns: RewardCampaign[] }): JSX.Element`
- `CreatorTaskCard({ campaign, href }: { campaign: RewardCampaign; href: string }): JSX.Element`

- [ ] **Step 1: Write failing Creator workspace tests**

  Assert that the Creator page renders the pipeline stages, one current task
  per campaign, current revision/review-cycle context, and a direct link to
  the required wizard step. Assert that `CHANGES_REQUESTED` does not force
  the user to the first step and that Resolver-only actions are absent.

- [ ] **Step 2: Run focused Creator tests and verify RED**

  Run: `npm test -- --test-name-pattern="Creator|creator|wizard|review cycle"` from `frontend`.

  Expected: FAIL for the pipeline/task-card assertions.

- [ ] **Step 3: Implement the pipeline and task cards**

  Derive stage counts from the existing campaign list response. Use the
  existing status and draft configuration fields; do not add a second status
  store. Show one current campaign card and keep previous decisions in a
  collapsed history disclosure.

- [ ] **Step 4: Recompose the Creator Studio header and workspace**

  Add the pipeline and `Cần bạn làm` section above the campaign list. Preserve
  the existing new-draft flow, three preparation groups, validation, upload
  persistence, and exact base-unit handling. Replace competing top-level
  actions with one primary action per card.

- [ ] **Step 5: Preserve focused wizard navigation**

  Keep the active preparation step in the hash/query state already used by the
  feature. After save/continue, navigate to the next intended step or retain
  the current step after an error; never silently navigate to Creator Studio
  page one. Place field errors beside their inputs and keep the final lock
  action visually distinct from ordinary draft save.

- [ ] **Step 6: Run focused tests and verify GREEN**

  Run: `npm test -- --test-name-pattern="Creator|creator|wizard|review cycle|sample upload"` from `frontend`.

  Expected: PASS, including existing tests for one PDF, no physical tier, and
  the on-chain Resolver approval gate.

- [ ] **Step 7: Commit the Creator workspace**

  ```bash
  git add frontend/src/features/campaigns/ui/CreatorPipeline.tsx frontend/src/features/campaigns/ui/CreatorTaskCard.tsx frontend/src/features/campaigns/RewardCreatorStudio.tsx frontend/src/features/campaigns/CampaignReview.tsx frontend/src/features/campaigns/reward.css frontend/scripts/campaigns-studio.test.mjs
  git commit -m "feat: add creator editorial production workspace"
  ```

### Task 4: Resolver master-detail review workspace

**Files:**
- Create: `frontend/src/features/campaigns/ui/ReviewQueue.tsx`
- Create: `frontend/src/features/campaigns/ui/ReviewHistoryDisclosure.tsx`
- Create: `frontend/src/features/campaigns/ui/TransactionLifecycle.tsx`
- Modify: `frontend/src/features/campaigns/RewardResolverConsole.tsx`
- Modify: `frontend/src/features/campaigns/CampaignReview.tsx`
- Modify: `frontend/src/features/campaigns/Campaign.tsx`
- Modify: `frontend/src/features/campaigns/reward.css`
- Modify: `frontend/scripts/campaigns-studio.test.mjs`
- Modify: `frontend/scripts/campaigns-delivery.test.mjs`

**Interfaces:**
- `ReviewQueue({ campaigns, selectedId, onSelect }: { campaigns: RewardCampaign[]; selectedId?: string; onSelect: (id: string) => void }): JSX.Element`
- `ReviewHistoryDisclosure({ reviews }: { reviews: ReviewHistory[] }): JSX.Element`
- `TransactionLifecycle({ phase, hash, error }: { phase: 'idle' | 'signing' | 'submitted' | 'confirmed' | 'indexed' | 'error'; hash?: string; error?: string }): JSX.Element`

- [ ] **Step 1: Write failing Resolver workspace tests**

  Assert that the Resolver console renders one queue item per campaign, groups
  by actionable state, uses a compact empty state, keeps the decision panel
  before community feedback, and collapses historical reviews. Assert that
  only valid current-state actions render.

- [ ] **Step 2: Run focused Resolver tests and verify RED**

  Run: `npm test -- --test-name-pattern="Resolver|review queue|decision|transaction"` from `frontend`.

  Expected: FAIL for the new queue, history, and lifecycle assertions.

- [ ] **Step 3: Implement `ReviewQueue` and selection state**

  Use the existing Resolver campaign response. Keep selected campaign state in
  the page component and render the queue/detail layout without fetching every
  campaign's full details at once. A selected campaign may be represented by
  the existing route link when the detail mode needs wallet state.

- [ ] **Step 4: Implement review history and decision hierarchy**

  Put current revision/evidence and the Resolver decision panel in the main
  detail area. Put community feedback and prior decisions below disclosures.
  Keep one campaign card for all correction cycles and identify the current
  revision explicitly.

- [ ] **Step 5: Implement the transaction lifecycle presenter**

  Adapt the existing transaction hook outputs into the phases `Yêu cầu ký`,
  `Đã gửi`, `Đã xác nhận`, and `Đã đồng bộ`. Only the canonical receipt can
  move the UI to confirmed; only refreshed/indexed data can show synchronized
  application state. Do not move contract calls into these presentational
  components.

- [ ] **Step 6: Add Resolver empty, error, and mobile states**

  Render “Không có hồ sơ cần thẩm định” with the last synchronization hint
  and one refresh action when the queue is empty. On mobile, show the queue
  first and open the selected detail with a clear back affordance.

- [ ] **Step 7: Run focused tests and verify GREEN**

  Run: `npm test -- --test-name-pattern="Resolver|review queue|decision|transaction|deadline"` from `frontend`.

  Expected: PASS, including the existing rule that deadline controls stay in
  the Resolver context and not in Creator/Backer views.

- [ ] **Step 8: Commit the Resolver workspace**

  ```bash
  git add frontend/src/features/campaigns/ui/ReviewQueue.tsx frontend/src/features/campaigns/ui/ReviewHistoryDisclosure.tsx frontend/src/features/campaigns/ui/TransactionLifecycle.tsx frontend/src/features/campaigns/RewardResolverConsole.tsx frontend/src/features/campaigns/CampaignReview.tsx frontend/src/features/campaigns/Campaign.tsx frontend/src/features/campaigns/reward.css frontend/scripts/campaigns-studio.test.mjs frontend/scripts/campaigns-delivery.test.mjs
  git commit -m "feat: redesign Resolver review workspace"
  ```

### Task 5: Admin and Account operational surfaces

**Files:**
- Create: `frontend/src/features/campaigns/ui/LifecycleDistributionChart.tsx`
- Create: `frontend/src/features/campaigns/ui/ExceptionList.tsx`
- Modify: `frontend/src/features/campaigns/RewardAdminConsole.tsx`
- Modify: `frontend/src/features/auth/AccountAccess.tsx`
- Modify: `frontend/src/features/explore/PublicArea.tsx`
- Modify: `frontend/src/features/explore/PublicArea.css`
- Modify: `frontend/src/features/campaigns/reward.css`
- Create: `frontend/scripts/campaigns-admin-account.test.mjs`

**Interfaces:**
- `LifecycleDistributionChart({ counts }: { counts: Record<string, number> }): JSX.Element`
- `ExceptionList({ items }: { items: Array<{ id: string; label: string; severity: 'info' | 'warning' | 'danger'; owner: string; actionHref?: string }> }): JSX.Element`

- [ ] **Step 1: Write failing Admin/Account tests**

  Assert that Admin renders four operational KPI tiles, a lifecycle chart with
  a text summary, and an exceptions list without inventing financial metrics.
  Assert that Account separates session, linked wallet/network, balances, and
  recovery actions, and that a network error names the failed layer.

- [ ] **Step 2: Run focused tests and verify RED**

  Run: `npm test -- --test-name-pattern="Admin|Account|wallet|lifecycle|exception"` from `frontend`.

  Expected: FAIL for the new chart, exception list, and account hierarchy.

- [ ] **Step 3: Implement the lifecycle chart**

  Calculate counts from the existing loaded campaign/admin response only. Use
  a small SVG/CSS bar or ring representation with an adjacent accessible list
  of labels/counts. If the response cannot support a metric, omit the metric
  and show the insufficient-data state instead.

- [ ] **Step 4: Recompose Admin around operations and exceptions**

  Move action controls below the KPI/chart area into a secondary administration
  section. Keep destructive/fund-moving operations role-gated and include the
  campaign name and expected transition in confirmation copy.

- [ ] **Step 5: Recompose Account around connection boundaries**

  Keep SIWE/account session, linked-wallet identity, active chain, balances,
  and provider connection as separate sections. Consolidate duplicate reload
  controls into the single appropriate recovery action while preserving the
  existing wallet-link guard and provider discovery behavior.

- [ ] **Step 6: Run focused tests and verify GREEN**

  Run: `npm test -- --test-name-pattern="Admin|Account|wallet|lifecycle|exception"` from `frontend`.

  Expected: PASS, including existing linked-wallet tests for zero balances,
  failed token reads, account switching, and unsupported chains.

- [ ] **Step 7: Commit Admin and Account surfaces**

  ```bash
  git add frontend/src/features/campaigns/ui/LifecycleDistributionChart.tsx frontend/src/features/campaigns/ui/ExceptionList.tsx frontend/src/features/campaigns/RewardAdminConsole.tsx frontend/src/features/auth/AccountAccess.tsx frontend/src/features/explore/PublicArea.tsx frontend/src/features/explore/PublicArea.css frontend/src/features/campaigns/reward.css frontend/scripts/campaigns-admin-account.test.mjs
  git commit -m "feat: modernize Campaign admin and account surfaces"
  ```

### Task 6: Cross-surface accessibility, responsive, and regression verification

**Files:**
- Modify: `frontend/src/app/App.css`
- Modify: `frontend/src/features/explore/PublicArea.css`
- Modify: `frontend/src/features/campaigns/reward.css`
- Modify: the shared UI files created in Tasks 1–5 only when required by verification
- Test: `frontend/scripts/campaigns-responsive-a11y.test.mjs`

- [ ] **Step 1: Write failing cross-surface tests**

  Add source/render assertions for visible focus styles, semantic state
  attributes on accordions/tabs, chart text summaries, reduced-motion CSS,
  mobile layout media queries, and no raw entitlement code in primary
  Backer-facing headings.

- [ ] **Step 2: Run the cross-surface tests and verify RED**

  Run: `npm test -- --test-name-pattern="responsive|accessib|motion|chart summary|raw code"` from `frontend`.

  Expected: FAIL until the final consistency pass is complete.

- [ ] **Step 3: Apply the final responsive and accessibility pass**

  Normalize spacing, typography, focus rings, button hierarchy, breakpoint
  behavior, overflow handling for hashes/long copy, and reduced-motion rules.
  Keep the creator/editorial palette consistent across all active Campaign
  pages and avoid reintroducing giant empty cards or duplicate primary CTAs.

- [ ] **Step 4: Run all frontend verification**

  Run from `frontend`:

  ```bash
  npm test
  npm run lint
  npm run build
  ```

  Expected: all tests pass, lint reports no new errors, and the production
  build completes.

- [ ] **Step 5: Run repository regression gates**

  Run from the repository root:

  ```bash
  git diff --check
  ```

  Run backend Jest and Foundry suites according to the current repository
  scripts. Expected: no contract/API regression and no changed financial
  semantics.

- [ ] **Step 6: Verify the real local runtime manually**

  Check one real path per role on the configured local runtime: public feed,
  Backer pledge/refund state, Creator current task, Resolver queue/decision,
  Admin empty/loaded state, and Account wallet error/recovery. Record any
  stale-indexer limitation separately from frontend correctness.

- [ ] **Step 7: Commit the verification pass**

  ```bash
  git add frontend/src/app/App.css frontend/src/features/explore/PublicArea.css frontend/src/features/campaigns/reward.css frontend/scripts/campaigns-responsive-a11y.test.mjs
  git commit -m "test: verify Campaign editorial responsive surfaces"
  ```

## Plan self-review

- Spec coverage: shared shell/state mapping, all active role surfaces, charts,
  progressive disclosure, empty/loading/error/sync states, responsive behavior,
  accessibility, performance boundaries, and verification are mapped to Tasks
  1–6.
- Step scan: every task has a failing test, RED check, implementation, GREEN
  check, and commit boundary. No task introduces a new contract or database
  semantic.
- Type consistency: shared state, card, chart, timeline, queue, lifecycle,
  and exception interfaces are defined before dependent tasks use them.
- Review focus: each of the five failure modes is pinned to a task test.
- Scope: the plan is visual/interaction work over existing Campaign APIs and
  hooks; backend changes are intentionally excluded unless a truthful chart
  requires an existing response field.
