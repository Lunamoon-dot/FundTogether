# FundTogether Security Findings Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the confirmed active-scope security findings from the partial Codex Security Deep Scan without changing the FundTogether MVP's financial meaning or silently promoting historical compatibility code into the active product.

**Architecture:** Fix the active contract's refund liveness at the on-chain state-machine boundary, bound the active review API at both write and read boundaries, and handle historical contract/database findings in a separately gated compatibility track. The contract remains the authority for funds; PostgreSQL changes must remain idempotent and must not overwrite a terminal canonical refund state.

**Tech Stack:** Solidity/Foundry, OpenZeppelin, NestJS/TypeScript, PostgreSQL/Drizzle, Jest, React/Vite, Anvil/MockUSDC.

**Spec:** `docs/campaigns/FINANCIAL_POLICY_V1.md`, `docs/research-direction.md`, and `docs/PROJECT_OVERVIEW.md`.

## Global Constraints

- Keep the active scope as Reward Crowdfunding for `COMICS_ARTBOOK` with one digital PDF benefit; do not reintroduce physical fulfilment or charity flows.
- Smart-contract state remains the financial authority; PostgreSQL remains an indexed/application projection and must not manufacture a refund or entitlement.
- Preserve integer-safe token accounting, exact transfer checks, replay/idempotency behavior, and permissionless deadline exits.
- Do not choose a new financial deadline policy silently. The exact maximum release-deadline horizon must be approved before changing the contract.
- Historical compatibility findings are a separate track. Do not delete historical tables, ABI, or records merely to make the scan green.
- Do not edit or reset ignored `.local` runtime state as part of source remediation.

## Review Focus

- A creator-supplied release deadline far in the future must still lead to a permissionless refund after a bounded policy horizon; test both the boundary and the existing normal release path.
- A legitimate review conversation must still allow ordinary participants to exchange messages, while inserts and reads have finite bounds.
- A stale historical request must have a safe exit without allowing an unauthorized payout or destroying the accounting invariant.
- A historical campaign must not enter a terminal state while its contract-held residual balance is unrecoverable.
- A historical refund/indexer update must never be overwritten by a later duplicate or stale off-chain dispute action.

## Finding Classification

The partial scan produced seven rows, all low severity/high confidence in its local-only threat model. Two rows are the same active `releaseDeadline` root cause. The implementation plan therefore treats them as these workstreams:

1. **Active P0 — unbounded release deadline:** `contracts/src/campaigns/FundTogetherCampaign.sol`.
2. **Active P1 — unbounded review-thread growth/read amplification:** `backend/src/modules/review/...`.
3. **Historical P1 — stale request/takeover/wind-down liveness:** `FundTogetherHistoricalCampaign.sol`.
4. **Historical P1 — terminal residual escrow:** `FundTogetherHistoricalCampaign.sol`.
5. **Historical P1 — duplicate dispute and terminal-state overwrite:** historical pledge service/schema/indexer.
6. **Triage only — possible public legacy campaign-data exposure:** verify reachability and row shape before classifying or changing it.

### Task 0: Establish a clean baseline and resolve policy gates

**Files:**
- Read: `C:/Users/dell/Desktop/FundTogether/.git status`, `docs/campaigns/FINANCIAL_POLICY_V1.md`, `docs/PROJECT_PROGRESS.md`
- Read: `C:/Users/dell/Desktop/FundTogether/contracts/src/campaigns/FundTogetherCampaign.sol`, `contracts/src/campaigns/FundTogetherHistoricalCampaign.sol`
- Read: `C:/Users/dell/Desktop/FundTogether/backend/src/modules/review/services/review-conversation.service.ts`, `backend/src/modules/pledges/workflow/pledge.service.ts`

**Interfaces:**
- Produces the exact baseline revision, existing test result, and approved values needed by later tasks.

- [ ] **Step 1: Record the baseline.** Run `git status --short`, `git diff --check`, `forge test` from `contracts`, `npm run test:campaigns --prefix backend`, and `npm run test:workflow --prefix backend`.
- [ ] **Step 2: Reproduce the active deadline issue in a focused test or Foundry script.** Demonstrate that a creator can set a deadline beyond any practical refund horizon and that `startRefunds` remains blocked until `releaseDeadline + RELEASE_GRACE`.
- [ ] **Step 3: Verify historical reachability.** Confirm whether the supported launcher starts the historical contract/indexer path and whether the historical routes are still intentionally callable. Record this as a scope decision; do not infer that “legacy” means safe to delete.
- [ ] **Step 4: Approve policy constants before implementation.** Choose and document `MAX_RELEASE_DEADLINE_HORIZON` for the active contract. Separately approve the review-thread cap/page size and historical timeout semantics. If the financial horizon is not approved, stop the active-contract task as blocked rather than inventing a number.

### Task 1: Bound the active release deadline and preserve refund liveness

**Files:**
- Modify: `contracts/src/campaigns/FundTogetherCampaign.sol:13-18,252-261,340-355`
- Modify: `contracts/test/unit/Campaigns/CampaignEscrow.t.sol`
- Modify: `docs/campaigns/FINANCIAL_POLICY_V1.md`
- Regenerate if required by the contract change: `backend/scripts/campaigns/generate-campaign-artifacts.cjs` outputs/manifests in ignored `.local/fundtogether/`

**Interfaces:**
- Produces a public contract constant for the approved maximum horizon and keeps `confirmCampaignCompletion(uint256,uint256)` unchanged for callers.
- Preserves `startRefunds(uint256)` as a permissionless transition and does not create a backend-only refund path.

- [ ] **Step 1: Add failing Foundry tests.** Add tests with explicit names such as `test_completionDeadlineBeyondPolicyHorizonReverts` and `test_boundedReleaseDeadlineStillAllowsRefundAfterGrace`. Assert the boundary accepts, boundary-plus-one rejects, and the normal deadline-plus-`RELEASE_GRACE` refund remains available.
- [ ] **Step 2: Update the policy document.** Record the exact approved horizon and state that the creator-confirmed release deadline is bounded relative to confirmation time; retain the existing seven-day release grace rule.
- [ ] **Step 3: Implement the smallest contract guard.** Add an immutable policy constant and reject `releaseDeadline > block.timestamp + MAX_RELEASE_DEADLINE_HORIZON` while retaining the existing timestamp/overflow checks. Do not change payout recipients, challenge semantics, or escrow arithmetic.
- [ ] **Step 4: Verify the contract invariant.** Run the focused Campaign tests, then all Foundry tests. Confirm no path allows `releaseDeadline` to bypass the production timeout/refund transition and no successful payout/refund can repeat.
- [ ] **Step 5: Regenerate and verify deployment identity.** Rebuild the ABI/policy hash and update only disposable local deployment artifacts through the existing launcher flow; do not hand-edit a manifest or commit `.local` state.

### Task 2: Bound review-thread writes and reads

**Files:**
- Modify: `backend/src/modules/review/services/review-conversation.service.ts:86-105,125-185`
- Modify: `backend/src/modules/review/controllers/review-conversation.controller.ts`
- Modify: `backend/src/modules/campaigns/schemas/preparation.schema.ts` or a focused review query-schema file
- Modify: `backend/src/database/schema/campaigns.schema.ts` for the review-message index if the current table is defined there
- Create: `backend/drizzle/fundtogether/0005_review_conversation_limits.sql` if the schema/index change requires migration
- Modify: `backend/src/modules/review/tests/review-http.spec.ts`
- Modify: `backend/src/modules/review/tests/review-conversation.policy.spec.ts` if policy helpers are extracted
- Modify: `frontend/src/features/campaigns/api/campaigns.ts` and `frontend/src/features/campaigns/shared/ui/ReviewThread.tsx` only if the response becomes paginated

**Interfaces:**
- Recommended initial operational values: `MAX_REVIEW_MESSAGES_PER_THREAD = 200`, `REVIEW_MESSAGES_PAGE_SIZE = 50`, and a hard maximum of 50 messages returned per request. These are API/resource limits, not product-financial policy.
- The thread detail response remains backward-compatible for existing fields and adds pagination metadata only if needed: `messages`, `hasMore`, and `nextCursor`.

- [x] **Step 1: Add failing API tests.** Cover: the 201st message is rejected with a stable conflict/rate-limit error; a non-participant remains forbidden; a thread read returns at most 50 messages; and a cursor returns the next page without duplicates.
- [x] **Step 2: Add the database access path.** Add an index on `(thread_id, created_at, id)` and use a bounded keyset query. Never load the entire message collection into memory.
- [x] **Step 3: Enforce the write cap inside the transaction.** Lock or otherwise serialize the thread decision, count existing messages, enforce the per-thread cap, then insert. Keep the existing entitlement/current-stream checks and participant authorization intact.
- [x] **Step 4: Add route throttling.** Apply a narrow `@Throttle` policy to message creation rather than changing the global API limit. The cap must be an additional control, not a replacement for authorization.
- [x] **Step 5: Update frontend consumers if pagination is exposed.** Preserve current ordering and make the UI request older pages explicitly; do not silently truncate a thread without a visible continuation state.
- [x] **Step 6: Verify.** Run the focused review HTTP/policy tests, backend build, and the existing Campaign test suite. Add a regression test showing a refunded/orphaned entitlement still becomes read-only and cannot use the new message path.

### Task 3: Repair historical request liveness without bypassing fund controls

**Files:**
- Modify: `contracts/src/campaigns/FundTogetherHistoricalCampaign.sol:282-289,311-420,454-489,528-542`
- Modify: `contracts/src/campaigns/HistoricalCampaignTypes.sol` if a terminal/cancelled request state is needed
- Modify: `contracts/test/unit/Campaigns/HistoricalCampaignFundingAndFulfillment.t.sol`
- Modify: `backend/src/indexer/historical-campaign-indexer.service.ts` for the new event/state projection
- Regenerate: `backend/src/blockchain/generated/fundtogether/fund-together-historical-campaign.abi.json` through the existing artifact script

**Interfaces:**
- Add explicit historical-only takeover/expiry transitions; do not alter `FundTogetherCampaign`.
- A safe design is: backup takeover becomes callable after the existing historical review window, and an unapproved `SUBMITTED` request can expire to a terminal cancelled state after its timeout, clearing `hasOpenRequest`.
- A request that has already disbursed funds cannot be cancelled as if funds never moved; it must follow an explicit backup-review/return-funds/settlement path with conservation checks.

- [x] **Step 1: Add failing historical state-machine tests.** Cover primary inactivity, backup takeover for approval/expenditure/dispute review, expiry of a never-disbursed stale request, repeated takeover rejection, and wind-down/refund becoming reachable after the safe terminal transition.
- [x] **Step 2: Add the minimum state/event surface.** Introduce only the historical request state and events required to distinguish `SUBMITTED`, `CANCELLED`, and financially disbursed states. Do not reuse `COMPLETED` to mean “cancelled.”
- [x] **Step 3: Implement backup takeover gates.** Use the existing historical timeout policy and bind each takeover to the specific request/challenge timestamp. Keep resolver/backup role checks and prevent a second takeover.
- [x] **Step 4: Implement stale-request expiry.** Allow expiry only for a request that has not disbursed funds; clear `hasOpenRequest` atomically and emit an auditable event. Do not create an arbitrary token transfer or refund shortcut.
- [x] **Step 5: Update the historical indexer.** Make the new events idempotent and ensure reorg handling cannot resurrect a cancelled request or clear a newer open request.
- [x] **Step 6: Verify.** Run the focused historical Foundry tests and `historical-campaign-indexer.service.spec.ts`; assert `token.balanceOf(contract) == c.available` and that wind-down/refund transitions remain recoverable.

### Task 4: Prevent terminal historical residual escrow

**Files:**
- Modify: `contracts/src/campaigns/FundTogetherHistoricalCampaign.sol:520-526`
- Modify: `contracts/test/unit/Campaigns/HistoricalCampaignFundingAndFulfillment.t.sol`
- Modify: `docs/PROJECT_PROGRESS.md` only after tests and the chosen compatibility behavior are verified

**Interfaces:**
- `completeCampaign(uint256)` must not enter `COMPLETED` while contract-held `available` escrow is nonzero.
- The preferred narrow guard is `available == 0`; if residual funds exist, the campaign remains wind-down/refund-recoverable rather than entering a terminal state.

- [x] **Step 1: Add a failing test** that attempts completion with residual `available` and expects `WrongState`.
- [x] **Step 2: Add a passing control** that drains/returns the residual according to the historical flow, then permits completion with zero available escrow.
- [x] **Step 3: Add the guard** without changing payout recipients or inventing a residual beneficiary.
- [x] **Step 4: Run the complete historical Foundry suite** and preserve the conservation invariant `contributed == available + grossPaid` at the relevant fixture points.

### Task 5: Make historical disputes single-open and terminal-state safe

**Files:**
- Modify: `backend/src/modules/pledges/workflow/pledge.service.ts:84-145`
- Modify: `backend/src/modules/pledges/workflow/backer.controller.ts`
- Modify: `backend/src/database/schema/campaign-core.schema.ts:135-149`
- Create: `backend/drizzle/fundtogether/0006_historical_dispute_integrity.sql` if needed after resolving migration numbering with the current checkout
- Modify: `backend/src/indexer/historical-campaign-indexer.service.ts:825-839,1030-1040`
- Modify: `backend/src/indexer/tests/historical-campaign-indexer.service.spec.ts`
- Add/modify: a focused pledge workflow test under `backend/src/modules/pledges/tests/`

**Interfaces:**
- Only one `OPEN` dispute may exist per historical entitlement.
- `openDispute` may transition only eligible nonterminal entitlement states; `REFUNDED`, `REFUND_ELIGIBLE`, and an already `DISPUTED` entitlement must be rejected.
- Resolver resolution must use a conditional state transition and must never change `REFUNDED` back to `CONFIRMED` or another nonterminal status.

- [x] **Step 1: Inspect existing data before adding a unique index.** Run a duplicate-OPEN-dispute query against the disposable database. If duplicates exist, fail closed and reconcile them explicitly; do not delete or silently select a survivor.
- [x] **Step 2: Add failing service tests.** Cover duplicate open, already disputed, already refunded, concurrent opens, and indexer refund followed by a stale resolver action.
- [x] **Step 3: Add the partial unique index** on `historical_disputes(entitlement_id) WHERE status = 'OPEN'` and the supporting entitlement/status indexes.
- [x] **Step 4: Make `openDispute` atomic.** Lock/read the entitlement, validate the eligible status, insert the dispute, and update to `DISPUTED` in one transaction. Map unique-violation races to a stable conflict response.
- [x] **Step 5: Make resolver/indexer transitions conditional.** Require the dispute to be `OPEN` and the entitlement to remain in the expected nonterminal state before applying a resolution; the indexer remains authoritative for canonical `REFUNDED`.
- [x] **Step 6: Verify.** Run the focused pledge/indexer tests, full backend workflow/campaign tests, migration apply/repeat checks, and a concurrent request test where practical.

### Task 6: Triage the deferred public legacy-data exposure candidate

**Files:**
- Inspect: `backend/src/modules/campaigns/workflow/public.controller.ts`, `backend/src/modules/campaigns/controllers/campaign.controller.ts`, related services and DTOs
- Test only if confirmed: `backend/src/modules/campaigns/tests/http.spec.ts` or a focused public-route test

- [x] **Step 1: Trace the route and returned row shape.** Determine whether an unauthenticated caller can obtain unpublished campaign, identity, review, object-key, or evidence data.
- [ ] **Step 2: If confirmed, add a failing HTTP test** for an unpublished/private row and a passing test for an approved public preview.
- [ ] **Step 3: Apply the narrowest publication predicate/projection fix** and preserve the active public Campaign route contract.
- [x] **Step 4: If not reachable or intentionally historical-only, record `no_change` with source evidence** instead of changing the route speculatively.

### Task 7: Full verification and rerun

**Files:**
- Read: all changed files and the final diff
- Update: `docs/PROJECT_PROGRESS.md` with verified results only

- [x] **Step 1: Run focused checks** for each changed subsystem and inspect failures rather than weakening assertions.
- [x] **Step 2: Run required repository checks:** Foundry tests, backend build, backend Jest suites, frontend tests/build if the review response changes, and migration apply/repeat on a disposable local database.
- [x] **Step 3: Perform a manual source-to-sink review** of every changed condition, direct caller, state transition, event, and indexer projection. Confirm no backend-only path can move funds or grant a claim.
- [ ] **Step 4: Rerun Codex Security Deep Scan** using the same custom `CODEX_HOME` and output directory after usage resets or credits are available. Do not treat the old partial report as the final scan.
- [ ] **Step 5: Compare the new report** against the partial findings: the active deadline and review-thread findings must disappear or be explicitly reclassified; historical findings must be closed or documented as out-of-scope with evidence; coverage must be complete before claiming completion.

## Execution Order

1. Task 0 baseline and policy gates.
2. Task 1 active escrow deadline — highest priority because it affects refund liveness.
3. Task 2 active review API resource bounds.
4. Tasks 3–4 historical contract liveness and residual escrow.
5. Task 5 historical database/indexer dispute integrity.
6. Task 6 deferred route triage.
7. Task 7 complete verification and rerun.

## Open Decision

The current financial policy defines the seven-day release grace period but does not define the maximum distance between Creator confirmation and `releaseDeadline`. I recommend approving a concrete horizon before implementation; the plan deliberately does not invent that value because it changes when backers become eligible for refunds.
