# FundTogether Reward Crowdfunding

The repository supports Reward Crowdfunding only.

New campaign creation is **FundTogether Editions**, a `COMICS_ARTBOOK` draft/review flow with one `STANDARD` tier and one `DIGITAL_DOWNLOAD` PDF. The server stores the normalized `REWARD_V1` / `reward-comic-download-mvp-v1` configuration in `reward_campaigns.draft_config`; the creator account is server-owned. Unknown fields, alternate categories/reward types/formats, finite inventory and physical/shipping/address/tracking input are rejected.

The new standard tier lives in the versioned draft configuration, not the legacy inventory table. R2 adds private sample evidence, content/budget/evidence plans, release window and verified linked-wallet selection. Revision-checked updates and row locks protect freeze/review from concurrent changes. A versioned SHA-256 snapshot binds identity, wallet, PDF/tier terms and evidence hashes; correction decisions preserve the reviewed snapshot in history. The wallet binding cannot be removed while frozen/approved. Creator self-review and Admin self-verification are rejected.

The `/v1/reward/editions` routes own preparation, review, publication preflight, canonical receipt sync, evidence and download access. Public submitted/approved previews at `/v1/reward/public/editions` expose selected terms, budget/evidence plans and hashes. Community feedback is attributable and visible to its author, Creator and Resolver; public reporting exposes only counts. Identity declarations, object keys, sample bytes and final PDF remain private.

`editions-local-escrow-v1` uses a separate contract, ABI, manifest and indexer stream. Primary Resolver approves exact reviewed terms on chain and Creator consumes that approval. Canonical pledges grant versioned entitlements; production review alone does not enable downloads. Accepted final-PDF hashes enable account-bound 60-second backend download tickets with fresh canonical checks on access. Downloads and optional backer confirmation are separate from payout. See `docs/reward/EDITIONS_LOCAL_FINANCIAL_POLICY_V1.md`.

Historical contract/ABI, terms, financial records, canonical events and refund synchronization are retained. Physical API/UI and runtime shipping encryption are removed. Migration 0005 archives audited delivery records and batches before dropping active delivery columns; unreconciled/changed records abort it. It was applied to the main local database after the operator stopped the old API, and the rebuilt API was started and verified on 2026-10-13. Scope-text screening rejects common explicit physical promises conservatively; it is not semantic/IP verification or a replacement for Resolver review.

The detailed plan and observed R0–R5 progress are in `docs/superpowers/plans/2026-10-13-fundtogether-editions-digital-pdf-mvp.md`. Migrations 0001–0004 are additive. Migration 0005 passed fresh/upgrade, an actual-database copy and main-runtime verification: eight physical fixtures are archived, all 32 financial rows and historical contract balances remain unchanged, and ten active delivery columns are removed. See PROJECT_PROGRESS for test results and the remaining manual/public-launch limitations.

```text
React frontend -> NestJS API -> PostgreSQL / MinIO
                       -> Reward contract -> RPC
Reward events -> idempotent indexer -> PostgreSQL projection
```

Local services use PostgreSQL `5436`, MinIO `9202/9203`, API `3002`, web `5175`, and Reward RPC `9548`. The supported manifest is `.local/reward/generated/deployment.local.json`.

Editions optionally loads the separate `.local/reward/generated/editions-deployment.local.json` from a backend working directory, or `EDITIONS_MANIFEST_PATH`. A missing manifest disables Editions financial access. After Foundry build, run `npm run artifacts:editions`, `npm run build`, and `node scripts/reward/deploy-editions.cjs --create` from backend to create a new local deployment. Existing manifests are verified without reset; `--verify-only` verifies without deployment. The original Reward manifest remains independent.

Archived local legacy data is not part of this runtime and is never started or migrated.

## Local runtime

From the repository root on Windows PowerShell:

```powershell
& .\backend\scripts\reward\start-services.ps1 -SkipBuild
```

The command initializes only `.local/reward/`, starts isolated PostgreSQL and MinIO, verifies Windows access to Reward RPC `127.0.0.1:9548`, verifies or creates the local deployment manifest, runs the Reward baseline migration, and starts the API and web server. It fails closed if an existing RPC/API/web listener does not match the current Reward identity; it never terminates such a listener.

On 2026-10-13, the verified local deployment was chain `31339`, contract `0xe7f1725e7734ce288f8367e1bb143e90bb3f0512`. The API health response must be `REWARD`, chain `31339`, and the same contract address before web readiness is reported.

If Windows cannot reach Anvil after WSL starts it, set the following in `%USERPROFILE%\.wslconfig`, run `wsl --shutdown`, then reopen Docker Desktop and retry:

```ini
[wsl2]
localhostForwarding=true
```
