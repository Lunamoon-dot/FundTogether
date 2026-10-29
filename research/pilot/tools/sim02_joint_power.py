from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from math import sqrt
from typing import Iterable, Sequence

import numpy as np


STATES = ("CORRECT", "INCORRECT", "PROTOCOL_FAIL")
_STATE_INDEX = {state: index for index, state in enumerate(STATES)}
_CORRECT = np.array([1.0, 0.0, 0.0])
_RESOLVED = np.array([1.0, 1.0, 0.0])


@dataclass(frozen=True)
class ScenarioSpec:
    name: str
    description: str
    b1: tuple[float, float, float]
    b2: tuple[float, float, float]
    coupling: str
    is_null_scenario: bool


@dataclass(frozen=True)
class PlanningConfig:
    planning_reps: int = 500
    bootstrap_reps: int = 250
    sample_sizes: tuple[int, ...] = (1_500, 2_000, 3_000)
    master_seed: int = 20261028
    analysis_version: str = "sim-02-joint-power-v1"
    alpha: float = 0.05
    correctness_margin: float = 0.05
    resolution_margin: float = 0.05
    scenario_names: tuple[str, ...] | None = None


def _validate_distribution(name: str, values: Sequence[float]) -> tuple[float, ...]:
    if len(values) != len(STATES):
        raise ValueError(f"{name} must contain exactly three state probabilities")
    converted = tuple(float(value) for value in values)
    if any(not np.isfinite(value) for value in converted):
        raise ValueError(f"{name} must contain finite probabilities")
    if any(value < -1e-12 for value in converted):
        raise ValueError(f"{name} must contain non-negative probabilities")
    if not np.isclose(sum(converted), 1.0, atol=1e-12):
        raise ValueError(f"{name} must sum to one")
    return converted


def validate_joint_table(table: Sequence[Sequence[float]]) -> None:
    """Validate a B1-by-B2 categorical outcome table."""

    if len(table) != 3 or any(len(row) != 3 for row in table):
        raise ValueError("joint table must be 3 by 3")
    values = tuple(tuple(float(cell) for cell in row) for row in table)
    if any(not np.isfinite(cell) for row in values for cell in row):
        raise ValueError("joint table must contain finite probabilities")
    if any(cell < -1e-12 for row in values for cell in row):
        raise ValueError("joint table cells must be non-negative")
    if not np.isclose(sum(sum(row) for row in values), 1.0, atol=1e-12):
        raise ValueError("joint table must sum to one")
    if any(sum(row) < -1e-12 for row in values):
        raise ValueError("joint table row sums must be non-negative")
    if any(sum(values[row][column] for row in range(3)) < -1e-12 for column in range(3)):
        raise ValueError("joint table column sums must be non-negative")


def table_marginals(
    table: Sequence[Sequence[float]],
) -> tuple[tuple[float, ...], tuple[float, ...]]:
    validate_joint_table(table)
    left = tuple(sum(float(cell) for cell in row) for row in table)
    right = tuple(sum(float(table[row][column]) for row in range(3)) for column in range(3))
    return left, right


def _quantile_coupling(
    left: tuple[float, ...],
    right: tuple[float, ...],
    *,
    left_order: tuple[int, ...],
    right_order: tuple[int, ...],
    reverse: bool,
) -> tuple[tuple[float, ...], ...]:
    """Couple two categorical draws with one shared uniform variate."""

    table = [[0.0 for _ in STATES] for _ in STATES]
    left_start = 0.0
    right_starts: list[float] = []
    cursor = 0.0
    for right_index in right_order:
        right_starts.append(cursor)
        cursor += right[right_index]

    left_start_by_index = [0.0] * len(STATES)
    left_cursor = 0.0
    for left_index in left_order:
        left_start_by_index[left_index] = left_cursor
        left_cursor += left[left_index]

    for left_index in left_order:
        left_probability = left[left_index]
        left_start = left_start_by_index[left_index]
        left_end = left_start + left_probability
        for order_index, right_index in enumerate(right_order):
            right_start = right_starts[order_index]
            right_end = right_start + right[right_index]
            if reverse:
                right_start, right_end = 1.0 - right_end, 1.0 - right_start
            overlap = max(0.0, min(left_end, right_end) - max(left_start, right_start))
            table[left_index][right_index] = overlap
    return tuple(tuple(row) for row in table)


def categorical_joint_table(
    b1: Sequence[float],
    b2: Sequence[float],
    *,
    coupling: str = "independent",
) -> tuple[tuple[float, ...], ...]:
    """Return a feasible joint table for B1/B2 categorical outcomes.

    Categories are CORRECT, INCORRECT, and PROTOCOL_FAIL.  The table therefore
    preserves the logical implication that correctness is a subset of
    substantive resolution for both mechanisms.
    """

    left = _validate_distribution("b1", b1)
    right = _validate_distribution("b2", b2)
    if coupling == "independent":
        table = tuple(tuple(left[row] * right[column] for column in range(3)) for row in range(3))
    elif coupling == "positive":
        table = _quantile_coupling(
            left,
            right,
            left_order=(1, 2, 0),
            right_order=(2, 0, 1),
            reverse=True,
        )
    elif coupling == "unfavorable":
        table = _quantile_coupling(
            left,
            right,
            left_order=(2, 1, 0),
            right_order=(0, 1, 2),
            reverse=True,
        )
    else:
        raise ValueError("coupling must be independent, positive, or unfavorable")
    validate_joint_table(table)
    return table


def paired_contrasts(table: Sequence[Sequence[float]]) -> dict[str, float | None]:
    """Summarize paired resolution/correctness contrasts from a joint table."""

    validate_joint_table(table)
    left, right = table_marginals(table)
    delta_resolution = sum(right[index] * _RESOLVED[index] for index in range(3)) - sum(
        left[index] * _RESOLVED[index] for index in range(3)
    )
    delta_correct = sum(right[index] * _CORRECT[index] for index in range(3)) - sum(
        left[index] * _CORRECT[index] for index in range(3)
    )
    moments: list[tuple[float, float, float]] = []
    for row in range(3):
        for column in range(3):
            probability = float(table[row][column])
            d_resolution = _RESOLVED[column] - _RESOLVED[row]
            d_correct = _CORRECT[column] - _CORRECT[row]
            moments.append((probability, float(d_resolution), float(d_correct)))
    resolution_variance = sum(probability * d_r**2 for probability, d_r, _ in moments) - delta_resolution**2
    correct_variance = sum(probability * d_y**2 for probability, _, d_y in moments) - delta_correct**2
    covariance = sum(probability * d_r * d_y for probability, d_r, d_y in moments) - (
        delta_resolution * delta_correct
    )
    denominator = sqrt(max(0.0, resolution_variance * correct_variance))
    correlation = None if denominator == 0.0 else covariance / denominator
    return {
        "delta_resolution": delta_resolution,
        "delta_correct": delta_correct,
        "variance_resolution": max(0.0, resolution_variance),
        "variance_correct": max(0.0, correct_variance),
        "covariance_contrasts": covariance,
        "correlation_contrasts": correlation,
        "min_cell_probability": min(cell for row in table for cell in row),
    }


def iut_joint_pvalue(p_resolution: float, p_correct: float) -> float:
    """Intersection–union p-value for the two desirable component properties."""

    for name, value in (("p_resolution", p_resolution), ("p_correct", p_correct)):
        if not 0.0 <= value <= 1.0:
            raise ValueError(f"{name} must be in [0, 1]")
    return max(p_resolution, p_correct)


def holm_rejections(p_values: Sequence[float], *, alpha: float = 0.05) -> tuple[bool, ...]:
    """Return Holm step-down rejections in the input order."""

    if not p_values:
        return tuple()
    if not 0.0 < alpha < 1.0:
        raise ValueError("alpha must be in (0, 1)")
    if any(not 0.0 <= value <= 1.0 for value in p_values):
        raise ValueError("p_values must be in [0, 1]")
    ordered = sorted(enumerate(p_values), key=lambda item: (item[1], item[0]))
    rejected = [False] * len(p_values)
    still_reject = True
    for rank, (original_index, p_value) in enumerate(ordered):
        threshold = alpha / (len(p_values) - rank)
        if still_reject and p_value <= threshold:
            rejected[original_index] = True
        else:
            still_reject = False
    return tuple(rejected)


def centered_bootstrap_pvalue(
    differences: Sequence[float],
    null_boundary: float,
    bootstrap_reps: int,
    rng: np.random.Generator,
) -> float:
    """Compute the declared greater-than centered bootstrap p-value."""

    data = np.asarray(tuple(float(value) for value in differences), dtype=float)
    if data.size == 0:
        raise ValueError("differences must not be empty")
    if bootstrap_reps <= 0:
        raise ValueError("bootstrap_reps must be positive")
    if not np.all(np.isfinite(data)):
        raise ValueError("differences must be finite")
    observed = float(np.mean(data))
    values, counts = np.unique(data, return_counts=True)
    bootstrap_counts = rng.multinomial(data.size, counts / data.size, size=bootstrap_reps)
    bootstrap_means = bootstrap_counts @ values / data.size
    null_means = bootstrap_means - observed + null_boundary
    exceedances = int(np.count_nonzero(null_means >= observed - 1e-15))
    return (1 + exceedances) / (bootstrap_reps + 1)


def _seed(master_seed: int, *labels: object) -> int:
    payload = json.dumps([master_seed, *labels], sort_keys=True, separators=(",", ":")).encode()
    digest = hashlib.blake2b(payload, digest_size=16, person=b"FT-SIM02-PLAN").digest()
    return int.from_bytes(digest, "big") % (2**63 - 1)


def _sample_differences(
    table: Sequence[Sequence[float]], sample_size: int, rng: np.random.Generator
) -> tuple[np.ndarray, np.ndarray]:
    flat = np.asarray(table, dtype=float).reshape(-1)
    draws = rng.choice(9, size=sample_size, p=flat)
    left = draws // 3
    right = draws % 3
    return _RESOLVED[right] - _RESOLVED[left], _CORRECT[right] - _CORRECT[left]


def _proportion_interval(successes: int, trials: int) -> tuple[float, float]:
    if trials <= 0:
        raise ValueError("trials must be positive")
    z = 1.959963984540054
    estimate = successes / trials
    denominator = 1.0 + z**2 / trials
    center = (estimate + z**2 / (2.0 * trials)) / denominator
    spread = z * sqrt((estimate * (1.0 - estimate) + z**2 / (4.0 * trials)) / trials) / denominator
    return max(0.0, center - spread), min(1.0, center + spread)


def _scenario_specs() -> tuple[ScenarioSpec, ...]:
    b1 = (0.56, 0.24, 0.20)  # correct=.56, resolution=.80
    return (
        ScenarioSpec(
            "favorable",
            "Meaningful correctness improvement with safe resolution.",
            b1,
            (0.66, 0.19, 0.15),
            "positive",
            False,
        ),
        ScenarioSpec(
            "correctness_boundary",
            "Correctness is exactly at the candidate minimum-effect boundary.",
            b1,
            (0.61, 0.19, 0.20),
            "positive",
            True,
        ),
        ScenarioSpec(
            "resolution_boundary",
            "Resolution is exactly at the candidate non-inferiority boundary.",
            b1,
            (0.56, 0.19, 0.25),
            "positive",
            True,
        ),
        ScenarioSpec(
            "correctness_gain_resolution_loss",
            "Correctness improves while resolution loss exceeds the candidate margin.",
            b1,
            (0.66, 0.04, 0.30),
            "positive",
            False,
        ),
        ScenarioSpec(
            "no_meaningful_correctness_benefit",
            "No correctness or resolution improvement.",
            b1,
            b1,
            "independent",
            True,
        ),
        ScenarioSpec(
            "strong_positive_dependence",
            "Favorable margins with strong feasible positive paired dependence.",
            b1,
            (0.66, 0.19, 0.15),
            "positive",
            False,
        ),
        ScenarioSpec(
            "weak_unfavorable_dependence",
            "Favorable margins with a feasible reverse quantile coupling.",
            b1,
            (0.66, 0.19, 0.15),
            "unfavorable",
            False,
        ),
        ScenarioSpec(
            "scarcity_additional_protocol_failures",
            "B2 adds protocol failures under a scarce Judge supply treatment.",
            b1,
            (0.50, 0.15, 0.35),
            "positive",
            False,
        ),
        ScenarioSpec(
            "joint_null_boundary",
            "Both component nulls are set at their candidate decision boundaries.",
            b1,
            (0.61, 0.14, 0.25),
            "independent",
            True,
        ),
    )


def scenario_specs() -> tuple[ScenarioSpec, ...]:
    return _scenario_specs()


def _simulate_decision(
    table: Sequence[Sequence[float]],
    sample_size: int,
    bootstrap_reps: int,
    alpha: float,
    correctness_margin: float,
    resolution_margin: float,
    master_seed: int,
    scenario_name: str,
    replication: int,
) -> dict[str, bool]:
    p_values: list[float] = []
    component_results: dict[str, bool] = {}
    for region in ("R1", "R2"):
        sample_rng = np.random.default_rng(_seed(master_seed, scenario_name, sample_size, replication, region, "sample"))
        d_resolution, d_correct = _sample_differences(table, sample_size, sample_rng)
        resolution_rng = np.random.default_rng(
            _seed(master_seed, scenario_name, sample_size, replication, region, "bootstrap", "resolution")
        )
        correct_rng = np.random.default_rng(
            _seed(master_seed, scenario_name, sample_size, replication, region, "bootstrap", "correctness")
        )
        p_resolution = centered_bootstrap_pvalue(
            d_resolution, -resolution_margin, bootstrap_reps, resolution_rng
        )
        p_correct = centered_bootstrap_pvalue(d_correct, correctness_margin, bootstrap_reps, correct_rng)
        p_values.append(iut_joint_pvalue(p_resolution, p_correct))
        component_results[f"{region}_resolution"] = p_resolution <= alpha
        component_results[f"{region}_correctness"] = p_correct <= alpha
    joint_rejections = holm_rejections(p_values, alpha=alpha)
    component_results["R1_joint"] = joint_rejections[0]
    component_results["R2_joint"] = joint_rejections[1]
    component_results["global"] = all(joint_rejections)
    component_results["any_regional"] = any(joint_rejections)
    return component_results


def run_planning(config: PlanningConfig = PlanningConfig()) -> dict[str, object]:
    """Run the isolated design-stage joint-power planning analysis."""

    if config.planning_reps <= 0 or config.bootstrap_reps <= 0:
        raise ValueError("planning_reps and bootstrap_reps must be positive")
    if not config.sample_sizes or any(size <= 0 for size in config.sample_sizes):
        raise ValueError("sample_sizes must contain positive values")
    if not 0.0 < config.alpha < 1.0:
        raise ValueError("alpha must be in (0, 1)")
    specs = {spec.name: spec for spec in scenario_specs()}
    selected_names = config.scenario_names or tuple(specs)
    unknown = set(selected_names) - set(specs)
    if unknown:
        raise ValueError(f"unknown scenario names: {sorted(unknown)}")

    scenario_rows: list[dict[str, object]] = []
    result_rows: list[dict[str, object]] = []
    for name in selected_names:
        spec = specs[name]
        table = categorical_joint_table(spec.b1, spec.b2, coupling=spec.coupling)
        contrasts = paired_contrasts(table)
        scenario_rows.append(
            {
                "name": spec.name,
                "description": spec.description,
                "b1_state_probabilities": list(spec.b1),
                "b2_state_probabilities": list(spec.b2),
                "coupling": spec.coupling,
                "is_null_scenario": spec.is_null_scenario,
                "joint_table": [list(row) for row in table],
                "contrasts": contrasts,
            }
        )
        for sample_size in config.sample_sizes:
            keys = (
                "R1_resolution",
                "R2_resolution",
                "R1_correctness",
                "R2_correctness",
                "R1_joint",
                "R2_joint",
                "global",
                "any_regional",
            )
            counts = {key: 0 for key in keys}
            for replication in range(config.planning_reps):
                decision = _simulate_decision(
                    table,
                    sample_size,
                    config.bootstrap_reps,
                    config.alpha,
                    config.correctness_margin,
                    config.resolution_margin,
                    config.master_seed,
                    spec.name,
                    replication,
                )
                for key in keys:
                    counts[key] += int(decision[key])
            rates = {key: counts[key] / config.planning_reps for key in keys}
            interval_keys = ("R1_joint", "R2_joint", "global", "any_regional")
            intervals = {
                key: list(_proportion_interval(counts[key], config.planning_reps)) for key in interval_keys
            }
            result_rows.append(
                {
                    "scenario": spec.name,
                    "sample_size": sample_size,
                    "null_diagnostic": spec.is_null_scenario,
                    "marginal_resolution_power_r1": rates["R1_resolution"],
                    "marginal_resolution_power_r2": rates["R2_resolution"],
                    "marginal_correctness_power_r1": rates["R1_correctness"],
                    "marginal_correctness_power_r2": rates["R2_correctness"],
                    "marginal_resolution_power": (rates["R1_resolution"] + rates["R2_resolution"]) / 2.0,
                    "marginal_correctness_power": (rates["R1_correctness"] + rates["R2_correctness"]) / 2.0,
                    "regional_joint_power_r1": rates["R1_joint"],
                    "regional_joint_power_r2": rates["R2_joint"],
                    "regional_joint_power": (rates["R1_joint"] + rates["R2_joint"]) / 2.0,
                    "global_joint_power": rates["global"],
                    "any_regional_claim_rate": rates["any_regional"],
                    "false_regional_claim_rate": rates["any_regional"] if spec.is_null_scenario else None,
                    "mc_interval_95": intervals,
                    "contrast_correlation": contrasts["correlation_contrasts"],
                    "delta_resolution": contrasts["delta_resolution"],
                    "delta_correct": contrasts["delta_correct"],
                    "protocol_failure_b1": spec.b1[2],
                    "protocol_failure_b2": spec.b2[2],
                }
            )
    reference_scenarios = {
        "favorable",
        "strong_positive_dependence",
        "weak_unfavorable_dependence",
    } & set(selected_names)
    qualified_sizes = []
    if reference_scenarios:
        qualified_sizes = [
            sample_size
            for sample_size in config.sample_sizes
            if all(
                next(
                    row["mc_interval_95"]["global"][0]
                    for row in result_rows
                    if row["scenario"] == scenario and row["sample_size"] == sample_size
                )
                >= 0.80
                for scenario in reference_scenarios
            )
        ]
    return {
        "analysis_label": "DESIGN_STAGE_POWER_ANALYSIS",
        "analysis_version": config.analysis_version,
        "master_seed": config.master_seed,
        "planning_reps": config.planning_reps,
        "bootstrap_reps": config.bootstrap_reps,
        "sample_sizes": list(config.sample_sizes),
        "alpha": config.alpha,
        "correctness_margin": config.correctness_margin,
        "resolution_margin": config.resolution_margin,
        "global_success_rule": "both R1 and R2 joint claims rejected after Holm",
        "sample_size_recommendation": {
            "candidate_sample_size": min(qualified_sizes) if qualified_sizes else None,
            "rule": "smallest candidate whose lower 95% MC bound for global_joint_power is at least 0.80 in favorable, strong-positive, and weak/unfavorable dependence cells",
            "reference_scenarios": sorted(reference_scenarios),
            "owner_approval": "PENDING_OWNER_APPROVAL",
        },
        "scenarios": scenario_rows,
        "results": result_rows,
    }


def render_markdown(result: dict[str, object]) -> str:
    lines = [
        "# SIM-02 joint-power planning evidence",
        "",
        f"**Analysis label:** `{result['analysis_label']}`  ",
        f"**Analysis version:** `{result['analysis_version']}`  ",
        f"**Master seed:** `{result['master_seed']}`  ",
        f"**Planning replications:** `{result['planning_reps']}`; **bootstrap replications:** `{result['bootstrap_reps']}`",
        "",
        "All rows are design-stage planning diagnostics, not substantive FundTogether evidence.",
        "",
        "| Scenario | N pairs | Delta correct | Delta resolution | Contrast rho | Marginal resolution | Marginal correctness | Regional joint | Global both-region | Any regional claim | False claim under null |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in result["results"]:
        false_claim = "—" if row["false_regional_claim_rate"] is None else f"{row['false_regional_claim_rate']:.3f}"
        correlation = "—" if row["contrast_correlation"] is None else f"{row['contrast_correlation']:.3f}"
        lines.append(
            f"| {row['scenario']} | {row['sample_size']} | {row['delta_correct']:.3f} | "
            f"{row['delta_resolution']:.3f} | {correlation} | {row['marginal_resolution_power']:.3f} | "
            f"{row['marginal_correctness_power']:.3f} | {row['regional_joint_power']:.3f} | "
            f"{row['global_joint_power']:.3f} | {row['any_regional_claim_rate']:.3f} | {false_claim} |"
        )
    lines.extend(
        [
            "",
            "`marginal power != joint power`; the primary planning target is the global both-region column.",
            "The null rows estimate false regional claims with finite planning Monte Carlo uncertainty; they do not prove mathematical calibration.",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="SIM-02 joint power planning only")
    parser.add_argument("--format", choices=("json", "markdown"), default="json")
    parser.add_argument("--planning-reps", type=int, default=500)
    parser.add_argument("--bootstrap-reps", type=int, default=250)
    parser.add_argument("--sample-sizes", type=int, nargs="+", default=[1_500, 2_000, 3_000])
    parser.add_argument("--scenario", dest="scenario_names", action="append")
    args = parser.parse_args()
    result = run_planning(
        PlanningConfig(
            planning_reps=args.planning_reps,
            bootstrap_reps=args.bootstrap_reps,
            sample_sizes=tuple(args.sample_sizes),
            scenario_names=tuple(args.scenario_names) if args.scenario_names else None,
        )
    )
    if args.format == "markdown":
        print(render_markdown(result), end="")
    else:
        print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
