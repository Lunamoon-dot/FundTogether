# SIM-02 Statistical Design Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate SIM-02 so regional benefit claims use a valid intersection–union/Holm procedure, joint power is evaluated with feasible categorical outcomes, evidence labels have explicit semantics, and R3 treatments are independently reproducible.

**Architecture:** Keep the confirmatory procedure in the SAP and preregistration, add a standalone planning-only Python module for categorical joint outcomes, bootstrap-style p-values, IUT/Holm decisions, and deterministic power diagnostics, and publish its JSON/Markdown output as design-stage evidence. Put the detailed adversarial treatment contract in a separate SIM-02 research document linked by the preregistration.

**Tech Stack:** Markdown; Python 3.11+ standard library; NumPy only for the isolated planning tool; pytest.

**Spec:** User-provided remediation task in `C:\Users\dell\.codex\attachments\c8f39e1e-7c80-403a-9511-34db2e7b2902\Pasted text.txt`.

## Global Constraints

- Do not run confirmatory B0/B1/B2 Monte Carlo or modify SIM-01, production runtime, contracts, fixtures, raw datasets, or financial state.
- Preserve `Y_m <= R_m` by generating one categorical outcome per mechanism: `CORRECT`, `INCORRECT`, or `PROTOCOL_FAIL`.
- Keep candidate margins and protocol/economic parameters `PENDING_OWNER_APPROVAL` or `PROPOSED_PENDING_APPROVAL`.
- Use fixed planning seeds, report Monte Carlo uncertainty, retain null and unfavorable scenarios, and label every planning result `DESIGN_STAGE_POWER_ANALYSIS`.
- Update only SIM-02 research documents, the isolated planning tools/tests, and this remediation plan.

## Review Focus

- A regional positive claim must pass both component gates; test the max component p-value and Holm step-down directly.
- Coupling tables must have exact marginals, non-negative cells, and no impossible `Y=1,R=0` state; test aligned, independent, and reverse feasible couplings.
- The null-boundary diagnostic must report uncertainty rather than treating one seed as calibration proof.
- R3 attacker actions must not read truth, change total capital, or silently turn protocol failure into substantive harm.
- Planning output must replay byte-for-byte from the same seed and remain separate from confirmatory evidence.

---

### Task 1: Executable joint-power planner

**Files:**
- Create: `research/pilot/tools/sim02_joint_power.py`
- Modify: `research/pilot/tests/test_sim02_power.py`
- Create: `research/pilot/tests/test_sim02_joint_power.py`
- Create: `docs/research/VNEXT_SIM_02_JOINT_POWER_PLANNING.json`
- Create: `docs/research/VNEXT_SIM_02_JOINT_POWER_PLANNING.md`

**Interfaces:**
- `categorical_joint_table(...) -> tuple[tuple[float, ...], ...]`
- `validate_joint_table(table) -> None`
- `paired_contrasts(table) -> dict[str, float | None]`
- `iut_joint_pvalue(p_resolution, p_correct) -> float`
- `holm_rejections(p_values, alpha) -> tuple[bool, ...]`
- `run_planning(config) -> dict`
- CLI emits deterministic JSON or Markdown.

- [ ] Write failing tests for category feasibility, exact marginals, logical `Y <= R`, IUT/Holm truth tables, degenerate contrasts, deterministic replay, and null-boundary/rare-event diagnostics.
- [ ] Implement the valid 3-state coupling and centered paired-bootstrap p-value used by the planning-only decision engine; use exact joint tables and reject invalid inputs.
- [ ] Add fixed scenarios covering favorable, correctness-boundary, resolution-boundary, unacceptable resolution loss, no benefit, strong dependence, weak/unfavorable dependence, and additional-protocol-failure scarcity.
- [ ] Run fixed sample sizes 1,500/2,000/3,000 for both target regions, report marginal gate power, Holm/IUT regional power, global two-region power, false regional claims, dependence, and binomial Monte Carlo uncertainty.
- [ ] Generate machine-readable and Markdown planning evidence with the fixed master seed, replication count, bootstrap count, model version, and `DESIGN_STAGE_POWER_ANALYSIS` label.

### Task 2: Formal statistical and semantic documents

**Files:**
- Modify: `docs/research/VNEXT_SIM_02_PREREGISTRATION.md`
- Modify: `docs/research/VNEXT_SIM_02_STATISTICAL_ANALYSIS_PLAN.md`
- Modify: `docs/research/VNEXT_SIM_02_RESEARCH_DECISION_REGISTER.md`
- Modify: `docs/research/VNEXT_SIM_02_READINESS_REPORT.md`

**Interfaces:**
- Documents consume the planner’s named scenarios and outputs without promoting candidate margins or planning results to approval/evidence.

- [ ] Replace separate component multiplicity families with the regional IUT `p_joint=max(p_resolution,p_correct)` followed by Holm across the fixed R1/R2 joint-claim family; define the all-regions global success rule and keep R3 descriptive/falsification-only.
- [ ] State the validity argument for IUT and Holm under arbitrary dependence, and document bootstrap calibration diagnostics, limitations, degenerate/rare-event rules, and failure interpretation.
- [ ] Define `evidence_class` as metadata-only for primary SIM-02; explicitly prohibit hidden effects on Judge accuracy, difficulty, signals, or selection and defer behavioral evidence modeling.
- [ ] Link a detailed R3 treatment contract and record pending parameters, implementation-validation blockers, joint-power dependency, and readiness gates.
- [ ] Preserve the historical analytical marginal power table as a non-joint reference and link the new planning evidence.

### Task 3: Reproducible R3 treatment contract

**Files:**
- Create: `docs/research/VNEXT_SIM_02_R3_TREATMENTS.md`

**Interfaces:**
- Defines version `sim-02-r3-dgp-v1`, treatment parameters/statuses, exact pseudocode, random-stream domains, input/output schema, deterministic vectors, and unresolved inputs for R3-A through R3-E.

- [ ] Specify attacker objective, identities, budget, information boundary, timing, randomness, eligibility/conflict rules, observables, failure conditions, and counterexample tests for each treatment.
- [ ] Ground CCPS-1 and CWQ-1 vectors in the verified Foundry-only fixture semantics while preserving the fixture/runtime boundary.
- [ ] Mark every unapproved parameter `PENDING_OWNER_APPROVAL` and distinguish deterministic flip demonstrations from probabilistic attack-success estimates.

### Task 4: Verification and handoff

**Files:**
- Modify: all files created/changed above only.

- [ ] Run focused planner tests, original power-planner regression tests, the full `research/pilot` test suite, `git diff --check`, and changed-file scope audit.
- [ ] Re-run the planner CLI and verify JSON replay is byte-identical; record failed/inconclusive diagnostics and keep readiness at conditional/no-go where required.
- [ ] Update the existing PR #27 branch without merging; report commit, source baseline, diagnostics, approvals, and readiness separately.
