# SIM-02 Experimental Preregistration and Statistical Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reviewable, reproducible SIM-02 preregistration that freezes B0/B1/B2 comparisons, overlap identification, liveness assumptions, statistical analysis, power planning, decision thresholds, and readiness gates without running a confirmatory experiment.

**Architecture:** Keep the study design in four focused Markdown documents linked to the existing research protocol and reports. Add one isolated, standard-library analytical power-planning helper and a focused test so the sample-size table is reproducible without changing the SIM-01 generator or production code. Keep external protocol references in a separate source memo.

**Tech Stack:** Markdown; Python 3.11+ standard library (`statistics.NormalDist`, `json`); existing `research/pilot` pytest conventions.

**Spec:** User-provided SIM-02 task in `C:\Users\dell\.codex\attachments\0d24e757-7890-4d66-af6a-25a884519216\Pasted text.txt`.

## Global Constraints

- This is a design and preregistration task; do not run confirmatory Monte Carlo.
- B0, B1, and B2 share truth, population, case quality, evidence, capital, attacker resources, and initial assignment; B2 receives no privileged information.
- `C1 = B1 - B0`; `C2 = B2 - B1`; C2 does not separately identify DAO gating from the extra Court.
- `SUBSTANTIVE_VERDICT`, `PROTOCOL_FAIL`, and `STUCK` remain distinct; procedural failure is never a substantive incorrect verdict.
- O1 slot-keyed overlap is primary; O2 wallet-identity-keyed overlap is a separately labeled sensitivity; no large overlap simulation is added.
- Candidate economics and acceptance margins remain `PROPOSED_PENDING_APPROVAL` or `PENDING_OWNER_APPROVAL` unless the source marks them locked.
- Existing production contracts, backend, frontend, indexer, Foundry fixtures, raw datasets, and SIM-01 generators are not modified.
- The desktop checkout remains untouched; all changes are made in the isolated SIM-02 worktree.

## Review Focus

- Denominator drift between all-trial correctness, conditional accuracy, and substantive resolution — pin every estimator and zero-denominator rule in the SAP and its tests.
- Court 2 exhaustion being misreported as a harmful substantive reversal — preserve typed outcome semantics and the reporting checklist.
- Shared base cases or overlap treatments being counted as independent replications — define the bootstrap unit and pairing explicitly.
- Power planning hiding uncertainty through a single optimistic variance — test multiple binary marginal/correlation scenarios and reproduce the published table.
- Pending policy values silently becoming acceptance gates — maintain the decision register and readiness report with explicit approval states.

---

### Task 1: Preregistration and source boundary

**Files:**
- Create: `docs/research/VNEXT_SIM_02_PREREGISTRATION.md`
- Create: `docs/research/VNEXT_SIM_02_EXTERNAL_SOURCES.md` (bounded primary-source memo from the source-audit side task)

**Interfaces:**
- Consumes: current research protocol, hardening RFC, readiness/PILOT-01/SIM-01 reports, V2 policy registry, PR3/PR4 fixture semantics, and the verified `origin/main` revision.
- Produces: frozen research question, hypotheses, baselines, treatment/pairing rules, operating cells, threat model, overlap identification table, falsification conditions, and source classifications used by Tasks 2–4.

- [ ] **Step 1: Record the source revision map and authority classes** in the preregistration, distinguishing current direction, research specification, synthetic pilot/model, Foundry-only fixture, pending policy, exploratory result, and production runtime evidence.
- [ ] **Step 2: Define B0/B1/B2, C1/C2, the balanced synthetic data-generating process, and the primary paired base-case unit** without adding a new baseline or privileged B2 information.
- [ ] **Step 3: Freeze O1/O2 overlap and low/high/uniform ownership assignment variants** with a table of shared randomness, changed mechanisms, identifiable effects, residual confounding, and unsupported claims.
- [ ] **Step 4: Define exact R1/R2/R3 primary cells and a small predeclared sensitivity set**, preserving scarcity and misleading-signal negative regions and recording the fixed seed/stream/model identifiers.
- [ ] **Step 5: Add threat-model rows and a dedicated falsifiability section** describing attacker objective, capability, budget, information, strategy, observed outcomes, failure conditions, and what would reject B2.

### Task 2: Statistical Analysis Plan

**Files:**
- Create: `docs/research/VNEXT_SIM_02_STATISTICAL_ANALYSIS_PLAN.md`
- Create: `research/pilot/tools/sim02_power.py`
- Create: `research/pilot/tests/test_sim02_power.py`

**Interfaces:**
- Consumes: estimands and cells from Task 1; no SIM-01 generator changes.
- Produces: exact numerator/denominator definitions; typed missing/undefined rules; hierarchical liveness-safety and correctness gates; paired cluster-bootstrap specification; multiplicity plan; stopping rules; cost layers; and a reproducible analytical power table.

- [ ] **Step 1: Write tests for paired binary variance, invalid correlations/probabilities, and sample-size ceilings** using a candidate planning margin only as an illustrative, non-binding input.
- [ ] **Step 2: Implement `paired_binary_variance(p_left, p_right, pair_correlation)` and `required_pairs(effect, variance, alpha, power)`** with validation, `ceil`, and standard-library normal quantiles; do not import or alter SIM-01 modules.
- [ ] **Step 3: Add a deterministic CLI/table function** that emits JSON or Markdown rows for multiple plausible marginal probabilities, pair correlations, endpoint margins, Holm-adjusted alpha, and rare-event precision notes.
- [ ] **Step 4: Specify the primary paired cluster bootstrap** (base-case resampling unit, 10,000 replicates, two-sided intervals plus one-sided safety/superiority bounds, degenerate and zero-denominator handling) and the hierarchical gatekeeping/Holm family.
- [ ] **Step 5: Freeze candidate replication counts and a logical computational cap** justified by the helper’s worst plausible variance table, while marking all unapproved margins and economic gates as pending rather than binding.
- [ ] **Step 6: Specify fixed/sequential stopping, invalid-output handling, infrastructure failure, additional-replication versioning, and reporting format; explicitly prohibit optional stopping on B2 superiority.**

### Task 3: Decision register and readiness

**Files:**
- Create: `docs/research/VNEXT_SIM_02_RESEARCH_DECISION_REGISTER.md`
- Create: `docs/research/VNEXT_SIM_02_READINESS_REPORT.md`

**Interfaces:**
- Consumes: source classifications and analysis gates from Tasks 1–2.
- Produces: owner-approval queue, candidate threshold table, liveness-policy defaults, cost/measurement status, and separate research-design/confirmatory/production readiness decisions.

- [ ] **Step 1: Register unresolved CWQ-1, DAO conflict, CCPS-1, Court 2 exhaustion, randomness, evidence availability, reward/refund, and timing decisions** with exact candidate values, approval state, and conclusion sensitivity.
- [ ] **Step 2: Register candidate correctness, resolution, protocol-failure, operations, latency, capital-lock, and adversarial-failure thresholds** with availability and consequences; do not label candidates approved.
- [ ] **Step 3: Define recommended research defaults for insufficient Judges, non-reveal, reset exhaustion, selection failure, DAO no quorum, Court 2 exhaustion, retries/timeouts, terminal failure, refund/unlock, and `STUCK` semantics.
- [ ] **Step 4: Summarize verified capabilities and blockers at the current baseline and issue the readiness matrix: design GO/conditional GO, confirmatory implementation conditional GO, confirmatory execution NO-GO, production NO-GO, superiority claim NO-GO.**

### Task 4: Verification, review, and handoff

**Files:**
- Modify: only the five new/sidecar files above if cross-document corrections are required.

**Interfaces:**
- Consumes: all Task 1–3 artifacts and the current repository SHA.
- Produces: checked Markdown, focused test evidence, a scoped commit, and one PR with the required concise body.

- [ ] **Step 1: Run the helper’s focused test and any available pilot test suite; record actual exit codes and distinguish unavailable dependencies from failures.**
- [ ] **Step 2: Perform mathematical consistency, statistical-methodology, protocol/liveness, fairness, source/reference, and cross-document consistency reviews.**
- [ ] **Step 3: Run Markdown checks and `git diff --check`; verify only research docs/helper/test/plan files changed and no production/fixture/raw-result files changed.
- [ ] **Step 4: Re-read the plan and task success criterion, inspect the final diff, commit the focused branch, push it, create one PR, and attach the verified PR URL.**
