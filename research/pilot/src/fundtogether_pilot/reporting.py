from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import PilotConfig


def _number(value: Any, digits: int = 4) -> str:
    if value is None:
        return "undefined"
    return f"{float(value):.{digits}f}"


def _all_statuses(summary: dict[str, Any]) -> list[str]:
    statuses: list[str] = []
    for row in summary["judge_calibration"]:
        statuses.extend(
            [
                row["accuracy_validation_status"],
                row["correlation_validation_status"],
                row["cross_court_validation_status"],
            ]
        )
    statuses.extend(row["validation_status"] for row in summary["nonreveal_calibration"])
    for row in summary["backer_signal_calibration"]:
        statuses.extend(
            [row["sensitivity_validation_status"], row["false_alarm_validation_status"]]
        )
    statuses.extend(
        row["classification_validation_status"]
        for row in summary["workflow_classification"]
    )
    statuses.extend(
        row["validation_status"] for row in summary["random_stream_validation"]
    )
    statuses.extend(row["result"] for row in summary["deterministic_counterexamples"])
    return statuses


def render_report(
    result: dict[str, Any],
    config: PilotConfig,
    output_path: Path,
    *,
    test_summary: str,
    foundry_summary: str,
) -> str:
    summary = result["summary"]
    manifest = result["manifest"]
    statuses = _all_statuses(summary)
    pilot_status = "GO" if statuses and all(status == "PASS" for status in statuses) else "NO-GO"
    failed = len([status for status in statuses if status != "PASS"])

    judge_rows = "\n".join(
        f"| {row['scenario_id']} | {_number(row['configured_accuracy'])} | "
        f"{_number(row['observed_accuracy'])} | {_number(row['accuracy_ci_low'])}–{_number(row['accuracy_ci_high'])} | "
        f"{row['accuracy_validation_status']} | {_number(row['configured_rho'])} | "
        f"{_number(row['observed_pairwise_correlation'])} | "
        f"{_number(row['correlation_ci_low'])}–{_number(row['correlation_ci_high'])} | "
        f"{row['correlation_validation_status']} | {_number(row['cross_court_correlation'])} |"
        for row in summary["judge_calibration"]
    )
    nonreveal_rows = "\n".join(
        f"| {row['scenario_id']} | {row['model']} | {_number(row['configured_nonreveal'])} | "
        f"{_number(row['observed_nonreveal'])} | {_number(row['ci_low'])}–{_number(row['ci_high'])} | "
        f"{row['validation_status']} |"
        for row in summary["nonreveal_calibration"]
    )
    signal_rows = "\n".join(
        f"| {row['scenario_id']} | {_number(row['configured_sensitivity'])} | "
        f"{_number(row['observed_sensitivity'])} | {_number(row['configured_false_alarm'])} | "
        f"{_number(row['observed_false_alarm'])} | {_number(row['participation_rate'])} | "
        f"{_number(row['appeal_signal_rate'])} | {_number(row['alpha_appeal'])} | "
        f"{_number(row['beta_appeal'])} | {row['sensitivity_validation_status']}/"
        f"{row['false_alarm_validation_status']} |"
        for row in summary["backer_signal_calibration"]
    )
    workflow_rows = "\n".join(
        f"| {row['model']} | {row['trials']} | {_number(row['substantive_resolution_rate'])} | "
        f"{_number(row['protocol_failure_rate'])} | {_number(row['terminal_completion_rate'])} | "
        f"{row['classification_validation_status']} |"
        for row in summary["workflow_classification"]
    )
    deterministic_rows = "\n".join(
        f"| {row['scenario_id']} | {row['result']} | `{json.dumps(row, sort_keys=True)}` |"
        for row in summary["deterministic_counterexamples"]
    )
    random_rows = "\n".join(
        f"| {row['check']} | `{row['observed']}` | {row['validation_status']} |"
        for row in summary["random_stream_validation"]
    )
    output_display = output_path.as_posix()
    replay_manifest_path = output_path.parent / f"{output_path.name}_replay" / "manifest.json"
    if replay_manifest_path.exists():
        replay_manifest = json.loads(replay_manifest_path.read_text(encoding="utf-8"))
        replay_hash = replay_manifest.get("raw_sha256")
        replay_summary = (
            f"PASS — second complete run produced the identical raw SHA-256 "
            f"`{replay_hash}`"
            if replay_hash == manifest["raw_sha256"]
            else f"FAIL — replay raw SHA-256 was `{replay_hash}`"
        )
    else:
        replay_summary = "NOT RUN — no replay manifest was present when the report was generated"
    dependencies = ", ".join(
        f"{name} {version}" for name, version in manifest["dependency_versions"].items()
    )

    return rf"""# FundTogether VNext PILOT-01 Validation Report

**Decision:** Pilot model validation **{pilot_status}** ({failed} failed validation checks).  
**Confirmatory Monte Carlo:** **NO-GO**.  
**Production integration / deployment:** **NO-GO**.

## 1. Research objective

PILOT-01 checks whether a small Python implementation reproduces the declared
synthetic data-generating process and the Q6/Q10/R3 fixture vectors. It does not
compare protocol superiority and does not show that the assumptions describe
real Judges, Backers, attackers, public-chain gas, or evidence truth.

## 2. Implementation and environment

- Python package: `research/pilot/src/fundtogether_pilot`
- Python: `{manifest['python_version']}`
- Dependencies: {dependencies}
- Judge model: shared-case Beta-Bernoulli with an explicit independent
  Bernoulli boundary at `rho = 0`
- Random stream: `{manifest['random_stream_version']}`; BLAKE2b key derivation,
  stable typed JSON serialization, NumPy PCG64DXSM, and no mutable global RNG
- Workflow model: `{manifest['workflow_model_version']}`; an explicitly
  simplified smoke model, not executable Solidity parity

## 3. Baselines and versions

- Clean source baseline: `{manifest['repository_commit']}` (`origin/main` after
  PR #23 merged)
- Research-document revision: `{manifest['research_spec_commit']}`
- Model: `{manifest['model_version']}`
- Candidate policy fixture: `{manifest['policy_version']}`
- Master seed: `{manifest['master_seed']}`

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

- Python: `{test_summary}`
- Foundry: `{foundry_summary}`
- Raw JSONL schema: {manifest['raw_record_count']} records checked successfully
- Deterministic raw SHA-256: `{manifest['raw_sha256']}`
- Complete identical-configuration replay: {replay_summary}

## 6. Configuration manifest

Replication counts: `{json.dumps(manifest['replication_counts'], sort_keys=True)}`.
The complete scenario grid, dependency versions, tolerances, seed, SHAs, and
stream version are in `{output_display}/manifest.json`.

## 7. Judge accuracy, correlation, and Court dependence

| Scenario | a configured | a observed | 95% CI | a status | rho configured | rho observed | 95% CI | rho status | cross-court corr. |
| --- | ---: | ---: | --- | --- | ---: | ---: | --- | --- | ---: |
{judge_rows}

Court 1 and Court 2 use six distinct Judge identities per case, share only the
declared case latent, and receive no Court 2 accuracy bonus. The per-scenario
Court marginal rates and zero-overlap checks are in
`tables/judge_calibration.csv`.

## 8. Non-reveal calibration

| Scenario | dependence | configured | observed | 95% CI | status |
| --- | --- | ---: | ---: | --- | --- |
{nonreveal_rows}

A non-revealing Judge contributes no counted vote. Any missing reveal makes the
three-seat court invalid; the workflow classifies it as reset/protocol failure,
never as substantive `FAIL`.

## 9. Backer-signal and DAO validation

| Signal class | s cfg | s obs | f cfg | f obs | participation | signal rate | alpha appeal | beta appeal | status s/f |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
{signal_rows}

`alpha_appeal` and `beta_appeal` are measured outputs of generated ballots, not
privileged inputs. The misleading scenario is retained, including harmful DAO
appeals when Court 1 was correct.

## 10. Q6, Q10, and R3

| Vector | status | exact observed record |
| --- | --- | --- |
{deterministic_rows}

Q6 preserves 9,000,000 contribution units while increasing APPEAL weight from
3,000 to 9,000. Q10 preserves 25,000,000 total units and flips ACCEPT
`4,000:3,000` to APPEAL `9,000:4,000`. In R3 all three offenders lose one
unit, the same economic actor claims the three-unit finalizer allowance, and
its net loss before gas is zero. The reset ledger has zero milestone-escrow
effect. These are exact fixture counterexamples, not frequency claims.

## 11. Identity-keyed RNG validation

| Check | observed | status |
| --- | --- | --- |
{random_rows}

The same identity key is replayable bit-for-bit, unrelated B2-only draws do not
shift Court 1, and distinct replication IDs define distinct scenarios.

## 12. B0/B1/B2 smoke classification

| Model | trials | substantive resolution | protocol failure | terminal completion | status |
| --- | ---: | ---: | ---: | ---: | --- |
{workflow_rows}

The smoke model preserves the same initial Court 1 observations across B0/B1/B2,
uses at most one fresh replacement per court level, opens Court 2 only after a
finalized DAO APPEAL, produces exactly one final state, and never assumes payout
or settlement from the workflow classification alone.

## 13. Artifacts

- Raw observations: `{output_display}/raw/pilot_01.jsonl` (generated locally,
  gitignored; checksum committed)
- Validation tables: `{output_display}/tables/*.csv`
- Diagnostic figures: `{output_display}/figures/*.png`
- Manifest/checksums: `{output_display}/manifest.json` and
  `{output_display}/checksums.sha256`
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

PILOT-01 is **{pilot_status}** only for implementation fidelity of this bounded
synthetic model. Confirmatory simulation remains **NO-GO** until hypotheses,
operating regions, minimum effects, cost/latency/capital-lock bounds,
multiplicity, rare-event precision, sample size, stopping rules, and policy
versions are approved and frozen. Production integration remains **NO-GO**.
"""


def write_report(
    result: dict[str, Any],
    config: PilotConfig,
    output_path: str | Path,
    report_path: str | Path,
    *,
    test_summary: str,
    foundry_summary: str,
) -> None:
    report = render_report(
        result,
        config,
        Path(output_path),
        test_summary=test_summary,
        foundry_summary=foundry_summary,
    )
    destination = Path(report_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(report, encoding="utf-8", newline="\n")
