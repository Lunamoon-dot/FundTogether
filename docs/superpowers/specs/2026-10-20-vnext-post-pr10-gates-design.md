# FundTogether VNext Post-PR #10 Acceptance Gates — Design Spec

**Status:** Approved design; implementation not started

**Baseline:** `origin/main` / PR #10 merge tree (`ab93b702`), equivalent to the PR head tree used for this follow-up.

## Goal

Close the four agreed remediation gates without changing the pure-decentralized authority model, introducing a Resolver/Admin decision path, or changing the frozen local financial policy values.

The follow-up must prove:

1. no timeout or refund path can target an inactive milestone;
2. canonical milestone transitions are represented in the persistent and in-memory read models;
3. timeout regression tests establish the intended preconditions and verify state before and after each transaction;
4. local runtime verification checks every deployed parameter that affects stake, voting, appeal, retry, slashing, challenge, or finality.

## Scope

### In scope

- `CampaignEscrowVNext` milestone activation and timeout guards;
- canonical milestone configuration/state events and generated ABI artifacts;
- PostgreSQL milestone projection fields, migration, persistent indexer and in-memory event projector;
- Foundry regression tests, indexer tests and runtime verifier tests;
- local acceptance checks for the full frozen V2 remediation parameter matrix.

### Out of scope

- changing the three-Judge, permissionless court model;
- changing stake, fee, appeal, correction, slashing or timeout values in the frozen local policy;
- modifying the valid `(stream_id, block_hash, log_index)` event identity design;
- removing historical Resolver/Admin code;
- public-chain, real-money or production security-approval claims.

## Design

### 1. State-machine safety

`expireMilestoneSubmission(campaignId, milestoneId)` will accept the `PENDING` submission-timeout branch only when all of the following are true:

- campaign state is `FUNDED` or `MILESTONES_RUNNING`;
- the selected milestone is the first unpaid milestone in order;
- `submissionDeadline != 0`;
- `block.timestamp >= submissionDeadline`.

The correction-timeout branch will require the same active-milestone condition plus `correctionDeadline != 0` and the existing correction deadline check.

`submitMilestoneEvidence` will reject a `PENDING` milestone whose submission deadline is still zero. This prevents a future milestone from being treated as active by any caller path.

The active milestone check will be implemented from canonical contract state by scanning milestones in order until the first unpaid milestone. A later milestone cannot be expired while an earlier milestone is unpaid or under review.

### 2. Canonical milestone events and projections

Add two campaign events to `IVNextEvents`:

- `MilestoneConfigured`: emitted once during `createCampaign` for every milestone, carrying campaign ID, milestone ID, immutable budget and acceptance-criteria hash. This gives the indexer a row for every configured milestone, including future milestones.
- `MilestoneStateChanged`: emitted for state transitions not already fully represented by an existing event. It carries campaign ID, milestone ID, evidence revision/hash, review case ID, final outcome, milestone state, submission deadline, correction deadline, challenge deadline and paid flag.

`MilestoneStateChanged` will be emitted after the canonical state mutation in:

- final ruling synchronization, including protocol-failure retry pending;
- review retry and appeal opening;
- challenge resolution;
- submission timeout and correction failure;
- milestone payout, in addition to the existing payout event where the existing event is retained for financial projection compatibility.

The existing evidence-submission and revision events remain the source for evidence bytes and review-case creation; the new state event makes the resulting canonical state explicit for read-model synchronization.

The PostgreSQL milestone projection will add `submission_deadline` and `correction_deadline`. The persistent indexer and `vnext-event-projector` will upsert configuration and state events by the existing milestone primary key, preserving the contract-owned state and never creating financial truth from database values.

### 3. Full local policy conformance

Keep the existing local policy values and version identity. Extend runtime verification with an explicit expected policy matrix and contract getter/constant reads for:

- campaign submission, correction and challenge windows;
- minimum stake floor and risk multiplier;
- Judge enrollment, commit, reveal and randomness timeout;
- appeal window, appeal bond and maximum appeal rounds;
- retry limit, maximum milestone corrections and minority slash rate;
- token decimals, protocol version and contract wiring already covered today.

The verifier will fail closed when any expected value differs. The acceptance script and verifier unit tests will cover both a fully matching client and at least one mismatch per contract group. `policyHash` remains an identity/version check; it is not treated as proof that all policy fields match by itself.

### 4. Event identity and reorganization boundary

Retain the current event identity:

```text
(stream_id, transaction_hash, log_index)
```

and the block identity index:

```text
(stream_id, block_hash, log_index)
```

`log_index` is the block-global log position. Follow-up tests will focus on canonical block/checkpoint behavior and reorganization rollback/replay rather than changing this valid uniqueness key.

## Data flow

```text
CampaignEscrowVNext
    → MilestoneConfigured / MilestoneStateChanged
    → idempotent event indexer transaction
    → PostgreSQL milestone projection
    → VNext read API / in-memory projector tests
```

The backend may validate and project events, but it cannot call a review outcome, move escrow, or override a canonical milestone state.

## Acceptance tests

### Contract/state machine

- cannot expire before publication/funding;
- cannot expire while funding is still active;
- cannot expire an inactive future milestone;
- cannot expire an active milestone before its deadline;
- successful funding activates milestone zero and permits timeout only after its deadline;
- correction timeout remains permissionless but only for the active correction milestone;
- all existing custody, payout and refund invariants remain green.

### Projection/indexer

- configuration creates all milestone rows;
- ruling synchronization updates state, outcome, deadline and review pointer;
- retry and appeal update the new review pointer and state;
- challenge/correction/timeout transitions update the canonical read model;
- duplicate event replay remains idempotent;
- a projection failure rolls back the event and checkpoint transaction;
- canonical reorg handling does not mix events from competing forks.

### Runtime policy

- every expected getter/constant is read from the deployed contract;
- one mismatch in each campaign/review policy group fails verification;
- the acceptance flow records the canonical review, payout and refund events;
- local acceptance remains explicitly non-production evidence.

## Non-goals and safety constraints

- No trusted reviewer, Resolver, Admin or backend financial authority is added.
- No floating-point arithmetic or client-supplied financial state is introduced.
- No database projection can authorize payout or refund.
- No production/public-chain readiness claim follows from these tests.

