# FundTogether VNext PILOT-01 Validation Report

**Decision:** Pilot model validation **GO** (0 failed validation checks).  
**Confirmatory Monte Carlo:** **NO-GO**.  
**Production integration / deployment:** **NO-GO**.

## 1. Research objective

PILOT-01 checks whether a small Python implementation reproduces the declared
synthetic data-generating process and the Q6/Q10/R3 fixture vectors. It does not
compare protocol superiority and does not show that the assumptions describe
real Judges, Backers, attackers, public-chain gas, or evidence truth.

## 2. Implementation and environment

- Python package: `research/pilot/src/fundtogether_pilot`
- Python: `3.12.10`
- Dependencies: matplotlib 3.10.3, numpy 2.2.6, pytest 8.4.1, scipy 1.15.3
- Judge model: shared-case Beta-Bernoulli with an explicit independent
  Bernoulli boundary at `rho = 0`
- Random stream: `blake2b-256-numpy-pcg64dxsm-v1`; BLAKE2b key derivation,
  stable typed JSON serialization, NumPy PCG64DXSM, and no mutable global RNG
- Workflow model: `pilot-01-b0-b1-b2-smoke-v1`; an explicitly
  simplified smoke model, not executable Solidity parity

## 3. Baselines and versions

- Clean source baseline: `4ef5bd71645e83609cb98226b94e69b98c3c166e` (`origin/main` after
  PR #23 merged)
- Research-document revision: `58ad19b237758f776418ac64eed09a8c4031bffe`
- Model: `fundtogether-pilot-01-beta-bernoulli-v1`
- Candidate policy fixture: `fundtogether-vnext-v2-pr0-remediation-20261025/pr0_candidate_pending`
- Master seed: `20261027`

CWQ-1, DAO-TEMPORAL-1, CCPS-1, their numeric values, and the broader VNext
policies remain `PROPOSED_PENDING_APPROVAL`. Using them as deterministic test
vectors does not approve runtime economics.

## 4. Mathematical assumptions

For `0 < rho < 1`, the pilot samples one case latent
`P_case ~ Beta(a(1/rho-1), (1-a)(1/rho-1))` and conditions all fresh Court 1
and Court 2 Judge correctness draws on it. At `rho = 0`, Judge correctness is
independent Bernoulli(`a`) and no Beta parameters are evaluated.

Ordinary non-reveal uses independent Judge-case streams. The coordinated
scenario uses one explicit shared attacker-group control. Colluding vote targets
and truth generation are separate. Backers receive only a generated private
signal; signal generation, participation, preference, cast ballot, and finalized
DAO decision are distinct records.

Uncertainty for accuracy, non-reveal, and signal rates uses independent case
clusters. Pairwise Judge correlation uses one fixed Judge pair per independent
case, avoiding pseudo-replication from all within-case pairs. Tolerances were
declared in `configs/pilot_01.json` before execution as the larger of an absolute
floor and four estimated standard errors.

## 5. Tests actually executed

- Python: `36 passed, 0 failed (pytest; 14 third-party deprecation warnings)`
- Foundry: `48 passed, 0 failed, 0 skipped across V2CourtResetFixtureTest and V2BackerDaoCourt2FixtureTest via Docker Foundry; 4 pre-existing Solidity compiler warnings`
- Raw JSONL schema: 64000 records checked successfully
- Deterministic raw SHA-256: `2da6d35ce0425742b31564d642338ad70552aecce67387ceb4a8a2023bd73357`
- Complete identical-configuration replay: PASS — second complete run produced the identical raw SHA-256 `2da6d35ce0425742b31564d642338ad70552aecce67387ceb4a8a2023bd73357`

## 6. Configuration manifest

Replication counts: `{"judge": 6000, "nonreveal": 4000, "signal": 3000, "workflow": 1000}`.
The complete scenario grid, dependency versions, tolerances, seed, SHAs, and
stream version are in `results/pilot_01/manifest.json`.

## 7. Judge accuracy, correlation, and Court dependence

| Scenario | a configured | a observed | 95% CI | a status | rho configured | rho observed | 95% CI | rho status | cross-court corr. |
| --- | ---: | ---: | --- | --- | ---: | ---: | --- | --- | ---: |
| J1 | 0.7000 | 0.6978 | 0.6930–0.7025 | PASS | 0.0000 | 0.0087 | -0.0166–0.0340 | PASS | 0.0217 |
| J2 | 0.7000 | 0.7018 | 0.6961–0.7075 | PASS | 0.1000 | 0.1003 | 0.0752–0.1253 | PASS | 0.1121 |
| J3 | 0.7000 | 0.6906 | 0.6829–0.6982 | PASS | 0.3000 | 0.3212 | 0.2983–0.3437 | PASS | 0.3105 |
| J4 | 0.7000 | 0.6965 | 0.6870–0.7061 | PASS | 0.6000 | 0.6108 | 0.5947–0.6264 | PASS | 0.6008 |
| J5 | 0.5500 | 0.5549 | 0.5467–0.5630 | PASS | 0.3000 | 0.2907 | 0.2674–0.3137 | PASS | 0.3075 |
| J6 | 0.8500 | 0.8509 | 0.8450–0.8567 | PASS | 0.3000 | 0.3113 | 0.2883–0.3340 | PASS | 0.3160 |

Court 1 and Court 2 use six distinct Judge identities per case, share only the
declared case latent, and receive no Court 2 accuracy bonus. The per-scenario
Court marginal rates and zero-overlap checks are in
`tables/judge_calibration.csv`.

## 8. Non-reveal calibration

| Scenario | dependence | configured | observed | 95% CI | status |
| --- | --- | ---: | ---: | --- | --- |
| ordinary_0.00 | independent | 0.0000 | 0.0000 | 0.0000–0.0000 | PASS |
| ordinary_0.05 | independent | 0.0500 | 0.0511 | 0.0483–0.0539 | PASS |
| ordinary_0.20 | independent | 0.2000 | 0.2007 | 0.1956–0.2058 | PASS |
| coordinated_0.20 | shared_group_control | 0.2000 | 0.1983 | 0.1859–0.2106 | PASS |

A non-revealing Judge contributes no counted vote. Any missing reveal makes the
three-seat court invalid; the workflow classifies it as reset/protocol failure,
never as substantive `FAIL`.

## 9. Backer-signal and DAO validation

| Signal class | s cfg | s obs | f cfg | f obs | participation | signal rate | alpha appeal | beta appeal | status s/f |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| informative | 0.8000 | 0.8003 | 0.2000 | 0.1985 | 0.7994 | 0.3574 | 0.9811 | 0.0072 | PASS/PASS |
| non_informative | 0.5000 | 0.4997 | 0.5000 | 0.5019 | 0.7991 | 0.5012 | 0.5126 | 0.5146 | PASS/PASS |
| misleading | 0.2000 | 0.1980 | 0.8000 | 0.7969 | 0.7999 | 0.6424 | 0.0090 | 0.9888 | PASS/PASS |

`alpha_appeal` and `beta_appeal` are measured outputs of generated ballots, not
privileged inputs. The misleading scenario is retained, including harmful DAO
appeals when Court 1 was correct.

## 10. Q6, Q10, and R3

| Vector | status | exact observed record |
| --- | --- | --- |
| Q6 | PASS | `{"accept_weight": 0, "appeal_weight_after": 9000, "appeal_weight_before": 3000, "dao_decision_after": "APPEAL", "dao_decision_before": "APPEAL", "initial_wallet_distribution": [9000000], "result": "PASS", "scenario_id": "Q6", "split_wallet_distribution": [1000000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000], "total_contribution_after": 9000000, "total_contribution_before": 9000000}` |
| Q10 | PASS | `{"accept_weight": 4000, "appeal_weight_after": 9000, "appeal_weight_before": 3000, "dao_decision_after": "APPEAL", "dao_decision_before": "ACCEPT", "initial_wallet_distribution": [16000000, 9000000], "result": "PASS", "scenario_id": "Q10", "split_wallet_distribution": [16000000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000], "total_contribution_after": 25000000, "total_contribution_before": 25000000}` |
| R3 | PASS | `{"compensation_recipient": "FINALIZER", "finalizer_allowance": 3, "gross_slash": 3, "locked_stake_per_judge": 23, "milestone_escrow_effect": 0, "net_attacker_loss_before_gas": 0, "penalties": {"A": 1, "B": 1, "C": 1}, "result": "PASS", "same_actor_controls_judges_and_finalizer": true, "scenario_id": "R3"}` |

Q6 preserves 9,000,000 contribution units while increasing APPEAL weight from
3,000 to 9,000. Q10 preserves 25,000,000 total units and flips ACCEPT
`4,000:3,000` to APPEAL `9,000:4,000`. In R3 all three offenders lose one
unit, the same economic actor claims the three-unit finalizer allowance, and
its net loss before gas is zero. The reset ledger has zero milestone-escrow
effect. These are exact fixture counterexamples, not frequency claims.

## 11. Identity-keyed RNG validation

| Check | observed | status |
| --- | --- | --- |
| bit_for_bit_replay | `True` | PASS |
| unrelated_draw_order_independence | `True` | PASS |
| unrelated_domain_correlation | `0.008175489482494944` | PASS |
| replication_identity_distinctness | `100` | PASS |

The same identity key is replayable bit-for-bit, unrelated B2-only draws do not
shift Court 1, and distinct replication IDs define distinct scenarios.

## 12. B0/B1/B2 smoke classification

| Model | trials | substantive resolution | protocol failure | terminal completion | status |
| --- | ---: | ---: | ---: | ---: | --- |
| B0 | 1000 | 0.5270 | 0.4730 | 1.0000 | PASS |
| B1 | 1000 | 0.7700 | 0.2300 | 1.0000 | PASS |
| B2 | 1000 | 0.6660 | 0.3340 | 1.0000 | PASS |

The smoke model preserves the same initial Court 1 observations across B0/B1/B2,
uses at most one fresh replacement per court level, opens Court 2 only after a
finalized DAO APPEAL, produces exactly one final state, and never assumes payout
or settlement from the workflow classification alone.

## 13. Artifacts

- Raw observations: `results/pilot_01/raw/pilot_01.jsonl` (generated locally,
  gitignored; checksum committed)
- Validation tables: `results/pilot_01/tables/*.csv`
- Diagnostic figures: `results/pilot_01/figures/*.png`
- Manifest/checksums: `results/pilot_01/manifest.json` and
  `results/pilot_01/checksums.sha256`
- Primary-source audit: `research/pilot/SOURCE_AUDIT.md`

## 14. Deviations, defects, and limitations

No theoretical parameter was changed after inspecting results. The first Python
test run had 33 passes and one integration failure because the environment
manifest attempted to query non-runtime `setuptools` metadata that build
isolation had not installed. The lookup was removed; the final complete rerun
passed 36/36. No stochastic calibration check failed or was retuned. Any failed check
above makes the pilot decision NO-GO and remains visible in the committed tables.

This pilot does not model evidence storage, production randomness, chain
indexing, gas, real transfers, unbounded populations, human identity, or real
behavior. The B0/B1/B2 state logic is deliberately smaller than the Foundry
fixtures. Results are bounded to declared finite synthetic assumptions and do
not validate CWQ-1 fairness, CCPS-1 deterrence, Court 2 benefit, contract safety,
or production readiness.

## 15. Reproduction

```powershell
cd research/pilot
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -e ".[test]"
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\fundtogether-pilot.exe run --config configs/pilot_01.json --output results/pilot_01
.\.venv\Scripts\fundtogether-pilot.exe verify-schema results/pilot_01/raw/pilot_01.jsonl
```

Run the same `run` command into `results/pilot_01_replay` and compare the two
raw SHA-256 values. Exact equality is required.

## 16. Pilot decision and next phase

PILOT-01 is **GO** only for implementation fidelity of this bounded
synthetic model. Confirmatory simulation remains **NO-GO** until hypotheses,
operating regions, minimum effects, cost/latency/capital-lock bounds,
multiplicity, rare-event precision, sample size, stopping rules, and policy
versions are approved and frozen. Production integration remains **NO-GO**.
