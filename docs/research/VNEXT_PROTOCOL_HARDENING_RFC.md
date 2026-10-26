# FundTogether VNext Protocol Hardening RFC

**Status:** design-only RFC; no runtime approval

**Audit baseline:** `origin/main` at `fb0e346e7253e4fbe8b4681c4fbf9dbdaa84e2d8` (PR #20, 2026-10-26). The working tree was already dirty; this RFC does not rely on or modify those unrelated changes.

**Scope:** close the protocol gaps identified after PR1–PR4 and define the minimum evidence required before isolated fixture remediation or production integration. This document does not implement PR5, change Solidity, or promote a `PROPOSED_PENDING_APPROVAL` value to approved policy.

## 1. Executive assessment

The PR1–PR4 research fixtures are useful, but they do not yet prove a complete VNext protocol. The most important safety boundary is missing from the fixture composition: `V2BackerDaoCourt2Fixture.createWorkflowCase` can bind a funded-case identity from the frozen deliverable terms without requiring a canonical evidence submission and freeze transition. That permits a court transcript to be associated with a deliverable commitment rather than with the exact revision actually submitted for review.

The recommended hardening is deliberately small:

1. Add an evidence revision state machine and bind every case to one frozen revision.
2. Add a permissionless, deadline-bounded assignment window. If three eligible Judges cannot be assigned, finalize `PROTOCOL_FAIL` with zero assigned-duty liabilities.
3. Replace contributor-wide work during claims with a paginated snapshot and O(1) claim paths. Keep the snapshot and refund entitlement authoritative on-chain.
4. Require stake-qualified Judges and bounded, seed-driven selection from an active eligible set.
5. Keep milestone custody, Judge reward claims, reset compensation, and registry stake as separate ledgers, then verify their aggregate conservation across cases.

These changes improve custody, liveness, and auditability. They do not establish truthfulness of evidence, Sybil resistance, collusion resistance, or correct majority outcomes.

## 2. Source-of-truth audit

### 2.1 Confirmed facts at the audit baseline

| Classification | Evidence | Finding |
| --- | --- | --- |
| Product direction | `docs/research-direction.md`, `docs/PROJECT_OVERVIEW.md` | Target is permissionless, stake-backed review and contract-owned financial transitions. Resolver/Admin/backend rows are not financial authority. |
| Locked target decisions | `docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md` and V2 decision register | Three-Judge courts, commit–reveal, separate `PROTOCOL_FAIL`, pull settlement, integer-safe custody, and Court 1/Court 2 isolation are the design boundary. |
| Policy candidate | `docs/protocol/PR0_POLICY_FINALIZATION.md`, `docs/protocol/parameters-v2-policy.md` | `CWQ-1`, `CCPS-1`, `DAO-TEMPORAL-1`, publication policy, and numeric values remain `PROPOSED_PENDING_APPROVAL`. |
| V2 funding fixture | `contracts/test/fixtures/V2FundingFixture.sol` and `contracts/test/unit/VNext/V2FundingFixture.t.sol` | Complete typed campaign terms, exact-target funding, sequential milestone activation, funding-failure refunds, and failed-transfer rollback are exercised in a Foundry-only fixture. |
| V2 accounting fixture | `contracts/test/fixtures/V2FinancialAccountingFixture.sol`, `contracts/test/invariant/V2FinancialAccountingInvariant.t.sol` | Fixed reward arithmetic, creator payout, reward claim ledger, refunds, `FINAL_PASS`, `VERDICT_FAIL`, and `PROTOCOL_FAIL` custody are tested in isolated scenarios. |
| V2 reset fixture | `contracts/test/fixtures/V2CourtResetFixture.sol`, `contracts/test/invariant/V2CourtResetInvariant.t.sol` | Per-seat collateral reservation, one-total CCPS compensation, reset history, commit–reveal validity, and terminal reset paths are tested in isolation. |
| V2 DAO fixture | `contracts/test/fixtures/V2BackerDaoCourt2Fixture.sol`, `contracts/test/unit/VNext/V2BackerDaoCourt2Fixture.t.sol` | CWQ-1 vectors, snapshot behavior, DAO timing, voter exclusion, Court 2 reversal, Court 2 exhaustion, and settlement composition are tested as a research fixture. |
| Current runtime | V2 specification section 3 and current contract tree | The runtime is a partially implemented earlier VNext slice, not the V2 fixture architecture. Existing Resolver behavior is historical implementation residue. |

### 2.2 Important limitations of the evidence

- The fixture comments explicitly describe deterministic entropy as a test seam, not unbiased production randomness or Sybil resistance.
- The fixtures do not constitute a deployed campaign, a fresh Anvil/PostgreSQL/MinIO vertical acceptance, or a production-ready policy.
- The existing fixture tests were inspected but not executed for this RFC. No test result is claimed here.
- The requested PR0 files exist in `origin/main`; some are absent from the local checkout because the local branch is behind `origin/main`. The audit therefore uses the requested `origin/main` object directly.
- The current working tree contains unrelated staged and unstaged changes. They are not evidence for this RFC and were left untouched.

### 2.3 Source references

- Product boundary and implementation status: `docs/research-direction.md`, `docs/PROJECT_OVERVIEW.md`.
- V1 state machines, evidence hash limits, court semantics, conservation, and invariants: `docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md`.
- V2 gap analysis and pending decisions: `docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V2.md`.
- Policy status and consuming gates: `docs/protocol/PR0_POLICY_FINALIZATION.md`, `docs/protocol/parameters-v2-policy.md`, `docs/protocol/PR1-PR4_ACCEPTANCE_CRITERIA.md`.
- Commit baseline: `fb0e346e7253e4fbe8b4681c4fbf9dbdaa84e2d8`.

## 3. Threat model

### 3.1 Assets and security properties

| Asset/property | Required protection |
| --- | --- |
| Milestone contribution escrow | Only the frozen state machine may authorize creator payout, Judge reward funding, or refunds. |
| Evidence identity | A case must refer to one immutable campaign, milestone, revision, criteria hash, and content hash. |
| Judge stake | A stake unit cannot be simultaneously available, reserved for two obligations, slashed twice, or used to fund an uncollateralized claim. |
| Review history | Invalid courts, retries, DAO ballots, evidence revisions, and final rulings remain distinct and replay-resistant. |
| Backer entitlement | Snapshot membership, weights, and refund dust are immutable after the relevant freeze point. |
| Liveness | Every missing-Judge or no-evidence path reaches an explicit terminal outcome after a bounded deadline. |

### 3.2 Actors and capabilities

| Actor | Can attempt | Must not be able to |
| --- | --- | --- |
| Creator | Submit evidence for the creator wallet committed in the campaign; resubmit only under the correction policy | Change acceptance criteria, payout, an already frozen revision, or review outcome |
| Backer | Contribute, cast an eligible ACCEPT/APPEAL ballot, claim own refund | Change a snapshot, submit PASS/FAIL, or authorize payout |
| Judge | Deposit stake, accept a seat, commit and reveal one vote | Occupy duplicate seats, join both pools for one case, or conceal a missing duty without the policy penalty |
| Permissionless caller | Open/close windows, finalize timeout, settle a valid/invalid court, and trigger claims | Select arbitrary Judges, alter policy, or create a financial result from an indexer row |
| Backend/indexer | Store private bytes, validate presentation, index canonical events | Decide evidence validity, create a case, override a ruling, or move funds |
| Adversary | Split wallets, collude, bribe, withhold reveals, submit unavailable bytes, exploit timing, or register spam wallets | Bypass contract guards without an implementation defect |

### 3.3 Accepted non-goals

The protocol does not prove that evidence is true, authored by the Creator, publicly available, or high quality. Stake, hashes, a majority, and a multi-court result are economic and integrity mechanisms, not an oracle of reality. Sybil wallets, stake concentration, collusion, bribery, inactive Judges, and incorrect majority outcomes remain research variables.

## 4. A1 — Funding, evidence, and Court 1 binding

### 4.1 Recommended state machine

```text
FUNDING_OPEN
    │ exact target reached
    ▼
FUNDED_PENDING_EVIDENCE
    │ creator submits a new revision before deadline
    ▼
EVIDENCE_SUBMITTED
    │ permissionless freeze after availability/integrity checks
    ▼
EVIDENCE_FROZEN
    │ one case may be created for this frozen revision
    ▼
CASE_READY
    │ assignment window opens
    ▼
COURT1_ASSIGNMENT_PENDING → COURT1_ACTIVE → COMMIT/REVEAL
```

Terminal alternatives:

```text
FUNDED_PENDING_EVIDENCE --deadline/no revision--> EVIDENCE_TIMEOUT → PROTOCOL_FAIL
EVIDENCE_SUBMITTED      --availability failure--> EVIDENCE_RETRY or EVIDENCE_TIMEOUT
EVIDENCE_FROZEN         --duplicate case--> revert
```

`EVIDENCE_TIMEOUT` is a procedural outcome. It must not trigger minority slashing or be relabeled as a substantive `VERDICT_FAIL`. The research-fixture default should fail closed, refund the remaining milestone escrow after any already-authorized liabilities, and permit only an explicitly approved correction path. The current fixture has a submission deadline field, but no evidence record/state transition that enforces this boundary.

### 4.2 Canonical evidence record

Freeze this record before case creation:

```text
EvidenceRecord {
  campaignId
  milestoneId
  evidenceRevision              // monotonic, starts at 1
  evidenceContentHash           // hash of canonical evidence bytes/manifest
  acceptanceCriteriaHash        // copied from frozen campaign terms
  deliverableCommitment         // copied from frozen campaign terms
  creator                       // committed creator wallet
  submittedAt
  submissionDeadline
  availabilityReferenceHash     // optional manifest/reference commitment
  policyVersion
  frozen                        // one-way state bit
}
```

The content hash authenticates bytes, not facts. Availability must be handled separately: the contract can require a canonical manifest or an availability attestation before freezing, while the backend only serves the private bytes and records retrieval failures. A missing or inaccessible object must not be silently presented as accepted evidence.

Case identity should be derived from the complete frozen context:

```text
caseId = keccak256(abi.encode(
  policyVersion, deploymentIdentity, campaignId, milestoneId,
  evidenceRevision, evidenceContentHash, acceptanceCriteriaHash
))
```

The case must store or verify the same tuple. A transcript for a previous revision cannot authorize the current milestone.

### 4.3 Transition guard matrix

| Transition | Caller | Required guards | Failure behavior |
| --- | --- | --- | --- |
| `FUNDING_OPEN → FUNDED_PENDING_EVIDENCE` | contributing backer | exact target, active milestone, deadline, exact token transfer | atomic revert; no partial ledger update |
| `FUNDED_PENDING_EVIDENCE → EVIDENCE_SUBMITTED` | committed creator wallet | milestone funded, before submission deadline, revision = previous + 1, nonzero hashes, criteria unchanged | revert; old revision remains authoritative |
| `EVIDENCE_SUBMITTED → EVIDENCE_FROZEN` | permissionless caller | revision exists, content/manifest availability check passes, not already frozen | revert or explicit availability retry; no case created |
| `EVIDENCE_FROZEN → CASE_READY` | permissionless caller | no case bound to `(campaign,milestone,revision)`, exact case tuple, funding still valid | duplicate/replay reverts |
| `CASE_READY → COURT1_ASSIGNMENT_PENDING` | permissionless caller | case identity verified, policy version frozen, assignment window not expired | timeout path, not arbitrary assignment |
| `EVIDENCE_SUBMITTED → EVIDENCE_SUBMITTED` | committed creator wallet | only before freeze and only under a versioned replacement policy | old revision remains immutable; replacement gets a new revision/hash |
| any frozen revision → new case | any caller | never allowed for same revision | revert |
| `FUNDED_PENDING_EVIDENCE → EVIDENCE_TIMEOUT` | permissionless caller | submission deadline elapsed, no frozen revision | `PROTOCOL_FAIL`, no Judge case, no reward/slash |

### 4.4 Minimal interface proposal

```solidity
function submitEvidence(
    uint256 campaignId,
    uint256 milestoneId,
    uint256 evidenceRevision,
    bytes32 evidenceContentHash,
    bytes32 availabilityReferenceHash
) external;

function freezeEvidence(
    uint256 campaignId,
    uint256 milestoneId,
    uint256 evidenceRevision
) external;

function createReviewCase(
    uint256 campaignId,
    uint256 milestoneId,
    uint256 evidenceRevision
) external returns (bytes32 caseId);

function finalizeEvidenceTimeout(
    uint256 campaignId,
    uint256 milestoneId
) external;
```

`createReviewCase` may be permissionless, but it must read the canonical record from the contract or a configured review contract and not trust caller-supplied hashes. `freezeEvidence` must be one-way. If availability is off-chain, the policy must specify who can publish an unavailable result, how long the retry window lasts, and whether the terminal path is correction or `PROTOCOL_FAIL`.

### 4.5 Guard pseudocode

```text
submitEvidence(campaign, milestone, revision, contentHash, availabilityHash):
    assert msg.sender == campaign.creator
    assert milestone.state == FUNDED_PENDING_EVIDENCE
    assert now < milestone.submissionDeadline
    assert revision == milestone.latestRevision + 1
    assert contentHash != 0 and availabilityHash != 0
    assert acceptanceCriteriaHash == milestone.frozenCriteriaHash
    store EvidenceRecord(..., frozen=false)
    milestone.latestRevision = revision
    milestone.state = EVIDENCE_SUBMITTED

freezeEvidence(campaign, milestone, revision):
    record = evidence[campaign][milestone][revision]
    assert record exists and !record.frozen
    assert availabilityPolicySatisfied(record)
    record.frozen = true
    milestone.frozenRevision = revision
    milestone.state = EVIDENCE_FROZEN

createReviewCase(campaign, milestone, revision):
    assert milestone.state == EVIDENCE_FROZEN
    assert revision == milestone.frozenRevision
    assert no case exists for (campaign, milestone, revision)
    caseId = deriveCaseId(frozen record)
    bind caseId to the complete evidence tuple
    milestone.state = CASE_READY
```

### 4.6 Required tests

Unit tests must cover: unfunded case creation; creator-only submission; revision gaps; changed criteria; post-deadline submission; freeze twice; case creation twice; wrong campaign/milestone/revision; old transcript against a new revision; unavailable evidence; non-creator evidence submission; and failed token transfers around the funding transition.

Fuzz tests should vary revision numbers, deadlines, hashes, caller, funding amount, and repeated calls. Invariants should prove:

- at most one frozen revision is active for a milestone;
- every case binds to exactly one frozen revision;
- no case exists before funding and evidence freeze;
- a prior revision cannot authorize a later payout;
- evidence transitions cannot spend escrow;
- timeout creates no assigned-Judge or review-reward liability.

### 4.7 Impact on PR1–PR4 fixtures

- **PR1:** keep funding-only behavior, but expose `FUNDED_PENDING_EVIDENCE` rather than implying review readiness. The fixture must not fabricate evidence or a case.
- **PR2:** require the settlement transcript to carry the exact evidence revision and case binding; accounting remains independent of evidence bytes.
- **PR3:** derive reset settlement IDs from the bound case/revision and preserve the invalid history.
- **PR4:** `createWorkflowCase` must require `EVIDENCE_FROZEN`; Court 2 must reuse the same frozen revision and criteria hash.
- **Indexer:** index `MilestoneEvidenceSubmitted`, `EvidenceFrozen`, `ReviewCaseCreated`, and timeout events idempotently; a database row cannot create case authority.

## 5. A2 — Court 1 liveness and exhaustion

### 5.1 Finding

The PR4 fixture has a Court 2 assignment-exhaustion seam, but the base `assignCourt` path scans `judgePool` and reverts when fewer than three eligible Judges exist. Court 1 has no equivalent bounded permissionless exhaustion transition. Registration also appends to an unbounded array, and selection linearly scans that array. This is acceptable as a small Foundry seam, not as a liveness proof for a permissionless registry.

### 5.2 Candidate timeout policies

| Policy | Behavior | Strength | Cost/risk |
| --- | --- | --- | --- |
| **T1-A: hard close/fail** | Assignment is allowed only before `assignmentDeadline`. At or after the deadline, any caller finalizes `PROTOCOL_FAIL`, even if three eligible Judges exist. | Smallest state machine and strongest wall-clock bound. | A caller can deliberately wait, converting an assignable case into failure. Existing candidates and escrow can be griefed by transaction omission. |
| **T1-B: atomic close, assign-or-fail** | Assignment is allowed before the deadline. At or after it, ordinary assignment is disabled and any caller invokes one close transition that atomically assigns three eligible Judges if possible, otherwise finalizes `PROTOCOL_FAIL`. | Bounded and prevents the closer from choosing failure while enough candidates exist. | The close call needs bounded selection and precommitted/unbiasable entropy; a large eligibility scan would reintroduce a gas-liveness failure. |
| **T1-C: assignment grace period** | Enrollment closes at one deadline, assignment remains possible during a second bounded grace period, then exhaustion finalizes. | Separates candidate formation from transaction inclusion. | Adds a second deadline, more immobilization, and a new griefing/timing surface. |
| **T2: bounded attempt windows** | Permit at most `A` selection attempts, each with its own short window. A failed attempt may be retried after fresh eligibility is observed; after `A`, finalize `PROTOCOL_FAIL`. | Gives the pool more than one opportunity and preserves history. | More state, more griefing surface, and more latency; each attempt must revalidate collateral and uniqueness. |

### 5.3 Recommended isolated-fixture default

Use **T1-B** for an isolated research fixture, with duration, entropy source, eligibility-freeze rule, and production adoption marked `PROPOSED_PENDING_APPROVAL`. The deadline starts when the case reaches `CASE_READY`, not when a caller first invokes assignment.

Recommended boundary semantics:

1. Before `assignmentDeadline`, permissionless `assignCourt` may atomically choose three unique eligible Judges and reserve all three collateral amounts.
2. At `block.timestamp >= assignmentDeadline`, ordinary `assignCourt` is disabled. A permissionless `closeAssignmentWindow` executes exactly one atomic branch.
3. The close transition evaluates the eligible set at that transaction. If at least three candidates exist, it must assign; the caller cannot select `PROTOCOL_FAIL`. If fewer than three exist, it records unassigned exhaustion and finalizes `PROTOCOL_FAIL`.
4. Eligibility changes before close are visible under this default. A true deadline snapshot would require a separately approved bounded snapshot process; block time alone cannot materialize an on-chain snapshot.
5. The assignment entropy must be committed or otherwise fixed before the close caller can choose transaction timing. Deterministic fixture entropy is acceptable only as a test seam.
6. Repeated close/assignment calls revert after the first successful transition. A failed reservation or token/stake operation reverts the entire transition and leaves the case pending for retry.

The selection function must not promise success. It either returns three unique Judges and reserves their full required collateral atomically, or returns a bounded failure that leaves the case unassigned. If no case was assigned, no Judge has an assigned-duty penalty, no valid service reward is accrued, and no compensation claim exists.

### 5.4 Liability proof under T1-B

For every assigned seat:

```text
lockedCaseStake_i >= max(caseStakeRequirement, resetCostMax)
```

Therefore a sole offender can fund the maximum defined reset liability. A valid court consumes only the frozen valid-court reward reserve. An invalid court debits only the offending locked stake and credits already-funded pull claims. Existing valid-court liabilities remain in the reward ledger; they are never paid from a later Judge's stake or from milestone contribution escrow. A no-candidate timeout creates none of these obligations.

The resulting terminal paths are:

```text
CASE_READY
   ├─ assign before deadline with three eligible Judges → COURT1_ACTIVE
   └─ deadline reached → closeAssignmentWindow
         ├─ at least three eligible → atomic assignment → COURT1_ACTIVE
         └─ fewer than three eligible → PROTOCOL_FAIL, refund path

COURT1_ACTIVE
   ├─ all three valid reveals → substantive Court 1 result
   └─ deadline with missing duty → CCPS settlement → bounded reset or PROTOCOL_FAIL
```

### 5.5 Remaining liveness limits

An unassigned `PROTOCOL_FAIL` authorizes no creator payout, service reward, slash, or reset compensation. After the terminal accounting transition, the milestone's remaining contribution escrow becomes a funded Backer refund liability under the frozen refund policy. Claims remain pull-based and idempotent. Failure to complete refund-entitlement preparation must not relabel or erase the protocol failure.

Required boundary tests cover: one second before deadline; exactly at deadline; after deadline with two candidates; after deadline with exactly three and more than three candidates; eligibility gained/lost before close; delayed malicious caller; caller-supplied entropy rejection; duplicate close; assignment/close race ordering; partial collateral-reservation failure with atomic rollback; no slash/reward on unassigned failure; and exact terminal refund/funded-liability accounting.

T1-B cannot guarantee liveness if the chain is halted, the bounded selection/finalization call exceeds the block gas limit, the approved randomness source fails without a fallback, or no transaction is included. It guarantees only a protocol-visible path once the chain is live and the bounded close call can execute. Production semantics remain pending owner approval.

## 6. A3 — Bounded contributor, DAO, and refund processing

### 6.1 Current risk

`V2BackerDaoCourt2Fixture.openDao` loops through every contributor. The accounting fixture maintains a sorted contributor array by insertion, and `_refundDustAndRank` scans all contributors during a refund entitlement query. These loops are suitable for small vectors but can make a permissionless funding path or individual claim exceed the block gas limit as contributor count grows.

### 6.2 Alternatives

| Design | Trust assumptions | Gas/scalability | Security and economic risks | Compatibility |
| --- | --- | --- | --- | --- |
| Incremental weights and aggregate denominator | Contract correctly checkpoints each wallet's contribution and updates `Σ floor_sqrt(c_i)` | O(1) contribution updates; O(1) snapshot total, but per-wallet historical checkpoints remain necessary | Must prevent post-open contribution changes from altering a wallet's snapshot; nonlinear square-root updates are easy to implement incorrectly | Moderate; changes contribution storage and DAO snapshot semantics |
| Paginated on-chain snapshot/processing | No trusted off-chain calculator; callers execute bounded batches | O(n) total work but bounded O(k) per transaction; claims can be O(1) after snapshot | Snapshot cannot finalize until all contributors are processed; a malicious large contributor set can delay finalization, but not silently change it | Highest for the current fixtures; preserves exact wallet-level ballots |
| Merkle/proof claims | Root publisher is trusted or a challenge/fraud-proof mechanism exists | O(log n) claims; root generation is off-chain | Wrong root, unavailable tree, fraudulent weight, and challenge timing become protocol risks; dust and voter uniqueness need separate commitments | Low without a new root/challenge policy |
| Hybrid off-chain computation with on-chain verification | A committed root plus verifier and a dispute mechanism | Efficient on-chain path after root publication | Backend/root is not financial authority only if fraud can be challenged and finality is permissionless; otherwise it violates the boundary | Low; largest implementation and policy surface |

### 6.3 Recommendation

Use **paginated on-chain snapshot processing** for the isolated V2 research fixture. It is the smallest design that preserves wallet-level eligibility, snapshot immutability, deterministic weight calculation, and no trusted financial root.

Recommended flow:

```text
DAO_OPEN_REQUESTED
   ↓ processContributorBatch(start, maxItems)
DAO_SNAPSHOT_PROCESSING ── repeat ──┐
   ↓ all contributors processed       │
DAO_SNAPSHOT_FROZEN ◄────────────────┘
   ↓ ballots and bounded voting window
DAO_FINALIZED
```

The snapshot stores, for each eligible wallet, its immutable snapshot contribution, weight, ballot status, and an index. It stores `totalWeight` and `eligibleWalletCount` incrementally. No ballot is accepted until the snapshot is complete. The contribution ledger may continue to receive later milestones, but later contributions cannot affect the frozen snapshot.

For refunds, preserve the policy registry's candidate `canonical_address_prefix` rule; do not collapse all dust into one lowest-address wallet. Freeze the positive-contribution wallets in strictly ascending canonical address order. For wallet `i`:

```text
base_i = floor(contribution_i * RefundPool / ContributionSnapshot)
allocatedBase = sum(base_i)
dust = RefundPool - allocatedBase

entitlement_i = base_i + 1, if canonicalRank_i < dust
              = base_i,     otherwise
```

Use checked multiplication or a full-precision `mulDiv` floor operation. Each fractional remainder is less than one base unit, so with `n` positive-contribution wallets, `0 <= dust < n`. Exactly the first `dust` wallets receive one extra base unit. A wallet with `base_i = 0` may still receive one dust unit when its canonical rank is in the prefix; that is the policy's deterministic conservation behavior.

Use a two-phase bounded, resumable state machine:

```text
REFUND_SNAPSHOT_FROZEN
  -> BASE_PROCESSING(cursor, allocatedBase)
  -> BASE_COMPLETE(dust frozen)
  -> DUST_PROCESSING(dustCursor)
  -> ENTITLEMENTS_FINALIZED
  -> CLAIMS_OPEN
```

`processRefundBaseBatch(maxItems)` reads the stored cursor, processes the next canonical interval, stores each `base_i` and rank, adds to `allocatedBase`, and advances the cursor once. When `cursor == contributorCount`, `finalizeRefundBase` freezes `dust` after checking `allocatedBase <= RefundPool` and `dust < contributorCount` (with an explicit empty-set rule). `processRefundDustBatch(maxItems)` adds one exactly once to ranks `[dustCursor, min(dustCursor + maxItems, dust))`. It never chooses recipients from call order. Finalization opens claims only when the base pass and complete dust prefix are recorded.

Callers cannot supply an arbitrary start index; if an API includes `expectedCursor`, it must equal the stored cursor or revert. Phase, cursor, per-wallet preparation, finalization, and claim flags make replay idempotent. A reverted batch leaves cursor, totals, and entitlements unchanged. A completed batch cannot be replayed, dust cannot be assigned twice, contributor order cannot change after freeze, and claims remain closed while either pass is incomplete.

Deterministic acceptance vectors must include:

- a positive contributor whose floor `base_i` is zero, both outside and inside the dust prefix;
- a nonzero dust case proving each of the first `dust` canonical addresses receives exactly one extra unit and total entitlement equals `RefundPool`;
- multiple partial base and dust batches producing the same mapping as one complete calculation;
- an out-of-order or stale cursor call reverting without state change;
- repeated batch/finalization calls reverting or remaining no-ops according to the declared interface; and
- duplicate claim rejection plus failed-transfer rollback that leaves the claim retryable.

The production alternative can be a hybrid root only after a root format, availability, fraud challenge, finality, and dust policy are approved. Do not move authoritative balances to PostgreSQL.

### 6.4 Gas benchmark plan

Benchmark the exact fixture and compiler settings at contributor counts:

```text
N = 1, 10, 25, 50, 100, 250, 500, 1,000, 2,500, 5,000
```

For each `N`, measure contribution, snapshot batch, ballot, DAO finalization, refund entitlement preparation, and refund claim gas. Report median, p95, maximum, calldata size, storage writes, and the largest successful `N` under the configured chain block gas limit. A batch size is acceptable only if the worst-case batch remains below a pre-registered safety margin and finalization cannot be blocked by an unbounded single call.

Failure thresholds are measured, not assumed: mark the first `N` at which a transaction exceeds the block limit, the first `N` at which p95 exceeds the operational budget, and the first `N` at which storage growth makes the fixture unsuitable. These are engineering thresholds, not evidence of economic scalability.

## 7. A4 — Judge registry scalability

### 7.1 Finding

`registerJudge` accepts a wallet without stake and appends it to `judgePool`. Selection scans the pool from a hash-derived start index and skips conflicts or undercollateralized candidates. This establishes a deterministic test pool, but zero-stake registration remains spam-capable and selection cost grows with the pool.

### 7.2 Minimal stake-qualified design

1. A wallet becomes `ACTIVE_ELIGIBLE` only after depositing at least the policy's minimum available collateral.
2. Before assignment, the candidate must have `availableStake >= requiredLockedStake`; all three reservations are made atomically.
3. A withdrawal is allowed only when the wallet has no active reservations. If it would fall below the registration floor, remove the wallet from the active eligible set.
4. Maintain an active eligible index with swap-and-pop membership and an address-to-index mapping. Do not use historical registration order as the random distribution.
5. Select without replacement from the active index using a committed/verified seed and a bounded draw/rejection count. Reject candidates that are creator-conflicted, already assigned in the case, or lack available collateral.
6. If the bounded draw budget cannot find three candidates, leave the case unassigned and use the assignment timeout path.

This needs no protocol token, DAO, VRF, or ZK system. A Foundry fixture may use deterministic entropy; a public deployment must separately approve the network-compatible randomness primitive and its timeout behavior.

### 7.3 What this does not guarantee

Stake-qualified registration limits spam and ensures collateral coverage. It does not stop one capital holder from splitting stake across wallets, controlling many eligible seats, colluding with other Judges, buying a vote, or benefiting from selection bias. Those are experimental outcomes, not solved properties.

## 8. A5 — Aggregate financial invariants

### 8.1 Ledger definitions

The PR2 fixture uses both allocation ledgers and transfer counters. For milestone `m`, the exact meanings are:

```text
raised_m               = confirmed contributions received for m
creatorPaid_m          = successful creator payout transfers
judgePaid_m            = valid service reward allocated/funded at settlement
judgeRewardClaimed_m   = successful Judge reward transfers
refunded_m             = successful pre-review funding-failure refunds
settlementRefunded_m   = successful post-settlement Backer refunds
Refunded_m             = refunded_m + settlementRefunded_m

JudgeRewardUnclaimed_m = judgePaid_m - judgeRewardClaimed_m

escrowRemaining_m
  = raised_m - creatorPaid_m - judgePaid_m
    - refunded_m - settlementRefunded_m

milestoneCustodyAttribution_m
  = raised_m - creatorPaid_m - judgeRewardClaimed_m
    - refunded_m - settlementRefunded_m
```

`judgePaid_m` is an accounting allocation: the valid-service amount is irrevocably removed from `escrowRemaining_m` even before withdrawal. `judgeRewardClaimed_m`, `creatorPaid_m`, `refunded_m`, and `settlementRefunded_m` are transfer counters. `refundPool_m` and `creatorClaimable_m` are funded liabilities, not extra assets.

The following identities hold by the fixture definitions:

```text
raised_m
  = creatorPaid_m + judgePaid_m + Refunded_m + escrowRemaining_m

judgePaid_m
  = judgeRewardClaimed_m + JudgeRewardUnclaimed_m

milestoneCustodyAttribution_m
  = escrowRemaining_m + JudgeRewardUnclaimed_m
```

Do not add `creatorClaimable_m` or unclaimed Backer refunds to `escrowRemaining_m`: those liabilities are already inside it. Do not add `JudgeRewardUnclaimed_m` to `escrowRemaining_m` when proving the first allocation identity: `judgePaid_m` already includes it. The separate custody-attribution identity adds only unclaimed Judge rewards because `escrowRemaining_m` excluded the full `judgePaid_m` allocation at settlement.

`fundedLiabilities_m` is checked separately:

```text
before reviewed settlement, when a funding-failure refund snapshot exists:
  fundedLiabilities_m = refundSnapshot_m - refunded_m

after reviewed settlement:
  fundedLiabilities_m
    = creatorClaimable_m
      + JudgeRewardUnclaimed_m
      + refundPool_m - settlementRefunded_m
```

Under the fixture's valid settlement construction and complete entitlement preparation, post-settlement `fundedLiabilities_m == milestoneCustodyAttribution_m`. This equality is a solvency check derived from the settled allocation, not permission to count either side twice.

`physicalTokenCustody` is the ERC20 balance of the accounting contract across every milestone/campaign plus any foreign or otherwise unattributed token deposits. Therefore:

```text
sum_m(milestoneCustodyAttribution_m) <= physicalTokenCustody
```

Equality is expected only when the sum covers every live milestone attributed to that contract, there are no foreign/unattributed deposits, no other token sources or liabilities share the custody address, and exact-transfer token behavior holds. The left side is scoped ledger attribution; the right side is aggregate physical custody.

Reset compensation is a separate stake-pool ledger:

```text
ResetSlashCollected = ResetCompensationPaid + ResetCompensationUnclaimed
```

It is not `raised_m`, `judgePaid_m`, a milestone inflow, or a Backer refund. Even if stake and crowdfunding custody use the same ERC20 token type, their contracts, sources, claims, and conservation equations remain separate. A cross-contract aggregate may reconcile physical balances, but it must not net a stake surplus against an underfunded milestone liability.

### 8.2 Outcome matrix

| Outcome | Creator payout | Valid Judge service reward | Remaining contribution treatment |
| --- | ---: | ---: | --- |
| `FINAL_PASS`, Court 1 accepted | frozen creator budget | one valid court | unused reserve and any residual escrow are refundable |
| `FINAL_PASS`, Court 2 reverses/affirms | frozen creator budget | two valid courts | no double-counted reserve; residual is refundable |
| `VERDICT_FAIL` | zero | every valid court already completed | remaining escrow is refundable; correction policy may create a new revision/case |
| `PROTOCOL_FAIL` after valid prior courts | zero | already-earned valid service rewards only | remainder is refundable; no minority slash |
| `PROTOCOL_FAIL` before any valid court | zero | zero | all contribution escrow is refundable |

The exact reward rate, reserve, dust, and correction values remain pending policy. The matrix is a conservation rule, not an economic approval.

### 8.3 Required aggregate checks

Add a multi-campaign/multi-milestone handler that interleaves:

- funding success and funding failure;
- `FINAL_PASS`, `VERDICT_FAIL`, and `PROTOCOL_FAIL`;
- Court 1 and Court 2 valid rewards;
- partial Judge reward claims;
- partial Backer refund claims;
- creator payout failure and retry;
- CCPS penalties and compensation claims;
- simultaneous active cases;
- fee-on-transfer and failing ERC20 behavior;
- duplicate settlement, payout, refund, reward, and compensation calls.

Prove after every action:

```text
for each m:
  raised_m = creatorPaid_m + judgePaid_m + Refunded_m + escrowRemaining_m
  judgePaid_m = judgeRewardClaimed_m + JudgeRewardUnclaimed_m
  milestoneCustodyAttribution_m
    = escrowRemaining_m + JudgeRewardUnclaimed_m

across included milestones:
  sum(milestoneCustodyAttribution_m) <= physicalTokenCustody

after settlement:
  fundedLiabilities_m = milestoneCustodyAttribution_m

no claim flag transitions twice
no case settlement consumes the same case twice
no reward reserve is also counted as refund escrow
no reset stake enters contribution conservation
```

The first three equalities are ledger identities that should be asserted for every state transition. The aggregate inequality and funded-liability coverage are independent custody/solvency checks. Tests must also inject a foreign token transfer to prove why aggregate equality is conditional rather than universal.

Existing isolated invariants cover important slices but do not establish this cross-case proof, evidence binding, scalable processing, or real randomness.

## 9. A6 — Pending economic and governance decision register

All rows below are **`PROPOSED_PENDING_APPROVAL`** unless explicitly marked locked by the V2 policy package.

| Decision | Candidate options | Recommended research-fixture default | Approval condition | Still unproven |
| --- | --- | --- | --- | --- |
| Creator voting after self-contribution | Exclude creator; include by contribution; include only non-creator wallet | Exclude committed creator from DAO and Judge pools | Owner accepts the committed-wallet rule and its Sybil limitation | Cannot identify a creator's alternate wallet |
| CWQ-1 | One-wallet-one-vote; linear contribution; `floor_sqrt` contribution; Merkle/root variant | CWQ-1 only as an explicit test candidate | Approve formula, cap, checked arithmetic, tie and threshold | Wallet splitting and collusion resistance |
| DAO threshold and duration | No threshold; fixed participation threshold; quorum plus timeout | Candidate 20% effective-weight threshold, fixed window, tie/unmet threshold → `ACCEPT` | Pre-register threshold and timeout; test empty electorate | Participation quality and strategic abstention |
| CCPS-1 | No penalty; fixed no-show fee; collateralized D/F schedule; variable reimbursement | CCPS-1 with stake-only funding, one reset per level, two per case, no variable reimbursement | Approve D/F, recipients, collateral, reset and terminal rules | Deterrence and attacker net cost |
| Court 1 exhaustion | Hard close/fail; atomic assign-or-fail; grace period; bounded attempts | T1-B atomic close: assign if at least three eligible, otherwise `PROTOCOL_FAIL` | Approve duration, entropy, eligibility check/snapshot, and terminal refund path | Availability of honest Judges and bounded close gas after deployment |
| Court 2 exhaustion | Reopen DAO; relax conflict; bounded timeout | Bounded timeout → `PROTOCOL_FAIL`; never rewrite DAO | Approve timeout and no-candidate semantics | Whether strict conflicts are worth liveness loss |
| Randomness | deterministic mock; block-derived seed; network VRF; commit/reveal seed | Deterministic mock only for fixture; no production claim | Approve source, bias analysis, fallback, and timeout | Selection manipulation and network availability |
| Evidence availability/revision | hash only; manifest check; public bytes; creator resubmission | Frozen revision plus explicit availability check; new revision for correction | Approve canonical serialization, disclosure, retry, and deadline | Truth, authorship, and durable availability |
| Reward/refund economics | no reward; fixed per-seat reserve; dynamic stake-based reward; fees | Fixed frozen per-seat reserve as a fixture candidate | Approve rate, denominator, reserve, payout, dust and failed-transfer behavior | Price adequacy, reviewer supply, and public-chain economics |

The candidate numbers `D=10`, `F=3`, `resetCostMax=23`, `1%`, `20%`, and local time windows are arithmetic fixture values from the policy registry, not calibrated prices or launch parameters.

## 10. Dependency matrix and implementation gates

| Work item | Must decide first | Evidence required | Does not authorize |
| --- | --- | --- | --- |
| Evidence/case binding fixture | revision schema, availability rule, timeout/correction path | state/guard tests and revision-bound transcripts | user funding or production evidence acceptance |
| PR1 funding fixture | complete commitment identity, ordered targets, deadlines, exact refunds | unit/fuzz/invariant custody tests | DAO, reset, reward, or payout execution |
| PR2 accounting | reward rate, reserve, creator payout, refund dust, failed-transfer policy | multi-outcome conservation and claim tests | live Court authority from a mock transcript |
| PR3 reset | CCPS-1 D/F, collateral, recipients, reset limits, terminal behavior | R1–R10 plus aggregate stake-liability invariants | minority slashing or contribution-funded compensation |
| PR4 DAO/Court 2 | CWQ-1, snapshot, threshold, conflicts, randomness, exhaustion | Q1–Q10, temporal tests, Court 2 settlement and exhaustion tests | Sybil resistance or correctness claims |
| Scalable contributor processing | snapshot batching, contributor index, refund dust | gas benchmark and bounded-call tests | backend-calculated roots without proof |
| Judge registry | minimum collateral, active-set lifecycle, selection seed, draw cap | selection fairness/coverage and exhaustion tests | a claim of anti-collusion or anti-Sybil security |
| Production integration | all policy groups approved and versioned | canonical events, idempotent indexer, fresh vertical acceptance | public-chain or real-money launch until separately approved |

## 11. Acceptance checklist

Before isolated fixture remediation:

- [ ] Evidence revision, availability, freeze, timeout, and case binding are versioned.
- [ ] Every case transcript includes campaign, milestone, revision, criteria, policy, and case identity.
- [ ] Court 1 assignment has a deterministic start point and permissionless bounded exhaustion.
- [ ] At/after the assignment deadline, a closer cannot choose `PROTOCOL_FAIL` while three eligible Judges can be atomically reserved and assigned.
- [ ] No unassigned timeout creates a Judge debt or uses contribution escrow.
- [ ] Snapshot and refund operations have bounded per-transaction work.
- [ ] Refund entitlements reproduce the ascending canonical-address prefix dust rule across partial batches and retries.
- [ ] Judge registration requires stake-qualified eligibility and active-set removal on withdrawal.
- [ ] Aggregate custody covers concurrent campaigns, unclaimed rewards, refunds, payouts, and reset claims.
- [ ] All pending policy values remain labeled `PROPOSED_PENDING_APPROVAL`.

Before production integration:

- [ ] All direct policy approvals in the dependency matrix are signed off.
- [ ] Foundry unit, fuzz, and invariant suites pass for the versioned deployment identity.
- [ ] Gas benchmarks identify safe contributor and Judge-pool limits.
- [ ] Randomness and evidence availability policies have a bounded failure path.
- [ ] Canonical events and the idempotent indexer are verified against receipts, reorgs, and duplicate logs.
- [ ] A disposable local vertical run is completed; no backend projection is used as financial truth.

## 12. Complexity estimate and recommendation

| Area | Relative complexity | Main dependency |
| --- | --- | --- |
| Evidence binding | Medium | evidence policy and new case identity |
| Fixed assignment timeout | Low–medium | timeout and randomness policy |
| Paginated snapshot/refund entitlements | Medium–high | storage/index and dust policy |
| Stake-qualified active registry | Medium–high | active-set lifecycle and selection bounds |
| Cross-case invariants | Medium | finalized ledger definitions |
| Full production integration | High | all policy approvals plus new deployment identity |

**Recommendation:** go forward only with isolated evidence-binding, liveness, and bounded-processing fixtures. Do not enable user funding or production integration until the pending policy groups and aggregate invariants are closed. The hardening work can establish safe state transitions and bounded liabilities; it cannot, by itself, justify the claim that full VNext is more correct than a simpler jury.
