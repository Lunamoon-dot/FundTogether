# FundTogether Reward Crowdfunding

The repository supports Reward Crowdfunding only.

```text
React frontend -> NestJS API -> PostgreSQL / MinIO
                       -> Reward contract -> RPC
Reward events -> idempotent indexer -> PostgreSQL projection
```

Local services use PostgreSQL `5436`, MinIO `9202/9203`, API `3002`, web `5175`, and Reward RPC `9548`. The supported manifest is `.local/reward/generated/deployment.local.json`.

Archived local legacy data is not part of this runtime and is never started or migrated.
