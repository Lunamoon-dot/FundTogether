# FundTogether Editions — Digital PDF MVP Implementation Plan

> Initial authorization was R0–R1. The subsequent goal authorizes continuation through R2–R5. The user has approved local financial policy `editions-local-escrow-v1`, with Resolver decisions and community review participation; see `docs/reward/EDITIONS_LOCAL_FINANCIAL_POLICY_V1.md`. Execute in dependency order and preserve existing obligations.

**Goal:** Introduce FundTogether Editions drafts for `COMICS_ARTBOOK`, exactly one `DIGITAL_DOWNLOAD` PDF and one `STANDARD` tier, with server rejection of incompatible input.

**Architecture:** Keep the existing Reward contract, canonical event indexer and historical records unchanged. Store the new versioned draft configuration separately from the legacy finite-inventory tier representation, and hold Editions at DRAFT until freeze/review and financial gates are implemented. Preserve legacy physical fulfilment for existing records until the tested digital replacement permits retirement.

**Tech Stack:** NestJS, Zod, Drizzle/PostgreSQL, React/TypeScript, Jest/Supertest, Node test runner, existing Foundry contracts.

**Spec:** `GOAL.md`, `docs/research-direction.md`, `docs/reward/FUNDTOGETHER_CAMPAIGN_CONFIG_MVP.md`, `docs/reward/WORKFLOWS.md`.

## Global constraints

- Product: **FundTogether Editions**; category `COMICS_ARTBOOK`; mode `REWARD_V1`; policy version `reward-comic-download-mvp-v1`.
- One reward item, type `DIGITAL_DOWNLOAD`, format `PDF`; one `STANDARD` tier.
- No physical item, shipping, tracking, address/telephone, future-merch promise, alternate reward type, bundle or finite-inventory input for new drafts.
- Server owns creator identity and verification; clients select only their verified wallet-link ID. Server resolves and freezes its address; raw payout addresses, owner/status/commitment/on-chain identity cannot be supplied as draft fields.
- Existing integer/base-unit and duration limits are technical bounds, not newly approved economic policy.
- The initial R0/R1 restriction on financial changes is superseded for R3 onward by explicit approval of `editions-local-escrow-v1`. Use a separately versioned local contract/deployment and retain the historical contract. No public-chain or real-asset launch, and no fictitious inventory cap.
- Additive migration only; never backfill existing records into Editions or delete shipping data.
- Existing uncommitted scope documentation belongs to the user and must be preserved. Work in the supplied checkout/branch; no commit or push is required by this request.

## Review focus

1. Direct API callers inject unknown fields inside a reward/tier or use an old category/default: strict nested validation and adversarial HTTP tests.
2. A single numeric inventory limit disguises a collectible tier: reject `maxQuantity`, limited/collectible variants and multiple tiers; do not map an unlimited draft to the old contract.
3. An Editions record reaches old freeze/publish or physical routes through forged state: policy-aware service gates tested with persisted records, independently of UI.
4. A draft or its private configuration leaks through public detail: new drafts are owner-readable and absent from public list/detail; test anonymous and other-creator access.
5. Migration or tightened creation breaks existing obligations: seed historical fixtures directly in tests, preserve physical/shipping and financial regression scenarios, test baseline upgrade and repeat migration.

## R0 — Scope audit (execute now)

### Current code and policy gap

| Surface | Observed implementation | R1 action / retirement dependency |
| --- | --- | --- |
| `backend/src/reward/reward-campaign.schema.ts` | COMICS/ARTBOOK/ILLUSTRATION/OTHER, default category, up to 20 tiers, arbitrary string items, boolean isDigital and finite maxQuantity; unknown keys stripped | Replace new-draft schema with strict typed PDF configuration. Strict schemas at remaining JSON write boundaries prevent silent field stripping. |
| `backend/src/reward/reward-campaign.service.ts` | Writes legacy tiers and hashes old terms; freeze/review/register can advance them | New drafts persist typed config, no old commitment or inventory tier; hold Editions at DRAFT. Existing records retain their paths. |
| `backend/src/database/schema/reward.schema.ts` / `backend/drizzle/reward/0000_reward_baseline.sql` | campaign policy_hash required; tier max_quantity > 0; encrypted/plaintext shipping fields; batch tables and physical states | Add `draft_config` JSONB and allow an unassigned financial policy hash. Preserve all old values, constraints and physical tables. |
| `backend/scripts/reward/migrate-isolated.cjs` | Runs baseline only | Run ordered baseline + additive Editions migration in same transaction; retain migration identities. |
| `reward-pledge.service.ts`, `reward-backer.controller.ts` | Shipping PII writes/reads, delivery confirmation and disputes | Reject physical shipping/confirmation for Editions before writes. Keep legacy shipping encryption, ACL and refund processing. |
| `reward-fulfillment.service.ts`, creator/resolver controllers | Tracking batches, delivered states, physical completion attestation | Reject these operations for Editions; preserve old routes/data until R5. |
| `reward-indexer.service.ts` | Generates digital access codes after production verification; physical entitlement states | Audit only in R0/R1. Codes are not private PDF delivery. R4 must replace this behavior for the versioned digital protocol. |
| `reward-crypto.service.ts` | Hashes old campaign/tier/shipping terms, encrypts shipping | Preserve legacy algorithms. New draft commitment remains null until R2; do not claim new terms are frozen. |
| `frontend/src/features/reward/RewardCreatorStudio.tsx` | Multi-tier digital + hardcover starter, quantity/physical controls, legacy publish and fulfilment actions | Replace only the new-draft form with one standard PDF tier; show draft-only notice for Editions. Preserve controls for existing records. |
| `RewardPublicCampaign.tsx`, `RewardPublicFeed.tsx`, `RewardBackerEntitlements.tsx`, `RewardResolverConsole.tsx`, `frontend/src/lib/api/reward.ts` | Inventory checkout, shipping/tracking, codes, legacy money operations | Typed draft API + owner UI in R1; other surfaces await R2–R5. New drafts cannot enter public checkout. |
| `contracts/src/reward/FundTogetherReward.sol`, `RewardTypes.sol` | createCampaign rejects maxQuantity=0; pledge enforces finite cap; old financial and physical completion rules | Unchanged. Financial-policy resolution and contract review are R3, not a frontend workaround. |
| `backend/src/reward/reward-http-acceptance.spec.ts` | Creates new mixed physical/digital campaigns over HTTP, then tests existing financial/physical journeys | Convert only fixture creation to explicit historical DB seeding; keep the regression assertions. Add a separate real HTTP Editions draft suite. |
| `backend/scripts/reward/reward-live-e2e.cjs`, `reward-scenarios-e2e.cjs`, contract tests | Historical live-service draft helper; contract scenarios/finite tiers | Adapt live fixture setup to test-only seed, never expose a legacy API bypass. Keep contract scenarios/tests. |

**Policy/code conflicts:** `WORKFLOWS.md` describes payout/refund examples while D02–D12 remain open; these are historical behavior, not new approval. `GOAL.md` legacy cleanup refers to older products, not permission to delete current Reward physical obligations. DRAFT has no canonical receipt, entitlement or downloadable PDF. R0 is source/test mapping, not a production-data obligation audit.

- [x] Record current branch/SHA and dirty files; inspect the mapped source/tests.
- [x] Confirm contract requires finite maxQuantity and there is no current reviewed private-PDF release.
- [x] Use the above map as the R5 removal checklist; no physical removal now.

## R1 — Draft and validation (execute now)

### Task 1: Strict versioned configuration

**Files:** modify `backend/src/reward/reward-campaign.schema.ts`; tests in `reward-campaign.schema.spec.ts`.

**Interface:** `createRewardCampaignDraftSchema` / `CreateRewardCampaignDraftInput` accepts required `mode`, `policyVersion`, `category`, `title`, `pitch`, `story`, `goal`, `fundingDuration`, and `tiers`. `tiers` contains exactly one object with `tierType: STANDARD`, title, description, positive base-unit price, optional ISO estimatedDeliveryAt, and exactly one `rewardItems` object `{ type: DIGITAL_DOWNLOAD, format: PDF, title, description }`. All object schemas are strict. No policyHash, maxQuantity or isDigital input.

- [x] Write tests for a valid standard PDF draft and every unsupported category/type/format, absent discriminator, zero/two tiers/items, numeric/fractional/over-uint256 amount, old flags and extra nested fields.
- [x] Test explicit English/Vietnamese physical or future-merch promises in descriptive fields. Use a small documented lexical rejection rule, not an AI semantic/IP verdict; human content/IP review remains R2.
- [x] Run `npm.cmd test -- --runInBand src/reward/reward-campaign.schema.spec.ts`; observe the expected failures before changing production code.
- [x] Implement strict Zod objects and exact literals; preserve technical fundingDuration bounds 86400–5184000. Amounts are positive decimal strings no greater than uint256.
- [x] Re-run the tests and retain the legacy schema tests only where they test still-supported legacy operations.

### Task 2: Persist drafts and fail closed at old boundaries

**Files:** `backend/src/database/schema/reward.schema.ts`, new `backend/drizzle/reward/0001_reward_editions_drafts.sql`, `backend/scripts/reward/migrate-isolated.cjs`, its test, campaign/pledge/fulfilment services and relevant controllers/schemas; new `backend/src/reward/reward-editions-http.spec.ts`.

**Interfaces:** nullable `rewardCampaigns.draftConfig: CreateRewardCampaignDraftInput | null`; nullable financial `policyHash` for new drafts only. Existing null-config records are historical. `createDraft(userId, input)` revalidates input itself, verifies creator and stores the normalized config with DRAFT status, no commitment/onchain ID. Legacy `tiers` relation remains empty for an Editions draft; the standard tier is persisted in `draftConfig.tiers`. No finite inventory placeholder is invented.

- [x] Add HTTP integration tests with real Nest controllers, real services and PostgreSQL: verified creator succeeds, unverified creator fails, config round-trips, forbidden payload returns 400 without inserted rows, other creator/public cannot read private draft.
- [x] Seed historical and Editions records explicitly in test utilities, never via a production bypass. Test Editions freeze/submit/review/register and shipping/batch/delivered/confirmation/physical completion rejection, with DB unchanged.
- [x] Observe red, then add additive migration and execute ordered migrations idempotently. Test fresh baseline, baseline-to-Editions upgrade preserving a legacy campaign/tier, and a repeat run.
- [x] Add policy-aware gates before mutation or receipt processing. New policy detection fails closed on config presence or COMICS_ARTBOOK category. Keep existing physical routes for null-config legacy records.
- [x] Strictly reject unknown properties at existing JSON boundaries and unexpected bodies on bodyless write operations. Keep schema-recognized legacy shipping payloads usable only with legacy records.
- [x] Exclude Editions from public list/detail and block progression beyond DRAFT until R2/R3. Preserve payout/refund/contract/indexer semantics.
- [x] Run Editions HTTP suite and existing Reward unit/HTTP suites; keep physical regression coverage using historical fixtures.

### Task 3: Creator form and verification

**Files:** `frontend/src/lib/api/reward.ts`, `frontend/src/features/reward/RewardCreatorStudio.tsx`, a small typed draft builder + behavior test if needed; docs overview/progress and this plan.

- [x] Define the exact new draft input in the frontend API; keep legacy read types for existing records and add nullable draftConfig.
- [x] Write a draft-builder test proving one STANDARD PDF item, correct base-unit conversion and rejection of invalid precision/amount; observe red before implementation.
- [x] Show FundTogether Editions, fixed COMICS_ARTBOOK category, one standard PDF reward and price, without inventory, add-tier, physical or shipping controls in the creation form.
- [x] Use integer-safe decimal conversion. Explain that a saved draft is not approved/frozen/published and cannot accept payment or serve a PDF yet.
- [x] For Editions cards show stored config/tier and the draft-only gate; retain historical campaign actions separately in the existing component.
- [x] Run frontend test/lint/build, backend build/unit/HTTP suites, migration test and contract regressions when local prerequisites are available. Record exact output, failures and skipped/manual checks.
- [x] Request one focused independent review of the complete R0/R1 diff, address material findings, then update verified progress.

## R2 — Freeze and review (DONE; automated browser acceptance passed in R4)

**Owners/files:** campaign schema/service, crypto service, review/public/creator controllers, evidence storage metadata, frontend creator/resolver screens; additive migration and dedicated commitment/ACL tests.

- [x] Define authenticated sample-page references, content outline, release window, budget/evidence plan and linked creator payout wallet ownership; validate every referenced object against its owner and intended use.
- [x] Define a deterministic versioned canonical commitment over policyVersion, creator identity/wallet, normalized campaign/PDF/standard-tier terms and evidence hashes. Same terms produce same hash; changing PDF terms, price, release terms or evidence changes the hash.
- [x] Atomically freeze only complete valid configurations; reject creator changes thereafter. Test owner A/B isolation, admin/resolver boundaries, concurrent freeze/edit and rejection/correction transitions.
- [x] Expose a redacted public DTO with no raw identity docs, private object keys/URLs or sensitive disputes. Implement review decision records without conflating review with money authority.
- [x] Permit review preparation only; publication remains disabled while R3 financial gates are unresolved. R1 gate must be removed only in this tested transition.

## R3 — Financial design (DONE for the approved local policy)

**Owners/files:** approved policy/spec, contracts/src/reward and tests, deployment metadata, indexer and financial API/UI boundaries.

- [x] Resolve D02 early payout/exposure, D03 authority/escalation, D04 late/failure/download refunds, D05 surplus, D07 pledge/order limits, D08 availability, D09 fees, D10 launch legality, D11 business bounds and D12 cancellation/material change. D06 remains deferred.
- [x] For every transfer specify fund ownership, authorised caller, state transition, failure recovery, stuck-fund exit and replay/double-execution prevention.
- [x] Decide single-standard-tier representation without inventing a finite inventory cap; review the contract's current maxQuantity requirement against that decision.
- [x] Version a deployment only if approved rules require it; never repurpose an existing contract or relabel historic claims. Test conservation, all-or-nothing funding policy, refunds, overfunding and authority with approved expected values.
- [x] Verify receipt lifecycle, canonical event identity `(chainId, contractAddress, txHash, logIndex)`, idempotency/reorg rollback before enabling new paid publication. No automatic public/real-money launch follows local tests.

## R4 — Digital vertical slice (DONE for automated local acceptance)

**Owners/files:** new release/storage/entitlement services and migrations, Reward indexer, creator/resolver/backer screens, integration and browser tests.

- [x] Private final PDF upload with server MIME/byte/openability checks, bounded size, immutable hash and release-evidence binding; final file is not required at draft time.
- [x] Resolver accepts/rejects release separately from production evidence. Only valid canonical entitlements transition to DOWNLOAD_AVAILABLE; old random digital access codes cannot stand in for this release gate.
- [x] Enforce account ownership and release state before short-lived private-object URL issuance; redact URLs and object keys from public responses/logs.
- [x] Test no entitlement for reverted/wrong-chain/wrong-contract/noncanonical logs, one entitlement per accepted log, replay/reorg recovery and account isolation before/after release.
- [x] Record download audit as availability/request, never proof of reading or acceptance. Represent missing/broken PDFs as disputes under approved rules, without inventing post-download refund rights.
- [x] Run real browser/wallet walkthrough: verified creator → reviewed terms → canonical pledge → production/release review → authorised PDF download → failure/dispute/refund paths. Keep automated and human evidence separate.

## R5 — Physical retirement (DONE for the local MVP, including main-runtime cutover)

- [x] Re-run R0 dependency map and audit actual obligations per deployment/campaign, active entitlements, shipping data, disputes and pending claims. Preserve required history and a supported path for existing obligations.
- [x] Remove physical creation/API/UI/indexer paths only for versions for which the digital slice replaces them; migrate/archive data under an explicit retention decision, not destructive schema reset.
- [x] Retire obsolete shipping crypto/config, columns, batches, tracking states and fixtures only after callers/data no longer depend on them. Keep regression coverage for preserved financial/history guarantees.
- [x] Run fresh+upgrade migration, backend/frontend/contract suites and browser negative tests proving new campaigns never request or persist physical data. Update docs to actual implemented behavior.

- [x] Apply migration 0005 to the main local database and start the rebuilt API. The operator stopped the old API; a fresh audit and ignored SQL backup preceded migration. Exact archive and financial-history comparisons passed, then a fresh backend build/start and 19 HTTP checks verified the main runtime. The migration refuses its initial application while API port 3002 is listening.

## Execution record

- Initial branch: `codex/hed-mvp-cleanup`; HEAD `f2650dc54ba88f93dadc530b185c72991212eb64`.
- User edits present before work: GOAL, PROJECT_PROGRESS, research-direction, reward ADR, WORKFLOWS; new campaign-config spec untracked.
- R0 and R1: DONE. R2–R5 were not implemented. Work remains uncommitted on the initial branch/SHA; user-authored scope edits preserved.
- Ruling: keep the draft's single tier inside typed JSONB and use null financial policy/commitment instead of fabricating a finite inventory limit or hashing incomplete R2 terms. This requires a later explicit R2/R3 transition, and prevents accidental old-policy publication now.
- Migration: added 0001_reward_editions_drafts and applied it to the isolated local Reward database; fresh DB, baseline upgrade preserving a physical campaign/tier, and repeated migration tested. No physical columns, routes, crypto, contract code, ABI or product deployment manifest were removed/changed.
- New/changed implementation files: campaign schema/service, Editions policy helper, database Reward schema, ordered migration runner, creator/backer controllers, pledge schema/service, fulfilment service, frontend draft builder/API types/creator studio. Test-only historical seeding replaces new mixed-tier API creation in the legacy acceptance/live fixtures; it is not an application endpoint.
- Test-first evidence: the schema suite failed on the formerly rejected COMICS_ARTBOOK typed PDF draft; HTTP suite failed on missing persistence/validation/gates; migration audit failed on absent draft_config; the saved-terms UI regression failed before adding the PDF terms and exact-price display.
- Independent review found one R1 UI gap (saved PDF terms/price not visible). Fixed with a render regression test; reviewer found no material API bypass or legacy-data regression in the reviewed scope.
- Scope-screening limitation: descriptive-text checks reject common English/Vietnamese physical/future-merch terms conservatively. They cannot prove arbitrary natural-language promises or IP rights; R2 human review remains necessary.
- No manual browser/wallet walkthrough, real PDF upload/release/download, legal acceptance or public launch was performed. Existing contract E2E scripts deploy disposable local test contracts only; product ABI/deployment identity remains unchanged.

### Commands and observed results (2026-10-13)

| Command / location | Result |
| --- | --- |
| Backend: npm.cmd run build | PASS |
| Backend: npm.cmd run test:reward | 4 suites, 63 tests PASS |
| Backend: npm.cmd run test:reward:e2e | 6 local contract scenarios PASS; legacy HTTP 28 + initial Editions HTTP 18 = 46 tests PASS |
| Backend: npm.cmd test -- --runInBand src/reward/reward-editions-http.spec.ts after extra owner/metadata tests | 20 tests PASS |
| Backend: node scripts/reward/migrate-isolated.test.cjs | PASS: baseline upgrade preserves old campaign/tier, ordered migrations repeat safely; Editions HTTP setup also migrates a fresh isolated DB |
| Backend: node scripts/reward/migrate-isolated.cjs | PASS: local additive migration applied |
| Backend: node --check scripts/reward/reward-live-e2e.cjs and node --check scripts/reward/testing/legacy-campaign.cjs | PASS; standalone live-service script not executed |
| Frontend: npm.cmd test | 20 tests PASS, including exact-amount builder and rendered creator studio |
| Frontend: npm.cmd run lint; npm.cmd run build | PASS; Vite warns about an existing main bundle above 500 kB |
| WSL contracts: ~/.foundry/bin/forge test | 12 tests PASS, including 256-run custody fuzz |
| Repository: git diff --check; git diff --numstat -- contracts | PASS; no contract diff |

Full backend suite and local runtime final results are recorded in PROJECT_PROGRESS.md. The full suite is not all-green: four auth failures were reproduced against an isolated archive of the pre-change HEAD, with the same installed dependencies. These are outside R0/R1 and were not hidden or repaired here.

Final full-backend result: 143 PASS, 4 FAIL across 14 suites (12 PASS, 2 FAIL). Runtime reload was attempted only after verifying API process ownership and manifest identity; automatic execution review rejected stopping/restarting the API with `blocked by policy`. The existing live API has not loaded the rebuilt R1 code. No chain reset or replacement deployment was performed.

Failing baseline tests:
- auth.service.spec.ts: blocks B frozen plan; blocks A submission; removes an unused link and invalidates other sessions and pending challenges.
- wallet-account-boundary.spec.ts: disconnects a previous account's wallet and keeps an explicit connection within the same account.

Baseline reproduction used git archive of HEAD into ignored .local/reward/verification/r0-r1-baseline, then in its backend directory:
`node -e 'require("jest").run(["--runInBand","--testMatch=**/*.spec.ts","--testPathPatterns=src/modules/auth/(auth.service|wallet-account-boundary).spec.ts"])'`
Result: 13 PASS, the same 4 FAIL. No working source was replaced for this comparison.

### Earlier continuation checkpoint (superseded below)

R2 backend and Creator/Resolver UI are implemented. R3 has an approved policy, separate local contract/ABI/deployment, and canonical ledger tests. See PROJECT_PROGRESS.md for observed counts. R4 still requires community participation, production/release UI and storage binding, entitlement download controls, and browser/wallet acceptance. R5 physical retirement has not started. No existing physical data or legacy deployed contract was removed.

### Final implementation and verification checkpoint — 2026-10-13

R2–R5 are implemented and tested under the approved local policy. Physical retirement passed fresh/upgrade, actual-database-copy and main-runtime verification. The operator stopped the old API; fresh audit/backup, migration 0005 and rebuilt API startup completed on 2026-10-13.

- Private PDF: bounded structural parsing in an isolated worker, immutable byte/evidence hashes, private storage, Creator/Resolver ACL, account-bound 60-second download tickets, canonical eligibility checks at issuance/access, missing-file reports, and explicit optional backer confirmation. Neither download nor confirmation moves funds.
- Community reviews published terms and submits attributable private details visible to Creator/Resolver/author. Resolver decides; on-chain disputes require a canonical backer and the approved time window. No community vote or automatic approval was added.
- Browser acceptance uses actual account authentication, SIWE, signed local transactions, API, PostgreSQL and MinIO, with an injected Anvil provider. Creator verification is seeded. This is automated acceptance, not a human MetaMask or real-world IP review.
- R5 reconciliation: 24 legacy campaign rows, 32 legacy entitlement rows, eight physical records across eight disposable test contracts. The product Reward deployment has zero campaigns. Every physical receipt matches its own deployment/campaign/tier/amount/backer; none belongs to the product deployment. The old HTTP suite was contaminating the shared DB; it now creates and drops its own database.
- All eight physical DB statuses are REFUND_ELIGIBLE, but each test contract campaign is COMPLETED, refundSnapshotted=false, and claimRefund simulation reverts. Each retains 3,500 MockUSDC in campaign accounting; one deployment also retains 1,000 MockUSDC from its second fixture campaign. Archival does not settle these balances or change those labels.
- Migration 0005 requires an unchanged row fingerprint from the deployment audit, snapshots encrypted delivery data and campaign/financial/dispute context, moves batches to an immutable archive, and removes active shipping/tracking/receipt columns. Unknown or changed obligations abort it. Legacy contract/ABI/event decoding and refund sync remain version-specific; no contract is mutated.
- Backend removes physical endpoints/service and runtime address encryption/config; frontend removes address, batch, delivery-confirmation controls and historical public pledge controls. Historical commitment hashing retains its old fields for hash compatibility.
- Verification: backend build PASS; full backend 195/195 PASS (20/20 suites); all 76 Editions tests PASS; legacy HTTP plus Editions draft 44 PASS; frontend 29 PASS, lint/build PASS; Foundry 27 PASS including two 256-run fuzz tests; browser six checkpoints PASS. The three auth/account-boundary failures recorded in the prior checkpoint were fixed: two stale positional unlink-wallet fixtures now follow the Editions query model, and the frontend now aborts/removes both `reward-*` and Creator-private `my-reward-*` queries on account switch/logout. TypeScript build was checked separately; final Jest used isolatedModules transformation to avoid severe host-memory pressure.
- Migration tests PASS for fresh, baseline upgrade, repeat, missing/stale audit rejection, exact retained fields, immutable history and reorg-compatible archival joins. Applying to both the actual DB copy and main DB preserved all 32 financial rows and archived eight entitlements/batches/batch joins/campaign histories. The main DB now includes 0005; ten active delivery columns are absent. Eleven table fingerprints match before/after after excluding retired columns, and original delivery rows match their archive exactly.
- Main runtime PASS: fresh backend build and API startup on 3002, web 5175, 19 HTTP checks covering verified Editions deployment, database-backed public lists, authentication and 12 retired-route 404 checks. Historical contract balances are unchanged and both product deployments have zero campaigns.
- Ignored evidence: .local/reward/verification/backend-final-tests.json, editions-browser/result.json, editions-browser/backer-release.png, editions-retirement-audit.json, physical-retirement-copy-result.json, physical-retirement-main-result.json, physical-retirement-runtime-result.json. The local SQL backups contain private history and must remain ignored.
- No public campaign or real-money launch, no commit/push, no transfer of historical escrow. Manual MetaMask and real Creator/IP verification remain unperformed.
