# FundTogether Project Progress

> **Updated:** 2026-10-03

This file records verified implementation progress. A documented idea is not
marked `DONE` until a command, test, transaction or projection provides
evidence.

## Current milestone

Arc update: local Anvil remains; Arc testnet is now the priority integration
target and Arc is the preferred production candidate, pending acceptance.
See [ten-milestone review](../v0.2/FundTogether_Milestone_Review_2026-10-03.md).
No Arc tooling, deployment or live runtime validation is recorded as DONE.

Latest design review: [Verification and dispute escalation](./verification-and-disputes.md).
Evidence admission/versioning is implemented; challenge screening/response and
the selected three-resolver/two-matching-verdict committee remain unimplemented.
Verifier authority is approved as admissibility/objective checks without edits,
adjudication or direct transfers. Multiple platform-appointed verifier wallets,
initially two, are selected. AccessControl grant/revoke and pending submission
assignment/reassignment are implemented; event history records reviewer changes.
Committee membership/conflict handling, appeals, stage
deadlines and financial outcomes still need decisions before coding.

```text
Phase 1 — Contract prototype: IN_PROGRESS
```

The current prototype validates ERC20 donations, organizer bond custody,
funding transitions, pre-funded cancellation/failure refunds, committed
milestone budgets, criteria commitments frozen at approval, versioned evidence admission,
fixed 72-hour review, donor challenge and sequential unchallenged settlement.
Final completion returns bond atomically. Challenge resolution, organizer
abandonment recovery, post-funded refunds and slashing remain unimplemented.

### DONE — Milestone acceptance criteria commitments

- Only the organizer can configure nonzero criteria hashes for existing
  milestones while DRAFT. Corrections are allowed before approval.
- Resolver approval requires criteria for every milestone and freezes hashes.
- Full criteria content remains off-chain; no money moves when hashes change.
- Verification: 85 tests passed, 0 failed, 0 skipped across nine suites;
  formatting check and build succeeded. Build reports four timestamp warnings
  and two intentional validation-loop warnings.

## Verified progress

### IN_PROGRESS — Campaign and evidence draft API (backend step 2)

- Added authenticated campaign draft create/read routes and evidence draft
  create/read/update routes, with organizer checks through the session identity.
- Draft content uses Evidence Schema v0.1 validation and JSONB persistence;
  `schemaVersion`, `updatedAt`, and integer `revision` are stored. A unique
  campaign/milestone constraint allows one current draft. Stale updates return
  409. Freeze remains a separate future immutable entity.
- Applied Drizzle migration `0001_loving_jane_foster` to the connected local DB.
- Verification: backend build succeeds; 12 unit tests pass. Local API smoke flow
  completed SIWE, campaign create, draft create/read/update and stale revision
  rejection. Test campaign/user rows were removed afterward.
- Learning guide: [Backend Step 2](./backend-step-2-drafts.md).
- Chain validation, file upload and package freeze/hash remain unimplemented.

### IN_PROGRESS — Wallet authentication and organizer access (backend step 1)

Local implementation work; backend source is committed separately from the
documentation publication.

- Added SIWE nonce/verification routes, wallet-user linking, a 24-hour signed
  HttpOnly session cookie, session guard and campaign owner access example.
- SIWE checks configured domain, URI, chain and a one-time five-minute nonce.
- Nonce storage is process-local; campaign authorization uses DB metadata and
  does not verify organizer ownership from chain state.
- Verification: backend build succeeds; five unit tests pass for the guard and
  campaign owner/forbidden/not-found cases. Local app smoke check returned a
  nonce and rejected `/auth/session` without a cookie (401).
- Learning guide: [Backend Step 1](./backend-auth-step-1.md).

### IN_PROGRESS — Evidence schema validation and organizer access foundation

Local implementation work; backend source is not included in this documentation
publication and will be committed separately.

- Added a strict Zod parser for Evidence Schema v0.1, including integer-safe
  values, EVM address/hash formats, allowed document media types, unique IDs,
  date ordering and reference integrity.
- Added an authorization service that checks an authenticated user ID against
  the campaign metadata owner.
- Verification: `npm.cmd run build` in `backend/` succeeded.
- Not implemented yet: evidence persistence, on-chain campaign/organizer/
  criteria/version checks and evidence API integration. Current ownership check
  covers only the existing metadata owner relation.

### DONE — Verifier roles and evidence admission/versioning

- Deployer receives DEFAULT_ADMIN_ROLE through OpenZeppelin AccessControl;
  admin manages multiple verifier wallets and pending reviewer assignments.
- Only the assigned active verifier accepts/rejects the exact current version/hash;
  organizer cannot review itself. Acceptance starts 72-hour review; rejection
  records reason and permits a new version. History is retained; no token transfer.
- Verification: 129 passed, 0 failed, 0 skipped across eleven suites;
  four fuzz tests with 256 runs each. Build/formatting check succeeded.
  Six timestamp and two intentional validation-loop warnings remain.

### DONE — Local contract toolchain

- WSL 2 is available with Ubuntu 24.04.
- Foundry 1.8.4 is installed and available in the Ubuntu shell.
- `forge build` succeeds in `contracts/`.

Verification:

```text
forge Version: 1.8.4
forge build
Compiler run successful
```

### DONE — Solidity and MockUSDC smoke tests

- Basic campaign storage and donation counter sample exists.
- MockUSDC uses OpenZeppelin ERC20 with 6 decimals.
- Local minting, approval and `transferFrom` behavior are covered.

Verification:

```text
forge test
7 tests passed
0 failed
```

### DONE — ERC20-backed donation prototype

- Campaigns store their configured donation token.
- `donate` uses OpenZeppelin `SafeERC20.safeTransferFrom`.
- Tests verify donor balance, contract escrow balance and contribution
  accounting.
- Missing allowance and zero-amount donations revert.

Verification:

```text
forge test
17 tests passed
0 failed
forge build
Compiler run successful
```

The ERC20 donation tests also cover emitted events, invalid campaign
configuration, multiple donors, allowance limits, token isolation and
rollback after a failed transfer.

### DONE — Organizer bond locking

- Campaigns record their organizer and required bond.
- The organizer can lock the required bond using the campaign donation token.
- Bond custody and donor contribution accounting are tracked separately.
- Non-organizers, missing allowance and duplicate locking revert.

Verification:

```text
forge test
23 tests passed
0 failed
forge build
status: 0
```

### DONE — Funding lifecycle prototype

- Campaigns record a funding deadline and start in `DRAFT`.
- The trusted resolver can approve a campaign.
- The organizer can publish only after approval and bond locking.
- Donations are accepted only in `FUNDING` before the deadline.
- Reaching the goal moves the campaign to `FUNDED`.
- Organizer cancellation and permissionless deadline failure are represented
  as terminal funding states.

Verification:

```text
forge test
31 tests passed
0 failed
forge build
successful with block.timestamp warnings
```

### DONE — Pre-funded refunds and bond return

- Successful donations accumulate per campaign and donor.
- Organizer cancellation or deadline funding failure creates an immutable
  full-contribution refund snapshot and returns the full organizer bond in
  the same transaction, with no slash.
- Each donor claims independently once; no loop over donors is required.
- Failed bond transfers roll back terminal state and snapshot; failed refund
  transfers preserve the donor's claim for retry.
- OpenZeppelin ReentrancyGuard protects fund-moving entry points. Returned
  bonds cannot be locked again on terminal campaigns.
- Tests cover custody, permissions, repeated donations/claims, campaign
  isolation, unsolicited tokens, token callbacks and transfer rollback.
- Corrected four earlier ERC20 negative tests to reach FUNDING and check
  the actual allowance/balance error rather than an unrelated state revert.

Verification on 2026-10-03:

```text
forge test -vv
50 passed, 0 failed, 0 skipped (6 suites)
19 refund tests, including a conservation fuzz test with 256 runs
forge build
exit 0; four existing block.timestamp lint warnings
```

Limitations: exact-transfer ERC20 only. Persistent rejection of the organizer's bond transfer
prevents terminal finalization and donor claims under the approved atomic
return design. These remain prototype limitations, not verified recovery paths.

### DONE — Contract source and test organization

- Protocol code remains in `contracts/src/FundTogether.sol`.
- Moved mintable MockUSDC out of protocol source into `contracts/test/mocks/`.
- Extracted the adversarial refund callback token into the same mocks folder.
- Grouped contract suites under `contracts/test/unit/FundTogether/` and token
  tests under `contracts/test/unit/`; updated all moved-file imports.
- Applied the existing Foundry formatter and replaced the stale contracts
  README with the current directory map, scope and WSL commands.
- Verification: 50 tests passed before and after the move; 256 fuzz runs;
  `forge fmt --check src/ test/` and `forge build` exited 0. Build retains
  the four existing timestamp lint warnings.

### DONE — Unpublished campaign cancellation and bond recovery

- Organizer cancellation now accepts DRAFT, APPROVED and FUNDING campaigns.
- Locked bond can be recovered without publication or resolver approval,
  including at or after the funding deadline.
- Unbonded campaigns cancel without calling the token or emitting BondReturned.
- Cancelled drafts cannot be approved, published, re-bonded or cancelled again.
- Transfer failure rolls back cancellation and preserves bond custody for retry.
- Added nine tests for permissions, state transitions, expired drafts,
  transfer rollback, zero bond and isolation from another campaign's escrow.
- Verification: forge test -vv reported 59 passed, 0 failed (7 suites), with
  256 conservation fuzz runs. Formatting check and build exited 0; the four
  existing timestamp warnings remain.

### DONE — Milestone budgets and first activation

- User approved goal = sum(milestone budgets); required bond = maximum budget.
- Creation now accepts name, token, deadline and an ordered positive budget list.
  Goal and bond are derived on-chain, and budgets cannot be amended.
- Added milestone records, count/current-index reads, MilestoneConfigured and
  MilestoneActivated events, and organizer-only activation of index 0 when FUNDED.
- Activation moves no tokens. Skipping, repeated activation and starting another
  milestone before settlement revert; full sequential settlement is not implemented.
- Migrated 25 existing creation calls and added shared test budget fixtures.
- Added 17 milestone tests, including a goal/exposure fuzz test with 256 runs.
- Verification: forge test -vv reported 76 passed, 0 failed (8 suites); the refund
  conservation fuzz test also passed 256 runs. Build exited 0 with four existing
  timestamp warnings and one intentional per-budget validation-in-loop warning.

## IN_PROGRESS

- Challenge resolution and post-funded recovery. CHALLENGED currently has no
  exit; absent evidence submission can still leave escrow and bond stuck.
  No dispute/slash outcome or abandonment timeout has been invented.

## Proposed integration checkpoints

- FE/BE groundwork can proceed independently: campaign metadata API/schema,
  wallet and transaction UI, and off-chain campaign content.
- Before wiring campaign creation, stabilize the milestone configuration and
  createCampaign ABI, including acceptance criteria and review-window policy.
  The current API derives goal/bond from budgets but is not frozen yet.
- Before wiring chain projections, generate shared ABI and deployment metadata,
  confirm action/event semantics, and deploy the verified slice locally.
- First vertical integration: create/publish, donate and cancellation/refund.
  Each journey must distinguish receipt success from indexed application state.
- Milestone evidence, challenge and settlement UI follows the corresponding
  tested contract flows. MVP completion still requires full success and failure
  journeys, rather than only a working funding screen.

## TODO

- Resolve protocol decisions that affect refund composition, bond slash
  outcomes, dust and timeout behavior.
- Implement and test sequential milestones, post-funded bond return and slashing.
- Define recovery for persistent token failures.
- Approve the contract event model and generate shared ABI/deployment metadata.
- Build the idempotent event indexer and backend projection.
- Build frontend journeys and end-to-end normal and failure/refund paths.
- Consider a post-MVP payment bridge for bank transfer → fiat settlement →
  token sourcing/conversion → on-chain contribution.

## Scope decision — bank transfer

Bank-transfer donations are outside the initial protocol MVP. The MVP uses a
wallet and MockUSDC so the contract's escrow, bond, milestone and refund rules
can be tested without introducing fiat custody or payment reconciliation.

The later payment bridge is a planned system boundary, not an assumption that
the backend may mark a bank transfer as an on-chain contribution. Its future
states must distinguish payment settlement, token availability, transaction
confirmation and indexing.

## Change log

Entries are append-only. The current milestone above is a summary; this log
keeps the dated implementation history and its verification evidence.

### 2026-10-02 — Local contract toolchain

- Installed Ubuntu 24.04 in WSL 2 and Foundry 1.8.4.
- Verified `forge build` in `contracts/`.
- Evidence: Foundry version output and successful compiler run.

### 2026-10-02 — Solidity smoke prototype

- Added the basic campaign counter prototype and its Foundry tests.
- Added the local MockUSDC token with 6 decimals and ERC20 smoke tests.
- Evidence: `forge test` reported 7 passing tests.

### 2026-10-02 — ERC20-backed donation

- Campaigns now store a donation token address.
- `donate` transfers tokens with OpenZeppelin `SafeERC20.safeTransferFrom`.
- Added event, allowance, multi-donor, token-isolation and rollback tests.
- Evidence: `forge test` reported 17 passing tests; `forge build` succeeded.

### 2026-10-02 — Organizer bond locking

- Campaigns record the organizer and required bond.
- Added organizer-only bond locking with separate bond accounting.
- Added event, allowance, duplicate-lock and custody tests.
- Evidence: `forge test` reported 23 passing tests; `forge build` exited with
  status 0.

### 2026-10-02 — Funding lifecycle

- Added `DRAFT`, `APPROVED`, `FUNDING`, `FUNDED`, `FUNDING_FAILED` and
  `CANCELLED` states.
- Added trusted-resolver approval, organizer publish, deadline guards, early
  goal finalization, organizer cancellation and permissionless funding failure.
- Evidence: `forge test` reported 31 passing tests; `forge build` succeeded with
  expected `block.timestamp` warnings.

### 2026-10-02 — MVP payment scope

- Recorded bank-transfer donations and fiat-to-token conversion as post-MVP.
- Recorded a future payment bridge as a separate boundary requiring payment
  reconciliation, donor attribution and refund recovery rules.

### 2026-10-03 — Pre-funded refund and bond return

- Added per-donor contribution records, immutable refund snapshots and
  independent one-time claims for CANCELLED/FUNDING_FAILED campaigns.
- Added atomic full bond return, terminal bond-lock guards and OpenZeppelin
  reentrancy protection for fund-moving actions.
- Added 19 refund tests and corrected four ERC20 test fixtures. Verified the
  callback regression fails when the cancellation reentrancy guard is removed
  and passes with the guard restored.
- Evidence: forge test -vv reported 50 passing tests, including 256 fuzz runs;
  forge build exited 0 with four timestamp warnings.
- Updated protocol, state-machine and financial rules for the implemented
  pre-funded path; documented remaining recovery and post-funded limitations.

### 2026-10-03 — Organize contract source, mocks and tests

- Separated protocol source from test-only tokens and callback fixtures.
- Grouped the six suites by contract under `test/unit/` and updated imports.
- Formatted source and tests using `foundry.toml` conventions.
- Updated `contracts/README.md` to describe actual setup and implemented scope.
- Evidence: baseline and final suite each reported 50 passing tests, including
  256 fuzz runs; formatting check and build exited 0. Financial behavior and
  existing contract entry points were preserved.

### 2026-10-03 — Recover bond on unpublished campaigns

- Extended organizer cancellation to DRAFT and APPROVED, including after the
  publication deadline. Unbonded cancellation skips the token call.
- Preserved atomic bond return and terminal replay protection; no slashing.
- Added FundTogetherCancellation.t.sol with nine regression tests. Before the
  fix, eight failed because the existing FUNDING-only guard blocked recovery.
- Evidence: forge test -vv reported 59 passed, 0 failed, 0 skipped across seven
  suites; the existing conservation fuzz test passed 256 runs. Formatting check
  and forge build exited 0 with the existing four timestamp warnings.
- Updated contract README, protocol, state machine and financial rules.

### 2026-10-03 — Prepare contract milestone for GitHub

- Registered OpenZeppelin Contracts v5.4.0 as a Git submodule and synchronized
  the forge-std v1.17.0 dependency revision. Recorded both in foundry.lock.
- Documented recursive cloning and dependency initialization in the contracts README.
- The published slice includes protocol source, test fixtures, seven suites
  and approved project documentation; unrelated backend lockfile changes and
  local workflow instructions remain outside this slice.
- Feature commit: `4d8fd57` — `feat: add campaign funding bond and refund flows`.
- Verified a clean recursive clone of that commit: all pinned submodules were
  fetched successfully; forge test -vv reported 59 passed, 0 failed, 0 skipped,
  including 256 fuzz runs. forge build exited 0 with four timestamp warnings.

### 2026-10-03 — Milestone preparation and integration checkpoints

- Reviewed approved protocol/accounting docs and the external v0.2 contract
  hardening guidance before beginning milestone configuration.
- Confirmed frontend remains starter UI and BlockchainService only reports
  whether RPC configuration exists; domain integration is not implemented.
- Recorded proposed FE/BE entry points and the remaining goal-versus-budget
  decision. This is design preparation; no milestone implementation is marked DONE.

### 2026-10-03 — Milestone budget commitments and activation

- User confirmed goal equals the sum of milestone budgets.
- Replaced manual goal/bond creation inputs with committed positive budgets;
  derived required bond from the maximum budget, with atomic invalid/overflow rejection.
- Added first-milestone activation after funding, with organizer, index and bond
  coverage guards. No release or progression beyond ACTIVE is implemented yet.
- Added 17 tests and updated 25 creation call sites using shared fixtures.
- Evidence: new milestone suite failed before implementation; final full suite
  reported 76 passed, 0 failed, including two fuzz tests with 256 runs each.
  Build exited 0 with four timestamp warnings and the intentional input-validation
  loop warning. Updated overview, README, protocol, state machine and financial rules.

### 2026-10-03 — Commit milestone acceptance criteria before review

- Added organizer-only draft criteria configuration, nonzero/index guards,
  criteria completeness at approval and immutability after approval.
- Added nine criteria tests; migrated funding/refund fixtures to commit criteria
  before approval. Existing budget/state getter and financial flows are preserved.
- Initial criteria tests failed against the missing implementation; final full
  suite reported 85 passed, 0 failed, 0 skipped, including two 256-run fuzz tests.
  Formatting check and build succeeded with four timestamp and two loop warnings.
- Evidence submission, challenge, settlement and advancement are not implemented.
  A review-duration question is pending because the external 72-hour value is an
  example; no unapproved payout timing has been encoded.

### 2026-10-03 — Fixed review and sequential unchallenged settlement

- User accepted the proposed 72-hour review default and deferred admin changes.
- Added immutable evidence hash/reviewEnd, contributing-donor challenge before
  expiry, and permissionless unchallenged settlement at/after expiry.
- Settlement pays the exact milestone budget to the organizer, records
  totalReleased and advances the index. Last settlement returns bond and marks
  COMPLETED atomically; transfer failure leaves the whole transition retryable.
- Added cross-function reentrancy protection on activation/submission/challenge.
  A token callback cannot activate the next milestone during release.
- Added 22 settlement tests: initial 18 failed against missing functions; final
  full suite reported 107 passed, 0 failed, 0 skipped across ten suites, including
  three fuzz tests with 256 runs each. Build succeeded with six timestamp and
  two intentional validation-loop warnings. Final formatting check passed.
- Challenge resolution, slashing, post-funded refunds and evidence/resolver
  timeout recovery remain IN_PROGRESS; no production deployment is claimed.

### 2026-10-03 — Review layered verification and independent arbitration

- Applied skills/AGENTSKILLS.md and reviewed the user-supplied proposal against
  current contract/docs and v0.2 malicious-verifier/governance-inactivity guidance.
- Recorded evidence/challenge admissibility, organizer response, re-verification
  and final arbitration boundaries in verification-and-disputes.md.
- Added timing safeguards for timely pending challenges and fresh review of new
  evidence versions, plus required dismissal appeals and bounded waiting stages.
- Recorded 2-of-3 committee as a candidate requiring an explicit MVP scope
  decision; registry, AI, reputation, random assignment and fees remain deferred.
- Verified documentation links and diff formatting. No source/test/ABI change;
  no new runtime verification or completed-feature claim is made for this review.

### 2026-10-03 — Correct design-document destination

- User clarified that design updates belong in C:\Users\dell\Desktop\NCKH\v0.2.
- Added FundTogether_Verification_and_Dispute_Design_2026-10-03.md there in
  Vietnamese and linked it from the reading guide, Mốc 1, Mốc 6 and threat model.
- Repository docs remain implementation-facing references. No runtime change.

### 2026-10-03 — Select permissioned 2-of-3 verdict voting

- User follow-up selects three verified resolvers and two matching verdicts
  for the same dispute/evidence version/round, with individual reason commitments.
- Added the Vietnamese Dispute Policy and Resolver Committee document in the
  external v0.2 corpus; synchronized scope and implementation-facing references.
- Situation classifications, including DEFAULT versus MISCONDUCT, are drafts;
  slash/refund, deadlines/fallbacks and new monetary effects remain unapproved.
- Checked documentation links and diff formatting; no source/ABI/test change.

### 2026-10-03 — Approve limited verifier authority

- User follow-up approves one VERIFIER_ROLE for evidence/challenge/remediation,
  five procedural actions, version-specific decisions and no organizer-record edits.
- Objective remediation enters a fresh 72-hour review. Ambiguous/contested claims
  escalate; verifier cannot decide misconduct, slash, cancel on disputed merits
  or transfer funds.
- Added Verifier Specification v0.1 in the external v0.2 corpus, including a
  draft objective checklist and required test invariants. Role assignment,
  hold/appeal and deadlines/fallbacks remain open; no implementation marked DONE.
- Verified documentation links/diff formatting. No contract, ABI or test changes.

### 2026-10-03 — Select multiple verifier wallets

- User accepted multiple wallets sharing VERIFIER_ROLE, initially two appointed
  by the platform, with one assigned reviewer per submission and no vote threshold.
- Recorded the decision in the source v0.2 verifier specification and repository
  references. Real wallet addresses are not required for prototype tests.
- Grant/revoke, case reassignment, deadlines and terminal financial policies
  remain to be specified; verifier admission is not implemented yet.

### 2026-10-03 — Implement verifier admission and evidence versions

- User authorized admin grant/revoke, assignment and pending reassignment.
- Added AccessControl, immutable submission versions and assigned verifier decisions.
  Review starts on acceptance; rejection retains decision/reason and allows resubmission.
- Added 22 verifier tests, including 256-run history fuzzing. Initial suite failed
  11 cases against missing functions; final full suite: 129 passed, 0 failed,
  0 skipped. Settlement tests now pass through admission before review.
- Build/formatting check succeeded; six timestamp/two loop warnings remain.
- Updated source v0.2 spec and repository protocol/state/accounting/overview.
  EvidenceSubmitted was replaced by versioned creation/assignment/decision events;
  ABI consumers must regenerate against the new build.
- Challenge screening/remediation, resolver committee, admission deadlines,
  resubmit limits, post-funded refunds and slash remain unimplemented.

### 2026-10-03 — Specify evidence packages and upgradeable analysis reports

- User confirmed the design corpus moved to repository `v0.2/`; this is now
  the source location for design updates and GitHub publication.
- DONE (documentation): Evidence Schema v0.1, Verification Report v0.1 and a
  synthetic worked example, with repository integration guide and reading links.
- Specified immutable manifests/file hashes, separate rerunnable report versions,
  provenance, restricted originals/public redactions and manual fallback when
  optional OCR/AI fails. No retrospective criteria changes or automatic financial
  decisions from flags. Duplicate evidence and expenses require context/currency.
- TODO (implementation): upload/storage validation, report engine and verifier UI.
  Provider/model, upload limits, retention and waiting-stage recovery remain open.
- Verified 58 local links in the updated document set and parsed both example
  JSON blocks. Examples contain explicit placeholders, not validated real evidence.
- Reran the full contract suite before publication: 129 passed, 0 failed,
  0 skipped across 11 suites. No contract source changes in this documentation task;
  publication includes the previously implemented local milestone/admission work.

### 2026-10-03 — Clarify dev network, gas and TypeScript conventions

- DONE (documentation): local EVM development uses Anvil + ERC20 MockUSDC;
  donation/bond and native test ETH for gas are separate. Production is unselected;
  Sepolia is planned validation, not a verified deployment.
- Added network/gas design in v0.2; synchronized protocol, overview and Web3
  conventions. TS uses bigint for token/native/fee values and decimal strings
  in JSON, with nativeCurrency/token deployment metadata rather than hardcoding.
- Recorded zero-native-balance UX checks and MockUSDC authorization limitations.
  Relayer/paymaster, signature entrypoints and sponsor fee policy remain unimplemented/open.
- No source, ABI, dependency or FE/BE behavior changed in this documentation task.
  Existing backend evidence work and its progress entry are retained.
- Verification: 22 local links across five documents resolve; git diff --check
  passes. Inspected MockUSDC source to confirm 6 decimals and no authorization
  extension. No runtime test/build was run for this documentation-only update.

### 2026-10-03 — Add Arc testnet evaluation candidate

- DONE (documentation): Arc evaluation plan, source references and testnet
  parameters, with network/gas, TS, protocol, overview and accounting alignment.
- Local dev remains Anvil + MockUSDC. Arc testnet trial is approved; production
  chain, sponsorship and actual Arc deployment/integration remain open/TODO.
- Specified shared USDC balance with native 18/ERC20 6 decimals, bigint unit
  conversion, fee reserve and gross refund versus net balance change.
- Added native/ERC20 event-stream double-counting safeguards; FundTogether
  events remain the source of protocol contribution/refund projections.
- Official Arc sources were consulted on 2026-10-03. No source/dependency/ABI
  change, wallet creation or transaction broadcast in this documentation task.
- Verification: 33 local links across eight relevant documents resolve;
  tracked documentation diff formatting passes. Arc runtime validation and
  deployment checklist remain TODO; no runtime tests were run for this update.

### 2026-10-03 — Review ten milestones and prioritize Arc integration

- DONE (documentation): checked all ten milestone guides against current contract,
  backend boundaries and approved design updates; added a dated review matrix.
- Corrected early funding success, activation versus settlement payout, mandatory
  verifier admission and review start, committee 2/3 versus deferred Safe,
  restricted originals/redactions, actual events and partial backend status.
- Arc testnet is prioritized; Sepolia becomes an optional fallback. Arc production
  remains a candidate subject to runtime/accounting, complete recovery journeys
  and fund-safety acceptance, not an approved deployment.
- Read official Arc native model, gas, lifecycle, finality, system logs, RPC,
  porting and Arc Foundry references. Recorded unit/status inconsistencies in
  source snippets and specific validation requirements rather than copying them.
- Updated network/TS/protocol/MVP/accounting references, roadmap, stack, library
  guide and threat model. Historical entries remain dated history.
- Verification: 181 local links across 34 documentation files resolve;
  git diff --check passes. All 20 FundTogether-specific event names match source
  in protocol-spec and web3-conventions. Contract/frontend source diff is empty.
- No runtime test/build, Arc installation, deployment or transaction broadcast.
  Existing backend changes are preserved. CHALLENGED exit, waiting-stage recovery
  and post-funded refunds/slash remain unimplemented.

### 2026-10-03 — Connect organizer FE to wallet auth and draft APIs

- IN_PROGRESS (FE): configured Wagmi/RainbowKit for local chain 31337 and added
  SIWE sign-in/session UI, campaign draft create/load, and evidence draft
  create/load/update using the backend revision field.
- The evidence form currently edits report summary and performed dates. File
  upload, expense/outcome editors, freeze/hash, and chain submission remain TODO
  until their backend APIs and rules are ready.
- Verification: `npm run build` and `npm run lint` pass; local FE returns 200,
  backend health returns 200, and unauthenticated `/auth/session` returns 401.
  Build reports a 913 kB main JS chunk due to the wallet UI dependencies.
- Manual wallet signature and persisted draft journey have not yet been run.

### 2026-10-04 — Fix SIWE scheme mismatch

- Fixed the FE SIWE message authority to include the `http` scheme expected by
  backend verification for the local `localhost:5173` origin.
- Added a regression test that parses the generated message and checks scheme
  and domain. It failed before the fix (`scheme` was undefined) and passes now.
- Verification: all six backend test suites (13 tests), backend build, FE build,
  FE lint, and `git diff --check` pass. The user wallet signature flow still
  needs a fresh manual sign-in after the page reloads.

### 2026-10-04 — Organizer dashboard navigation

- Implemented a signed-in dashboard with Overview, Campaigns and Evidence
  navigation, compact account/sign-out controls, and responsive navigation.
- Campaign creation is explicitly labelled private draft storage. It uses the
  existing authenticated metadata API; it does not publish on chain. Organizer
  approval, milestone setup, bond locking and publishing remain TODO.
- Moved create-draft forms behind a New draft action and reference-based loading
  into a secondary disclosure. A campaign listing API is still TODO; the UI
  shows only the currently opened draft, without invented totals or history.
- Evidence messages now distinguish editable draft saving from review submission
  and hide schema/revision details. Milestone indices remain explicit until real
  milestone definitions exist. Upload, freeze and review submission remain TODO.
- Cleared evidence selection when creating/loading another campaign and cleared
  workspace state on sign-in/sign-out to keep account data separate.
- Verification: FE build and lint pass. Local FE starts and backend health returns
  200. Browser inspection confirms the signed-out screen renders without a
  network error. Signed-in navigation still needs a manual wallet session check;
  the preview browser has no authenticated wallet session. Existing large bundle
  warning remains.

### 2026-10-04 — Account campaign draft list

- Implemented `GET /campaigns` under AuthGuard. The service filters by session
  user ID and draft status, returning newest-first metadata with a deterministic
  ID tie-breaker. There is no client-supplied owner and no public read model.
- Campaigns now loads the account draft list with TanStack Query, including
  loading, empty, error/retry and refresh states. Creation refreshes the list;
  opening a draft fetches its owner-protected detail and switches to Evidence.
  Removed manual UUID entry and scoped query cache by account.
- Fixed Nest build output drift caused by a spec importing frontend source:
  `tsconfig.build.json` excludes specs and pins the backend root, restoring
  `dist/src/main.js` used by the existing start scripts. Restarted the dev API.
- Verification: backend build, frontend build/lint and diff whitespace check
  pass. Backend health returns 200; campaign list without a session returns 401,
  including requests with an owner query parameter. Compiled controller and dev
  startup both contain the new route. Authenticated list/navigation and isolation
  between two real accounts still need manual session verification. No automated
  tests were added or run in this slice. Pagination remains a later step.

### 2026-10-04 — Separate campaign list and creation pages

- Split sidebar navigation into Recent campaigns and Create campaign. The list
  no longer contains the creation form. List actions navigate to the creation
  page; successful creation returns to the refreshed list with its save notice.
- Kept the private draft distinction and existing API behavior. Mobile navigation
  scrolls horizontally to accommodate the additional page.
- Verification: frontend build and lint pass. Signed-in browser interaction still
  needs checking with the user's wallet session; existing bundle warning remains.

### 2026-10-04 — Campaign milestone draft database model

- Added `campaign_milestone_drafts`: campaign foreign key, stable local UUID,
  zero-based index, title/description, JSONB draft acceptance criteria and
  timestamps. Enforced unique campaign/index, nonnegative index and JSON array.
- Added campaign revision defaulting to 1 for future aggregate edit locking.
  Runtime validation and optimistic locking APIs remain TODO; the column and
  JSON TypeScript type alone do not implement either behavior.
- Generated and applied additive migration `0002_campaign_milestone_drafts`
  to the configured local PostgreSQL. Existing evidence is unchanged and not
  yet constrained to milestone definitions; legacy references must be reconciled
  before that integration. No financial or chain placeholders were added.
- Verification: backend build succeeds; migration command succeeds; live DB
  catalog inspection confirms columns, defaults, foreign key, check constraints
  and unique index. No automated tests were added or run. Milestone API/editor
  remain TODO. See `backend-step-3-milestone-model.md` for the learning notes.

### 2026-10-04 — Remove duplicate campaign creation button

- Removed the creation button from the Recent campaigns page heading. The
  separate Create campaign sidebar page remains available.
- Verification: frontend build and lint pass.

### 2026-10-04 — Remove campaign creation page

- Removed the Create campaign page, sidebar entry, form handler/state and unused
  creation API client function. Removed the empty-list creation action and
  adjusted copy to match the remaining saved-draft workspace.
- Verification: frontend build and lint pass. Backend APIs and saved data were
  not changed by this UI removal.

### 2026-10-04 — Compact dashboard and staged campaign creation UI

- Removed repeated page-heading brand/title/subtitle blocks and the large
  Overview hero. Reduced content/topbar spacing; page context stays in the topbar.
- Added Create campaign exclusively in the campaign list. It opens an in-place
  wizard: details -> milestones -> review/confirmation, without a sidebar page.
- Milestones start at one; Add milestone validates existing entries before adding
  another. Earlier cards collapse, with edit/delete controls and criteria fields.
  Inline validation, Back and section editing keep entered content.
- Review shows all entered data and an acknowledgment checkbox. Submission stays
  disabled with an explicit unavailable notice; there is no simulated success,
  pending-review state or financial action. Wizard data stays in memory across
  workspace navigation and is cleared by reload/sign-out, not persisted to DB.
- Verification: frontend build/lint and diff whitespace check pass. Browser
  interaction with the authenticated wizard still needs a user wallet session.
  No automated tests were added/run. Milestone persistence and submission APIs
  remain TODO; existing bundle-size warning remains.

### 2026-10-04 — Campaign gallery layout from the user's reference

- Changed Campaigns to a gallery: a shaded creation area with one blank Create
  campaign tile, followed by a responsive Recent campaigns card grid.
- Saved cards preview their actual title/description and show draft status and
  creation date. Clicking the whole card uses the existing protected detail API.
  Creation still opens the existing three-step wizard; no template data added.
- Verification: frontend build/lint and diff whitespace check pass. Authenticated
  visual interaction still needs the user's wallet session.

### 2026-10-04 — Remove the legacy manual evidence selector

- Removed the milestone index input, manual evidence load button, and the editor
  that depended on that index. Removed its component state/handlers to avoid
  silently saving evidence against a default milestone.
- Evidence now shows campaign context and a pending milestone-list notice until
  persisted milestone APIs provide an explicit selection. Existing backend
  evidence APIs and saved data are preserved.
- Verification: frontend build and lint pass. Milestone-based evidence navigation
  is still TODO.

### 2026-10-04 — Save and read campaign with milestone planning

- POST /campaigns now validates required campaign details, at least one milestone
  and nonempty acceptance criteria with unique IDs per milestone. Unknown fields
  are rejected; owner comes from the verified session and indices from array order.
- Campaign and milestone inserts share one transaction. Create/detail responses
  include ordered milestones, revision and timestamps. Detail remains owner-only;
  older campaigns without milestones return an empty array.
- The wizard review now offers Lưu nháp, disables editing while saving and retains
  input on an API error. Success refreshes Recent campaigns; selecting a card opens
  persisted campaign/milestone details. Logout aborts an in-flight client request.
- Nộp campaign remains disabled. Aggregate editing/revision locking, review,
  evidence selection and chain publishing remain TODO. No new migration required.
- Verification: backend build, frontend build/lint and diff whitespace check pass.
  Running backend health returns 200; unauthenticated GET /campaigns returns 401.
  Authenticated save/reload still needs verification with a real wallet session.
  No automated tests were run; the existing owner unit-test mock was adapted to
  the new service signature. Existing frontend bundle-size warning remains.

### 2026-10-04 — Edit campaign planning with revision locking

- Added organizer-only PATCH /campaigns/:id with full planning validation,
  expectedRevision, and optional existing milestone IDs. Duplicate IDs and IDs
  belonging to another campaign are rejected. Retained milestone IDs/creation
  dates and criterion IDs survive normal edits; new milestone IDs are generated.
- Conditional update checks owner, draft status, revision and absent chain fields.
  Campaign revision/timestamp and ordered milestone replacement share one
  transaction. Stale or ineligible writes return 409 and all failures roll back.
- Existing evidence blocks planning edits until legacy index references are
  reconciled. Evidence creation now locks the parent row in its transaction,
  serializing it with campaign edits. No migration or chain transaction needed.
- Campaign details now has Chỉnh sửa. It preloads the staged wizard and offers
  Lưu thay đổi. Saving updates the cached card without duplicating it and returns
  to details. Conflict preserves input, disables save and offers a separate latest
  version comparison plus an explicit discard-and-use action; no automatic retry.
- Verification: backend/frontend builds, frontend lint and whitespace check pass.
  Running health returns 200 and unauthenticated PATCH returns 401. The existing
  evidence-create test mocks were adapted; no new tests were added or run.
  Authenticated saves and concurrent-tab behavior remain unverified at runtime.
  Submission/review and evidence navigation remain TODO; bundle warning remains.
