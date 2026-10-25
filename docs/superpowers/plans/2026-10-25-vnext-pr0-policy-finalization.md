# VNext PR0 Policy Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finalize and publish the V2 policy package for PR0 without changing runtime behavior.

**Architecture:** Keep the V2 specification as the protocol narrative. Add a decision record for O1–O8, a machine-readable parameter registry for approved/proposed values, and a PR1–PR4 acceptance matrix. Cross-reference the package from the protocol README and V2 spec.

**Tech Stack:** Markdown, Git review, repository text checks.

**Spec:** `docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V2.md` and `docs/superpowers/specs/2026-10-25-vnext-pr0-policy-finalization-design.md`

## Global Constraints

- No runtime, ABI, schema, deployment, chain, or data changes.
- Preserve all locked V2 decisions and the two-choice BackerDAO authority.
- Use integer token base units and checked arithmetic; never floating point.
- Mark every unapproved parameter as `PROPOSED_PENDING_APPROVAL`.

## Review Focus

- Formula ambiguity: O1 must have a named formula, snapshot, threshold, tie, replay, and overflow rules plus vectors.
- Pre-funding publication: O2/O8 must not invent a Backer electorate or charge milestone escrow.
- Reset solvency: O3/O4 must cap resets and penalties by locked stake and keep reset outside the review reserve.
- Terminal behavior: O6 must fail closed after bounded Court 2 reset attempts.
- Accounting: reward reserve, creator payout, unused reserve, and refunds must be mutually exclusive and conservation-preserving.

### Task 1: Policy decision record

**Files:**
- Create: `docs/protocol/PR0_POLICY_FINALIZATION.md`

- [ ] Record O1–O8 dispositions, conflicts, pending approvals, and explicit non-goals.
- [ ] Add the Court Reset and publication state boundaries.
- [ ] Verify every open issue has one owner, one status, and one acceptance gate.

### Task 2: Parameter registry and formula vectors

**Files:**
- Create: `docs/protocol/parameters-v2-policy.md`

- [ ] Publish policy identity, units, ranges, freeze points, reset caps, reward/reserve formulas, and refund rules.
- [ ] Publish CWQ-1 candidate formula, overflow/replay guards, and exact vectors.
- [ ] Mark pending approvals so registry values cannot be mistaken for deployed policy.

### Task 3: PR1–PR4 acceptance criteria

**Files:**
- Create: `docs/protocol/PR1-PR4_ACCEPTANCE_CRITERIA.md`

- [ ] Define Foundry-first tests for milestone funding, reward/reserve accounting, reset penalties, and BackerDAO/Court 2.
- [ ] Include state, authorization, conservation, duplicate-claim, timeout, and failed-transfer gates.
- [ ] Link each gate to the registry and the V2 event/state requirement.

### Task 4: V2 cross-references and documentation index

**Files:**
- Modify: `docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V2.md`
- Modify: `docs/protocol/README.md`

- [ ] Add a PR0 status block and resolve contradictory wording by pointing to the decision record and registry.
- [ ] Keep runtime claims explicitly out of scope.
- [ ] Link the new policy artifacts from the protocol index.

### Task 5: Verification and review artifact

- [ ] Run Markdown/link/reference checks and targeted searches for stale O1–O8 wording.
- [ ] Confirm `git diff --name-only` contains only PR0 documentation plus the plan/design files.
- [ ] Commit on `codex/pr0-policy-finalization`, push, and open a review PR without merging.
