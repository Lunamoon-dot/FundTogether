# FundTogether VNext Experimental Protocol

**Status:** preregistration/design document; no simulation, calibration, or empirical results

**Original publication baseline:** `origin/main@fb0e346e7253e4fbe8b4681c4fbf9dbdaa84e2d8`

**PR #21 publication head:** `6cf97a17fb4ed1eec83eb7bf99cc29f515fc2a33`

This protocol defines a reproducible comparison of simpler jury mechanisms against the FundTogether VNext candidate. It deliberately does not assume that Court Reset, BackerDAO, Court 2, quadratic weighting, or CCPS-1 improves correctness, liveness, or attacker resistance.

## 1. Research question

> Under a declared finite synthetic model, does collateral-backed Court Reset combined with DAO-gated Court 2 improve substantive adjudication correctness and recovery from procedural failure compared with simpler jury mechanisms, at an acceptable financial cost, latency, and capital-lock premium?

The answer is conditional on the declared model. It is not evidence that actual people, Kleros, GenLayer, or a public deployment behave the same way. No baseline may be labeled a faithful reproduction of another protocol without a separate source-verified implementation study.

## 2. Hypotheses, deterministic counterexamples, and falsification

| ID | Claim or research question | Result interpretation |
| --- | --- | --- |
| H1 | Bounded Court Reset increases `substantive_resolution_rate` under non-reveal relative to B0. | Quantitatively unsupported if the preregistered lower confidence bound for B1 minus B0 does not exceed the owner-approved minimum effect, or if the effect is purchased outside approved cost/latency premiums. `PROTOCOL_FAIL` does not count as substantive resolution. |
| H2 | DAO-gated Court 2 improves all-trial correct substantive outcomes only when the generated appeal process is sufficiently informative. | Quantitatively unsupported where the B2-minus-B1 lower confidence bound does not exceed the owner-approved minimum effect, or where gains depend on a privileged Court 2 information channel excluded from the primary model. |
| H3a | The deterministic CWQ-1 vectors Q6/Q10 reproduce the known fixed-capital wallet-splitting counterexample. | Failure to reproduce is a model/implementation defect. Observing the counterexample is not evidence about its real-world frequency. |
| H3b | Under declared contribution distributions and attacker budgets, wallet splitting has a measurable frequency and severity of DAO outcome flips. | Falsified or unsupported only by the preregistered quantitative estimand and interval rule, not by failure to encounter a known counterexample in a finite sample. |
| H4a | CCPS-1 can fully fund its closed compensation schedule while still allowing a same-actor finalizer to recapture the finalization allowance, so cost coverage alone is not deterrence. | Failure to reproduce the deterministic cost/recipient arithmetic is a model/implementation defect. It does not authorize a policy change. |
| H4b | Under declared control, gas, reward, timing, and finalizer assumptions, at least one attack region is profitable or below the owner-approved minimum deterrence cost. | Quantitatively unsupported if the preregistered upper bound on attacker profitability and lower bound on attacker cost both satisfy the owner-approved deterrence criterion across the declared region. |
| H5 | B2's additional state, Court 2, and DAO impose cost, latency, or capital-lock premiums that can outweigh correctness or substantive-liveness gains. | Unsupported only if B2 remains on the preregistered Pareto frontier throughout the declared region and satisfies every approved premium bound. |

H3a and H4a are deterministic validation cases. H1, H2, H3b, H4b, and H5 are stochastic research hypotheses. Confirmatory falsification thresholds must be frozen before confirmatory results are inspected.

## 3. Comparable simulation models

### 3.1 Primary fairness rule

B0, B1, and B2 share, for every paired replication:

- the same latent truth, case difficulty, evidence class, and time origin;
- the same available Judge identities, stable attributes, stake/capital constraints, attacker control, and collusion assignments;
- the same potential Judge-by-case votes and non-reveal outcomes under equivalent conditions;
- the same contribution ownership, total contribution capital, and eligible Backer population before mechanism-specific exclusions;
- the same token unit, economic price assumptions, and outcome-generation process; and
- identity-keyed random streams that are not shifted by extra B1/B2 transitions.

A mechanism-specific difference must be named, versioned, and reported. B2 receives no intrinsically better Judges, evidence, or ground-truth access in the primary comparison. Any Court 2 information advantage is a separately preregistered sensitivity experiment and is never pooled with the primary result.

### 3.2 B0 — single three-Judge jury

1. Select three unique eligible Judges from the common population.
2. Read each selected Judge's common potential vote and non-reveal outcome.
3. All three valid reveals are required; otherwise the case ends as `PROTOCOL_FAIL`.
4. A valid court uses two-of-three majority and produces `FINAL_PASS` or `VERDICT_FAIL`.
5. There is no reset, DAO, Court 2, CCPS penalty, or appeal.
6. Record the common accounting fields; mechanism-specific reset/appeal values are zero.

B0 is a simple reference, not immediate-payout crowdfunding and not a Kleros reproduction.

### 3.3 B1 — single jury with bounded Court Reset and CCPS-1

1. Use the same Court 1 assignment and potential outcomes as B0.
2. A missing commit or reveal invalidates the court.
3. Permit one bounded replacement Court 1 with fresh, non-overlapping Judges.
4. Apply the declared CCPS-1 fixture schedule to assigned procedural offenders; compensation uses locked Judge stake, not milestone escrow.
5. A valid original or replacement Court 1 produces the substantive final verdict. A second invalid attempt produces `PROTOCOL_FAIL`.
6. There is no DAO and no Court 2.

B1 isolates procedural recovery and collateral from appeal governance.

### 3.4 B2 — full FundTogether VNext candidate

1. Court 1 uses the same model and bounded reset rule as B1.
2. A valid Court 1 opens a frozen contribution snapshot and two-choice BackerDAO: `ACCEPT` or `APPEAL`.
3. Generated Backer signals, participation, conflicts, strategic behavior, and CWQ-1 weights produce actual ballots.
4. DAO `ACCEPT` finalizes Court 1. DAO `APPEAL` selects fresh Court 2 Judges, excluding the complete Court 1 assignment history and policy-defined DAO conflicts.
5. Court 2 uses the same primary Judge-quality model and the same evidence/case latent variables as Court 1; it may use one bounded reset.
6. A valid Court 2 replaces Court 1 as the final substantive verdict. Assignment exhaustion or bounded procedural failure is `PROTOCOL_FAIL`.
7. Settlement pays only frozen creator, Judge-service, and refund obligations. CCPS-1 compensation remains a separate stake ledger.

CWQ-1, participation threshold, conflicts, time windows, rewards, and CCPS-1 values are scenario inputs reflecting approved or explicitly pending candidate policy. Their use in a simulation does not approve them for runtime.

### 3.5 Common outcome semantics

- Latent truth is `Y_c ∈ {PASS, FAIL}`. Mechanism actors never observe it directly.
- `FINAL_PASS` and `VERDICT_FAIL` are substantive terminal outcomes. Either can be correct or incorrect relative to `Y_c`.
- `PROTOCOL_FAIL` is a procedural terminal outcome, not a substantive verdict and not evidence of Creator fault.
- `STUCK` means no terminal transition by the preregistered maximum horizon.
- Court Reset is procedural recovery, not an appeal and not evidence that a vote was factually wrong.
- Gas comes only from separately versioned fixture measurements. It is not inferred from abstract operation counts.

## 4. Data-generating process

### 4.1 Case and evidence distribution

Each replication creates one immutable scenario:

```text
replication_id, case_id, milestone_id, truth_y, case_latent,
evidence_class, judge_population, stake_state, contribution_snapshot,
attacker_budget, policy_parameters, random_stream_version
```

The primary run uses a balanced truth distribution. Imbalanced truth prevalence is a declared sensitivity analysis. Evidence classes may represent clear, borderline, and adversarially misleading cases, but their probabilities and mappings are frozen before confirmatory execution.

These distributions are synthetic assumptions, not calibrated descriptions of comics, artbooks, creators, Backers, or Judges.

### 4.2 Four distinct sources of dependence

The model must not use one symbol to represent different phenomena:

1. **Between-Judge heterogeneity:** stable differences in a Judge's propensity to be correct across cases.
2. **Shared case difficulty:** a case-level latent variable that makes the same evidence easy or difficult for all non-colluding Judges.
3. **Within-case correlated error:** dependence between different Judges' correctness outcomes on the same case.
4. **Court 1-to-Court 2 dependence:** correlation that remains because both courts see the same case/evidence even when wallets are fresh.

### 4.3 Primary shared-case Beta-Bernoulli model

For configured marginal correctness `a`, with `0 < a < 1`, and positive within-case intraclass correlation `0 < rho < 1`:

```text
P_c ~ Beta(alpha, beta)
C_cj | P_c ~ Bernoulli(P_c)

alpha = a * (1/rho - 1)
beta  = (1-a) * (1/rho - 1)
```

`P_c` is shared case difficulty expressed as the conditional probability that a non-colluding Judge is correct. Conditional Judge draws are independent given `P_c`; marginally they are positively correlated.

The analytical checks are:

```text
E[C_cj] = E[P_c] = a

Var(C_cj) = a(1-a)

Cov(C_cj, C_ck)
  = Var(P_c)
  = alpha*beta / ((alpha+beta)^2 * (alpha+beta+1))
  = rho * a(1-a)

Corr(C_cj, C_ck) = rho,  j != k
```

For `rho = 0`, do not evaluate the Beta parameters at an infinite concentration. Define the boundary explicitly:

```text
C_cj ~ Bernoulli(a), independently across Judges for the case.
```

`rho < 0`, `rho >= 1`, `a <= 0`, and `a >= 1` are unsupported by this primary parameterization and must fail validation rather than silently clamp. Degenerate accuracy boundaries, if ever needed, require a separately versioned deterministic model.

Court 1 and Court 2 potential correctness draws condition on the same `P_c`. Fresh Judge wallets remove identity overlap, not shared evidence difficulty. Therefore non-colluding cross-court Judge outcomes have the same marginal dependence induced by `P_c`. Court-specific evidence or information shocks are excluded from the primary comparison.

### 4.4 Optional Judge-heterogeneity sensitivity model

The primary model identifies shared-case correlation but does not also estimate stable Judge heterogeneity. A separate sensitivity model may include both:

```text
u_j ~ Normal(0, sigma_j^2)        # stable Judge effect
d_c ~ Normal(0, sigma_c^2)        # shared case effect
logit(p_cj) = mu + u_j + d_c
C_cj ~ Bernoulli(p_cj)
```

`mu`, `sigma_j`, and `sigma_c` must be numerically calibrated to declared marginal correctness and dependence targets, then validated by simulation. The Beta-Bernoulli closed-form `rho` formula does not apply to this logistic model. Results from this sensitivity model are labeled separately and are not pooled with the primary model.

### 4.5 Votes, non-reveal, collusion, and attacker control

For a non-colluding Judge, `C_cj` determines whether the potential vote equals `Y_c`; an incorrect vote is the opposite binary label. A colluding Judge instead follows the configured attacker target. Collusion membership, strategic non-reveal, and ordinary non-reveal use distinct keyed streams so their dependencies are explicit.

Ordinary non-reveal is Bernoulli with configured marginal probability `p_nonreveal`. A coordinated non-reveal scenario may share an attacker or group latent variable, but it must not be mislabeled independent. Total attacker stake/capital remains fixed when wallet count changes.

### 4.6 Backer private signals and DAO ballot generation

Let `V1_c` be the valid Court 1 verdict and `I_c = 1[V1_c != Y_c]`. Truth is available only to the simulator's data-generating oracle. A Backer never reads `Y_c` or `I_c`.

For each eligible Backer `i`, generate a private binary appeal signal `S_ci`:

```text
P(S_ci = APPEAL_SIGNAL | I_c = 1) = signal_sensitivity
P(S_ci = APPEAL_SIGNAL | I_c = 0) = signal_false_alarm
```

This is an imperfect signal model, not direct truth access. Dependence among Backer signals, if tested, requires an explicit shared signal shock. In the primary model, Court 1 and Court 2 do not receive these Backer signals.

Generate eligibility and behavior in this order:

1. Freeze contribution ownership and amounts.
2. Apply Court 1 and policy-defined conflict exclusions.
3. Generate Backer participation `Z_ci` from the declared participation model. Strategic abstention may depend on private signal, attacker control, expected influence, and cost, but not latent truth.
4. A participating honest Backer casts `APPEAL` for `APPEAL_SIGNAL`, otherwise `ACCEPT`.
5. Attacker-controlled or colluding Backers follow their declared strategy. Contribution splitting changes wallet identities and CWQ-1 weights while total controlled contribution remains fixed.
6. Apply `w_i = floor_sqrt(contribution_i)` to the frozen eligible snapshot, then the pending CWQ-1 participation, tie, and decision rules exactly.

An **attempted appeal** means an eligible actor generated an `APPEAL` preference or cast an `APPEAL` ballot, as separately reported. `DAO_APPEAL` means the finalized weighted DAO decision after eligibility, participation, threshold, and tie rules. Only `DAO_APPEAL` opens Court 2.

For the full ballot simulation, report these as outputs:

```text
alpha_appeal = P(DAO_APPEAL | Court 1 incorrect)
beta_appeal  = P(DAO_APPEAL | Court 1 correct)
```

A simplified analytical model may instead take `alpha_appeal` and `beta_appeal` as direct inputs, but it must use a separate model identifier and result table. Direct-input analytical results must never be pooled with full generated-ballot results.

## 5. Parameter matrix

All levels are synthetic experimental inputs. None is empirically calibrated unless a future source and calibration procedure are published.

| Factor | Candidate screening levels | Interpretation |
| --- | --- | --- |
| Marginal Judge correctness `a` | 0.55, 0.65, 0.75, 0.85, 0.95 | Primary Beta-Bernoulli marginal |
| Within-case correlation `rho` | 0, 0.10, 0.30, 0.60 | Shared-case intraclass correlation |
| Ordinary non-reveal probability | 0, 0.01, 0.05, 0.20 | Marginal procedural failure input |
| Eligible Judge pool | 3, 6, 12, 30, 100 | Before conflicts/stake filters |
| Stake availability | 1x, 2x, 5x required lock | Capital constraint |
| Colluding Judge fraction | 0, 1/3, 1/2, 2/3 | Population share following attacker target |
| Attacker wallets | 1, 2, 4, 8, 16 | Fixed-total-stake split |
| Backer signal sensitivity | 0.50, 0.65, 0.80, 0.95 | `P(APPEAL_SIGNAL | Court 1 incorrect)` |
| Backer signal false-alarm rate | 0.05, 0.20, 0.35, 0.50 | `P(APPEAL_SIGNAL | Court 1 correct)` |
| DAO participation | 0.10, 0.20, 0.50, 0.80, 1.00 | Generated per eligible wallet/weight as specified |
| Wallet contribution split | 1, 2, 4, 8, 16 wallets | Fixed controlled contribution |
| Strategic abstention/collusion | declared strategy grid | Signal- and control-dependent behavior |
| Target/reserve/CCPS values | fixture vector plus sensitivity | Arithmetic inputs, not approved prices |
| Time windows | frozen scenario configuration | Assignment, commit, reveal, DAO, Court 2 |

The candidate local values `D=10`, `F=3`, `resetCostMax=23`, reward rate `100` bps, and DAO threshold `2,000` bps may appear only in a named `pr0_candidate_pending` scenario. They are `PROPOSED_PENDING_APPROVAL`, not calibrated or production values.

An extra `court2_information_advantage` factor is allowed only in a separately preregistered sensitivity model. It must state the information source and cannot change primary B2 results.

## 6. Outcomes and metrics

Let `N` be all initiated trials in the reporting cell, and let:

```text
N_substantive = count(FINAL_PASS or VERDICT_FAIL)
N_terminal    = count(FINAL_PASS or VERDICT_FAIL or PROTOCOL_FAIL)
N_correct     = count(correct FINAL_PASS or correct VERDICT_FAIL)
```

### 6.1 Resolution and liveness

```text
substantive_resolution_rate = N_substantive / N
terminal_completion_rate    = N_terminal / N
protocol_failure_rate       = count(PROTOCOL_FAIL) / N
stuck_rate                  = count(STUCK) / N
```

`PROTOCOL_FAIL` improves terminal completion but never substantive resolution.

`time_to_substantive_resolution` is measured from case-ready until `FINAL_PASS` or `VERDICT_FAIL`. `PROTOCOL_FAIL` and `STUCK` are not assigned a fictitious substantive time: use right-censoring at their terminal time or the maximum horizon and report cumulative incidence with `PROTOCOL_FAIL` as a competing event.

`time_to_terminal_state` is measured until any terminal outcome; `STUCK` is right-censored at the preregistered horizon. Report medians only where identifiable, p90/p95 or restricted mean time, survival/cumulative-incidence curves, and paired scenario contrasts.

### 6.2 Correctness without selective-resolution bias

```text
conditional_substantive_accuracy = N_correct / N_substantive
all_trial_correct_substantive    = N_correct / N
false_pass_rate                  = count(FINAL_PASS when Y=FAIL) / N
false_fail_rate                  = count(VERDICT_FAIL when Y=PASS) / N
resolution_coverage              = N_substantive / N
```

If `N_substantive = 0`, conditional accuracy is undefined, not zero or one. Always report conditional accuracy beside all-trial correctness and coverage so refusing difficult cases cannot appear more accurate.

Also report:

```text
error_correction_rate = incorrect Court 1 outcomes corrected by Court 2
                        / incorrect Court 1 outcomes receiving DAO_APPEAL

harmful_reversal_rate = correct Court 1 outcomes changed to incorrect by Court 2
                        / correct Court 1 outcomes receiving DAO_APPEAL
```

### 6.3 DAO and adversarial metrics

- `alpha_appeal`, `beta_appeal`, attempted-appeal rate, ballot appeal rate, and finalized DAO-APPEAL rate;
- Sybil-induced decision-flip rate and weight amplification at fixed controlled contribution;
- colluding-majority probability in each court and across the final outcome;
- strategic non-reveal profitability and same-actor finalizer recapture;
- conflict-induced Court 2 exhaustion and selection concentration;
- minimum attacker capital changing the final outcome under each paired scenario.

### 6.4 Economics and custody

- Judge service reward claimed/unclaimed;
- CCPS-1 slash and compensation paid/unclaimed, separately from milestone funds;
- creator payout, Backer refund, unused reserve, and escrow immobilization time;
- attacker gross gain, slash loss, reward income, finalizer receipt, appeal cost, gas assumption, and net gain;
- peak and duration of locked capital; and
- versioned fixture gas measurements reported separately from synthetic economics.

Normalize monetary metrics by target and retain exact integer base units.

## 7. Identity-keyed random streams and paired design

### 7.1 Counter-based stream definition

Every random variate is generated from a deterministic counter-based or cryptographic-hash mapping:

```text
R(master_seed, replication_id, domain, entity_ids, draw_index) -> uniform bits
```

Domain separation is mandatory. At minimum use:

```text
case.truth
case.shared_difficulty
judge.stable_quality
judge_case.potential_vote
judge_case.nonreveal
judge.control
judge.collusion
selection.candidate
selection.round_seat
dao.private_signal
dao.participation
dao.strategy
timing.event
```

Keys include stable case, Judge, Backer, court level, attempt, and seat identities as applicable. The same Judge-case pair in different baselines receives the same potential behavior under equivalent conditions. Extra reset or Court 2 draws use new domain/entity keys and cannot shift B0/B1 randomness.

The shared `P_c` (or the declared alternative shared latent) preserves dependence among Judge potential outcomes. Keyed streams prevent accidental draw-order dependence; they do not make outcomes independent when the generative graph intentionally shares a latent variable.

### 7.2 Replication and clustering

- One `replication_id` defines the paired B0/B1/B2 scenario.
- Replications are independent clusters under distinct replication keys.
- All mechanism contrasts are computed within replication before aggregation.
- Multiple policy cells from the same case seed are treated as clustered or are given independent preregistered replication blocks.
- The seed manifest and stream algorithm/version are immutable inputs to analysis.

## 8. Statistical preregistration

### 8.1 Exploratory versus confirmatory phases

The pilot/screening phase validates code, estimates variance, finds model defects, and narrows factor regions. It cannot provide confirmatory p-values or owner acceptance. Confirmatory seeds, hypotheses, primary cells, estimands, thresholds, multiplicity family, sample size, stopping rule, and replication cap must be frozen before confirmatory results are opened.

### 8.2 Primary comparisons

1. **H1:** B1 minus B0 on `substantive_resolution_rate` in preregistered non-reveal cells.
2. **H2:** B2 minus B1 on `all_trial_correct_substantive`, with `conditional_substantive_accuracy` and coverage as co-reported diagnostics.
3. **H3b:** split versus unsplit contribution on finalized DAO decision flips and weight amplification at fixed capital.
4. **H4b:** attacker strategy versus honest/control strategy on net gain and probability of non-positive deterrence cost.
5. **H5:** B2 minus the best simpler baseline on p95/restricted-mean latency, total cost, and peak capital lock.

Scenario-level results and aggregate summaries are both mandatory. Aggregation weights must be frozen; negative cells cannot be dropped or hidden by a favorable average.

### 8.3 Pending preregistration decisions

No value in this table is owner-approved merely because it appears here.

| Decision | Proposed candidate | Status / gate |
| --- | --- | --- |
| Minimum H1 substantive-liveness effect | Risk-difference margin `delta_SR > 0`, selected from pilot precision and product relevance | `PENDING_OWNER_APPROVAL`; blocks confirmatory H1 |
| Minimum H2 all-trial correctness effect | Risk-difference margin `delta_CORRECT > 0`; no compensation by lower coverage | `PENDING_OWNER_APPROVAL`; blocks confirmatory H2 |
| Maximum cost premium | Normalized B2-minus-comparator limit `kappa_cost` | `PENDING_OWNER_APPROVAL` |
| Maximum latency premium | p95 or restricted-mean limit `kappa_latency` | `PENDING_OWNER_APPROVAL` |
| Maximum capital-lock premium | Peak/duration limit `kappa_lock` | `PENDING_OWNER_APPROVAL` |
| Deterrence criterion | Minimum attacker loss `delta_attack` and maximum allowed `P(net gain >= 0)` | `PENDING_OWNER_APPROVAL` |
| Confidence level | Candidate 95% intervals | `PENDING_OWNER_APPROVAL` |
| Multiplicity | Candidate Holm control across the named primary family; exploratory intervals labeled unadjusted | `PENDING_OWNER_APPROVAL` |
| Pilot precision | Target half-width `h_pilot` for paired primary effects | `PENDING_OWNER_APPROVAL` |
| Confirmatory sizing | Pilot-based paired variance with frozen `N` before confirmatory unblinding | `PENDING_OWNER_APPROVAL` |
| Rare-event rule | Exact/binomial or cluster-bootstrap bound target `u_rare`; report zero events as an interval, never zero risk | `PENDING_OWNER_APPROVAL` |
| Replication cap and stopping | Fixed `N_max`; stop only for preregistered precision/futility rules independent of favorable effect direction | `PENDING_OWNER_APPROVAL` |
| Retain B2 | H2 minimum met, coverage not worse beyond margin, and all cost/latency/lock/adversarial bounds met | `PENDING_OWNER_APPROVAL` |
| Prefer B0/B1 | B2 misses H2 or violates any frozen premium/risk bound; choose Pareto-optimal simpler baseline by frozen priority | `PENDING_OWNER_APPROVAL` |

Full confirmatory Monte Carlo is **NO-GO** until this table and the exact scenario/aggregation plan are frozen. Pilot model validation may proceed without treating candidate thresholds as acceptance decisions.

### 8.4 Sample size, intervals, and rare events

For continuous paired differences, estimate pilot standard deviation `s_diff` and solve for the frozen half-width `h`:

```text
N ~= (z_(1-alpha/2) * s_diff / h)^2
```

For paired binary outcomes, use the discordant-pair variance or cluster bootstrap. Use paired risk differences as primary effects; McNemar's test may be secondary. For time outcomes, use paired restricted-mean or quantile contrasts with censoring-aware bootstrap. For heavy-tailed attacker gains, report median, p90/p99, `P(net gain >= 0)`, and intervals.

Rare events require a frozen upper-bound precision target and cap. Zero observed events must be reported with an exact or simulation-valid upper confidence bound. Reaching `N_max` without required precision yields **inconclusive**, not acceptance.

### 8.5 Model-validation checklist

Before any inferential run:

- [ ] observed marginal Judge correctness is within the preregistered Monte Carlo tolerance of configured `a`;
- [ ] observed within-case pairwise correlation is within tolerance of configured `rho` for `rho > 0`;
- [ ] `rho = 0` produces independent Bernoulli outcomes within sampling error;
- [ ] marginal non-reveal frequency matches `p_nonreveal` and coordinated scenarios show only declared dependence;
- [ ] no negative or unsupported correlation is produced by the primary model;
- [ ] `a`/`rho` boundary inputs fail or follow the explicit special case;
- [ ] Court 1-to-Court 2 dependence remains under fresh identities because `P_c` is shared;
- [ ] Court 2 has the same primary marginal quality as Court 1;
- [ ] generated DAO ballots reproduce configured signal, participation, exclusion, and strategy probabilities;
- [ ] measured `alpha_appeal` and `beta_appeal` are outputs in the full ballot model;
- [ ] keyed-stream replay is bit-for-bit stable and adding B2-only draws does not alter B0/B1 outcomes;
- [ ] Q6/Q10 and the CCPS-1 same-actor finalizer vector reproduce exactly;
- [ ] conservation, idempotency, and state-classification assertions hold for every record.

Validation tolerances are selected from binomial/correlation standard errors before execution. Passing these checks validates implementation of the synthetic model, not empirical realism.

## 9. Reproducibility and raw-result schema

Version and publish together:

```text
model_version
policy_version
parameter_registry_version
baseline_definitions_version
random_stream_algorithm_version
master_seed_manifest
truth_and_case_model
judge_model
dao_signal_and_participation_model
selection_and_timeout_model
preregistration_hash
gas_measurement_commit
```

Minimum JSONL fields include:

```json
{
  "run_id": "...",
  "replication_id": 0,
  "stream_version": "...",
  "model": "B0|B1|B2",
  "model_version": "...",
  "policy_version": "...",
  "truth": "PASS|FAIL",
  "case_class": "...",
  "case_latent": 0.0,
  "judge_accuracy": 0.75,
  "within_case_rho": 0.30,
  "nonreveal_probability": 0.05,
  "court1_verdict": "PASS|FAIL|NONE",
  "court1_correct": null,
  "appeal_preference_count": 0,
  "appeal_ballot_count": 0,
  "dao_decision": "ACCEPT|APPEAL|NONE",
  "court2_opened": false,
  "final_state": "FINAL_PASS|VERDICT_FAIL|PROTOCOL_FAIL|STUCK",
  "final_verdict": "PASS|FAIL|NONE",
  "final_correct": null,
  "substantively_resolved": false,
  "terminally_complete": false,
  "resets": 0,
  "time_to_substantive": null,
  "substantive_censor_time": 0,
  "time_to_terminal": null,
  "creator_paid": 0,
  "judge_paid": 0,
  "reset_slashed": 0,
  "backer_refunded": 0,
  "capital_locked_peak": 0,
  "attacker_net_gain": 0,
  "invariant_violations": []
}
```

Raw JSONL is immutable input to summary tables. Publish configuration, source commit, seed manifest, raw results, analysis version, and generated tables/figures. Never publish only a chart or average.

## 10. Decision rule for retaining or rejecting B2

B2 is retained for a declared operating region only if the frozen H2 correctness/coverage criterion is met and every frozen cost, latency, capital-lock, procedural-failure, harmful-reversal, Sybil-flip, and attacker-risk bound is satisfied.

Prefer B0 or B1 for a region when B2 misses the minimum benefit, violates a premium/risk bound, or is Pareto-dominated under the frozen priority rule. If B2 helps only under favorable signal quality, participation, conflict, or pool assumptions, report that conditional region rather than a general improvement. If B1 captures the substantive-liveness benefit at lower cost, prefer B1.

Clear rejection conditions for Full VNext include:

- no owner-approved minimum all-trial correctness gain over B1;
- conditional accuracy gain caused by lower substantive coverage;
- harmful reversals or DAO selection errors above the frozen bound;
- unacceptable p95/restricted-mean latency, gas, or capital lock;
- profitable or insufficiently costly attacks under a declared relevant region;
- dependence on privileged Court 2 information absent from deployment; or
- results too sensitive to unsupported parameter choices to identify a defensible operating region.

## 11. Limitations

- All Judge, Backer, collusion, non-reveal, participation, and cost parameters are synthetic until externally calibrated.
- The model does not establish human identity, evidence truth, legal enforceability, public-chain gas behavior, or real reviewer supply.
- Fresh wallets do not remove correlated evidence errors, Sybil control, bribery, or shared incentives.
- Uniform or deterministic selection is not a faithful reproduction of another adjudication protocol.
- CCPS-1 measures a declared closed schedule, not actual lost work or gas.
- Simulation cannot establish contract safety; runtime still requires unit, fuzz, invariant, integration, transfer-failure, event, and reentrancy evidence.

## 12. Minimum publishable contribution and evidence boundary

The minimum defensible contribution is a paired, seed-reproducible comparison showing where B1 or B2 changes substantive resolution, all-trial correctness, attacker economics, latency, and capital lock relative to B0, with deterministic reproduction of known CWQ-1 and CCPS-1 counterexamples and all unfavorable regions preserved.

The PR1-PR4 Foundry fixtures are the technical baseline for mechanism semantics, not scientific results. Their deterministic entropy does not establish production randomness or Sybil resistance. No simulation or calibration was executed in preparing this protocol. The contribution, if later executed, remains an instance-level evaluation of declared mechanisms and assumptions—not a proof of decentralization, security, or superiority.
