# FundTogether Editions Namespace and Documentation Restructure

## Status

Design proposal for review. This document defines the boundary for a later
implementation plan; it does not authorize code or data migration yet.

## Goal

Make FundTogether Editions the single product namespace in the frontend and
product documentation, while retaining `reward` only where it is a necessary
technical compatibility boundary for the existing API, database, contract, and
historical records.

The restructure must make the current product legible without changing user
flows, public URLs, API contracts, database meaning, smart-contract behavior,
financial state transitions, or archived historical evidence.

## Current problem

The current frontend places the active Editions product, historical Reward
surfaces, and shared UI under `frontend/src/features/reward`. It also mixes
component names such as `EditionsCampaign`, `RewardCreatorStudio`, and
`RewardResolverConsole`. Empty `.gitkeep` directories for older concepts such
as campaigns, challenges, milestones, refunds, and reputation remain beside
the active code.

The backend similarly uses `reward` as both the public protocol/module name and
the home for newer Editions services. The docs use `Reward Crowdfunding`,
`Reward`, and `Editions` inconsistently, while some older workflow documents
remain discoverable beside the current Editions policy.

This is namespace and information-architecture debt, not a request to create a
second product or to remove historical Reward data.

## Approved direction

### Product vocabulary

- **FundTogether Editions** is the current product.
- **Edition / Ấn phẩm** is one independent digital comic or artbook project.
- **Reward Crowdfunding** is the funding model and technical protocol family.
- **PDF reward** is the single current backer entitlement.
- **Legacy Reward** is used only for compatibility surfaces, historical data,
  or archived documentation.

The frontend and product docs use Editions vocabulary by default. `Reward`
remains in API paths, database identifiers, contract/deployment identifiers,
and explicitly historical or compatibility contexts unless a separate migration
is approved.

### Frontend target boundary

There is one product feature branch for the current UI:

```text
frontend/src/features/
├─ editions/
│  ├─ public/
│  ├─ creator/
│  ├─ resolver/
│  ├─ backer/
│  ├─ transactions/
│  ├─ shared/
│  └─ compatibility/
├─ auth/
├─ explore/
└─ organizations/
```

There is no parallel `features/reward` product branch. `compatibility/` is a
small sub-area of Editions for routes or read-only records that still need to
be reachable while historical data is retained. It is not a second product.

Representative internal names become:

| Current | Target | Reason |
| --- | --- | --- |
| `features/reward/EditionsCampaign.tsx` | `features/editions/public/CampaignPage.tsx` | Folder supplies the product context. |
| `features/reward/EditionsFeed.tsx` | `features/editions/public/Feed.tsx` | Remove redundant prefix. |
| `features/reward/EditionsReview.tsx` | `features/editions/creator/PreparationForm.tsx` plus resolver/public modules | Split mixed responsibilities. |
| `RewardCreatorStudio.tsx` | `features/editions/creator/Studio.tsx` | Current product name is Editions. |
| `RewardCreatorProfile.tsx` | `features/editions/creator/Profile.tsx` | Current Editions creator/IP profile. |
| `RewardResolverConsole.tsx` | `features/editions/resolver/Console.tsx` | Current Editions review role. |
| `RewardAdminConsole.tsx` | `features/editions/resolver/AdminConsole.tsx` | Editions operations remain under the product. |
| `RewardBackerEntitlements.tsx` | `features/editions/compatibility/HistoricalEntitlements.tsx` | Historical Reward read-only surface. |
| `RewardPublicCampaign.tsx` | `features/editions/compatibility/LegacyCampaignPage.tsx` | Retained only for compatibility. |

The exact final split must follow imports and responsibility, not just file
names. A component is not moved into compatibility merely because it currently
has a `Reward` prefix; `RewardCreatorStudio`, for example, already renders the
active Editions creator journey.

### Public compatibility boundary

The following remain stable during this restructure:

```text
#/reward
#/reward/review
#/reward/creator
#/reward/creator/profile
#/reward/my-rewards
#/reward/editions/:id
/v1/reward/...
reward_campaigns
REWARD_V1
```

The hash routes are existing user-facing links. The `/v1/reward` prefix,
database identifiers, contract names, deployment manifests, and event/indexer
stream identities are technical contracts. A namespace cleanup must update
imports and module paths without silently changing any of them.

### Backend target boundary

The NestJS root module remains `reward` in the first migration so that module
registration and API contracts remain stable. Internal files may be grouped by
responsibility:

```text
backend/src/reward/
├─ editions/
│  ├─ controllers/
│  ├─ services/
│  ├─ schemas/
│  ├─ policies/
│  └─ tests/
├─ legacy/
├─ shared/
└─ reward.module.ts
```

This backend grouping is a later, separately verifiable phase. It must not
rename public route decorators, database tables, contract ABI symbols, or
financial state values merely to make names look cleaner.

### Documentation target boundary

`PRODUCT.md` remains the root product entrypoint because it is an established
artifact and is referenced directly by the project workflow. A docs index and
clear current/archive boundary are added around it:

```text
docs/
├─ README.md
├─ architecture/
├─ editions/
├─ engineering/
├─ plans/
├─ specs/
└─ archive/
   ├─ legacy-reward/
   ├─ organizations/
   ├─ milestones/
   ├─ refunds/
   └─ old-workflows/
```

Current Editions policy, workflow, manual test, progress, and source-of-truth
documents become discoverable from `docs/README.md`. Historical documents are
not deleted; they are marked as archived and moved or indexed without being
presented as current product requirements. Links are updated rather than
silently broken.

The docs must explicitly distinguish:

```text
Current product: FundTogether Editions
Funding model: Reward Crowdfunding
Technical compatibility: reward API/module/database identifiers
Historical material: Legacy Reward / archived workflows
```

## Non-goals and safety boundaries

This restructure does not:

- change a hash route, API route, database schema, migration identity, or
  contract/deployment identity;
- change pledge, escrow, payout, refund, entitlement, indexer, or wallet
  authentication behavior;
- reintroduce physical fulfilment, shipping, inventory, charity, or
  organization crowdfunding into Editions;
- delete historical Reward records or old docs that are required as evidence;
- replace a behavior-changing refactor with a cosmetic rename when the file
  owns financial or authorization logic;
- rename `reward` in backend/API/database merely for visual consistency.

## Migration principles

1. Inventory first. Every move must have a current import/route consumer or an
   explicit archive decision.
2. Keep the public boundary stable. Rename internal files and exports while
   preserving route/API behavior.
3. Separate compatibility from active product code. Historical surfaces remain
   reachable only where current routes or documented compatibility require them.
4. Split by responsibility, not by arbitrary file count. Large files are
   decomposed only when the resulting boundaries are independently testable.
5. Preserve dirty work. The implementation plan must use exact file moves and
   focused patches, without resetting or overwriting unrelated user changes.
6. Verify each phase. Frontend tests/build, backend tests/build, contract tests,
   route smoke checks, and documentation link scans are separate gates.

## Proposed execution phases

### Phase 0 — Baseline and inventory

- Record current route/import consumers for every file under
  `frontend/src/features/reward`.
- Confirm that `campaigns`, `challenges`, `evidence`, `milestones`, `refunds`,
  and `reputation` contain only placeholders and have no runtime consumers.
- Identify whether `review/InternalArea.css` has any consumer.
- Map current backend Reward files into Editions, shared, legacy, and tests.
- Build a docs index of current, pending, and historical documents.
- Capture frontend/backend/contract verification before moving files.

### Phase 1 — Frontend namespace migration

- Create `features/editions` subdirectories.
- Move active Editions components and rename exports/imports.
- Move still-reachable historical surfaces under
  `features/editions/compatibility`.
- Keep `EditionAppShell` and route strings stable while changing import paths.
- Split `EditionsReview.tsx` only along existing creator preparation, Resolver
  review, public frozen terms, and community review responsibilities.
- Split `reward.css` only where selectors can be assigned without changing
  rendered behavior.
- Remove empty placeholder directories only after the import scan is clean.

### Phase 2 — Backend internal grouping

- Group current Editions controllers/services/policies/schemas under the
  internal `reward/editions` boundary.
- Group historical Reward service/controller code under `reward/legacy` only
  when tests prove it is not an active Editions dependency.
- Keep `reward.module.ts` as the registration boundary in this phase.
- Do not change financial logic, route paths, schema versions, or indexer
  identity.

### Phase 3 — Documentation restructure

- Add `docs/README.md` with current reading order and an archive policy.
- Add a product glossary and naming rules.
- Make `PRODUCT.md`, `PROJECT_OVERVIEW.md`, `research-direction.md`,
  `PROJECT_PROGRESS.md`, Editions financial policy, and Editions manual test
  guide clearly current.
- Move or mark old milestone, organization, physical fulfilment, and generic
  Reward workflow docs as archived; preserve their historical status and links.
- Replace mixed product terminology in current docs without rewriting factual
  historical evidence.
- Update file links and references after every move.

### Phase 4 — Cleanup and release verification

- Search for imports from removed frontend placeholder paths.
- Search active frontend code for redundant `Reward*` and `Editions*` names;
  remaining matches must be documented compatibility, API, or protocol names.
- Run frontend tests, lint, and build.
- Run backend build and Reward/Editions regression suites.
- Run Foundry tests without changing contract sources.
- Start the local runtime and smoke-test the existing hash routes and API
  health identity.
- Run a docs-link/reference scan and review the diff for accidental behavior or
  contract changes.

## Verification requirements

The work is complete only when all of these are true:

- Active frontend code is discoverable under `features/editions`.
- No parallel frontend product branch named `features/reward` remains.
- Remaining compatibility code is explicitly named and isolated.
- Existing hash routes and `/v1/reward` API routes still resolve.
- TypeScript/lint/build checks pass.
- Backend and contract tests pass with unchanged financial assertions.
- No database migration or contract artifact changes are introduced by a
  namespace-only phase.
- Current docs have one vocabulary and archived docs are not presented as
  current requirements.
- No user data, historical records, private evidence, or ignored local
  verification artifacts are deleted.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| A file is classified as legacy but still renders an active Editions state | Use import and route inventory before moving; run route smoke tests. |
| Rename changes behavior through a broad rewrite | Use file moves and focused import/export edits; no opportunistic logic cleanup. |
| Old docs are mistaken for current policy | Add archive labels and a canonical docs index before moving content. |
| API/database/contract names are renamed accidentally | Treat them as compatibility boundaries and add grep checks to verification. |
| Dirty user changes are overwritten | Inspect status, patch only named files, and never reset or checkout the worktree. |
| Splitting large components changes state/query behavior | Preserve query keys, route keys, transaction actions, and test each extracted boundary. |

## Decisions deferred until implementation planning

- Exact final filenames for every extracted component after import analysis.
- Whether a historical route remains in `compatibility` or becomes a redirect;
  no route is removed without explicit evidence and a replacement.
- Which old docs are moved versus indexed in place when external links or
  historical evidence make moving them risky.
- Whether backend grouping is done in the same change series as frontend
  migration or as a separate implementation plan.

These are implementation details, not permission to change the approved
product boundary or compatibility contracts.
