# FundTogether VNext Research Readiness Report

**Audit date:** 2026-10-26 (Asia/Ho_Chi_Minh)  
**Requested baseline:** `main` after PR #20, `fb0e346e7253e4fbe8b4681c4fbf9dbdaa84e2d8`  
**Checked-out revision:** `467a6543c96aec6ccfb4854a75dcf3bad060787a`  
**Checked-out state:** dirty and 35 commits behind the local `origin/main` ref  
**Scope:** source-of-truth audit and research-readiness assessment only.

**Remediation review date:** 2026-10-27 (Asia/Ho_Chi_Minh)  
**PR #21 state independently verified:** `MERGED`; publication head `6cf97a17fb4ed1eec83eb7bf99cc29f515fc2a33`  
**Documentation-remediation baseline:** `origin/main@e90face3e1d7bf8aebf2cdece92ea5766af45674`

**PR #22 state independently verified:** `MERGED`; remediation head `497418545cb3fd972d5bd62581bcfbc88309b3e0`  
**Final-review follow-up baseline:** `origin/main@b6f001471dd6f62f9d1ed98cc4d89f2d1ecc51d9`  
**Final-review branch:** `codex/pr22-final-research-review`

The 2026-10-26 checkout metadata above is preserved as historical audit evidence. It describes the original dirty desktop checkout, not the clean isolated worktree used for this follow-up review. PR #21 was already merged when remediation began, so this revision is a separate documentation-only follow-up and does not rewrite the merged branch or `main`.

## Executive decision

| Area | Decision | Reason |
|---|---|---|
| Pilot model validation | **Conditional GO** | The corrected protocol is internally specified well enough to implement validation-only pilot code later. Pilot output cannot be treated as confirmatory or as owner approval. |
| Full confirmatory Monte Carlo | **NO-GO** | Minimum effects, premium limits, confidence/multiplicity choices, rare-event precision, replication cap, stopping rules, scenario weights, and final decision rule remain `PENDING_OWNER_APPROVAL`. |
| Foundry fixture remediation | **Conditional GO in a separate task** | The RFC now defines bounded candidate semantics and acceptance tests, but this documentation task did not modify or run fixtures. Economic and timeout policies remain pending. |
| V2 runtime implementation or user funding | **NO-GO** | The checked-out runtime is a partial VNext slice and is not storage- or transition-compatible with the V2 design. Several economic, governance, evidence, and liveness decisions remain `PROPOSED_PENDING_APPROVAL`. |
| Production/public-chain deployment | **NO-GO** | No source audit in this report establishes integrated contract/indexer/backend/frontend acceptance, production randomness, gas scalability, evidence availability, or security of the proposed policy. |
| Claim that V2 is superior to simpler juries | **NO-GO** | No controlled simulation results were supplied or run. The current artifacts define candidate mechanisms and test seams, not comparative scientific evidence. |

**Verification statement:** The original audit and this remediation used repository inspection, Git metadata, the V2 policy package, and PR1-PR4 fixture/test source. No simulation, calibration, Solidity test, build, deployment, Anvil reset, or destructive command was run. Earlier test-run claims remain documented claims, not independently re-run evidence.

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
| Three eligible Judges guarantee that a bounded random draw can assign three Judges | **False assumption** | Distinguish proven `INSUFFICIENT_ELIGIBLE` from draw-budget, randomness, collateral, gas, and caller-omission failures; use bounded recovery and terminal rules |
| Existing VNext invariants cover V2 conservation and cross-case liabilities | **Not confirmed** | New V2-specific invariant and integration tests are required |
| Fresh Court 2 wallets make errors independent of Court 1 | **False assumption** | Shared case/evidence difficulty induces cross-court dependence even with no wallet overlap |
| A terminal `PROTOCOL_FAIL` is a successful substantive resolution | **False assumption** | Report terminal completion and substantive resolution separately |
| The full DAO model may use `alpha_appeal`/`beta_appeal` as both inputs and outputs | **False assumption** | They are outputs of generated ballots; a direct-input analytical model must be separate |

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

**Minimum research default.** Use the RFC's pending **T1-B atomic close with typed selection recovery** semantics. The assignment deadline starts at `CASE_READY`. Before it, permissionless assignment is allowed. At or after it, ordinary assignment is disabled and a permissionless close transaction must atomically assign when the approved selection path proves that three eligible Judges can be reserved. A proven `INSUFFICIENT_ELIGIBLE` condition may finalize unassigned `PROTOCOL_FAIL`; draw-budget exhaustion, unavailable randomness, changed collateral, gas-bounded failure, and caller omission must enter the declared bounded recovery/terminal policy instead of being mislabeled as insufficient eligibility.

Eligibility is checked at the close transaction in the isolated default; a true deadline snapshot needs a separate bounded snapshot policy. Selection entropy must be fixed before the closer can exploit transaction timing. Do not slash when nobody was assigned. An unassigned protocol failure creates no service/reset liability and opens the remaining contribution escrow for pull refunds after terminal accounting. The finite recovery budget, reason codes, and randomness/caller timeout remain pending policy.

**Required proof obligation.** Under the declared assumptions, every path must either assign a court, enter a bounded reset, or reach a terminal state. The ledger must reserve any reset compensation before assignment and must not draw it from creator/backer milestone escrow or an unfunded reward reserve.

**Unproven.** No protocol can guarantee liveness if the eligible stake pool remains empty, the randomness source fails, or all eligible participants are unavailable. These conditions must be explicit terminal outcomes, not hidden retries.

### A3 — Bounded contributors, DAO snapshots, and refunds (High)

**Finding.** Contributor lists and refund entitlement processing are potentially large. The current fixture refund path is incremental, but the source also inserts each new contributor into an ascending array, shifting an existing suffix in the worst case. V2 DAO snapshot and contributor-weight work is not integrated into the runtime. Pagination of refund preparation does not bound contribution recording or canonical-order construction; a single unbounded creation/finalization loop is an availability risk.

**Recommendation.** Separate (1) append-only contribution recording, (2) bounded canonical-order construction, and (3) paginated snapshot/refund preparation. For the minimal research fixture, retain sorted insertion only as a small-vector exactness reference and benchmark; use an append-only ledger plus an explicitly selected authenticated/bounded order primitive before opening DAO or refund claims. Store contributor identities and weights in bounded batches, maintain aggregate totals incrementally, and use O(1) refund claims after entitlement finalization. A Merkle claim root is acceptable only if measured gas requires it and the protocol adds an on-chain root challenge or fraud-proof path. The order primitive remains an implementation/research dependency until specified and measured.

Refund dust must follow the current candidate registry exactly: calculate checked floor base entitlements, then allocate one extra base unit to each of the first `dust` positive contributors in ascending canonical-address order. A two-pass stored-cursor process freezes every base entitlement and then the canonical dust prefix. Claims remain closed until both passes finalize. A single lowest-address dust recipient is not equivalent and is rejected by this review.

**Trade-offs.** Incremental state is simplest and easiest to audit but has storage cost. Pagination is compatible with permissionless progress but requires idempotent cursors. A root reduces iteration but adds trust, data-availability, and challenge complexity. The hybrid option is acceptable only with an on-chain commitment and a recoverable dispute mechanism.

**Benchmark gate.** Measure contribution recording, canonical-order construction, snapshot, finalization, and claim gas at increasing contributor counts under random and reverse insertion order. Record the first failing/reverting count, block gas limit margin, and per-claim cost. Do not select a design from a nominal maximum or infer production scalability from the current sorted-insertion fixture without this measurement.

### A4 — Judge registry scalability and eligibility (High)

**Finding.** Permissionless zero-stake registration can grow the Judge pool without adding usable court capacity. A minimum stake alone does not prove Sybil or collusion resistance; one actor can still control multiple funded wallets.

**Minimum direction.** Separate registration from eligibility. Require sufficient available collateral for the case/risk, reserve it before assignment, release it only after the case-level obligation ends, and exclude creator, prior-case Judges, and policy-defined Court 1/DAO voters from later stages. Selection must be unpredictable and gas-bounded; selection order must not favor early registrants.

**Unproven.** No candidate in the current artifacts establishes a Sybil guarantee, bribery resistance, or truthful voting. Those are empirical/economic questions and must remain explicit limitations.

### A5 — Aggregate financial invariants (Critical)

The V2 accounting target is:

```text
Refunded_m = refunded_m + settlementRefunded_m

raised_m
  = creatorPaid_m + judgePaid_m + Refunded_m + escrowRemaining_m

judgePaid_m
  = judgeRewardClaimed_m + JudgeRewardUnclaimed_m

milestoneCustodyAttribution_m
  = escrowRemaining_m + JudgeRewardUnclaimed_m

sum_m(milestoneCustodyAttribution_m) <= physicalTokenCustody
```

Here `judgePaid_m` is the funded reward allocation, while `judgeRewardClaimed_m` is transferred. `escrowRemaining_m` already contains unclaimed creator and Backer-refund allocations; they must not be added again. The aggregate inequality becomes equality only when every live milestone is included and there are no foreign/unattributed deposits or other custody sources. Post-settlement `fundedLiabilities_m` is checked separately and should equal `milestoneCustodyAttribution_m` under the fixture construction.

The model must additionally isolate CCPS-1 stake custody from crowdfunding custody, handle mixed `FINAL_PASS`, `VERDICT_FAIL`, and `PROTOCOL_FAIL`, preserve liabilities for unclaimed rewards, and keep each campaign/milestone/case namespace independent.

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
| R4 | **High** | Court assignment may fail indefinitely or leave escrow locked, or may misclassify selection failure as an empty pool | Current runtime and fixtures do not prove production-scale eligible-pool liveness or bounded draw coverage | Typed failure reasons, bounded recovery/terminal state, prepaid stake-only liabilities, and selection coverage evidence |
| R5 | **High** | Contribution recording, canonical-order construction, DAO, or refund processing can exceed gas limits | Sorted insertion, full-pool selection, DAO loops, and refund scans are not benchmarked here | Append-only/bounded order design, incremental/paginated processing, and measured gas thresholds |
| R6 | **High** | Registration and wallet splitting are mistaken for Sybil resistance | CWQ-1 explicitly exposes splitting advantage; deterministic fixture selection is not random | Attack-model simulation, stake/collusion sensitivity, and no overclaiming |
| R7 | **High** | Unclaimed Judge rewards or reset obligations are double-counted or unfunded | V2 fixture proposes separate ledgers; live integration absent | Cross-case custody invariant and failed-transfer/idempotency tests |
| R8 | **High** | Backend/indexer projection diverges from chain authority | Architecture requires event-driven projections; V2 events/projections are not integrated | Canonical event schema, replay/idempotency tests, and chain-first UI state |
| R9 | **Medium** | Test-only seams are mistaken for deployment security | MockReviewFinality and deterministic fixture entropy are explicit seams | Label fixtures, block direct seam use from production, and test live boundaries separately |
| R10 | **Medium** | Scientific result is underpowered, selectively resolved, or incomparable | Identity-keyed streams and metrics are now specified, but thresholds, sample size, stopping, scenario weights, and results remain unfrozen/unavailable | Approve preregistration table, validate the generator in a pilot, then freeze confirmatory design before results |
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
5. adversarial comparisons against B0 and B1 using identity-keyed paired streams and declared synthetic assumptions.

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

> Under a declared finite synthetic model, does collateral-backed Court Reset combined with DAO-gated Court 2 improve substantive adjudication correctness and recovery from procedural failure compared with simpler jury mechanisms, at an acceptable financial cost, latency, and capital-lock premium?

The answer must remain open.

### Comparable models

| Model | Required behavior | Must not include |
|---|---|---|
| B0 | One three-Judge court; all reveals required; two-of-three substantive verdict or `PROTOCOL_FAIL` | Reset, DAO, Court 2 |
| B1 | B0 plus one bounded fresh Court 1 reset and CCPS-1 stake-only compensation | DAO/Court 2, unbounded retries |
| B2 | B1 Court 1; generated BackerDAO ACCEPT/APPEAL ballots; one fresh Court 2 with the same primary Judge model; proposed accounting | Privileged truth, intrinsically better Court 2 Judges, or unverified real-world protocol claims |

All models receive the same case/truth/evidence latent, Judge population, stable attributes, potential Judge-case behavior, adversarial capital, stake assumptions, and contribution capital. Identity-keyed streams—not a shared draw cursor—preserve potential outcomes when B1/B2 consume extra reset, DAO, or Court 2 draws.

### Corrected dependence and DAO model

The primary correlated-error model is shared-case Beta-Bernoulli:

```text
P_case ~ Beta(a * (1/rho - 1), (1-a) * (1/rho - 1))
Correct_j | P_case ~ Bernoulli(P_case)
```

For `0 < rho < 1`, marginal correctness is `a` and pairwise within-case correlation is `rho`; `rho = 0` is an explicit independent-Bernoulli special case. Court 1 and Court 2 share `P_case`, so fresh wallets do not erase shared-evidence error. Stable Judge heterogeneity is a separate logistic random-effects sensitivity model and cannot reuse the closed-form `rho` interpretation.

Backers receive imperfect private signals about whether Court 1 is wrong; they never observe truth. Eligibility exclusions, participation, strategic abstention, attacker control, contribution splitting, and `floor_sqrt(contribution)` weights generate actual ballots. In the full DAO model, `alpha_appeal = P(DAO_APPEAL | Court 1 incorrect)` and `beta_appeal = P(DAO_APPEAL | Court 1 correct)` are measured outputs. A direct-input analytical model is separate and cannot be pooled.

### Metrics and statistical method

- **Resolution:** substantive resolution (`FINAL_PASS`/`VERDICT_FAIL`) and terminal completion (including `PROTOCOL_FAIL`) with different denominators.
- **Correctness:** conditional substantive accuracy, correct substantive outcomes/all trials, false PASS/all trials, false FAIL/all trials, and coverage.
- **Liveness:** protocol-failure rate, stuck rate, censoring-aware time to substantive resolution, and time to any terminal state.
- **Economics:** service rewards, slashing/compensation, attacker net gain/loss, locked stake, reserve use, escrow immobilization, and independently measured gas.
- **Adversarial:** Sybil appeal-flip rate, collusion success, strategic non-reveal profitability, and selection-manipulation advantage.

Use deterministic domain-separated streams keyed by master seed, replication, domain, and entity identity for truth/difficulty, stable Judge quality, Judge-case vote/non-reveal, control/collusion, selection, DAO signal/participation/strategy, and timing. Analyze within-replication paired differences and independent replication clusters. `PROTOCOL_FAIL`/`STUCK` are censored or competing events for substantive time, not fictitious resolved times.

### Hypotheses and falsification

- **H1:** Court Reset improves substantive resolution under non-reveal. A rise only in terminal `PROTOCOL_FAIL` does not support H1.
- **H2:** Generated DAO selection plus same-quality Court 2 improves all-trial correct substantive outcomes within frozen coverage/cost bounds.
- **H3a:** deterministically reproduce CWQ-1 Q6/Q10 splitting; failure invalidates the simulation implementation.
- **H3b:** estimate splitting flip frequency/severity under frozen contribution and attacker distributions; finite non-observation cannot erase H3a.
- **H4a:** deterministically reproduce CCPS-1 coverage and same-actor finalizer recapture arithmetic; failure invalidates the simulation implementation.
- **H4b:** estimate attacker profitability/deterrence sensitivity under declared control, gas, rewards, and finalizer assumptions.
- **H5:** Full VNext imposes additional cost and latency that may outweigh improvements in some scenarios. Reject only if B2 is never worse than B0/B1 within the predeclared cost/latency bounds; any region where B2 loses is a valid result.

H2 must be evaluated across informative, non-informative, and misleading
Backer-signal regions. The B2-versus-B1 contrast is the Court 2/DAO effect
under the same Court Reset baseline; it must not be inferred from B2-versus-B0,
from a change in Judge quality, or from selective exclusion of misleading
signals.

The Experimental Protocol now names the primary comparisons and a preregistration decision table, but numerical minimum effects, premium limits, confidence/multiplicity choices, rare-event precision, sample size, stopping rules, replication cap, scenario weights, and retain/reject thresholds all remain `PENDING_OWNER_APPROVAL`. Pilot model validation may proceed; confirmatory inference may not.

Reject Full VNext for a declared region when it misses the frozen all-trial correctness/coverage benefit, violates any frozen cost/latency/capital/adversarial bound, depends on privileged Court 2 information, or is Pareto-dominated by B0/B1. Negative regions must remain in the report.

## 8. Go/no-go criteria

### Conditional GO for pilot model validation

The corrected design is internally consistent enough for a later validation-only pilot. The pilot is limited to implementing and checking the declared generator, keyed-stream replay, analytical `a`/`rho` targets, informative/non-informative/misleading DAO signal cases including `s < f`, B2-versus-B1 paired invariance, DAO signal/ballot logic, outcome classification, deterministic H3a/H4a vectors, and variance/precision estimates. It must use pinned source/model versions and publish raw validation output. Contribution/order-processing gas and liveness benchmarks belong to a separately scoped fixture-validation task; this report contains no such measurements.

Pilot results are exploratory. They cannot approve policy, support a superiority claim, choose thresholds after inspection, or be pooled into the confirmatory sample unless that reuse was preregistered before pilot results were opened.

### NO-GO for full confirmatory Monte Carlo

Do not start confirmatory runs until the owner freezes every `PENDING_OWNER_APPROVAL` preregistration row: primary cells and outcomes, minimum effects, cost/latency/capital limits, attacker criterion, confidence and multiplicity, rare-event bound, sample size, `N_max`, stopping/futility rules, aggregation weights, confirmatory seeds, and retain/reject decision logic. Random-stream algorithm/version and all policy parameter values must also be immutable before unblinding.

### Conditional GO for Foundry fixture remediation in a separate task

The RFC supplies reviewable candidate semantics and acceptance tests for typed T1-B assignment recovery, prefix dust pagination, and aggregate accounting. Fixture changes may proceed only as isolated test work under explicit scope. T1-B timing/randomness/eligibility/recovery, refund economics, CWQ-1, CCPS-1, and other pending policy values remain candidates and cannot be promoted by fixture code. This documentation remediation did not modify or run Solidity.

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

No superiority claim is permitted without the frozen confirmatory design, identity-keyed paired comparisons, validated synthetic/literature parameter basis, raw reproducible results, uncertainty intervals, multiplicity treatment, sensitivity analysis, and all negative regions.

## 9. Ordered next steps

1. **Keep source identities explicit.** Preserve the historical `467a654` dirty-checkout audit, PR #21 head `6cf97a1`, merged PR #22 head `4974185`, and this follow-up's `origin/main@b6f0014` baseline as different evidence points. Any future code task must pin its own clean revision; do not reset the desktop checkout.
2. **Freeze the policy boundary.** Review O1-O8, record owner decisions, and publish an approved/pending status for each parameter. Keep all pending values out of runtime authorization.
3. **Keep the four V2 fixtures isolated.** Treat them as test models. Run their documented unit/fuzz/invariant commands only in a later verification step, and archive exact outputs, compiler revision, and policy identity.
4. **Define the integrated transition and event contract.** Resolve funding/evidence/case binding, timeout/reset exhaustion, temporal exclusions, and terminal financial treatment before touching production implementation.
5. **Approve or explicitly defer preregistration decisions.** Freeze primary cells/outcomes, effect and premium thresholds, interval/multiplicity rules, rare-event precision, sample size/cap/stopping, aggregation weights, and retain/reject logic before confirmatory work.
6. **Implement and validate the common generator in a later task.** Use identity-keyed streams, shared case difficulty, same-quality courts, generated DAO ballots, H3a/H4a deterministic vectors, and raw-result preservation. Run only a validation pilot first.
7. **Freeze the confirmatory design after pilot review.** If validation passes, archive pilot diagnostics and freeze independent confirmatory seeds/configuration; otherwise repair the model without making outcome claims.
8. **Benchmark gas and liveness.** Increase contributor/Judge/case counts until failure or unacceptable margin; use measured thresholds to choose incremental, paginated, or challenged-root processing.
9. **Implement only approved slices in dependency order:** funding/accounting, reset, DAO/Court 2, evidence/final ruling, indexer projections, then backend/UI and disposable local acceptance.
10. **Re-audit before deployment.** Require actual test/build/deployment evidence, independent security review, and explicit acceptance of residual Sybil, collusion, bribery, inactivity, randomness, and evidence-truth risks.

## 10. Dependency matrix

| Decision/evidence | Isolated fixture remediation | Simulation | Production integration | Current status |
|---|---:|---:|---:|---|
| Revision/deployment identity and complete commitment manifest | Required | Required | Required | Candidate manifest exists in remote baseline; checkout is not aligned |
| Per-milestone target, ordered opening, exact-target/refund boundary | Required for PR1 | Required | Required | V2 fixture design exists; current runtime is campaign-level |
| Reward rate, denominator, reserve, payout, refund, dust, failed transfer | PR2 input | Required for cost model | Required | Pending approval; accounting fixture exists |
| Exact PR2 allocation, custody-attribution, and funded-liability identities | PR2 tests | Required | Required | Reconciled in RFC; live integration absent |
| CCPS-1 D/F cost, collateral, recipient, reset limits, terminal behavior | PR3 input | Required | Required | Pending approval; reset fixture exists |
| Court 1/Court 2 assignment timeout and exhaustion | PR3/PR4 boundary | Required | Required | Pending; deterministic fixture seam only |
| CWQ-1 formula, cap, threshold, tie/empty, self-contribution | PR4 input | Required | Required | Pending; splitting limitation known |
| DAO snapshot timing and Court 1/DAO/Court 2 exclusions | PR4 input | Required | Required | Partially modeled in fixture; runtime absent |
| Evidence reference, availability, revision, reasoning disclosure | Fixture interface | Required as factor/assumption | Required | O5 pending; current hash is not truth/availability |
| Production randomness and gas-bounded selection | Not required for isolated seam | Required as limitation/factor | Required | Not established |
| Contributor recording, canonical-order, refund/DAO processing scalability | Benchmark fixture boundaries | Required as cost factor | Required | Not measured in this audit; sorted insertion is an explicit worst-case risk |
| Token custody, fee/failing transfer, reentrancy, idempotent claims | Required | Required for economic model | Required | Partial local coverage; V2 integration absent |
| Canonical events, indexer idempotency, backend/UI transaction states | Not needed for pure fixture | Optional observation model | Required | Architecture specified; V2 integration absent |
| Identity-keyed streams, ground truth, raw schema, CI/effect-size rule | No | Required | No | Design supplied; implementation/validation not run |
| Confirmatory thresholds, scenario weights, stopping and replication cap | No | Required | No | `PENDING_OWNER_APPROVAL`; confirmatory run blocked |
| Independent security/economic/scientific review | No | Recommended | Required before public launch | This document contains conceptual review only; external review and empirical execution remain outstanding |

## 11. Independent conceptual reviews

These reviews are separate document/source analyses. They are not a Solidity audit, empirical calibration, or external peer review.

### 11.1 Scientific methodology review

**Coverage:** probability equations and parameter identification; Court 1/Court 2 dependence; DAO signal and ballot generation; baseline fairness; paired sampling; selective-resolution bias; censoring; deterministic versus stochastic hypotheses; falsifiability; multiplicity, sizing, stopping, and rare events.

**Findings and remediation:**

- The prior per-Judge Beta draw represented between-Judge heterogeneity, not positive within-case correlation. It is replaced by an analytically checked shared-case Beta-Bernoulli primary model; stable Judge heterogeneity is a separate sensitivity model.
- The prior B2 factors could silently grant Court 2 better information and did not generate DAO ballots. Primary Court 2 now shares the Court 1 quality/evidence process, while imperfect Backer signals, participation, exclusions, splitting, collusion, and abstention generate ballots. `alpha_appeal`/`beta_appeal` are outputs in that model.
- Terminal completion could hide procedural failure. Substantive resolution, terminal completion, protocol failure, stuck state, conditional accuracy, all-trial correctness, coverage, and censoring-aware times are now separate.
- Two sequential seeds were insufficient common-random-number control. Domain- and identity-keyed potential outcomes now prevent B2-only draws from shifting B0/B1.
- H3/H4 mixed known counterexamples with finite-sample discovery. They are split into deterministic implementation validations (H3a/H4a) and quantitative frequency/profitability questions (H3b/H4b).

**Residuals:** numerical decision thresholds, scenario weights, calibration sources, sample size, stopping, and rare-event precision remain owner decisions. No parameter was empirically calibrated and no model code was run. Scientific conceptual result: **pilot validation conditional GO; confirmatory NO-GO**.

### 11.2 Protocol/security review

**Coverage:** milestone allocation and physical custody; earned/unclaimed claims; refund dust and claim idempotency; batch ordering; assignment deadline griefing; authorization; stake versus contribution custody; terminal liabilities; candidate-pool and gas assumptions.

**Findings and remediation:**

- The prior RFC's single dust recipient contradicted `canonical_address_prefix`. The corrected two-pass algorithm stores floor entitlements and gives one extra unit to each of the first `dust` ascending canonical addresses, with immutable cursors and replay/finalization guards.
- The prior aggregate prose added claims already contained in `escrowRemaining`. The corrected definitions match PR2 fields and distinguish allocation, successful transfer, funded liability, scoped custody attribution, and aggregate physical custody.
- The prior T1 rule did not resolve a deadline reached with three eligible Judges but no assignment transaction. The review confirmed that “three eligible” does not prove a bounded draw will find three: T1-B now requires typed selection failure reasons, a recovery state/budget, and terminal failure only for proven insufficiency or exhausted recovery; the closer cannot select failure while the approved selection path proves assignment is available. Eligibility snapshot, entropy, duration, recovery budget, and production adoption remain pending.
- The prior A3 recommendation bounded refund preparation but did not bound the fixture's sorted insertion during contribution recording or canonical-order construction. The remediation separates recording, order construction, and refund/claim layers, retains sorted insertion only as a small-vector reference, and requires an order primitive plus reverse-insertion gas benchmarks.
- CCPS-1 stake/compensation remains separate from crowdfunding escrow even when token type is the same. No unassigned case can create a slash, reward, or compensation claim.

**Residuals:** production randomness/fallback, bounded selection coverage/gas, finite recovery and caller-omission policy, contributor-order primitive, token behavior, refund-policy approval, and integrated multi-contract solvency are unresolved. Protocol conceptual result: **isolated fixture remediation conditional GO; production integration NO-GO**.

### 11.3 Specification-consistency review

**Coverage:** V1/V2 specifications, PR0 policy record, parameter registry, PR1-PR4 acceptance criteria, four V2 fixtures, relevant tests, all three research documents, PR #21 Git state, and historical audit metadata.

**Findings and remediation:**

- B0/B1/B2, H1-H5/H3a-H4b, `a`/`rho`, informative/non-informative/misleading signal classes, outcome denominators, and pilot/confirmatory gates now use the same meanings across the research documents.
- Prefix dust now matches `refundDustPolicy = canonical_address_prefix` and the accounting fixture's ascending contributor semantics.
- Financial equations now match `raised`, `creatorPaid`, `judgePaid`, `judgeRewardClaimed`, `refunded`, `settlementRefunded`, `escrowRemaining`, `milestoneCustodyAttribution`, `fundedLiabilities`, and `physicalTokenCustody`.
- Historical `467a654`/`fb0e346` metadata is preserved and explicitly separated from merged PR #21 head `6cf97a1`, merged PR #22 head `4974185`, and final-review baseline `b6f0014`.
- All O1-O8/CWQ-1/CCPS-1/reward/refund/randomness/evidence values remain pending where the registry marks them pending.

**Residuals:** the research documents propose typed T1-B recovery, a bounded canonical-order primitive, and paginated algorithms not implemented by the current fixtures. Source alignment does not equal passing tests or runtime adoption. Specification conceptual result: **documents aligned for independent review; runtime remains NO-GO**.

## 12. Source references and verification ledger

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

### Historical requested remote baseline, read-only inspected

- `origin/main@fb0e346:docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V2.md`: V2 decision register, implementation gap, accounting, reset, DAO/Court 2, dependency plan, and research boundaries.
- `origin/main@fb0e346:docs/protocol/PR0_POLICY_FINALIZATION.md:L1-L22,L25-L68,L71-L86,L89-L180,L185-L260,L273-L312`: pending policy status, O1-O8, campaign boundary, and PR dependencies.
- `origin/main@fb0e346:docs/protocol/parameters-v2-policy.md:L1-L14,L16-L60,L69-L158,L160-L193,L208-L340`: candidate manifest, formulas, vectors, CWQ-1, DAO temporal rules, and CCPS-1.
- `origin/main@fb0e346:docs/protocol/PR1-PR4_ACCEPTANCE_CRITERIA.md:L1-L21,L36-L84,L86-L125,L126-L184,L186-L244`: fixture-only boundary and unit/fuzz/invariant acceptance criteria.
- `origin/main@fb0e346:contracts/test/fixtures/V2FundingFixture.sol`: exact-target sequential funding, refund, frozen commitment, and test-only boundary.
- `origin/main@fb0e346:contracts/test/fixtures/V2FinancialAccountingFixture.sol`: immutable transcript, fixed reward, unclaimed liability, refund, and custody model.
- `origin/main@fb0e346:contracts/test/fixtures/V2CourtResetFixture.sol`: deterministic test assignment, bounded reset compensation, collateral, procedural duties, and terminal exhaustion model.
- `origin/main@fb0e346:contracts/test/fixtures/V2BackerDaoCourt2Fixture.sol`: deterministic CWQ-1/DAO/Court 2 adapter, temporal exclusions, and exhaustion path.
- Corresponding `origin/main@fb0e346:contracts/test/unit/VNext/V2*.t.sol`, `contracts/test/fuzz/V2*.t.sol`, and `contracts/test/invariant/V2*.t.sol`: inspected test definitions; not executed in this audit.

### Remediation baseline and merged publication state

- GitHub PR #21 was verified `MERGED` with head `6cf97a17fb4ed1eec83eb7bf99cc29f515fc2a33`; it was not rewritten.
- GitHub PR #22 was verified `MERGED` with head `497418545cb3fd972d5bd62581bcfbc88309b3e0`; it was not rewritten.
- `origin/main@b6f001471dd6f62f9d1ed98cc4d89f2d1ecc51d9` was the clean final-review follow-up base.
- Current V2 spec/policy/acceptance documents and PR1-PR4 fixture/test source were inspected from that base before remediation.
- Only the three research Markdown files were changed; runtime and test source were read-only evidence.

### Verification limits

- No test command was run.
- No build or compiler command was run.
- No Anvil, deployment, database, indexer, or frontend acceptance run was performed.
- No security property is claimed beyond what the inspected source structure explicitly supports.
- The original dirty checkout was inspected only with read-only commands and was not reset, cleaned, staged, or edited. The follow-up used the existing isolated worktree.

## Final readiness conclusion

FundTogether VNext is ready only for a later **pilot model-validation implementation** and separately scoped **isolated Foundry fixture remediation**. The documentation-review phase can close after this explicit bounding of signal, contributor-order, and assignment-selection issues; the next task should be a separately scoped Pilot Model Validation task. Full confirmatory Monte Carlo is **NO-GO** until hypotheses, numerical thresholds, scenario weights, parameters, identity-keyed stream rules, sizing, stopping, replication caps, and the typed assignment-recovery policy are frozen. Runtime adoption, user funding, and public-chain deployment remain **NO-GO**.

The minimum defensible contribution is a reproducible paired comparison of B0, B1, and B2 under shared synthetic assumptions, including substantive coverage, all-trial correctness, negative regions, deterministic wallet-splitting/finalizer counterexamples, and full-system cost. Until that evidence and the policy/integration gates exist, V2 remains a labeled research proposal with isolated fixtures—not a production protocol claim.
