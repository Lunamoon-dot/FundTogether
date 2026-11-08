# FundTogether VNext local demo acceptance

**Acceptance date:** 2026-11-08  
**Baseline:** `9ecd8e22572a36eb1e21963ce1730776f6edc8a6` (`lunamoon/vnext-demo-baseline`)  
**Runtime:** Windows 11, Node.js 24.21.0, npm 11.19.0, Docker 29.8.2, Foundry 1.8.4 in WSL Ubuntu-24.04; Anvil chain 31339, MockUSDC, PostgreSQL and MinIO in isolated local containers.

## Result

Fresh acceptance run `b6a7ad43c358491aa98c0e86fbce59e8` passed both phases:

| Phase | Result | Duration |
|---|---:|---:|
| Direct contract acceptance | PASS | 28.73 s |
| Browser workflow acceptance | PASS | 173.86 s |
| Default runtime restoration | PASS | READY; 0 campaigns; indexer lag 0 |

The run used separate disposable chain state, PostgreSQL databases, MinIO volumes and Compose projects for the direct and browser phases. The launcher removed those stacks and restored the default runtime. The generated machine-readable reports are under `.local/fundtogether/runtime/` and are intentionally not committed.

## Scenario A — funded campaign and payout

- Creator created campaign `0` through the UI; the test confirmed the canonical `CampaignCreated` receipt and indexed projection.
- Publication Judges were staked/enrolled, assigned, voted and settled by direct contract calls because the current Creator UI cannot perform that complete publication-court setup. The Creator finalized publication through the UI.
- Backer approved the exact `100000000` base-unit allowance and contributed `100000000` units (`100 MockUSDC`) through Funding Checkout. Receipt, `ContributionReceived`, indexed projection and escrow custody agreed.
- The test advanced the disposable chain past the funding deadline and finalized funding through the UI. Creator payout remained zero.
- Creator used the Evidence Wizard to select the exact PDF, calculate and confirm SHA-256, submit the hash on-chain, and upload the same bytes. The evidence projection reached `AVAILABLE` and policy `READY`.
- Test helpers directly reserved Judge stake, enrolled Judges, finalized the snapshot and assigned the milestone court. All three Judges used Guided Judge UI to select PASS, generate and back up salts, commit, reload, import backups, verify commitments and reveal. Court finalization was through the UI.
- `finalizeNoAppeal` and bounded Judge settlement used direct contract calls because those actions are not available in the current UI. Creator then synchronized the final ruling and paid the milestone through the UI.
- Final contract checks: raised `100000000`, paid `100000000`, refunded `0`, CampaignEscrow token balance `0`, Creator balance increased by exactly `100000000`; `MilestonePaid` and `CampaignCompleted` were emitted and indexed.

Key UI transaction receipts:

| Action | Transaction | Gas used |
|---|---|---:|
| Campaign creation | `0x8652288e2904d3ec60b0d21e7e64d9060f846e78e814395d9cf0475518f6de55` | 707,891 |
| Backer contribution | `0xdb8c499e65485763f9b8dd0fbe2916a8a91910c33d4fb757761e75db9f067bf9` | 180,549 |
| Funding finalization | `0xf7b95d78c3cbc6eac596faa83b5e03311ef5e8198147ff4eec831aee4932870c` | 59,413 |
| Milestone evidence commit | `0xbe29f5d4df5bfe3db2def938becf9a4984af19e8c11ceb2700479fa1dd8677ef` | 508,372 |
| Milestone payout | `0xf64f6fe736eeaba04abc6ddff61fa203dba5653fa5e248f02e1f534074f77be1` | 107,170 |

## Scenario B — underfunded campaign and refund

- Creator created campaign `1`; publication review resolution used direct contract calls and publication finalization used the UI.
- Backer approved the exact `50000000` base-unit allowance and contributed `50000000` units (`50 MockUSDC`) through the UI against a `100 MockUSDC` goal.
- After deadline, the UI finalized funding as unsuccessful, froze refund allocations in a bounded batch and claimed the refund.
- `BackerRefundClaimed` was confirmed from the receipt and canonical indexer. Contract entitlement and the Backer balance change were exactly `50000000`; Creator payout was zero; campaign raised `50000000`, refunded `50000000`, and CampaignEscrow balance was zero.
- A second claim simulation reverted as already claimed.

| Action | Transaction | Gas used |
|---|---|---:|
| Refund campaign creation | `0x13e41abb59139638c5aa9473be4c3b17b311f8865d2c6dda0b59522d455e2a29` | 713,491 |
| Refund opening | `0x16b38df880b69de1fcd430d99e8db4777ffb0a69bfc6eda9310269eaab299db6` | 94,499 |
| Refund claim | `0x10cde2ad1a284b2f3460a2d4b69d889b59e0d484f1b18300cbde54f267f8e886` | 92,651 |

## Automated verification

| Area | Command | Result |
|---|---|---|
| Frontend | `npm test` | PASS — 270 tests |
| Frontend | `npm run build` | PASS — Vite production bundle built |
| Frontend | `npm run lint` | PASS — exit 0; four warnings, including two in `AccountAccess.tsx` |
| Backend | `npm run build` | PASS |
| Backend | `npm run lint` | PASS |
| Backend | `npm run test:vnext:unit` | PASS — 13 suites, 45 tests |
| Backend | `npm run test:vnext-runtime` | PASS — 6 tests |
| Backend | `npm run test:vnext-demo-tools` | PASS — 2 tests |
| Contracts | `forge test --summary` (WSL Foundry 1.8.4) | PASS — all reported VNext, invariant, fuzz, historical and test-fixture suites; 0 failures |
| Launcher | `doctor`, `status`, `smoke` | PASS — prerequisites available; VNext identity valid; services healthy; indexer lag 0 |
| Launcher | PowerShell parser and `git diff --check` | PASS |
| Runtime | `scripts/vnext-demo.ps1 demo:test-fresh` | PASS — both direct and browser phases; default runtime restored |

The frontend lint command exits successfully with warnings for `Date.now` in `JudgeConsole.tsx`, set-state-in-effect and a missing effect dependency in `AccountAccess.tsx`, and `Date` during render in `CampaignWorkspacePage.tsx`. The build also reports a minified chunk above 500 kB.

## One-run performance observations

Measurements are from one local acceptance run and are descriptive only. They are not statistically meaningful performance estimates.

| Measurement | Observed |
|---|---:|
| Direct stack readiness | 56.97 s |
| Browser stack readiness | 55.86 s |
| Browser scenario duration | 149.98 s |
| UI receipt confirmation | median 286 ms, 22 receipts |
| Canonical indexer latency | median 2.34 s, 20 indexed transactions; range 1.01–6.96 s |
| Principal VNext API reads | median 26 ms, 432 reads; maximum 1.27 s |
| Frontend production entry bundle | 1,282.03 kB minified, 313.94 kB gzip |

Follow-up: split the large frontend entry bundle and profile the slower tail of API reads and canonical indexing under repeated runs. Local service startup is roughly 56–61 seconds on this machine; no broad performance refactor was part of this task.

## Human-wallet and remaining status

- Manual MetaMask or other human-wallet interaction was not tested. Browser acceptance used an isolated Playwright EIP-6963 test wallet and SIWE test sessions.
- No missing prerequisite blocked this run. WSL Foundry is available at `/home/dell/.foundry/bin/forge`; Windows PowerShell does not expose `forge` directly.
- Direct Judge setup and final no-appeal settlement remain explicit helper-driven steps. The scenarios are not represented as fully UI-driven.
- No automated acceptance failures remain in the final fresh run. Public-chain, real-money and production readiness are outside this local demo acceptance.
