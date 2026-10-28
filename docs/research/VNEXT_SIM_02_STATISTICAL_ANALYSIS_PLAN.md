# SIM-02 Statistical Analysis Plan

**Status:** preregistered design; no confirmatory execution  
**Design revision:** sim-02-prereg-v1  
**Primary implementation unit:** one paired base case  
**Primary comparison:** C2 = B2 - B1

This plan is subordinate to
[VNEXT_SIM_02_PREREGISTRATION.md](VNEXT_SIM_02_PREREGISTRATION.md). It fixes
the estimators, uncertainty procedure, multiplicity, planning counts, and
stopping rules before any confirmatory output is inspected.

## 1. Analysis populations and outcome encoding

The independent unit is a generated base case. Each base case produces paired
B0, B1, and B2 records with shared truth, case latent, Judge potential
outcomes, contribution slots, attacker budget, and initial assignment stream.
Repeated overlap/ownership treatments sharing one base case are scenario
contrasts, not independent replications.

The raw record must include at least:

~~~text
design_revision, repository_commit, model_version, policy_version,
random_stream_version, master_seed, base_case_id, region_id, cell_id,
mechanism, truth, case_latent, evidence_class, Judge_population,
initial_assignment, reset_history, dao_snapshot, dao_decision,
court2_eligibility_stages, final_state, final_verdict,
failure_reason, contribution_slots, overlap_requested, overlap_realized,
ownership_assignment, attacker_budget, courts_attempted,
assigned_judge_seats, ballots_cast, valid_court_rewards
~~~

The semantic outcome classes are:

~~~text
SUBSTANTIVE_VERDICT = FINAL_PASS or VERDICT_FAIL with PASS/FAIL verdict
PROTOCOL_FAIL       = terminal procedural failure
STUCK               = no terminal transition by the frozen horizon
~~~

PROTOCOL_FAIL is neither an incorrect verdict nor substantive resolution.
Invalid rows, missing fields, duplicate base-case/model keys, and impossible
state combinations are schema failures, not zero outcomes.

## 2. Estimands and paired contrasts

For mechanism m and base case i:

~~~text
Y_mi = 1[correct substantive verdict]
R_mi = 1[substantive verdict]
F_mi = 1[PROTOCOL_FAIL]
S_mi = 1[STUCK]
D_correct_i = Y_B2_i - Y_B1_i
D_resolution_i = R_B2_i - R_B1_i
~~~

The primary estimates are paired means:

~~~text
Delta_correct    = mean_i(D_correct_i)
Delta_resolution = mean_i(D_resolution_i)
~~~

The population denominator for all-trial correctness and resolution is all
initiated trials, not only resolved trials:

~~~text
all_trial_correct_substantive = sum(Y_mi) / N
substantive_resolution_rate   = sum(R_mi) / N
conditional_substantive_accuracy = sum(Y_mi) / sum(R_mi)
~~~

If a denominator is zero, the estimate is null/undefined. It is never set to
zero, one, or a value imputed from another mechanism.

The same denominator discipline applies to false pass/fail, reset, exhaustion,
appeal, beneficial reversal, harmful reversal, and resource measures. Corrected
SIM-01 definitions are retained: beneficial/harmful reversal counts only
substantive Court 2 verdicts and uses the corresponding incorrect/correct
Court 1 appeal population; an appeal protocol failure is reported separately.

The secondary metric contract is:

| Metric | Numerator | Denominator |
| --- | --- | --- |
| court1_reset_rate | trials with a Court 1 reset | initiated trials |
| court2_reset_rate | B2 trials with a Court 2 reset | initiated B2 trials |
| court2_exhaustion_rate | B2 trials whose Court 2 path exhausts eligibility/recovery | initiated B2 trials |
| dao_appeal_rate | finalized DAO decisions equal to APPEAL | finalized DAO decisions |
| alpha_appeal | appeals after an incorrect valid Court 1 | incorrect valid Court 1 outcomes reaching finalized DAO |
| beta_appeal | appeals after a correct valid Court 1 | correct valid Court 1 outcomes reaching finalized DAO |
| beneficial_reversal_rate | substantive Court 2 verdict correct after incorrect Court 1 | incorrect valid Court 1 outcomes with DAO APPEAL |
| harmful_reversal_rate | substantive Court 2 verdict incorrect after correct Court 1 | correct valid Court 1 outcomes with DAO APPEAL |
| appeal_protocol_failure_rate | DAO appeals ending PROTOCOL_FAIL | DAO appeals |
| court2_eligible_judges_after_dao | count after declared DAO exclusions | stage count, reported as a distribution rather than a rate |
| courts_attempted | attempted Courts | per-initiated-trial mean |
| assigned_judge_seats | assigned seats | per-initiated-trial mean |
| ballots_cast | valid DAO ballots | B2 trials with an opened DAO, plus the initiated-trial mean |
| valid_court_rewards | valid-service reward allocations | per-initiated-trial mean |

Each row stores numerator and denominator fields even when the displayed value
is a mean or count. A zero denominator is null. Court 2 protocol failure is
never placed in either reversal numerator.

## 3. Primary testing hierarchy

R1 and R2 are candidate target regions pending approval. R3 is a mandatory adversarial
falsification region and is descriptive/sensitivity-only for positive claims.

Candidate margins are not owner-approved and are used only for planning:

~~~text
m_correct    = 0.05   candidate minimum correctness improvement
m_resolution = 0.05   candidate maximum resolution loss
~~~

The owner must approve these values before confirmatory execution. If another
value is selected, rerun the power helper and update the design revision before
data generation.

For each target region:

1. Test resolution non-inferiority, H0: Delta_resolution <= -m_resolution,
   against H1: Delta_resolution > -m_resolution.
2. Apply Holm correction at family alpha 0.05 across the two target-region
   resolution hypotheses.
3. A region whose liveness gate fails cannot receive a positive B2 correctness
   claim, even if its correctness estimate is favorable.
4. For regions whose liveness gate passes, test correctness superiority,
   H0: Delta_correct <= m_correct, against H1: Delta_correct > m_correct.
5. Apply Holm correction at alpha 0.05 across the gated target-region
   correctness hypotheses.

C1, B0-versus-B1 correctness, and all R3 analyses are separate secondary or
falsification families. They are not silently promoted to primary evidence.
The decision rule never trades a failed resolution gate for a correctness win.

## 4. Confidence intervals and resampling

### Primary procedure

Use a paired cluster bootstrap:

- resampling unit: complete base_case_id, including B0/B1/B2 records;
- resample within a region and exact cell only;
- sample base cases with replacement;
- recompute the paired mean difference for every bootstrap draw;
- use 10,000 bootstrap replicates;
- use a two-sided 95% percentile interval for reporting;
- use the 5th percentile as the one-sided 95% lower bound for descriptive
  reporting; the Holm-adjusted bootstrap p-value below is the authoritative
  gate criterion;
- use a fixed bootstrap seed derived from the recorded master seed and
  analysis version;
- never resample raw model rows, ballots, Judges, or overlap treatments as if
  independent.

For each one-sided gate with null boundary theta0, construct a centered null
sample from the observed paired differences D_i:

```text
D_i_null = D_i - mean(D) + theta0
```

For a greater-than alternative, the bootstrap p-value is
`(1 + count(mean(D_null_bootstrap) >= mean(D_observed))) / (B + 1)`, where B is
10,000. Apply Holm to these p-values in the declared family. The liveness
boundary is theta0 = -m_resolution; the correctness boundary is theta0 =
m_correct. The authoritative gate is the Holm step-down rule
p_(j) <= 0.05 / (m - j + 1) after sorting the m family p-values. The reported
uncentered 5th percentile remains the one-sided 95% descriptive lower bound;
it is not an additional unadjusted gate. This makes the interval and
multiplicity procedure reproducible and does not turn an unapproved candidate
margin into an approved gate.

The bootstrap seed is exact: canonical JSON with sorted keys and no spaces for
master_seed=20261028, analysis_version=sim-02-prereg-v1, region_id, cell_id,
comparison=B2_minus_B1, and metric is hashed with BLAKE2b-256 using the
personalization string FT-SIM02-BOOT. Convert the digest to a big-endian
integer modulo 2^128 and initialize NumPy PCG64DXSM. Region/cell/metric labels
are included so bootstrap streams cannot be shifted by execution order.

If no valid paired base cases remain, the estimate and interval are null. If
all paired differences are identical, report the point-mass/degenerate interval
and zero empirical variance; do not add artificial noise. If a cell has zero
substantive outcomes, conditional accuracy and reversal rates are null while
all-trial outcomes remain defined.

An analytical paired standard error is allowed as a planning/sensitivity
calculation. It is not the primary inferential procedure unless a later
revision justifies its dependence assumptions.

For rare marginal event rates, report exact Clopper-Pearson intervals in
addition to the paired effect interval. A zero count remains zero observed
count with an upper uncertainty bound; it is not evidence the event is
impossible. Rare paired effects remain subject to the base-case bootstrap and
are flagged when effective event counts are too small for a stable interval.

## 5. Multiplicity and scenario dependence

The resolution family and gated correctness family each have a declared
two-region family and Holm correction. Primary endpoint order and the gate are
fixed before execution. Secondary outcomes, ownership variants, O2, R3, and
attacker treatments are exploratory/falsification outputs reported with their
nominal intervals and full cell list; they are not silently promoted.

When scenarios share one base case, scenarios are not pooled as independent
observations. A scenario effect is reported separately. A later aggregate must
either resample the common base case as the cluster or be labeled descriptive
with an explicit weighting rule frozen before execution.

## 6. Analytical power and replication plan

### Planning model

For binary outcomes with B1 probability p1, B2 probability p2, and positive
within-pair correlation q:

~~~text
Var(D) = p1(1-p1) + p2(1-p2)
         - 2 q sqrt[p1(1-p1) p2(1-p2)]
~~~

The helper checks Bernoulli feasibility of the requested coupling and uses the
one-sample paired normal approximation:

~~~text
n = ceil((z_(1-alpha) + z_power)^2 Var(D) / separation^2)
~~~

This is planning evidence only. It is not a simulation result and does not
reuse exploratory SIM-01 outcomes as confirmatory evidence.

The isolated helper is
[research/pilot/tools/sim02_power.py](../../research/pilot/tools/sim02_power.py).
It uses only the Python standard library and does not import or modify SIM-01
generators. Its focused tests are in
[test_sim02_power.py](../../research/pilot/tests/test_sim02_power.py).

The exact output for candidate correctness null boundary 0.05 with planned
delta 0.10, resolution null boundary -0.05 with planned delta 0.00, one-sided
alpha 0.025 (the conservative two-region Holm planning value), target power
0.80, and pair correlations 0, 0.25, and 0.50 is:

| Endpoint | Scenario | p(B1) | p(B2) | Null | Planned delta | Separation | Pair rho | Var(D) | Required pairs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| correctness | correctness_low | 0.55 | 0.65 | 0.05 | 0.10 | 0.05 | 0.00 | 0.475000 | 1492 |
| correctness | correctness_low | 0.55 | 0.65 | 0.05 | 0.10 | 0.05 | 0.25 | 0.356355 | 1119 |
| correctness | correctness_low | 0.55 | 0.65 | 0.05 | 0.10 | 0.05 | 0.50 | 0.237711 | 747 |
| correctness | correctness_mid | 0.70 | 0.80 | 0.05 | 0.10 | 0.05 | 0.00 | 0.370000 | 1162 |
| correctness | correctness_mid | 0.70 | 0.80 | 0.05 | 0.10 | 0.05 | 0.25 | 0.278348 | 874 |
| correctness | correctness_mid | 0.70 | 0.80 | 0.05 | 0.10 | 0.05 | 0.50 | 0.186697 | 587 |
| correctness | correctness_high | 0.85 | 0.95 | 0.05 | 0.10 | 0.05 | 0.00 | 0.175000 | 550 |
| correctness | correctness_high | 0.85 | 0.95 | 0.05 | 0.10 | 0.05 | 0.25 | 0.136089 | 428 |
| correctness | correctness_high | 0.85 | 0.95 | 0.05 | 0.10 | 0.05 | 0.50 | 0.097178 | 306 |
| resolution | resolution_low | 0.70 | 0.70 | -0.05 | 0.00 | 0.05 | 0.00 | 0.420000 | 1319 |
| resolution | resolution_low | 0.70 | 0.70 | -0.05 | 0.00 | 0.05 | 0.25 | 0.315000 | 989 |
| resolution | resolution_low | 0.70 | 0.70 | -0.05 | 0.00 | 0.05 | 0.50 | 0.210000 | 660 |
| resolution | resolution_mid | 0.85 | 0.85 | -0.05 | 0.00 | 0.05 | 0.00 | 0.255000 | 801 |
| resolution | resolution_mid | 0.85 | 0.85 | -0.05 | 0.00 | 0.05 | 0.25 | 0.191250 | 601 |
| resolution | resolution_mid | 0.85 | 0.85 | -0.05 | 0.00 | 0.05 | 0.50 | 0.127500 | 401 |
| resolution | resolution_high | 0.95 | 0.95 | -0.05 | 0.00 | 0.05 | 0.00 | 0.095000 | 299 |
| resolution | resolution_high | 0.95 | 0.95 | -0.05 | 0.00 | 0.05 | 0.25 | 0.071250 | 224 |
| resolution | resolution_high | 0.95 | 0.95 | -0.05 | 0.00 | 0.05 | 0.50 | 0.047500 | 150 |

The worst planning row requires 1,492 paired base cases. Candidate fixed counts
are 2,000 paired cases for R1, 2,000 for R2, and 1,000 descriptive paired
cases for R3. The 2,000 count is a rounded allowance for invalid-output
attrition and variance misspecification; it does not power a smaller effect
than the approved margin. R3 is not a positive claim regardless of count.

The maximum candidate budget is 5,000 paired base cases and 15,000 mechanism
evaluations across B0/B1/B2. Six sensitivity cells may use 500 paired cases
each, for a separate cap of 3,000 pairs and 9,000 mechanism evaluations. These
are logical operation caps, not wall-clock or gas measurements.

## 7. Missing measurement categories and cost layers

| Category | SIM-02 treatment | Evidence required before it can gate B2 |
| --- | --- | --- |
| Actual gas | Level-2 Foundry benchmark of exact fixture/compiler/operation versions; not inferred from Court count | measured gas table and block-limit boundary |
| Real elapsed settlement time | exclude from primary inference; later validated timing model or runtime measurement | versioned timing source and retry/timeout semantics |
| Capital-lock duration | record only if the state machine defines it; otherwise exclude | event/timestamp benchmark |
| Staking opportunity cost | analytical bounds only with approved price/time model; not a current gate | approved economic calibration |
| Evidence availability | availability/hash checks test binding, not factual truth | availability and revision evidence |
| Attacker profitability | separate declared budget/reward/gas/timing model | calibrated or bounded net-cost analysis |

Level-1 proxies are courts_attempted, assigned_judge_seats, ballots_cast,
resets, and valid_court_rewards. They are not monetary cost. Level 2 measures
exact contract execution cost. Level 3 interprets gas, duration, collateral,
opportunity cost, and fees only after inputs are measured. An economic gate is
unvalidated when its inputs are unavailable.

## 8. Stopping, invalid output, and amendment rules

- Use fixed sample sizes and fixed cell lists. No optional stopping based on
  whether B2 appears favorable.
- Stop immediately on a schema, state-machine, duplicate-key, or conservation
  failure. Preserve the invalid artifact and diagnose it; never replace it
  silently with a new seed.
- Stop on infrastructure failure and record the last valid batch, exception,
  environment, and revision. A rerun is a new versioned execution.
- Do not extend a cell because its interval is wide after results are seen.
  Additional replication requires a predeclared extension with a new seed,
  reason, cap, and analysis record.
- If fixed N does not provide useful precision, report INCONCLUSIVE. Do not
  redefine the endpoint or merge cells to obtain precision.
- Every amendment records revision, timestamp, source commit, affected cells,
  reason, and whether prior output is superseded. Historical outputs remain
  immutable.

## 9. Reporting format

Each cell reports source/model/policy/stream SHAs, N, numerator and denominator
for every rate, paired contrast, bootstrap interval, multiplicity family,
failure/stuck counts, Judge-supply stage counts, overlap/ownership identity,
resource proxies, and measurement availability. Results are split into primary
target gates, R3 falsification, O1/O2 sensitivities, secondary metrics, and
unvalidated economic/timing categories.

The report must state whether the result supports RETAIN_B0, RETAIN_B1,
RETAIN_B2_CONDITIONALLY, RETAIN_B2, or INCONCLUSIVE under the decision
register. It must not call a fixture pass production readiness or a synthetic
effect real-world evidence.
