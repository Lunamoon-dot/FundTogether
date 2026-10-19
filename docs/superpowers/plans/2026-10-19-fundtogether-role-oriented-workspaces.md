# FundTogether Role-Oriented Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single role-conditioned Campaign detail screen with canonical Public/Backer, Creator, Resolver and Admin workspaces while preserving every current financial, evidence, download and settlement rule.

**Architecture:** Keep one React/Vite application, hash routing and one canonical Campaign domain. Add a typed route contract, separate route-level pages and role-owned action components; compose only read-only Campaign presentation from shared components. Backend and contract authorization remain authoritative, and a fresh local chain/database reset is performed only for final acceptance after regression tests pass.

**Tech Stack:** React 19, TypeScript 6, Vite 8, TanStack Query, Wagmi/Viem, Node test runner, NestJS/Jest, Foundry, PostgreSQL, MinIO, Anvil chain `31339`.

**Spec:** `docs/superpowers/specs/2026-10-19-fundtogether-role-oriented-workspaces-design.md`

## Global Constraints

- Preserve FundTogether's `COMICS_ARTBOOK`, one `STANDARD` digital PDF tier, MockUSDC and chain `31339` scope.
- Do not change Solidity, ABI, financial state, payout/disbursement/completion policy, database schema or API wire formats.
- Keep hash routing; do not add React Router or another routing dependency.
- Public pages must not call private Creator/Resolver endpoints because of a client-controlled route suffix.
- Frontend route gates are UX only; backend ownership/role checks and contract caller checks remain authoritative.
- Keep `bigint`/integer-safe token amounts and the existing submitted -> receipt -> event -> indexer transaction lifecycle.
- Keep TanStack Query keys scoped by `userId` for private data and clear/remount private workspace queries after account changes.
- Preserve unrelated working-tree changes and historical/read-only Campaign compatibility surfaces.
- Do not reset runtime state until Tasks 1-8 pass against the existing runtime.
- The authorized reset is local-only: chain `31339`, FundTogether PostgreSQL/MinIO volumes and `.local/fundtogether`; never touch production or unrelated services.

## Review Focus

- Directly typing a Creator/Resolver/Admin URL as signed-out or wrong-role user must show an access boundary and must not issue private mutations; covered in Tasks 1, 5 and 6.
- A signed-in non-owner must not see Creator campaign data, even when a public campaign ID is known; covered in Tasks 4 and 7.
- Switching accounts must not reuse private evidence, dossier or ownership cache from the prior account; covered in Tasks 4, 5 and 7.
- Legacy URLs must redirect once without double-rendering queries or sending duplicate wallet actions; covered in Tasks 1 and 6.
- A fresh deterministic local deployment may reuse contract addresses; acceptance must verify genesis/deployment identity and empty projections rather than address change; covered in Task 9.

---

### Task 1: Define and test the canonical workspace route contract

**Files:**
- Create: `frontend/src/features/explore/campaignRoutes.ts`
- Create: `frontend/scripts/campaigns-workspace-routes.test.mjs`
- Modify: `frontend/src/features/explore/PublicArea.tsx`

**Interfaces:**
- Produces:

```ts
export type CampaignDetailWorkspace = 'public' | 'creator' | 'resolver' | 'admin';
export type CampaignDetailTab = 'overview' | 'production' | 'commitments' | 'activity';

export interface ResolvedCampaignDetailRoute {
  workspace: CampaignDetailWorkspace;
  campaignId: string;
  initialTab: CampaignDetailTab;
  legacy: boolean;
  canonicalHref: string;
}

export function campaignDetailHref(
  workspace: CampaignDetailWorkspace,
  campaignId: string,
  tab?: CampaignDetailTab,
): string;

export function resolveCampaignDetailRoute(path: string): ResolvedCampaignDetailRoute | null;
```

- Canonical mappings:
  - `public` -> `#/campaigns/:id`
  - `creator` -> `#/campaigns/creator/:id`
  - `resolver` -> `#/campaigns/resolver/:id`
  - `admin` -> `#/admin/campaigns/:id`
- Legacy mappings:
  - `/campaigns/:id/creator` -> Creator canonical route
  - `/campaigns/:id/resolver` -> Resolver canonical route
  - `/campaigns/:id/resolver/feedback` -> Resolver canonical route with `activity`

- [ ] **Step 1: Write route-contract tests**

Add tests named:

```text
resolves every canonical campaign workspace route
keeps reserved list, draft, profile and review routes out of detail matching
maps old creator and resolver detail URLs to one canonical redirect
preserves the resolver feedback alias as the activity tab
encodes campaign IDs before generating hrefs
rejects empty, nested or malformed campaign IDs
```

Assert the complete returned object, not only a substring match.

- [ ] **Step 2: Run the focused test and verify it fails**

Run from `frontend`:

```powershell
node --test scripts/campaigns-workspace-routes.test.mjs
```

Expected: FAIL because `campaignRoutes.ts` does not exist.

- [ ] **Step 3: Implement the route resolver and href builder**

Use explicit route patterns in priority order. Decode a matched ID once, reject
IDs containing `/`, then generate canonical hrefs with `encodeURIComponent`.
Do not add a generic routing framework.

- [ ] **Step 4: Replace the detail regex in `PublicArea.tsx` with the resolver**

At this stage keep rendering the old `CampaignPage` for all workspaces so the
route-contract task is independently releasable. For `legacy: true`, call
`window.location.replace(canonicalHref)` in a guarded effect and render only a
navigation status while redirecting.

- [ ] **Step 5: Run focused and existing public-surface tests**

```powershell
node --test scripts/campaigns-workspace-routes.test.mjs scripts/campaigns-public-surfaces.test.mjs
```

Expected: PASS with no duplicate rendering of the legacy route.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/features/explore/campaignRoutes.ts frontend/src/features/explore/PublicArea.tsx frontend/scripts/campaigns-workspace-routes.test.mjs
git commit -m "refactor(frontend): define campaign workspace routes"
```

### Task 2: Extract role-neutral Campaign detail presentation

**Files:**
- Create: `frontend/src/features/campaigns/shared/detail/CampaignDetailFrame.tsx`
- Create: `frontend/src/features/campaigns/shared/detail/CampaignOverview.tsx`
- Create: `frontend/src/features/campaigns/shared/detail/CampaignLedger.tsx`
- Create: `frontend/src/features/campaigns/shared/detail/CampaignDossierList.tsx`
- Create: `frontend/scripts/campaigns-workspace-detail.test.mjs`
- Modify: `frontend/src/features/campaigns/public/Page.tsx`
- Modify: `frontend/src/features/campaigns/shared/styles.css`

**Interfaces:**
- Consumes: existing `CampaignPreview`, `CampaignChain`, `CampaignUiState`,
  `TimelineEvent` and integer-safe amount formatting.
- Produces role-neutral components:

```ts
export interface CampaignDetailFrameProps {
  campaignId: string;
  activeTab: CampaignDetailTab;
  onTabChange: (tab: CampaignDetailTab) => void;
  alerts: React.ReactNode;
  main: React.ReactNode;
  ledger: React.ReactNode;
  footer?: React.ReactNode;
}

export interface CampaignOverviewProps {
  campaign: CampaignPreview;
  chain: CampaignChain | null;
  uiState: CampaignUiState;
  timelineEvents: TimelineEvent[];
}

export interface CampaignLedgerProps {
  campaign: CampaignPreview;
  chain: CampaignChain | null;
  actions?: React.ReactNode;
}

export interface CampaignDossierListProps {
  contentOutline: string;
  budgetPlan: string;
  evidencePlan: string;
}
```

None of these interfaces accepts `mode`, `workspace`, `session`, a mutation
callback or a wallet transaction object.

- [ ] **Step 1: Add structural rendering tests**

Verify that the extracted components render the existing folio, Standard PDF
tier, plans, funding totals, deadlines and tabs from supplied read-only props.
Assert that their source does not import `useTransaction`, call `.send(` or
invoke mutation methods such as `createPayoutRequest`, `preparePayoutDecision`,
`createCompletionRequest`, `prepareCompletionDecision`, `pledge`, `claimRefund`
or `claimSurplus`.

- [ ] **Step 2: Run the focused test and verify it fails**

```powershell
node --test scripts/campaigns-workspace-detail.test.mjs
```

Expected: FAIL because the shared detail components do not exist.

- [ ] **Step 3: Extract the read-only JSX without changing copy or state semantics**

Move only presentation from `public/Page.tsx`. Keep all existing queries,
derived financial state and mutations in the old page temporarily. Use slots
only for ledger/actions/footer placement; do not put role decisions in the
shared components.

- [ ] **Step 4: Verify the old page still renders through the new frame**

```powershell
node --test scripts/campaigns-workspace-detail.test.mjs scripts/campaigns-public-surfaces.test.mjs scripts/campaigns-responsive-a11y.test.mjs
```

Expected: PASS with existing labels and responsive structure retained.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/features/campaigns/shared/detail frontend/src/features/campaigns/public/Page.tsx frontend/src/features/campaigns/shared/styles.css frontend/scripts/campaigns-workspace-detail.test.mjs
git commit -m "refactor(frontend): extract campaign detail presentation"
```

### Task 3: Split the Public/Backer campaign page from private workspace actions

**Files:**
- Create: `frontend/src/features/campaigns/public/CampaignPage.tsx`
- Create: `frontend/src/features/campaigns/backer/CampaignActions.tsx`
- Modify: `frontend/src/features/campaigns/transactions/useTransaction.ts`
- Modify: `frontend/scripts/campaigns-public-surfaces.test.mjs`
- Modify: `frontend/scripts/campaigns-completion-settlement.test.mjs`
- Modify: `frontend/src/features/explore/PublicArea.tsx`

**Interfaces:**
- Consumes: Task 2 read-only components and existing public API, entitlement,
  transaction recovery and pledge interfaces.
- Produces:

```ts
export interface PublicCampaignPageProps {
  id: string;
  session: AccountSession | null;
  initialTab?: CampaignDetailTab;
}

export function PublicCampaignPage(props: PublicCampaignPageProps): React.ReactElement;

export type CampaignTransactionController = ReturnType<typeof useTransaction>;

export interface BackerCampaignActionsProps {
  campaignId: string;
  session: AccountSession | null;
  chain: CampaignChain;
  entitlement?: Entitlement;
  transaction: CampaignTransactionController;
  onRefresh: () => void;
}
```

- [ ] **Step 1: Write tests for the public/backer boundary**

Add assertions that:

- the public page has no `mode` prop;
- signed-out rendering does not enable private evidence or dossier queries;
- a normal signed-in visitor can pledge but cannot see Creator/Resolver CTAs;
- a canonical Backer can see its entitlement, challenge/review controls,
  read-only authorized dossiers and its own surplus choice;
- public/backer source contains no `approveCampaign`, `createCampaign`,
  `reviewProduction`, `approveDisbursement`, `rejectDisbursement`,
  `approveCompletion` or `rejectCompletion` calls.

- [ ] **Step 2: Run the focused tests and verify failure**

```powershell
node --test scripts/campaigns-public-surfaces.test.mjs scripts/campaigns-completion-settlement.test.mjs
```

Expected: FAIL because the route still uses the mode-driven page.

- [ ] **Step 3: Implement `PublicCampaignPage` and Backer actions**

Move only public/backer queries and actions from `Page.tsx`. Public evidence
uses the public endpoint; entitlement, ticket, challenge, review thread and
surplus data remain user-scoped. Backer dossier visibility must continue to be
decided by backend ACL responses, not by trusting the route.

- [ ] **Step 4: Route only the public workspace to `PublicCampaignPage`**

Lazy-load it from `PublicArea.tsx`. Creator and Resolver routes still use the
old page until Tasks 4 and 5.

- [ ] **Step 5: Verify the public/backer page**

```powershell
node --test scripts/campaigns-public-surfaces.test.mjs scripts/campaigns-pledge-preflight.test.mjs scripts/campaigns-delivery.test.mjs scripts/campaigns-completion-settlement.test.mjs scripts/campaigns-transaction-recovery.test.mjs
```

Expected: PASS; no private Creator/Resolver action is reachable from the public route.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/features/campaigns/public/CampaignPage.tsx frontend/src/features/campaigns/backer/CampaignActions.tsx frontend/src/features/campaigns/transactions/useTransaction.ts frontend/src/features/explore/PublicArea.tsx frontend/scripts/campaigns-public-surfaces.test.mjs frontend/scripts/campaigns-completion-settlement.test.mjs
git commit -m "refactor(frontend): isolate public and backer campaign detail"
```

### Task 4: Build the Creator-owned campaign workspace

**Files:**
- Create: `frontend/src/features/campaigns/creator/CampaignWorkspacePage.tsx`
- Create: `frontend/src/features/campaigns/creator/CampaignActions.tsx`
- Modify: `frontend/src/features/campaigns/creator/Studio.tsx`
- Modify: `frontend/scripts/campaigns-studio.test.mjs`
- Modify: `frontend/scripts/campaigns-completion-settlement.test.mjs`
- Modify: `frontend/src/features/explore/PublicArea.tsx`

**Interfaces:**
- Consumes: `campaignDetailHref('creator', id)`, shared detail components,
  `campaignApi.operations('creator')`, private evidence/dossier APIs and the
  existing transaction controller.
- Produces:

```ts
export interface CreatorCampaignWorkspacePageProps {
  id: string;
  session: AccountSession;
  initialTab?: CampaignDetailTab;
}

export function CreatorCampaignWorkspacePage(
  props: CreatorCampaignWorkspacePageProps,
): React.ReactElement;
```

`CreatorCampaignWorkspacePage` enables private campaign queries only after the
user-scoped Creator operations result contains `campaignId === id`.

- [ ] **Step 1: Add Creator ownership and action-boundary tests**

Test:

- Studio links use `#/campaigns/creator/:id`;
- an owned campaign renders Creator tasks;
- a known public campaign not present in Creator operations renders a blocked
  ownership message and does not enable private evidence/dossier queries;
- publication, production upload, disbursement request, completion request and
  Creator review response are present in eligible states;
- Resolver decision and Backer pledge/surplus controls are absent;
- query keys containing private data include `session.userId`;
- remounting with another account cannot read the prior account's cache.

- [ ] **Step 2: Run tests and verify failure**

```powershell
node --test scripts/campaigns-studio.test.mjs scripts/campaigns-completion-settlement.test.mjs
```

Expected: FAIL on canonical Creator href and missing workspace page.

- [ ] **Step 3: Implement the Creator page and Creator action component**

Move Creator branches from the old page and from mode-driven shared financial
panels. Keep current preflight, file requirements, wallet expectations and
transaction lifecycle unchanged. Do not add a new amount/timer/payout policy.

- [ ] **Step 4: Update Studio task links and route dispatch**

Use `campaignDetailHref('creator', campaign.id)` in `Studio.tsx`; lazy-load the
Creator page from `PublicArea.tsx` only after a session exists. Signed-out access
renders the existing login boundary and makes no private request.

- [ ] **Step 5: Verify Creator workspace behavior**

```powershell
node --test scripts/campaigns-studio.test.mjs scripts/campaigns-activation.test.mjs scripts/campaigns-completion-settlement.test.mjs scripts/campaigns-transaction-recovery.test.mjs
```

Expected: PASS with no Resolver/Backer financial CTA in Creator source or markup.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/features/campaigns/creator/CampaignWorkspacePage.tsx frontend/src/features/campaigns/creator/CampaignActions.tsx frontend/src/features/campaigns/creator/Studio.tsx frontend/src/features/explore/PublicArea.tsx frontend/scripts/campaigns-studio.test.mjs frontend/scripts/campaigns-completion-settlement.test.mjs
git commit -m "refactor(frontend): add creator campaign workspace"
```

### Task 5: Build the Resolver campaign review workspace

**Files:**
- Create: `frontend/src/features/campaigns/resolver/CampaignReviewPage.tsx`
- Create: `frontend/src/features/campaigns/resolver/CampaignActions.tsx`
- Modify: `frontend/src/features/campaigns/resolver/Console.tsx`
- Modify: `frontend/scripts/campaigns-studio.test.mjs`
- Modify: `frontend/scripts/campaigns-operational-boundaries.test.mjs`
- Modify: `frontend/scripts/campaigns-completion-settlement.test.mjs`
- Modify: `frontend/src/features/explore/PublicArea.tsx`

**Interfaces:**
- Consumes: `campaignDetailHref('resolver', id, tab)`, Resolver role from the
  authenticated session, shared detail components, Resolver APIs and current
  Primary/Backup wallet preflight.
- Produces:

```ts
export interface ResolverCampaignReviewPageProps {
  id: string;
  session: AccountSession;
  initialTab?: CampaignDetailTab;
}

export function ResolverCampaignReviewPage(
  props: ResolverCampaignReviewPageProps,
): React.ReactElement;
```

- [ ] **Step 1: Add Resolver role and action-boundary tests**

Test:

- Resolver queue links use `#/campaigns/resolver/:id`;
- signed-out and non-Resolver sessions do not render the page;
- Resolver may inspect authorized private evidence and dossier metadata;
- eligible states expose exact commitment approval, funding finalization,
  production/final-PDF decisions, disbursement decisions, challenge decisions,
  completion decisions and refund transitions already present in current code;
- Creator request forms, Backer pledge and surplus destination controls are absent;
- Resolver data query keys are user-scoped;
- Primary/Backup wallet mismatch leaves transaction buttons blocked with a clear message.

- [ ] **Step 2: Run tests and verify failure**

```powershell
node --test scripts/campaigns-studio.test.mjs scripts/campaigns-operational-boundaries.test.mjs scripts/campaigns-completion-settlement.test.mjs
```

Expected: FAIL on canonical Resolver href and missing review page.

- [ ] **Step 3: Implement Resolver page and actions**

Move Resolver branches from the old page and mode-driven panels without
changing contract function names, eligibility calculations, evidence hashes,
decision hashes or transaction recovery behavior.

- [ ] **Step 4: Update Resolver queue links and route dispatch**

Use the route helper in `Console.tsx`. `PublicArea.tsx` must require
`session.roles.includes('RESOLVER')` before mounting the page. Wrong-role access
shows the blocked message and does not mount Resolver queries.

- [ ] **Step 5: Verify Resolver workspace behavior**

```powershell
node --test scripts/campaigns-studio.test.mjs scripts/campaigns-operational-boundaries.test.mjs scripts/campaigns-completion-settlement.test.mjs scripts/campaigns-transaction-recovery.test.mjs
```

Expected: PASS with no Creator/Backer financial CTA in Resolver source or markup.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/features/campaigns/resolver/CampaignReviewPage.tsx frontend/src/features/campaigns/resolver/CampaignActions.tsx frontend/src/features/campaigns/resolver/Console.tsx frontend/src/features/explore/PublicArea.tsx frontend/scripts/campaigns-studio.test.mjs frontend/scripts/campaigns-operational-boundaries.test.mjs frontend/scripts/campaigns-completion-settlement.test.mjs
git commit -m "refactor(frontend): add resolver campaign workspace"
```

### Task 6: Separate Admin operations and complete route-level dispatch

**Files:**
- Create: `frontend/src/features/campaigns/admin/AdminConsole.tsx`
- Create: `frontend/src/features/campaigns/admin/CampaignOperationsPage.tsx`
- Delete after move: `frontend/src/features/campaigns/resolver/AdminConsole.tsx`
- Modify: `frontend/src/features/explore/PublicArea.tsx`
- Modify: `frontend/src/features/explore/AppShell.tsx`
- Modify: `frontend/scripts/campaigns-admin-account.test.mjs`
- Modify: `frontend/scripts/campaigns-operational-boundaries.test.mjs`
- Delete after all imports/tests move: `frontend/src/features/campaigns/public/Page.tsx`

**Interfaces:**
- Consumes: `campaignApi.operations('admin')`, Admin session role and
  `campaignDetailHref('admin', id)`.
- Produces:

```ts
export interface AdminCampaignOperationsPageProps {
  id: string;
  session: AccountSession;
}

export function AdminCampaignOperationsPage(
  props: AdminCampaignOperationsPageProps,
): React.ReactElement;
```

Admin detail displays `OperationSummary` only: application status, publication
status, binding transaction, on-chain ID, contract state and canonical snapshot.
It has no wallet transaction controller.

- [ ] **Step 1: Add Admin separation tests**

Assert:

- Admin code lives under `campaigns/admin`, not `campaigns/resolver`;
- Admin list links use `#/admin/campaigns/:id`;
- non-Admin sessions cannot mount Admin pages;
- Admin detail renders operational identifiers and no Resolver financial CTA;
- `PublicArea.tsx` dispatches four distinct detail components;
- no route-level page receives `mode: 'public' | 'creator' | 'resolver'`;
- the old `public/Page.tsx` and old detail regex are gone;
- legacy URLs redirect to canonical routes before mounting a workspace page.

- [ ] **Step 2: Run tests and verify failure**

```powershell
node --test scripts/campaigns-admin-account.test.mjs scripts/campaigns-operational-boundaries.test.mjs scripts/campaigns-workspace-routes.test.mjs
```

Expected: FAIL because Admin remains in the Resolver folder and dispatch is incomplete.

- [ ] **Step 3: Move Admin console and add operational detail**

Preserve existing Creator/IP review behavior. The new detail page reads the
already user-scoped Admin operations query and renders a not-found boundary if
the requested campaign is not in that result.

- [ ] **Step 4: Make `AppShell` consume route classification**

Use the Task 1 helper for active navigation instead of maintaining a second set
of detail-route booleans. Keep one shared shell; changing branding/layout is out
of scope.

- [ ] **Step 5: Remove the old mode-driven page only after all routes migrate**

Confirm `rg -n "public/Page|mode=\{|mode: 'public' \| 'creator' \| 'resolver'" frontend/src` has no route-level financial page match. Shared viewer components may retain narrowly named audiences only when they do not select financial mutations.

- [ ] **Step 6: Verify complete route dispatch**

```powershell
node --test scripts/campaigns-admin-account.test.mjs scripts/campaigns-operational-boundaries.test.mjs scripts/campaigns-workspace-routes.test.mjs scripts/campaigns-public-surfaces.test.mjs scripts/campaigns-studio.test.mjs
```

Expected: PASS; every canonical route mounts exactly one workspace page.

- [ ] **Step 7: Commit**

```powershell
git add -- frontend/src/features/campaigns/admin/AdminConsole.tsx frontend/src/features/campaigns/admin/CampaignOperationsPage.tsx frontend/src/features/campaigns/resolver/AdminConsole.tsx frontend/src/features/campaigns/public/Page.tsx frontend/src/features/explore/PublicArea.tsx frontend/src/features/explore/AppShell.tsx frontend/scripts/campaigns-admin-account.test.mjs frontend/scripts/campaigns-operational-boundaries.test.mjs frontend/scripts/campaigns-workspace-routes.test.mjs frontend/scripts/campaigns-public-surfaces.test.mjs frontend/scripts/campaigns-studio.test.mjs
git commit -m "refactor(frontend): separate admin operations workspace"
```

### Task 7: Pin backend resource authorization to the new workspace assumptions

**Files:**
- Create: `backend/src/modules/campaigns/tests/workspace-authorization.spec.ts`
- Modify only if a test exposes a real gap: relevant controller/service under
  `backend/src/modules/campaigns`, `backend/src/modules/payout`,
  `backend/src/modules/completion`, `backend/src/modules/evidence` or
  `backend/src/modules/review`

**Interfaces:**
- Consumes: existing AuthGuard, AdminGuard, ResolverGuard, Creator ownership,
  canonical Backer entitlement and dossier/file ACL services.
- Produces: no new endpoint; tests define the resource authorization contract.

- [ ] **Step 1: Add a focused authorization matrix test**

Create Creator, unrelated authenticated user, canonical Backer, Resolver and
Admin fixtures. Assert:

- public preview and public evidence remain public;
- unrelated authenticated user cannot read Creator private evidence,
  publication terms, payout explanation/evidence files or completion files;
- Creator can read/write only its own Creator resources;
- canonical Backer can read authorized payout/completion dossiers but cannot
  create or decide them;
- Resolver can read/decide review resources but cannot submit Creator requests;
- Admin endpoints require Admin and do not implicitly grant Resolver financial actions;
- client-supplied wallet/user identifiers never replace the authenticated actor.

- [ ] **Step 2: Run the focused test**

From `backend`:

```powershell
npm.cmd run test -- --runInBand src/modules/campaigns/tests/workspace-authorization.spec.ts
```

Expected: PASS if existing boundaries are complete. If it fails, retain the
failing test and make the smallest service/guard correction; do not broaden
roles or invent a new policy.

- [ ] **Step 3: Run adjacent workflow suites**

```powershell
npm.cmd run test -- --runInBand src/modules/campaigns/tests/http.spec.ts src/modules/campaigns/tests/workflow-http-acceptance.spec.ts src/modules/review/tests/review-http.spec.ts
```

Expected: PASS with existing financial and evidence semantics unchanged.

- [ ] **Step 4: Commit**

```powershell
git add backend/src/modules/campaigns/tests/workspace-authorization.spec.ts
# If the test exposed a real gap, add only the exact controller/service files changed for that gap.
git commit -m "test(backend): pin campaign workspace authorization"
```

### Task 8: Update end-to-end journeys, documentation and full static verification

**Files:**
- Modify: `backend/scripts/campaigns/campaign-browser-e2e.cjs`
- Modify: `docs/PROJECT_OVERVIEW.md`
- Modify: `docs/campaigns/WORKFLOWS.md`
- Modify: `PRODUCT.md`
- Modify: `docs/PROJECT_PROGRESS.md`

**Interfaces:**
- Consumes: canonical route helpers and the implemented workspace pages.
- Produces: one browser journey that crosses role boundaries only through their
  canonical routes; no change to financial expectations.

- [ ] **Step 1: Update browser navigation helpers**

Replace suffix-based navigation with explicit helpers:

```js
publicCampaign(id)
creatorCampaign(id)
resolverCampaign(id, tab)
adminCampaign(id)
```

Keep all existing assertions for unequal pledges, production/final PDF review,
private download, disbursement policy, completion, goal transfer and pro-rata
surplus settlement. Add assertions that each page shows its workspace heading
and does not show another role's primary financial CTA.

- [ ] **Step 2: Run the frontend suite and build**

From `frontend`:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Expected: all tests PASS, oxlint exits `0`, TypeScript/Vite build exits `0`.

- [ ] **Step 3: Run backend and Foundry verification**

From `backend`:

```powershell
npm.cmd run build
npm.cmd run test:campaigns
npm.cmd run test:fundtogether:e2e
```

From `contracts` in the configured WSL Foundry environment:

```bash
forge build
forge test
```

Expected: all suites PASS; ABI and contract source are unchanged by this refactor.

- [ ] **Step 4: Run browser E2E on the current runtime**

From `backend`:

```powershell
node scripts/campaigns/campaign-browser-e2e.cjs
```

Expected: PASS. The script restores its Anvil snapshot and drops its temporary
database, proving the refactor before destructive reset.

- [ ] **Step 5: Update current documentation**

Document canonical routes, role responsibilities, route-gate versus backend/
contract authorization, and the fact that financial policy did not change.
Mark old detail URLs as compatibility redirects.

- [ ] **Step 6: Verify docs and patch hygiene**

```powershell
rg -n "#/campaigns/[^ ]+/(creator|resolver)" PRODUCT.md docs frontend/src backend/scripts/campaigns
git diff --check
git status --short
```

Expected: old detail URLs remain only in the explicit compatibility test/docs;
diff check is clean and only scoped files are changed.

- [ ] **Step 7: Commit**

```powershell
git add backend/scripts/campaigns/campaign-browser-e2e.cjs docs/PROJECT_OVERVIEW.md docs/campaigns/WORKFLOWS.md PRODUCT.md docs/PROJECT_PROGRESS.md
git commit -m "docs: document role-oriented campaign workspaces"
```

### Task 9: Fresh-reset the disposable runtime and run final multi-role acceptance

**Files:**
- No source file changes expected.
- Runtime targets only:
  - `.local/fundtogether/anvil`
  - `.local/fundtogether/generated/campaigns-deployment.local.json`
  - WSL native FundTogether Anvil state resolved by `start-chain.ps1`
  - Docker Compose project `fundtogether` volumes

**Interfaces:**
- Consumes: verified Tasks 1-8, current `start-services.ps1`, migration IDs
  `0000_fundtogether_baseline` through `0010_campaign_payout_file_purposes`, and
  `npm.cmd run seed:accounts`.
- Produces: fresh local chain/deployment/database/storage/accounts and a recorded
  acceptance result. No production or source state is changed.

- [ ] **Step 1: Capture and validate exact reset targets**

Record RPC chain ID/block/genesis, manifest hashes/addresses/deployment block,
API health, database name, Docker Compose project/volumes and the process IDs
from `.local/fundtogether/runtime`. Resolve every path to an absolute path and
verify it stays inside `.local/fundtogether`, the WSL
`~/.local/state/fundtogether/campaigns/anvil` directory or the named
`fundtogether` Compose project.

- [ ] **Step 2: Stop only verified FundTogether processes**

Stop the API/web PIDs recorded by this runtime and the FundTogether Anvil
supervisor resolved from its PID files. Recheck ports `3002`, `5175` and `9548`.
Do not stop unrelated Node, Codex, Docker or WSL processes.

- [ ] **Step 3: Archive recoverable chain/deployment metadata**

After the verified FundTogether processes are stopped, move the current Anvil
saved state, Windows backup state and generated Campaign manifest into a
timestamped directory under the system temporary directory. Record its
absolute path. Do not move or delete source files.

- [ ] **Step 4: Remove only FundTogether PostgreSQL/MinIO volumes**

From the repository root, after verifying the Compose file and env file:

```powershell
docker compose --env-file .local\fundtogether\backend.env -f infra\fundtogether\compose.yaml down --volumes
```

Expected: only the `fundtogether` containers/network/named volumes are removed.

- [ ] **Step 5: Start from genesis, deploy, migrate and seed**

```powershell
& .\backend\scripts\campaigns\start-services.ps1
Push-Location backend
npm.cmd run seed:accounts
Pop-Location
```

Expected: fresh chain `31339`, verified `campaigns-local-v6` deployment,
migrations `0000`-`0010`, five fixture accounts/wallet links, Resolver/Admin
roles and seeded MockUSDC balances.

- [ ] **Step 6: Verify clean canonical state**

Verify:

- RPC `9548` is Anvil chain `31339`;
- manifest genesis/code hashes match RPC bytecode and its deployment block is
  from the fresh low-height chain;
- API `3002/health` reports `CAMPAIGNS`, chain `31339` and the same contract;
- web `5175` returns HTTP `200`;
- all migrations `0000`-`0010` are present exactly once;
- five users and five wallet links exist;
- campaign, pledge, entitlement, payout/completion and surplus projections are empty;
- MinIO contains no previous campaign evidence/PDF objects.

Do not use contract address change as proof of reset because deterministic
deployment may recreate the same address.

- [ ] **Step 7: Run final multi-role acceptance**

Execute the browser E2E and a manual smoke test using the seeded Creator,
Resolver, Admin and two unequal Backers. Verify canonical routes, wallet actor,
submitted/receipt/indexed transitions, private ACLs, Creator/Resolver separation,
Admin read-only operations and Backer pledge/download/surplus behavior.

- [ ] **Step 8: Record reset and verification result**

Update `docs/PROJECT_PROGRESS.md` with the reset date, manifest identity,
migration range, automated test counts and any manual limitation. Report the
temporary archive path and that PostgreSQL/MinIO volume data was intentionally
removed and is not recoverable from the repository.

- [ ] **Step 9: Final review gate**

Run:

```powershell
git diff --check
git status --short --branch
```

Then review the complete branch for:

- no financial-policy drift;
- no private endpoint from public route;
- no role-selected mutation in shared detail code;
- no unrelated source/runtime deletion;
- no credentials, private keys or fixture passwords in tracked files or output.

