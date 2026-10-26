# FundTogether VNext Research Readiness Report

**Audit date:** 2026-10-26 (Asia/Ho_Chi_Minh)  
**Requested baseline:** `main` after PR #20, `fb0e346e7253e4fbe8b4681c4fbf9dbdaa84e2d8`  
**Checked-out revision:** `467a6543c96aec6ccfb4854a75dcf3bad060787a`  
**Checked-out state:** dirty and 35 commits behind the local `origin/main` ref  
**Scope:** source-of-truth audit and research-readiness assessment only.

## Executive decision

| Area | Decision | Reason |
|---|---|---|
| Isolated fixture and simulation design | **Conditional GO** | The remote baseline contains test-only V2 fixtures and a useful acceptance-test shape. They are suitable as research inputs after the revision and policy manifest are pinned. |
| V2 runtime implementation or user funding | **NO-GO** | The checked-out runtime is a partial VNext slice and is not storage- or transition-compatible with the V2 design. Several economic, governance, evidence, and liveness decisions remain `PROPOSED_PENDING_APPROVAL`. |
| Production/public-chain deployment | **NO-GO** | No source audit in this report establishes integrated contract/indexer/backend/frontend acceptance, production randomness, gas scalability, evidence availability, or security of the proposed policy. |
| Claim that V2 is superior to simpler juries | **NO-GO** | No controlled simulation results were supplied or run. The current artifacts define candidate mechanisms and test seams, not comparative scientific evidence. |

**Verification statement:** This audit used repository inspection, Git metadata, and read-only inspection of the requested `origin/main` baseline. No test, build, deployment, Anvil reset, or destructive command was run for this report. Documentation claims about earlier test runs are recorded as documented claims, not independently re-run evidence.

## 1. Source-of-truth map

The sources have different authority. Treating every green fixture test or design paragraph as runtime truth would produce an unsafe conclusion.

| Authority / source | What it establishes | Classification |
|---|---|---|
| `AGENTS.md` and `docs/research-direction.md` | Pure-decentralized product direction, chain authority, narrow COMICS_ARTBOOK/DIGITAL_DOWNLOAD scope, accepted threat assumptions, and research sequencing | **Current direction** |
| `docs/PROJECT_OVERVIEW.md` | Current architecture boundaries and the fact that the local runtime remains pre-reset/partially migrated | **Current project status** |
| `docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md` | V1 research protocol, state/accounting requirements, court semantics, and unresolved proposal boundaries | **Target specification; not deployed authority** |
| Checked-out `contracts/src/**` | What the current local runtime actually compiles toward | **Runtime implementation evidence** |
| `origin/main@fb0e346:docs/protocol/PR0_POLICY_FINALIZATION.md` and `parameters-v2-policy.md` | V2 candidate policy register and proposed parameter manifest | **Pending policy; read-only remote baseline** |
| `origin/main@fb0e346:contracts/test/fixtures/V2*.sol` | Isolated test models for funding, accounting, reset, and DAO/Court 2 | **Research fixtures; not deployment code** |
| `origin/main@fb0e346:contracts/test/**/V2*.t.sol` | Intended unit, fuzz, and invariant acceptance surfaces | **Research-test definitions; not executed in this audit** |
| Historical Resolver and release documents | Prior runtime or prior design evidence | **Historical/superseded unless explicitly re-adopted** |

The task baseline is present in the local `origin/main` ref, but it is not the checked-out working tree. The distinction must remain visible in all follow-up work.

## 2. Confirmed facts

### 2.1 Product and authority boundary

- The current direction is permissionless reward crowdfunding for one COMICS_ARTBOOK campaign model, one STANDARD tier, and one DIGITAL_DOWNLOAD PDF.
- Backers pledge MockUSDC into contract escrow. Funding success alone does not release creator funds.
- Publication, milestone, completion, and challenge outcomes are intended to be resolved by stake-backed Judge courts; the reference court has three Judges and a two-of-three majority.
- A backend, database, Resolver, Admin, or operator must not override a chain outcome or create financial truth from PostgreSQL.
- The intended data flow is `contract/RPC -> canonical events -> idempotent indexer -> database projection`; evidence bytes remain off-chain while integrity commitments may be on-chain.

**Source:** `docs/research-direction.md` (current status, target architecture, threat assumptions); `docs/PROJECT_OVERVIEW.md` (architecture and current-status sections); `FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md` (P01-P20 and accounting sections).

### 2.2 The checked-out runtime is not V2

The checked-out `CampaignEscrowVNext.sol` currently has:

- campaign-level `goal`, `raised`, contribution balances, and refund accounting;
- milestone budgets and criteria frozen at campaign creation, but no V2 per-milestone funding target or milestone-by-milestone funding ledger;
- permissionless funding finalization after the campaign funding deadline;
- creator-only milestone evidence submission, revision/hash storage, and a linked review case;
- a payout only after a canonical final pass and challenge window;
- campaign-level refund opening and incremental refund freezing/claiming;
- direct appeal entry points and a disabled local challenge path.

The checked-out `JuryReview.sol` and `JuryRegistry.sol` provide substantial VNext slices: stake custody, case registration, Judge enrollment, three-seat court assignment, commit/reveal, court aggregation, retries, appeals, settlement batching, and reward claims. They do not implement the V2 BackerDAO/CWQ-1/Court 2 workflow, V2 reset ledger, or fixed V2 reward-reserve accounting.

The local `MockReviewFinality.sol` is explicitly a test-only seam with direct outcome and settlement setters. CampaignEscrow tests using it establish boundary-state behavior around a mocked review result, not an end-to-end proof of the live JuryReview path.

**Sources:** checked-out `contracts/src/campaigns/CampaignEscrowVNext.sol` (`createCampaign`, `contribute`, `finalizeFunding`, `submitMilestoneEvidence`, `syncFinalRuling`, `openAppeal`, `payMilestone`, refund functions); `contracts/src/jury/JuryReview.sol`; `contracts/src/jury/JuryRegistry.sol`; `contracts/test/mocks/MockReviewFinality.sol`.

### 2.3 The V2 package is a test-and-policy package, not production code

The local `origin/main` ref at the requested baseline contains the following additional artifacts:

- `docs/protocol/PR0_POLICY_FINALIZATION.md`;
- `docs/protocol/parameters-v2-policy.md`;
- `docs/protocol/PR1-PR4_ACCEPTANCE_CRITERIA.md`;
- `contracts/test/fixtures/V2FundingFixture.sol`;
- `contracts/test/fixtures/V2FinancialAccountingFixture.sol`;
- `contracts/test/fixtures/V2CourtResetFixture.sol`;
- `contracts/test/fixtures/V2BackerDaoCourt2Fixture.sol`;
- corresponding V2 unit, fuzz, and invariant test files.

The fixtures identify themselves as isolated/test-only. They use deterministic seams where production-grade randomness, selection scalability, and integrated contract behavior are intentionally not proven. The remote test files define useful acceptance cases, but their presence is not evidence that they passed in this audit.

**Sources:** `origin/main@fb0e346` paths above; `PR0_POLICY_FINALIZATION.md:L1-L22`; `PR1-PR4_ACCEPTANCE_CRITERIA.md:L1-L21`; fixture headers, especially `V2FundingFixture.sol:L84`, `V2CourtResetFixture.sol:L109`, and `V2BackerDaoCourt2Fixture.sol:L12-L14`.

### 2.4 V2 policy is explicitly pending

The remote V2 policy package leaves the following decisions pending:

- **O1:** CWQ-1 weighting, threshold, tie/empty behavior, caps, and wallet-splitting implications;
- **O2:** publication electorate and the proposed pre-funding Court 1 boundary;
- **O3/O4:** CCPS-1 reset cost, collateral, recipient, and reset-compensation rules;
- **O5:** canonical reasoning/evidence disclosure and availability semantics;
- **O6:** Court 2 exhaustion and terminal `PROTOCOL_FAIL` behavior;
- **O7:** temporal Judge/voter exclusion between Court 1, DAO, and Court 2;
- **O8:** publication reward funding.

The candidate manifest includes values such as reward rate `100 bps`, CWQ threshold `2000/10000`, reset parameters `D=10`, `F=3`, and a reset-cost formula `2D+F`. These are test-vector inputs, not approved economics. The policy files state that pending values do not authorize runtime adoption.

**Sources:** `origin/main@fb0e346:docs/protocol/PR0_POLICY_FINALIZATION.md:L14-L22,L25-L68,L71-L86,L89-L180,L185-L260,L273-L312`; `origin/main@fb0e346:docs/protocol/parameters-v2-policy.md:L1-L14,L69-L158,L160-L193,L208-L340`.

### 2.5 Existing local tests are partial evidence

The checked-out tests cover important VNext slices: authorization, invalid transitions, contribution limits, review retries, appeal paths, evidence revisions, payout/refund behavior, failing-token paths, court uniqueness, stake custody, and selected conservation invariants. They do not establish the V2 sequence of per-milestone funding -> evidence -> Court 1 -> DAO -> Court 2 -> settlement, nor its integrated accounting.

The local documentation also records historical build/test claims. Those claims are not independently verified here. No test result is attributed to this audit.

## 3. Confirmed facts versus assumptions

| Statement | Status | Consequence |
|---|---|---|
| A V2 funding fixture can enforce exact milestone targets and sequential opening in isolation | **Confirmed as fixture behavior** | Useful for a research model and acceptance vectors; not proof of the production contract path |
| V2 accounting can represent creator-paid, Judge-paid, refunded, and remaining escrow separately | **Confirmed as fixture design** | Candidate accounting model; must be integrated with real event and transfer paths |
| CCPS-1 can bound reset compensation and keep it in a separate stake custody ledger | **Confirmed as fixture design** | A testable design seam; deterrence and attacker economics remain unproven |
| CWQ-1 can make wallet splitting outcome-relevant without additional contributed capital | **Confirmed as mathematical counterexample/design property** | This is a limitation, not a Sybil-resistance guarantee |
| Deterministic fixture entropy is representative of production randomness | **Not confirmed / false assumption** | Do not infer unpredictability, fairness, or Sybil resistance |
| Evidence hash proves factual truth or evidence availability | **False assumption** | Require content availability, canonical revision, deadline, and dispute semantics separately |
| A passing fixture test proves the runtime is V2-compatible | **False assumption** | Deployment identity, storage, events, transitions, and indexer projections remain to be integrated |
| Pending values are safe because they are encoded in a manifest | **False assumption** | A manifest freezes a candidate; it does not approve the economics or governance |
| `JudgePaid` equals only rewards already claimed | **False assumption** | Earned-but-unclaimed reward is a liability and must be included in custody accounting |
| Fewer than three eligible Judges can always be solved by retrying assignment | **False assumption** | A bounded timeout and terminal policy are required to prevent indefinite escrow immobilization |
| Existing VNext invariants cover V2 conservation and cross-case liabilities | **Not confirmed** | New V2-specific invariant and integration tests are required |

## 4. Main architectural blockers and minimum hardening direction

### A1 — Funding -> evidence -> Court 1 binding (High)

**Finding.** The V2 fixture models an exact-target, sequential funding boundary, while the checked-out runtime is campaign-level funded and can create review cases through the current milestone flow. The audit cannot establish a single live guard that binds `campaignId`, `milestoneId`, case identity, evidence revision/content hash, policy manifest, and the funded state.

**Minimum direction.** Require the state sequence below for each milestone:

```text
MILESTONE_FUNDING
  -> MILESTONE_FUNDED (exact target and deadline rules)
  -> EVIDENCE_SUBMITTED (creator, nonzero revision/hash, availability reference)
  -> EVIDENCE_FROZEN (one canonical revision for the case)
  -> COURT1_READY (policy/case binding and duplicate guard)
  -> COURT1_ASSIGNED
```

The transition must be permissionless where safe, but each permissionless action must check the frozen milestone state, evidence revision, policy identity, deadline, and one-case-per-revision rule. A missing evidence timeout must produce an explicit terminal refund or protocol-failure path; it must not silently create a case. Replaced evidence must create a new revision with a new case identity and preserve prior history.

**Acceptance surface.** Unit tests for unauthorized evidence, wrong milestone/state, duplicate revision/case, stale policy hash, deadline expiry, and rollback on failed token transfer; fuzz tests for revision/order permutations; invariants for one canonical case per revision and no payout before final ruling. The V2 funding fixture is useful only as an isolated precursor.

**Unproven.** A content hash provides integrity, not truth or availability. The availability service, disclosure timing, and canonical reference format remain policy and integration work.

### A2 — Court 1 liveness and exhaustion (High)

**Finding.** The V2 Court Reset fixture has a bounded reset/collateral model, but it uses deterministic test assignment and does not establish production-scale eligibility or randomness. The current runtime also has no V2 proof that assignment cannot remain unavailable indefinitely.

**Minimum research default.** Start the assignment timeout when the case becomes eligible for assignment and the required stake is reserved. Permit additional eligible Judges until the deadline. After timeout, allow a permissionless finalizer to choose between:

1. a bounded reset if the policy-defined reset collateral is fully reserved; or
2. terminal `PROTOCOL_FAIL` if the maximum reset budget or eligible-pool condition is exhausted.

Do not slash when no Judge was assigned and no procedural duty was accepted. Keep prior valid-court liabilities intact, refund remaining milestone escrow under the approved rule, and record a unique case/level/reset event. Compare this against a simpler fixed-time terminal-failure policy in simulation; do not assume reset is better.

**Required proof obligation.** Under the declared assumptions, every path must either assign a court, enter a bounded reset, or reach a terminal state. The ledger must reserve any reset compensation before assignment and must not draw it from creator/backer milestone escrow or an unfunded reward reserve.

**Unproven.** No protocol can guarantee liveness if the eligible stake pool remains empty, the randomness source fails, or all eligible participants are unavailable. These conditions must be explicit terminal outcomes, not hidden retries.

### A3 — Bounded contributors, DAO snapshots, and refunds (High)

**Finding.** Contributor lists and refund entitlement processing are potentially large. The current refund path is incremental, but V2 DAO snapshot and contributor-weight work is not integrated into the runtime. A single unbounded creation/finalization loop is an availability risk.

**Recommendation.** For the isolated V2 fixture, use a bounded/paginated on-chain snapshot that stores contributor identities and weights, while maintaining aggregate totals incrementally during snapshot processing. This keeps the DAO denominator and refund entitlement contract-authoritative without one unbounded call. Use O(1) refund claims after the snapshot; consider a Merkle claim root only if measured gas requires it and the protocol adds an on-chain root challenge or fraud-proof path.

**Trade-offs.** Incremental state is simplest and easiest to audit but has storage cost. Pagination is compatible with permissionless progress but requires idempotent cursors. A root reduces iteration but adds trust, data-availability, and challenge complexity. The hybrid option is acceptable only with an on-chain commitment and a recoverable dispute mechanism.

**Benchmark gate.** Measure creation, snapshot, finalization, and claim gas at increasing contributor counts. Record the first failing/reverting count, block gas limit margin, and per-claim cost. Do not select a design from a nominal maximum without this measurement.

### A4 — Judge registry scalability and eligibility (High)

**Finding.** Permissionless zero-stake registration can grow the Judge pool without adding usable court capacity. A minimum stake alone does not prove Sybil or collusion resistance; one actor can still control multiple funded wallets.

**Minimum direction.** Separate registration from eligibility. Require sufficient available collateral for the case/risk, reserve it before assignment, release it only after the case-level obligation ends, and exclude creator, prior-case Judges, and policy-defined Court 1/DAO voters from later stages. Selection must be unpredictable and gas-bounded; selection order must not favor early registrants.

**Unproven.** No candidate in the current artifacts establishes a Sybil guarantee, bribery resistance, or truthful voting. Those are empirical/economic questions and must remain explicit limitations.

### A5 — Aggregate financial invariants (Critical)

The V2 accounting target is:

```text
Raised_m = CreatorPaid_m + JudgePaid_m + Refunded_m + EscrowRemaining_m
JudgePaid_m = JudgeClaimed_m + JudgeUnclaimed_m
```

The model must additionally isolate reset compensation from milestone escrow and reward reserve, handle mixed `FINAL_PASS`, `VERDICT_FAIL`, and `PROTOCOL_FAIL`, preserve liabilities for unclaimed rewards, and keep each campaign/milestone/case namespace independent.

**Minimum acceptance set.** Test partial claims in every order; failed and fee-on-transfer token operations; payout failure and retry; refund dust; duplicate claims; reentrancy; simultaneous cases; valid minority rewards; invalid-court zero service reward; reset compensation; and cross-campaign aggregation. An invariant is not established merely because a fixture formula looks correct; custody, event sequencing, and live transfer effects must be connected.

### A6 — Pending economics and governance (Critical)

No V2 economic or governance default should be promoted automatically. Owner approval is required for at least:

- CWQ-1 formula, cap, denominator, threshold, tie/empty behavior, and creator self-contribution treatment;
- publication electorate and pre-funding Court 1 boundary;
- CCPS-1 cost, collateral, recipient, reset limits, and finalizer-recipient behavior;
- Court 1/Court 2 timeout and terminal policy;
- randomness source and candidate-selection bounds;
- evidence availability, revision, reasoning disclosure, and canonical reference schema;
- reward rate, reserve, payout, refund, and dust rules.

The research fixture may use a clearly labeled candidate manifest. It must not call that manifest approved.

## 5. Risk register

| ID | Risk level | Risk | Current evidence | Required mitigation |
|---|---|---|---|---|
| R1 | **Critical** | Runtime/spec mismatch can strand or mis-account funds if V2 transitions are implemented on the V1 storage model | Checked-out CampaignEscrow uses campaign-level funding; V2 requires per-milestone funding and new workflow | New deployment identity, explicit migration prohibition, integrated state/event design, and complete accounting tests |
| R2 | **Critical** | Pending economics/governance may become de facto production policy | PR0 and parameters files mark O1-O8 and candidate values pending | Owner decision record and immutable approved policy manifest before user funding |
| R3 | **High** | Evidence hash may be treated as proof of truth or availability | Current runtime stores hash/revision; V2 O5 remains pending | Availability/disclosure protocol, canonical reference, timeout, and revision/case binding |
| R4 | **High** | Court assignment may fail indefinitely or leave escrow locked | Current runtime and fixtures do not prove production-scale eligible-pool liveness | Bounded timeout/reset/terminal state with prepaid stake-only liabilities |
| R5 | **High** | Contributor/DAO/refund processing can exceed gas limits | Contributor/refund/DAO loops are not benchmarked here | Incremental/paginated design and measured gas thresholds |
| R6 | **High** | Registration and wallet splitting are mistaken for Sybil resistance | CWQ-1 explicitly exposes splitting advantage; deterministic fixture selection is not random | Attack-model simulation, stake/collusion sensitivity, and no overclaiming |
| R7 | **High** | Unclaimed Judge rewards or reset obligations are double-counted or unfunded | V2 fixture proposes separate ledgers; live integration absent | Cross-case custody invariant and failed-transfer/idempotency tests |
| R8 | **High** | Backend/indexer projection diverges from chain authority | Architecture requires event-driven projections; V2 events/projections are not integrated | Canonical event schema, replay/idempotency tests, and chain-first UI state |
| R9 | **Medium** | Test-only seams are mistaken for deployment security | MockReviewFinality and deterministic fixture entropy are explicit seams | Label fixtures, block direct seam use from production, and test live boundaries separately |
| R10 | **Medium** | Scientific result is underpowered or incomparable | No common seeds, pilot precision, raw-result schema, or results were supplied | Pre-register factors, paired seeds, pilot-based sample size, CIs/effect sizes, and falsification gates |
| R11 | **Medium** | Current dirty/behind checkout causes source drift | HEAD differs from requested baseline and prohibited runtime files are locally modified | Pin the audit/implementation revision before any follow-up change; preserve the current worktree |

## 6. Scientific novelty assessment

### What is not sufficient novelty

Escrow crowdfunding, commit/reveal voting, three-person majority courts, staking, random Judge selection, appeal rounds, slashing, state-machine tests, conservation invariants, and square-root/quadratic-style weighting are established mechanism families. Their presence in FundTogether is not by itself a novel scientific contribution. A simplified jury must not be described as a faithful Kleros or GenLayer reproduction without a separate mechanics verification.

### Candidate contribution

The strongest defensible contribution is an **instance-level, reproducible protocol-and-simulation artifact** that combines:

1. sequential milestone escrow and evidence/case binding;
2. a bounded stake-backed Court Reset with an explicitly separate compensation ledger;
3. BackerDAO-gated Court 2 with temporal conflict exclusions;
4. conservation and liability invariants spanning creator, backers, Judges, and reset obligations; and
5. adversarial comparisons against B0 and B1 using common seeds and declared synthetic assumptions.

The Q6/Q10 wallet-splitting behavior is a useful negative result and boundary condition, not evidence that CWQ-1 is fair. The fixtures can support a reproducible evaluation contribution only if the model is frozen, baselines are comparable, results are independently rerunnable, and conclusions are limited to the declared finite/synthetic assumptions.

### Recommended minimal research contribution

Do not make full VNext implementation the research contribution. The minimum publishable/evaluable package should be:

- a versioned policy/commitment schema with all pending values visibly labeled;
- a small formal transition model for funding, evidence, Court 1, reset, DAO, Court 2, settlement, refund, and terminal failure;
- three simulation baselines: **B0** single three-Judge jury, **B1** single jury with bounded reset/CCPS-1, and **B2** the full proposed sequence;
- shared case distributions, ground truth, Judge population/quality, adversarial budgets, stake assumptions, and paired random seeds;
- custody, correctness, liveness, latency, capital-lock, gas, and attacker-economics outputs with raw-result schemas;
- explicit Q6/Q10 Sybil/splitting counterexamples and negative findings;
- a pilot-based precision/power decision before the main Monte Carlo run.

This contribution is research evidence, not production-readiness evidence.

## 7. Experimental protocol readiness

### Research question

> Does collateral-backed Court Reset combined with DAO-gated Court 2 improve adjudication correctness and recovery under failures or adversarial behavior compared with simpler jury mechanisms, at an acceptable financial cost, latency, and liveness trade-off?

The answer must remain open.

### Comparable models

| Model | Required behavior | Must not include |
|---|---|---|
| B0 | One three-Judge court, fixed eligibility, commit/reveal, one final result and settlement | Reset, DAO, Court 2 |
| B1 | B0 plus bounded Court Reset and CCPS-1-like stake-only compensation | DAO/Court 2, unbounded retries |
| B2 | Court 1, bounded reset, BackerDAO ACCEPT/APPEAL, Court 2, settlement, and the proposed accounting | Unverified real-world Kleros/GenLayer claims |

All models must receive the same case distribution, ground truth, Judge population, quality model, adversarial budget, stake assumptions, and paired seeds. Differences in capabilities and costs must be represented as model parameters rather than hidden implementation advantages.

### Minimum factors

Independent accuracy; correlated errors; non-reveal probability; pool size and collateral eligibility; colluding Judge percentage; attacker-controlled wallets/stake; DAO participation and detection quality; contribution splitting; Court 2 reversal behavior; capital locked; reset/appeal frequency; and gas/timeout assumptions. Each range must be labeled either as a literature-backed estimate or a synthetic sensitivity range. Do not invent empirical parameters.

### Metrics and statistical method

- **Correctness:** final accuracy, false PASS, false FAIL, correction rate, harmful reversal rate.
- **Liveness:** terminal-resolution probability, `PROTOCOL_FAIL`, stuck probability, time-to-terminal.
- **Economics:** service rewards, slashing/compensation, attacker net gain/loss, locked stake, reserve use, escrow immobilization, and independently measured gas.
- **Adversarial:** Sybil appeal-flip rate, collusion success, strategic non-reveal profitability, and selection-manipulation advantage.

Use common random numbers and paired seeds across models, independent replications, raw configuration/result files, and a pilot that chooses sample size from target interval width or power for predeclared effect sizes. Report paired differences, confidence intervals, effect sizes, and sensitivity rather than averages alone. Wilson/exact intervals are suitable for bounded binary rates; bootstrap or appropriate paired intervals can summarize heavy-tailed cost/latency outputs. Simulation conclusions must be labeled simulation-generated, not empirical observations.

### Hypotheses and falsification

- **H1:** Court Reset improves liveness under non-reveal. Reject if, across the predeclared non-reveal range, B1 does not improve terminal resolution or materially increases stuck/locked capital beyond the decision threshold.
- **H2:** DAO-gated Court 2 improves final accuracy only when appeal selection is sufficiently informative. Reject if B2 fails to improve accuracy in the informative-selection regime, or improves it only by exceeding the predeclared cost/latency bound.
- **H3:** CWQ-1 wallet splitting can change outcomes without increasing contributed capital. Reject only if the defined splitting counterexample cannot be reproduced under the frozen formula; otherwise treat reproduction as confirmation of the limitation.
- **H4:** CCPS-1 cost coverage does not necessarily imply positive net attacker cost. Reject if the attacker cannot achieve non-positive net cost across the declared attack model; otherwise retain the warning that coverage is not deterrence.
- **H5:** Full VNext imposes additional cost and latency that may outweigh improvements in some scenarios. Reject only if B2 is never worse than B0/B1 within the predeclared cost/latency bounds; any region where B2 loses is a valid result.

Abandon B2 in favor of B0 or B1 when the pilot/main study shows no robust correctness or liveness improvement, when improvements require unrealistic or unverified assumptions, when Sybil/collusion cost dominates, or when B2 violates an escrow-immobilization or liability bound that B0/B1 satisfy.

## 8. Go/no-go criteria

### GO for isolated fixture remediation and simulation

Proceed only when all are true:

- the exact source revision is pinned and the checked-out/remote baseline discrepancy is resolved or intentionally documented;
- the fixture policy manifest is complete, versioned, and still marked pending where approval is absent;
- fixtures cannot accept user funds, fabricate a production `PAID`/M2 transition, or act as deployment contracts;
- deterministic seams, transcript sources, and synthetic parameters are documented as limitations;
- unit/fuzz/invariant acceptance commands are defined and their outputs will be archived when actually run;
- B0/B1/B2 share inputs, seeds, ground truth, and raw-result schemas;
- the pilot has a precision/power rule and explicit falsification thresholds.

### NO-GO for V2 runtime or user funding

Do not integrate or fund until all are true:

- O1-O8 and any new decisions have owner-approved, versioned policy identities;
- per-milestone funding, evidence availability/revision, case binding, Court 1, reset, DAO, Court 2, settlement, and refunds have one integrated state/event model;
- reward, refund, unclaimed-liability, reset-compensation, and failed-transfer invariants pass against the real contract boundary;
- contributor, Judge selection, DAO, and refund operations are gas-bounded under measured load;
- deployment identity is new and no unverified migration from the current runtime is implied;
- indexer, backend, and frontend represent submitted/mined/canonical/indexed states without overriding chain truth;
- production randomness, selection conflicts, token behavior, evidence availability, and adversarial scenarios have independent review evidence.

### NO-GO for a scientific superiority claim

No superiority claim is permitted without common-seed comparisons, a declared synthetic/literature parameter basis, raw reproducible results, uncertainty intervals, sensitivity analysis, and reported negative regions.

## 9. Ordered next steps

1. **Pin the source baseline.** Reconcile the checked-out `467a654` worktree with the requested `origin/main@fb0e346` in a separate, explicitly authorized workflow. Preserve the existing dirty worktree; do not reset it as part of this report.
2. **Freeze the policy boundary.** Review O1-O8, record owner decisions, and publish an approved/pending status for each parameter. Keep all pending values out of runtime authorization.
3. **Keep the four V2 fixtures isolated.** Treat them as test models. Run their documented unit/fuzz/invariant commands only in a later verification step, and archive exact outputs, compiler revision, and policy identity.
4. **Define the integrated transition and event contract.** Resolve funding/evidence/case binding, timeout/reset exhaustion, temporal exclusions, and terminal financial treatment before touching production implementation.
5. **Build B0/B1/B2 from the same input generator.** Include ground truth, Judge quality/correlation, non-reveal, stake/collusion, DAO participation, splitting, and Court 2 behavior as explicit configuration.
6. **Run a pilot and sensitivity analysis.** Choose replications from interval width or power, then run the main study with paired seeds and raw-result preservation.
7. **Benchmark gas and liveness.** Increase contributor/Judge/case counts until failure or unacceptable margin; use measured thresholds to choose incremental, paginated, or challenged-root processing.
8. **Implement only approved slices in dependency order:** funding/accounting, reset, DAO/Court 2, evidence/final ruling, indexer projections, then backend/UI and disposable local acceptance.
9. **Re-audit before deployment.** Require actual test/build/deployment evidence, independent security review, and explicit acceptance of residual Sybil, collusion, bribery, inactivity, randomness, and evidence-truth risks.

## 10. Dependency matrix

| Decision/evidence | Isolated fixture remediation | Simulation | Production integration | Current status |
|---|---:|---:|---:|---|
| Revision/deployment identity and complete commitment manifest | Required | Required | Required | Candidate manifest exists in remote baseline; checkout is not aligned |
| Per-milestone target, ordered opening, exact-target/refund boundary | Required for PR1 | Required | Required | V2 fixture design exists; current runtime is campaign-level |
| Reward rate, denominator, reserve, payout, refund, dust, failed transfer | PR2 input | Required for cost model | Required | Pending approval; accounting fixture exists |
| `Raised = CreatorPaid + JudgePaid + Refunded + EscrowRemaining` and unclaimed liabilities | PR2 tests | Required | Required | Fixture target; live integration absent |
| CCPS-1 D/F cost, collateral, recipient, reset limits, terminal behavior | PR3 input | Required | Required | Pending approval; reset fixture exists |
| Court 1/Court 2 assignment timeout and exhaustion | PR3/PR4 boundary | Required | Required | Pending; deterministic fixture seam only |
| CWQ-1 formula, cap, threshold, tie/empty, self-contribution | PR4 input | Required | Required | Pending; splitting limitation known |
| DAO snapshot timing and Court 1/DAO/Court 2 exclusions | PR4 input | Required | Required | Partially modeled in fixture; runtime absent |
| Evidence reference, availability, revision, reasoning disclosure | Fixture interface | Required as factor/assumption | Required | O5 pending; current hash is not truth/availability |
| Production randomness and gas-bounded selection | Not required for isolated seam | Required as limitation/factor | Required | Not established |
| Contributor/refund/DAO processing scalability | Benchmark fixture boundaries | Required as cost factor | Required | Not measured in this audit |
| Token custody, fee/failing transfer, reentrancy, idempotent claims | Required | Required for economic model | Required | Partial local coverage; V2 integration absent |
| Canonical events, indexer idempotency, backend/UI transaction states | Not needed for pure fixture | Optional observation model | Required | Architecture specified; V2 integration absent |
| Common seeds, ground truth, raw schema, CI/effect-size rule | No | Required | No | Not yet supplied |
| Independent security/economic/scientific review | No | Recommended | Required before public launch | Not established |

## 11. Source references and verification ledger

### Current checked-out sources

- `docs/research-direction.md`: current target, authority boundaries, accepted risks, research focus, and implementation order.
- `docs/PROJECT_OVERVIEW.md`: architecture, current partial VNext status, and backend/indexer boundary.
- `docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md`: proposed state machine, identifiers, commit/reveal, court/retry semantics, and invariants I1-I10.
- `docs/protocol/IMPLEMENTATION_PROGRESS_VNEXT.md`: documented slice progress and explicit gaps; historical claims were not re-run here.
- `docs/protocol/STATE_MACHINE_VNEXT.md`: checked-out VNext transitions and terminal paths.
- `docs/protocol/THREAT_MODEL_VNEXT.md`: creator, contributor, Judge, Sybil, collusion, liveness, and evidence threat assumptions.
- `docs/protocol/parameters-v1.md` and `docs/protocol/parameters-v2-remediation.md`: current/local parameter proposals and remediation context.
- `contracts/src/campaigns/CampaignEscrowVNext.sol`: `createCampaign`, `contribute`, `finalizeFunding`, evidence, review sync, appeal, payout, and refund implementations.
- `contracts/src/jury/JuryReview.sol` and `contracts/src/jury/JuryRegistry.sol`: current stake, enrollment, assignment, commit/reveal, retry/appeal, settlement, and reward paths.
- `contracts/test/mocks/MockReviewFinality.sol`: test-only direct finality seam.
- `contracts/test/unit/VNext/**`, `contracts/test/fuzz/VNextStateMachine.t.sol`, and `contracts/test/invariant/**`: checked-out partial VNext tests and invariants.

### Requested remote baseline, read-only inspected

- `origin/main@fb0e346:docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V2.md`: V2 decision register, implementation gap, accounting, reset, DAO/Court 2, dependency plan, and research boundaries.
- `origin/main@fb0e346:docs/protocol/PR0_POLICY_FINALIZATION.md:L1-L22,L25-L68,L71-L86,L89-L180,L185-L260,L273-L312`: pending policy status, O1-O8, campaign boundary, and PR dependencies.
- `origin/main@fb0e346:docs/protocol/parameters-v2-policy.md:L1-L14,L16-L60,L69-L158,L160-L193,L208-L340`: candidate manifest, formulas, vectors, CWQ-1, DAO temporal rules, and CCPS-1.
- `origin/main@fb0e346:docs/protocol/PR1-PR4_ACCEPTANCE_CRITERIA.md:L1-L21,L36-L84,L86-L125,L126-L184,L186-L244`: fixture-only boundary and unit/fuzz/invariant acceptance criteria.
- `origin/main@fb0e346:contracts/test/fixtures/V2FundingFixture.sol`: exact-target sequential funding, refund, frozen commitment, and test-only boundary.
- `origin/main@fb0e346:contracts/test/fixtures/V2FinancialAccountingFixture.sol`: immutable transcript, fixed reward, unclaimed liability, refund, and custody model.
- `origin/main@fb0e346:contracts/test/fixtures/V2CourtResetFixture.sol`: deterministic test assignment, bounded reset compensation, collateral, procedural duties, and terminal exhaustion model.
- `origin/main@fb0e346:contracts/test/fixtures/V2BackerDaoCourt2Fixture.sol`: deterministic CWQ-1/DAO/Court 2 adapter, temporal exclusions, and exhaustion path.
- Corresponding `origin/main@fb0e346:contracts/test/unit/VNext/V2*.t.sol`, `contracts/test/fuzz/V2*.t.sol`, and `contracts/test/invariant/V2*.t.sol`: inspected test definitions; not executed in this audit.

### Verification limits

- No test command was run.
- No build or compiler command was run.
- No Anvil, deployment, database, indexer, or frontend acceptance run was performed.
- No security property is claimed beyond what the inspected source structure explicitly supports.
- The remote baseline was inspected with read-only Git commands; it was not checked out and no runtime file was edited.

## Final readiness conclusion

FundTogether VNext deserves further **research-fixture and simulation work**, but not runtime adoption or public funding. The most important next decision is not whether to add Court 2: it is whether the project can freeze an approved policy and an integrated, bounded accounting/state model that makes funding, evidence, court duties, reset compensation, refunds, and unclaimed liabilities simultaneously auditable.

The minimum defensible contribution is a reproducible comparison of B0, B1, and B2 under shared synthetic assumptions, including negative results for wallet splitting, reset economics, and full-system cost. Until that evidence and the policy/integration gates exist, V2 should remain a labeled research proposal with isolated fixtures—not a production protocol claim.
