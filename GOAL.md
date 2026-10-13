# Goal — Reward Crowdfunding

FundTogether runs one local MVP product: Reward Crowdfunding for one independent digital comic or artbook.

The target journey is Creator verification, review of one frozen PDF-download reward, on-chain pledge, controlled production evidence, Resolver-accepted PDF release, entitlement-gated download, completion or refund. Financial truth is the Reward contract, canonical events, and the idempotent Reward indexer. Physical shipping, tracking and merchandise are not MVP behaviour.

Legacy product flows are removed from active source, contracts, local launchers, frontend routes, migrations, and documentation. Existing local archive files and Docker volumes are neither started nor migrated.

## Verification baseline

- On 2026-10-13, the fresh Reward migration audit, local launcher, backend build, Reward unit/E2E suites, frontend checks, and Foundry suite passed against the isolated local runtime.
- Runtime identity is fail-closed: a placeholder manifest, wrong API protocol, or contract-address mismatch cannot be reported ready. The launcher reuses only API/web listeners that match the current Reward manifest.
- Editions R2–R5 have automated local acceptance for frozen review, canonical escrow pledges, private reviewed PDF delivery, community reports, disputes, refunds and physical retirement. After the operator stopped the old API, migration 0005 was applied to the main local database with a fresh audit and backup. The rebuilt API is running: 19 HTTP checks passed, eight physical fixtures are archived, all 32 historical financial rows and contract balances are unchanged, and active shipping columns are gone.
- The supported local identity is `REWARD` on chain `31339`, RPC `9548`, API `3002`, web `5175`, PostgreSQL `5436`, and MinIO `9202/9203`.
- A transaction is only reflected in the app after receipt validation and canonical event indexing.

This is a verified local-pilot baseline, not public-chain, real-asset, legal, or manual wallet acceptance evidence.
