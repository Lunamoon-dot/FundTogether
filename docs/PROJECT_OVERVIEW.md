# FundTogether Reward Crowdfunding

The repository supports Reward Crowdfunding only.

```text
React frontend -> NestJS API -> PostgreSQL / MinIO
                       -> Reward contract -> RPC
Reward events -> idempotent indexer -> PostgreSQL projection
```

Local services use PostgreSQL `5436`, MinIO `9202/9203`, API `3002`, web `5175`, and Reward RPC `9548`. The supported manifest is `.local/reward/generated/deployment.local.json`.

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
