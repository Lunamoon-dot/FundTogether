# Funding Lifecycle Implementation Plan

> **Path update — 2026-10-03:** Contract suites now live under
> `contracts/test/unit/FundTogether/`, and MockUSDC lives under
> `contracts/test/mocks/`. Paths below retain the original plan's layout.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the MVP campaign funding lifecycle around the existing ERC20 donation and organizer bond prototype.

**Architecture:** A campaign starts in `DRAFT`. A trusted resolver approves it, the organizer publishes it after locking the bond, and only `FUNDING` campaigns accept donations. Reaching the goal moves the campaign to `FUNDED`; organizer cancellation and deadline failure move it to terminal failure states.

**Tech Stack:** Solidity 0.8.24, Foundry 1.8.4, OpenZeppelin `SafeERC20`, forge-std tests.

**Spec:** `docs/protocol-spec.md`, `docs/state-machine.md`, `docs/financial-rules.md`.

## Global Constraints

- Smart contract state is authoritative for funding status, bond custody and contributions.
- Use integer token units and ERC20 `SafeERC20` transfers.
- Do not add AI review, bank transfer, funding tiers, milestones or refund claims in this slice.
- A failed transaction must leave accounting unchanged.
- Every state-changing funding action emits an event.

## Review Focus

- Donation before publish must revert.
- Donation after the deadline or after the goal is reached must revert.
- Only the trusted resolver can approve a campaign.
- Only the organizer can publish or cancel their campaign.
- A campaign cannot be approved, published, cancelled or finalized twice.

---

### Task 1: Define campaign lifecycle state and resolver authority

**Files:**
- Modify: `contracts/src/FundTogether.sol`
- Test: `contracts/test/FundTogetherFunding.t.sol`

**Interfaces:**
- `constructor(address resolver)` stores the trusted resolver.
- `approveCampaign(uint256 campaignId)` is resolver-only and moves `DRAFT` to `APPROVED`.
- `publishCampaign(uint256 campaignId)` is organizer-only and moves `APPROVED` to `FUNDING`.
- `CampaignState` exposes `DRAFT`, `APPROVED`, `FUNDING`, `FUNDED`, `FUNDING_FAILED`, and `CANCELLED`.

- [ ] Write failing tests for approval authorization, publish guards and duplicate transitions.
- [ ] Run `forge test --match-contract FundTogetherFundingTest` and verify the expected missing-interface failures.
- [ ] Implement the enum, resolver, state field and approval/publish functions.
- [ ] Run the focused tests and then the full suite.

### Task 2: Enforce funding rules

**Files:**
- Modify: `contracts/src/FundTogether.sol`
- Test: `contracts/test/FundTogetherFunding.t.sol`

**Interfaces:**
- Campaign creation records a `fundingDeadline`.
- `donate` is valid only in `FUNDING` before the deadline.
- A donation that reaches the goal transitions the campaign to `FUNDED`.
- Donations that exceed the remaining goal revert.

- [ ] Write failing tests for pre-publish, post-deadline, post-funded and over-goal donations.
- [ ] Implement deadline and state guards plus the automatic `FUNDING` → `FUNDED` transition.
- [ ] Run the focused and full test suites.

### Task 3: Add organizer cancellation and deadline failure

**Files:**
- Modify: `contracts/src/FundTogether.sol`
- Test: `contracts/test/FundTogetherFunding.t.sol`

**Interfaces:**
- `cancelCampaign(uint256 campaignId)` is organizer-only while `FUNDING` and moves to `CANCELLED`.
- `finalizeFundingFailure(uint256 campaignId)` is permissionless after the deadline when the goal is not reached and moves to `FUNDING_FAILED`.
- Both terminal transitions emit their event and prevent further donations.

- [ ] Write failing tests for caller, state, deadline and duplicate-call guards.
- [ ] Implement the two terminal transitions without adding refund claims yet.
- [ ] Run `forge test` and `forge build`.

### Task 4: Record verified progress

**Files:**
- Modify: `docs/PROJECT_PROGRESS.md`

- [ ] Record the verified command output and test count after Tasks 1–3 pass.
