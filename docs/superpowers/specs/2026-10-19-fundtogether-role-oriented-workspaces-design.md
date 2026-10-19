# FundTogether Role-Oriented Workspaces

Status: Approved direction for implementation planning  
Date: 2026-10-19  
Scope: FundTogether Reward Crowdfunding MVP (`COMICS_ARTBOOK`, one Standard PDF tier, local chain `31339`)

## 1. Decision

FundTogether remains one React application and one Campaign domain, but its
public, Creator, Resolver, Backer and Admin application surfaces must stop
sharing one role-conditioned campaign detail page.

The frontend will use role-oriented workspaces with separate canonical detail
routes and route-level page components. Those pages may compose genuinely
shared, read-only Campaign components and the same canonical API types, but
each workspace owns its own queries, mutations, transaction controls and task
language.

This is an application/use-case boundary, not four independent DDD bounded
contexts and not four separately deployed frontends.

## 2. Current problem

`frontend/src/features/explore/PublicArea.tsx` currently parses all of these
detail forms into one component:

```text
#/campaigns/:id
#/campaigns/:id/creator
#/campaigns/:id/resolver
```

`frontend/src/features/campaigns/public/Page.tsx` then receives
`mode: 'public' | 'creator' | 'resolver'` and combines public presentation,
private evidence, activation, pledge, production review, disbursement,
completion, challenge, refund and surplus actions in one file.

The same conditional-role pattern is repeated by `DisbursementPanel` and
`CompletionSettlementPanel`. This makes public/private data requests and
financial actions difficult to reason about and gives Creator and Resolver the
mental model of a public page with injected controls rather than a workspace.

`AdminConsole.tsx` also lives in the Resolver folder even though Admin and
Resolver are separate platform roles and responsibilities.

## 3. Canonical routes

The existing hash router is retained. No router dependency is added in this
change.

```text
#/campaigns/:id                 Public and canonical Backer detail
#/campaigns/creator/:id         Creator-owned campaign workspace
#/campaigns/resolver/:id        Resolver campaign review workspace
#/admin/campaigns/:id           Admin operational inspection
```

Existing list/workspace routes remain:

```text
#/campaigns
#/campaigns/review
#/campaigns/library
#/campaigns/creator
#/campaigns/creator/draft
#/campaigns/creator/profile
#/campaigns/resolver
#/admin
```

The old detail routes are compatibility aliases during this refactor:

```text
#/campaigns/:id/creator
#/campaigns/:id/resolver
#/campaigns/:id/resolver/feedback
```

They perform a replace-style redirect to the canonical workspace route and do
not render the old page. The `feedback` alias opens the Resolver activity tab.

## 4. Workspace responsibilities

### Public and Backer

- Public campaign story, frozen Standard PDF terms, funding state and timeline.
- Pledge preflight and canonical pledge transaction.
- Signed-in Backer entitlement, private PDF ticket and optional confirmation.
- Backer challenge, review conversation and advisory dossier access when ACL
  permits it.
- Read-only disbursement/completion dossiers and the Backer's own surplus choice.
- No Creator publication/production form and no Resolver decision control.

### Creator

- Creator ownership preflight before private queries are enabled.
- Publication after exact Resolver approval, production evidence, final PDF,
  disbursement requests, completion request and responses to review threads.
- Creator transaction controls expect the frozen linked Creator wallet.
- No Resolver decision control and no Backer pledge/claim control.

### Resolver

- Resolver-role preflight before the workspace is rendered.
- Exact commitment approval, funding finalization, production/final-PDF review,
  disbursement decision, challenge resolution, completion decision and refund
  transitions already authorized by current policy and contract.
- Primary/Backup wallet eligibility remains explicit in each transaction
  preflight.
- No Creator request form and no Backer pledge/claim control.

### Admin

- Creator/IP account review, role and operational monitoring.
- Per-campaign inspection of application status, current deployment binding,
  indexed contract state and transaction identifiers.
- No Resolver financial decision button merely because the same local fixture
  user may hold both roles.

## 5. Shared boundary

The following may be shared because they present canonical read-only data:

- Campaign header and Standard PDF tier.
- Funding summary and deadlines.
- Frozen commitment, review history and public production plan.
- Canonical timeline/status formatting.
- Dossier metadata/file list components that receive already-authorized data.
- Transaction lifecycle display and error presentation.

Shared components must not decide whether a Creator, Resolver, Backer or Admin
may mutate financial state. Workspace pages choose and render their own action
components.

No shared detail component accepts a generic `mode` prop that switches between
Creator and Resolver financial behavior.

## 6. Authorization boundary

Frontend route gating is UX, not security.

```text
Hash route classification
        -> session/role/ownership preflight
        -> backend AuthGuard + role/resource authorization
        -> linked-wallet verification
        -> smart-contract caller and state checks
```

- Entering a Creator or Resolver URL manually must not reveal private data or
  show an enabled transaction control.
- Creator ownership is derived from authenticated server data, never from a
  client-supplied user or wallet address.
- Resolver and Admin platform roles continue to be checked by the backend.
- Contract authorization remains the final financial boundary.

## 7. Data and fund boundaries

This refactor does not change financial behavior:

- Smart contract: escrow, pledges, disbursements, completion, surplus and refunds.
- Indexer/database projection: canonical event-derived read state.
- PostgreSQL application data: campaign metadata, dossiers, decisions and ACLs.
- MinIO: private evidence, payout explanation/evidence files and final PDF.

The current pre-completion disbursement workflow remains intact: Creator sends
the request, Resolver decides, Backers may inspect authorized dossier material.
The current completion/surplus workflow also remains intact: Resolver approval
settles the goal and Backers individually settle their proportional surplus.

No route or component move may report a submitted wallet request as canonical
success. The existing transaction lifecycle remains:

```text
wallet request -> submitted -> receipt -> canonical event -> indexer -> UI
```

## 8. Code organization

Target frontend structure:

```text
frontend/src/features/campaigns/
├─ public/
│  └─ CampaignPage.tsx
├─ backer/
│  ├─ Library.tsx
│  └─ CampaignActions.tsx
├─ creator/
│  ├─ Studio.tsx
│  ├─ CampaignWorkspacePage.tsx
│  └─ CampaignActions.tsx
├─ resolver/
│  ├─ Console.tsx
│  ├─ CampaignReviewPage.tsx
│  └─ CampaignActions.tsx
├─ admin/
│  ├─ AdminConsole.tsx
│  └─ CampaignOperationsPage.tsx
├─ shared/
│  ├─ detail/
│  │  ├─ CampaignDetailFrame.tsx
│  │  ├─ CampaignOverview.tsx
│  │  ├─ CampaignLedger.tsx
│  │  └─ CampaignDossierList.tsx
│  └─ ui/
├─ api/
└─ transactions/
```

The exact split may keep a smaller number of files where a component remains
short, but responsibilities and imports must follow the boundary above.

## 9. Non-goals

- No Solidity, ABI, financial policy or state-enum change.
- No PostgreSQL migration or API wire-format change.
- No replacement of hash routing with React Router.
- No micro-frontends or separate deployments.
- No redesign of payout, completion, surplus, refund or dispute policy.
- No visual brand redesign unrelated to workspace ownership.
- No removal of historical/read-only compatibility surfaces.

## 10. Acceptance criteria

- Public, Creator, Resolver and Admin campaign detail routes render different
  route-level page components.
- `public/CampaignPage.tsx` has no `mode` prop and does not call private Creator
  or Resolver APIs merely because the URL contains a suffix.
- Creator and Resolver pages do not expose one another's transaction controls.
- A signed-out or wrong-role direct URL produces a clear access boundary.
- An authenticated non-owner cannot load Creator private campaign data.
- Admin campaign detail is operational and contains no Resolver financial CTA.
- Old detail URLs redirect to canonical workspace URLs without a duplicate
  transaction or query.
- Account switching cannot reuse another user's private query cache.
- Current financial and download behavior remains covered by automated and
  browser acceptance tests.
- A fresh disposable local runtime can complete the full multi-role journey
  after the implementation passes tests on the existing runtime.

## 11. Reset boundary

Resetting the chain/database is not required to implement the frontend
boundary. It is authorized for final local acceptance only, after tests pass
against the existing state.

The reset is limited to the disposable FundTogether runtime:

- Anvil chain `31339` on RPC `9548`;
- FundTogether PostgreSQL volume on `5436`;
- FundTogether MinIO volume on `9202/9203`;
- generated local Campaign manifest and local fixture accounts.

Source files, Git history, unrelated Docker volumes and unrelated processes are
outside the reset boundary. Existing Anvil state and manifest are archived to a
timestamped temporary directory before removal.
