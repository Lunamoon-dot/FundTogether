# FundTogether Project Progress

> **Updated:** 2026-10-11

## 2026-10-11 — Checkpoint and funding-request transition plan

- DONE: checkpoint `28b245c` on existing `main`, 79 files; no new branch or push. Fresh frontend157/157 and backend166/166 PASS. Staged scan found no runtime/env/key files; password candidates were schema/input declarations, generated fixture credentials or test inputs. Standard whitespace check reported pre-existing Markdown hard breaks and two EOF blank lines, preserved in this snapshot; check excluding those categories passed.
- User chose replacing fixed milestones with funding requests. Added `docs/superpowers/plans/2026-10-11-funding-requests-cleanup.md`: retain shared auth/wallet/org/storage, extract organization verification from advance, replace financial domain before deleting dependent UI/API/tests, preserve deployed obligations and data.
- Planning only: no code deletion, migration execution, deployment, chain/account reset or new financial-policy approval. Workflow B acceptance remains deferred; its evidence is not acceptance of the proposed model.

## 2026-10-11 — Implementation goal complete; human acceptance deferred

- DONE: user explicitly chose “Hoàn tất goal triển khai; giữ nghiệm thu thành giai đoạn sau, chưa đạt.” GOAL.md now separates implementation completion from later human acceptance. This supersedes the historical BLOCKED/IN_PROGRESS goal dispositions below, without changing application authority or financial rules.
- Verified handoff: frontend157/157 (fresh full run), backend166/166, contracts281/281; frontend B build/lint PASS. F4–F6 intercepted-API browser suite33 checks PASS. B preflight and inventory validation of11 historical integration reports PASS; inventory validation is not a rerun of all journeys.
- TODO, not accepted: F2/I3/OI1 human portions, remaining T01–T18 human evidence, actual Brave/MetaMask journeys and independent reviewer outcomes. Reviewer data remains0 complete/0 partial. No claim of full acceptance or production readiness; no immediate manual testing requested.

## 2026-10-11 — User removes the human-acceptance blocker

- DONE: B milestone review deep links now retain the requested stage index. Invalid/out-of-range indices show a missing-stage page; a link to a different stage does not silently open the current decision form and offers an explicit current-campaign link. The guard is reevaluated on workflow refresh. A routes and on-chain permissions are unchanged.
- Evidence: browser regression failed before the fix; component regression covers previous-stage and invalid/unsafe indices. Focused suite20/20, B build/lint PASS. Full F4–F6 intercepted-API browser suite33 checks PASS, including a valid `/milestones/.../0` route. Updated its escrow assertion to open the current “Dòng tiền và thông tin mạng” disclosure and verify 0 MockUSDC, preserving the accounting check. Saved `.local/workflow-b/ui-review-browser-report.json` and rebuilt acceptance inventory; zero real wallet/API writes and no manual acceptance claim.

- DONE: submitted and historical organization dossiers now show each document's stored category (identity, representation, activity, other), alongside filename and binary size. Previously the upload form collected category but the read-only review omitted it. This exposes existing frozen metadata without changing the record or file permissions. Existing approved-dossier regression now checks the representation label; onboarding19/19, TypeScript build check and lint PASS.

- DONE: public account actions now use the same staff-role check and destination as the sidebar. USER no longer receives a link to an inaccessible internal workspace; B ADMIN opens organization verification and RESOLVER opens campaign review. Existing server authorization remains unchanged. Durable browser regression `frontend/scripts/internal-navigation-browser-check.js` reproduced the USER entry before the fix and passes all four role combinations after it using intercepted API, zero real writes. B build/lint verified.

- DONE: fixed silent omission of a locally selected organization document when other documents were already uploaded. Submission now waits for upload or explicit removal. Pending file and document category survive draft revision refresh, including save-success/upload-failure, and oversized files have an explicit explanation. No backend or authority changes.
- Regression evidence: `frontend/scripts/organization-upload-browser-check.js` failed before the fix with “Selected but unuploaded file can be silently omitted”; after the fix, isolated Edge/intercepted API passes pending-file gating, clearing the picker, preserving file/category after save followed by upload failure, and retry/upload/submit. No real account/chain writes. Onboarding19/19, B build and lint PASS; existing large-bundle advisory remains.

- IN_PROGRESS: explicit user instruction “bỏ qua block” supersedes the blocked disposition below. Goal status was verified ACTIVE. Continue approved technical work without treating deferred manual/reviewer evidence as a reason to block this iteration again.
- F2/I3/OI1 human observations stay TODO for the later acceptance phase, not PASS. Application authorization, signature verification, organization verification and financial gates remain required; this instruction concerns development coordination only.

## 2026-10-11 — Goal completion blocked on deferred human evidence

- Completion audit rechecked GOAL.md, all open code-plan gates, current test logs and reviewer output. The previous turn made progress by rerunning all contracts and recording current evidence. Across the latest consecutive goal turns, the remaining completion condition has stayed the same: actual wallet journeys and reviewer observations are absent and explicitly deferred by the user.
- BLOCKED for full-goal acceptance, not a failed build or an unimplemented organization-request feature. C/B/F and onboarding implementation have automated evidence; latest logs remain contract281, backend166, frontend156 PASS. No new technical failure or unimplemented approved task was identified by the audit. Repeating those tests or inventing additional features cannot supply the missing human results.
- Preserve F2/I3/OI1 and T01–T18 human portions as TODO. No request for immediate manual testing, no fabricated reviewer decisions, and no automatic signing. Continue from these gates when the user chooses to resume acceptance or supplies concrete further implementation work; do not restart existing environments or replay completed work.

## 2026-10-10 — Continue engineering; defer human acceptance

- Fresh completion audit: full local `forge test` finished successfully, 281/281 across 24 suites, zero failures/skips, 265.91 seconds; no application-chain transactions. Log `.local/workflow-b/contracts-latest-tests.log`. B preflight PASS. Rebuilt acceptance inventory validates deployment identity/report hashes for 11 historical automated reports; this is not a rerun of those journeys. Reviewer parser still reports 0 complete/0 partial observations. Current requirement/evidence mapping is appended to `workflow-b-code-audit-2026-10-10.md`; full goal remains unproven because manual/reviewer gates are deferred.

- DONE (follow-up): ADMIN queue refreshes every 10 seconds while visible; submitted organization requests refresh until a decision arrives. Drafts and terminal requests do not poll, failed reads stop automatic retry, and revisiting requests checks fresh state instead of the global 30-second cache. No background writes or wallet requests were added.
- Fresh verification for this follow-up: frontend 156/156 (onboarding 19/19), backend 166/166 across 27 suites, B build and frontend lint PASS. Isolated Edge/mock API verified queue arrival without reload, organizer receiving a changes-requested decision without reload, and an unsaved draft retaining its text with no periodic request after 11 seconds. Human acceptance remains deferred.

- IN_PROGRESS: user explicitly requested completing approved implementation before further manual testing. Manual F2/I3/OI1 and independent reviewer outcomes remain TODO and no longer block engineering work. This supersedes earlier instructions to wait for human results before continuing.
- DONE: organization queue now exposes an explicit dossier action, readable cards/filter, manual refresh and draft explanation. ADMIN-only `/internal` defaults to organization verification; sidebar highlights only the current page.
- DONE: queue links bind the selected request ID. Historical filters previously opened the latest request for the organization; detail now selects the exact request, rejects missing IDs and only offers review for the latest UNDER_REVIEW request. Financial permissions and data are unchanged.
- Verified this turn: two regression tests failed before the fix; onboarding 18/18 and full frontend 155/155 pass after it. Workflow B build and lint pass (existing large-chunk advisory remains). Isolated Edge with mocked API passes ADMIN landing, refresh, historical selection, no historical decision controls, and 390px no-overflow checks. Screenshot inspected. No real account/chain writes; not Brave/MetaMask acceptance.


## Current direction — MVP consolidation and business validation

User-confirmed on 2026-10-06: stay with the MVP, research real charitable
operations and strengthen existing journeys before adding post-MVP features.
See [the working plan](./business-validation-and-mvp-hardening.md).

- IN_PROGRESS: consolidate the implementation and its user experience. A/B have
  local/manual evidence; C1–C6 real-wallet acceptance remains TODO on a separately
  prepared MVP application environment. Automated smoke fixtures are not that
  environment. On 2026-10-07 the user authorized discarding local test campaigns
  and replacing the application prototype with FundTogetherMvp; browser acceptance
  on that fresh deployment remains TODO.
- TODO: validate organizer working capital, no-slash bond purpose, evidence
  standards, resolver capacity/conflicts, donor participation and operational
  responsibilities. No interviews or real-world pilot are claimed as completed.
- TODO: complete browser failures, coordinated backup/restore and continuous
  liveness acceptance; prioritize demonstrated blockers before measured optimization.
- Deferred: separate verifier, committee, appeals, slash, reputation, AI and
  public-network expansion. Existing approved rules remain the test baseline;
  changes to authority/funds/obligations require explicit decisions.

The dated entries below are evidence for their stated slice and environment.
Historical DONE entries do not mark the entire MVP, business validation or
production readiness DONE; old next-step notes are superseded by this direction.

### 2026-10-10 — DONE clarify unsent organization drafts and internal roles

- Read-only inspection of the reported owner's new organization found a DRAFT
  with complete profile fields and one uploaded document, but no representative
  wallet. Audit contains CREATED/SAVED/DOCUMENT_ADDED, no SUBMITTED event; this
  explains why the UNDER_REVIEW queue excludes it. No user records were changed.
- The draft now explicitly says it has not reached ADMIN, identifies a missing
  organization wallet and provides a scroll/focus button to the wallet selector.
  Saving/uploading remains available; submit waits for representative selection.
- B internal navigation now shows organization verification to ADMIN and
  campaign/milestone/case review to RESOLVER, with a short role explanation.
- Two regression tests failed before the fix; all16 onboarding tests now PASS.
  Isolated Edge with mocked API verified five checks including bind-then-submit
  and ADMIN menu visibility; no real submission/signing. B build and lint PASS
  with the existing bundle warning. The owner must choose the wallet and submit.

### 2026-10-10 — DONE direct ADMIN navigation from account/public pages

- Added an explicit `Xác thực tổ chức · ADMIN` link in the public sidebar and
  account panel for B accounts with ADMIN, leading to `/internal/organizations`.
- Verified the running B frontend in isolated Edge with mocked sessions:
  ADMIN and ADMIN+RESOLVER see both links and reach the queue; USER and RESOLVER
  do not see these links. No API writes or wallet actions. B build and lint PASS;
  the existing bundle-size warning remains. Manual Brave acceptance remains open.

### 2026-10-10 — DONE expand current manual acceptance guide

- Rewrote the Brave/MetaMask manual guide against current UI, organization
  request flow and approved B accounting/deadlines. Added actor setup, detailed
  G1/G2 steps, organization branches, wallet failures, case/return/refund amounts,
  coordinated technical fixtures and reviewer/result templates.
- Added a first-session stopping point and coverage mapping for T01–T18 and
  O01–O12; removed stale wallet-link/funding assumptions. Checked all seven local
  documentation links, section order and current CSV:60 rows,0 outcomes.
- Documentation only; no services, accounts or chain state changed and no new
  manual PASS claimed. F2/I3/OI1 human evidence remains outstanding.

### 2026-10-10 — DONE consolidate current automated acceptance evidence

- Acceptance inventory now includes organization onboarding and both browser
  regression reports. Each report must identify the configured B deployment;
  conflicting identities fail the inventory. Preserve scope, run time, hash and
  limitations, keeping mocked browser checks separate from HTTP/fork evidence.
- T01/T02 now cite the dedicated journey report rerun through request-bound
  verification, not duplicate G1/G2 paths in the older failure report. Each
  recorded outcome includes its source report and run date; missing/failed
  primary evidence is not replaced with an older PASS.
- Fixed empty check maps and contradictory FAIL/PASS fields being accepted as
  successful evidence. Five report-regression tests PASS. Reran onboarding74
  HTTP checks and browser14+32 checks with deployment-bound output; inventory
  contains11 automated reports and still reports IN_PROGRESS, human/reviewer TODO.
- This step changes reporting/test harnesses only. Historical contract/failure/
  recovery runs retain their original dates; no claim of rerunning those suites.
- Final open-item check: GOAL manual/T01–T18 gates and code-plan F2/I3/OI1 still
  need actual extension/user actions and reviewer decisions. Technical evidence
  and fixtures are prepared; reviewer observations remain0. The user elected to
  test later. Goal execution is BLOCKED on that human evidence, not marked DONE;
  no additional approval or financial-rule decision is pending.

### 2026-10-10 — DONE fresh authorization when reopening approved dossiers

- Updated the F4–F6 browser regression script: its ADMIN route/form mocks still
  used the removed direct-verification screen. Reproduced that failure first,
  then replaced the fixtures with submitted requests and request-bound reports.
- Browser testing found the approved-dossier query inherited the global30-second
  freshness window. Reopening could reuse private content without a fresh API
  check. Set this query's staleTime to0 and hide cached content while fetching.
- Edge/Playwright with intercepted API responses now passes32 checks: deferred
  authorization,403/503 recovery, snapshot mismatch, exact downloaded bytes,
  read-only resolver view, ADMIN checks, existing evidence/refund gates and mobile
  overflow. No API writes, source-chain transactions or extension signing.
- Full frontend150 tests PASS; lint and B build PASS (existing bundle warning).
  Report: `.local/workflow-b/ui-review-browser-report.json`; downloaded642 bytes
  match the synthetic fixture. Reviewer CSV rechecked:60 rows,0 outcomes. I3/OI1
  remain IN_PROGRESS pending actual user/reviewer results.
- User confirmed they have not tested yet and asked to continue technical work,
  with manual testing later. Re-exported the browser fixture from the live B
  services and reran both suites: organizer14 and review/public/refund32 PASS.
  Closed only the dedicated Edge test sessions; post-test B preflight PASS.

### 2026-10-10 — DONE resolver access to approved organization dossier

- Campaign review history now opens the original approved organization request
  and its private documents. The read-only view checks organization/request IDs,
  verification record, snapshot hash and bytes; legacy records remain readable.
- Role removal, account switch and failed refetch hide cached private content.
  Reproduced missing dossier navigation and role-removal rendering with failing
  component tests before fixing them. Six additional frontend cases pass;
  full suite149 tests, lint and B build PASS (existing bundle-size warning remains).
- Real HTTP/PostgreSQL/private-storage smoke now passes74 HTTP checks across9
  behavior groups, including concurrent create/submit, resolver downloads, role
  revocation, foreign-organization file references and same-length tampered bytes.
  Original accounts preserved; no source-chain writes or clock changes.
- B preflight PASS. Corrected O01–O12 evidence mapping and manual resolver steps.
  These automated results do not complete OI1/I3 human acceptance.

### 2026-10-10 — DONE onboarding implementation; OI1 human acceptance IN_PROGRESS

- After the simplified design, the user asked to continue the goal. Implemented
  OB1–OB3/OF1–OF2: private organization profile/documents, request history,
  immutable submitted content, audit, submit/cancel/resubmit and ADMIN decisions.
- ADMIN now approves a submitted request. Current roles and ownership are checked
  inside the serialized transaction; direct VERIFIED creation is rejected. Existing
  REVOKED records remain valid history and map to SUSPENDED. Material profile
  changes require reapproval; no campaign obligations or financial state changed.
- Additive B migrations0014/0015 applied through the database guard. Original
  accounts/passwords/wallets/roles/organizations/verification records preserved;
  profile data lives in request.content, leaving the shared organizations schema intact.
- OpenAPI regenerated with43 paths. OWNER UI includes draft/files/feedback/timeline;
  ADMIN queue contains actual submitted requests and three decisions. Effective
  verification/expiry is separate from request status; failed reload hides actions.
- Verification: backend166 tests; frontend143 tests including7 onboarding component
  cases; lint and builds PASS. Real Nest/PostgreSQL/MinIO smoke passed60 HTTP checks,
  including role/private-file access, stale writes, immutable history, concurrent
  approvals/cancellation and rollback after record insertion.
- Edge/Playwright against the real API completed draft/reload/upload/submit,
  changes requested/resubmit/approve, download, and lost-response reconciliation.
  Found and fixed duplicate React sibling keys. G1/G2 rerun on disposable fork:
  38 receipts,14 assertions,2 completed outcomes; source chain and original DB preserved.
- Evidence and O01–O12 scope are in [acceptance](./workflow-b-acceptance.md).
  Updated the manual guide to the new flow. OI1 human acceptance, I3 extension
  signing and independent reviewer outcomes remain TODO; the goal is not complete.

### 2026-10-10 — DONE simplify onboarding design to request history and audit

- User chose no explicit organization profile versioning for MVP: request
  history, audit log and locked material fields/documents while UNDER_REVIEW.
  Updated onboarding design/code tasks and research direction accordingly.
- Removed the proposed submissions/version table; each submitted request keeps
  a small fixed copy of its reviewed data and immutable file references.
  Resubmission creates a new request; UI presents a timeline, not version numbers.
- Separated organization status/expiry from request status, added cancel-review
  race and all-write-path locking to acceptance. Post-approval identity edits and
  legacy REVOKED to SUSPENDED mapping remain explicitly proposed policy details.
- Documentation only: no new schema/API/application behavior, permission or
  financial state changes; no automated suite rerun for this design revision.

### 2026-10-10 — DONE organization status labels; onboarding design prepared

- Organization list/profile now derive their label from API verificationStatus:
  unverified, verified, revoked or unknown. This displays the recorded decision;
  validity remains checked at the existing B review/eligibility boundary.
- Added component regressions for both routes and all four states, including
  failed query with cached data. Reproduced3 failing cases before the fix;
  focused public-review34/34 PASS afterward, lint and Workflow B build PASS.
- User chose design/tasks first for organization onboarding. Added
  [proposed design](./workflow-b-organization-onboarding-plan.md), six TODO tasks
  OB1–OB3/OF1–OF2/OI1 and O01–O12 acceptance cases. No request tables, endpoints,
  roles, verification records or contract rules were changed in this slice.
- Live B preflight passed before the UI fix; HTTP5174 then confirmed both pages
  serve the new label mapping. Manual wallet/reviewer acceptance
  remains incomplete; preparing the onboarding plan does not complete I3.

### 2026-10-10 — DONE organization profile navigation correction

- Organization selector previously fell back to campaigns from organization
  list/profile. It now opens the selected organization's profile in that context,
  while campaign/evidence/milestone switching keeps its section.
- Added an explicit "Hồ sơ & ví đại diện" sidebar link for the selected
  organization and corrected manual-test navigation instructions.
- Profile/list links and representative-wallet rendering covered by regression
  tests; focused suite 30/30 PASS, lint and Workflow B build PASS.
- Applied to Desktop runtime and d6be. The separate in-app browser is logged out;
  authenticated Brave click behavior was not independently reproduced. Existing
  "Xem hồ sơ" href already targeted the profile; no claim that this anchor was
  the source of the reported redirect. No representative wallet was assigned.

### 2026-10-10 — DONE native extension connection; user reports recovery in Brave

- Repeated manual reports show a signature wait without a visible new prompt,
  including after clearing pending extension requests. Backend nonce responses
  were fast; no subsequent link verification request reached the API. These
  observations do not by themselves identify the extension's internal failure.
- Installed RainbowKit MetaMask preset uses the MetaMask SDK and claims its rdns;
  Wagmi consequently skips the native announced provider for that rdns. Removed
  preset connectors and now use Wagmi EIP-6963 discovery directly. The installed
  wallet list retains extension identities, without a shared window.ethereum
  fallback or SDK session in this connection path. Extensions must announce
  their provider; mobile WalletConnect is outside this local workflow.
- Added actual Wagmi connect/getConnectorClient/signMessage tests with simulated
  Brave and MetaMask providers. Verified exact provider identity, one signing
  request, returned signature recovery, discovery deduplication, reject/reconnect,
  and rejection of a late signature after account change. These are not tests
  of the user's actual extension UI.
- Frontend130/130 PASS, lint and B build PASS; Desktop port5174 serves the new
  configuration. A full page reload is required to replace an existing SDK
  connection. The user subsequently reported "được rồi" and requested that this
  incident be recorded. This is user-reported recovery of the current issue,
  not independent verification of all wallet journeys or long-term stability.
- Recurrence guide: inspect the selected connector/provider before blaming RPC
  or increasing timeouts. Keep EIP-6963 discovery in wallet-config.ts; do not
  reintroduce a preset claiming io.metamask without testing native discovery.
  A page reload replaces an old SDK connection. Reject stale extension requests
  if present, then connect to the detected MetaMask and request linking once.
  Disconnecting or cancelling the app wait does not cancel an extension prompt.
  Preserve database links and chain state; verify ownership conflicts separately.

### 2026-10-10 — DONE password-confirmed wallet unlink; user action pending

- Added POST /auth/wallets/unlink and a per-wallet confirmation form. The
  authenticated owner supplies their account password, exact address and chain;
  no extension signature or token transfer is involved.
- A transaction locks the account/session/link, rejects passwordless accounts,
  organization representatives and wallets bound to frozen B plans or A
  submissions. Absent scoped links permit safe retries without modifying a
  different user's wallet. Other sessions and current pending challenges are
  revoked after successful removal. Wallet login holds a shared link lock until
  session creation, serializing it with unlink.
- Frontend clears the password after submission, disables duplicate actions,
  refreshes the account from the response and disconnects the matching wallet.
  Wallet-only accounts remain unsupported by this password-confirmed flow.
- Backend auth/controller/guard19 tests PASS; real B DB smoke8 checks PASS with
  outer rollback, including wrong owner/chain/password, representative guard,
  session revocation, retry and fresh SIWE relink to another synthetic account.
  Frontend127 tests, lint, backend and B frontend builds PASS.
- Desktop API was stopped; started the updated B API (launcher23828, child21520).
  Health reports ready/ADVANCE/31338; anonymous unlink returns401 and port5174
  serves the new button. No real user links were removed; user confirmation in
  the browser remains pending. Worktree Jest path discovery was unsuitable, so
  focused backend checks ran from the configured Desktop checkout.

### 2026-10-09 — DONE recover abandoned wallet proofs; Brave acceptance pending

- Reproduced two regressions before the fix: timed-out authentication requests
  retained the connector lock indefinitely, and disconnect/reconnect could not
  recover an abandoned signature request. The screenshot text came from this
  frontend lock, not an observed fresh error from the extension.
- Authentication proofs now release their local lock on timeout/abort and ignore
  late signatures. Request identity prevents an old promise from unlocking a new
  request. Transaction requests retain their lock and late-hash callback.
- AccountAccess aborts an active proof on wallet/chain/connector/account change;
  disconnect is available during preparation/signing and stops the old proof.
- Focused regression13/13 and full frontend127/127 PASS; lint and B build PASS.
  Tests cover timeout retry, cancellation, late-result isolation, duplicate
  signing, provider rejection and preserved transaction tracking.
- Applied the same source fix to the active Desktop checkout; HTTP5174 serves
  all three patched modules. The worktree lacks ignored B deployment config,
  so its attempted full suite could not load that fixture and was stopped;
  the complete suite passed in the configured Desktop checkout.
- A real extension may still retain its own pending prompt; this fix does not
  claim to cancel it. Brave/MetaMask popup interaction remains manual acceptance.

### 2026-10-09 — DONE manual test guide prepared; I3 remains IN_PROGRESS

- Added [Vietnamese manual test guide](./workflow-b-manual-test-guide.md) with
  account/wallet/organization prerequisites, G1/G2 steps, expected token deltas,
  evidence access/version checks, case/return/refund branches and result template.
- Read-only B check: API/RPC/storage/indexer ready and indexed through block41;
  organizer organization still lacked representative wallet and verification;
  resolver/donorB had no linked recipients at that check. No roles, links,
  balances, deadlines or chain state changed while preparing the guide.
- Acceptance now records the observed wallet-link slice of T16 separately from
  unperformed transaction/popup tests and the still-empty reviewer outcomes.
  Preparing instructions does not complete manual acceptance.

### 2026-10-09 — DONE linked-wallet balance display and partial manual funding

- Subsequent user screenshot shows the organizer wallet linked on31338; B DB
  independently confirms organizer and donorA now have SIWE links. This confirms
  those links after fixture repair, not all popup/timeout acceptance cases.
- The account card previously displayed only native ETH. Added MockUSDC from
  the current A/B deployment, isolated by wallet/account/chain/deployment, with
  separate loading/error/zero handling and refresh for both balances.
- B organizer's newly selected wallet received10,000 MockUSDC and1 local ETH.
  Both receipts succeeded; token mint Transfer and balances were checked.
  DonorA already held10,000 MockUSDC; no duplicate top-up was sent. Funding log
  `.local/workflow-b/requested-funding-result.json` retains destinations/receipts
  and prevents repeated credits. Resolver/donorB awaited linked recipients at
  that check; no assumed wallet mapping was used.
- Targeted frontend47/47 PASS, including10 card cases across A/B; lint and B
  build PASS. Active port5174 serves the updated card; B preflight remains ready.
  The card tests cover separate currencies, zero, RPC failure with stale cache,
  account/wallet cache isolation and unsupported chains.

### 2026-10-09 — DONE repair seeded wallet-link conflicts; human retry pending

- User screenshots showed signature waiting, then HTTP409-equivalent wallet
  ownership conflict. Current B DB confirmed the selected Anvil wallet belonged
  to a synthetic manual fixture, not the user's newly registered account.
- Fixed `seed-local.cjs` to prepare accounts/roles/drafts without SIWE signing,
  linking default Anvil wallets, binding the organization wallet or minting to
  assumed donors. Existing fixture accounts/passwords are retained.
- Backed up and released the five recorded synthetic default-wallet links in
  B only. Cleared the representative link of the synthetic organization after
  verifying its two plans remain editable/unfrozen and none of these wallets
  owns an on-chain campaign. No wallet was assigned to a human account.
- Hash comparisons verified users/passwords, roles, campaign metadata/plans,
  projections/reviews and organization verification records unchanged. Unrelated
  links are unchanged. Repair/backup are in ignored `.local/workflow-b/`.
- Two real seed reruns PASS: no additional wallet links, changed passwords,
  organization-wallet binding or duplicate drafts. Six real DB/SIWE checks PASS
  inside a rolled-back transaction: invalid signature, successful link, replay,
  idempotent relink, cross-account conflict and session reload. No test account
  remains; signatures used an ephemeral synthetic wallet, not the user's wallet.
- The user must retry the extension signature to confirm their selected link;
  the earlier timeout itself is not claimed fixed by this data repair. I3 and
  funding each actual chosen user wallet remain pending their verified mapping.

### 2026-10-09 — BLOCKED at I3 human acceptance; implementation approval remains valid

- The same missing human input persists across three consecutive goal turns:
  completion of automated comparison/waiting checks, G1/G2 handoff audit, and
  the current direct inspection of the remaining requirements/results.
- Current reviewer CSV has60 template rows and0 entered outcomes. Acceptance
  still records humanAcceptance TODO and independentReviewerExperiment TODO;
  no MetaMask observations were supplied. The previous turn completed the
  required example/runbook updates, so it was progress, not a live process wait.
- C1–C6/B1–B6/F1–F6 automated evidence and I1/I2 remain recorded below. Runtime,
  accounts, neutral files, runbook and observation templates are prepared.
  No independent required implementation step remains that can supply the
  missing human signatures, popup observations or reviewer judgments.
- GOAL explicitly prohibits signing through the user's extension or inventing
  manual results. Mark the goal BLOCKED pending those inputs, not complete.
  Resume I3 with the user's browser/MetaMask session and reviewer CSV; verify
  receipt/indexer/balances and address any defects revealed by that acceptance.
  This is not a new financial/code-plan approval gate and does not reset A/B.
- On the resumed I3 audit, browser inventory exposed only the Codex in-app
  browser and MCP Apps, with no Chrome/Edge connection. No extension action was
  attempted. The user must open the prepared local app in their wallet browser
  and supply the actual interaction/transaction observations; choosing an
  automated browser without that wallet does not satisfy manual acceptance.

### 2026-10-09 — IN_PROGRESS workflow B; code plan approved, C1–C6 implementation

- User explicitly approved the code plan: “tôi duyệt mà”. The approval gate is
  resolved; execute C1–C6→B1–B6→F1–F6→I1–I3 directly in this chat without asking
  again at each task. Goal resumed active; the BLOCKED entry below is historical.
- C1 starts with setup/funding tests, minimal compilable API scaffold, observed
  behavioral RED, then implementation and Foundry regression. No application
  chain/DB/storage is touched by these unit tests. Full B goal remains incomplete.
- Ruling: keep the approved current checkout/baseline and use this progress
  document as the task ledger; no new chat/subagent or automatic commit/push.
  GOAL's explicit execution constraints supersede skill workspace/reviewer defaults.

#### C1 — DONE setup/funding; C2 — IN_PROGRESS eligibility/advance

- C1 RED:16 behavioral failures with a compilable empty API scaffold. Implemented
  standalone no-bond setup, fixed plan/criteria/budgets, resolver approval,
  organizer publication/cancel, exact capped donations, first-review deadline
  and funding-timeout snapshot. Targeted16/16 GREEN; full `forge test`216 PASS,
  0 FAIL/skip,16 suites,268.37s, including the A invariant256 runs/128000 calls.
  Output: `.local/workflow-b-c1-red.log`, `.local/workflow-b-c1-suite.log`.
- C2 RED:12 failures for missing eligibility/advance/STOP; the incoming-transfer
  fault test already passed because C1 implemented exact-transfer donation.
  Added one-budget claim/deadlines, resolver STOP and first-review/claim timeout,
  exact outgoing deltas.13/13 C2 plus16/16 C1 PASS; full regression is running
  under its existing handle, output `.local/workflow-b-c2-suite.log`.
- Tested false/revert/recipient-fee/sender-fee rollback and retry with actual
  ERC20 transfer boundaries; callback observes ReentrancyGuard rejection.
  No Anvil node, deployment, ABI export or wallet/RPC transaction was performed.
- Ruling C2: include verificationHash in AdvanceAvailable, binding the fresh
  first-eligibility record in event history; next-stage eligibility uses zero.
  This closes a traceability omission in the plan, without changing funds/roles.
- C2 full regression completed: `forge test`229 PASS,0 FAIL/skip,17 suites,
  266.97s; A invariant256 runs/128000 calls. C2 DONE; no pending test handle.
- C3 RED:15 behavioral failures, compiled successfully. Implemented submission/
  immutable versions, four review outcomes, challenge/finalization and next-stage
  gating, without acceptance payout. C3 IN_PROGRESS; case/hard-stop interactions
  are verified together with C4, which provides the pending-case behavior.
- Ruling C3: pull the minimal return primitive forward from C5 because C3's
  surplus finalization must require an actual token return; C5 still owns the
  remaining return/refund adversarial and entitlement verification. Added reviewed
  flag to SubmissionView so unreviewed enum-zero is not displayed as MET.
- C3 first GREEN attempt:43/44 targeted tests PASS. The failing test used a
  whole-wallet balance of2200 across two separate funded campaigns, despite two
  legitimate advances totaling4400; corrected to the campaign's actual balance
  delta. Contract counters already showed one advance per campaign.
- C3 corrected targeted run:44/44 PASS; full regression still running under
  its existing handle, log `.local/workflow-b-c3-suite.log`. C4 added12 behavioral
  RED cases; implementation passes59/59 B unit tests including3 timeout tests.
  C3/C4 remain IN_PROGRESS until full regression and remaining boundary audit.
- C4 enforces one case/version, contributor/resolver opening, immutable response,
  bounded CONTINUE/RESUBMIT/STOP and permissionless TIMEOUT. Generic resolver
  STOP terminates a pending case too; timeout emits actor and zero decision hash,
  preserving the original opener's reason separately. Case material remains logs.
- Ruling C3/C4: a fresh3-day window must end strictly before hardStop, because
  finalization at hardStop is forbidden; otherwise MET/CONTINUE would create no
  valid finalization timestamp. Tested clipped equal case windows and decisions
  with insufficient time; no financial duration or authority was changed.
- C3 full regression completed:244 PASS,0 FAIL/skip,18 suites,331.66s. C4 full
  regression is running under its original handle/log `.local/workflow-b-c4-suite.log`.
- C5 RED:10 failures for missing claim/view methods;2 existing return primitive
  tests already PASS. Added full-precision Math.mulDiv, separate baseConsumed/
  cumulative supplementPaid, effects-before-transfer and zero-payout consumption.
  First target run71/71 PASS. Additional zero-rounded-base and failed-supplement
  tests protect future rights; C5 full regression still required before DONE.
- C4 full regression completed:259 PASS,0 FAIL/skip,20 suites,367.76s. C5 full
  regression completed:275 PASS,0 FAIL/skip,22 suites,343.51s, including256-run
  fraction/claim-order fuzz and the baseline A stateful invariant. C5 DONE.
- C6 added an independent four-campaign/six-donor stateful cash ledger, immutable
  version/review commitments, atomic artifact generation and strict deployment
  identity/timer verification. Initial B invariant256 runs/128000 calls PASS,
  278.54s; selector tuning keeps more live campaigns for the final full run.
- C6 artifact tests:4 behavioral RED, then4/4 GREEN. Generated B ABI/policy from
  Foundry artifacts; runtime16910 bytes (<24576). No A ABI/manifest overwritten.
  Added exact ±1-second boundary audit. Its first run78/79 PASS: the12-campaign
  review loop exhausted the synthetic donors'10000-token fixture balance; funded
  that test explicitly for all12 campaigns. Corrected boundary run pending.
- New B launcher uses native Linux state and validated atomic Windows backups,
  fixed chain31338/port9547, exact B paths and process ownership. Reuse requires
  genesis/code/anchor/instance/policy/token/resolver/timer matches; no reset path.
  Launcher/deployment runtime verification and final A+B regression remain TODO.
- Corrected boundary audit79/79 PASS; C3/C4 DONE. Full C6 A+B regression is
  running under its original handle/log `.local/workflow-b-c6-suite.log`.
- C6 `forge build --sizes` PASS: B runtime16910/initcode17472 bytes. Independent
  refund gas comparison:2 donors117186,64 donors117198 (+12gas), exact payouts2
  units each. New gas test was added after full-run compilation; its isolated
  run PASS is recorded separately, not counted in that full-run total.
- B deployment receipts success on31338/RPC9547, contract at block2, initial
  nextCampaignId0 and balance0. Full identity/getters verified before atomic
  manifest promotion at `.local/workflow-b/generated/deployment.local.json`.
  Launcher33540 remains owner; reuse check PASS, no second node. Native snapshots
  and Windows backup/previous274612 bytes exist; supervisor error log empty.
- Ruling C6: Windows Get-NetTCPConnection did not show WSL localhost forwarding
  although RPC was reachable. Added HTTP probe before startup so a reachable
  node must pass identity reuse, protecting against duplicate launch on WSL.
  No transaction/time/reset/data/ABI changes were made to A.
- C6 DONE: final A+B regression280 PASS,0 FAIL/skip,24 suites,321.13s; both
  stateful invariants256 runs/128000 calls. Gas test PASS separately after that
  run; artifacts/deployment/getters/build/size/reuse/snapshot proofs above.
- B1 DONE: environment guard3 behavioral RED→3 GREEN; cookie4 behavioral
  RED→7 GREEN across3 specs; B chain6 RED→6 GREEN. Full backend19 suites/107
  tests PASS (192.387s), build exit0. Updated checkpoint-orphan assertion6/6
  PASS. Compiled module graph excludes A blockchain/indexer/evidence/controllers.
  Nest DI/bootstrap with live B identity PASS, nextCampaignId0, DB connections0,
  no server listener. Config/DB/storage guards run before connections.
- B1 verification found two tooling issues: Jest's existing CommonJS setup needs
  a mock for ESM ConfigService (same pattern as the repository's origin test);
  compiled tools must resolve from backendRoot, not process.cwd(). Fixed and
  verified module/bootstrap. No dependency version or A entry point changed.
- WSL restarted externally during this run: authoritative process inventory
  showed no B supervisor/node and the original Windows handle was absent.
  Recovered B from preserved native state via the existing launcher; same
  genesis/address/deploymentId/code/anchor verified, no redeployment/clock change.
  Current B launcher18176 owns recovery. B2 draft/freeze/migration is next.
- B2 DONE:14 schema and4 plan/access tests observed behavioral RED, then18/18
  GREEN. Full backend21 suites/125 tests PASS,89.184s; build exit0. Owner-only
  gift drafts, optimistic revision, immutable exact UTF8/SHA256 freeze, per-stage
  tasks/criteria/budgets and full deployment anchor identity; linked configured
  representative required. Frozen edit rejects, no unfreeze or authority from DB.
- New B PostgreSQL5434/DB fundtogether_workflow_b/volume
  fundtogether-workflow-b_workflow-b-postgres created from isolated compose.
  Applied0013 after preserving baseline synthetic users/memberships:14 total
  migrations,9 malformed-context/FK/unique/freeze constraint cases rejected,
  repeat migration preserves hashes/journal. Report `.local/workflow-b/migration-report.json`.
  Existing A MinIO9000 and application DB were not migrated or modified.
- Real DB draft smoke PASS for G1 goal2200000000 and G2 goal3300000000:
  OWNER/outsider, stale revision, foreign milestone, missing representative,
  stable milestone ID on update, freeze idempotency/read-only/reload and tamper
  rejection. Synthetic account register then ephemeral SIWE signer verified;
  no private key/password/session/signature printed or saved in report. No
  campaign submitted on-chain; this is not MetaMask/human acceptance. Report
  `.local/workflow-b/draft-report.json`; fresh fixtures retained on B only.
- Ruling B2: generated CHECK constraints initially contained bind placeholders
  for interpolated zero-address literals. Detected by inspecting generated SQL
  before migration; changed expressions to literal regex exclusions and
  regenerated only the unapplied0013 artifact/snapshot/journal. Applied SQL has
  no placeholders, and real constraint checks pass. Read-only GET does not take
  SELECT FOR SHARE locks; frozen-plan reload rebuilds canonical bytes against
  the entire current deployment identity.
- B3 implemented ADMIN verification/revocation with immutable report/validity,
  fresh RESOLVER role + SIWE wallet, OWNER/creator/contributor conflicts, exact
  evidence references, required document kinds, criterion outcomes/spent/unused,
  public report disclosure and live original/public hash checks before MET.
  Prepared reports are intents; they do not mutate financial projections.
- B4 implemented schema0.2 drafts, server-owned upload metadata, byte sniffing,
  freeze/revision serialization, canonical parent binding, separate redacted
  objects, private original ACL and canonical public downloads. B MinIO9100/9101
  uses its own volume/bucket; bucket-policy changes and unavailable storage
  prevent MET preparation. Remaining B4 verification includes supplemental
  version journeys and the richer neutral-ID reviewer corpus in I1/I2.
- Real B SIWE/DB/MinIO/chain review smoke PASS: synthetic campaign0 reached
  CHALLENGE_WINDOW after one2200000000-unit advance; no second transfer on MET.
  Verified fresh role/wallet/OWNER, revocation/expiry, concurrent save/freeze,
  MIME spoof, altered bytes, public/original ACL, storage outage, policy recheck,
  and HTTP-intent versus chain-state separation. Report
  `.local/workflow-b/review-evidence-report.json`. PDF/PNG are format probes,
  not independently labelled activity evidence or human/MetaMask acceptance.
- B5 implemented separate ADVANCE stream identity, transaction/advisory lock,
  canonical log validation, immutable duplicate audit, projection/checkpoint
  commit, reorg replay and live-campaign refresh on empty blocks. Real fork9548
  + DB rollback lab PASS: duplicate/restart, interrupted projection/end-hash
  rollback, branch replacement/orphan history, time/checkpoint refresh, and
  same-chain/same-address runtime deploymentId replacement fails closed.
  Source B9547 identity/head/campaign count preserved; fork process stopped.
  Report `.local/workflow-b/indexer-report.json`. This is an incarnation mutation
  test, not a claimed full fresh-node reset test; latter remains in I2 recovery.
- B6 verification: backend26 suites/151 tests PASS,127.402s and build PASS;
  OpenAPI32 paths generated from controller routes and runtime Zod schemas.
  HTTP/auth/action smoke now42 assertions PASS, including B cookie/origin,
  canonical checkpoint/state, indexer lag, synthetic submit/cancel, resolver
  access to an integrity-checked prepared public bundle, and private draft
  exclusion from the review queue. Report `.local/workflow-b/http-report.json`.
- F1/F2 implemented explicit B mode31338/5174/API3001, generated Orval client,
  ABI/policy/manifest commitments, G1/G2 gift wizard, revision reload and frozen
  plans. Organizer actions include submit/publish, exact-budget claim, return,
  finalize/timeout and cancellation before the first advance. Every signing
  path checks fresh account/SIWE, wallet RPC deployment, allowed function/args
  and simulation. Exact allowance is a separate click/receipt; pending hashes
  survive reload and stage changes through a scoped transaction history.
- F2 automated verification: six helper tests cover action/amount/actor/context,
  receipt/replacement/indexing and prior-stage/unused/case gates. A read-only
  real B RPC test verifies bytecode/policy and the actual campaign1 advance
  receipt amount/recipient/calldata; wrong bytecode and replacement calldata
  reject. Report `.local/workflow-b/frontend-wallet-report.json`. No extension
  or human signing is implied by these checks.
- F3 implemented per-criterion report/documents, USDC expenses with separate
  CAMPAIGN/ORGANIZER/OTHER sources, revision-safe upload/save/freeze, immutable
  package hashes and parent/version history, original downloads, separate
  redacted upload confirmation and on-chain evidence submission. Added an
  authorized prepared-publication read route so reload/review retains the
  committed public hash before MET. Missing evidence can be declared; file
  upload or unused-budget declaration never reports a financial transfer.
- Frontend F1–F3 milestone suite102 tests PASS; default A and explicit B builds PASS;
  lint PASS. Isolated Edge browser fixture14 checks PASS: G1/G2 counts/budgets,
  base-unit request, frozen/duplicate-submit/claim gating, revision conflict
  reload, mobile overflow and no React runtime errors. Screenshots inspected
  at `.local/workflow-b/ui-*.png`; checkbox sizing corrected after inspection.
  Browser API is mocked from synthetic B data; it is not a live/manual journey.
- F4–F6 implemented staff organization verification/history; resolver source,
  original/redacted, criterion and case review; public C/A/R/F/E and immutable
  reports; contributor case/material/organizer response; separate base/supplement
  refund rights. Current role/linked resolver wallet and account-scoped cache
  gates are visible; G1 custody0 and late-return rights are explicit.
- F4 API extension verification:26 suites/152 backend tests PASS, build PASS,
  OpenAPI34 paths and HTTP50 assertions PASS. Frontend112 tests PASS, lint PASS,
  A/B builds PASS. Edge mocked-API18 additional checks PASS for original/redacted
  review, ADMIN/RESOLVER gating, missing MET criteria, public storage outage,
  zero-base and late supplement/wrong-wallet refund, mobile overflow and no
  React runtime errors. Screenshots `.local/workflow-b/ui-review.png`,
  `ui-verification.png`, `ui-refund.png` inspected. These are automated fixtures.
- I1 integration: `node backend/scripts/workflow-b/journey-smoke.cjs` PASS on
  an owned loopback9548 fork, real Nest HTTP/auth/SIWE, DB transaction, MinIO,
  contract and indexer. G1 COMPLETED; G2 three stages COMPLETED with version2
  supplement after NEEDS_INFORMATION.38 receipts checked against calldata,
  actor, successful receipt, decoded events, canonical DB rows and checkpoint;
  token balances and C+R=A+F+E checked. Final acceptance sends no second payout.
  Report `.local/workflow-b/journey-report.json` includes gas/mining/indexer
  timings. Its receipts belong to the disposable fork, not persistent RPC9547.
- Journey lab cleanup verified DB outer rollback, deletion of only its uploaded
  storage objects, unchanged source campaign count/canonical block and stopped
  owned fork. Files are format probes, not a reviewer dataset. One intermediate
  run had a reverted unlocked-wallet submission; diagnostic receipt/gas capture
  was added and the complete rerun passed. Retain this as an integration concern
  while extending failure tests; do not infer extension behavior from this run.
- Added `start-services.ps1` and read-only `advance-manual-setup.mjs`. Start helper
  verified existing B containers/chain, migrations, API and frontend context;
  preflight PASS with API/private storage/indexer ready, no duplicate Anvil.
  API3001 and FE5174 are available. Handles/logs stay under `.local/workflow-b/`.
- I2 failure journey PASS:171 successful receipts/30 assertions and11 snapshots,
  including CONTINUE/RESUBMIT/STOP, late50+110 return, zero-base consumption,
  return before snapshot, supplement/funding timeout and tiny-unit claim orders.
  Contributions3/4 against base5 pay2/2; cumulative supplement2 pays0/1 and
  retains2 rounding units. Injected token balance0 causes a reverted refund;
  counters/rights are unchanged and restoration permits a single successful retry.
  Evidence `.local/workflow-b/failure-journey-report.json` and failure log.
- I2 waiting journey PASS:94 receipts/20 assertions across7 outcomes: first
  reviewer absent, advance unclaimed, execution evidence absent, reviewer absent,
  case opened just before challengeEnd then resolution timeout, MAX_VERSIONS3,
  and actual unused50 return required before COMPLETED. Early timeouts reject;
  equality boundaries stop with conserved funds. `.local/workflow-b/waiting-journey-report.json`.
  An earlier unlocked Anvil submission used all168824 gas despite a valid
  same-block eth_call. Harness now estimates gas with20% margin, stores estimate/
  limit/actual and checks each receipt. The94-receipt rerun passes; this is not
  an extension-wallet verification. Failure log preserved locally.
- Recovery PASS7 checks: cold Anvil snapshot restore, pg_dump/pg_restore into a
  new isolated database,20 original/redacted objects restored into a new private
  bucket, missing-object recovery, actual empty-chain reset rejection, RPC restart
  and indexer lag/recovery without duplicate state. Only owned lab node/DB/bucket
  removed; source B unchanged. `.local/workflow-b/recovery-report.json`.
- Startup/preflight and repeated synthetic seed PASS:5 accounts/SIWE roles,
  two editable G1/G2 drafts, donor mock-token funding; no duplicate accounts or
  reset of existing passwords. Credentials remain ignored. Runbook created at
  `docs/workflow-b-local-runbook.md` with runtime/identity/recovery/manual steps.
- Reviewer corpus v3 prepared:12 neutral IDs,142 PDFs/150 pages plus24 illustrative
  PNGs. All hashes/text bounds checked,17 representative pages rendered and
  inspected, labels kept outside reviewer folder. Historical dataset unchanged.
  Reviewer CSV has0 decisions. `reviewer-results.py` preserves incomplete samples
  and nonbinary-label exclusions;3 parser tests PASS. This is authored synthetic
  preparation, not independent reference validation or a human experiment.
- Controlled A/B comparison PASS:6 paths/138 receipts on fresh contracts in the
  owned fork; source A matches Git baseline, source hashes match compiler metadata
  (WSL dependency LF normalization recorded). Equal goals/budgets/donors/full-stage
  spending: G1 A requires4400 starting token capital versus B0; G2 A2200 versus B0.
  After stage2 lacks evidence, donor refund pool A2200/B1100. Protocol tx counts
  G1 A13/B12, G2 A21/B20; receipt gas and limitations in acceptance. No A RPC/DB/
  storage accessed. `.local/workflow-b/comparison-report.json`.
- Latest frontend suite113 PASS and lint PASS, including separate base/supplement
  receipt amounts. Live read-only Edge campaign1/API/storage check PASS, no React
  error/mobile overflow; screenshot inspected. No extension signed. Acceptance
  aggregator records8 automated reports and remains IN_PROGRESS; no human
  observations or independent accuracy rate are invented.
- Remaining: actual I3 MetaMask/user workflows (G1/G2/STOP/refund plus decline,
  reload/account switch/replacement/outage UX) and reviewer decisions against
  the neutral corpus. T01–T18 explicitly separate automated paths from missing
  human evidence; GOAL is not complete and no real-fund readiness is claimed.
- I3 handoff audit: updated the named G1/G2 example documents to link current
  HTTP/contract/storage evidence and neutral PDF/PNG preparation. Preserved their
  historical60/40 donor inputs and distinguished the integration50/50 inputs,
  avoiding mismatched refund expectations. Added a manual observation template
  to the runbook for wallet/UI/receipt/indexer evidence. Current reviewer CSV
  has60 blank criterion/overall rows and0 actual observations; no manual result
  or extension interaction has been supplied. Remaining work needs that input.

### 2026-10-09 — Historical BLOCKED workflow B; resolved by subsequent code-plan approval

- The same GOAL phase2 approval gate remained across three consecutive goal
  turns, including the turn that presented the completed code plan. Policy
  B-D01–B-D10 is approved; code-plan approval has not been received. The approval
  question already sent remains the required next user action.
- Rechecked the authoritative code plan: AWAITING_CODE_PLAN_REVIEW. B contract,
  backend/ABI and frontend implementation directories do not exist; T01–T18
  remain TODO and baseline HEAD is unchanged. The preceding turn refined and
  verified the plan; that progress did not grant permission to execute it.
- Preparation/source audit is complete for this gate. No independent required
  work remains that can advance implementation without bypassing the explicit
  review requirement. Goal is BLOCKED, not complete; resume execution from C1
  once the user approves the code plan. No product/runtime changes in this audit.

### 2026-10-09 — IN_PROGRESS workflow B; source audit of the pending code plan

- Revalidated GOAL phase2, policy approval and the current code-plan status:
  AWAITING_CODE_PLAN_REVIEW. The preceding turn made concrete documentation/
  audit progress; it did not supply user approval of the code plan.
- Source inspection found EvidenceModule imports BlockchainModule/IndexerModule A.
  Clarified B provider registration without that module and added a bootstrap
  isolation test to the plan, so importing storage does not launch A services.
- Current drizzle.config.ts defaults to DB A independently of Nest startup.
  Added an explicit guarded B migration config/wrapper, pre-connect URL/DB/port
  checks and tests to the plan. Reusing the generic migration command would not
  satisfy the isolation requirement.
- Verified current evidence table types support the shared report/expenses/files
  shape; specified B schema parsing and explicit version0.2 instead of an unsafe
  row cast or the default0.1. These are technical clarifications, not changes to
  approved financial rules or authority. No product code/runtime was changed.
- Implementation remains pending the required code-plan review; C/B/F/I and
  T01–T18 have not been completed. Goal remains active.

### 2026-10-09 — IN_PROGRESS workflow B; policy approved, code plan ready for review

- User approved the presented B-D01–B-D10 package: “được hãy tiếp tục gói
  B-D01-B-D10 đi”. Marked the B specification/financial rules
  APPROVED_FOR_LOCAL_PILOT and aligned research direction, overview, delivery
  plan and G1/G2 status. This does not modify A obligations or authorize real funds.
- Added [the concrete implementation plan](./workflow-b-code-plan.md): C1–C6,
  B1–B6, F1–F6 and I1–I3, with files, contract signatures/events, deployment
  identity, typed API, migration, permissions, storage/indexer and validation.
  Dedicated B chain31338/RPC9547, DB/storage and API3001/FE5174 are planned;
  they are not running services created in this turn.
- Inspected current auth/schema/config: localhost cookies are shared across
  ports, so the plan explicitly includes B session-cookie isolation with A's
  existing cookie name as the default. Existing ADMIN performs organization
  verification; no new staff or on-chain authority is introduced.
- Verified installed Forge and Anvil1.8.4 with read-only WSL version commands.
  Document audit passed 138 local links, all21 code tasks and all10 policy IDs;
  exact SHA-256/byte-size audit passed all195 fixture references in12 packages.
  Git whitespace check passed; baseline HEAD is unchanged.
  No contract build/test, ABI generation, migration, deployment, service launch,
  transaction, application DB/storage mutation or product-code edit was performed.
  Frozen DRAFT dataset bytes/hashes remain historical preparation artifacts.
- Next: code plan review required by GOAL.md phase2, then direct execution of
  C→B→F→I in this chat. B policy approval is complete; implementation and T01–T18
  automated/manual/research acceptance remain TODO. No goal completion is claimed.

### 2026-10-09 — IN_PROGRESS workflow B; preparation ready for policy review

- Read GOAL.md, research direction, delivery plan, current source and v0.2
  evidence material. Executed the authorized preparation phase in this chat,
  without subagents; B funds/authority implementation remains gated by review.
- Added G1/G2 plans, checklists and synthetic evidence variants; offline Node
  tooling writes two plan/criteria commitments, a DRAFT policy, 12 original/public
  package pairs with SHA-256 byte hashes, separate rubric labels and eight bigint
  accounting traces. There are 198 generated files (201,362 bytes); regeneration
  is deterministic and different frozen bytes are rejected rather than replaced.
- Added workflow-b-spec.md and workflow-b-financial-rules.md with the proposed
  B-D01–B-D10 policy, finite deadlines/version/case limits, final acceptance without
  payout, actual-return accounting and fixed base plus cumulative supplement pool.
  Every financial/authority decision is still PENDING, not inferred as APPROVED.
- Verified `node --test backend/scripts/workflow-b/fixtures.test.cjs`: 14 PASS,
  0 FAIL after RED→GREEN. Generator completed with 12 packages/eight traces; Node
  v24.21.0. Backend regression `npm.cmd test -- --runInBand`: 16 suites/96 tests
  PASS (198.134 seconds). These are tooling and existing-source tests, not B E2E.
- Generated JSON/SVG files are synthetic lab inputs, not production upload DTOs
  or field photos. Key names reveal variants; neutral-ID bundles and independent
  labels/reviewer trials remain TODO. Original/public folders are not storage ACLs.
- Added workflow-b-acceptance.md with T01–T18 TODO and explicit test boundaries.
  No B contract/deployment/ABI/migration/FE/BE runtime integration, service reset,
  wallet signing, money movement, build or Foundry suite was performed. Baseline
  HEAD remains b1881bd2cb3d6a4413605b06741624e86e2323da; no application chain/DB/storage
  mutation was performed.
- Next: user review of the written spec/financial proposal, then a concrete code
  plan review as GOAL.md requires. Full goal and manual MetaMask acceptance remain
  incomplete; no real-funds readiness or outside-world verification is claimed.

### 2026-10-09 — DONE drafting the six-step workflow B delivery plan

- User requested a detailed plan. Added `workflow-b-delivery-plan.md` with two
  synthetic gift campaign outlines, ten policy decisions, contract/BE/FE tasks,
  fund invariants, eighteen acceptance cases and explicit gates before code.
- Read current direction, proposal, implementation boundaries and v0.2 material.
  This records a DRAFT plan, not approved financial rules or completed features.
  Implementation and experiment results remain TODO; no product/runtime changes
  or test suites were run for this planning task.

### 2026-10-09 — DONE recording gift distribution as the first campaign type

- User explicitly clarified that buying/distributing gifts is one charitable
  campaign type and other types may be supported later. Recorded this in the
  first-read research direction, gift-workflow proposal and project overview.
- Distinguished activity type, individual/institution distribution and one/many
  funding stages. Gift-specific checklists must not define every campaign;
  adding a type needs evidence/completion rules and any financial effects reviewed.
- MVP still focuses on gifts. No application, contract, schema, dependencies or
  generic workflow engine changed. Checked document consistency and whitespace;
  no builds or test suites were run for this documentation update.

### 2026-10-08 — DONE recording user choice of staged funding (flow B)

- User chose staged funding before execution and evidence review before releasing
  the next stage, prioritizing organizer usability over the capital burden of
  reimbursement. The user identified verification business rules/workflow as core.
- Recorded this design direction, remaining decisions and fund limitations in
  research-direction.md; aligned overview and the business-validation pointer.
  It is not a complete financial specification or proof of optimal risk/usability.
- Contracts, financial baseline, deployed state and application code are unchanged.
  Bond removal, payout size, admission/review/challenge conditions and recovery
  details remain to be specified. No builds or test suites were run.

### 2026-10-08 — DONE recording NCKH direction and first-read instructions

- User explicitly asked to retain the discussed research direction and prioritize
  reading it before reasoning or deciding. Added `research-direction.md` with the
  proposed title/objectives, the complete six-item form content, expected outputs,
  flexible scope and open business decisions.
- Root AGENTS.md and skills/AGENTSKILLS.md now require that first read. Overview
  and the business-validation plan point to the direction. Existing baseline
  bond/accounting/payout rules, contracts and application behavior are unchanged.
- Verified document content, links and Git whitespace checks. This records the
  direction only; user studies, labelled datasets, comparative experiments and
  browser acceptance remain TODO. No builds or test suites were run for this
  documentation-only update.

### 2026-10-07 — DONE authorized test campaign/chain reset and MVP deployment

- User explicitly permitted discarding test campaign/chain data without a new
  data backup and required keeping accounts. Application services were already
  stopped. Removed only active old chain snapshot files and created fresh local
  Anvil 31337; old recovery directories were not used or modified.
- Deployed MockUSDC and FundTogetherMvp on 8545 using current Foundry artifacts.
  Generated manifest/ABI now include MVP milestone/recovery policies, a new
  random deployment ID, genesis and mined deployment anchor. Contract addresses
  happen to repeat because the fresh Anvil uses the same deployer/nonces; identity
  is new. No campaign rights or balances were migrated from the discarded chain.
- Explicitly truncated the 13 campaign/evidence/projection/indexer tables without
  CASCADE. Compared complete row-content hashes inside the transaction and after:
  all 4 users, 1 organization/member, 1 platform-role row, 6 wallet links, 1 auth
  session and auth challenge state remain unchanged. No identity table was cleared.
- Minted exactly 10,000 MockUSDC to each of the 6 linked local wallets. Verified
  after clean save/restart: every balance matches, nextCampaignId is 0, escrow is
  0, and code hashes/genesis/policy/deployment ID match the new manifest. Native
  supervisor validated autosaves through block 78; saved state has 8 transactions
  and is approximately 5.7 MB. Interval mining remains 5 seconds.
- Foundry build and backend build succeeded; Foundry emitted existing lint
  warnings. FE returns 200; backend /health returns 200 and /public/campaigns
  returns an empty list with indexer ready at 117/117 and error null. Backend runs
  compiled output in the background; FE and supervised Anvil run in the background.
  No test suites or MetaMask workflow acceptance were run.
- TODO infrastructure: Docker Desktop fails at its Secrets Engine stale socket;
  official start/restart/stop attempts did not restore its engine. Automatic
  review rejected manual process termination/socket deletion. MinIO is offline:
  4 old evidence objects remain unreferenced, with their IDs recorded in ignored
  `.local/mvp-reset-20261007/evidence-objects-to-remove.json`. DB evidence is empty;
  new evidence upload cannot be accepted until MinIO is running. No Docker volume
  was reset and no Docker secrets were deleted.
- Updated current deployment statements and manual-test prerequisites. Historical
  A/B and isolated C results do not prove browser acceptance of this deployment.

### 2026-10-07 — DONE snapshot EOF recovery; autosave latency remains TODO

- Reproduced startup rejection: native `state.json` ended mid-string at byte
  426,259,324 in `historical_states`. No Anvil was listening on 8545. Preserved
  the exact original in native `recovery-20261007-eof/truncated.json` before
  recovery; the old port-conflict diagnostic did not describe this failure.
- Recovered the complete latest core at block 2996 with 39 saved transactions.
  Retained 1,703 complete current historical entries and recovered 1,162 more
  from the validated block-2688 backup. The resulting 2,865 historical entries
  are incomplete history; recovery does not establish that unsaved work survived.
- Verified the candidate on isolated port 9546 with mining disabled: chain ID,
  genesis and both deployment code hashes match; all 39 saved receipt block
  hashes/numbers and all 88 stored contract/token slots match. Stopped only that
  temporary node, atomically installed the recovered snapshot and started the
  normal launcher on 8545 in the background. No reset, redeploy, transaction,
  manifest change or clock synchronization was performed.
- Startup now uses a Python supervisor in Ubuntu: Anvil writes a pending file;
  an independent, fully parsed copy is fsynced and atomically promoted, retaining
  the previous valid snapshot. Files changing during copy, truncated files and
  snapshots with older/mismatched heads are rejected. A supervisor lock prevents
  concurrent launchers. Missing/corrupt saved state fails closed with a useful
  diagnostic. Windows backup copying also uses a temporary file.
- Nine focused Python tests pass, including truncated input, interrupted
  replacement, concurrent source writes and chunk boundaries. PowerShell parses
  successfully. No application or contract test suite was run for this recovery.
- Observed two live validated promotions at blocks 3008 and 3021; `.previous`
  retains the preceding complete snapshot. On the production local port, all
  18 saved account balances/nonces and 39 receipt block hashes also match.
- Live API, frontend and MinIO return 200. Indexer resumed at 3004/3004 with
  error null; canonical events remain 43 and campaign projections remain 4.
  Chain time is about eight hours behind host time; deadline acceptance and
  new wallet transactions were not tested or asserted ready.
- TODO: reduce full-history autosave latency without sacrificing historical
  reads. During a later dump, 5-second RPC checks timed out; the node recovered
  without intervention and indexer reached 3029/3029 with error null. Atomic
  saves protect the canonical file from partial writes, but do not eliminate
  Anvil's serialization stalls. Historical state has not been pruned.

### 2026-10-07 — DONE local startup clock warning and authorized forward sync

- Startup now distinguishes clock drift from RPC/deployment/mining failure.
  After identity and advancing blocks are verified, the mining helper returns
  exit code 2 for drift over 60 seconds; the PowerShell launcher warns and
  successfully reuses the node. Actual verification failures still stop startup.
  Clock synchronization remains explicit; startup does not silently change time.
- Verified the launcher with the restored clock about 15 hours behind the host:
  it warned, preserved chain time and exited successfully. User then explicitly
  approved forward synchronization. Ran the existing --sync-clock action and
  verified the launcher again without a drift warning. Final measured drift was
  1.316 seconds. Existing deadline values remain unchanged; elapsed deadlines
  become eligible, but their state transitions still require contract calls.
- Deployment genesis and contract/token code hashes match the manifest. All 4
  campaigns' contributions, bond amounts and states match the recovery inventory.
  No reset, redeploy or financial transaction was performed.
- Backend was no longer listening on port 3000 during the final check. Started
  one backend watch process in the background; API /health and /public/campaigns
  return 200. Indexer is ready at block 2787/2787 with error null; canonical events
  remain 43 and campaign projections remain 4.
- JavaScript syntax and PowerShell parsing checked; both startup paths and live
  API/RPC state verified. No test suites or browser workflow tests were run.
  README explains the warning versus startup failure behavior.

### 2026-10-07 — DONE runtime recovery: empty Anvil caused indexer identity failure

- Diagnosed the running Anvil command without --state: RPC responded but head
  was block 0, genesis differed from the manifest, and contract/token code was
  empty. Backend startup succeeded; indexer correctly retained its old checkpoint
  instead of treating the new node as the existing deployment.
- Native Ubuntu state remained intact at saved block 2688 (620,123,987 bytes).
  Copied it to `~/.local/state/fundtogether/anvil/recovery-20261007-indexer/state.json`
  and verified matching SHA-256 before recovery. Recorded pre-recovery indexer
  inventory in ignored `.local/indexer-recovery-20261007/before.json`.
- Rechecked the empty node and exact process command, stopped it gracefully,
  then launched the existing state-aware PowerShell script in the background.
  Active state stays on native Linux; 60-second autosave and 5-second mining.
  No manifest/ABI change, redeploy, DB reset, clock synchronization or financial
  transaction was performed. Backend recovered without restart.
- Verified restored chain ID/genesis and contract/token code hashes against
  the manifest; all 4 campaigns' financial fields/states match the pre-recovery
  projections. All 21 transactions referenced by canonical indexed events have
  successful canonical receipts. Canonical event count stays 43; projections 4.
- API /health and /public/campaigns return 200; indexer is ready at block
  2704/2704 with error cleared. Native autosave updated successfully before the
  final API check. This is runtime recovery evidence, not a new browser workflow
  test or a claim that unsaved transactions can always be recovered.
- README now explains the empty-node identity warning and saved-state recovery.

### 2026-10-06 — DONE documentation: consolidation direction and research plan

- Added business questions B01–B08, concrete expected outputs, a decision-record
  template, hardening work H01–H05 and evidence-based exit criteria.
- Compared the v0.2 pre-verification exposure/bond rationale to current
  post-evidence settlement: organizer working capital and the purpose of a
  no-slash bond are explicit research issues, not proven business benefits.
- Aligned README, overview, scope, protocol/state/financial/verification docs
  and v0.2 entry points. Clarified prototype versus separately tested MVP,
  legacy verifier/atomic-bond behavior and outstanding browser/operations checks.
- Corrected the documentation-only custody equation to avoid counting refund
  obligations and the tokens backing them twice; corrected the donation event
  name to DonationReceived. No financial rule or implementation was changed.
- Inspected source/config and existing verification records. No test suites,
  service restarts, database/storage edits, chain reset/deploy or transaction
  were performed. Business research and operational acceptance remain TODO.
- Documentation checks: 131 local file/heading links across 11 edited/new
  documents resolve; UTF-8 and code fences checked; scoped git diff --check passes.

### 2026-10-06 — Local Anvil/WSL RPC recovery

- DONE: diagnosed unresponsive Ubuntu execution, Windows RPC timeouts and
  MinIO timeouts. Kernel logs include Anvil OOM termination at roughly 7 GiB RSS
  with exhausted swap. Restarted only Ubuntu after copying and hash-checking
  the 544,261,641-byte state into ignored
  `.local/anvil/recovery-20261006-193432/`; Docker storage recovered.
- Restoring the complete state recovered RPC and receipts, but a historical
  autosave to `/mnt/c` stalled RPC again for tens of seconds. Gracefully stopped
  Anvil and migrated the latest complete state to native Ubuntu storage:
  `/home/dell/.local/state/fundtogether/anvil/state.json`. No snapshots, accounts,
  blocks, transactions, contract storage or deployment metadata were removed.
- DONE: `start-local-chain.ps1` now imports the Windows backup on first native
  start, keeps active snapshots on Linux, saves every 60 seconds, and copies
  back to `.local/anvil/state.json` after a clean exit when the launcher continues.
  Mining remains every 5 seconds with mixed mining; the native file is the
  authoritative active state. README records the new path and backup semantics.
- Verified chain ID/genesis and contract/token code hashes match the existing
  manifest. All 39 saved transaction receipts and 88 contract/token storage slots
  at saved block 2495 match the pre-migration copy. All four campaigns remain;
  backend, MinIO and public campaign API return 200 and indexer is ready.
  Across 80 seconds spanning a native autosave, all 40 RPC probes succeeded
  (maximum latency 64 ms) and head advanced from 2500 to 2514.
  PowerShell syntax parsing passes. Recovery measurements are in the ignored
  recovery directory; no application transaction or deployment was sent.
- The restored chain clock is about 9 h 51 min behind the host. Recovery did
  not call `evm_setTime` or change campaign deadlines; deliberate clock sync
  remains a separate action because advancing time changes deadline eligibility.

### 2026-10-06 — DONE source and isolated verification: MVP milestone lifecycle

- Connected the approved resolver-only, no-slash policy through FundTogetherMvp,
  canonical indexing, authenticated API/storage and FE actions. Existing
  prototype/8545 manifest and campaign obligations remain unchanged; no live
  reset/redeploy or financial test transaction was performed.
- Immutable public evidence requires explicit organizer redaction confirmation,
  complete locked criteria and separate uploads. Download/admission validates
  manifest/file SHA-256; restricted originals require an independent SIWE-linked
  resolver and create access logs. Canonical submitted version history is readable.
  Migration 0012 adds publication/record/access tables and was applied locally.
- Version-bound submission, challenge and settlement entrypoints reject an old
  wallet confirmation after evidence/version changes. Existing contract entrypoints
  preserve prototype behavior. FE checks call targets, receipt signer, canonical
  block and exact action events, including challenge version/hash plus donor/reason.
  Indexed completion is separate from receipt; pending/replaced hashes survive reload.
- Resolver reuses `#/internal/milestones`. Campaign/workspace panels show next
  actor, required wallet, chain deadlines, budget/bond and blocking reasons.
  Preparation enforces current state/version, account relationships and SIWE links.
  Old deployment plans cannot break the current queue; failed RPC/indexer/identity
  or corrupt evidence is an explicit error, not signing authorization.
- Verified: 200 Foundry tests in 15 suites, including 31 MVP tests, fuzz 1024
  and stateful invariant 128 runs x 128 calls; backend 96 tests in 16 suites;
  frontend 88 tests, build/typecheck and oxlint; timeout worker 8 unit tests.
  Builds pass. Vite still reports large wallet/entry chunks; no bundle optimization
  or production performance claim is made in this slice.
- Isolated MVP smoke passes 467 real HTTP/SIWE/PostgreSQL/MinIO/receipt/index
  checks: sequential settlement, CONTINUE/RESUBMIT/STOP/timeout, role/version
  denial, private-original isolation, immutable public packages, damaged storage
  and manifest, partial refund with retained dust, pull bond, replay and reorg.
  Actual local worker survives injected RPC outage; an unknown-send intent is
  retained without resending; restart does not duplicate; wrong identity halts.
- Prototype regression was rerun after the version guards: publication/indexer
  202 checks and refund 377 checks pass. Read-only verification confirms active
  genesis/contract/token code hashes still match the original 8545 manifest;
  milestone smoke accounts are fully removed (count 0). No user accounts or
  campaigns were deleted.
- Remaining: real MetaMask popup/rejection/account-change/reload verification;
  continuous or multiple keeper operation; a separately planned application MVP
  deployment after inventory of prototype escrow/data. Current prototype campaigns
  do not gain MVP case recovery. This is not Arc or real-funds readiness.
  See [milestone lifecycle](./milestone-lifecycle.md) and the updated
  [manual testing guide](./manual-test-from-campaign.md).

### 2026-10-06 — DONE real Case B funding failure and refund verification

- Read the user's actual campaign 3 (`real case b`) without sending transactions:
  chain state is FUNDING_FAILED, contributions/pool 134 MockUSDC, released 0,
  donor claimed flag true, remaining organizer bond 0.
- Claim receipt at block 373 is successful and canonical; its hash matches the
  screenshot (`0x9c6a2884b7c9eed0f0be3b71912f1f58862aa8558526ab224a87a19265052a86`).
  Matching ERC20 transfer pays exactly 134 to the contributing donor. Historical
  token balance increases 9644 -> 9778; entitlement and aggregate refund paid
  both equal the pool (134), leaving no unclaimed amount/dust in this campaign.
- Chain and DB each contain one canonical RefundClaimed event for campaign 3.
  Indexed finalization/snapshot/bond return are at block 369, claim at 373;
  projection has chainState 4 and bondAmountUnits 0. No live replay was issued.
- Read-only simulations reject claimRefund again (`refund already claimed`),
  repeat finalization and additional donation (`invalid state`). These are
  contract-call simulations, not second signed transactions with gas spent.
- This verifies the actual single-donor Case B journey. It does not establish
  multi-donor rounding/replay stress coverage or complete the pending Case C
  milestone/evidence integration.

### 2026-10-06 — DONE expired funding label on campaign detail/journey

- Detail header and next-step panel now display `Đã hết hạn · chờ chốt thất bại`
  for FUNDING when the verified workflow timestamp reaches its deadline.
  Labels before expiry and terminal labels are unchanged; no machine-clock
  eligibility, financial state override, DB update or transaction is introduced.
- Live API for real case B returns FUNDING with expired workflow and ready sync.
  Finalization remains an explicit wallet transaction in the refund panel.
- Frontend build/typecheck, oxlint and whitespace checks pass. Browser rendering
  and the user's signed finalization/claim have not been verified in this slice.

### 2026-10-06 — DONE local clock recovery; Case B transaction verification pending

- Real campaign `b55ade53-f865-42d3-accf-64a28ea81834` is FUNDING with
  134/166 MockUSDC. Funding deadline is 2026-10-05 20:21 UTC; chain block 37
  was only 19:28:29 UTC. Its donation logs were before that chain deadline.
  Windows and WSL agree on UTC; no post-deadline contract acceptance was proven.
- Existing Anvil was running the old command with automining and no interval.
  Enabled 5-second interval mining in place after validating deployment identity;
  no node restart, reset, balance update, deadline update or financial transaction.
  Block advancement resumed, but block 109 was still 19:41:03 UTC while the
  machine was 20:36:57 UTC. Interval mining alone does not fix this clock drift.
- Added identity-checked local repair script and reuse of the existing RPC in
  startup. Default repair detects clock drift and fails explicitly. Forward-only
  synchronization to machine UTC requires `--sync-clock`, because elapsed
  deadlines become effective. User approved forward synchronization; it was run
  without reset. Block 173 was 20:42:46 UTC against machine 20:42:47 UTC.
- Campaign journey warns about a local clock over a minute behind the machine;
  donation expiry explains the finalization/refund step. Financial eligibility
  remains based on chain timestamps. Underfunded expiry needs a successful
  finalizeFundingFailure transaction and indexing before FUNDING_FAILED/claims.
- Backend/frontend builds, frontend typecheck/oxlint, JS/PowerShell syntax and
  whitespace checks pass. Read-only simulation at block 179, after the deadline,
  rejects donate with `deadline passed`; finalizeFundingFailure simulates
  successfully from a donor address. Active API returns HTTP 200 with expired
  workflow and ready checkpoint 179/179. No financial transaction was sent.
  Donor `0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc` has contributed 134 MockUSDC;
  expected funding-failure pool/claim is 134, organizer bond 166 handled separately.
  Actual signed finalization, receipt/indexed terminal state and claims remain
  pending; the complete Case B journey is not marked DONE.

### 2026-10-05 — IN_PROGRESS active API restart: donation blocked by stale response

- Read the real TEST-A campaign (`e35891f7-a793-4d0c-8a2a-85841b0b018e`):
  API 3000 returns HTTP 200 with campaign/sync only, ready at block 19/19.
  Missing workflow was incorrectly presented as indexer waiting and disabled
  donation despite the funded donor wallet. This is a running API version mismatch.
- Current compiled backend was opened on a temporary port with its indexer
  disabled, read the same data and returned campaign/workflow/sync, HTTP 200,
  FUNDING, contributed 0, goal 220 MockUSDC and a chain time before the deadline.
  Temporary API and its DB client were closed; no donation or projection write.
- Public detail now rejects the old response with an explicit backend restart
  message. DonatePanel also distinguishes missing workflow from actual syncing.
  The active API on 3000 still needs a restart; no current deployment/DB reset is
  needed. This verification does not claim extension approve/donate succeeded.

### 2026-10-05 — IN_PROGRESS browser verification: wallet linking wait recovery

- Prepared connector client is read under an 8-second bound before reporting a
  signing request; nonce reads have a 20-second bound. SIWE uses the prepared,
  explicitly selected connector/account rather than repeating connector reads
  inside the signing wait. The 90-second signature wait now shows a countdown.
- Added stop-waiting/unmount abort, disconnect/change-wallet and session linkage
  recheck. Abort/timeout does not cancel an extension request or release its
  duplicate-request lock early; a late signature cannot advance wallet linking.
- Removed the generic default Browser Wallet option; named Brave/MetaMask/Rabby
  options and discovered wallets remain. Existing generic connections have a
  notice explaining how to select the intended provider. Another-account errors
  no longer incorrectly instruct every user to choose a resolver wallet.
- Frontend build/typecheck, oxlint and whitespace check pass. Behavioral tests
  were not added/run in this slice; actual extension popup, rejection, crash and
  cancel/retry behavior still require browser verification. No wallet link, DB
  data, deployment or live service was modified by these checks.

### 2026-10-05 — IN_PROGRESS verification: difficult financial failure cases

- New MVP terminal transitions credit organizer bond without a token call; only
  that organizer claims separately. Bond rejection cannot block donor snapshots.
  SafeERC20 false/revert preserves bond/refund rights and counters. New source
  requires a public deployment ID; different IDs change runtime code identity.
- Added O(1) paid/claimed-contribution counters and refundAccounting. Remaining
  escrow is not final dust until every contributor consumes their claim; zero
  payouts count, no expiry/last-claim bonus/sweep/recipient reassignment.
- Added bounded local timeout worker with chain time, state/version guards,
  simulation, durable intent/hash and canonical confirmed receipt/event checks.
  It uses unlocked Anvil callers, no private key/resolver authority. Dry run is
  default; no worker was launched or signing enabled.
  Local startup adds 5-second interval plus immediate transaction mining, so idle
  chain timestamps progress; watch mode retries outages and halts on identity drift.
- New manifests/plans/streams/wallet checks bind the mined deployment block;
  indexer rechecks identity before commit. Legacy stream/pending keys remain
  compatible. Deployment tooling archives old metadata and refuses to replace
  escrow still holding tokens; isolated MVP output uses .local, not app config.
- Prepared false/revert, independent rights, deposit rollback, deployment identity,
  large-value/one-unit dust fuzz, anchor mismatch, timeout-boundary and full-reset/
  pre-commit drift regressions. No behavioral suite/smoke was run; the user requested
  combined verification after the four items.
- Contract and all 28 prepared MVP test cases compile (runtime 21,942 bytes,
  below the 24,576-byte limit). Backend/frontend builds, frontend oxlint,
  backend typecheck including spec files, JS/PowerShell syntax and whitespace
  checks pass. Compiler timestamp/event-analysis and Vite chunk warnings remain;
  this is not an audit or behavioral test pass. No DB migration, live chain
  reset/deployment or service restart was performed. This is not Arc readiness.
- Remaining: bond-credit/claim UI/indexed history, item 3 evidence/case integration,
  live worker failure/restart checks and real-token issuer freeze/recovery
  qualification. See [financial recovery](./financial-recovery.md).

### 2026-10-05 — DONE policy / IN_PROGRESS integration: MVP milestone completion

- User approved option A in [the completion specification](./mvp-milestone-completion.md):
  the existing resolver admits evidence and handles one final case per version;
  no separate verifier, appeals or slashing in MVP. Response is 7 days, resolution
  another 7 days. CONTINUE preserves the original review; RESUBMIT requires a new
  version/admission/72-hour review; STOP/timeout refunds unreleased donor escrow
  and returns bond separately without penalty.
- Added `FundTogetherMvp` for a new deployment. Legacy assigned-verifier entrypoints
  revert even with role grants; case identity, material/response hashes, fixed
  deadlines and decisions are on-chain. Resolver cannot be organizer or a wallet
  with contributions in that campaign. Existing sequential release, snapshot,
  individual claims and atomic transfer rollback are reused.
- Prepared contract regression cases for admission, role bypass, deadline equality,
  case replay, version bounds, all outcomes, partial-release refunds, single
  settlement and transfer rollback. `forge build` compiles source and prepared
  tests; frontend build/oxlint and whitespace checks pass. Runtime bytecode is
  20,927 bytes (below EVM's 24,576-byte limit). Compiler timestamp/event-analysis
  warnings remain; this is not a security audit. Behavioral execution is deferred
  until the user's combined verification run.
- TODO: readable redacted evidence packages, resolver storage access and organization
  conflict checks, decision/response records, generated ABI/deployment capability,
  case indexing and signing UI. This entry does not mark the full journey DONE.
- No deployment, database migration, live ABI replacement or chain reset in this
  slice. Current prototype campaigns do not acquire the new contract behavior.

### 2026-10-05 — DONE: Campaign state guidance and refund transaction UX

- Added public workflow facts at one canonical indexed block and checked its hash
  before/after reads. Projection mismatch, missing checkpoint and orphaned blocks
  fail explicitly. Public responses contain no linked-wallet refund entitlements.
- Public and organizer campaign pages show the next actor/action, required wallet,
  chain deadline and remaining time, checkpoint clock and snapshotted refund pool.
  Active evidence, review and challenge states explicitly describe current MVP
  limitations instead of offering unsupported actions. Internal scroll buttons
  preserve the hash router.
- Donation, milestone activation and refund buttons use specific eligibility
  reasons: account/wallet link, chain, organizer authority, deadline, amount,
  token/gas balance, snapshot, contributor entitlement, prior claim and cancellation
  acknowledgement. Each wallet's refundable amount stays account-scoped. A funded
  campaign disables donation input/button with its state reason even before login.
- Added the four-stage transaction tracker: wallet request, submitted hash,
  verified receipt and indexed event. Approval is shown separately from donation.
  Activation completion also matches the canonical indexed activation hash.
  Receipt/index lag offers an explicit read-only recheck without another signature;
  existing pending-hash persistence and on-chain preflight checks are preserved.
- Verified 79 backend tests, 79 frontend tests, both builds, frontend oxlint and
  `git diff --check`. Refund smoke passes 377 real HTTP/transaction/accounting
  checks; publication/indexer regression passes 197. Tests use disposable Anvil
  9545 and scoped fixtures; no deployed contract, ABI or schema change is required.
- Browser checked the real funded campaign anonymously using a temporary API on
  3100 (indexer disabled) and frontend on 5175: correct organizer, milestone 1,
  chain deadline and disabled donation reason. Layout checked at 1280px and 390px;
  neither exceeded viewport width. Preview processes/tab were stopped and viewport
  restored afterward. Authenticated extension signing remains manual.
- The existing API on 3000 still needs a restart to load the new build. Automatic
  approval review rejected stopping/restarting its process (`blocked by policy`),
  so the user was asked to restart it. Preview verification does not imply that the
  original API process has loaded the changes. Application Anvil 8545 remains at
  block 11 with its original hash and campaign in `FUNDED`.

### 2026-10-05 — DONE: Refund accounting and replay hardening checks

- Added a stateful Foundry harness with 16 contributing wallets and three
  campaigns sharing one token. Interleaved claims, duplicate/non-donor rejection,
  failed-transfer retry, another campaign's donations/cancellation/refunds and
  unsolicited tokens preserve per-wallet entitlement bounds, immutable snapshots,
  recorded contribution/claim flags and escrow conservation after every action.
- Added randomized proportional-refund checks for 2–32 contributing wallets,
  arbitrary claim order, partial releases, outstanding obligations and dust.
  Added a full-precision overflowing-product case and a 2-versus-128 donor claim
  gas regression. Existing rollback, callback/reentrancy and timeout tests remain.
- Strengthened the isolated refund smoke: rewind its own checkpoint and reread
  logs three times at each of three lifecycle stages; compare event identities,
  canonical contribution/refund counts and sums, financial projections, donor
  history and refund rights. Covers two independent workers, restart, orphaned
  claim removal/reclaim and an injected failure after event upserts that rolls
  back writes/checkpoint before retry. Projection observation blocks may advance
  during replay; that is not a financial or history change.
- Fixed the MVP documentation policy: floor in base units, no claim expiry,
  no last-claimant bonus and no admin sweep; dust stays in escrow indefinitely.
  `P = successful payouts + unclaimed entitlements + rounding dust`. UI explains
  this distinction and no longer describes a zero entitlement as depletion by
  other donors. No numerical dust field, donor loop or on-chain counter was added.
- Verified the full Foundry suite: 169 tests across 14 suites, 1,024 runs per fuzz
  test; stateful invariants ran 128 sequences of depth 128 (16,384 handler calls),
  zero unexpected reverts. The disposable Anvil 9545 smoke passes 199 real
  HTTP/SIWE/PostgreSQL/transaction/accounting checks. Backend 73 tests and frontend
  67 tests pass; both builds and frontend oxlint pass. Vite's existing large-chunk
  warning remains.
- Production contract bodies, ABI, deployment and database schema were unchanged.
  Read-only before/after checks confirm the application chain 8545 stays at block
  11 with the same hash and public campaign response (`FUNDED`). Test fixtures were
  cleaned up and the isolated chain stopped. No redeploy/reset or application
  transaction was performed. Browser extension signing remains a manual check;
  these results are regression coverage, not production certification.

### 2026-10-05 — Campaign list grouped by workflow stage

- Campaign management now has three sections with counts and empty states: Bản nháp, Đã chốt hồ sơ, Đang công khai. Legacy unassigned drafts appear inside Bản nháp and contribute to its count. Milestone navigation and campaign detail/edit routes are unchanged.
- Public grouping reads the existing account-scoped publication query, shared with campaign cards and refreshed every ten seconds. Human approval alone does not move a campaign to Public. Loading/errors explicitly explain that publication classification is still being checked; frozen entries remain accessible for retry and continuation.
- Published cards include a link to the public campaign page. Create, delete, submission, approval and financial authorization continue using the existing APIs and wallet flows.
- Verified frontend TypeScript/Vite build and oxlint. No behavioral tests or authenticated browser interactions were performed in this change.

### 2026-10-05 — Unified fundraising management dashboard

- Replaced the separate personal dashboard with the same shell used for organization management. `#/workspace`, organization list/profile and existing organization workspace URLs share Campaign/Milestones/Evidence navigation, a current-organization selector and same-tab links.
- New campaign creation uses the selected organization. Existing personal drafts remain visible under “Bản nháp chưa gắn tổ chức” in Campaign, with read/edit/delete and the existing explicit organization-copy/submission path. Opening these drafts keeps the selected organization context; no database records, ownership, wallet links or funds were changed.
- Removed the hidden personal dashboard mounted behind public pages. Shared query keys stay account-scoped and the management component remounts on account changes. A deleted legacy draft clears its new detail cache as well as the list.
- Prepared-but-unsubmitted campaigns now have an explicit frozen-dossier label rather than the ambiguous “Chưa tạo trên chain”. Updated navigation/onboarding documentation.
- Verified frontend TypeScript/Vite production build and oxlint. Authenticated browser navigation, organization switching and legacy edit/delete remain unverified; no behavioral tests were added or run for this change.

### 2026-10-05 — Private draft deletion (browser confirmation pending)

- Added `DELETE /campaigns/:campaignId` with strict expected-revision validation, personal-organizer/current-OWNER authorization, campaign row locking, membership recheck and atomic soft deletion. The shared access predicate hides deleted drafts and blocks subsequent campaign/evidence/private-file access.
- Lists/details expose revision and `canDelete`; the same SQL predicate protects status, chain identifiers, immutable submissions, projections, reviews, linked replacement history and frozen evidence. No migration, contract change or storage purge.
- Personal and organization lists/details show an explicit title-specific confirmation. Duplicate clicks, changed revisions/accounts and uncertain HTTP outcomes are handled; successful deletion refreshes scoped lists and clears detail/evidence caches.
- Verified backend/frontend builds and frontend lint; read-only service queries against the current database return `canDelete: false` for `dfa` (published) and `dsadfa`/`cxzc` (submission-prepared). Existing user data and files were preserved. Behavioral tests and authenticated browser deletion were not run in this slice. See [draft deletion](./draft-deletion.md).
- Restarted the local backend with the new build: health is `ok`, OpenAPI exposes the DELETE route and the existing public campaign remains `FUNDED`.

### 2026-10-05 — IN_PROGRESS: Refund lifecycle (browser signing pending)

- Added authenticated `/refunds` and `/refunds/:metadataId` reads scoped to SIWE-linked account wallets. Pool, entitlement and claimed status are checked against one canonical indexed block and matching snapshot/claim events. No database migration, ABI change or contract accounting change is required.
- Public campaign detail now supports donor `claimRefund`, organizer cancellation while funding, permissionless funding-failure finalization and current activation/evidence-timeout finalization. `#/contributions` shows wallet-specific rights and canonical refund history. Zero-rounded payouts, separate bond return and native gas requirements are explained.
- Wallet actions verify fresh session links, connector/address/network, both RPC deployment identities, live campaign/deadline and simulation. Pending/replacement/late hashes survive reloads; cancellation/revert, confirmation and indexing are distinct. A receipt must match its campaign, wallet/amount or milestone; indexed completion also matches the canonical transaction. Account changes cannot reuse cancellation acknowledgement or fetch private rights into the previous account cache.
- Verified: 141 real HTTP/SIWE/PostgreSQL/transaction checks in `backend/scripts/refund-lifecycle-smoke.cjs` on disposable Anvil 9545. Covers two donors, repeated donations, cancellation/bond separation, expiry, receipt/index lag, ownership, double/non-donor rejection, replay, backend restart, reorg recovery, partial refunds after release, zero rounding and dust. The fixture used existing verifier contract methods only for prior-settlement accounting; separate verifier UX remains post-MVP.
- Verified: 43 existing Foundry refund/timeout tests (including transfer-revert rollback and fuzz cases), 73 backend tests and 65 frontend tests pass. Backend/frontend builds and frontend lint pass. Updated the frontend SSR test harness to include the required account provider and refreshed two old text assertions; production review/workspace behavior is unchanged by those test adjustments.
- Regression check: the existing publication/indexer smoke also passes 197 HTTP/transaction checks on its disposable chain, including roles, approval/publication, replay, concurrent indexing, restart, RPC/database failures and reorgs.
- Restarted local API; `/health` succeeds and `/refunds` rejects unauthenticated access with 401. Read-only public API still reports the user's campaign as FUNDED, 12 MockUSDC, indexed block 11, ready. Existing application chain, deployment and data were preserved.
- TODO: actual browser extension signing/reload/replacement interactions. Dust destination, persistent token-transfer recovery and challenge/misconduct financial outcomes remain unresolved. See [refund lifecycle](./refund-lifecycle.md) for the manual check; use a new partially funded campaign rather than the current funded campaign.

### 2026-10-05 — IN_PROGRESS: Freeze before milestone activation

- Fixed the evidence freeze gate: a funded campaign's current pending milestone may freeze its private package before activation. An active current milestone may also freeze before its evidence deadline; stale, completed or mismatched milestones remain rejected by the backend.
- The user deferred the separate verifier workflow to post-MVP. The current contract still requires an assigned `VERIFIER_ROLE` wallet to admit submitted evidence, so the MVP on-chain milestone completion path needs a separate fund-safety decision. No contract transition or fund custody rule changed in this fix.
- Backend and frontend builds and frontend lint pass. The restarted API reports healthy. Read-only chain inspection confirms campaign 0 is `FUNDED` (3), current milestone 0 is `PENDING` (0), version 0 and no evidence deadline; its saved draft has 2 documents and 2 outcomes for 2 criteria. A signed-in browser freeze has not yet been performed.

### 2026-10-05 — IN_PROGRESS: Frozen evidence package

- Added an authenticated organizer-only freeze action for a saved milestone evidence draft. It checks the approved campaign plan, live milestone state and deadline, and every private original's stored SHA-256 before storing the exact UTF-8 manifest bytes and hash in `campaign_evidence_packages`.
- The organization evidence page now shows missing inputs, the indexed milestone state, and the latest frozen revision/hash. The organizer can download the exact manifest bytes after authorization and stored-hash verification. The freeze action does not send a blockchain transaction or expose private originals publicly.
- Applied additive migration `0011_dashing_kabuki.sql`. Backend and frontend builds and frontend lint pass; the restarted API responds to `/health`, the new table exists, and the protected package and manifest routes return 401 without a session. Authenticated browser freeze remains unverified. On-chain evidence submission remains TODO while the MVP completion path is unresolved.

### 2026-10-05 — Live funding completion and milestone activation

- Confirmed campaign `26738756-8093-49d2-a9e6-50332d4cc7ba` reached its 12 MockUSDC goal on chain in block 11. One transaction emitted `DonationReceived` and `FundingFinalized`; the public API is indexed through block 11 and reports `FUNDED`. The contract holds 24 MockUSDC: 12 contributed and 12 locked bond.
- Milestone 0 remains `PENDING`, and its activation deadline is 2026-10-12 08:58:47 UTC. The organization campaign page now offers organizer-signed `activateMilestone` with deployment, wallet, plan, chain-state and deadline checks, transaction recovery, receipt-event matching, and indexed-state confirmation.
- Frontend production build, TypeScript and lint pass. A read-only simulation of `activateMilestone(0, 0)` from the organizer wallet succeeds against the live local chain. Organizer wallet signing and the live activation transaction are still pending; activation does not release funds.

### 2026-10-05 — Explicit evidence upload action

- DONE: choosing a file now validates and selects it locally. The organizer
  clicks `Thêm chứng cứ` to upload with the selected document kind. A failed
  upload retains the selection; success clears it and refreshes the saved list.
  Existing PDF/JPEG/PNG, 10 MiB and 20-document limits remain enforced.
- Verified frontend TypeScript/Vite build and oxlint pass. Vite still reports
  large bundle chunks. Live browser upload was not exercised in this change.

### 2026-10-05 — Contract source modules

- DONE: extracted `FundTogetherBase`, `FundTogetherFunding`,
  `FundTogetherMilestones` and `FundTogetherEvidence` under `contracts/src/modules`.
  `FundTogether.sol` now composes these modules; `FundTogetherConfigured` stays
  the token-restricted deployment boundary. One deployed escrow, shared storage,
  AccessControl and ReentrancyGuard preserve custody and authority.
- DONE: retained all 28 existing function/constructor bodies verbatim. Updated
  eight test files for enum declaration paths and three instance-based
  `abi.encodeCall` references; assertions and scenarios are unchanged.
- DONE: Solidity 0.8.24 build and all 165 tests across 13 suites pass before and
  after extraction (256 runs per fuzz test). Compared both targets against
  artifacts captured from the working tree immediately before the refactor:
  ABI encoding/selectors, storage slots/offsets/types (20/21 entries), immutable
  offsets and runtime bytecode excluding compiler metadata are unchanged.
- Enum ABI `internalType` labels now reference `FundTogetherBase`; compiler
  metadata and therefore full bytecode hashes change. No deployment, manifest,
  generated integration ABI, database or financial policy change was performed.
  Existing lint warnings, CHALLENGED recovery and permanent token transfer
  failure limitations remain. FE/BE builds were outside this verification.

### 2026-10-05 — MockUSDC donor flow

- Added donation controls to indexed public campaign detail: linked donor wallet, token/gas balance, exact allowance, `approve` only when needed, `donate`, receipt/event check, pending hash recovery, and canonical indexed confirmation. The UI rechecks deployment, wallet identity, campaign state, deadline, and remaining goal before signing.
- Added authenticated `/contributions` history for SIWE-linked wallets from canonical `DonationReceived` events. The page now displays indexed donations; refunds remain TODO.
- Frontend build, TypeScript and lint pass; backend build passes. Restarted backend and confirmed `/health` 200, anonymous `/contributions` 401, and published campaign API remains ready at block 8. Native donor wallet signing and a live donation have not yet been performed.

### 2026-10-05 — Approved campaign visibility

- Confirmed local campaign `26738756-8093-49d2-a9e6-50332d4cc7ba` is indexed as APPROVED at block 7, with bond locked and no publication transaction. The public feed correctly remains empty until organizer publication is indexed.
- Personal workspace now lists submitted organization campaigns with their indexed review/publication state and a direct campaign link. The organization list shows "Đã duyệt · chờ công bố" and "Mở để công bố" instead of stale `awaiting_review` metadata; detail explains that its on-chain status is checked in the publication panel.
- Frontend build and lint pass. No organizer publication transaction was sent by this change.

### 2026-10-05 — Confirmation recovery audit

- A newly submitted campaign had a saved human approval (reviewer abc@gmail.com)
  and on-chain campaign 0 in bonded DRAFT, while the resolver account had no
  SIWE-linked wallet. The review page now exposes the missing link step as an
  action with an explicit recheck button; detail refetches on return. This is a
  required authorization precondition for signing `approveCampaign`, not a
  missing contract action. The user must still sign the SIWE message and later
  the approval transaction in MetaMask.
- Account guidance now flags when the connected browser wallet differs from the
  configured resolver and offers a disconnect button before choosing MetaMask.
  The cross-account wallet-link error is explained in Vietnamese. Confirmed in
  the current DB that the organizer owns 0x7099...79c8 and the resolver wallet
  0xf39F...92266 is not linked to the new resolver account. Frontend build and
  lint pass; the user still must approve the MetaMask connection and SIWE signature.
- Replaced unbounded transaction/network-switch wallet waits with a 90-second
  UI timeout and a connector lock that lasts until the extension request settles.
  Late transaction hashes are persisted; they require explicit reconciliation
  rather than automatically continuing to another wallet prompt.
- Recheck the active account, address, chain and connector before each prompt;
  leaving the screen stops later prompts and stale session updates. Verify the
  wallet's own RPC genesis and contract/token code, in addition to the app RPC.
- Preserve cancellation replacement markers with pending hashes across receipt
  timeouts/reloads. Account UI disables repeated linking of an already linked
  wallet; submission plan query cache is scoped to the application account.
- Frontend build and lint pass. Live backend health is OK and indexer is ready
  at block 2/2. Native MetaMask confirmation and these recovery cases still need
  verification through the user's extension; no user transaction was signed.

### 2026-10-05 — New local deployment after database cleanup

- Deployed freshly built MockUSDC and FundTogetherConfigured on the reset Anvil
  chain; both deployment receipts succeeded. Generated shared ABI/manifest now
  advertise atomic submission. Resolver remains the Anvil address ending 92266.
- Addresses repeat because the local deployer nonce restarted, but deployment
  identity is new: genesis is `0x5c9db063266c0e809a48728aa5ec67c86edd9b4985eea071b6bd804f4bccdf5f`
  and the contract runtime hash changed. No old submission was rebound; count
  before deployment was zero after user-authorized cleanup.
- Added `backend/scripts/start-local-chain.ps1`: load/save ignored
  `.local/anvil/state.json`, autosave every five seconds, preserve historical
  states, quiet output. Updated the startup command in README.
- Verified a real Anvil stop/restart after deployment: genesis, block 2 hash,
  deployment receipt, contract/token code hashes and resolver were preserved.
- Rebuilt/restarted backend. `/health` and `/public/campaigns` return 200;
  indexer is ready at block 2/2. Read-only review service check grants
  `abc@gmail.com` access with RESOLVER and returns an empty queue; organizer has
  no resolver access. Resolver signing still requires the new account's SIWE
  wallet link and the user's explicit transaction signature.
- Frontend TypeScript/Vite build also passes with the refreshed shared deployment;
  the existing bundle-size warning remains.

### 2026-10-05 — User-authorized local database cleanup

- Backed up the configured local PostgreSQL database's `public` and `drizzle`
  schemas to `C:\Users\dell\.codex\backups\FundTogether\before-db-reset-2026-10-05T06-00-50.769Z.dump`;
  custom archive is readable by pg_restore (43,835 bytes).
- Cleared all 16 inspected FundTogether application tables in one transaction.
  Schema and all 11 migration rows remain. Accounts, sessions, roles, linked
  wallets, organizations, drafts, submissions, reviews and old chain projections
  were removed at the user's explicit request.
- Restarted backend; `/health` returns 200. Follow-up counts confirm all user,
  organization and campaign/event tables remain empty. The indexer regenerated
  one operational stream row for the configured deployment.
- The current Anvil chain has no deployed application contracts. Deployment
  manifest and blockchain state were not modified by this database cleanup;
  creating a new deployment remains required before submitting new campaigns.

### 2026-10-05 — Wallet-link waiting feedback

- The link form now shows nonce loading, the named wallet asked to sign, and
  backend verification. It pins the selected connector when requesting a
  signature and explains resource-unavailable wallet responses.
- Verification: frontend build/lint and 57 existing tests pass, including the
  stage-order assertion; isolated auth HTTP/PostgreSQL smoke passes 40 checks.
- Native MetaMask signature popup remains unverified. Live user challenges are
  present; no user signature was fabricated or user wallet link inserted.
- Follow-up read confirms `abc@gmail.com` now has the verified wallet link for
  `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266` on chain 31337 alongside its prior
  linked wallet. The agent did not create this link; the native popup was not
  observed directly.
- Application Anvil is now block 0 with a changed genesis and absent deployment
  bytecode. Deployment recovery is pending the user's decision; the database and
  manifest remain unchanged by this diagnostic/fix.

### 2026-10-04 — Staff roles and minimal internal campaign review

- DONE: user explicitly moves committee 2/3 to post-MVP. Current scope/spec and v0.2 learning material record this decision; older progress entries below preserve history.
- DONE: migration 0010 applied. ADMIN/RESOLVER are separate application permissions; existing account `huyteenpast10@gmail.com` provisioned with both via the local operator script. Its configured resolver wallet is not yet SIWE-linked, so review access remains denied until that proof exists.
- DONE: `#/internal/campaigns` queue/detail/history, technical checklist, human acknowledgement/reason, immutable approval/request-changes/reject record with reviewer/version/dossier hash/checked block. Approval intent alone does not change chain or publication state; fresh authorization precedes signing. Self/organization review and revoked roles are denied.
- DONE: organizer sees decision/reason. Any submitted unpublished DRAFT/APPROVED campaign can be cancelled by its organizer using the existing contract, including expired or unwanted submissions. A confirmed, indexed cancellation with zero bond enables one linked replacement draft; retries reuse it. Old submission remains unchanged and the next draft has a distinct on-chain key. Saved approval cannot authorize a new signature after chain-time expiry.
- Verification: backend build; 13 suites / 65 tests; frontend build/lint and 33 tests; 180 isolated Anvil/HTTP/PostgreSQL checks, including role vs wallet authority, ADMIN-only denial, revocation, conflicts, reason/hash validation, concurrent duplicate review, expired approval denial, actual bond return, pre-index cancellation denial, idempotent revision, frozen-plan preservation, reject authorization and existing indexer failure/reorg cases.
- Isolated test data and owned port-9545 chain cleaned up. User port-8545 chain preserved. Existing frontend bundle-size warning remains. Manual MetaMask signing is not yet verified.
- TODO: donor donation/refund UI and indexed history; evidence/challenge response/re-verification and a financially defined resolver dispute exit. This campaign review slice is complete; the full MVP remains IN_PROGRESS.

### 2026-10-04 — Confirm resolver responsibilities and verification before review

- DONE (design/docs): user confirms resolver participation in MVP. Authorized staff may review campaign dossiers after system checks/corrections; approval is required before organizer publication. System eligibility alone is not campaign approval.
- DONE (design/docs): evidence and challenge each pass verification. Organizer response/corrections and re-verification precede resolver arbitration of unresolved or deadline-escalated cases. A challenge does not automatically route straight to arbitration.
- Updated protocol, scope, authority/workflow, state-machine targets, financial authority, integration guides and v0.2 source/learning examples. The earlier 2-of-3 direction is for dispute arbitration; it is not automatically campaign admission. Appointment, stage deadlines, appeal/fallback and verdict financial rules remain open.
- Current code remains unchanged: local campaign approval/publication/indexing exist, but complete dossier verification/reporting, campaign request-changes/rejection/resubmission and the disputed milestone path remain TODO. Earlier implementation entries below are historical evidence, not proof of the whole confirmed workflow.
- Verification: documentation consistency, Markdown local-link targets and diff whitespace checked. No application tests/builds run for this documentation-only change.

### 2026-10-04 — Resolver approval, organizer publication and durable local indexer

- DONE: SIWE-linked resolver authorization, bonded DRAFT queue/detail, wallet approval at #/review, organizer publication in campaign detail, and public indexed feed/detail. Backend never signs these transactions.
- DONE: migration 0009 applied locally. Deployment-scoped checkpoints, canonical/orphan event ledger, campaign projections, bounded confirmed-block polling, PostgreSQL advisory locking, atomic writes, duplicate replay, restart/catch-up and hash-based reorg rebuild.
- DONE: public visibility requires a canonical CampaignPublished event and verified frozen metadata/key association. Unpublished cancellation stays private; published cancellation remains public history. Errors/rebuilds return 503; frontend hides stale cached rows.
- Review found and fixed: unbonded direct review access, rebuild suppression lost after transient errors, stale campaign IDs after reorg, and orphaned pending-hash recovery. Wallet authorization compares the complete fresh identity; current block-pinned mapping/financial fields/budgets/criteria/bond and block hash are checked before signing.
- Verification: backend build and 12 suites / 55 tests; frontend build/lint and 26 tests; 134 real isolated-Anvil/HTTP/PostgreSQL checks; existing campaign submission smoke rerun with 32 checks. Includes two independent workers, database/RPC rollback, mid-batch fork, interrupted multi-batch rebuild, privacy/mismatch cases and restart. Whitespace checks pass. Existing frontend bundle-size warning remains.
- Isolated port-9545 test process stopped and temporary data/functions removed. The port-8545 application chain was not reset. Existing submission smoke leaves cancelled test campaigns as on-chain history. Live API returned 200 with a ready checkpoint at block 52 and no published application campaigns.
- TODO: real MetaMask signing through the full journey, donor donation/refund and indexed history, evidence freeze/on-chain submission/review/challenge, and outstanding financial recovery cases. Full MVP remains IN_PROGRESS; production finality/Arc deployment are outside this slice. See [publication/indexer](./campaign-publication-indexer.md).

### 2026-10-04 — Linked wallet information in account page

- DONE: each verified account wallet displays its full address, copy action,
  configured network/chain ID and native balance. Reads use the stored address
  and chain, independently of the connected browser wallet. No signing required.
- DONE: RPC loading/error, unsupported-chain and clipboard-error states; manual
  balance refresh and 30-second polling. Errors are not displayed as zero.
  Account-scoped query keys and component keys isolate cached data/UI state.
- Local Foundry transport explicitly uses IPv4 loopback with an eight-second
  timeout and no transport retry. Anvil reports chain 31337 and native balances.
- Verification: frontend build/lint pass. Component render checks cover address,
  network, loading, live RPC balance, zero, error, unsupported chain and account
  cache isolation. Interactive browser refresh/copy remains unverified; existing
  bundle-size warning remains. Backend and financial contract code unchanged.
- MockUSDC balances await a configured token deployment. Donation/refund history
  remains a separate journey. This wallet view does not display organizer bond.

### 2026-10-04 — Contract timeout, bounded retries and terminal refunds

- DONE: reproduced the old testFuzzRejectedVersionsRetainHistory failure, then
  replaced its 1-8 rejection assumption with MAX_SUBMISSIONS. It now verifies
  retained history, intermediate escrow/bond custody and the final FAILED state,
  refund snapshot and separate bond return. Production contract code is unchanged.
- DONE: added 24 timeout tests in FundTogetherTimeout.t.sol, including ten fuzz
  tests. Covers deadline-minus-one/exact/plus-one for activation, initial evidence,
  admission and correction; delayed/unassigned expiry; reassignment without
  extending admission; fresh assignments; all mixed rejection/expiry sequences
  across three versions; stale versions; terminal and repeated-call guards.
- DONE: financial checks cover all four failure paths after an earlier release,
  proportional claims for two donors in either order, rounding including zero
  entitlements, unchanged snapshots, unsolicited tokens and campaign isolation.
  Failed bond transfers roll back termination/last decisions; failed refund
  transfers preserve the claim for retry. Callback tests reject nested timeout
  and refund calls during bond return.
- Verification: focused verifier/timeout run passed 44 tests before the final
  two additions. Full forge test --summary --fuzz-runs 1024 passed all 153 tests
  across 12 suites, zero failures/skips. All 14 fuzz tests ran 1,024 cases each.
  Time advances use deadline getters and vm.warp; production durations unchanged.
  forge build, focused forge fmt --check and git diff --check pass; existing
  production timestamp/loop/event lint warnings remain.
- BLOCKED RECOVERY CASE CONFIRMED: if the organizer permanently cannot receive
  the bond token, atomic termination reverts and donor refunds cannot open.
  Separate bond recovery remains TODO; this test slice does not change that rule.
- Challenge/resolver recovery, deployment, shared ABI, campaign binding, evidence
  freeze and indexing remain TODO. No FE/BE code changed or tests rerun in this
  slice. Next: decide and implement bond recovery independently of donor refunds,
  then complete the pending dispute path before claiming full MVP readiness.

### 2026-10-04 — Organization representative wallet

- DONE: optional stored wallet link on organizations, additive migration 0006
  applied locally. Existing organizations stay unbound; creation needs no wallet.
  Creator plus current OWNER membership may select a verified wallet owned by
  that creator on the specified chain.
- DONE: PUT /organizations/:id/wallet validates body/session/Origin. Row locking
  serializes initial picks; same selection is idempotent and replacement is 409.
  Foreign/unverified wallets, other OWNERs and revoked membership are denied.
  No on-chain authority or funds move; publication/campaign binding is pending.
- FE: list/profile displays the stored wallet; profile provides explicit selection
  from verified account wallets, account-link shortcut and refresh/error states.
  Current MetaMask connection is not the saved value.
- Verification: smoke failed before implementation; after migration backend build
  and 32 tests/10 suites pass. New wallet smoke: 32 HTTP checks; campaign smoke: 22;
  evidence/PostgreSQL/MinIO smoke: 63. All fixtures removed. Frontend lint/build
  and diff whitespace check pass; bundle warning remains. Live OpenAPI exposes
  the new route. Interactive browser/MetaMask selection remains unverified.
- Wallet replacement, unlink/recovery and on-chain campaign binding are outside
  this slice. Details: backend-step-6-organization-wallet.md. Next: contract
  timeout, rejection/retry and terminal-refund verification.

### 2026-10-04 — Root onboarding README

- Added root README with dependencies/submodules, env setup, Windows PostgreSQL
  service/database/migrations, Docker MinIO/bucket initialization, manual WSL
  Anvil, FE/BE startup, current UI journeys and development verification commands.
- Included ports, common errors and stopping services while retaining storage.
  Explicitly states no automatic contract deployment, no completed donor/indexer
  journey and no need for Anvil for metadata flows.
- Commands cross-checked against current package scripts/configuration; WSL --cd
  resolves the repository contracts directory correctly. No dependencies
  reinstalled or implementation tests rerun; clean-machine onboarding has not
  been performed.

### 2026-10-04 — Contract return readiness review

- Rechecked the milestone identity transaction lock and upload verification
  script. Fresh backend build, 25 tests/nine suites and 63 HTTP/PostgreSQL/MinIO
  checks pass. The smoke script confirms removal of its temporary objects/rows.
- Returning to contract work is appropriate for bounded timeout/rejection/retry
  verification. Browser evidence interaction is still unverified; package freeze,
  commitment hashing, on-chain identity/version mapping and indexing remain
  separate integration work.
- Fresh existing Foundry suite: 128 passed, one failed across eleven suites.
  testFuzzRejectedVersionsRetainHistory bounds rejection rounds to 1–8 and expects
  unchanged escrow/bond balances, conflicting with MAX_SUBMISSIONS=3 and terminal
  failure/bond return. No contract source or tests changed during this review.
- Next: update that test to cover approved bounded retries and terminal outcomes,
  add deadline boundary/expiry/reassignment tests, then verify proportional refunds,
  rounding, failed transfers, repeat calls and campaign isolation after releases.
  Timeout financial runtime verification remains IN_PROGRESS. No deployment or
  full BE/FE/contract integration is claimed.

### 2026-10-04 — Evidence journey verification and milestone identity

- DONE: evidence creation requires milestoneId from campaign detail and validates
  campaign/index/ID under the parent campaign lock. Missing milestone returns 404;
  stale/foreign ID returns 409 MILESTONE_CHANGED. FE sends the ID and offers an
  explicit campaign reload on identity conflicts while retaining entered input.
- Fixed duplicate evidence creation: the PostgreSQL 23505 code is wrapped in
  DrizzleQueryError.cause, which previously escaped as 500; it now maps to 409.
- DONE: evidence-upload-smoke.cjs passes 63 real HTTP/PostgreSQL/MinIO checks with
  two accounts. It verifies permissions/revocation, exact PNG bytes/hash, MIME and
  size rejection, file quota, metadata integrity, persisted edits/login, stale
  milestone IDs and races between plan edits/creation, report saves and uploads.
  Losing upload objects and all test-created objects/accounts/rows are removed.
- DONE: backend build and 25 unit tests across 9 suites; frontend build/lint pass.
  Browser interactions and PDF/JPEG acceptance remain unverified. Process-crash
  reconciliation remains TODO. Financial state/contracts were unchanged.
- Next: review and complete the remaining contract state transitions before
  freeze/submission/indexer integration.

### 2026-10-04 — Local MinIO and private evidence upload

- User selected local MinIO. Docker Desktop started; unavailable registry images
  were replaced by a local image built from the pinned official source commit.
  MinIO runs on loopback ports 9000/9001 with persistent volume, non-root process
  and generated credentials stored only in ignored backend/.env.
- Implemented authenticated multipart upload and original download. Limits:
  PDF/JPEG/PNG, 10 MiB/file, 20 files/draft. File signature, size and SHA-256 are
  checked/computed server-side. Originals use private storage and opaque IDs.
- Upload appends a document and increments the draft revision conditionally on
  revision/access. Failed append attempts object cleanup. Draft create rejects
  supplied document metadata; PATCH cannot replace immutable uploaded metadata.
- Connected upload/download controls to saved milestone evidence. Unsaved report
  changes block upload to prevent form loss; revision conflicts require reload.
- MinIO build/start and live health 200 verified. Private bucket initialized with
  no anonymous policy. Backend/frontend builds and frontend lint pass; live
  OpenAPI lists both routes. No tests were added/run in this slice.
- IN_PROGRESS: authenticated upload/download and negative/race verification.
  Public redaction, storage reconciliation after crashes, expense/link editors,
  freeze and submission remain TODO. Setup is documented in backend step 5.

### 2026-10-04 — Organization milestone evidence UI

- Implemented campaign/milestone selection in the evidence section and direct
  evidence links from campaign detail. URLs use saved milestone IDs; the API
  index is taken from that milestone, with no manual index input.
- Report editor loads existing drafts or starts a new draft on the explicit
  draft-not-found response. It supports report summary, work dates and criterion
  outcomes, preserving existing expense/document metadata and references.
- Saves use POST/PATCH and expectedRevision. Errors retain input; 409 blocks
  another save until the user explicitly loads the latest saved version, with
  confirmation before replacing input. Account changes clear evidence cache.
- Frontend build/lint passed. No tests were added/run in this slice. Authenticated
  browser create/edit/reload and conflict behavior remain IN_PROGRESS.
- Upload, expense editing, freeze and submission remain separate next slices.
  Backend milestone identity validation during concurrent campaign-plan edits
  before the first evidence save also remains pending.

### 2026-10-04 — Organization campaign detail/edit and API verification

- DONE: organization campaign list/create/detail/edit routes reuse the campaign
  wizard. Detail includes ordered milestones and acceptance criteria; the
  Milestones view selects a campaign. URL routes retain the selected campaign
  on reload. Save errors preserve input and edits use expectedRevision.
- DONE: frontend build/lint and backend build pass. Three focused unit suites
  pass nine tests. The organization campaign smoke script passes 22 real
  HTTP/PostgreSQL checks with two accounts, covering OWNER access, outsider
  denial, creator denial after membership removal, persisted edits, stable
  milestone IDs and stale revision rejection. Its temporary rows were removed.
- DONE: git diff --check passes. No contract or financial behavior changed.
- IN_PROGRESS: authenticated browser interaction verification and organization
  evidence UI. API checks do not establish browser behavior or concurrent lock
  behavior. Next connect evidence drafts to the selected campaign milestone.

This file records verified implementation progress. A documented idea is not
marked `DONE` until a command, test, transaction or projection provides
evidence.

## Current milestone

### 2026-10-04 — Organization profiles in user area; campaign operations in workspace

- Corrected UX boundary: My organizations and #/organizations/:id profile stay
  in the user area/current tab. Cards offer View profile and Manage campaign;
  only the management action opens a separate organization workspace tab.
- Removed profile overview from workspace navigation. Bare workspace routes open
  Campaign by default; profile links return to the user-area profile route.
- Connected organization campaign listing/creation to organization-scoped APIs
  using the existing title/milestone/review wizard. Personal creation behavior
  is preserved. Organization campaign cache keys include user and organization
  IDs and are cleared on account changes.
- Frontend build/lint and git diff --check passed. No tests added/run; live
  authenticated profile display and campaign save/reload remain unverified.
  Campaign detail/edit and milestone/evidence management remain next slices.

### 2026-10-04 — Local backend route reload

- Diagnosed Cannot GET/POST /organizations: the listening backend process was
  serving a previously loaded dist build without organization routes.
- Restarted that backend as npm run start:dev from backend/. Nest compiled with
  zero errors and registered organization and organization-campaign routes.
- Health returned 200; unauthenticated organization and organization-campaign
  reads now return 401 Authentication required rather than 404. OpenAPI includes
  both routes. Authenticated organization creation remains unverified.

### 2026-10-04 — IN_PROGRESS: Organization campaign ownership backend

- Added campaign organizationId/createdByUserId FKs and organization index.
  Migration 0005 preserves personal ownership, copies known personal creators
  for audit history and does not assign existing drafts to an organization.
- Added authenticated POST/GET /organizations/:organizationId/campaigns using
  the existing strict planning schema. OWNER membership is required; creation
  checks/locks membership and inserts campaign/milestones in one transaction.
- Personal listing excludes organization drafts. Campaign detail/update and
  evidence create/read/update use organization membership for organization
  campaigns and legacy personal ownership for null organizationId. Creator
  audit fields never bypass membership. Revision/edit restrictions remain.
- Migration generated, additive SQL reviewed and applied to local PostgreSQL;
  backend build and git diff --check passed. No tests were added/run and HTTP
  authorization, rollback and concurrent ownership behavior remain unverified.
- Frontend campaign integration, representative wallet, publication and indexer
  remain pending. See [backend step 4](./backend-step-4-organization-campaigns.md).

### 2026-10-04 — Corrected organization workspace navigation

- My organizations now stays in the current tab. Each organization card opens
  its own #/organizations/:id/workspace in a separate tab, preserving the source.
- Added OrganizationWorkspace shell: membership-scoped profile lookup, selected
  organization name, sign-in/nonmember/error states and URL-based navigation for
  overview, campaigns, milestones and evidence. Native Back/Forward operates on
  these hash routes; no history blocking is introduced.
- Organization financial/draft sections are explicit pending capabilities.
  Existing user-owned campaigns are not shown as organization-owned data;
  personal #/workspace remains accessible until backend linkage is implemented.
- Frontend build/lint and git diff --check passed. No automated tests or live
  authenticated organization workspace interaction were run for this slice.

### 2026-10-04 — Resolved local Vite blank-page startup

- Reproduced blank root/organization pages: Vite connected and served source
  modules with HTTP 200, but React did not render and no startup error appeared.
  Existing dependency optimizer metadata retained the removed Privy package.
- Restarted the verified frontend Vite process with npm run dev -- --force
  --host localhost --port 5173 --strictPort, rebuilding dependency cache.
- Browser reload then rendered the public feed and anonymous organization page,
  including sidebar, login prompt and return link. Earlier visual verification
  blocker for these anonymous pages is resolved. Authenticated organization
  creation/listing and mobile layout remain unverified.
- WalletConnect emitted a connection-interrupted rejection; it did not prevent
  page rendering and wallet interaction was not exercised in this fix.
- No product-code changes or automated tests were needed for cache recovery.

### 2026-10-04 — Organization navigation in a separate browser tab

- Public and workspace organization links now use target=_blank with
  noopener/noreferrer and a visible new-tab indicator. The original user tab
  stays open; the organization route has a return link to the user feed.
- Native Back remains scoped to the current tab's history; no cross-tab history
  is fabricated and no browser navigation is blocked.
- Frontend build/lint and git diff --check passed. No browser interaction or
  automated tests were run for this navigation change.

### 2026-10-04 — IN_PROGRESS: My organizations frontend

- Added #/organizations and links in public/workspace navigation. Authenticated
  accounts load organization lists and submit name/description via existing
  cookie-authenticated Axios; anonymous accounts see a login prompt.
- Added client validation, pending/error/empty states, retry for list failures,
  input preservation on failure and cache update/refetch after successful create.
  Query keys include userId and account changes clear organization queries.
- Frontend build and lint passed; git diff --check passed. Vite returned HTTP
  200, but in-app browser visual inspection showed a blank page without console
  errors. Authenticated create/list and mobile UI remain unverified.
- No tests added/run. Campaign linkage, invitations and wallet representation
  remain outside this frontend slice.

### 2026-10-04 — IN_PROGRESS: Minimal organizations and OWNER membership

- Added organizations and organization_members tables, composite membership
  primary key, user lookup index and OWNER-only role constraint. Existing
  accounts, wallet links and campaigns remain unchanged.
- Added authenticated POST /organizations and GET /organizations. Creation
  accepts strict validated name/description only, derives creator from session,
  and atomically inserts the organization and its OWNER membership. Profiles
  start unverified. Listing filters by authenticated account membership.
- Generated 0004_organizations migration, inspected its additive SQL, applied
  it successfully to local PostgreSQL and completed npm run build successfully.
  git diff --check passed. No tests were added/run and authenticated HTTP
  requests were not exercised; runtime authorization/rollback remains unverified.
- Frontend, invitations, editing, further roles, verification, representative
  wallets and campaign organization linkage are outside this slice.
- Learning guide: [Organization backend step](./backend-step-3-organizations.md).

### 2026-10-04 — MVP review and next integration decisions

- Planning estimate: approximately 40–45% of full MVP implementation. This is
  not a measured completion metric or an end-to-end verification result.
  No complete organizer/donor/failure journey is recorded as verified yet.
- Indexer remains TODO: empty module, no log worker, durable checkpoint or
  chain-derived public API. Proposed first slice is NestJS/Viem/Drizzle,
  campaign publication and donation events, transactional deduplication,
  restart/catch-up and chain-specific finality/reorg handling.
- Wallet connection permissions are controlled by the wallet, application roles
  by backend authorization, and financial caller permissions by contracts.
- Initial ERC20 allowance UX uses the intended donation/bond amount and skips
  approval when allowance is sufficient. Receipt success and confirmation are
  required before proceeding; donate/bond and indexing remain separate stages.
  This frontend transaction journey is not implemented.
- Next dependency-ordered work: minimal organization/membership ownership,
  campaign organization linkage and representative wallet, then shared
  deployment/ABI and a publish/donate/indexer/public-read journey. Privy remains
  deferred; uploads/freeze/verifier and challenge/refund integration follow.
- This review inspected current code and documentation; it did not rerun builds
  or tests. Earlier verification entries retain their original scope.

See [Web3 conventions](./web3-conventions.md#15-wallet-connection-application-roles-and-erc20-approval)
for the allowance and indexer plan.

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
Committee membership/conflict handling, appeals, challenge/resolver deadlines
and financial outcomes still need decisions before coding. Evidence/activation
timeout defaults were authorized on 2026-10-04 and implemented as a compiled,
runtime-unverified slice; see the dated entry below.

```text
Phase 1 — Contract prototype: IN_PROGRESS
```

The current prototype validates ERC20 donations, organizer bond custody,
funding transitions, pre-funded cancellation/failure refunds, committed
milestone budgets, criteria commitments frozen at approval, versioned evidence admission,
fixed 72-hour review, donor challenge and sequential unchallenged settlement.
Final completion returns bond atomically. Evidence/activation timeout recovery
and unreleased-escrow proportional refunds now compile. Challenge resolution,
slashing and permanent-transfer-failure recovery remain unimplemented.

### DONE — Milestone acceptance criteria commitments

- Only the organizer can configure nonzero criteria hashes for existing
  milestones while DRAFT. Corrections are allowed before approval.
- Resolver approval requires criteria for every milestone and freezes hashes.
- Full criteria content remains off-chain; no money moves when hashes change.
- Verification: 85 tests passed, 0 failed, 0 skipped across nine suites;
  formatting check and build succeeded. Build reports four timestamp warnings
  and two intentional validation-loop warnings.

## Verified progress

### DONE — Independent account/session and optional external wallet linking (local development)

- Email/password registration and login work without a wallet. Argon2id hashes
  passwords; PostgreSQL stores opaque session token hashes, expiry and revocation.
  Cookie is HttpOnly/SameSite=Lax, with Secure in production. Account identity is
  `userId`; campaign/evidence guards no longer require a wallet in the session.
- Additive migration `0003_bored_warlock` applied to local PostgreSQL. Existing
  wallet-only users and ownership are preserved; old JWT cookies must sign in again.
- External wallet linking uses persisted, expiring, session-bound SIWE nonces.
  Consumption is atomic; replay and cross-account ownership conflicts are rejected.
  Existing linked wallets retain SIWE login; unlinked wallets cannot auto-create users.
- Register/login and wallet-management UI added. Wallet-only session changes do
  not clear the existing account's workspace forms. Browser writes enforce Origin;
  auth endpoints have process-local rate limits; session cookies are redacted in logs.
- Current verification after provider removal: backend build passes; 23 tests
  pass across nine suites. Local HTTP/PostgreSQL smoke passes 40 response checks:
  registration, duplicate email, wrong password, draft without wallet, unauthorized
  draft access, SIWE domain/URI/chain/expiry/signature, nonce replay/cross-session,
  wallet conflict/idempotency, session expiry, logout/relogin and removed provider
  endpoints returning 404. The wallet/account-boundary regression also passes.
  Smoke rows were removed. Frontend build/lint pass; bundle-size warning remains.
- Browser observation confirms email/password login controls on `/#/account`.
  Browser control then timed out; interactive registration and wallet creation
  are not claimed verified. No contract or on-chain financial behavior changed.
- Scope is a development foundation. Email verification/recovery, production
  deployment configuration, shared rate limits and expiry cleanup remain TODO.

### Out of current scope — Embedded wallets

- User chose full removal of Privy integration on 2026-10-04. SDK, provider UI,
  token/JWKS bridge, configuration and development signing key are removed.
  Earlier dated entries describe historical work and are superseded by this scope.
- Internal account/session and signed external-wallet linking are the current
  identity foundation. A future provider can reuse them; no adapter is scaffolded.
- Verification of removal is recorded in the dated change log below. Setup and
  current API: [accounts and wallets](./accounts-and-wallets.md).

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

### DONE — Initial wallet authentication and organizer access (backend step 1)

The initial implementation below is historical. The 2026-10-04 account/session
slice supersedes its JWT cookie and process-local nonce store. Backend source
has been committed; account changes are currently local work.

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

### 2026-10-04 — Evidence/activation timeout defaults and bounded retries

- User authorized reasonable prototype timing defaults. Implemented 7-day
  activation, 30-day initial evidence, 72-hour admission from submission and
  7-day corrections. Assignment/reassignment does not extend admission. Three
  versions maximum per milestone, including expired admissions. Review remains
  a separate 72-hour window from verifier acceptance.
- Added permissionless expireSubmission for exact current pending version and
  finalizeMilestoneTimeout for waiting activation or active evidence deadlines.
  Actions require now < deadline; timeout paths require now >= deadline. Expiry
  records EXPIRED without acceptance or fabricated verifier decisions. Final
  rejection/expiry, or organizer inactivity, terminates campaign/milestone FAILED.
- Failure snapshots totalContributed - totalReleased and returns bond atomically,
  without slash or a caller bounty. Refund claims use OpenZeppelin Math.mulDiv,
  proportional to original contributions, once only; zero-rounded claims skip the
  token call. Pre-funded refunds remain exact. Rounding dust stays in custody.
- Terminal failure never pays the current milestone or changes prior releases.
  State guards, immutable snapshots, claim flags and ReentrancyGuard protect the
  transitions. Failed bond transfers revert the entire terminal action; permanent
  transfer failure remains an unresolved recovery limitation.
- Verification: forge build --sizes succeeds with Solidity 0.8.24; FundTogether
  runtime is 16,249 bytes and initcode is 16,477 bytes. Timestamp, loop-validation
  and conservative reentrancy-event lint warnings remain. Diff whitespace check
  passes. No tests were added/run; no deployment or runtime validation claimed.
- Status: implementation compiled; runtime verification IN_PROGRESS. Historical
  129-test result predates this slice and is not evidence for the changed code.
  Challenge/resolver, appeal/quorum and misconduct/slash remain pending. Learning
  notes and the required verification cases: contract-evidence-timeouts.md.

### 2026-10-04 — Public feed shell and workspace entry

- Default entry now renders Explore without requiring SIWE. Added compact public
  header/navigation, account dropdown, search/status controls and explicit empty
  state. Search/filter are disabled pending public campaign data.
- Added hash routes for account, contributions, public campaign detail and
  organizer workspace. Account reuses SIWE; unauthenticated workspace access shows
  a compact sign-in page. Contributions/detail explicitly remain unavailable;
  no synthetic campaigns, balances, funding progress or donation actions added.
- The public surface does not call private draft listing. That query is enabled
  only inside the authenticated workspace. Workspace stays mounted when browsing
  public pages, preserving unsaved wizard input within the same session.
- Verification: frontend build and lint pass. Browser inspection confirms default
  feed, unauthenticated workspace sign-in and unavailable detail/back navigation.
  No automated tests added/run; authenticated transitions and mobile interaction
  still need verification. Existing bundle-size warning remains.
- Public read model/API, indexed published campaigns, campaign cards/detail data,
  contribution history, donate and refund transactions remain TODO. No backend or
  contract behavior changed by this UI slice.

### 2026-10-04 — Public sidebar navigation

- Replaced the public top navigation/dropdown with a sticky 240px left sidebar.
  Explore/Contributions sit above; workspace and account/sign-in links sit below.
  Active routes are highlighted. Small screens use compact navigation above
  content, preserving space for the feed. Existing routes and API scope unchanged.
- Verification: frontend build/lint and diff whitespace check pass. Browser
  screenshot confirms desktop sidebar/feed layout. No automated tests added/run;
  mobile interaction and authenticated sidebar behavior remain unverified.

### 2026-10-04 — Independent accounts and optional wallet linking

- Replaced wallet-required application identity with email/password accounts and
  DB-backed revocable sessions. Existing wallet accounts remain usable through
  SIWE; wallet linking is authenticated, session-bound and single-use.
- Added register/login/account wallet UI, and a configurable Privy JWT bridge
  using the supplied public App ID. Dashboard/live provider setup remains pending;
  the frontend integration flag is off. No smart-contract changes in this slice.
- Verification: backend build, 23 tests and 41 HTTP/PostgreSQL smoke response
  checks pass. Frontend build/lint/TypeScript pass. Local login form observed;
  browser interaction later timed out. Test data removed; secrets ignored by Git.
- See accounts-and-wallets.md for current API, local setup, dashboard steps and
  production work. Preserve prior entries as historical records, not current auth.

### 2026-10-04 — Defer Privy activation

- User deferred Privy because enabling the selected integration requires payment.
  Marked it TODO/deferred and kept the SDK flag false. Removed the inactive Privy
  setup message from the account UI; retained integration code for future use.
- Current scope: email/password account, revocable session and signed external
  wallet linking. Updated overview, account guide and execution record.
- Verification: frontend lint, TypeScript build and diff whitespace check pass.
  No automated tests were added or run for this scope reduction.

### 2026-10-04 — Distinguish browser wallet connection from account linking

- Investigated a reported wallet appearing after email registration. The
  configured local DB contains one email account with zero wallet links and one
  legacy wallet account with one link. Registration writes account credentials
  and session only; SIWE linking remains explicit and authenticated.
- Installed Wagmi reconnects previous connectors by default and uses browser
  localStorage. The ConnectButton reflects that browser connection, whereas the
  account list comes from server-returned wallet links. Browser reconnection
  does not write account ownership to PostgreSQL.
- Renamed the account list and browser connection headings and added an explicit
  explanation beside the link button. Updated the account guide.
- Verification: frontend lint, TypeScript build and diff whitespace check pass.
  No backend ownership behavior changed; no automated tests were added or run.

### 2026-10-04 — Reset wallet connections at account boundaries

- Follow-up to the reported account screen: changing labels alone did not stop
  the previous browser wallet connection from appearing under a new account.
  Disabled Wagmi automatic reconnection on page load.
- Initial session loading and account changes now disconnect connections whose
  address and chain do not match that account's linked wallets. Logout disconnects
  all connections. Explicit connections within the same account remain available
  while the user signs the wallet-linking message. Database links are unchanged.
- Added a regression check against the frontend provider using the existing
  Jest/TypeScript tooling. It failed before the fix and passes afterward, covering
  an unlinked new account, same-account connection, linked account and logout.
- Verification: 24 tests across 10 suites pass; frontend lint and TypeScript/Vite
  build pass. Existing bundle-size warning remains. Vite on port 5173 serves the
  updated account labels and no inactive Privy setup message.
- Real browser/MetaMask interaction remains unverified: the browser tool rejected
  access to the existing tab under its URL security policy.

### 2026-10-04 — Remove Privy integration entirely

- User replaced the prior defer/retain-code decision with full removal. Deleted
  frontend provider/panel/config, backend JWT service/routes and the SDK-specific
  regression test. Removed SDK, its direct Solana/Stripe peers, unused backend
  jose dependency and the frontend legacy peer-resolution override.
- Updated package locks; both contain zero Privy entries. Removed provider keys
  from local/example environment files and deleted the unused development RSA
  key. Existing account/session and signed external-wallet linking remain active.
- Updated current overview/account guide and marked historical implementation
  notes as superseded. No embedded-wallet adapter is scaffolded.
- Verification: frontend lint and TypeScript/Vite build pass; backend build and
  23 tests across nine suites pass. HTTP/PostgreSQL smoke passes 40 response checks,
  including 404 for removed token/JWKS endpoints, then removes its own test rows.
  Existing frontend bundle-size warning remains.
- Restarted the local backend with the new build: health returns 200, both removed
  routes return 404 and generated OpenAPI contains zero provider routes. Running
  Vite serves the provider-free app wrapper. Live MetaMask interaction was not run.

### 2026-10-04 — IN_PROGRESS: Local wallet connection and balance diagnosis

- User reports RainbowKit waiting at Opening MetaMask and MetaMask showing zero
  ETH. Local Anvil RPC 127.0.0.1:8545 confirms chain 31337 and 10 ETH at the
  supplied address ending d7619. The earlier balance update left block number 0.
- Mined one local block without restarting/resetting Anvil; block number is now
  1 and the address balance remains 10 ETH. This provides a new block for wallet
  polling; MetaMask's displayed balance has not been confirmed afterward.
- Vite serves the current account labels without Privy text; the reported screen
  still contains historical labels/provider text. IPv4 RPC via localhost and
  127.0.0.1 responds with CORS enabled; IPv6 loopback is not listening.
- Requested the wallet's configured RPC URL/chain ID. Exact connection failure
  and wallet refresh remain unverified; no speculative connector change applied.

### 2026-10-04 — Milestone budgets and bond confirmation popup

- DONE: private campaign draft API stores budgetUnits as integer strings, with positive uint256 and total-goal validation. Database migration 0007 applied locally; existing drafts retain null budgets until edited.
- DONE: wizard accepts USDC budgets with up to six decimals, computes goal and maximum-budget bond using bigint, and shows a confirmation popup after Milestones Next. Returning to edit milestones requires confirmation again. Review includes budgets, goal and bond.
- Verification: backend/frontend builds, frontend lint, campaign tests (11 passed) and diff whitespace check passed. Browser interaction and authenticated save/reload have not been manually verified.
- TODO: configured token enforcement on chain, shared deployment/ABI, campaign submission, wallet bond locking, approval/publication and indexing. Popup confirmation transfers no tokens; Nop campaign remains unavailable.

### 2026-10-04 — Local campaign submission and bond custody integration

- DONE: configured MockUSDC/FundTogetherConfigured deployment and one generated ABI/manifest shared by FE/BE; keyed creation blocks duplicate campaigns per organizer.
- DONE: atomic frozen submission plans, organization OWNER and verified representative checks, stale-revision protection, chain readback and submitted campaigns retained in organization listing. Migration 0008 applied locally.
- DONE: wallet create -> criteria commitments -> exact allowance -> lockBond journey, receipt/confirmation gates, pending-hash retry, resumed on-chain progress, and explicit user-rejection handling. Status is derived from chain reads; not labelled indexed.
- Verification: 6 configured-contract tests and focused configured/bond/milestone suites passed. 32 real HTTP/PostgreSQL/Anvil checks passed, including a backend restart and wallet-drain scenarios. FE/BE builds and FE lint passed; final changes are checked before completion.
- Manual MetaMask journey remains unverified. No organization representative wallet is currently bound in the local database. Local funding helper is available once a wallet is selected.
- TODO: resolver approval UI, organizer publication UI, donor integration, durable indexer and full MVP verification. Frozen-plan unfreeze and cancellation UI are not included. See docs/campaign-submission.md.

- Final verification for the submission slice: all 11 backend suites / 42 tests passed; configured contract tests 6/6 passed; local deployment reuse and funding helper also verified. Manual MetaMask signing remains pending.

### 2026-10-05 — DONE: Recover local deployment after Anvil reset

- Live RPC was chain 31337 with a different genesis block and no code at either saved deployment address. The database contained zero frozen campaign submissions.
- Redeployed MockUSDC/FundTogetherConfigured to the running local chain, updated the shared manifest and restarted the backend with the rebuilt application. Kept historical indexer streams and application data.
- Verified deployment reuse, backend build, public campaign API HTTP 200 and current indexer stream ready at block 2 with no synchronization error. Authenticated resolver UI has not been inspected in the browser.
- Updated the startup guide to include deployment verification/recovery. Indexer warnings now include safe deployment failure details without exposing raw RPC/database errors.

### 2026-10-05 — Campaign confirmation visibility

- Fixed submission visibility for organization campaigns reopened through the general dashboard by using the saved organization ID when the wizard prop is absent.
- Personal drafts now explain that submission requires creating the campaign in an organization workspace as OWNER, with a link to organizations. Existing personal drafts are not reassigned.
- Frontend lint passed; wallet submission has not been exercised in the browser for this change.

### 2026-10-05 — DONE: Submit from the general workspace

- Review step now lists the authenticated user's organizations and allows selecting one without re-entering campaign content. Existing organization campaigns retain their organization.
- On submission, an existing personal draft is copied through the authorized organization creation API; the personal draft is preserved. The new organization draft is retained in wizard state for retries, then the existing wallet/receipt/bond flow runs. Completion opens the organization campaign detail.
- The submit button is visible but disabled until an organization is selected; the review explains the prerequisite. The organization selector remains locked during saving/chain work through the existing fieldset.
- Verification: frontend build, final TypeScript check and lint passed. Live wallet signing was not performed.

### 2026-10-05 — Submission prerequisites in the wizard

- Organization selection uses the existing authenticated organization query/cache, shows loading/empty/error states and supports refresh after organization creation. A single owned organization is selected by default; multiple organizations require a choice.
- Reused the organization representative-wallet confirmation panel directly before submission. Its explicit confirmation still calls the server's verified-wallet/OWNER authorization path; no wallet is bound automatically.
- Live diagnosis found one organization without a representative, plus one linked local wallet with zero ETH and zero new-deployment MockUSDC. Supplied that local wallet with 1000 test MockUSDC and gas using the development funding helper; no campaign was submitted on the user's behalf.
- Verification: frontend build and lint passed. Existing disposable submission smoke passed 32 real API/transaction checks covering freeze, authorization, retry identity, criteria and exact bond custody. Browser MetaMask signing remains unverified.

### 2026-10-05 — Correct account-specific wallet diagnosis

- Prior wallet availability statements used a database-wide count and were incorrect for the organization creator. The organization account has zero linked wallets; the address ending 3d7619 belongs to a separate wallet-only account.
- Organization wallet empty state now has a prominent account-link action and explains connected versus signed linked wallets, refresh, and cross-account ownership. Existing signature/ownership checks remain enforced.
- Frontend TypeScript and lint passed. The in-app browser is not authenticated; the user's attached authenticated screenshot and scoped database queries establish the empty state. No wallet ownership was moved.

### 2026-10-05 — Atomic campaign submission implementation

- DONE: submitCampaignForDraft atomically creates the organizer-scoped campaign, writes every criterion and locks max-budget bond. It uses the existing token policy, events and authorization and guards the entire call with OpenZeppelin nonReentrant. Invalid criteria, missing allowance or insufficient balance roll back campaign/key/events; approval remains a separate transaction.
- DONE: frontend checks the bond balance before any new signature, uses exact approval then one submission on manifests with atomicSubmission: true, and retains the legacy continuation path for the running old deployment and already-created campaigns. Every receipt and backend sync still must confirm success.
- DONE: shared generated ABI, deployment helper capability flag and current submission/overview docs updated. No schema migration or changes to financial settlement rules.
- Verification: full Foundry suite passes, including 12 configured-contract tests (atomic rollback/retry, criteria validation, duplicate transfer prevention, token callback reentrancy). The isolated publication/indexer smoke passes 197 real HTTP/transaction checks, including atomic reverted receipt/no events, successful combined events, review queue inclusion and duplicate submission rejection. Backend/frontend builds and frontend lint pass.
- IN_PROGRESS: active local deployment cutover. The existing contract at 0xe7f1725e7734ce288f8367e1bb143e90bb3f0512 still holds 122000000 MockUSDC base units for an existing campaign. Its chain state, funds and immutable submission plans have not been reset or rebound. The current UI advertises the legacy path until cutover is decided; live MetaMask atomic signing is unverified.

### 2026-10-05 — DONE: Review decision layout and blocked-state explanation

- Self-review now displays a clear restriction and account-management link instead of an editable form with permanently disabled actions. Existing review history remains visible, and conflicted accounts cannot sign approvals. A different wallet on the same account does not remove the account/organization conflict.
- Technical checks have separate pass/fail rows. Eligible reviewers see reason length, acknowledgement guidance, saving feedback and a compact 18 by 18 pixel checkbox. Approval stays disabled when a technical check fails; the existing correction/rejection path and backend authorization remain enforced.
- Verification: frontend build and lint pass; all 36 frontend tests and 10 backend review-service tests pass. Browser interaction on a temporary mocked-API fixture verified reason/acknowledgement gating, all three decision outcomes, compact checkbox dimensions and approval blocking when a check fails. The temporary fixture was removed. No live campaign was reviewed or approved during this UI verification.

### 2026-10-05 — DONE: Organization publication navigation from personal workspace

- Personal workspace now links the current account to its organization's campaigns on every workspace view, with loading/error/empty handling and an organization navigation link. The personal-draft list remains scoped to personal drafts.
- Removed the stale overview claim that milestones and publishing are unavailable. The overview distinguishes submission/bond, human review, resolver chain approval and organizer publication.
- Campaign publication now explicitly explains human approval with a chain DRAFT: the resolver still needs to link its configured wallet and sign; the publish action is gated by indexed chain approval as before.
- Live diagnosis: sadas (metadata 42835f5f-008f-474e-a0b8-f984f9be0160, on-chain ID 2) belongs to huydeptrai. Its approve review belongs to abc@gmail.com, which currently has no wallet links. RPC at block 22 confirmed campaignState 0 (DRAFT) and resolver 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266. No chain transaction or wallet-link record was written.
- Verification: frontend build/lint and all 41 tests pass, including organization-link account isolation, failed-authorization hiding, human approval without publish, and indexed approval exposing publish. The new navigation was visually checked on a temporary preview using the organization list; the preview was removed. Live account sign-in and wallet signing remain user actions.

### 2026-10-05 — Account-to-publication workflow audit and recovery fixes

- DONE: bounded SIWE signing with explicit account and account/address/chain rechecks; late signatures cannot continue linking. Synchronous action guards prevent duplicate clicks. Account UI identifies the connected address and configured resolver, and review history distinguishes reviewing account from configured signing wallet.
- DONE: API timeout recovery messages, submission replacement/cancellation receipt handling, a second wallet check after simulation, and canonical-block verification before submission status writes. Corrected the auth smoke fixture's missing milestone budget.
- Verification: 57 frontend tests, 73 backend tests across 14 suites, 185 contract tests across 13 suites, 197 isolated-chain integration checks, 40 auth response checks and 32 organization-wallet checks pass. Frontend/backend builds and frontend lint pass. Browser fixture confirms an unanswered signature request releases link/logout controls after 90 seconds without a linking API call; fixture and tab removed.
- Live backend was restarted with the updated build, health returns 200, one process listens on port 3000 and the indexer is ready at block 22. sadas remains bonded/human-approved but chain DRAFT; abc@gmail.com still needs a verified resolver wallet. Existing organizer spendable balance is 878 MockUSDC.
- IN_PROGRESS: native MetaMask stability and user-signed browser walkthrough. Standalone extension crashes cannot be certified fixed by application tests. Atomic submission remains tested on the isolated deployment only; active deployment cutover is pending existing escrow recovery/decision.
- Repeatable workflow, current-state snapshot and limitations: [workflow audit](./workflow-audit-2026-10-05.md).
