# FundTogether VNext SIM-01 Paired Comparative Simulation Foundation

Status: exploratory engineering diagnostic only. This report is not a
confirmatory result, a protocol-superiority claim, a production-readiness
claim, or evidence about real crowdfunding behavior.

## Scope and decision

SIM-01 establishes a reproducible paired B0/B1/B2 simulation foundation.
Each B0, B1, and B2 record for a treatment is generated from the same immutable
base case. B2's DAO result is generated from private signals, participation,
eligibility, integer square-root wallet weights, actual ballots, and CWQ-1
aggregation. A DAO coinflip is not used by the comparative runner.

The implementation gate is **PASS for the exploratory foundation**. The
scientific readiness gate is **NO-GO for confirmatory superiority testing**:
the sample is deliberately small, policy values remain synthetic/pending, and
the observed results include unfavorable B2 outcomes that must be retained.

## Source and specification revisions

| Item | Revision |
| --- | --- |
| Repository baseline / `origin/main` after PR #24 | `1b3fc71bf0e714afc2d7a9a36f243523b3ccd0ae` |
| PILOT-01 source commit | `9d085737e9da342c8e26086158e28199bd9fe03e` |
| Research specification revision | `58ad19b237758f776418ac64eed09a8c4031bffe` |
| V2 policy file revision | `d1b3b5fcfda8caa3fd83f40a32418772cce8b83b` |
| SIM-01 model version | `fundtogether-sim-01-paired-v1` |
| SIM-01 workflow version | `sim-01-b0-b1-b2-integrated-dao-v1` |
| Raw schema | `sim-01-comparative-raw-v1` |

The implementation branch is `codex/vnext-sim-01-paired-foundation`. No
Solidity, Foundry, NestJS, React, PostgreSQL, or indexer files were changed.

## Configuration

The committed configuration is
[`sim_01_exploratory.json`](../../research/pilot/configs/sim_01_exploratory.json).
It uses:

- master seed `20261027`, NumPy PCG64DXSM with identity-keyed BLAKE2b-256;
- 8 cells: 2 Judge-pool levels (`large=9`, `constrained=3`) × 2 shared-case
  correlation levels (`rho=0.00`, `0.30`) × 2 non-reveal levels (`0.00`,
  `0.20`);
- 32 paired base replications per cell, 3 signal treatments, and B0/B1/B2;
- Judge accuracy `0.70`, backer participation probability `0.80`, and 20
  backer wallets per base case;
- informative `(sensitivity=0.80, false_alarm=0.20)`, non-informative
  `(0.50, 0.50)`, and misleading `(0.20, 0.80)` signals;
- `wallet_weight = floor_sqrt(snapshot_contribution)`, 20% CWQ-1
  participation threshold, inclusive threshold equality, ties and empty
  electorates resolving to `ACCEPT`;
- no attacker capital, strategic abstention, collusion, contribution
  splitting, arbitrary gas values, latency distributions, or monetary cost
  model.

The run contains 8 × 32 × 3 × 3 = **2,304** raw records. The raw JSONL is
intentionally ignored by Git; the generated local copy is
`research/pilot/results/sim_01/raw/sim_01.jsonl`.

## Pairing implementation

`scenarios.py` creates one versioned `BaseScenario` before mechanism or signal
treatment branching. It contains truth, the optional shared-case latent,
Judge universe/stake/control state, backer population and contribution
snapshot, attacker capital, and potential Judge observations. Base-case
identity excludes signal treatment labels.

The initial Court 1 selection uses one keyed identity and is reused by B0, B1,
and B2. B1 replacement and B2 Court 2 use fresh keyed selection identities,
while all Judge correctness and non-reveal behavior comes from the same
potential Judge-by-case map. Court 2 has no accuracy bonus. Shared Backer
signal and participation uniforms are keyed by base case and Backer; signal
treatments apply different thresholds to the same underlying draws.

This is an abstract uniform sampler, not a production randomness mechanism.
The simulation also deliberately models the pending fixture rule that a Judge
who is a Backer may vote as a Backer, while Court 1 assignees are excluded
from the frozen DAO snapshot and Court 2 excludes all actual DAO voters and
the Creator.

## F1, F2, and F3 resolution

### F1 — incorrect signal pairing

The comparative path never keys truth, shared difficulty, Judge behavior,
Court 1 selection, contribution ownership, or participation by signal class.
Signal classes share a `base_case_id`; B0/B1 records are repeated as paired
counterfactual controls for each signal treatment.

### F2 — artificial B2 coinflip

The SIM-01 B2 path requires a valid Court 1, generates private Backer signals,
applies participation and eligibility, casts one ballot per eligible wallet,
and calls the existing `BackerDao.finalize()` implementation. Court 2 opens
only after a finalized `APPEAL`. The legacy PILOT-01 smoke workflow still has
its explicitly historical coinflip, but it is not imported or called by the
comparative runner.

### F3 — weak JSONL validation

`comparative_schema.py` performs typed validation for fields, enums, nullable
values, nested wallet/backer records, unique experimental identity, final-state
consistency, Court/Judge exclusions, non-negative capital, DAO applicability,
and reward conservation. `PROTOCOL_FAIL` cannot carry a substantive verdict;
substantive states require a valid final verdict; and null is used when a
quantity is not modeled rather than being confused with observed zero.
PILOT-01 keeps its historical validator and schema meaning unchanged.

## Integrated workflow

```text
base case → shared Court 1 assignment → commit/reveal validity abstraction
          → bounded Court 1 reset on invalidity
          → valid Court 1 → private signals → participation/eligibility
          → actual ballots → CWQ-1 ACCEPT/APPEAL
              ├─ ACCEPT → finalize Court 1
              └─ APPEAL → excluded Court 2 → bounded Court 2 reset
                              → substantive result or PROTOCOL_FAIL
```

Insufficient Judge supply and non-reveal invalidity have separate failure
reasons. A constrained pool is not expanded silently. Valid Court rewards are
recorded exactly once per valid Court and are not labelled as gas cost.

## Validation evidence

The Python suite completed with **42 passed, 14 dependency warnings**. This
includes the original 36 PILOT-01 tests and new tests for:

- shared base truth/latent/participation and order independence;
- actual DAO ballot reconstruction and B2 gating;
- Court 1 equivalence across B0/B1/B2;
- Court 2 Judge and DAO-voter exclusions;
- constrained-pool exhaustion;
- malformed key-complete JSONL records and duplicate identities;
- bit-for-bit comparative replay.

The full legacy PILOT-01 runner was also executed in a temporary directory,
without changing committed PILOT-01 results:

```text
raw records: 64,000
legacy schema: PASS
legacy raw SHA-256: 2da6d35ce0425742b31564d642338ad70552aecce67387ceb4a8a2023bd73357
```

SIM-01 typed validation reports 2,304 records and `PASS`.

## Analytical sanity checks

For the applicable large-pool, `rho=0` cells, ordinary independent non-reveal
uses `q=(1-p)^3` for B0 and `1-(1-q)^2` for B1. The predeclared exploratory
tolerance is `0.20`; these checks are diagnostics, not fitted parameters or
confirmatory tests.

| Model | Non-reveal | Expected | Observed | Absolute error |
| --- | ---: | ---: | ---: | ---: |
| B0 | 0.00 | 1.000 | 1.000 | 0.000 |
| B1 | 0.00 | 1.000 | 1.000 | 0.000 |
| B0 | 0.20 | 0.512 | 0.625 | 0.113 |
| B1 | 0.20 | 0.762 | 0.781 | 0.019 |

All four checks passed the declared exploratory tolerance. The check is not
applied to correlated Judge behavior or constrained-pool exhaustion.

## Exploratory paired results

The committed tables are:

- [`scenario_summary.csv`](../../research/pilot/results/sim_01/tables/scenario_summary.csv)
- [`paired_comparisons.csv`](../../research/pilot/results/sim_01/tables/paired_comparisons.csv)
- [`diagnostics.csv`](../../research/pilot/results/sim_01/tables/diagnostics.csv)

For the large pool, `rho=0.30`, and zero non-reveal cell:

| Signal | Model | Substantive resolution | All-trial correct substantive | Protocol failure | DAO appeal | Beneficial reversal | Harmful reversal |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Informative | B0 | 1.000 | 0.594 | 0.000 | n/a | n/a | n/a |
| Informative | B1 | 1.000 | 0.594 | 0.000 | n/a | n/a | n/a |
| Informative | B2 | 0.625 | 0.625 | 0.375 | 0.406 | 0.077 | 0.000 |
| Non-informative | B0 | 1.000 | 0.594 | 0.000 | n/a | n/a | n/a |
| Non-informative | B1 | 1.000 | 0.594 | 0.000 | n/a | n/a | n/a |
| Non-informative | B2 | 0.438 | 0.250 | 0.563 | 0.594 | 0.053 | 0.632 |
| Misleading | B0 | 1.000 | 0.594 | 0.000 | n/a | n/a | n/a |
| Misleading | B1 | 1.000 | 0.594 | 0.000 | n/a | n/a | n/a |
| Misleading | B2 | 0.375 | 0.000 | 0.625 | 0.625 | 0.000 | 0.950 |

These are finite exploratory rates, not estimates of deployment behavior. They
show why the simulator is not engineered to favor B2: misleading signals
produce a high harmful-reversal rate, while the large-pool B2 cell also has
Court 2 protocol failures caused by the declared conflict exclusions.

The deliberately constrained pool (`judge_count=3`, `rho=0`, non-reveal
`0.20`) retained Court 1 reset exhaustion. For informative, non-informative,
and misleading B2, protocol-failure rates were `0.594`, `0.719`, and `0.844`;
the corresponding Court 2 exhaustion rates were `0.156`, `0.281`, and `0.406`.
No additional Judge identity was synthesized.

## Reproducibility and checksums

The identical second execution was written under the ignored local directory
`research/pilot/results/sim_01_replay/` and matched the primary raw hash:

```text
primary/replay raw SHA-256:
3808dd7109196d102ac93034e6f686996f80415e493f46068805d2e5b1a87e49
```

The committed manifest and all bounded table/figure checksums are in
[`checksums.sha256`](../../research/pilot/results/sim_01/checksums.sha256).
Dependency versions were Python 3.12.10, NumPy 2.2.6, SciPy 1.15.3,
Matplotlib 3.10.3, and pytest 8.4.1.

## Known mismatches and limitations

- The workflow abstracts commit/reveal timing and models ordinary non-reveal;
  it does not claim exact Solidity execution parity.
- Judge selection is a deterministic identity-keyed abstract uniform sampler,
  not deployable randomness or a liveness proof for a permissionless registry.
- CWQ-1, DAO-TEMPORAL-1, Court Reset, reward/slashing, evidence availability,
  no-quorum, and other policy values remain synthetic or pending approval.
- There is no gas, latency, monetary cost, physical fulfilment, real token, or
  live-chain model.
- The neutral primary treatment does not silently enable strategic abstention,
  collusion, contribution splitting, or attacker control; those require
  separate preregistered treatments.
- A Judge/backer overlap is included to exercise the declared conflict rules,
  not to estimate real wallet-role overlap.
- The sample has 32 paired replications per cell. No confirmatory p-values,
  superiority intervals, seed search, or favorable-scenario filtering was
  performed.

## SIM-02 readiness

SIM-01 is ready to support a separately approved SIM-02 design review, not a
confirmatory run. Before SIM-02, freeze the policy manifest and estimands,
pre-register clustering and interval procedures, decide whether strategic and
attacker treatments are primary or sensitivity analyses, and reconcile the
Python workflow with versioned Foundry/contract semantics. Do not reuse this
exploratory raw output as confirmatory evidence unless that reuse is
pre-registered before inspection.
