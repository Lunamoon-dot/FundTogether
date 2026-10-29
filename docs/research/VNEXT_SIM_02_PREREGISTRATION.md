# FundTogether VNext SIM-02 preregistration

**Status:** research design only; no confirmatory simulation has been run.  
**Design revision:** sim-02-prereg-v2  
**Design date:** 2026-10-29 (Asia/Ho_Chi_Minh)  
**Branch:** codex/vnext-sim-02-preregistration

This preregistration makes a later implementation executable without selecting
hypotheses, scenarios, effect thresholds, or analysis methods after results are
visible. It permits B0 or B1 to be preferred, B2 to be useful only in a bounded
region, or the evidence to be inconclusive.

## 1. Source boundary and verified baseline

The clean study baseline is origin/main@7d773668a201f8ba9c137fb6751d69122222b606,
which contains merged PR #26 (d86bffffd3f21346362ceabfa8038ff82c08e300).
PR #26 was independently checked as **MERGED** on 2026-10-28:
[PR #26](https://github.com/Lunamoon-dot/FundTogether/pull/26).

| Source | Revision | Authority/classification | Use in SIM-02 |
| --- | --- | --- | --- |
| Repository baseline | 7d773668a201f8ba9c137fb6751d69122222b606 | Clean merged baseline | Reproducibility anchor |
| docs/research/VNEXT_EXPERIMENTAL_PROTOCOL.md | 58ad19b237758f776418ac64eed09a8c4031bffe | Research protocol; not production authority | Existing estimands and synthetic-model boundary |
| docs/research/VNEXT_PROTOCOL_HARDENING_RFC.md | 58ad19b237758f776418ac64eed09a8c4031bffe | Candidate hardening design; not deployed behavior | Liveness and bounded-failure concerns |
| docs/research/VNEXT_RESEARCH_READINESS_REPORT.md | 58ad19b237758f776418ac64eed09a8c4031bffe | Prior source audit/readiness assessment | Current blockers and authority map |
| docs/research/VNEXT_PILOT_01_VALIDATION_REPORT.md | 9d085737e9da342c8e26086158e28199bd9fe03e | Validation-only synthetic evidence | Generator checks; not comparative evidence |
| docs/research/VNEXT_SIM_01_FOUNDATION_REPORT.md | 2960384d1d16651c99d8f73ac108a76ef2522789 | Exploratory paired study | Historical exploratory context only |
| docs/research/VNEXT_SIM_01_REMEDIATION_REPORT.md | d86bffffd3f21346362ceabfa8038ff82c08e300 | Corrected exploratory diagnostic | Corrected metrics/overlap; not confirmatory |
| docs/research/VNEXT_SIM_01_REMEDIATION_SOURCE_NOTES.md | d86bffffd3f21346362ceabfa8038ff82c08e300 | Source audit | Layered SHA and fixture/runtime boundary |
| docs/protocol/parameters-v2-policy.md | d1b3b5fcfda8caa3fd83f40a32418772cce8b83b | V2 candidate policy registry | Locked/pending policy labels |
| V2CourtResetFixture.sol | 6bf371646da84044006d34d76319da221ab6d59f | Foundry-only PR3 fixture | Reset and stake-ledger semantics |
| V2BackerDaoCourt2Fixture.sol | d00c92dca186164ff2bb842e420b9ac2f80c9f76 | Foundry-only PR4 fixture | DAO/Court 2 test semantics |
| SIM-01 raw result SHA | 3808dd7109196d102ac93034e6f686996f80415e493f46068805d2e5b1a87e49 | Preserved exploratory artifact | Reproducibility reference only |
| SIM-02 joint-power planner | `research/pilot/tools/sim02_joint_power.py` added after `97da20e` | Standalone design-stage planner | Feasible categorical joint outcomes, IUT/Holm decision diagnostics |
| SIM-02 joint-power evidence | [VNEXT_SIM_02_JOINT_POWER_PLANNING.json](VNEXT_SIM_02_JOINT_POWER_PLANNING.json) and [Markdown table](VNEXT_SIM_02_JOINT_POWER_PLANNING.md) | `DESIGN_STAGE_POWER_ANALYSIS` only | Fixed-seed marginal/joint power and null diagnostics |
| SIM-02 R3 treatment contract | [VNEXT_SIM_02_R3_TREATMENTS.md](VNEXT_SIM_02_R3_TREATMENTS.md) | Versioned synthetic adversarial DGP | Reproducible R3-A through R3-E treatments |

The current runtime is not treated as V2-compatible. V2 contracts and tests
are isolated fixtures, not deployed production behavior. D=10, F=3,
resetCostMax=23, reward 100 bps, and DAO threshold 2,000 bps remain fixture
inputs or pending policy values. This document does not approve CWQ-1, CCPS-1,
DAO-TEMPORAL-1, Court 2, or production economics.

The external source memo is
[VNEXT_SIM_02_EXTERNAL_SOURCES.md](VNEXT_SIM_02_EXTERNAL_SOURCES.md). It
records official source claims and transfer limits; it is not evidence that
FundTogether implements Kleros, UMA, or Reality.eth.

This remediation was independently checked against PR #27 at source commit
`97da20e8dd7bead1e616e2f11a295a6d183169bd` before edits. The remediation
source commit is the commit containing this revision; all research-spec and
fixture SHAs above remain the input revisions and are not silently advanced.

## 2. Research question and hypotheses

### Research question

Under what declared synthetic operating conditions, if any, does DAO-gated Court
2 provide enough incremental decision correctness, substantive resolution, and
recovery from procedural failure over simpler mechanisms to justify additional
Court operations, capital lock, liveness risk, and attack surface?

### Hypotheses frozen before confirmatory execution

| ID | Hypothesis or falsification target | What would count against it |
| --- | --- | --- |
| H1 | B1 increases substantive resolution over B0 with ordinary non-reveal. | The approved paired lower bound fails, or the benefit is outside the approved cost/liveness envelope. |
| H2 | B2 increases all-trial correct substantive outcomes over B1 in an approved informative region. | The correctness gate fails, or the gain uses a privileged Court 2 signal/evidence channel. |
| H3 | B2 is not inferior to B1 on substantive resolution where a correctness claim is made. | The liveness safety gate fails, even if conditional accuracy improves. |
| H4 | Court 2 exhaustion and protocol failure increase as Judge supply, participation, or overlap deteriorate. | The paired contrast does not show the predicted resource sensitivity; this does not prove universal liveness. |
| H5 | Informative signals can improve Court 2 selection, while non-informative or misleading signals can fail or harm correctness. | A positive informative result cannot erase a negative misleading region. |
| H6 | Fixed-capital wallet splitting can change CWQ-1 weights or decisions. | Failure to reproduce Q6/Q10 is a model defect, not Sybil-resistance evidence. |
| H7 | Additional B2 operations and capital lock can outweigh correctness or liveness gains. | B2 remains on the operational frontier only if separate cost gates are measured and passed. |
| H8 | Results may be too sensitive to synthetic quality, dependence, or attacker assumptions for a superiority claim. | Sensitivity instability is reported as INCONCLUSIVE, not averaged away. |

The study does not assume H2. A null or negative B2 result is valid. Lack of
statistical significance is not equivalence unless an approved margin and
appropriate test are frozen.

## 3. Frozen treatment definitions and causal estimands

Each paired base case shares truth, case difficulty, evidence class, Judge
population and potential behavior, attacker resources, contribution capital,
initial assignment, and policy identity. B2 receives no better Judges,
privileged truth, or extra evidence.

### B0 — single Court

- One three-Judge Court.
- No reset, BackerDAO, or Court 2.
- Three valid reveals are required for a substantive verdict.
- Invalid terminal behavior is PROTOCOL_FAIL, not a Creator-fault verdict.

### B1 — bounded Court Reset

- Same Court 1 and potential outcomes as B0.
- One bounded replacement Court 1 with fresh eligible Judges after invalidity.
- CCPS-1 is separate locked-stake accounting; it never draws from milestone
  escrow in the study model.
- A second invalid Court 1 attempt is terminal PROTOCOL_FAIL.
- No DAO or Court 2.

### B2 — Full VNext candidate

- Same Court 1 and bounded reset as B1.
- A valid Court 1 opens a frozen BackerDAO with ACCEPT and APPEAL.
- CWQ-1 and declared conflict exclusions determine the DAO decision; policy
  remains pending approval.
- Only finalized APPEAL opens a fresh Court 2 excluding the declared history.
- Court 2 has one bounded reset and terminal PROTOCOL_FAIL after recovery is
  exhausted.
- A valid Court 2 replaces the Court 1 substantive outcome; procedural failure
  is not a substantive reversal.

The primary contrasts are:

~~~text
C1 = B1 - B0       # Court Reset increment
C2 = B2 - B1       # combined BackerDAO + Court 2 increment
~~~

C2 does not separately identify DAO gating from the extra Court. A no-DAO
gating or random-appeal ablation is outside the three primary baselines.

### Common synthetic data-generating process

- Truth is balanced PASS/FAIL in primary cells; prevalence is a sensitivity.
- Marginal Judge correctness is a=0.70 in primary cells.
- For rho>0, shared case difficulty uses the existing Beta-Bernoulli model.
  rho=0 is independent Bernoulli and does not evaluate infinite concentration.
- Court 1 and Court 2 share case difficulty, so fresh identities do not imply
  independent errors.
- Ordinary and coordinated non-reveal use distinct keyed streams.
- Backer signals are private imperfect signals; no actor receives latent truth.
- Streams use blake2b-256-numpy-pcg64dxsm-v1 with master seed 20261028 and
  keyed case/identity domains. The implementation records exact commit/version.

These are synthetic assumptions, not measurements of Judges, Backers, comics,
artbooks, or public-chain behavior.

### Pairing, assignment, and exclusions

The initial Court is selected without replacement from the common eligible pool
using the versioned keyed assignment stream. B0, B1, and B2 read the same
initial assignment and potential outcomes; B1/B2 may add only their declared
fresh replacement assignments. Truth prevalence, region, cell, and replication
IDs are generated by the frozen schedule rather than selected after inspection.
Signal and participation uniforms are keyed to stable slots for O1 and to
wallet identities only for the separate O2 sensitivity. No record is excluded
because its outcome is unfavorable. Exclusions are limited to predeclared
schema/state failures, duplicate identities, impossible conservation states,
or records lacking a complete paired base case; every excluded record and reason
is retained in an audit manifest and cannot be relabeled as a protocol failure.

## 4. Primary outcomes and reporting semantics

For every cell and mechanism, N is all initiated trials. FINAL_PASS and
VERDICT_FAIL with a binary verdict are substantive; PROTOCOL_FAIL is procedural;
STUCK is unresolved at the declared horizon.

| Estimand | Numerator | Denominator | Zero denominator |
| --- | --- | --- | --- |
| all_trial_correct_substantive | Correct substantive final verdicts | N | null when N=0 |
| substantive_resolution_rate | Substantive final verdicts | N | null when N=0 |
| conditional_substantive_accuracy | Correct substantive final verdicts | Substantive final verdicts | null when none |
| false_pass_rate | FINAL_PASS when truth is FAIL | N | null when N=0 |
| false_fail_rate | VERDICT_FAIL when truth is PASS | N | null when N=0 |
| protocol_failure_rate | PROTOCOL_FAIL trials | N | null when N=0 |
| stuck_rate | STUCK trials | N | null when N=0 |

For paired case i:

~~~text
Y_mi = 1 if mechanism m ends with a correct substantive verdict, else 0
R_mi = 1 if mechanism m ends with a substantive verdict, else 0
D_correct_i = Y_B2_i - Y_B1_i
D_resolution_i = R_B2_i - R_B1_i
Delta_correct = E[D_correct_i]
Delta_resolution = E[D_resolution_i]
~~~

Correctness is safety-gated by resolution. A correctness gain cannot justify B2
where the approved resolution non-inferiority gate fails.

Secondary denominators are fixed: reset rates over initiated trials; Court 2
exhaustion over initiated B2 trials; DAO appeal over finalized DAO decisions;
alpha/beta appeal over incorrect/correct appealed Court 1 populations;
beneficial/harmful reversal over their corresponding appealed populations;
appeal protocol failure over DAO appeals; Court 2 eligible Judges as a count
with stage denominator. Report courts attempted, assigned seats, ballots, and
valid rewards as resource proxies. Procedural failures are never substantive
reversals. Every summary includes numerator and denominator.

### Joint regional claim and evidence-class contract

For each fixed target region `r`:

```text
H0_resolution,r: Delta_resolution,r <= -m_resolution
H1_resolution,r: Delta_resolution,r >  -m_resolution
H0_correct,r:   Delta_correct,r <=  m_correct
H1_correct,r:   Delta_correct,r >   m_correct
H0_joint,r = H0_resolution,r UNION H0_correct,r
p_joint,r = max(p_resolution,r, p_correct,r)
```

The R1/R2 positive-claim family is the two joint p-values. Holm step-down at
family alpha `0.05` is applied once across `(p_joint,R1, p_joint,R2)`.
Region `r` receives a positive claim only when its joint p-value is rejected by
that step-down procedure. The global success rule is strict: both R1 and R2
must pass their joint claims. A single-region pass is conditional evidence,
not a global B2 success claim.

R3 is a mandatory falsification/sensitivity region. Its estimates and
uncertainty are reported separately and are not added to the positive-claim
Holm family. R3 can reject, restrict, or make the overall recommendation
`INCONCLUSIVE`; it cannot silently become a third positive test.

The primary `evidence_class` field is metadata-only. `clear_metadata`,
`borderline_metadata`, and `misleading_metadata` describe a declared scenario
label and do not change Judge accuracy, case difficulty, Backer signal
probabilities, participation, Court selection, or any other DGP variable.
They must not be read as calibrated evidence-quality categories. Behavioral
evidence modeling is a future dependency requiring its own mapping, validation,
and design revision.

The older shared experimental protocol describes evidence classes as a possible
future mapping. SIM-02 v2 explicitly does not import that mapping: this
metadata-only contract is the active rule for the SIM-02 study, and any
behavioral evidence treatment requires a new preregistration revision.

## 5. Judge–Backer overlap and ownership identification

### O1 — slot-keyed controlled overlap (primary)

Freeze 20 contribution slots with amounts (slot_index + 1)^2 * 1,000,000 base
units. Slot amount, potential signal, participation uniform, truth, case
latent, Judge potential behavior, and total capital are shared across paired
treatments. Selected slots are assigned to Judge-controlled wallets using a
deterministic mapping. Role ownership may change eligibility and ballots; that
is the treatment, not an unrecorded redraw.

Requested overlap ratios are 0.00, 0.25, 0.50, and 1.00, rounded nearest
integer half-up. For nine Judges these realize 0, 2, 5, and 9 wallets. Store
requested and realized ratios.

O1 isolates role mapping and conflict-exclusion effects while holding potential
Backer behavior per slot fixed. It does not isolate every ownership-weight
effect: assigning high- or low-value slots to Judges changes CWQ-1 weights.

### O2 — wallet-identity-keyed sensitivity

Retain identity-keyed signal and participation streams as a separate model.
Never pool O1 and O2. A difference is sensitivity to stream/identity mapping,
not evidence that either model is the real world.

### Ownership-weight sensitivity

At fixed total capital, separately assign low-contribution slots, high-
contribution slots, or uniformly selected stable slots to Judge identities.
Assignments are deterministic for replay.

| Comparison | Shared | Changed | Identifiable | Residual/confounded | Unsupported claim |
| --- | --- | --- | --- | --- | --- |
| O1 overlap | truth, case latent, Judge outcomes, slots, slot signals, uniforms, seed | ownership and resulting exclusions/ballots | role mapping conditional on fixed slot potentials | weight assignment and role-dependent behavior | pure eligibility effect for every ownership distribution |
| O1 ownership variants | all inputs and total capital | which weights Judges own | weight-concentration sensitivity | strategic response | Sybil resistance |
| O2 sensitivity | mechanism and nominal seed | wallet-keyed stream mapping | identity-stream sensitivity | stream and identity jointly changed | pooled O1 effect |

No large overlap simulation is implemented. Only design vectors and future
feasibility checks are permitted.

## 6. Liveness and Judge supply

Record candidate counts at each stage:

~~~text
registered pool -> collateral-qualified pool -> Court 1 assignment history
-> invalid/reset history -> DAO conflict exclusions
-> Court 2 assignment history -> Court 2 reset history
~~~

Also record collateral, required locked stake, participation, overlap, retries,
and typed failure reason.

For the closed-form sanity check only, with nine Judges, three Court 1 seats,
full overlap, no other exclusions, independent 80% DAO turnout, and three
Court 2 seats:

~~~text
X ~ Binomial(6, 0.20)
P(X >= 3) = 0.09888
~~~

This does not extrapolate to arbitrary pools, coordinated abstention, other
conflicts, strategic voting, or changed participation.

| Condition | Recommended research default | Status/sensitivity |
| --- | --- | --- |
| Insufficient initial Judges | terminal PROTOCOL_FAIL; no assigned-duty reward/slash; refund/unlock after accounting | PENDING_OWNER_APPROVAL |
| Non-reveal | invalid Court; locked-stake CCPS-1 only; one replacement per level | PENDING_OWNER_APPROVAL |
| Reset exhaustion | terminal PROTOCOL_FAIL, never a substantive verdict | PENDING_OWNER_APPROVAL |
| Selection failure | typed bounded recovery for randomness/draw/collateral/gas; not mislabeled insufficiency | PENDING_OWNER_APPROVAL |
| DAO no quorum/tie/empty | candidate fixture default ACCEPT; report separately | PENDING_OWNER_APPROVAL |
| Court 2 exhaustion | bounded timeout to PROTOCOL_FAIL; preserve DAO transcript | PENDING_OWNER_APPROVAL |
| Retries/timeouts | fixed finite attempt and horizon in manifest | PENDING_OWNER_APPROVAL |
| Refund/unlock | only after typed terminal state and accounting checks | PENDING_OWNER_APPROVAL |
| STUCK | no terminal transition by horizon; right-censored, never substantive | PENDING_OWNER_APPROVAL |

Alternative liveness rules are sensitivity treatments. No unresolved rule is
silently treated as approved policy.

## 7. Threat and trust model

Benign and adversarial assumptions are separate. No Sybil, collusion, bribery,
or non-reveal resistance claim is made without its explicit model.

| Threat | Objective | Capability/budget/info | Strategy | Outcomes | Assumption/failure condition |
| --- | --- | --- | --- | --- | --- |
| Independent non-reveal | cause invalidity | configured per-seat probability | missed commit/reveal | reset, failure, resolution, operations | independent Bernoulli; coordination is separate |
| Coordinated non-reveal | exhaust recovery | group-controlled Judges and shared stream | coordinated missing reveals | failure and supply sensitivity | coordination is declared; hidden coordination is out of scope |
| Strategic abstention | avoid unfavorable DAO outcome | private signal and declared influence/cost | signal-dependent abstention | turnout, appeal, resolution | strategy cannot read latent truth |
| Wallet splitting | amplify CWQ-1 | fixed total contribution, declared wallet count | reallocate same capital | weight/decision flip and cost proxy | no extra capital; a flip is not a frequency claim |
| DAO manipulation | force ACCEPT/APPEAL | controlled wallets and fixed budget | coordinated weight | DAO outcome and Court 2 opening | fixed budget and policy formula are frozen |
| Judge collusion | change substantive verdict | declared fraction, target, budget | coordinated vote | correctness and false pass/fail | colluding membership and target are model inputs |
| Same-actor recapture | reduce deterrence | Judge/finalizer identity control | recapture allowance | locked-stake net loss before gas | gas and opportunity cost remain unvalidated |
| Misleading information | induce harmful Court 2 change | signal pair (0.20,0.80) | appeal signal on correct Court 1 | harmful reversal and coverage | no truth access; negative region is retained |
| Resource scarcity | prevent assignment | pool/collateral/overlap/turnout | exhaust candidates/retries | stage counts, failure, STUCK, cost | no extrapolation beyond declared pools and horizons |

Attacker capital remains fixed when wallet count changes. Assumptions and
negative cells are preserved rather than converted into real-world prevalence.

## 8. Frozen operating regions

R1 and R2 are candidate target regions for a positive B2 claim. R3 is a
mandatory adversarial falsification region and cannot be omitted.

| Cell | Pool | rho | Non-reveal | Overlap | Signal (s,f) | Participation | Attacker/ownership | Evidence |
| --- | ---: | ---: | ---: | ---: | --- | ---: | --- | --- |
| R1 nominal | 9 | 0.30 | 0.05 independent | 0.25 (2/9) | informative (0.80,0.20) | 0.80 | none; O1 uniform slots | borderline_metadata |
| R2 scarcity/uncertainty | 9 | 0.60 | 0.20 independent | 1.00 (9/9) | non-informative (0.50,0.50) | 0.50 | none; O1 high-value slots | borderline_metadata |
| R3 adversarial/misleading | 9 | 0.30 | 0.20 coordinated | 1.00 (9/9) | misleading (0.20,0.80) | 0.80 strategic | four fixed-capital wallets; one-third colluding Judges; recapture diagnostic | misleading_metadata |

All use a=0.70, 20 slots, balanced truth, seed 20261028, and common initial
assignment. R3 is not in the positive superiority family.

| ID | Fixed base | Changed factor(s) |
| --- | --- | --- |
| S1 | R1 | O1 overlap 0, 0.25, 0.50, 1.00, each with low/high/uniform ownership |
| S2 | R1 | informative, non-informative, misleading signals with shared slot streams |
| S3 | R1 | pool 3, 6, 12; overlap 1 for 3/6 and 0 for 12 |
| S4 | R1 | O2 wallet-identity-keyed streams |
| S5 | R2 | participation 0.20 and 0.80, full overlap and rho=0.60 |
| S6 | R3 | fixed-capital wallet counts 1, 2, 4, 8; collusion off/on separately |

No full Cartesian product is primary. Unlisted cells are outside the supported
claim region until separately preregistered.

## 9. Falsification and external validity

B2 is rejected for a target region if approved gates show no sufficient
all-trial correctness improvement, lower substantive resolution, frequent
Court 2 exhaustion, reliance on non-informative/misleading signals, wallet
splitting below the approved attacker-cost criterion, collusion/non-reveal
failure, excess cost/capital lock, or B0/B1 dominance. Material sensitivity to
unverifiable assumptions yields INCONCLUSIVE.

This study abstracts three-Judge Courts, Backer signals, bounded reset, and
DAO-gated Court 2. It is not a faithful implementation of Kleros, UMA, or
Reality.eth. Generalization requires calibration of Judge accuracy/error
correlation, participation, collusion, signal quality, ownership, stake,
evidence, gas, elapsed time, and opportunity cost.

## 10. Preregistration lock and execution gate

Before confirmatory execution, the owner must approve policy and threshold rows
in the decision register. The implementation must freeze model/config/stream
versions and emit the declared raw schema. Amendments need a new revision,
reason, timestamp, affected cells, and separate analysis.

SIM-02 design is **GO for documentation**. Confirmatory implementation is
**CONDITIONAL GO** only after the pending decisions and validation gates.
Confirmatory Monte Carlo, production integration, and a superiority claim are
**NO-GO**.

## 11. Statistical-design remediation lock

The executable statistical remediation is documented in the
[SIM-02 Statistical Analysis Plan](VNEXT_SIM_02_STATISTICAL_ANALYSIS_PLAN.md)
and tested by the standalone
[`sim02_joint_power.py`](../../research/pilot/tools/sim02_joint_power.py)
planner. Its machine-readable and rendered planning outputs are
[VNEXT_SIM_02_JOINT_POWER_PLANNING.json](VNEXT_SIM_02_JOINT_POWER_PLANNING.json)
and [VNEXT_SIM_02_JOINT_POWER_PLANNING.md](VNEXT_SIM_02_JOINT_POWER_PLANNING.md).

The primary inferential procedure is now one intersection–union test per
approved region followed by one Holm correction across the fixed R1/R2 joint
claim family. The component bootstrap p-values remain centered at the
predeclared null boundaries, but the planner's finite diagnostics are not a
calibration guarantee. Before confirmatory execution, the implementation must
test boundary, strict-null, alternative, correlated, zero-variance, rare,
small-sample, and shared-case-cluster behavior and retain any failed or
inconclusive diagnostic.

Joint-power planning uses one valid categorical state per mechanism
(`CORRECT`, `INCORRECT`, or `PROTOCOL_FAIL`) and therefore cannot generate
`Y=1` with `R=0`. It reports marginal component power, regional IUT/Holm power,
the probability both R1 and R2 pass, and false regional claims under declared
null and mixed-null scenarios using region-specific tables. Candidate `2,000` pairs per target region is a planning
recommendation under the fixed 500 outer / 250 inner design-stage budget: it
clears the predeclared lower-Monte-Carlo-bound rule in the favorable and
dependence sensitivity cells, while 1,500 is borderline in the strong-positive
cell. This remains `PENDING_OWNER_APPROVAL` and is not a confirmatory sample
size or a B2 success claim.

The complete adversarial DGP contract is
[VNEXT_SIM_02_R3_TREATMENTS.md](VNEXT_SIM_02_R3_TREATMENTS.md). All R3
parameters not explicitly locked by source policy remain
`PENDING_OWNER_APPROVAL`; deterministic fixture vectors are counterexamples,
not calibrated attack probabilities.
