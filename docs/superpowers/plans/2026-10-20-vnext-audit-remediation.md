# FundTogether VNext Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement and verify the pure-decentralized VNext remediation specification for audit findings P0-01 through P1-10.

**Architecture:** Keep CampaignEscrowVNext authoritative for contribution custody,
milestone deadlines, payout and refund allocation; keep JuryReview authoritative
for case lifecycle, deterministic courts, retry, appeal and exactly-once Judge
settlement; keep JuryRegistry authoritative for deposited, reserved, recovered
and settled Judge stake. Make the persistent indexer process each canonical log,
projection transition and checkpoint in one database transaction.

**Tech Stack:** Solidity 0.8.24, Foundry/Forge, OpenZeppelin SafeERC20 and
ReentrancyGuard, TypeScript/NestJS, Drizzle PostgreSQL, Jest, Anvil and MockUSDC.

**Spec:** docs/superpowers/specs/2026-10-20-vnext-audit-remediation-design.md

## Global Constraints

- The target remains permissionless; no Resolver, Admin, backend operator or PostgreSQL row may choose a verdict or move contribution escrow.
- The local target remains one COMICS_ARTBOOK, one STANDARD tier, one private DIGITAL_DOWNLOAD PDF, MockUSDC and chain 31339.
- sum(all milestone budgets) == fundingGoal; this remediation version has no reserve-budget or surplus path.
- requiredCaseStake = max(minimumStakeFloor, ceil(riskMultiplierBps * riskValue / 10_000)) with floor 10 MockUSDC and multiplier 500 bps.
- A substantive PROVISIONAL_PASS or PROVISIONAL_FAIL cannot enter retry; retry is only for explicit protocol-invalid status.
- Every enrolled Judge case settles exactly once, including zero slash and zero reward.
- Court seats come from one frozen seed-derived permutation and are independent of assignment transaction order.
- milestoneSubmissionWindow and correctionWindow are 7 days.
- Refund entitlements use frozen prefix allocation and sum exactly to the refund pool.
- Persistent event insert, projection update and stream checkpoint commit or roll back together.
- All money and stake arithmetic uses integer token units and Solidity uint256/TypeScript bigint.
- Existing Resolver code and historical tests remain historical unless a task explicitly migrates a VNext path.

## Review Focus

- A valid PASS/FAIL must not be discarded by a permissionless retry — owned by Task 2, pinned by test_CannotRetrySubstantivePass and test_CannotRetrySubstantiveFail.
- A crash or replay must not strand or double-settle Judge stake — owned by Tasks 1–2, pinned by test_RetryThenFinalSettlementWorks and Registry recovery tests.
- A failed campaign must not create zero claims plus hidden refund dust — owned by Task 3, pinned by test_AllRefundClaimsConsumeSnapshotPool and claim-order permutation tests.
- A Creator timeout must expose a permissionless terminal refund path — owned by Task 3, pinned by submission/correction deadline tests.
- A replayed event must not double additive projection fields or leave financial state stale — owned by Task 5, pinned by persistent indexer integration tests.

---

### Task 1: Add shared policy math and safe Judge case reservations

**Files:**
- Modify: contracts/src/campaigns/VNextTypes.sol
- Modify: contracts/src/jury/JuryRegistry.sol
- Modify: contracts/test/unit/VNext/StateMachine.t.sol
- Modify: contracts/test/unit/VNext/JuryRegistry.t.sol
- Modify: contracts/src/interfaces/IVNextEvents.sol

**Interfaces:**
- Consumes: existing JuryRegistry reviewController, caseStake, availableStake, lockedStake and caseSettled ledgers.
- Produces: VNextTypes.requiredCaseStake(floor, multiplierBps, riskValue), VNextTypes.refundPrefixShare(pool, prefix, previousPrefix, snapshot), JuryRegistry.registerCase(reviewCaseId, enrollmentDeadline, requiredStake, poolId), JuryRegistry.releaseUnenrolledCaseStake(reviewCaseId, judge), JuryRegistry.caseEnrollmentDeadline(reviewCaseId), and JuryRegistry.requiredCaseStake(reviewCaseId).

- [ ] Step 1: Write the failing policy-math tests.

Add pure tests for:

- floor-dominant stake: requiredCaseStake(10e6, 500, 1) == 10e6;
- risk-dominant stake: requiredCaseStake(10e6, 500, 1000e6) == 50e6;
- ceil behavior for a non-divisible risk amount;
- prefix refund shares whose sum equals the pool for a remainder-producing input.

- [ ] Step 2: Write failing Registry tests.

Add tests named:

- test_UnknownCaseCannotReserveStake;
- test_ReserveBelowRequiredStakeReverts;
- test_UnenrolledStakeCanBeRecovered;
- test_EnrolledStakeCannotUsePreEnrollmentRecovery;
- test_CaseRegistrationIsControllerOnly.

Use real MockUSDC transfers and assert available, locked and deposited balances before and after every transition.

- [ ] Step 3: Run the focused tests and verify RED.

Run:

    cd contracts
    forge test --match-path test/unit/VNext/StateMachine.t.sol --match-path test/unit/VNext/JuryRegistry.t.sol -vv

Expected: the new tests fail because the helpers and Registry case lifecycle do not exist.

- [ ] Step 4: Implement the minimum shared math.

Implement integer-only helpers in VNextTypes.sol. Use (riskValue * multiplierBps + 9_999) / 10_000 for ceiling and calculate prefix allocation as the difference of two floors. Revert on zero snapshot only in the caller; keep the pure helper deterministic.

- [ ] Step 5: Implement Registry case registration and recovery.

Add a Registry case record containing enrollment deadline, required stake, pool identity, registration/open state and whether the Judge has enrolled. Restrict registration and settlement operations to the immutable review controller. Require a registered, open case and amount >= requiredCaseStake in reserveCaseStake. Add permissionless releaseUnenrolledCaseStake after the deadline, and mark the Judge as enrolled from the controller before the review engine accepts the enrollment.

- [ ] Step 6: Run the focused tests and verify GREEN.

Run the same Forge command. Expected: all new policy and Registry tests pass, including exact balance conservation.

- [ ] Step 7: Commit.

    git add contracts/src/campaigns/VNextTypes.sol contracts/src/jury/JuryRegistry.sol contracts/src/interfaces/IVNextEvents.sol contracts/test/unit/VNext/StateMachine.t.sol contracts/test/unit/VNext/JuryRegistry.t.sol
    git commit -m "fix: validate and recover VNext judge stake reservations"

### Task 2: Make JuryReview retry, assignment and settlement safe

**Files:**
- Modify: contracts/src/jury/JuryReview.sol
- Modify: contracts/src/jury/JuryTypes.sol if explicit round status belongs in the shared jury types
- Modify: contracts/src/interfaces/IVNextEvents.sol
- Modify: contracts/test/unit/VNext/JuryReview.t.sol
- Modify: contracts/test/invariant/VNextConservation.t.sol

**Interfaces:**
- Consumes: Task 1 math and Registry interfaces.
- Produces: createReviewCase(creator, campaignId, milestoneId, evidenceRevision, riskValue), immutable requiredCaseStake(reviewCaseId), explicit roundStatus(reviewCaseId), frozen permutation accessors, openRetry guarded by RETRY_ELIGIBLE, and ReviewCaseSettled/assignment events.

- [ ] Step 1: Write failing JuryReview tests.

Add tests named:

- test_EnforceRiskAdjustedMinimumStake;
- test_RequiredCaseStakeIsFrozen;
- test_CannotRetrySubstantivePass;
- test_CannotRetrySubstantiveFail;
- test_RetryThenFinalSettlementWorks;
- test_AssignmentIndependentOfCallOrder;
- test_AssignmentUsesThreeUniqueJudgesPerCourt;
- test_CreatorCannotEnrollButCanOpenAppeal.

For the retry tests, first produce a valid substantive court result, then advance beyond the reveal deadline and assert openRetry reverts while the provisional result and case identity remain unchanged. For settlement, assert zero slash still sets the case settled flag and later finalization does not hit CaseAlreadySettled.

- [ ] Step 2: Run the focused tests and verify RED.

Run:

    cd contracts
    forge test --match-path test/unit/VNext/JuryReview.t.sol --match-path test/invariant/VNextConservation.t.sol -vv

Expected: the new tests fail on current retry, stake, assignment-order and zero-slash settlement behavior.

- [ ] Step 3: Extend case creation and registration.

Add riskValue to the Campaign-to-ReviewEngine interface. Compute and store requiredCaseStake, register the case in JuryRegistry, and freeze the case policy values before enrollment. Ensure root, retry and appeal cases receive the correct risk value and non-overlapping pool identity.

- [ ] Step 4: Add explicit round status and retry guards.

Set status on case creation, snapshot failure, court finalization, invalid/tied aggregation, provisional result, appeal opening and finality. Make openRetry accept only RETRY_ELIGIBLE; when the deadline expires, set RETRY_ELIGIBLE if the retry counter is below 2, otherwise set PROTOCOL_FAIL. Never infer retry readiness from courtFinalized alone.

- [ ] Step 5: Replace mutable court selection with a frozen permutation.

At snapshot finalization, copy the enrolled Judge list to a memory array, shuffle it once with the frozen seed using deterministic Fisher–Yates, and store the permutation. Make assignCourt read positions 3 * courtId through 3 * courtId + 2. Reject duplicate materialization and preserve the existing 300-Judge local cap.

- [ ] Step 6: Make settlement exactly-once.

Keep the existing atomic revert behavior for Registry failures. After all Registry settlements, set reviewCaseSettled even when slash, winners or reward are zero. Make _settleAllRounds skip already-settled cases and emit ReviewCaseSettled once.

- [ ] Step 7: Run the focused tests and verify GREEN.

Run the Task 2 Forge command. Expected: all retry, assignment, stake and settlement regressions pass and the existing VNext review tests remain green.

- [ ] Step 8: Commit.

    git add contracts/src/jury/JuryReview.sol contracts/src/jury/JuryTypes.sol contracts/src/interfaces/IVNextEvents.sol contracts/test/unit/VNext/JuryReview.t.sol contracts/test/invariant/VNextConservation.t.sol
    git commit -m "fix: harden VNext jury retry assignment and settlement"

### Task 3: Enforce campaign budget, milestone deadlines and exact refunds

**Files:**
- Modify: contracts/src/campaigns/CampaignEscrowVNext.sol
- Modify: contracts/test/unit/VNext/CampaignCreation.t.sol
- Modify: contracts/test/unit/VNext/FundingEscrow.t.sol
- Modify: contracts/test/unit/VNext/MilestoneEvidence.t.sol
- Modify: contracts/test/unit/VNext/PayoutRefund.t.sol
- Modify: contracts/test/invariant/VNextConservation.t.sol

**Interfaces:**
- Consumes: Task 1 refund math and Task 2 createReviewCase/round status interfaces.
- Produces: constructor policy windows, milestone submissionDeadline/correctionDeadline, expireMilestoneSubmission(campaignId, milestoneId), permissionless correction timeout, contributor-order refund allocation, refundEntitlement(campaignId, backer), freezeRefundAllocations(campaignId, maxBackers), and Creator-eligible openAppeal.

- [ ] Step 1: Write failing campaign tests.

Add tests named:

- test_BudgetBelowGoalReverts;
- test_BudgetAboveGoalReverts;
- test_CreatorInactiveOpensRefundAfterSubmissionDeadline;
- test_CorrectionTimeoutOpensRefund;
- test_TimeoutIsPermissionless;
- test_EnforceRefundAllocationBeforeClaim;
- test_AllRefundClaimsConsumeSnapshotPool;
- test_RefundEntitlementIsIndependentOfClaimOrder;
- test_CreatorCanAppealOwnVerdictFail.

Use at least two Backers and contributions that create a nonzero floor remainder. Assert exact token balances, refund entitlement sum and one-time claim markers.

- [ ] Step 2: Run the focused tests and verify RED.

Run:

    cd contracts
    forge test --match-path test/unit/VNext/CampaignCreation.t.sol --match-path test/unit/VNext/FundingEscrow.t.sol --match-path test/unit/VNext/MilestoneEvidence.t.sol --match-path test/unit/VNext/PayoutRefund.t.sol -vv

Expected: budget mismatch is currently accepted, deadline calls are absent, and floor refunds leave a residual or allow premature claims.

- [ ] Step 3: Enforce exact campaign budget and update frozen terms.

Reject any campaign whose milestone budget sum is not exactly the goal. Add the 7-day submission and correction windows to the constructor/policy commitment and include the values in termsHash or policy hash so existing terms remain immutable.

- [ ] Step 4: Add milestone deadline transitions.

Store the active submission deadline and correction deadline. Start the first deadline at funding finalization, start later milestones at the previous payout, and start correction deadline at final verdict. Add permissionless timeout functions that open the remaining escrow refund path without labeling inactivity as VERDICT_FAIL.

- [ ] Step 5: Implement bounded refund allocation.

Track unique contributor order. openRefunds freezes pool and snapshot, then freezeRefundAllocations processes at most maxBackers contributors per call and stores prefix data/entitlements. Block claims until allocation is complete. claimRefund transfers the stored exact entitlement, including recording a valid zero-token entitlement, and updates refunded accounting only once.

- [ ] Step 6: Allow Creator appeal under the local policy.

Permit the campaign Creator to open an appeal for their own publication or milestone VERDICT_FAIL; retain Backer contribution eligibility, appeal-window, bond and case-state guards. Return the exact 1 MockUSDC appeal bond to the requester when the appeal reaches finality, with no local-policy forfeiture.

- [ ] Step 7: Run the focused tests and verify GREEN.

Run the Task 3 Forge command and the full VNext unit suite. Expected: all new campaign tests pass, including zero-dust conservation and permissionless liveness.

- [ ] Step 8: Commit.

    git add contracts/src/campaigns/CampaignEscrowVNext.sol contracts/src/campaigns/VNextTypes.sol contracts/test/unit/VNext/CampaignCreation.t.sol contracts/test/unit/VNext/FundingEscrow.t.sol contracts/test/unit/VNext/MilestoneEvidence.t.sol contracts/test/unit/VNext/PayoutRefund.t.sol contracts/test/invariant/VNextConservation.t.sol
    git commit -m "fix: enforce VNext campaign liveness and refund conservation"

### Task 4: Update deployment wiring and contract-level acceptance fixtures

**Files:**
- Modify: contracts/script/DeployVNext.s.sol
- Modify: all VNext test constructors under contracts/test/unit/VNext/ and contracts/test/invariant/VNextConservation.t.sol
- Regenerate: backend/src/blockchain/generated/vnext deployment ABI inputs from the contract build
- Regenerate: backend/src/blockchain/generated/vnext/JuryReview.json
- Regenerate: backend/src/blockchain/generated/vnext/CampaignEscrowVNext.json

**Interfaces:**
- Consumes: final constructor signatures and events from Tasks 1–3.
- Produces: one reproducible local deployment using policy version fundtogether-vnext-local-v2-remediation, 7-day milestone/correction windows, 1 MockUSDC appeal bond and the existing 31339 chain.

- [ ] Step 1: Write/update deployment verification assertions.

Assert the deployed contracts expose the new policy values, the ReviewEngine is wired to the Registry, and the Campaign contract is wired to the ReviewEngine.

- [ ] Step 2: Run the deployment-specific test and verify RED.

Run the existing deployment/ABI verification tests. Expected: constructor argument counts or policy assertions fail until deployment wiring is updated.

- [ ] Step 3: Update deploy script and all fixtures.

Pass the exact policy values once, update every VNext test fixture to the new constructor signatures, and keep the old Resolver deployment scripts untouched.

- [ ] Step 4: Regenerate ABI artifacts.

Run the repository’s contract build/artifact generation command. Do not hand-edit ABI JSON. Confirm generated ABI contains the new functions/events used by backend and tests.

- [ ] Step 5: Run the full contract suite.

Run:

    cd contracts
    forge test

Expected: all unit and invariant tests pass, with no compilation warnings that hide an interface mismatch.

- [ ] Step 6: Commit.

    git add contracts/script/DeployVNext.s.sol contracts/test backend/src/blockchain/generated/vnext
    git commit -m "chore: wire VNext remediation policy into local deployment"

### Task 5: Make the persistent VNext indexer transactional and complete

**Files:**
- Modify: backend/src/indexer/vnext-indexer.service.ts
- Modify: backend/src/database/schema/vnext.schema.ts to document the encoded stream identity used by the event key
- Create: backend/src/indexer/tests/vnext-indexer.service.spec.ts
- Modify: backend/src/indexer/tests/vnext-event-projector.spec.ts

**Interfaces:**
- Consumes: generated VNext ABI events from Task 4 and existing Drizzle schema.
- Produces: transactional persistEvent(streamId, log, decoded) that returns whether a new event was applied, applyPersistentProjection(tx, ...), atomic stream checkpoint updates, and persistent handling for all campaign/refund/review/Judge ledger events listed in the spec.

- [ ] Step 1: Write failing persistent indexer tests.

Add tests named:

- test_IndexedPayoutReplayIsIdempotent;
- test_IndexedEnrollmentReplayIsIdempotent;
- test_CrashBeforeCommitReplaysExactlyOnce;
- test_PersistentRefundEventsUpdateCampaignProjection;
- test_PersistentCompletionEventUpdatesCampaignProjection;
- test_MissingOrMalformedEventDoesNotAdvanceCheckpoint.

Use a real PostgreSQL-backed Drizzle transaction fixture where available. For the crash case, make the projection handler throw before commit, assert no event/projection/checkpoint row remains, then replay and assert exactly one application.

- [ ] Step 2: Run the focused backend tests and verify RED.

Run:

    cd backend
    npm test -- --runInBand src/indexer/tests/vnext-indexer.service.spec.ts src/indexer/tests/vnext-event-projector.spec.ts

Expected: the new service tests fail because current persistence uses an upsert followed by non-transactional additive updates and misses refund/completion events.

- [ ] Step 3: Add the transactional event insert gate.

Wrap event insert, projection update and checkpoint update in this.db.transaction. Use onConflictDoNothing().returning(...); when no row is returned, skip every projection mutation. Keep the event identity (streamId, transactionHash, logIndex) and preserve the canonical block hash in the row.

- [ ] Step 4: Move projection handlers onto the transaction client.

Refactor event handlers to accept the transaction client. Replace additive updates with the insert-gate path and preserve monotonic canonical event metadata. Ensure sync() advances the checkpoint only after the transaction containing the decoded event succeeds; a malformed/unknown event does not advance beyond a failed canonical event.

- [ ] Step 5: Implement missing financial transition handlers.

Add persistent handlers for CampaignRefundsOpened, BackerRefundClaimed, CampaignCompleted, MilestoneRevisionSubmitted, ChallengeResolved, ReviewRetryOpened, AppealOpened, AppealRoundFinalized, ReviewCaseSettled, UnenrolledCaseStakeReleased and all other canonical events in the specification. Update campaign state, refunded, paidOut, milestone state and review finality from event arguments only.

- [ ] Step 6: Run the focused backend tests and verify GREEN.

Run the Task 5 Jest command, then the backend VNext/projector and campaign indexer suites. Expected: replay is idempotent, crash rollback is safe and persistent projections contain the same financial transitions as the reducer.

- [ ] Step 7: Commit.

    git add backend/src/indexer/vnext-indexer.service.ts backend/src/indexer/tests/vnext-indexer.service.spec.ts backend/src/indexer/tests/vnext-event-projector.spec.ts backend/src/database/schema/vnext.schema.ts
    git commit -m "fix: make VNext indexer transactional and complete"

### Task 6: Synchronize policy documentation and runtime acceptance

**Files:**
- Create: docs/protocol/parameters-v2-remediation.md as the versioned local policy registry
- Modify: docs/protocol/IMPLEMENTATION_PROGRESS_VNEXT.md
- Modify: docs/protocol/README.md
- Create or modify: the repository’s VNext runtime scenario/verification script under backend/scripts/campaigns/

**Interfaces:**
- Consumes: deployed addresses/ABI from Task 4 and indexer behavior from Task 5.
- Produces: explicit local policy/version references and a disposable Creator → Backer → Judge → payout/refund acceptance run.

- [ ] Step 1: Add documentation assertions/checks.

Add a documentation check or script assertion that the runtime manifest, policy registry and contract deployment use the same policy version, chain id, token and window values.

- [ ] Step 2: Run the check and verify RED.

Run the new documentation/runtime identity check against the pre-remediation manifest. Expected: it identifies the old policy version or missing remediation parameters.

- [ ] Step 3: Update the policy registry and progress document.

Record the remediation version, exact local values, the ten findings’ implementation status, the Foundry/backend test commands and the remaining public-chain limitations. Do not claim public-chain safety or full acceptance until the runtime run passes.

- [ ] Step 4: Execute the disposable local acceptance flow.

Reset only disposable Anvil/PostgreSQL state using the repository’s existing reset scripts, deploy the VNext contracts, create a campaign, fund it with at least two Backers, complete one successful Judge-reviewed payout, then exercise a Creator timeout or failed review and claim all refunds. Compare contract balances, canonical events and PostgreSQL projections.

- [ ] Step 5: Run the complete verification set.

Run:

    cd contracts
    forge test

    cd ../backend
    npm test -- --runInBand src/indexer/tests/vnext-indexer.service.spec.ts src/indexer/tests/vnext-event-projector.spec.ts src/blockchain/deployment.spec.ts
    npm run build

Record any unavailable tool or runtime prerequisite explicitly; do not call an unexecuted Foundry or E2E command passing.

- [ ] Step 6: Commit.

    git add docs/protocol backend/scripts/campaigns
    git commit -m "docs: record VNext remediation acceptance status"

### Task 7: Final verification and review handoff

**Files:**
- Review: all files changed by Tasks 1–6
- Review: docs/superpowers/specs/2026-10-20-vnext-audit-remediation-design.md

**Interfaces:**
- Consumes: all task commits and their recorded test outputs.
- Produces: a verified branch review showing each audit finding mapped to code and passing evidence, or an explicit incomplete/blocker report.

- [ ] Step 1: Run repository diff and secret checks.

Run git diff --check, inspect git status --short, and scan changed files for private keys, seed phrases, credentials and accidental legacy authority.

- [ ] Step 2: Run the full contract and backend verification commands.

Run the commands from Tasks 4–6. Preserve exact counts and failures in the implementation ledger.

- [ ] Step 3: Verify every audit finding against current source.

For each P0/P1 item, identify the changed guard/state/ledger/event and the test that fails before the fix and passes after it. A passing in-memory projector alone does not close P1-09/P1-10.

- [ ] Step 4: Final review.

Use the review diff for the whole branch. Fix any Important finding with a new failing test, minimal implementation, focused verification and a follow-up commit before reporting completion.

- [ ] Step 5: Final handoff.

Report changed files, commit list, exact test results, unavailable runtime tools, accepted risks and any remaining production/public-chain gates. Do not describe ABI generation, database projection or submitted transactions as financial success unless canonical runtime evidence exists.
