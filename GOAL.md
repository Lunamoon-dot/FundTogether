# Goal — Reward Crowdfunding

FundTogether runs one local product: Reward Crowdfunding for independent comics and artbooks.

The supported journey is Creator verification, campaign and tier review, on-chain pledge, controlled production spending, fulfillment, completion or proportional refund. Financial truth is the Reward contract, canonical events, and the idempotent Reward indexer.

Legacy product flows are removed from active source, contracts, local launchers, frontend routes, migrations, and documentation. Existing local archive files and Docker volumes are neither started nor migrated.

## Verification baseline

- Reward unit tests and contract tests protect custody, tier limits, production verification, fulfillment, disputes, wind-down, and refunds.
- The supported local identity is `REWARD` on chain `31339`, RPC `9548`, API `3002`, web `5175`, PostgreSQL `5436`, and MinIO `9202/9203`.
- A transaction is only reflected in the app after receipt validation and canonical event indexing.
