# FundTogether — project progress

> **Status:** Current implementation evidence log. A recorded PASS applies only
> to the named command, date and environment; it is not public-launch approval.

## 2026-10-19 Role-oriented Campaign workspaces

- Implemented canonical Public/Backer, Creator, Resolver and Admin Campaign detail
  routes. Legacy role-suffixed detail URLs redirect before mounting a workspace.
- Separated mutation ownership in the UI: Backer actions stay on public detail;
  Creator owns production/completion/request work; Resolver owns review and allowed
  financial decisions; Admin is an operational read-only projection.
- Added backend authorization coverage for public preview/evidence, Creator ownership,
  canonical Backer reads, Resolver decisions, Admin operations, and rejection of
  body-supplied actor/destination identifiers. Focused ACL suite passed 7/7; adjacent
  HTTP and review suites passed. Workflow HTTP acceptance requires the fresh local RPC
  runtime and will be rerun after the authorized reset.
- No contract, ABI, schema, API wire format or financial-policy change is part of this
  boundary split.

## 2026-10-18 Security remediation checkpoint

- Added bounded review conversations: transactional cap of 200 messages per
  thread, keyset pagination capped at 50 messages per response, the supporting
  cursor index/migration `0005_review_conversation_limits`, and a narrow
  message-creation throttle. The frontend exposes an explicit older-message
  continuation instead of silently truncating history.
- Added historical-only liveness and accounting guards: backup takeover and
  stale never-disbursed request expiry, residual-escrow rejection before
  `COMPLETED`, regenerated historical ABI, and the historical
  `0006_historical_dispute_integrity` migration with single-open-dispute and
  status indexes. Historical dispute transitions are row-locked and
  conditional so a canonical `REFUNDED` state cannot be overwritten by a
  stale resolver action.
- Triage found no current Campaign public-data exposure in the retained legacy
  route: it excludes current Campaign rows, while active preview routes use
  frozen/status predicates and a redacted projection. No route change was
  made.
- PASS: Foundry `35/35` (MockUSDC 3, historical 12, active Campaign 20),
  Campaign backend `92/92`, Workflow `70/70`, focused pledge/review/indexer
  `14/14`, acceptance HTTP `29/29`, frontend `136/136`, and backend/frontend
  production builds. Fresh/upgrade/repeat migration checks for `0005` and
  `0006` also passed.
- PASS: full backend Jest is `25/25` suites and `229/229` tests after aligning
  the auth unlink-wallet fixture with the existing `creatorProfiles` guard.
  The active contract `releaseDeadline` maximum horizon remains intentionally
  unimplemented until the financial-policy value is approved; the existing
  seven-day release grace rule is unchanged. The Codex Security scan must be
  rerun after usage resets.
- Deep Scan rerun `6af5a8c1-129a-42ad-bed1-73cbf9c61472` used the isolated
  Windows state/temp/plugin paths and reached discovery on all `1,229` files,
  but stopped at the usage limit before any discovery review completed. Its
  saved report contains no reportable findings and is explicitly non-final;
  coverage preserves only the already-known `unbounded-release-deadline`
  candidate and the unresolved policy-horizon question. Do not treat this
  partial report as a clean security result; resume/rerun after reset.

## 2026-10-17 Local Reward baseline reset

- Reset the disposable local Reward PostgreSQL database to an empty final
  Campaign schema. Campaigns, pledges, feedback, evidence and entitlements are
  all `0`; only the schema baseline is applied.
- Squashed the local migration runner to
  `backend/drizzle/reward/0000_reward_baseline.sql`. The former `0001`–`0012`
  files were historical local upgrade steps and are no longer part of this
  clean test baseline.
- Reset the disposable local Anvil state from genesis, then redeployed the
  MockUSDC/Reward foundation and Campaign contract. The old state and manifests
  remain recoverable under
  `C:\Users\dell\AppData\Local\Temp\FundTogether-chain-reset-20261017`.
- The deterministic local deployer produces the same contract addresses on a
  fresh chain; this does not restore old chain state. After deployment and test
  account token seeding, chain `31339` is at block `8`, with no campaign,
  feedback or entitlement rows.
- PASS: fresh chain genesis, contract deployment verification, baseline
  migration, account/token seeding, API health and local runtime restart.

## 2026-10-17 Organization/HED runtime retirement

- Removed the obsolete Organization route/API, backend module, organization
  schema code, stale HED policy artifact and internal HED navigation check.
- Removed the legacy organization-wallet guard from account unlinking and
  switched the frontend deployment alias from `.local/hed` to `.local/reward`.
- Rebuilt the disposable local Reward baseline without Organization tables or
  `reward_campaigns.organization_id`, and updated the isolated migration audit.
- Local backups and archived documentation remain untouched; this cleanup does
  not change the Campaign contract, ABI, indexer stream or chain state.

## 2026-10-17 Creator profile integrity fixes

- Creator profile submission now requires an explicit affirmative original-work
  pledge at the server boundary. Missing, `null`, and `false` values are rejected;
  Admin verification and campaign freeze also fail closed without that pledge.
- Removed the database/service defaults that could manufacture consent. Profiles
  created before enforcement return to `PENDING` with an unknown pledge and must
  be resubmitted; no contract, ABI, deployment, indexer stream, escrow or token
  balance is changed.
- Optional genre, portfolio, community and contact fields now distinguish omitted
  input from explicit `null`, so a Creator can actually clear saved values.
- PASS: focused backend profile/schema/freeze HTTP regression `99/99`, full
  backend Jest `24 suites / 223 tests`, backend and frontend production builds,
  frontend `129/129` tests plus lint, fresh/upgrade/repeat migration audit,
  namespace guards and Markdown links across 70 files.
- Applied migration `0012_reward_creator_profile_attestation` to the local
  Reward database. Its one pre-existing profile is now `PENDING` with an unknown
  pledge and must be resubmitted. Campaign chain `31339` remains at block 63
  with campaign count `0` and contract MockUSDC balance `0`.
- [x] **Release deadline model:** the disposable local Campaign chain was reset and
  the v2 contract now keeps `releaseDeadline = 0` during draft, review and initial
  activation. Resolver reviews production evidence; only Creator confirmation via
  `confirmCampaignCompletion` sets the on-chain deadline. A 30-day production
  timeout remains permissionless refund protection for an uncompleted campaign.

## 2026-10-17 Campaign namespace and documentation restructure

- Moved the active frontend from the former Reward UI area to one
  `features/campaigns` tree, split by public, Creator, Resolver, Backer,
  transactions, shared UI and explicitly read-only compatibility surfaces.
- Grouped backend internals under `reward/campaigns` and `reward/shared` while
  preserving `RewardModule`, `/v1/fundtogether`, `reward_campaigns`, `REWARD_V1`,
  controller decorators, financial states and indexer identity.
- Reorganized current product documentation under `docs/campaigns`, added a
  canonical docs index/glossary and moved superseded organization, milestone,
  refund, physical Reward and old workflow material into marked archives.
- Moved active implementation plans and specifications to `docs/plans` and
  `docs/specs`; the obsolete `docs/superpowers` container no longer exists.
- PASS: frontend 129/129 tests, lint and production build; backend namespace
  guard, build, Reward 66/66, Campaign 89/89 and full Jest 24 suites / 214 tests;
  Foundry 3 suites / 30 tests; Markdown links across 70 files.
- PASS: local health still reports protocol `REWARD`, chain `31339` and the
  existing Reward contract. Public review/activation/funding endpoints resolve;
  seven retained hash routes mounted with populated roots, no Vite error overlay
  and no browser-console errors in the final pass.
- No contract source, deployment artifact or database migration was introduced
  by this namespace phase. Existing unrelated dirty-worktree changes, including
  migration `0011_reward_creator_profile_details.sql`, were preserved.

## 2026-10-16 Campaign review conversations and Resolver escalation

- Added append-only Creator revision responses for frozen corrections. A Creator
  cannot submit ordinary community feedback to the Creator's own campaign, but
  can submit one general response with optional links to several Backer feedback
  records when resubmitting a corrected revision.
- Added a server-authorized Backer–Creator review thread for canonical funded
  campaigns. The gate requires an `ON_CHAIN_CONFIRMED` publication, an active
  post-funding contract state, and the current non-refunded entitlement; public
  or pre-funding users continue to use advisory Community Review.
- Added idempotent Backer escalation and Resolver case surfaces. Resolver can
  read the campaign snapshot, chain/indexer snapshot, entitlement identity,
  linked feedback, and append-only messages, request Creator clarification, and
  record `RESOLVED`, `DISMISSED`, or `FORMAL_DISPUTE` as an off-chain outcome.
- Review messages, response links, escalation status, and Resolver outcomes do
  not call the contract, change entitlement canonical/refunded fields, or move
  escrow. Contract state remains the financial authority; PostgreSQL is the
  indexed/application projection and conversation record.
- PASS: focused backend delivery HTTP suite `12/12`, backend TypeScript build,
  frontend delivery/public SSR suites `25/25`, frontend Studio SSR suite
  `33/33`, and frontend TypeScript/Vite production build.
- PASS: isolated local browser acceptance with separate Creator, Backer,
  Community, and Resolver sessions covers pre-funding feedback, Creator
  revision response, canonical pledge, Backer-Creator thread, Creator reply,
  Resolver escalation/outcome, unchanged entitlement/chain snapshot, exact-byte
  PDF download, challenge and refund. The script uses injected Anvil wallets;
  this is not manual MetaMask or real-world identity/IP acceptance.
- Remaining limitation is manual MetaMask and real-world Creator/IP/production
  acceptance. This entry records executable local evidence, not a claim of
  public production readiness.

## 2026-10-16 Campaign workflow reconciliation and UX configuration

- Moved successful legacy Reward campaigns from a dedicated sidebar entry into
  the public feed's `Đã gây quỹ` filter. Legacy contract states use their own
  enum mapping (`1..4` successful, `5` stopped/refund), remain read-only, and
  never enter the active Campaign pledge filter. `/campaigns/history` remains a
  compatibility alias for the funded filter.
- Simplified the public Campaign feed without changing campaign selection:
  kept compact status filters and a neutral flat empty state, while removing
  the redundant page promo header, duplicate Community Review action, and the
  Creator-only draft CTA from the Backer discovery surface.
- Redesigned the empty Backer library state without changing entitlement
  behavior: the page now has a clear library heading, a bounded empty-state
  panel, one primary discovery CTA, grouped legacy-history access, and
  responsive mobile actions. Raw indexer terminology was moved out of the
  primary explanation.
- Split the Creator area into two authenticated destinations. `/campaigns/creator`
  is now the default project workspace for draft, review, activation,
  production, and release work; `/campaigns/creator/profile` owns Studio identity,
  biography, IP declaration, and Admin verification. Unverified creators are
  directed to the profile route instead of receiving the profile form inside
  the project dashboard.
- Fixed the remaining Campaign projection guard in
  `RewardCampaignService`: canonical `campaigns_chain_campaigns` snapshots are
  now read by campaign ID even when the legacy `reward_campaigns.onchain_campaign_id`
  field is null. The creator pipeline also fails closed while its operational
  summary is unavailable and renders refund/rejection as separate terminal
  branches instead of placing refund inside the release path.
- Added one authenticated Campaign operational summary for Creator, Resolver,
  and Admin. It derives application, publication, canonical contract snapshot,
  on-chain ID, and binding transaction hash from the active Campaign stream;
  it does not read or write legacy `reward_campaigns.onchain_campaign_id` as an
  Campaign publication source.
- Creator Studio, Resolver Queue, and Admin Console now use that summary.
  `APPROVED + NOT_PUBLISHED`, `ORPHANED`, canonical funding, production/release,
  refunding, and settled states have separate Vietnamese labels and actions.
  Admin remains observational for contract money movement.
- Hardened authenticated receipt reconciliation with campaign and action
  context. Sync now checks deployment, canonical successful receipt, decoded
  function, expected event, exact frozen terms, linked actor, and the expected
  binding or entitlement before returning `ON_CHAIN_CONFIRMED`. Pending,
  reverted, unrelated, and indexing states remain explicit.
- Transaction recovery now clears only the confirmed action. Orphaned
  activation can recover from the server-side `CampaignCreated` hash when
  browser storage is empty. Pledge preflight fails closed on wallet/balance/
  allowance read errors and presents MockUSDC approval as step 1/2 followed by
  pledge as step 2/2.
- Review, delivery, challenge, refund, and payout policies were not changed.
  Local migrations `0008_reward_campaigns_review_policy` and
  `0009_campaigns_review_gating` were applied and confirmed in
  `reward_schema_migrations`. No contract, ABI, deployment, migration SQL, or
  financial policy was changed by this reconciliation pass.
- PASS: backend TypeScript build; Campaign Jest `9 suites / 88 tests`; focused
  real HTTP/PostgreSQL/MinIO/Anvil delivery and exact-sync suite `12/12`.
- PASS: frontend `108/108` tests, `oxlint`, and production build. The existing
  large-chunk warning remains.
- PASS: browser E2E six checkpoints with real auth/SIWE/API/storage/Anvil and
  injected local wallets: private review gate, exact activation, approve +
  pledge, production/PDF review, byte-verified private download, challenge,
  and canonical refund. This is automated local evidence, not human MetaMask
  or real-world identity/IP acceptance.
- LIMITATION: the backend `lint` script cannot currently run because the
  backend has no ESLint flat config (ESLint 9 reports that
  `eslint.config.js|mjs|cjs` is missing). Build and all scoped backend tests
  pass; no unrelated lint tooling was invented in this workflow change.
- Existing unrelated dirty contract, migration, and documentation changes were
  preserved and remain uncommitted.

## 2026-10-15 Campaign activation, pledge preflight, and transaction recovery

- Implemented a durable browser-local Campaign transaction record for public transaction hashes and lifecycle stages: preflight, wallet signature, submitted, receipt, indexing, canonical, and failed. Reloading the same campaign restores the record; reconciliation checks the receipt and canonical sync before clearing it. No private key, signature, or financial contract behavior changed.
- Replaced the raw pledge button with a quantity-aware preflight surface that checks signed-in account, linked wallet, local chain `31339`, canonical `FUNDING (0)`, and MockUSDC balance/allowance for `price × quantity`. Existing entitlements do not block additional purchases.
- Added the Creator/Resolver activation surface for `NOT_PUBLISHED`, `ORPHANED`, and `ON_CHAIN_CONFIRMED`, plus UI-state labels and Admin/Resolver exception copy that distinguish application approval, publication binding, indexer projection, and contract lifecycle.
- PASS: frontend TypeScript production build and `oxlint`. The existing large-chunk warning remains. Focused test suites were not added in this pass per the current execution scope.

## 2026-10-15 Campaign private Resolver gate and public surfaces

- Added migration `0008_reward_campaigns_review_policy` to remove the fixed
  review deadline and migration `0009_campaigns_review_gating` to add
  `UNDER_REVIEW_PRIVATE` and `COMMUNITY_REVIEW`. Existing Campaign rows that
  were already public under the old `UNDER_REVIEW` behavior were migrated to
  `COMMUNITY_REVIEW`; legacy Reward rows keep `UNDER_REVIEW`.
- `submit-review` now records the review start in the private state. A Resolver
  must explicitly call `open-community-review` before public feedback or a
  public preview exists. Resolver decisions are accepted only in
  `COMMUNITY_REVIEW`; `CHANGES_REQUESTED` returns the same canonical campaign
  row to editable `DRAFT` while preserving review history.
- Public Campaign is now separated into `/review`, `/activation`, and `/funding`.
  `/review` contains only `COMMUNITY_REVIEW`; private submissions never leak to
  Backers. Feedback and public counts are scoped to the current commitment and
  sample snapshot; audit-only delivery issues remain visible to Resolver.
  Funding visibility requires an intact approved commitment plus a canonical
  indexer binding in contract state `FUNDING (0)`; approved-but-unpublished rows
  remain activation-pending.
- Creator/Resolver/Backer UX now distinguishes private submission from an open
  community review, shows one Resolver card per campaign, and collapses prior
  decision history. The preparation form no longer remounts to step 1 after a
  save. No public feedback or timer can change review or financial state;
  Resolver remains the sole campaign reviewer.
- PASS: full backend Jest `20 suites / 197 tests`; Campaign backend
  `7 suites / 78 tests`; frontend tests `46/46`; backend build and frontend
  production build. The frontend build retains the existing large-chunk warning.
- PASS: local runtime migration and reload without reset; API health `ok`, chain
  `31339`, public review route returns the migrated campaign as `COMMUNITY_REVIEW`.
- Current local Reward DB is migrated in place without reset. No chain, indexer,
  pledge, refund, entitlement or token balance is reset.

## 2026-10-14 scope cleanup verification

- Removed the deferred progressive-funding scaffold and its interface test:
  `IEscrowV2Types.sol`, `IFundTogetherProgressiveEscrow.sol`,
  `IFundTogetherRefundVault.sol`, and `ProgressiveEscrowInterfaces.t.sol`.
  `FundTogetherCampaign.sol`, `FundTogetherReward.sol`, historical ABIs, and
  existing financial obligations were not changed.
- PASS: Foundry `30/30` — MockUSDC 3, Campaign 18, legacy Reward 9.
- PASS: Foundry `forge fmt --check` sau khi chuẩn hóa các contract/type/test Solidity
  hiện hành bị lệch formatter.
- PASS: backend Reward/ Campaign unit suites `65/65`.
- PASS: frontend tests `29/29`, frontend lint, and production build. The build
  retains the existing large-chunk warning.
- PASS after Docker restart: backend Campaign integration `7 suites, 76/76`
  against the real local PostgreSQL/MinIO/Anvil runtime; chain `31339`, current
  deployment and API/web listeners were verified by the standard launcher.
- PASS: `backend/scripts/campaigns/campaign-browser-e2e.cjs` completed all six
  browser checkpoints with isolated DB/storage and snapshot/revert chain
  cleanup. Its injected Anvil wallet and fixture creator verification are not
  manual MetaMask or real-world identity/IP acceptance.
- NOT RUN: manual MetaMask acceptance with human Resolver/Backer accounts and
  real-world Creator/IP verification. Those remain separate from automated
  local evidence.

## Current focus — 2026-10-13 final checkpoint

- DONE R0/R1: strict COMICS_ARTBOOK draft, one STANDARD DIGITAL_DOWNLOAD PDF, exact amounts and server rejection of unsupported categories/rewards/physical fields.
- DONE R2: verified Creator/linked wallet, private samples, frozen immutable terms and human Resolver review with correction history.
- DONE R3: approved campaigns-local-escrow-v1 on a separate local MockUSDC contract/deployment; no advance, 7-day release challenge, fixed-price pledge, full refunds on approved pre-payout failure paths, zero fee. Community checks details; Resolver decides.
- DONE R4 automated local acceptance: production/release evidence, structural PDF checks, immutable byte/hash binding, private account-bound download, canonical/reorg/refund gates, community feedback and explicit optional backer confirmation. Download/confirmation is not payout authorization.
- DONE R5: physical API/UI/active ORM/crypto/config removal and guarded archival migration implemented and verified. After the operator stopped the old API, fresh reconciliation and backup preceded migration 0005 on the main local DB. The rebuilt API is running with verified Campaign routes; financial rows and historical contract balances are unchanged.
- DONE local manual-test clock reset: the shared Anvil head had reached 2033 after repeated time-warping tests. The pre-reset chain, PostgreSQL, MinIO, manifests and logs are backed up under `.local/reward/reset-backups/2026-10-13-chain-clock-reset`. A fresh chain/DB/storage now starts at current time; Reward and Campaign were redeployed and migrations 0000–0005 applied.
- No public or real-money launch. Actual product Campaign deployment is verified but contains no user-paid campaign; isolated test deployments exercise payment. Creator identity/IP verification is seeded in browser tests, not independently verified in the real world.

## Final verification

| Check | Observed result |
| --- | --- |
| Backend TypeScript build | PASS |
| Full backend Jest | 195 PASS; 20/20 suites PASS |
| Campaign suites within that run | 76 PASS: schema HTTP 20, review HTTP 13, canonical ledger 8, delivery HTTP 9, PDF parser 4, deployment 14, commitment 8 |
| Historical + Campaign draft HTTP after retirement | 44 PASS; real PostgreSQL/Anvil with a disposable database |
| Frontend | 29 tests PASS; lint PASS; build PASS, existing bundle-size warning (main bundle about 1.14 MB) |
| Foundry | 30 PASS: Campaign 18, legacy financial contract 9, MockUSDC 3; two fuzz tests with 256 runs each. Campaign now covers pledge, challenge and payout at one second before and exactly at their deadlines. |
| Migration 0005 | PASS fresh/upgrade/repeat; missing/stale audit blocks; exact archival, immutable archive, canonical rollback compatibility |
| Historical DB snapshot migration before clock reset | PASS: archive 8 entitlements, 8 batches, 8 batch joins, 8 campaign histories; keep all 32 financial rows and statuses/amounts/receipt identities; preserved in the reset backup |
| Browser with real auth/SIWE/API/storage/Anvil | Six checkpoints PASS, including retired API/schema rejection, community/Resolver review, canonical pledge, separate production/PDF review, byte-verified private download, challenge and full refund |
| Existing Campaign deployment verifier | PASS after all reorg tests; original Reward manifest unchanged |
| Historical main local cutover before clock reset | PASS: fresh audit + ignored SQL backup; 0005 applied; exact delivery archive; 11 table fingerprints preserved after excluding retired delivery columns; 32 live financial rows unchanged |
| Current manual-test runtime | PASS: fresh chain 31339 block 4 at 2026-10-13 16:14:36 UTC with zero-second observed drift; API 3002/web 5175; fresh DB/storage; Reward `0xe7f1…0512`, Campaign `0x9fe4…a6e0` |
| Shared-chain isolation | PASS: 41 focused tests, legacy 6-scenario E2E, browser six checkpoints and full 195-test backend run all restored the exact pre-run block hash/timestamp |

The three auth/account-boundary failures from the preceding checkpoint are resolved. Two unlink-wallet tests used positional database fixtures that no longer matched the Campaign query sequence; they now bind responses to the table being queried and cover frozen/approved Campaign commitments. The account-boundary test exposed a runtime defect: switching accounts or logging out removed `reward-*` queries but left Creator-private `my-reward-*` queries alive. The provider now removes both scopes; the regression test uses a real QueryClient and verifies pending old-account work is aborted before a late response can populate cache.

Final Jest ran serially with isolatedModules transformation under memory pressure; production TypeScript build was checked independently. Reproduce from backend:

```powershell
node --env-file=../.local/reward/backend.env --experimental-vm-modules -e 'require("jest").run(["--runInBand", "--globals", JSON.stringify({"ts-jest":{"isolatedModules":true}})])'
node scripts/campaigns/migrate-isolated.test.cjs
node scripts/campaigns/campaign-browser-e2e.cjs
node scripts/campaigns/deploy-campaign.cjs --verify-only
```

Frontend verification: node --test --test-concurrency=1 scripts/*.test.mjs, npm.cmd run lint, npm.cmd run build. Foundry: WSL ~/.foundry/bin/forge test --summary from contracts. Both the parser and browser byte check operate on actual PDF bytes; they do not prove visual rendering quality, malware absence, IP rights or reading/acceptance.

Time-warping acceptance code now snapshots the shared Anvil chain before any deployment or `evm_increaseTime` and reverts in cleanup. This applies to the legacy HTTP suite, Campaign ledger/delivery suites, legacy 6-scenario script and browser Campaign script. Each refuses a non-Anvil RPC. The current full backend artifact confirms 195/195 PASS while leaving the exact chain head unchanged.

Evidence under ignored .local/reward/verification: backend-final-tests-after-clock-fix.json; auth-fix-focused.json; campaigns-browser/result.json, backer-release.png and downloaded.pdf; campaigns-retirement-audit.json; physical-retirement-copy-result.json; physical-retirement-main-before.json; physical-retirement-main-result.json; physical-retirement-runtime-result.json. The reset backup, reward-before-physical-retirement.sql and reward-before-main-cutover-1791902644847.sql contain private historical data and must remain ignored.

## R5 reconciliation and completed cutover

The user explicitly requested continued reconciliation to remove physical. Eight physical records were matched to eight disposable legacy test deployments using canonical receipt/block/log, campaign commitment, tier/quantity/amount, fixture account provenance and known local test wallets. The product Reward contract has zero campaigns. There are 24 legacy campaign rows and 32 entitlement rows. The old HTTP suite caused shared-DB contamination; it now creates/migrates/drops a dedicated database and no longer creates shipping fixtures.

All eight physical rows say REFUND_ELIGIBLE in the DB, but their contracts are COMPLETED with refundSnapshotted=false; simulation of claimRefund reverts. Each campaign retains 3,500 MockUSDC available. One test deployment also retains 1,000 MockUSDC from its second fixture campaign (4,500 token balance). These are historical fixture/accounting limitations, not completed refunds. No transfer, relabeling, contract mutation or escrow reset was performed.

Migration 0005 requires fresh audit fingerprints, saves full original delivery rows plus campaign/tier/entitlement/dispute/projection snapshots, moves batches into reward_archive, makes ordinary archive writes/deletes/truncates fail, and drops active shipping/tracking/receipt columns. Financial rows, old statuses, ABI/event decoding and canonical refund sync stay intact. Unknown obligations abort migration. The retired address encryption methods/runtime key requirement and physical service/routes/forms were removed; historical commitment hashing retains old fields so old hashes remain reproducible. The old local encryption key is retained for operator recovery; there is no archive decryption API or public export. Archive retention is indefinite until a later explicit reviewed decision.

The operator stopped the old API and authorized continuation. Port 3002 was confirmed free before a fresh deployment-scoped audit, an ignored SQL backup and migration 0005 at 2026-10-13 21:44 Asia/Saigon. All 32 live entitlement rows and 11 table fingerprints were preserved after excluding the ten retired delivery columns; all eight original delivery rows match their archive exactly. Eight batches, batch joins and campaign histories are retained. A fresh backend build passed, the launcher reused the verified chain/web and started the rebuilt API. Nineteen HTTP checks passed, including the verified Campaign manifest, public database-backed lists, private-route authentication and retired endpoints returning 404. Historical contract balances remain unchanged; neither product deployment has a campaign. R5 is DONE for the local MVP. The prior process-stop approval block was resolved by the operator; it was not bypassed.

This R5 paragraph records the pre-clock-reset runtime. Its database, object storage, manifests and chain snapshot remain recoverable in `.local/reward/reset-backups/2026-10-13-chain-clock-reset`; the live manual-test runtime is now fresh and does not contain those historical rows.

All implementation remains uncommitted on codex/hed-mvp-cleanup at f2650dc54ba88f93dadc530b185c72991212eb64. Historical checkpoints below describe their time of execution and are superseded by this section.

## Campaign R2 and R3 checkpoint — 2026-10-13

- Additive migration `0002_reward_campaigns_review`: snapshot/preparation/revision/wallet binding and private sample metadata. Fresh and baseline-upgrade/repeat migration audit passed; local migration applied. Existing physical rows are retained.
- Backend build PASS. Reward unit: 5 suites / 71 PASS, including 8 deterministic commitment tests. New R2 HTTP suite: 13 PASS against PostgreSQL and MinIO with real byte-signature validation; only the authenticated principal is injected.
- R1 HTTP: 20 PASS. Legacy contract scenarios: all 6 PASS. The first combined HTTP run had 60 PASS / 1 FAIL because inherited local background polling consumed the event before the reorg test's explicit `runOnce`; disabling polling inside that manually driven test fixture produced 28/28 PASS on rerun. This does not disable polling in application runtime.
- Frontend build and lint PASS; 23 tests PASS including account-scoped creator-cache regression.
- Foundry full suite: 27 PASS (15 Campaign + 9 historical Reward + 3 token), including two 256-run custody fuzz tests. Campaign tests cover exact approvals, no advances, positive-quantity/repeated pledges, overfunding, separate production/release, 7-day challenge, backup, 30-day dispute timeout, full pre-payout refunds, retry/double-claim prevention, immutable accepted release and failed-token-transfer rollback.
- New deployment parser/verifier: 14 tests PASS. Real Anvil + isolated PostgreSQL Campaign ledger: 8 integration tests PASS, covering wrong chain/contract/revert/noncanonical logs, duplicate processing, reviewed-term binding, original account ownership, orphan/replay and canonical refunds.
- Migration `0003_reward_campaigns_chain` adds separate projections/entitlements keyed by `(chainId, contractAddress, transactionHash, logIndex)`. Fresh+upgrade/repeat audit PASS and local migration applied. Orphan records remain as history with canonical=false.
- Generated Campaign ABI and separate deployment manifest (`.local/reward/generated/campaigns-deployment.local.json`, abiVersion `campaigns-local-v1`) are verified. Contract `0xf953b3a269d80e3eb0f2947630da976b896a8c5b`, policy hash `0xb234c97c943da31a8595e422979b2ca3040707bf6c4a4647fd34f7a9d3be8264`. Existing Reward deployment manifest/contract is unchanged. The Campaign deployment was verified again after reorg tests finished. This is not a deployed PDF vertical slice or browser acceptance.
- R2 routes are under `/v1/fundtogether/campaigns`; existing legacy freeze/review/publication routes continue to reject Campaign. Redacted approved preview is under `/v1/fundtogether/public/campaigns/:id`. Review does not enable payment.
- Existing running API has not been restarted since the previously recorded automatic approval rejection. In-process test applications load current code; this is not evidence that port 3002 serves the new routes.

## Campaign R0–R1 verification — 2026-10-13

Branch `codex/hed-mvp-cleanup`, unchanged HEAD `f2650dc54ba88f93dadc530b185c72991212eb64`; changes are uncommitted. User scope-document changes present at start were preserved.

| Check | Observed result |
| --- | --- |
| Backend build | PASS |
| `npm.cmd run test:reward` | 4 suites, 63 tests PASS |
| `npm.cmd run test:reward:e2e` | 6 contract scenarios PASS; 28 legacy HTTP + initial 18 Campaign HTTP tests PASS |
| Final Campaign HTTP suite after owner/metadata fallback checks | 20 tests PASS, real Nest controllers/services + PostgreSQL; authentication principal injected, no wallet/RPC claim |
| `npm.cmd test -- --runInBand` (all backend suites, final) | 12 suites PASS, 2 FAIL; 143 tests PASS, 4 FAIL |
| Migration upgrade/repeat audit + fresh DB in Campaign HTTP setup | PASS; old campaign category/hash and physical tier preserved |
| `node scripts/campaigns/migrate-isolated.cjs` | PASS; additive migration 0001 applied to local Reward DB |
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
| `& .\backend\scripts\campaigns\start-services.ps1 -SkipBuild` | PostgreSQL and MinIO healthy; Reward RPC chain `31339`, manifest, migration, API `3002`, and web `5175` ready. A repeat run reused only verified listeners. |
| `npm.cmd run build` in `backend` | PASS |
| `npm.cmd run test:reward` in `backend` | 4 suites, 17 tests PASS |
| `npm.cmd run test:reward:e2e` in `backend` | 6 contract scenarios PASS; 1 HTTP suite, 28 tests PASS |
| `npm.cmd run test`, `npm.cmd run lint`, `npm.cmd run build` in `frontend` | 1 test PASS; lint clean; production build PASS |
| `forge test` in `contracts` | 2 suites, 12 tests PASS (9 Reward including 256-run fuzz, 3 MockUSDC) |

The generated local manifest used contract `0xe7f1725e7734ce288f8367e1bb143e90bb3f0512` on chain `31339`. It is local runtime evidence only; a later fresh state can create a different local address.

## Remaining manual acceptance

- Browser wallet connection, signature/login, transaction confirmation, and indexed UI state still require a human wallet walkthrough.
- This evidence does not approve public deployment, real assets, fiat conversion, legal compliance, or real-world creator/fulfillment verification.
