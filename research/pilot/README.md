# FundTogether VNext PILOT-01

This package validates the declared synthetic generator before any comparative
Monte Carlo study. It is not evidence that VNext is superior, empirically
realistic, production-ready, or safe for real funds.

## Scope

- identity-keyed BLAKE2b/PCG64DXSM random streams;
- shared-case Beta-Bernoulli Judge correctness and fresh-court dependence;
- independent and explicitly coordinated non-reveal;
- private Backer signals, participation, preferences, ballots, and CWQ-1;
- exact Q6/Q10 wallet-splitting and CCPS-1 R3 arithmetic;
- minimal, versioned B0/B1/B2 outcome-classification smoke model;
- deterministic JSONL, summary tables, checksums, and diagnostic figures.

The pending PR0 candidate values are fixture inputs only. This code does not
modify or replace contracts, Foundry fixtures, runtime policy, the backend, the
frontend, the indexer, deployment state, or financial custody.

## Reproduce

From `research/pilot` on Python 3.11 or newer:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -e ".[test]"
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\fundtogether-pilot.exe run `
  --config configs/pilot_01.json `
  --output results/pilot_01
.\.venv\Scripts\fundtogether-pilot.exe verify-schema `
  results/pilot_01/raw/pilot_01.jsonl
```

For exact replay, run into `results/pilot_01_replay` and compare the raw hashes
printed by the CLI. Raw JSONL is intentionally gitignored; its SHA-256 and the
bounded generated tables and figures are committed.

See `SOURCE_AUDIT.md` for the exact repository sources and
`docs/research/VNEXT_PILOT_01_VALIDATION_REPORT.md` for executed results.

## Reproduce SIM-01

SIM-01 is a separate paired exploratory runner. It does not replace the
PILOT-01 validation path:

```powershell
.\.venv\Scripts\fundtogether-pilot.exe run-sim01 `
  --config configs/sim_01_exploratory.json `
  --output results/sim_01
.\.venv\Scripts\fundtogether-pilot.exe verify-sim01-schema `
  results/sim_01/raw/sim_01.jsonl
```

The raw JSONL is ignored by Git; `manifest.json`, `checksums.sha256`, tables,
and figures are the bounded committed artifacts. The SIM-01 report is
`docs/research/VNEXT_SIM_01_FOUNDATION_REPORT.md`.
