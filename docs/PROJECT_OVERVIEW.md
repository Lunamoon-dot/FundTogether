# FundTogether — project overview

> **Status:** Current architecture and implemented-product overview.

The repository supports **FundTogether** only. Reward Crowdfunding is
the funding model; it is not a module, database or deployment namespace.

New campaign creation is **FundTogether**, a `COMICS_ARTBOOK` draft/review flow with one `STANDARD` tier and one `DIGITAL_DOWNLOAD` PDF. The server stores the normalized `FUNDTOGETHER_V1` / `fundtogether-comic-download-mvp-v1` configuration in `campaigns.draft_config`; the creator account is server-owned. Unknown fields, alternate categories/benefit types/formats, finite inventory and physical/shipping/address/tracking input are rejected.

The standard tier lives in the versioned draft configuration. R2 adds private sample evidence, content/budget/evidence plans and verified linked-wallet selection; delivery dates are not part of the draft commitment. Revision-checked updates and row locks protect freeze/review from concurrent changes. A versioned SHA-256 snapshot binds identity, wallet, PDF/tier terms and evidence hashes; correction decisions preserve the reviewed snapshot in history. The wallet binding cannot be removed while frozen/approved. Creator self-review and Admin self-verification are rejected.

The `/v1/fundtogether/campaigns` routes own preparation, review, publication preflight, canonical receipt sync, evidence and download access. After `submit-review`, the server records when Resolver review starts and keeps the campaign in private `UNDER_REVIEW_PRIVATE` until a Resolver explicitly opens `COMMUNITY_REVIEW`; there is no fixed deadline or automatic review transition. Resolver closes the review according to the agreed policy: `APPROVED`, `CHANGES_REQUESTED`, or `REJECTED`. `CHANGES_REQUESTED` returns the Creator to editable `DRAFT` while retaining review history, so the freeze/submit correction loop can repeat on one canonical campaign row. Public Campaign surfaces are separated into `/review` (only `COMMUNITY_REVIEW`), `/activation`, and `/funding`: only a canonical indexed contract binding in `FUNDING` is pledge-visible. `COMMENT` feedback is visible as an anonymized public comment to the community, Creator and Resolver; `ISSUE` and `FILE_UNAVAILABLE` feedback remains visible only to its author, Creator and Resolver. Active feedback is scoped to the current commitment/sample snapshot while audit-only delivery issues remain visible to Resolver. Identity declarations, object keys, sample bytes and final PDF remain private.

`campaigns-local-escrow-v4` uses a separate contract, ABI, manifest and indexer stream. A wallet may submit repeated fixed-price pledges and may buy multiple package units in one transaction; each canonical pledge log grants one quantity-bearing versioned entitlement. Primary Resolver approves exact reviewed terms on chain and Creator consumes that approval. Only Primary or Backup Resolver may finalize funding after the deadline; production review alone does not enable downloads. After Resolver accepts production evidence, Creator explicitly confirms campaign completion and sets the release deadline on chain. Accepted final-PDF hashes enable account-bound 60-second backend download tickets with fresh canonical checks on access. Downloads and optional backer confirmation are separate from payout. See [the Campaign financial policy](campaigns/FINANCIAL_POLICY_V1.md).

Historical contract/ABI, terms, financial records, canonical events and refund synchronization are retained. Physical API/UI and runtime shipping encryption are removed. Migration 0005 archives audited delivery records and batches before dropping active delivery columns; unreconciled/changed records abort it. It was applied to the main local database after the operator stopped the old API, and the rebuilt API was started and verified on 2026-10-13. Scope-text screening rejects common explicit physical promises conservatively; it is not semantic/IP verification or a replacement for Resolver review.

The detailed plan and observed R0–R5 progress are in `docs/plans/2026-10-13-fundtogether-digital-pdf-mvp.md`. The migration statements above are historical upgrade evidence; the current disposable local test runtime was reset on 2026-10-17 with one final-schema baseline, `0000_fundtogether_baseline.sql`, and a fresh Anvil state with newly deployed local contracts. This local reset does not rewrite production migration history or affect any production chain. See PROJECT_PROGRESS for test results and the remaining manual/public-launch limitations.

```text
React frontend -> NestJS API -> PostgreSQL / MinIO
                       -> FundTogether Campaign contract -> RPC
Campaign events -> idempotent indexer -> PostgreSQL projection
```

Local services use PostgreSQL `5436`, MinIO `9202/9203`, API `3002`, web `5175`, and Campaign RPC `9548`. The supported manifest is `.local/fundtogether/generated/campaigns-deployment.local.json`.

Campaign uses `.local/fundtogether/generated/campaigns-deployment.local.json` from a backend working directory, or `CAMPAIGNS_MANIFEST_PATH`. A missing manifest disables Campaign financial access. The full launcher runs the Foundry build, Campaign artifact generation, backend build and `deploy-campaign.cjs --create` before starting the API; the individual commands remain available for diagnostics. Existing manifests are verified without reset, while a manifest from a recreated local Anvil chain is replaced only when the explicit local `--create` path is used.

Archived local historical data is not part of this runtime and is never started or migrated.

## Local runtime

From the repository root on Windows PowerShell:

```powershell
& .\backend\scripts\campaigns\start-services.ps1
```

The command initializes only `.local/fundtogether/`, starts isolated PostgreSQL and MinIO, verifies Windows access to Campaign RPC `127.0.0.1:9548`, builds and verifies the active Campaign manifest, runs the FundTogether baseline migration, and starts the API and web server. It fails closed if an existing RPC/API/web listener does not match the current identity; it never terminates such a listener. Use `-SkipBuild` only when the already-built backend, frontend and Foundry outputs are intentionally being reused.

On 2026-10-13, the verified local deployment was chain `31339`. The API health response must be `CAMPAIGNS`, chain `31339`, and the same Campaign contract address before web readiness is reported.

If Windows cannot reach Anvil after WSL starts it, set the following in `%USERPROFILE%\.wslconfig`, run `wsl --shutdown`, then reopen Docker Desktop and retry:

```ini
[wsl2]
localhostForwarding=true
```
