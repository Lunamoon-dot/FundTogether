# FundTogether Project Progress

> **Updated:** 2026-10-03

This file records verified implementation progress. A documented idea is not
marked `DONE` until a command, test, transaction or projection provides
evidence.

## Current milestone

```text
Phase 1 — Contract prototype: IN_PROGRESS
```

The current prototype validates ERC20 donations, organizer bond custody,
funding transitions and pre-funded cancellation/failure refunds. Milestone
release, post-funded refunds and slashing remain unimplemented.

## Verified progress

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

## IN_PROGRESS

- Define the next milestone escrow slice and its accounting boundaries.

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
