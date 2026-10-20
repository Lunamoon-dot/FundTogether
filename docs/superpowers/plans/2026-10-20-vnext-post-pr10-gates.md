# FundTogether VNext Post-PR #10 Acceptance Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the agreed P0/P1 state-machine, projection-consistency, regression-validity and local-policy-conformance gates on top of PR #10 without changing the pure-decentralized authority model.

**Architecture:** The Campaign contract remains the only financial state machine. It will emit canonical milestone configuration/state events; the idempotent indexer will project those events into PostgreSQL and the in-memory projector. Runtime verification will read every policy-bearing getter/constant from the deployed local contracts and fail closed on mismatch.

**Tech Stack:** Solidity 0.8.24, Foundry, OpenZeppelin, TypeScript, NestJS, Drizzle PostgreSQL, viem, Jest, Node test runner, Anvil 31339.

**Spec:** `docs/superpowers/specs/2026-10-20-vnext-post-pr10-gates-design.md`

## Global Constraints

- Keep the protocol permissionless and purely decentralized; no Resolver, Admin, backend or database authority may decide review or move funds.
- Preserve the frozen local policy values in `docs/protocol/parameters-v2-remediation.md`.
- Smart-contract financial truth remains on-chain; PostgreSQL and MinIO remain derived/off-chain layers.
- Use integer-safe `uint256`/`bigint`; never use floating point for money or policy values.
- Retain `(stream_id, transaction_hash, log_index)` as event identity and `(stream_id, block_hash, log_index)` as block identity.
- Every production behavior change gets a regression test that is observed failing before the fix.
- Generated ABI artifacts must be regenerated from the current Foundry sources, never hand-edited.

## Review Focus

- A future milestone with deadline `0` must not be expireable or submitable before its predecessor is paid.
- A campaign in `CREATED`, `FUNDING`, `REFUNDING` or `COMPLETED` must not enter a milestone submission timeout path.
- A state event must be sufficient for projection update even when the related review event was emitted by `JuryReview` in another log.
- A retry/appeal must move the milestone review pointer and not leave the old case as the current case.
- A deployment with one mismatched policy getter must fail verification even when its `policyHash` and bytecode identity match the manifest.

### Task 1: Guard milestone activation and timeout

**Files:**
- Modify: `contracts/src/campaigns/CampaignEscrowVNext.sol`
- Test: `contracts/test/unit/VNext/FundingEscrow.t.sol`
- Test: `contracts/test/unit/VNext/PayoutRefund.t.sol`

**Interfaces:**
- Produces the canonical active-milestone guard used by timeout and evidence submission.
- Does not change public function signatures or frozen policy values.

- [x] **Step 1: Write failing Foundry regressions**

Add tests named `test_CannotExpireBeforeFunding`, `test_CannotExpireInactiveFutureMilestone`, `test_CannotExpireActiveMilestoneEarly` and `test_SuccessfulFundingThenCreatorTimeout`. Assert campaign and milestone state before the call, expect the exact revert for invalid paths, and assert `FUNDED → REFUNDING`, `TERMINAL` and refund pool changes for the valid timeout path.

- [x] **Step 2: Run the focused tests and verify RED**

Run from `contracts/`:

```powershell
& 'C:\Users\dell\AppData\Local\Temp\fundtogether-foundry\forge.exe' test --match-contract 'VNext(FundingEscrow|PayoutRefund)Test'
```

Expected: the new precondition tests fail because `expireMilestoneSubmission` accepts `PENDING` milestones with deadline `0` or accepts the wrong campaign/milestone state.

- [x] **Step 3: Implement the minimal guard**

Add an internal active-milestone lookup that returns the first unpaid milestone in order. Require `FUNDED` or `MILESTONES_RUNNING`, the selected ID to equal that active ID, and a nonzero deadline in the corresponding submission/correction branch. Add the same nonzero submission-deadline guard to `submitMilestoneEvidence` for a `PENDING` milestone.

The follow-up guard also rejects an uninitialized correction deadline in
`finalizeCorrectionFailure`, with a storage-level regression test covering the
defensive invariant.

- [x] **Step 4: Run the focused tests and verify GREEN**

Run the same Forge command. Expected: every new regression and existing focused test passes.

- [x] **Step 5: Commit**

```powershell
git add contracts/src/campaigns/CampaignEscrowVNext.sol contracts/test/unit/VNext/FundingEscrow.t.sol contracts/test/unit/VNext/PayoutRefund.t.sol
git commit -m "fix: guard VNext milestone timeout activation"
```

### Task 2: Emit and project canonical milestone transitions

**Files:**
- Modify: `contracts/src/interfaces/IVNextEvents.sol`
- Modify: `contracts/src/campaigns/CampaignEscrowVNext.sol`
- Test: `contracts/test/unit/VNext/MilestoneEvidence.t.sol`
- Test: `contracts/test/unit/VNext/PayoutRefund.t.sol`
- Modify: `backend/src/database/schema/vnext.schema.ts`
- Create: `backend/drizzle/fundtogether/0012_vnext_milestone_state.sql`
- Modify: `backend/src/indexer/vnext-indexer.service.ts`
- Modify: `backend/src/indexer/vnext-event-projector.ts`
- Test: `backend/src/indexer/tests/vnext-indexer.service.spec.ts`
- Test: `backend/src/indexer/tests/vnext-event-projector.spec.ts`
- Regenerate: `backend/src/blockchain/generated/vnext/CampaignEscrowVNext.json`

**Interfaces:**
- `MilestoneConfigured(campaignId, milestoneId, budget, acceptanceCriteriaHash)` creates every milestone projection row.
- `MilestoneStateChanged(campaignId, milestoneId, evidenceRevision, evidenceHash, reviewCaseId, finalOutcome, state, submissionDeadline, correctionDeadline, challengeDeadline, paid)` is the canonical state update payload.
- Persistent and in-memory projectors consume the same event semantics.

- [x] **Step 1: Write failing contract and projector tests**

Assert configuration events exist for every milestone and that a state transition event contains the new review case, final outcome and deadline values after ruling, retry, appeal, challenge resolution and timeout. Add persistent and in-memory replay tests proving the milestone row changes while the event identity remains idempotent.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
& 'C:\Users\dell\AppData\Local\Temp\fundtogether-foundry\forge.exe' test --match-contract 'VNext(MilestoneEvidence|PayoutRefund)Test'
Set-Location ..\backend
npm run test -- --runInBand --testMatch '**/src/**/*.spec.ts' --testPathPatterns 'src/indexer/tests/vnext-indexer.service.spec.ts|src/indexer/tests/vnext-event-projector.spec.ts'
```

Expected: event/projection assertions fail because the events, schema fields and handlers do not exist.

- [x] **Step 3: Implement event and projection support**

Add the two events, emit them after canonical state mutation, add the two deadline columns and migration, upsert rows in the persistent indexer, and mirror the transitions in `applyVNextEvent`. Keep `CampaignRefundsOpened`, `MilestonePaid` and existing evidence events for their established financial/evidence consumers.

- [x] **Step 4: Regenerate artifacts and run focused tests**

Run:

```powershell
Set-Location ..\contracts
& 'C:\Users\dell\AppData\Local\Temp\fundtogether-foundry\forge.exe' build
Set-Location ..\backend
node scripts/campaigns/generate-campaign-artifacts.cjs
npm run test -- --runInBand --testMatch '**/src/**/*.spec.ts' --testPathPatterns 'src/indexer/tests/vnext-indexer.service.spec.ts|src/indexer/tests/vnext-event-projector.spec.ts'
```

Expected: generated artifact checks and both projector suites pass.

- [x] **Step 5: Commit**

```powershell
git add contracts/src/interfaces/IVNextEvents.sol contracts/src/campaigns/CampaignEscrowVNext.sol contracts/test/unit/VNext/MilestoneEvidence.t.sol contracts/test/unit/VNext/PayoutRefund.t.sol backend/src/database/schema/vnext.schema.ts backend/drizzle/fundtogether/0012_vnext_milestone_state.sql backend/src/indexer/vnext-indexer.service.ts backend/src/indexer/vnext-event-projector.ts backend/src/indexer/tests/vnext-indexer.service.spec.ts backend/src/indexer/tests/vnext-event-projector.spec.ts backend/src/blockchain/generated/vnext/CampaignEscrowVNext.json
git commit -m "fix: project canonical VNext milestone states"
```

### Task 3: Verify the complete frozen local policy

**Files:**
- Modify: `backend/src/blockchain/vnext-deployment.ts`
- Modify: `backend/scripts/campaigns/vnext-runtime-identity.test.cjs`
- Modify: `docs/protocol/parameters-v2-remediation.md`
- Test: `backend/scripts/campaigns/vnext-runtime-identity.test.cjs`
- Regenerate: `backend/src/blockchain/generated/vnext/CampaignEscrowVNext.json`

**Interfaces:**
- `verifyVNextDeployment(client, manifest)` reads campaign and review getters/constants and fails closed on any mismatch.
- The expected matrix is sourced from the frozen remediation policy values; `policyHash` remains an identity check, not the sole policy proof.

- [x] **Step 1: Extend verifier tests with mismatch cases**

Make the fake client expose all campaign/review getter values. Add one failing test for a mismatched campaign window and one for a mismatched review parameter while keeping bytecode, manifest and policy hash identical.

- [x] **Step 2: Run verifier tests and verify RED**

Run from `backend/`:

```powershell
npm run build
npm run test:vnext-runtime
```

Expected: the mismatch cases do not fail verification until the getter matrix is implemented.

- [x] **Step 3: Implement complete policy reads**

Read and compare campaign submission/correction/challenge windows and maximum corrections; read and compare review enrollment/commit/reveal/randomness windows, minimum stake, risk multiplier, appeal bond/window/rounds, retry limit and minority slash rate, plus existing wiring and token checks. Keep exact integer values from the registry.

- [x] **Step 4: Run verifier and acceptance-focused tests**

Run:

```powershell
npm run build
npm run test:vnext-runtime
```

Expected: matching fake deployment passes and every mismatch fails closed. The live acceptance script remains a runtime-dependent check and must not be claimed successful without a fresh Anvil/PostgreSQL run.

- [x] **Step 5: Commit**

```powershell
git add backend/src/blockchain/vnext-deployment.ts backend/scripts/campaigns/vnext-runtime-identity.test.cjs backend/scripts/campaigns/vnext-acceptance.cjs backend/src/blockchain/generated/vnext/JuryReview.json
git commit -m "test: verify complete VNext local policy"
```

### Task 4: Full verification and remediation status

**Files:**
- Modify: `docs/protocol/IMPLEMENTATION_PROGRESS_VNEXT.md`
- Modify: `docs/protocol/README.md` if the status table requires the new gate evidence

- [x] **Step 1: Run contract and focused backend verification**

Run:

```powershell
Set-Location ..\contracts
& 'C:\Users\dell\AppData\Local\Temp\fundtogether-foundry\forge.exe' test
Set-Location ..\backend
npm run build
npm run test:vnext-runtime
npm run test -- --runInBand --testMatch '**/src/**/*.spec.ts' --testPathPatterns 'src/indexer/tests/vnext-indexer.service.spec.ts|src/indexer/tests/vnext-event-projector.spec.ts'
```

Expected: all Foundry tests pass, runtime identity tests pass, focused indexer tests pass, and no generated artifact or migration check fails.

- [x] **Step 2: Run static checks and inspect the diff**

Run `git diff --check`, inspect `git diff origin/main...HEAD`, confirm no Resolver/Admin authority was added, and confirm the unique event indexes are unchanged.

- [x] **Step 3: Record evidence without overclaiming**

Update implementation progress with exact command results and retain the distinction between local acceptance evidence and production security audit status.

- [x] **Step 4: Commit documentation**

`docs/protocol/README.md` required no change because it already links the
implementation progress record and states the local-evidence boundary.

```powershell
git add docs/protocol/IMPLEMENTATION_PROGRESS_VNEXT.md docs/protocol/README.md
git commit -m "docs: record VNext post-PR10 gate evidence"
```

## Final verification contract

Before claiming completion, verify every gate against current source and output:

- P0 timeout exploit has a failing-then-passing regression test and no reachable inactive milestone path;
- milestone configuration and state transitions are projected idempotently;
- timeout tests demonstrate pre-state and post-state around the intended successful-funding path;
- verifier checks the complete frozen policy matrix;
- Foundry, focused backend tests, build, generated artifacts and diff checks pass;
- no claim is made that local evidence equals a production security audit.

