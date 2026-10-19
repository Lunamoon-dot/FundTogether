# FundTogether Ops Dashboard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Give Creator Studio, Resolver Console, and Admin Operations distinct dashboard workspaces instead of reusing the public editorial campaign frame.

**Architecture:** Keep public/backer campaign rendering unchanged. Add a role-aware internal shell and internal campaign frame that share only layout primitives, query data and transaction lifecycle; role pages supply their own actions and work surfaces. Keep routes, APIs, database, contract, ABI and financial semantics unchanged.

**Tech Stack:** React 19, TypeScript, Vite, existing CSS/Tailwind utilities, Node test runner with Vite SSR tests.

**Spec:** `docs/research-direction.md`, `docs/PROJECT_OVERVIEW.md`, and the approved role-workspace design in the conversation.

## Global Constraints

- Public Campaign surfaces remain the public/backer editorial experience.
- Creator, Resolver and Admin routes are presentation/navigation boundaries; backend authorization and the contract remain authoritative.
- Do not change Solidity, ABI, database schema, indexer behavior, wallet permissions or financial policy.
- Creator may submit creator-owned work; Resolver may make allowed financial/review decisions; Admin is operational/read-only and never inherits Resolver signing authority.
- Keep canonical transaction lifecycle visible as wallet request → submitted → receipt → indexed projection.
- Preserve existing uncommitted changes in the checkout.
- Do not add a UI dependency; use the existing React/CSS stack.

## Review Focus

- Public campaign routes must still render the existing editorial frame and public ledger.
- Resolver and Admin must not receive Creator/Resolver financial controls through the new shell.
- A campaign detail route must preserve its existing tab and hash-route mapping while changing only its internal presentation.
- Loading, unauthorized and missing-chain states must remain readable inside the new shell.
- Long campaign names, zero balances and missing optional chain values must not break the metric strip or inspector.

### Task 1: Internal role shell

**Files:**
- Create: `frontend/src/features/campaigns/shared/workspace/WorkspaceShell.tsx`
- Create: `frontend/src/features/campaigns/shared/workspace/workspace.css`
- Modify: `frontend/src/features/explore/AppShell.tsx`
- Test: `frontend/scripts/campaigns-internal-workspaces.test.mjs`

**Interfaces:**
- Produces `WorkspaceRole`, `WorkspaceShell`, and role navigation metadata for Creator, Resolver and Admin routes.
- Consumes the existing `path`, `session` and `children` props from `AppShell`.

- [ ] Write a failing SSR/source test proving each internal role renders its own workspace label and navigation, while public `/campaigns` keeps the public shell.
- [ ] Run the focused test and verify it fails because the internal shell does not exist.
- [ ] Implement the role shell with a dark rail, role-specific links, account identity, and a compact workspace header; route only internal paths through it.
- [ ] Run the focused test and verify it passes.
- [ ] Commit the shell change.

### Task 2: Internal campaign frame and inspector

**Files:**
- Create: `frontend/src/features/campaigns/shared/workspace/InternalCampaignFrame.tsx`
- Create: `frontend/src/features/campaigns/shared/workspace/InternalCampaignInspector.tsx`
- Modify: `frontend/src/features/campaigns/shared/workspace/workspace.css`
- Test: `frontend/scripts/campaigns-internal-workspaces.test.mjs`

**Interfaces:**
- `InternalCampaignFrame` accepts `role`, `campaign`, `chain`, `activeTab`, `onTabChange`, `main`, `alerts`, and optional `actions`.
- `InternalCampaignInspector` accepts the same canonical campaign/chain projection and renders operational metrics without the public `CampaignLedger` markup.

- [ ] Add failing assertions that the internal frame exposes role-specific tabs, metric labels and inspector boundaries, and does not render `Funding summary` or `NOTARIAL ESCROW LEDGER`.
- [ ] Run the focused test and verify the expected missing-module/markup failure.
- [ ] Implement the frame, metric strip and inspector using plain dashboard sections and safe bigint formatting.
- [ ] Run the focused test and verify it passes.
- [ ] Commit the frame change.

### Task 3: Migrate Creator, Resolver and Admin detail pages

**Files:**
- Modify: `frontend/src/features/campaigns/creator/CampaignWorkspacePage.tsx`
- Modify: `frontend/src/features/campaigns/resolver/CampaignReviewPage.tsx`
- Modify: `frontend/src/features/campaigns/admin/CampaignOperationsPage.tsx`
- Modify: `frontend/src/features/campaigns/shared/styles.css`
- Test: `frontend/scripts/campaigns-internal-workspaces.test.mjs`

**Interfaces:**
- Each role page consumes `InternalCampaignFrame` and retains its existing API queries, wallet transaction callbacks and role-specific action components.
- Public `CampaignPage.tsx` continues consuming `CampaignDetailFrame`, `CampaignOverview` and `CampaignLedger` unchanged.

- [ ] Add failing source assertions that internal pages no longer import `CampaignDetailFrame`, `CampaignOverview` or `CampaignLedger`, while public page imports remain.
- [ ] Run the focused test and verify it fails against current imports.
- [ ] Replace the internal render wrappers only; keep existing form/action behavior and map existing tabs to role-specific labels.
- [ ] Add operational panels for Creator production/disbursement, Resolver review decisions and Admin projection monitoring without changing API or contract calls.
- [ ] Run the focused test and verify all role boundaries pass.
- [ ] Commit the migration.

### Task 4: Full verification and visual regression pass

**Files:**
- Modify: only files required by test/build failures from Tasks 1–3.

- [ ] Run the focused internal workspace tests and the complete frontend test suite.
- [ ] Run the frontend TypeScript/Vite build and lint.
- [ ] Inspect the diff for accidental public-route, contract, API or financial changes.
- [ ] Record any remaining minor visual follow-ups without expanding scope.

