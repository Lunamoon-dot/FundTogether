# Project progress

## 2026-10-15 Editions Resolver review SLA and public surfaces

- Added additive migrations `0006_reward_editions_review_sla` and
  `0007_reward_editions_review_sla_backfill`. `submit-review` records a 24-hour
  Resolver SLA; an overdue row remains `UNDER_REVIEW` and does not auto-approve,
  reject, open pledge or move funds. `CHANGES_REQUESTED` clears the active
  window and returns the Creator to `DRAFT` while preserving review history.
- Public Editions is now separated into `/review`, `/activation`, and `/funding`.
  Funding visibility requires an intact approved commitment plus a canonical
  indexer binding in contract state `FUNDING (0)`; approved-but-unpublished rows
  remain activation-pending.
- Creator/public UX now labels the three surfaces and shows the 24-hour/overdue
  review meaning. No public feedback or deadline timer can change review or
  financial state; Resolver remains the sole campaign reviewer.
- PASS: full Editions backend suite `7 suites / 78 tests`, including delivery
  surface `10/10` and review HTTP `14/14`; frontend tests `40/40`, backend build,
  and frontend production build. The frontend build
  retains the existing large-chunk warning.
- Current local Reward DB was migrated in place without reset. Existing
  `UNDER_REVIEW` rows were backfilled with a 24-hour read-model window; no chain,
  indexer, pledge, refund, entitlement or token balance was reset.

## 2026-10-14 scope cleanup verification

- Removed the deferred progressive-funding scaffold and its interface test:
  `IEscrowV2Types.sol`, `IFundTogetherProgressiveEscrow.sol`,
  `IFundTogetherRefundVault.sol`, and `ProgressiveEscrowInterfaces.t.sol`.
  `FundTogetherEditions.sol`, `FundTogetherReward.sol`, historical ABIs, and
  existing financial obligations were not changed.
- PASS: Foundry `30/30` — MockUSDC 3, Editions 18, legacy Reward 9.
- PASS: Foundry `forge fmt --check` sau khi chuẩn hóa các contract/type/test Solidity
  hiện hành bị lệch formatter.
- PASS: backend Reward/ Editions unit suites `65/65`.
- PASS: frontend tests `29/29`, frontend lint, and production build. The build
  retains the existing large-chunk warning.
- PASS after Docker restart: backend Editions integration `7 suites, 76/76`
  against the real local PostgreSQL/MinIO/Anvil runtime; chain `31339`, current
  deployment and API/web listeners were verified by the standard launcher.
- PASS: `backend/scripts/reward/editions-browser-e2e.cjs` completed all six
  browser checkpoints with isolated DB/storage and snapshot/revert chain
  cleanup. Its injected Anvil wallet and fixture creator verification are not
  manual MetaMask or real-world identity/IP acceptance.
- NOT RUN: manual MetaMask acceptance with human Resolver/Backer accounts and
  real-world Creator/IP verification. Those remain separate from automated
  local evidence.

## Current focus — 2026-10-13 final checkpoint

- DONE R0/R1: strict COMICS_ARTBOOK draft, one STANDARD DIGITAL_DOWNLOAD PDF, exact amounts and server rejection of unsupported categories/rewards/physical fields.
- DONE R2: verified Creator/linked wallet, private samples, frozen immutable terms and human Resolver review with correction history.
- DONE R3: approved editions-local-escrow-v1 on a separate local MockUSDC contract/deployment; no advance, 7-day release challenge, fixed-price pledge, full refunds on approved pre-payout failure paths, zero fee. Community checks details; Resolver decides.
- DONE R4 automated local acceptance: production/release evidence, structural PDF checks, immutable byte/hash binding, private account-bound download, canonical/reorg/refund gates, community feedback and explicit optional backer confirmation. Download/confirmation is not payout authorization.
- DONE R5: physical API/UI/active ORM/crypto/config removal and guarded archival migration implemented and verified. After the operator stopped the old API, fresh reconciliation and backup preceded migration 0005 on the main local DB. The rebuilt API is running with verified Editions routes; financial rows and historical contract balances are unchanged.
- DONE local manual-test clock reset: the shared Anvil head had reached 2033 after repeated time-warping tests. The pre-reset chain, PostgreSQL, MinIO, manifests and logs are backed up under `.local/reward/reset-backups/2026-10-13-chain-clock-reset`. A fresh chain/DB/storage now starts at current time; Reward and Editions were redeployed and migrations 0000–0005 applied.
- No public or real-money launch. Actual product Editions deployment is verified but contains no user-paid campaign; isolated test deployments exercise payment. Creator identity/IP verification is seeded in browser tests, not independently verified in the real world.

## Final verification

| Check | Observed result |
| --- | --- |
| Backend TypeScript build | PASS |
| Full backend Jest | 195 PASS; 20/20 suites PASS |
| Editions suites within that run | 76 PASS: schema HTTP 20, review HTTP 13, canonical ledger 8, delivery HTTP 9, PDF parser 4, deployment 14, commitment 8 |
| Historical + Editions draft HTTP after retirement | 44 PASS; real PostgreSQL/Anvil with a disposable database |
| Frontend | 29 tests PASS; lint PASS; build PASS, existing bundle-size warning (main bundle about 1.14 MB) |
| Foundry | 30 PASS: Editions 18, legacy financial contract 9, MockUSDC 3; two fuzz tests with 256 runs each. Editions now covers pledge, challenge and payout at one second before and exactly at their deadlines. |
| Migration 0005 | PASS fresh/upgrade/repeat; missing/stale audit blocks; exact archival, immutable archive, canonical rollback compatibility |
| Historical DB snapshot migration before clock reset | PASS: archive 8 entitlements, 8 batches, 8 batch joins, 8 campaign histories; keep all 32 financial rows and statuses/amounts/receipt identities; preserved in the reset backup |
| Browser with real auth/SIWE/API/storage/Anvil | Six checkpoints PASS, including retired API/schema rejection, community/Resolver review, canonical pledge, separate production/PDF review, byte-verified private download, challenge and full refund |
| Existing Editions deployment verifier | PASS after all reorg tests; original Reward manifest unchanged |
| Historical main local cutover before clock reset | PASS: fresh audit + ignored SQL backup; 0005 applied; exact delivery archive; 11 table fingerprints preserved after excluding retired delivery columns; 32 live financial rows unchanged |
| Current manual-test runtime | PASS: fresh chain 31339 block 4 at 2026-10-13 16:14:36 UTC with zero-second observed drift; API 3002/web 5175; fresh DB/storage; Reward `0xe7f1…0512`, Editions `0x9fe4…a6e0` |
| Shared-chain isolation | PASS: 41 focused tests, legacy 6-scenario E2E, browser six checkpoints and full 195-test backend run all restored the exact pre-run block hash/timestamp |

The three auth/account-boundary failures from the preceding checkpoint are resolved. Two unlink-wallet tests used positional database fixtures that no longer matched the Editions query sequence; they now bind responses to the table being queried and cover frozen/approved Editions commitments. The account-boundary test exposed a runtime defect: switching accounts or logging out removed `reward-*` queries but left Creator-private `my-reward-*` queries alive. The provider now removes both scopes; the regression test uses a real QueryClient and verifies pending old-account work is aborted before a late response can populate cache.

Final Jest ran serially with isolatedModules transformation under memory pressure; production TypeScript build was checked independently. Reproduce from backend:

```powershell
node --env-file=../.local/reward/backend.env --experimental-vm-modules -e 'require("jest").run(["--runInBand", "--globals", JSON.stringify({"ts-jest":{"isolatedModules":true}})])'
node scripts/reward/migrate-isolated.test.cjs
node scripts/reward/editions-browser-e2e.cjs
node scripts/reward/deploy-editions.cjs --verify-only
```

Frontend verification: node --test --test-concurrency=1 scripts/*.test.mjs, npm.cmd run lint, npm.cmd run build. Foundry: WSL ~/.foundry/bin/forge test --summary from contracts. Both the parser and browser byte check operate on actual PDF bytes; they do not prove visual rendering quality, malware absence, IP rights or reading/acceptance.

Time-warping acceptance code now snapshots the shared Anvil chain before any deployment or `evm_increaseTime` and reverts in cleanup. This applies to the legacy HTTP suite, Editions ledger/delivery suites, legacy 6-scenario script and browser Editions script. Each refuses a non-Anvil RPC. The current full backend artifact confirms 195/195 PASS while leaving the exact chain head unchanged.

Evidence under ignored .local/reward/verification: backend-final-tests-after-clock-fix.json; auth-fix-focused.json; editions-browser/result.json, backer-release.png and downloaded.pdf; editions-retirement-audit.json; physical-retirement-copy-result.json; physical-retirement-main-before.json; physical-retirement-main-result.json; physical-retirement-runtime-result.json. The reset backup, reward-before-physical-retirement.sql and reward-before-main-cutover-1791902644847.sql contain private historical data and must remain ignored.

## R5 reconciliation and completed cutover

The user explicitly requested continued reconciliation to remove physical. Eight physical records were matched to eight disposable legacy test deployments using canonical receipt/block/log, campaign commitment, tier/quantity/amount, fixture account provenance and known local test wallets. The product Reward contract has zero campaigns. There are 24 legacy campaign rows and 32 entitlement rows. The old HTTP suite caused shared-DB contamination; it now creates/migrates/drops a dedicated database and no longer creates shipping fixtures.

All eight physical rows say REFUND_ELIGIBLE in the DB, but their contracts are COMPLETED with refundSnapshotted=false; simulation of claimRefund reverts. Each campaign retains 3,500 MockUSDC available. One test deployment also retains 1,000 MockUSDC from its second fixture campaign (4,500 token balance). These are historical fixture/accounting limitations, not completed refunds. No transfer, relabeling, contract mutation or escrow reset was performed.

Migration 0005 requires fresh audit fingerprints, saves full original delivery rows plus campaign/tier/entitlement/dispute/projection snapshots, moves batches into reward_archive, makes ordinary archive writes/deletes/truncates fail, and drops active shipping/tracking/receipt columns. Financial rows, old statuses, ABI/event decoding and canonical refund sync stay intact. Unknown obligations abort migration. The retired address encryption methods/runtime key requirement and physical service/routes/forms were removed; historical commitment hashing retains old fields so old hashes remain reproducible. The old local encryption key is retained for operator recovery; there is no archive decryption API or public export. Archive retention is indefinite until a later explicit reviewed decision.

The operator stopped the old API and authorized continuation. Port 3002 was confirmed free before a fresh deployment-scoped audit, an ignored SQL backup and migration 0005 at 2026-10-13 21:44 Asia/Saigon. All 32 live entitlement rows and 11 table fingerprints were preserved after excluding the ten retired delivery columns; all eight original delivery rows match their archive exactly. Eight batches, batch joins and campaign histories are retained. A fresh backend build passed, the launcher reused the verified chain/web and started the rebuilt API. Nineteen HTTP checks passed, including the verified Editions manifest, public database-backed lists, private-route authentication and retired endpoints returning 404. Historical contract balances remain unchanged; neither product deployment has a campaign. R5 is DONE for the local MVP. The prior process-stop approval block was resolved by the operator; it was not bypassed.

This R5 paragraph records the pre-clock-reset runtime. Its database, object storage, manifests and chain snapshot remain recoverable in `.local/reward/reset-backups/2026-10-13-chain-clock-reset`; the live manual-test runtime is now fresh and does not contain those historical rows.

All implementation remains uncommitted on codex/hed-mvp-cleanup at f2650dc54ba88f93dadc530b185c72991212eb64. Historical checkpoints below describe their time of execution and are superseded by this section.

## Editions R2 and R3 checkpoint — 2026-10-13

- Additive migration `0002_reward_editions_review`: snapshot/preparation/revision/wallet binding and private sample metadata. Fresh and baseline-upgrade/repeat migration audit passed; local migration applied. Existing physical rows are retained.
- Backend build PASS. Reward unit: 5 suites / 71 PASS, including 8 deterministic commitment tests. New R2 HTTP suite: 13 PASS against PostgreSQL and MinIO with real byte-signature validation; only the authenticated principal is injected.
- R1 HTTP: 20 PASS. Legacy contract scenarios: all 6 PASS. The first combined HTTP run had 60 PASS / 1 FAIL because inherited local background polling consumed the event before the reorg test's explicit `runOnce`; disabling polling inside that manually driven test fixture produced 28/28 PASS on rerun. This does not disable polling in application runtime.
- Frontend build and lint PASS; 23 tests PASS including account-scoped creator-cache regression.
- Foundry full suite: 27 PASS (15 Editions + 9 historical Reward + 3 token), including two 256-run custody fuzz tests. Editions tests cover exact approvals, no advances, one pledge/wallet, overfunding, separate production/release, 7-day challenge, backup, 30-day dispute timeout, full pre-payout refunds, retry/double-claim prevention, immutable accepted release and failed-token-transfer rollback.
- New deployment parser/verifier: 14 tests PASS. Real Anvil + isolated PostgreSQL Editions ledger: 8 integration tests PASS, covering wrong chain/contract/revert/noncanonical logs, duplicate processing, reviewed-term binding, original account ownership, orphan/replay and canonical refunds.
- Migration `0003_reward_editions_chain` adds separate projections/entitlements keyed by `(chainId, contractAddress, transactionHash, logIndex)`. Fresh+upgrade/repeat audit PASS and local migration applied. Orphan records remain as history with canonical=false.
- Generated Editions ABI and separate deployment manifest (`.local/reward/generated/editions-deployment.local.json`, abiVersion `editions-local-v1`) are verified. Contract `0xf953b3a269d80e3eb0f2947630da976b896a8c5b`, policy hash `0xb234c97c943da31a8595e422979b2ca3040707bf6c4a4647fd34f7a9d3be8264`. Existing Reward deployment manifest/contract is unchanged. The Editions deployment was verified again after reorg tests finished. This is not a deployed PDF vertical slice or browser acceptance.
- R2 routes are under `/v1/reward/editions`; existing legacy freeze/review/publication routes continue to reject Editions. Redacted approved preview is under `/v1/reward/public/editions/:id`. Review does not enable payment.
- Existing running API has not been restarted since the previously recorded automatic approval rejection. In-process test applications load current code; this is not evidence that port 3002 serves the new routes.

## Editions R0–R1 verification — 2026-10-13

Branch `codex/hed-mvp-cleanup`, unchanged HEAD `f2650dc54ba88f93dadc530b185c72991212eb64`; changes are uncommitted. User scope-document changes present at start were preserved.

| Check | Observed result |
| --- | --- |
| Backend build | PASS |
| `npm.cmd run test:reward` | 4 suites, 63 tests PASS |
| `npm.cmd run test:reward:e2e` | 6 contract scenarios PASS; 28 legacy HTTP + initial 18 Editions HTTP tests PASS |
| Final Editions HTTP suite after owner/metadata fallback checks | 20 tests PASS, real Nest controllers/services + PostgreSQL; authentication principal injected, no wallet/RPC claim |
| `npm.cmd test -- --runInBand` (all backend suites, final) | 12 suites PASS, 2 FAIL; 143 tests PASS, 4 FAIL |
| Migration upgrade/repeat audit + fresh DB in Editions HTTP setup | PASS; old campaign category/hash and physical tier preserved |
| `node scripts/reward/migrate-isolated.cjs` | PASS; additive migration 0001 applied to local Reward DB |
| Frontend test / lint / build | 20 tests PASS; lint PASS; build PASS with >500 kB main-chunk warning |
| Foundry | 12 tests PASS, including 256-run custody fuzz |
| `git diff --check` / contract diff | PASS / no contract source changes |

The four full-suite failures also reproduce on an isolated `git archive` of the unchanged pre-R0/R1 HEAD (13 PASS, 4 FAIL in the two affected suites):

- `auth.service.spec.ts`: `blocks B frozen plan`, `blocks A submission`, `removes an unused link and invalidates other sessions and pending challenges`.
- `wallet-account-boundary.spec.ts`: `disconnects a previous account's wallet and keeps an explicit connection within the same account`.

These auth failures remain outside this change. Do not report the full backend suite as green. Independent R0/R1 review found a missing saved-PDF/price display; it was fixed with a render regression test.

No new financial policy, payout/refund logic, ABI or product deployment was introduced. Existing E2E tests deploy local fixture contracts. The new draft has a null financial policy hash and commitment, no inventory row or on-chain ID, and cannot become public/paid. Physical APIs/data/UI for historical campaigns are retained; R4 digital delivery and R5 retirement are still TODO.

Runtime limitation: API port 3002 was verified to belong to this checkout and match the existing REWARD manifest (chain 31339). Automatic execution review rejected the command to stop/restart that API with `blocked by policy`; no API restart was performed. Built code and in-process integration tests are current, but the existing live API process has not loaded R1. Migration was applied without restarting or resetting chain/data. Manual browser/wallet acceptance remains unperformed.

## Earlier Reward baseline verification — 2026-10-13

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
