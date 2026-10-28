# SIM-02 readiness report

**Assessment date:** 2026-10-28 (Asia/Ho_Chi_Minh)  
**Design revision:** sim-02-prereg-v1  
**Baseline:** origin/main@7d773668a201f8ba9c137fb6751d69122222b606  
**Scope:** research design and preregistration only

## Executive decision

| Area | Readiness | Basis |
| --- | --- | --- |
| SIM-02 research design | GO | Four linked design artifacts freeze the question, baselines, cells, estimands, analysis, planning, thresholds, and readiness gates |
| Confirmatory simulation implementation | CONDITIONAL GO | A later implementation may proceed after pending policy/margin/liveness decisions and schema/fixture validation are approved |
| Confirmatory Monte Carlo execution | NO-GO | No owner-approved effect margins, complete economic/timing inputs, final liveness policy, or validated implementation |
| Production integration | NO-GO | Current runtime is not V2 storage/transition compatible; fixtures are not deployment authority |
| Scientific superiority claim | NO-GO | This PR runs no confirmatory experiment and does not establish B2 benefit |

The design is specifically allowed to recommend B0, B1, conditional B2, or
INCONCLUSIVE. It does not defend the proposed mechanism.

## 1. Verified capabilities

| Capability | Evidence/classification | What it supports |
| --- | --- | --- |
| Paired B0/B1/B2 synthetic workflow | research/pilot source at the merged SIM-01 remediation baseline | future paired design; not production behavior |
| Correct all-trial and conditional metric split | SIM-01 remediation report/source at d86bffff | denominator contract for SIM-02 |
| Explicit overlap treatment and realized ratio | SIM-01 remediation source/config | O1/O2 preregistration seam; not a causal result |
| Keyed deterministic random streams | research/pilot source and PILOT-01 validation report | replayable future implementation |
| Shared-case Beta-Bernoulli dependence | experimental protocol and pilot validation | declared synthetic correlation model |
| PR3 reset/collateral arithmetic | V2CourtResetFixture.sol at 6bf3716 | Foundry-only fixture semantics |
| PR4 DAO/Court 2 conflicts and exhaustion | V2BackerDaoCourt2Fixture.sol at d00c92dca186164ff2bb842e420b9ac2f80c9f76 | Foundry-only fixture semantics |
| Exact policy status labels | parameters-v2-policy.md at d1b3b5f | prevents pending values becoming approvals |
| Analytical paired power calculation | sim02_power.py in this branch | design-stage planning only; no experiment |

These capabilities do not establish production correctness, liveness, gas
scalability, randomness fairness, evidence availability, or economic
deterrence.

## 2. Remaining scientific and protocol blockers

1. Owner approval is missing for the minimum correctness improvement,
   resolution non-inferiority margin, protocol-failure premium, operation
   premium, adversarial failure bound, and economic/capital-lock thresholds.
2. DAO quorum, tie/empty behavior, temporal conflict exclusions, CCPS-1
   parameters, Court 2 exhaustion, randomness, evidence availability, and
   refund/unlock semantics remain pending policy questions.
3. The runtime does not implement the full V2 Court 1 -> DAO -> Court 2
   workflow. Foundry fixtures cannot substitute for integrated contract/event/
   indexer evidence.
4. Actual gas, elapsed time, capital-lock duration, opportunity cost, evidence
   availability, and attacker profitability are not credible primary inputs.
5. The primary power calculation is a normal planning approximation. The later
   implementation must validate its paired output schema, dependence, rare
   event behavior, and bootstrap computation.
6. O1 identifies role/weight mapping effects conditional on fixed slot
   potentials; it does not identify a universal eligibility-only or Sybil
   effect.
7. Synthetic Judge quality, error correlation, signal quality, participation,
   ownership, and collusion parameters lack real-world calibration.

## 3. Required approvals before confirmatory execution

The owner must approve, version, and record:

- B0/B1/B2 terminal and liveness state semantics;
- CWQ-1 formula, cap, threshold, tie, empty electorate, and conflict rules;
- CCPS-1 collateral, D/F, reset limits, recipients, and stake-only funding;
- Court 2 exhaustion, retry, timeout, randomness, and refund/unlock behavior;
- evidence revision/availability and case-binding rules;
- numerical correctness, resolution, protocol-failure, operation, adversarial,
  latency, capital-lock, gas, and attacker-cost thresholds;
- exact primary cells, seed/stream/model versions, replication counts, and
  bootstrap/multiplicity plan.

Approval must not be inferred from a fixture test, a manifest, a green helper
test, or an exploratory SIM-01 result.

## 4. Required implementation validation

Before confirmatory execution:

1. Emit one immutable raw record per mechanism and base case with the declared
   source/model/policy/stream identities.
2. Validate common truth, case latent, Judge potential outcomes, slot
   potentials, participation uniforms, attacker capital, and initial assignment
   across B0/B1/B2.
3. Validate typed SUBSTANTIVE_VERDICT, PROTOCOL_FAIL, and STUCK outcomes.
4. Validate all rate numerators and denominators, including null denominators.
5. Validate O1 slot-keyed streams and O2 identity-keyed sensitivity separately.
6. Validate Judge-supply counts before/after every exclusion and every reset.
7. Validate conservation and no double settlement in the relevant fixture path.
8. Run the paired cluster bootstrap against deterministic fixtures, including
   zero and degenerate cells.
9. Record invalid output and infrastructure failure without silent replacement.
10. Re-run the source and reference audit if policy or fixture revisions change.

## 5. Decision framework after an approved study

### RETAIN_B0

Use when Court Reset does not provide an approved substantive-resolution
benefit, or when B1/B2 complexity exceeds the approved operational/economic
limits without compensating evidence.

### RETAIN_B1

Use when B1 materially improves procedural liveness within approved cost and
capital bounds, while B2 fails the correctness, resolution, adversarial, or
cost gates.

### RETAIN_B2_CONDITIONALLY

Use when B2 passes all approved liveness, correctness, and cost gates only in a
clearly bounded subset of R1/R2-like operating regions, and fails or is
unvalidated outside them.

### RETAIN_B2

Use only when B2 passes all approved gates across every relevant target region,
including resolution safety, adversarial conditions, resource supply, measured
cost, and capital-lock limits. A favorable conditional cell is insufficient.

### INCONCLUSIVE

Use when precision is insufficient, a denominator is undefined in a required
cell, results depend materially on uncalibrated assumptions, or a required
economic/timing gate cannot be measured. Non-significance alone is not
equivalence.

## 6. Final readiness statement

Research design: **GO**.  
Confirmatory implementation: **CONDITIONAL GO**.  
Confirmatory Monte Carlo: **NO-GO until policy and analysis decisions are
frozen and implementation validation passes**.  
Production integration: **NO-GO**.  
Scientific superiority claim: **NO-GO**.
