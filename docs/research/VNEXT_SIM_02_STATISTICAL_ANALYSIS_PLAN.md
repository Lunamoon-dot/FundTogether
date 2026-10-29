# SIM-02 Statistical Analysis Plan

**Status:** preregistered design; no confirmatory execution  
**Design revision:** sim-02-prereg-v2  
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

`evidence_class` is primary-study metadata only. The allowed labels are
`clear_metadata`, `borderline_metadata`, and `misleading_metadata`; they are
scenario labels, not calibrated evidence-quality parameters. They do not alter
Judge accuracy, shared case difficulty, Backer signal probabilities,
participation, Court selection, or any other DGP variable. A future behavioral
evidence model would require an explicit mathematical mapping, validation
tests, shared-revision policy across B0/B1/B2, and a new design revision.

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

R1 and R2 are the fixed candidate target regions pending owner approval. R3 is
a mandatory adversarial falsification region and is descriptive/sensitivity-only
for positive claims.

Candidate margins are not owner-approved and are used only for planning:

~~~text
m_correct    = 0.05   candidate minimum correctness improvement
m_resolution = 0.05   candidate maximum resolution loss
~~~

For each target region `r`, define:

~~~text
H0_resolution,r: Delta_resolution,r <= -m_resolution
H1_resolution,r: Delta_resolution,r >  -m_resolution
H0_correct,r:   Delta_correct,r <=  m_correct
H1_correct,r:   Delta_correct,r >   m_correct
H0_joint,r = H0_resolution,r UNION H0_correct,r
H1_joint,r = H1_resolution,r INTERSECTION H1_correct,r
p_joint,r = max(p_resolution,r, p_correct,r)
~~~

The intersection–union p-value is valid because a joint null is true whenever
at least one component null is true. Under that joint null, the p-value for
the true component is super-uniform; the maximum of the two component
p-values is at least that true component p-value, so `p_joint` is also
super-uniform. This argument does not require independence between the
resolution and correctness contrasts.

The exact regional claim family is `(p_joint,R1, p_joint,R2)`. Apply one Holm
step-down correction at family alpha `0.05` across those two values under
arbitrary dependence. Holm's step-down procedure controls FWER for any valid
p-values and any dependence because, for every true-null subset, the first
rejected true hypothesis must pass its Bonferroni threshold for the remaining
true hypotheses; the union bound gives probability at most alpha. The procedure
is therefore not two separate endpoint families followed by an informal AND.

A region receives a positive B2 claim only if its joint p-value is rejected by
the R1/R2 Holm procedure. The global claim "B2 works in all target regions"
requires both R1 and R2 regional claims to pass. A single-region pass is
conditional evidence. R3 is not added to this positive family: its negative,
null, and failure outputs can reject, restrict, or make the recommendation
`INCONCLUSIVE`, but they are not another positive hypothesis test.

C1, B0-versus-B1 correctness, O1/O2 ownership variants, secondary outcomes,
and all R3 analyses remain separately labeled secondary or falsification
outputs. Candidate margins remain pending; changing either value requires a
new design revision and a rerun of the planning analysis before data
generation.

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

Bootstrap calibration is a required diagnostic, not an assumption supplied by
the number of replicates. Before confirmatory execution, the implementation
must evaluate the centered-null procedure at the exact decision boundary, at a
strict null below/above the boundary as appropriate, under a genuine
alternative, with strongly correlated paired outcomes, zero empirical
variance, rare outcomes, and small samples. When R1/R2 share case-level
randomness, the complete shared base-case cluster must remain the resampling
unit. Finite diagnostic estimates report their Monte Carlo uncertainty and do
not establish a mathematical guarantee. If the centered bootstrap is
anti-conservative or unstable for a required cell, the confirmatory gate is
`NO-GO` until a justified studentized, exact/conservative paired procedure is
versioned and revalidated; increasing `B` alone is not a correction.

The bootstrap seed is exact: canonical JSON with sorted keys and no spaces for
master_seed=20261028, analysis_version=sim-02-prereg-v2, region_id, cell_id,
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

There is one primary positive-claim family: the two regional IUT p-values for
R1 and R2. Holm is applied once across that family. The component p-values are
not separately Holm-adjusted and then informally intersected. Primary endpoint
order and the R1/R2 target list are fixed before execution.

Secondary outcomes, ownership variants, O2, R3, and attacker treatments are
exploratory/falsification outputs reported with their nominal intervals and
full cell list; they are not silently promoted to positive claims. R3 remains
mandatory even when its output is unfavorable. A global success claim requires
both regional joint hypotheses to reject; no global claim is made from an
average over regions.

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

The worst **historical marginal** planning row requires 1,492 paired base
cases. This table is retained for comparison and is not joint power: `marginal
power != joint power`.

### Joint design-stage power planning

The standalone planning-only simulator
[`sim02_joint_power.py`](../../research/pilot/tools/sim02_joint_power.py)
uses one categorical outcome per mechanism:

~~~text
CORRECT, INCORRECT, or PROTOCOL_FAIL
~~~

`R=1` for the first two states and `Y=1` only for `CORRECT`, so `Y_m <= R_m`
holds by construction. It validates a 3x3 B1-by-B2 joint table, preserves
declared state marginals, and computes the correlation between the paired
resolution and correctness contrasts from that table. Positive, independent,
and reverse-quantile couplings are feasible sensitivity models; none is
presented as an empirical estimate.

The actual planning decision is simulated for both fixed regions using the
centered bootstrap p-values, `p_joint=max(p_resolution,p_correct)`, and one
Holm step-down across R1/R2. It reports individual component-gate power,
regional joint power, the probability both regional claims pass, and the
probability of at least one regional claim under declared null scenarios.
The fixed design-stage budget is **500 outer planning replications and 250
inner bootstrap draws per p-value**, selected before inspecting the output;
each reported proportion has a Wilson 95% Monte Carlo interval. Confirmatory
analysis remains 10,000 bootstrap draws.

Required scenarios are `favorable`, `correctness_boundary`,
`resolution_boundary`, `correctness_gain_resolution_loss`,
`no_meaningful_correctness_benefit`, `strong_positive_dependence`,
`weak_unfavorable_dependence`, `scarcity_additional_protocol_failures`, and
`joint_null_boundary`. Candidate sample sizes are 1,500, 2,000, and 3,000
pairs per target region. The machine-readable and rendered outputs are
[VNEXT_SIM_02_JOINT_POWER_PLANNING.json](VNEXT_SIM_02_JOINT_POWER_PLANNING.json)
and [VNEXT_SIM_02_JOINT_POWER_PLANNING.md](VNEXT_SIM_02_JOINT_POWER_PLANNING.md).

Under the declared interpretation rule, 1,500 is borderline in the strong
positive dependence cell because its lower Monte Carlo bound is below 0.80;
2,000 clears the lower-bound rule in the favorable and dependence sensitivity
cells. Therefore 2,000 pairs per R1/R2 region is the current planning
recommendation, pending owner approval. The recommendation is not a
superiority result and does not override scarcity, misleading, null, or R3
negative cells. If future approved margins or validated DGPs change, rerun the
planner and issue a new design revision.

R3 remains descriptive/falsification-only regardless of its replication count.

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
