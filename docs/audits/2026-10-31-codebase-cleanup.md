# Codebase cleanup audit — 2026-10-31

Baseline: `origin/main` at `4e38289`, plus the isolated Judge integration
commit `ef9f8f2`. This audit records usage evidence before cleanup deletion.

## Classification

| Classification | Evidence-backed scope |
| --- | --- |
| `ACTIVE_VNEXT` | `frontend/src/features/campaigns/vnext/` is routed by `PublicArea.tsx` and covered by the VNext frontend scripts. `VNextController`, `VNextEvidenceController`, `VNextEvidenceService` and `VNextIndexerService` are registered in `backend/src/app.module.ts`. `CampaignEscrowVNext.sol`, `JuryRegistry.sol` and `JuryReview.sol` are used by deployment scripts, generated ABIs and Foundry tests. |
| `ACTIVE_LEGACY` | Resolver/historical frontend routes remain reachable through `PublicArea.tsx` and `campaignRoutes.ts`. Historical controllers, services and both historical indexers remain registered in `AppModule`; `start-services.ps1` still launches the historical Campaign runtime. Historical contracts and scripts remain covered by regression and runtime-identity tests. |
| `HISTORICAL_REFERENCE` | At audit time, pre-reset records were retained for traceability. The later obsolete-docs cleanup removed Resolver/HED archives and pre-reset plans from the working tree while preserving VNext research and protocol records. Git history remains the recovery path. |
| `TEST_ONLY` | Frontend `scripts/*.test.mjs`, backend `*.spec.ts`, Foundry fixtures/mocks and the deterministic frontend deployment fixture added by this cleanup are test inputs only. |
| `GENERATED_REQUIRED` | `backend/src/blockchain/generated/`, database migrations, Foundry lock/remappings and checked-in research outputs are imported by runtime, deployment verification or reproducibility checks and remain tracked. |
| `CONFIRMED_UNUSED` | The 24 tracked PNG/PDF render outputs under `tmp/` have no import, script, documentation or test references outside `tmp/`; they are disposable document-render previews. |
| `UNKNOWN` | Anything without conclusive import, registration, route, script or test evidence is retained. No `UNKNOWN` source file is approved for deletion by this audit. |

## Cleanup decisions

- Remove only the 24 `CONFIRMED_UNUSED` files under `tmp/` and ignore the
  repository-root `/tmp/` render workspace.
- Keep the legacy runtime intact and label its boundary in code and current
  documentation. Do not change routes, authentication or the default launcher.
- Make clean-checkout frontend tests use an explicit test bootstrap and fixture;
  keep runtime deployment validation and invalid-sentinel rejection strict.
- Add check-only backend linting and lightweight CI. Runtime E2E remains outside
  CI because it requires local Anvil, PostgreSQL, MinIO and deployment manifests.
- Do not refactor transaction lifecycle, indexer persistence, event decoding,
  database transactions, production Solidity, schema or migrations.

## Obsolete-document follow-up

The follow-up documentation cleanup removed 75 tracked files (about 1.06 MB)
that belonged to the pre-reset Resolver/HED/charity versions:

- `docs/archive/`, `docs/plans/` and `docs/specs/`;
- pre-reset Campaign V1 policy, scope, workflow and manual guides;
- the old `PRODUCT.md`, introduction DOCX, local Resolver account guide and
  progress ledger;
- pre-reset 2026-10-18/19 implementation plans and designs;
- the `v0.3/` HED proposals and unused `skills/AGENTSKILLS.md` mirror.

VNext protocol/policy documents, research reproducibility records, generated
artifacts, migrations, fixtures and executable historical code were retained.
Deleted documents remain recoverable from Git history.
