# FundTogether Campaign Namespace Restructure — Completed plan

> This plan records the completed internal rename. It is intentionally narrow:
> no financial logic, chain state, ArI wire shape, database meaning, or user
> entitlement behavior was changed.

## Decision

Remove the accidental product-specific namespace from active code and current
docs. Use `campaigns` for the feature/domain namespace and concrete folders for
delivery, review, pledges, evidence, creator, resolver, and backer behavior.

## Completed work

### 1. Frontend namespace

- Moved active UI to
  `frontend/src/features/campaigns/{public,creator,resolver,backer,transactions,shared,historical}`.
- Renamed the shell to `AppShell`, the API module to `api/campaigns.ts`, and
  internal campaign/review/deployment types to neutral domain names.
- Renamed internal CSS classes and query keys from product-prefixed forms to
  campaign/domain forms.
- Renamed frontend test files to `campaigns-*.test.mjs`.
- Preserved hash-route behavior while moving the visible detail route to
  `/campaigns/:id`; there is no active product route for the retired namespace.

### 2. Backend namespace

- Moved application registration to `backend/src/app.module.ts`.
- Grouped active code under `backend/src/modules/campaigns`, `delivery`,
  `pledges`, `review`, `evidence`, and `auth`, with the indexer in
  `backend/src/indexer`.
- Removed the active `backend/src/reward` source tree.
- Renamed internal deployment, policy, snapshot, and service identifiers to
  domain names and regenerated the local manifest.
- Moved local helper scripts to `backend/scripts/campaigns` and renamed script
  files that carried the old product label.

### 3. Documentation namespace

- Renamed the current docs directory to `docs/campaigns`.
- Renamed current plan/spec filenames to campaign/domain names.
- Updated `PRODUCT.md`, the docs index, project overview/progress, research
  direction, current policy/workflow docs, and the completed design spec.
- Preserved historical documents and technical identifiers as evidence; they
  are not current product namespaces.

## Verification gates

Run from the repository root unless noted:

```powershell
cd frontend
npm.cmd test
npm.cmd run build

cd ..\backend
npm.cmd run build
npm.cmd run test:campaigns

cd ..
node backend/scripts/campaigns/campaign-namespace.test.mjs
git diff --check
```

The campaign suite that touches Foundry artifacts additionally requires
`contracts/out` to exist. Build contracts before that suite when the artifacts
are absent; this is a test-environment prerequisite, not a namespace change.

## Safety result

This was a source/documentation namespace rename. The local test database and
Anvil state are disposable and are regenerated when the manifest or env
namespace changes. No production chain, production database, or financial
transition was changed.
