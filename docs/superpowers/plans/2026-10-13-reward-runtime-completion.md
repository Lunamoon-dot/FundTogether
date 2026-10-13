# Reward Runtime Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one reproducible Reward-only local command that creates fresh infrastructure, deploys a verified Reward contract, starts API/web, and proves the live vertical slice.

**Architecture:** PostgreSQL and MinIO run in the isolated Reward Compose project. A Reward baseline migration creates only schemas used by auth, organizations, event indexing, and Reward domain services. The launcher sequences environment validation, containers, RPC identity, deployment manifest, migration, backend health identity, and frontend readiness; it never resets an occupied listener or starts legacy local state.

**Tech Stack:** PowerShell, Node.js, NestJS, Drizzle/PostgreSQL, Docker Compose, MinIO, Foundry/Anvil, React/Vite, Viem.

**Spec:** [../../PROJECT_OVERVIEW.md](../../PROJECT_OVERVIEW.md)

## Global Constraints

- Use only Reward endpoints: RPC `9548`, API `3002`, web `5175`, PostgreSQL `5436`, MinIO `9202/9203`.
- Keep all generated local state below `.local/reward/`; do not read, start, migrate, reset, or remove archived legacy local data or Docker volumes.
- `REWARD_PII_ENCRYPTION_KEY` is required and must pass the existing environment guard before API startup.
- Listener identity mismatch is fail-closed: never terminate a process the launcher does not own.
- The fresh baseline contains only shared auth/organization/indexer tables and Reward tables; it has no legacy campaign or disbursement tables.
- No financial rules or Reward contract behavior change in this work.

## Review Focus

- A fresh database must migrate successfully and contain all foreign-key parents used by Reward tables, with no unrelated tables.
- A pre-existing listener on `9548` must remain alive if it does not validate against the current Reward manifest.
- A WSL-only Anvil must not be claimed usable until Windows Node can complete `eth_chainId` against `127.0.0.1:9548`.
- API health must identify `protocolKind: "REWARD"`, chain ID, and deployed contract address before frontend launch.
- The launcher must not stage secrets or use the invalid placeholder deployment for a live session.

---

### Task 1: Build and test the fresh Reward migration baseline

**Files:**
- Create: `backend/drizzle/reward/0000_reward_baseline.sql`
- Create: `backend/scripts/reward/migrate-isolated.cjs`
- Create: `backend/scripts/reward/migrate-isolated.test.cjs`
- Modify: `backend/drizzle/reward/0000_reward_tables.sql` (fold into the single baseline, then remove)

**Interfaces:**
- Produces `migrateRewardDatabase(root: string): Promise<void>`.
- The baseline creates `users`, `wallet_links`, `auth_sessions`, `auth_challenges`, `organizations`, `organization_members`, `platform_roles`, `indexer_streams`, `chain_events`, and every `reward_*` table and constraint used by `backend/src/database/schema/`.

- [ ] **Step 1: Write the failing baseline audit test**

Test `migrate-isolated.test.cjs` against an ephemeral `fundtogether_reward` database. Assert required table names exist, `reward_campaigns.creator_user_id` and `reward_campaign_projection.stream_id` foreign keys resolve, and names matching legacy campaign/disbursement patterns do not exist.

- [ ] **Step 2: Run the migration audit test to verify it fails**

Run: `node backend/scripts/reward/migrate-isolated.test.cjs`
Expected: FAIL because the current table-only SQL lacks parent tables and no isolated migrator exists.

- [ ] **Step 3: Implement the baseline and migrator**

`migrate-isolated.cjs` must load `.local/reward/backend.env`, call `guardEnvironment`, connect using `pg`, wrap the idempotent schema-version record and SQL application in a transaction, and reject a database name other than `fundtogether_reward`. The SQL file must be self-contained and ordered by foreign-key dependency.

- [ ] **Step 4: Run the migration audit test to verify it passes**

Run: `node backend/scripts/reward/migrate-isolated.test.cjs`
Expected: PASS; a repeat invocation is a no-op and produces the same schema.

- [ ] **Step 5: Commit**

```powershell
git add backend/drizzle/reward backend/scripts/reward/migrate-isolated.cjs backend/scripts/reward/migrate-isolated.test.cjs
git commit -m "feat: add reward database baseline"
```

### Task 2: Make the Reward RPC reachable and verify its ownership

**Files:**
- Modify: `backend/scripts/reward/start-chain.ps1`
- Modify: `backend/scripts/reward/anvil_state_reward.py`
- Modify: `backend/scripts/reward/local-rpc-endpoint.test.cjs`
- Create: `backend/scripts/reward/windows-rpc-probe.cjs`

**Interfaces:**
- Produces `probeWindowsRpc(url: string): Promise<{ chainId: number; clientVersion: string }>`.
- `start-chain.ps1` may proceed to deployment only after the Windows probe reaches `http://127.0.0.1:9548` and observes chain ID `31339`.

- [ ] **Step 1: Write failing RPC bridge tests**

Add test cases for a reachable JSON-RPC endpoint, wrong chain ID, and an endpoint available only inside WSL. The last case must return a diagnostic instructing the launcher to stop without deployment.

- [ ] **Step 2: Run the RPC bridge test to verify it fails**

Run: `node backend/scripts/reward/local-rpc-endpoint.test.cjs`
Expected: FAIL because the current supervisor only assumes WSL networking will expose localhost to Windows.

- [ ] **Step 3: Implement explicit bridge handling**

Keep the chain process under the Reward supervisor. Prefer the Windows-reachable loopback mode supported by the installed WSL configuration; if host forwarding is unavailable, stop the supervisor it just started, preserve state, and print the exact WSL configuration/restart action required. Do not introduce a remote RPC fallback and do not bind API or database to public interfaces.

- [ ] **Step 4: Run the RPC bridge tests and deploy verification**

Run: `node backend/scripts/reward/local-rpc-endpoint.test.cjs; & .\backend\scripts\reward\start-chain.ps1; node backend/scripts/reward/deploy-isolated.cjs --verify-only`
Expected: tests PASS; the manifest validates through Windows `127.0.0.1:9548` without a new deployment on the second command.

- [ ] **Step 5: Commit**

```powershell
git add backend/scripts/reward/start-chain.ps1 backend/scripts/reward/anvil_state_reward.py backend/scripts/reward/local-rpc-endpoint.test.cjs backend/scripts/reward/windows-rpc-probe.cjs
git commit -m "fix: verify reward rpc bridge before deployment"
```

### Task 3: Add the supported Reward service launcher

**Files:**
- Create: `backend/scripts/reward/run-backend.cjs`
- Create: `backend/scripts/reward/start-services.ps1`
- Create: `backend/scripts/reward/start-services.test.cjs`
- Modify: `backend/package.json`
- Modify: `frontend/package.json`

**Interfaces:**
- `& .\backend\scripts\reward\start-services.ps1 [-SkipBuild]` starts and owns only Reward process handles saved in `.local/reward/`.
- `run-backend.cjs` loads `.local/reward/backend.env` and `deployment.local.json`, exports `REWARD_RPC_URL` and `REWARD_CONTRACT_ADDRESS`, then executes `dist/src/main.js`.

- [ ] **Step 1: Write the failing launcher static test**

Assert the launcher runs initializer, Reward Compose, `start-chain.ps1`, `migrate-isolated.cjs`, backend build/run, health probe, and frontend Reward mode. Assert all log/PID locations are under `.local/reward/` and no prohibited legacy name appears.

- [ ] **Step 2: Run the launcher test to verify it fails**

Run: `node backend/scripts/reward/start-services.test.cjs`
Expected: FAIL because the launcher and backend runner do not exist.

- [ ] **Step 3: Implement deterministic startup and teardown-aware probes**

Use `docker compose --env-file .local/reward/backend.env -f infra/reward/compose.yaml up -d`, `Invoke-RestMethod` for both JSON-RPC and `/health`, `Start-Process -WindowStyle Hidden` for API/web, and exact process handles only for processes spawned by this command. Health must equal `protocolKind: "REWARD"` and match the current manifest contract address.

- [ ] **Step 4: Run launcher test and local startup acceptance**

Run: `node backend/scripts/reward/start-services.test.cjs; & .\backend\scripts\reward\start-services.ps1 -SkipBuild`
Expected: PostgreSQL/MinIO healthy, verified manifest exists, API health succeeds, and web responds on `5175`.

- [ ] **Step 5: Commit**

```powershell
git add backend/scripts/reward backend/package.json frontend/package.json
git commit -m "feat: add reward local startup command"
```

### Task 4: Perform Reward-only end-to-end acceptance and document evidence

**Files:**
- Modify: `docs/PROJECT_OVERVIEW.md`
- Modify: `docs/PROJECT_PROGRESS.md`
- Modify: `GOAL.md`

**Interfaces:**
- Documents exact successful commands and clearly separates automated verification from wallet/manual acceptance.

- [ ] **Step 1: Run the complete verification sequence**

```powershell
& .\backend\scripts\reward\start-services.ps1 -SkipBuild
Set-Location backend; npm.cmd run build; npm.cmd run test:reward; npm.cmd run test:reward:e2e
Set-Location ..\frontend; npm.cmd run test; npm.cmd run lint; npm.cmd run build
wsl.exe -d Ubuntu-24.04 -- bash -lc "cd /mnt/c/Users/dell/Desktop/FundTogether/contracts && forge test"
```

Expected: launcher/health pass, Reward E2E passes using the generated manifest, frontend checks pass, and Foundry tests pass.

- [ ] **Step 2: Add a runtime identity regression check**

Create or extend a Node test so a placeholder manifest, wrong health protocol, or contract-address mismatch prevents the frontend/API acceptance result from being reported as ready.

- [ ] **Step 3: Record only observed evidence**

Update the three documentation files with actual test counts, command output dates, deployment identity behavior, and any remaining manual wallet test.

- [ ] **Step 4: Review and commit**

Run: `git diff --check; git status --short`
Expected: no local state or secrets staged.

```powershell
git add GOAL.md docs/PROJECT_OVERVIEW.md docs/PROJECT_PROGRESS.md
git commit -m "docs: record reward runtime verification"
```

## Self-review

- Fresh-schema correctness is owned by Task 1.
- The WSL-to-Windows failure is explicitly tested and fail-closed in Task 2.
- One repeatable command and ownership boundaries are owned by Task 3.
- No claim of readiness is allowed before the live command sequence in Task 4.
