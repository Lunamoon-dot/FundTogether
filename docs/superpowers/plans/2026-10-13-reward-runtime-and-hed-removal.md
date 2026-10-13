# Reward Runtime and HED Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Reward Crowdfunding the only runnable local product and remove HED-only source/runtime assets without touching archived HED local state.

**Architecture:** A new `.local/reward/` environment owns its compose stack, chain manifest, Anvil supervisor, API and web launcher. The Nest entry point imports only Reward and shared modules; frontend deployment/API boundaries consume Reward configuration only. HED-only source, contracts, migrations, scripts, UI and active documentation are removed after a search-backed dependency audit, while `.local/hed/` and existing Docker volumes remain outside script control.

**Tech Stack:** PowerShell, Node.js, NestJS, Drizzle/PostgreSQL, Docker Compose, MinIO, Anvil/Foundry, React/Vite, Viem.

**Spec:** [../../reward/2026-10-13-reward-runtime-design.md](../../reward/2026-10-13-reward-runtime-design.md)

## Global Constraints

- Reward local endpoints are RPC `9548`, API `3002`, web `5175`, PostgreSQL `5436`, MinIO `9202/9203`.
- New runtime state lives only in `.local/reward/`; no command may delete, migrate, reset or start `.local/hed/`.
- Listener identity mismatch must fail closed and never stop a process it does not own.
- Runtime config uses `REWARD_*`; no `HED_*` fallback remains in active Reward code.
- Preserve shared auth, session, wallet, organization, database, storage and chain-event primitives used by Reward.
- No financial rule or Reward contract behavior changes.

## Review Focus

- An existing listener on `9548` with a wrong genesis/contract must remain running and cause a clear launcher failure.
- A fresh Reward database must apply only the new shared/Reward migration lineage, not HED tables.
- An old HED manifest or `.local/hed/` directory must not be imported by Vite, Nest, or a Reward script.
- A missing/invalid `REWARD_PII_ENCRYPTION_KEY` must still fail before an API serves shipping PII.
- API/frontend health identity must reject a process at `3002` that is not the current Reward deployment.

---

### Task 1: Define the Reward environment and isolated container stack

**Files:**
- Create: `backend/environments/reward/.env.example`
- Create: `backend/scripts/reward/guard-environment.cjs`
- Create: `backend/scripts/reward/guard-environment.test.cjs`
- Create: `backend/scripts/reward/initialize-environment.cjs`
- Create: `infra/reward/compose.yaml`
- Test: `backend/scripts/reward/guard-environment.test.cjs`

**Interfaces:**
- Produces `.local/reward/backend.env` with `REWARD_PROTOCOL=REWARD`, API/web/RPC endpoint settings, isolated PostgreSQL/MinIO credentials and a random 32-byte-plus `REWARD_PII_ENCRYPTION_KEY`.
- Produces `guardEnvironment(env) -> { protocolKind: "REWARD", databaseName: "fundtogether_reward" }`.

- [ ] **Step 1: Write failing environment guard tests**

Test the exact valid Reward endpoint set and reject wrong protocol, database port/name, RPC port, MinIO port, absent encryption key and any `HED_*` runtime dependency.

- [ ] **Step 2: Run the guard test to verify it fails**

Run: `node backend/scripts/reward/guard-environment.test.cjs`  
Expected: FAIL because Reward guard/initializer do not exist.

- [ ] **Step 3: Implement environment initialization and Compose stack**

Create only `.local/reward/backend.env`; create a `fundtogether-reward` Compose project with PostgreSQL on `5436`, MinIO on `9202/9203`, volumes `reward-postgres` and `reward-minio`, and no HED volume references.

- [ ] **Step 4: Run the guard test to verify it passes**

Run: `node backend/scripts/reward/guard-environment.test.cjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/environments/reward backend/scripts/reward/guard-environment.cjs backend/scripts/reward/guard-environment.test.cjs backend/scripts/reward/initialize-environment.cjs infra/reward/compose.yaml
git commit -m "feat: add isolated reward local environment"
```

### Task 2: Add Reward deployment identity and chain supervisor

**Files:**
- Create: `backend/scripts/reward/generate-artifacts.cjs`
- Create: `backend/scripts/reward/deploy-isolated.cjs`
- Create: `backend/scripts/reward/anvil_state_reward.py`
- Create: `backend/scripts/reward/start-chain.ps1`
- Create: `backend/scripts/reward/artifact-contract.test.cjs`
- Create: `backend/scripts/reward/local-rpc-endpoint.test.cjs`
- Modify: `backend/src/blockchain/generated/reward/fund-together-reward.abi.json`
- Modify: `backend/src/blockchain/generated/reward/mock-usdc.abi.json`

**Interfaces:**
- Produces `.local/reward/generated/deployment.local.json` with `protocolKind: "REWARD"`, `chainId`, ABI hash, policy hash, contract/token addresses, genesis hash and deployment anchors.
- `deploy-isolated.cjs --verify-only` validates the Reward manifest against RPC without sending transactions.

- [ ] **Step 1: Write failing artifact and listener identity tests**

Assert the artifact generator rejects missing Reward ABI/functions and that `start-chain.ps1` refuses an occupied `9548` listener whose Reward manifest does not verify.

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node backend/scripts/reward/artifact-contract.test.cjs; node backend/scripts/reward/local-rpc-endpoint.test.cjs`  
Expected: FAIL because no isolated Reward deployment tooling exists.

- [ ] **Step 3: Implement Reward manifest generation, deployment verification and supervisor**

Use `FundTogetherReward.sol` and `MockUSDC`; retain exact-transfer/token decimal checks. The supervisor may start Anvil only when `9548` has no listener; it must preserve wrong listeners and throw a diagnostic instead of reset/deploy.

- [ ] **Step 4: Run artifact and listener tests to verify they pass**

Run: `node backend/scripts/reward/artifact-contract.test.cjs; node backend/scripts/reward/local-rpc-endpoint.test.cjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/scripts/reward backend/src/blockchain/generated/reward
git commit -m "feat: add reward chain deployment supervisor"
```

### Task 3: Create a Reward-only backend process and migration lineage

**Files:**
- Create: `backend/src/reward/reward-app.module.ts`
- Create: `backend/src/reward/reward-main.ts`
- Create: `backend/scripts/reward/migrate-isolated.cjs`
- Create: `backend/scripts/reward/run-backend.cjs`
- Create: `backend/drizzle/reward/0000_reward_baseline.sql`
- Modify: `backend/src/backend-root.ts`
- Modify: `backend/src/config/env.config.ts`
- Modify: `backend/src/reward/reward-indexer.service.ts`
- Modify: `backend/src/reward/reward-campaign.service.ts`
- Modify: `backend/src/reward/reward-http-acceptance.spec.ts`
- Test: `backend/src/reward/reward-http-acceptance.spec.ts`

**Interfaces:**
- `reward-main.ts` serves only Reward and shared routes at `127.0.0.1:3002` and exposes health context with `protocolKind: "REWARD"` and deployment identity.
- `migrate-isolated.cjs` applies the Reward baseline to `fundtogether_reward` only.

- [ ] **Step 1: Write failing health and no-HED-config acceptance tests**

Assert Reward app health identifies the active Reward deployment and that unset `HED_BLOCKCHAIN_RPC_URL` does not prevent receipt indexing when `REWARD_RPC_URL` is valid.

- [ ] **Step 2: Run targeted tests to verify they fail**

Run: `npm.cmd run test:reward -- --runInBand; npx.cmd jest --runInBand src/reward/reward-http-acceptance.spec.ts` from `backend/`.  
Expected: FAIL because the current entry point/module imports HED and Reward code still has HED fallbacks.

- [ ] **Step 3: Implement Reward entry point, baseline migration and config isolation**

Copy only schemas required by Auth, Organization, storage/indexer primitives and Reward tables into the Reward baseline; do not run old HED migrations. Replace active `HED_*` environment reads with explicit `REWARD_*` configuration and preserve existing fail-closed registration/indexer behavior.

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `npm.cmd run build; npm.cmd run test:reward; npx.cmd jest --runInBand src/reward/reward-http-acceptance.spec.ts` from `backend/`.  
Expected: build PASS; 17 Reward unit tests and HTTP acceptance PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/src/reward backend/src/backend-root.ts backend/src/config/env.config.ts backend/drizzle/reward backend/scripts/reward
git commit -m "feat: run reward backend without hed runtime"
```

### Task 4: Move frontend to Reward deployment and API boundaries

**Files:**
- Create: `frontend/.env.reward.example`
- Create: `frontend/scripts/reward-context.test.mjs`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/tsconfig.app.json`
- Modify: `frontend/package.json`
- Modify: `frontend/src/lib/web3/deployment-context.ts`
- Modify: `frontend/src/lib/web3/reward-deployment.ts`
- Modify: `frontend/src/lib/api/http.ts`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/features/explore/PublicArea.tsx`
- Modify: `frontend/src/features/auth/AccountSessionProvider.tsx`
- Delete: `frontend/scripts/hed-context.test.mjs`
- Delete: `frontend/scripts/hed-cutover.test.mjs`

**Interfaces:**
- Vite resolves `@fundtogether/deployment` to `.local/reward/generated/deployment.local.json`.
- HTTP client reads `VITE_REWARD_API_URL` with default `http://localhost:3002`.

- [ ] **Step 1: Write failing Reward context tests**

Assert Vite/server-side module loading resolves the Reward manifest and no active source/config file references `.local/hed`, `VITE_HED_API_URL` or `isHed`.

- [ ] **Step 2: Run the frontend context test to verify it fails**

Run: `node --test scripts/reward-context.test.mjs` from `frontend/`.  
Expected: FAIL because frontend still resolves HED deployment/context.

- [ ] **Step 3: Implement Reward-only frontend configuration**

Keep Reward creator/backer/resolver/public routes and shared account behavior. Remove HED-only route branches, API client, navigation and component imports; do not delete components until static imports are removed.

- [ ] **Step 4: Run frontend checks to verify they pass**

Run: `npm.cmd run test; npm.cmd run lint; npm.cmd run build` from `frontend/`.  
Expected: all commands PASS with no HED-context test remaining.

- [ ] **Step 5: Commit**

```powershell
git add frontend
git commit -m "feat: point frontend runtime at reward"
```

### Task 5: Add one supported Reward launcher

**Files:**
- Create: `backend/scripts/reward/start-services.ps1`
- Create: `backend/scripts/reward/start-services.test.cjs`
- Modify: `backend/package.json`
- Modify: `frontend/package.json`

**Interfaces:**
- `& .\backend\scripts\reward\start-services.ps1 [-SkipBuild]` owns only Reward-created API/web process handles and starts all Reward dependencies.

- [ ] **Step 1: Write failing launcher static tests**

Assert the launcher invokes Reward initializer, Reward compose file, Reward chain verification, Reward migration, Reward backend entry point and frontend Reward mode; assert it contains no HED path or `HED_*` variable.

- [ ] **Step 2: Run launcher test to verify it fails**

Run: `node backend/scripts/reward/start-services.test.cjs`  
Expected: FAIL because the Reward launcher does not exist.

- [ ] **Step 3: Implement the safe Reward launcher**

Follow the sequential launcher contract in the spec. Use `Invoke-RestMethod` for JSON-RPC/health probes so PowerShell does not show the `Invoke-WebRequest` parsing warning. Write logs/handles only under `.local/reward/` and fail closed for an unrecognized listener.

- [ ] **Step 4: Run launcher test and manual isolated startup verification**

Run: `node backend/scripts/reward/start-services.test.cjs` then `& .\backend\scripts\reward\start-services.ps1 -SkipBuild`.  
Expected: test PASS; PostgreSQL/MinIO healthy; health endpoint identifies Reward; web responds on `5175`.

- [ ] **Step 5: Commit**

```powershell
git add backend/scripts/reward backend/package.json frontend/package.json
git commit -m "feat: add reward local startup command"
```

### Task 6: Remove HED-only repository assets and update active docs

**Files:**
- Delete: `backend/src/disbursement/hed-*.ts`
- Delete: `backend/scripts/hed/`
- Delete: `backend/environments/hed/`
- Delete: `infra/hed/`
- Delete: `frontend/src/features/campaigns/hed/`
- Delete: `frontend/src/features/explore/HedPublicCampaign.tsx`
- Delete: `frontend/src/features/organizations/HedOrganizationVerification.tsx`
- Delete: `frontend/src/features/review/Hed*.tsx`
- Delete: `frontend/src/lib/api/hed.ts`
- Delete: `contracts/src/FundTogetherDisbursement.sol`
- Delete: `contracts/script/DeployHedMvp.s.sol`
- Delete: `contracts/test/unit/Disbursement/FundingAndReservation.t.sol`
- Delete: HED-only migrations identified by Task 3's baseline audit
- Delete: HED-only docs identified by static reference audit
- Modify: `GOAL.md`, `docs/PROJECT_OVERVIEW.md`, `docs/PROJECT_PROGRESS.md`, `docs/research-direction.md`, `docs/reward/WORKFLOWS.md`
- Test: repository static reference check

**Interfaces:**
- Produces a repository where Reward and shared code have no compile-time/runtime import of HED.
- Preserves `.local/hed/` and existing named Docker volumes by not issuing deletion commands against them.

- [ ] **Step 1: Write failing static removal test**

Create a Node test that scans active `backend`, `frontend`, `contracts`, `infra`, package scripts and active docs for prohibited HED source/runtime references, while explicitly excluding archived history in `.local/hed/` and documentation retained only as an explicitly labeled historical record if any remains.

- [ ] **Step 2: Run the removal test to verify it fails**

Run: `node scripts/reward/no-hed-runtime.test.cjs` from repository root.  
Expected: FAIL listing current HED imports/assets.

- [ ] **Step 3: Remove HED-only files in dependency order**

First remove imports and package scripts, then delete HED-only backend/frontend/contracts/scripts/infra files. Build the Reward migration baseline before deleting old HED migration lineage. Update active documentation to Reward-only wording and retain only clearly marked historical archive references required by the research record.

- [ ] **Step 4: Run the removal test to verify it passes**

Run: `node scripts/reward/no-hed-runtime.test.cjs`  
Expected: PASS; `.local/hed/` and Docker volumes remain untouched.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "refactor: remove hed runtime and retain reward only"
```

### Task 7: Verify the completed Reward-only vertical slice

**Files:**
- Modify: `docs/PROJECT_PROGRESS.md`
- Modify: `docs/PROJECT_OVERVIEW.md`
- Modify: `docs/reward/WORKFLOWS.md`

**Interfaces:**
- Documents fresh command output and any remaining manual acceptance limitation without claiming HED data was deleted.

- [ ] **Step 1: Run full fresh verification**

Run:

```powershell
& .\backend\scripts\reward\start-services.ps1 -SkipBuild
Set-Location backend; npm.cmd run build; npm.cmd run test:reward; npm.cmd run test:reward:e2e
Set-Location ..\frontend; npm.cmd run test; npm.cmd run lint; npm.cmd run build
wsl.exe -d Ubuntu-24.04 -- bash -lc "cd /mnt/c/Users/dell/Desktop/FundTogether/contracts && forge test"
```

Expected: Reward launcher/health succeeds; backend/frontend checks pass; Reward E2E passes; Foundry Reward tests pass; no HED suite remains.

- [ ] **Step 2: Record only verified evidence**

Update progress/overview/workflows with exact command counts, the new startup command, current deployment identity behavior, and the distinction between automated verification and remaining wallet/manual acceptance.

- [ ] **Step 3: Review the staged change set and commit**

Run: `git diff --check; git status --short; git diff --cached --check`  
Expected: no whitespace errors and no `.local/` secrets/states staged.

```powershell
git add docs/PROJECT_PROGRESS.md docs/PROJECT_OVERVIEW.md docs/reward/WORKFLOWS.md
git commit -m "docs: record reward-only runtime verification"
```
