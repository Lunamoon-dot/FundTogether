# Project progress

## Current focus

- DONE: Fresh Reward-only migration baseline with shared auth/organization/indexer parents and Reward domain tables.
- DONE: One isolated local launcher for PostgreSQL, MinIO, Anvil, deployment verification, migration, API, and frontend.
- DONE: Windows-to-WSL RPC bridge verified on `127.0.0.1:9548`; the launcher stops its own new supervisor without deployment when forwarding is unavailable.
- DONE: Runtime identity gates reject a placeholder deployment, wrong API protocol, contract-address mismatch, and an unowned/stale web listener.
- DONE: Legacy source, frontend routes, scripts, contracts, and old migration lineage removed from active repository code.

## Observed verification — 2026-10-13

| Command | Observed result |
| --- | --- |
| `& .\backend\scripts\reward\start-services.ps1 -SkipBuild` | PostgreSQL and MinIO healthy; Reward RPC chain `31339`, manifest, migration, API `3002`, and web `5175` ready. A repeat run reused only verified listeners. |
| `npm.cmd run build` in `backend` | PASS |
| `npm.cmd run test:reward` in `backend` | 4 suites, 17 tests PASS |
| `npm.cmd run test:reward:e2e` in `backend` | 6 contract scenarios PASS; 1 HTTP suite, 28 tests PASS |
| `npm.cmd run test`, `npm.cmd run lint`, `npm.cmd run build` in `frontend` | 1 test PASS; lint clean; production build PASS |
| `forge test` in `contracts` | 2 suites, 12 tests PASS (9 Reward including 256-run fuzz, 3 MockUSDC) |

The generated local manifest used contract `0xe7f1725e7734ce288f8367e1bb143e90bb3f0512` on chain `31339`. It is local runtime evidence only; a later fresh state can create a different local address.

## Remaining manual acceptance

- Browser wallet connection, signature/login, transaction confirmation, and indexed UI state still require a human wallet walkthrough.
- This evidence does not approve public deployment, real assets, fiat conversion, legal compliance, or real-world creator/fulfillment verification.
