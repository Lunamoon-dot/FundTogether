# Goal — Reward Crowdfunding

FundTogether runs one local product: Reward Crowdfunding for independent comics and artbooks.

The supported journey is Creator verification, campaign and tier review, on-chain pledge, controlled production spending, fulfillment, completion or proportional refund. Financial truth is the Reward contract, canonical events, and the idempotent Reward indexer.

Legacy product flows are removed from active source, contracts, local launchers, frontend routes, migrations, and documentation. Existing local archive files and Docker volumes are neither started nor migrated.

## Verification baseline

- On 2026-10-13, the fresh Reward migration audit, local launcher, backend build, Reward unit/E2E suites, frontend checks, and Foundry suite passed against the isolated local runtime.
- Runtime identity is fail-closed: a placeholder manifest, wrong API protocol, or contract-address mismatch cannot be reported ready. The launcher reuses only API/web listeners that match the current Reward manifest.
- Reward unit tests and contract tests protect custody, tier limits, production verification, fulfillment, disputes, wind-down, and refunds.
- The supported local identity is `REWARD` on chain `31339`, RPC `9548`, API `3002`, web `5175`, PostgreSQL `5436`, and MinIO `9202/9203`.
- A transaction is only reflected in the app after receipt validation and canonical event indexing.

This is a verified local-pilot baseline, not public-chain, real-asset, legal, or manual wallet acceptance evidence.
