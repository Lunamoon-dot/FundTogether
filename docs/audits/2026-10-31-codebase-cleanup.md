# Codebase cleanup audit — 2026-10-31

Baseline: `origin/main` at `4e38289`, plus the isolated Judge integration
commit `ef9f8f2`. This audit records usage evidence before cleanup deletion.

## Classification

| Classification | Evidence-backed scope |
| --- | --- |
| `ACTIVE_VNEXT` | `frontend/src/features/campaigns/vnext/` is routed by `PublicArea.tsx` and covered by the VNext frontend scripts. `VNextController`, `VNextEvidenceController`, `VNextEvidenceService` and `VNextIndexerService` are registered in `backend/src/app.module.ts`. `CampaignEscrowVNext.sol`, `JuryRegistry.sol` and `JuryReview.sol` are used by deployment scripts, generated ABIs and Foundry tests. |
| `ACTIVE_LEGACY` | Resolver/historical frontend routes remain reachable through `PublicArea.tsx` and `campaignRoutes.ts`. Historical controllers, services and both historical indexers remain registered in `AppModule`; `start-services.ps1` still launches the historical Campaign runtime. Historical contracts and scripts remain covered by regression and runtime-identity tests. |
| `HISTORICAL_REFERENCE` | Dated records under `docs/archive/`, `docs/research/`, `docs/superpowers/` and pre-reset progress documents are retained for traceability and are not runtime authority. |
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
