# FundTogether VNext Experimental Protocol

**Status:** preregistration/design document; no empirical results

**Baseline:** `origin/main` at `fb0e346e7253e4fbe8b4681c4fbf9dbdaa84e2d8`.

This protocol defines a reproducible comparison of simpler jury mechanisms against the FundTogether VNext candidate. It deliberately does not assume that more courts, BackerDAO, quadratic weighting, or CCPS-1 improve correctness.

## 1. Research question

> Does collateral-backed Court Reset combined with DAO-gated Court 2 improve adjudication correctness and recovery under failures or adversarial behavior compared with simpler jury mechanisms, at an acceptable financial cost, latency, and liveness trade-off?

The answer is a simulation result conditional on the declared finite model. It is not evidence that actual Kleros, GenLayer, or a public deployment has the same behavior. No baseline may be labeled a faithful reproduction of another protocol without a separate source-verified implementation study.

## 2. Hypotheses and falsification

| ID | Hypothesis | Falsification observation |
| --- | --- | --- |
| H1 | Bounded Court Reset improves terminal resolution probability under non-reveal compared with a single jury. | The paired confidence interval for B1 minus B0 is non-positive, or the improvement is below the preregistered minimum while cost/latency increases. |
| H2 | DAO-gated Court 2 improves final accuracy only when appeal selection is sufficiently informative. | There is no positive interaction between appeal informativeness and B2 accuracy, or B2 is worse throughout the informative range. |
| H3 | CWQ-1 wallet splitting can change an appeal outcome without increasing total contributed capital. | In fixed-capital paired cases, splitting never changes the DAO decision or the estimated flip rate is indistinguishable from zero. |
| H4 | CCPS-1 cost coverage does not imply positive net attacker cost. | Across the declared grid, every attack class has positive attacker loss after rewards, slashing, and appeal costs, with no profitable or break-even region. |
| H5 | Full VNext imposes additional cost and latency that may outweigh improvements in some scenarios. | B2 is never Pareto-dominated on the preregistered cost/latency/correctness frontier, or its cost/latency increase is not material in any stressed scenario. |

Falsification thresholds must be chosen before the confirmatory run. The recommended practice is to use a minimum correctness/liveness effect and a maximum cost/latency premium agreed by the owner, rather than selecting thresholds after seeing results.

## 3. Comparable simulation models

All models receive the same generated case, truth, Judge population, stake, attacker budget, and random seeds. Only the mechanism-specific transition rules differ.

### B0 — single three-Judge jury

1. Select three unique eligible Judges from the common population.
2. Each Judge receives one PASS/FAIL vote and a non-reveal probability.
3. All three valid reveals are required for a valid court; otherwise the case ends as `PROTOCOL_FAIL`.
4. A valid court uses two-of-three majority.
5. There is no reset, DAO, Court 2, CCPS penalty, or appeal.
6. Record the same service-reward and locked-stake accounting fields as other models, but set mechanism-specific reset/appeal flows to zero.

B0 is a deliberately simple reference, not immediate-payout crowdfunding and not a Kleros reproduction.

### B1 — single jury with bounded Court Reset and CCPS-1

1. Select a three-Judge Court 1 from the common eligible population.
2. A missing commit or reveal invalidates the court.
3. Permit one bounded replacement Court 1 with fresh, non-overlapping Judges.
4. Apply the declared CCPS-1 schedule to assigned non-revealing Judges; compensation is funded from locked Judge stake, not milestone escrow.
5. A valid replacement produces the substantive final verdict. A second invalid court produces `PROTOCOL_FAIL`.
6. There is no DAO and no Court 2.

B1 isolates liveness recovery and procedural collateral from appeal governance.

### B2 — full FundTogether VNext candidate

1. Court 1 is assigned and may use the same bounded reset rule as B1.
2. A valid Court 1 opens a contribution snapshot and two-choice BackerDAO: `ACCEPT` or `APPEAL`.
3. `ACCEPT` finalizes the Court 1 substantive result.
4. `APPEAL` selects one fresh Court 2, excluding the Court 1 assignment history and the policy-defined DAO conflicts; Court 2 may use the bounded reset rule.
5. Court 2 becomes the final substantive verdict. Exhaustion or bounded failure is `PROTOCOL_FAIL`.
6. Settlement pays only frozen creator/reviewer/refund obligations; reset compensation is an independent stake ledger.

B2 has the largest capability and the largest state/latency/cost surface. CWQ-1, the threshold, conflict policy, time windows, and reward values are scenario inputs, not approved runtime values.

### 3.1 Common semantics

- Truth is a latent case label `y ∈ {PASS, FAIL}`; no model observes it during adjudication.
- A final substantive verdict is correct iff it equals `y`.
- `PROTOCOL_FAIL` is neither a correct nor incorrect substantive verdict; it is reported separately and has no minority slash.
- A Court Reset is procedural recovery, not an appeal and not evidence that a Judge voted incorrectly.
- All three models use the same token unit, target, reward accounting, and time unit for a paired scenario. If a model lacks a mechanism, its cost is zero for that mechanism.
- Gas is not invented from abstract operation counts. It is measured from versioned Foundry fixtures and reported separately from simulated economic outcomes.

## 4. Data-generating process

### 4.1 Case and evidence distribution

Each trial creates one synthetic case with:

```text
case_id, milestone_id, truth_y, target, evidence_class,
judge_population, stake_state, attacker_budget, seed_bundle
```

Use a balanced truth distribution for the primary run (`PASS` and `FAIL` equally frequent) and a declared imbalanced sensitivity run. Evidence classes may model clear, borderline, and adversarially misleading evidence, but the class-to-truth mapping must be fixed in the configuration and must not be tuned after results.

The simulation does not claim that the synthetic evidence distribution represents comics, artbooks, real creators, or real Judges.

### 4.2 Judge quality and correlated errors

For each Judge, generate a latent correctness propensity. A convenient declared model is:

```text
U_j ~ Beta(alpha, beta)
Correct_j ~ Bernoulli(U_j)
alpha = a * (1/rho - 1)
beta  = (1-a) * (1/rho - 1)
```

where `a` is the population mean accuracy and `rho` controls positive correlation. At `rho = 0`, use independent Bernoulli draws with probability `a` as a special case. A common-shock alternative may be included only as a predeclared sensitivity model. Judge accuracy and correlation are assumptions of the simulation, not empirical estimates.

### 4.3 Non-reveal, collusion, and selection

- Each assigned Judge independently fails to reveal with probability `p_nonreveal`, unless a collusion scenario specifies coordinated behavior.
- A colluding Judge votes for the attacker target; a non-colluding Judge follows the generated quality process.
- The attacker controls a fixed total stake budget and may split it over `k` wallets. Total capital is held constant when measuring wallet-splitting effects.
- Candidate selection uses the same case-level seed bundle across baselines. B2 consumes additional unique seats for Court 2 and therefore can exhaust a common pool even when B0 would resolve.
- Selection order is not treated as fair merely because it is deterministic. Measure selection probability, seat concentration, and attacker advantage.

## 5. Parameter matrix

The following values are an experimental grid, not claims about real-world frequencies. A smaller pilot may use the center of each range; the confirmatory configuration must record the exact levels.

| Factor | Primary levels | Meaning |
| --- | --- | --- |
| Mean independent Judge accuracy `a` | 0.55, 0.65, 0.75, 0.85, 0.95 | Synthetic quality assumption |
| Error correlation `rho` | 0, 0.10, 0.30, 0.60 | Shared-quality/error dependence |
| Non-reveal probability | 0, 0.01, 0.05, 0.20 | Synthetic liveness assumption |
| Eligible pool size | 3, 6, 12, 30, 100 | Candidates before conflicts and stake filters |
| Stake/collateral availability | 1×, 2×, 5× required lock | Available collateral relative to case requirement |
| Colluding Judge fraction | 0, 1/3, 1/2, 2/3 | Population share that follows attacker target |
| Attacker-controlled wallets | 1, 2, 4, 8, 16 | Wallet splitting at fixed total stake |
| Total attacker stake | 10%, 25%, 50% of eligible stake | Capital concentration factor |
| DAO participation | 0.10, 0.20, 0.50, 0.80, 1.00 | Fraction of effective eligible weight that casts a ballot |
| Wallet contribution split | 1, 2, 4, 8, 16 wallets | CWQ-1 split experiment at constant contribution |
| DAO detection quality | 0, 0.25, 0.50, 0.90, 1.00 | Sensitivity for an optional imperfect conflict/detection abstraction; baseline V2 should use the exact declared rule |
| Court 2 informativeness | 0.55, 0.65, 0.75, 0.85, 0.95 | Probability that an eligible Court 2 vote follows truth under the specified selection signal |
| Appeal propensity | 0, 0.10, 0.25, 0.50, 0.75, 1.00 | Fraction of eligible scenarios in which an appeal request is attempted before DAO gating |
| Reset frequency | derived and reported | Number of invalid courts, not an independently tuned outcome |
| Target and reserve | fixed base fixture plus sensitivity | Monetary scale for normalized cost; use local policy vectors only as arithmetic fixtures |
| Time windows | fixed scenario configuration | Assignment, commit, reveal, DAO, and Court 2 timeout durations |

The candidate local values `D=10`, `F=3`, `resetCostMax=23`, reward rate `100` bps, and DAO threshold `2,000` bps may be included as a named `pr0_candidate` scenario. They must not be called calibrated or production values.

## 6. Metrics

Report the full distribution and a paired uncertainty interval, not only a mean.

### 6.1 Correctness

```text
final_substantive_accuracy = correct substantive rulings / substantive rulings
false_pass_rate            = false PASS / all trials
false_fail_rate            = false FAIL / all trials
error_correction_rate      = incorrect Court 1 rulings corrected by B2 Court 2 / incorrect Court 1 rulings appealed
harmful_reversal_rate      = correct Court 1 rulings changed to incorrect final rulings / correct Court 1 rulings appealed
```

Also report substantive-resolution coverage, so a model cannot improve accuracy by producing more `PROTOCOL_FAIL` cases.

### 6.2 Liveness

```text
terminal_resolution_prob = terminal outcomes / trials
protocol_fail_prob       = PROTOCOL_FAIL / trials
stuck_prob               = trials with no terminal transition by max horizon / trials
time_to_terminal         = simulated time from case-ready to terminal state
```

Use medians, p90/p95, and survival curves for time-to-terminal. Define the maximum horizon before running the experiment.

### 6.3 Economics and custody

- Judge service reward claimed and unclaimed;
- CCPS slashing, compensation paid, and compensation unclaimed;
- creator payout and Backer refund;
- attacker gross gain, slash loss, reward income, appeal cost, and net gain/loss;
- capital locked and maximum concurrent lock;
- reserve utilization and unused reserve;
- escrow immobilization duration;
- gas per transition from independently measured fixture runs.

Normalize monetary metrics by milestone target and report absolute base units separately. Do not mix reset stake transfers into milestone contribution conservation.

### 6.4 Adversarial metrics

- Sybil-induced appeal flip rate at constant total contribution;
- probability of a colluding majority in Court 1 and Court 2;
- strategic non-reveal profitability versus honest reveal;
- selection manipulation advantage relative to uniform eligible selection;
- probability that conflict exclusions exhaust Court 2;
- minimum attacker capital that changes a final outcome under each seed/scenario.

## 7. Statistical methodology

### 7.1 Paired Monte Carlo and common random numbers

Create one immutable scenario record per seed. Derive all B0/B1/B2 outcomes from the same:

```text
scenario_seed → truth, evidence, Judge qualities, stake, collusion, contribution split
mechanism_seed → selection, ballot participation, non-reveal, timeout ordering
```

Use common random numbers so a baseline difference is measured on the same hard/easy case rather than on independent case draws. Store the seed bundle with every result.

### 7.2 Pilot-based replication sizing

Run a pilot for each primary scenario family and estimate the paired standard deviation `s_diff` for continuous outcomes and paired event variance for binary outcomes. Choose the confirmatory number of replications from the desired half-width `h`:

```text
N_continuous ≈ (z_(1-alpha/2) × s_diff / h)^2
```

For paired binary outcomes, use a paired risk-difference variance or a cluster bootstrap to solve for the same target half-width. Increase `N` for rare events until the upper confidence bound is informative; do not use a conventional sample size as the sole justification. Record the pilot, sizing formula, stopping rule, and any maximum replication cap.

### 7.3 Intervals, tests, and effect sizes

- Paired risk differences: exact/score interval or stratified bootstrap by scenario seed; McNemar's test is a secondary paired test.
- Continuous paired cost/latency: median and quantile bootstrap; mean difference with a paired interval where appropriate.
- Heavy-tailed attacker gains: report median, p90/p99, probability of positive net gain, and a bootstrap interval.
- Effect sizes: risk difference, relative risk with care for zero cells, paired mean/median difference, and Cliff's delta for distributions.
- Use two-sided intervals for exploratory comparisons and a preregistered one-sided direction only for confirmatory hypotheses.
- If many cells are compared, control false discovery with Holm or report the family of comparisons explicitly.

### 7.4 Sensitivity and model checks

Use a fractional factorial or Latin-hypercube design for broad screening, then fully cross the factors that interact with a hypothesis: `rho × accuracy`, `non-reveal × reset`, `CWQ-1 split × threshold`, `Court 2 informativeness × appeal rate`, and `pool size × conflict exclusion`. Include metamorphic checks:

- permuting Judge addresses must not change an unbiased-selection result except for the declared deterministic tie/dust rule;
- splitting a contribution must leave total capital unchanged;
- increasing a non-reveal probability must not improve liveness in expectation without a mechanism reason;
- removing an eligible Judge cannot increase the eligible pool;
- disabling Court 2 makes B2's ACCEPT path match the B1 substantive Court 1 path;
- all successful claims preserve conservation and idempotency.

## 8. Reproducibility and raw-result schema

### 8.1 Configuration

Version these files together:

```text
model_version
policy_version
parameter_registry_version
baseline_definitions_version
randomness_algorithm
seed_master
truth_distribution
judge_quality_model
selection_model
timeout_model
gas_measurement_commit
```

The simulation must fail on an unknown policy/model version rather than silently using defaults.

### 8.2 JSONL result record

```json
{
  "run_id": "...",
  "scenario_seed": 0,
  "mechanism_seed": 0,
  "model": "B0|B1|B2",
  "model_version": "...",
  "policy_version": "...",
  "truth": "PASS|FAIL",
  "case_class": "...",
  "judge_pool_size": 12,
  "judge_accuracy": 0.75,
  "error_correlation": 0.30,
  "nonreveal_probability": 0.05,
  "colluding_fraction": 0.25,
  "attacker_wallets": 4,
  "attacker_total_stake": 0.25,
  "dao_participation": 0.50,
  "court2_informativeness": 0.75,
  "final_state": "FINAL_PASS|VERDICT_FAIL|PROTOCOL_FAIL|STUCK",
  "court1_verdict": "PASS|FAIL|NONE",
  "final_verdict": "PASS|FAIL|NONE",
  "court1_correct": null,
  "final_correct": null,
  "appealed": false,
  "resets": 0,
  "time_to_terminal": 0,
  "creator_paid": 0,
  "judge_paid": 0,
  "reset_slashed": 0,
  "backer_refunded": 0,
  "capital_locked_peak": 0,
  "attacker_net_gain": 0,
  "gas_by_transition": {},
  "invariant_violations": []
}
```

Raw JSONL is immutable input to summary tables. Publish the configuration, source commit, seed list, raw results, analysis script version, and generated figures together. Never publish only a chart or average.

## 9. Decision rule for abandoning B2

B2 should be abandoned in favor of B0 or B1 for a declared operating region if all of the following hold:

1. B2 does not produce a pre-registered minimum improvement in final substantive accuracy or terminal liveness, with its paired interval excluding the required direction;
2. B2 has a materially higher p95 time-to-terminal, capital lock, or gas cost;
3. B2 has equal or higher harmful reversal, Sybil-induced appeal flip, or Court 2 exhaustion;
4. the result remains after sensitivity analysis over Judge correlation, non-reveal, pool size, and appeal informativeness; and
5. B0 or B1 is on the Pareto frontier for the declared priorities.

If B2 is better only when Court 2 informativeness is high and participation/conflict conditions are favorable, report B2 as a conditional mechanism, not a general improvement. If B1 captures the liveness benefit at lower cost, prefer B1 for the next research implementation.

## 10. Limitations

- Synthetic Judge quality, correlation, collusion, non-reveal, participation, and cost values are assumptions unless an external primary source is added and its mapping is validated.
- The models do not prove human identity, real evidence truth, legal enforceability, public-chain gas behavior, or real reviewer supply.
- Uniform or deterministic selection is not a faithful reproduction of Kleros or GenLayer.
- Court Reset and CCPS-1 measure the declared policy schedule, not actual lost work or gas costs.
- A correct final verdict after a `PROTOCOL_FAIL` is not observed; correctness and liveness must remain separate metrics.
- Simulation cannot establish that the smart contract implementation is safe. Contract safety still requires unit, fuzz, invariant, event, transfer-failure, and reentrancy tests against the versioned deployment.

## 11. Minimum publishable research contribution

The minimum defensible contribution is a paired, seed-reproducible comparison showing where B1 or B2 changes terminal resolution, correctness, attacker economics, and escrow latency relative to B0, with explicit counterexamples for wallet splitting and correlated errors. The contribution is an instance-level evaluation of the declared mechanisms and assumptions. It is not a general proof of decentralization, security, Sybil resistance, or superiority.

## 12. Repository alignment and evidence boundary

The mechanism definitions align with the V2 policy/specification candidate and the PR1–PR4 fixture boundaries:

- `docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md` defines the three-Judge court, commit–reveal, separate `PROTOCOL_FAIL`, custody invariants, and known Sybil/collusion/liveness limitations.
- `docs/protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V2.md` defines the proposed sequential milestone, BackerDAO, Court Reset, Court 2, and financial gap analysis.
- `docs/protocol/parameters-v2-policy.md` supplies named candidate vectors such as Q1–Q10 and R1–R10. Their numeric values are fixture inputs, not empirical estimates.
- `contracts/test/fixtures/V2CourtResetFixture.sol` and `V2BackerDaoCourt2Fixture.sol` explicitly use deterministic test entropy and do not establish production randomness or Sybil resistance.
- `contracts/test/invariant/V2FinancialAccountingInvariant.t.sol` and the related V2 invariant suites are implementation evidence for isolated fixture properties. They are not simulation results and were not executed as part of this design document.
