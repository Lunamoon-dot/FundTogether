from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from math import ceil, sqrt
from statistics import NormalDist
from typing import Iterable


@dataclass(frozen=True)
class PlanningRow:
    endpoint: str
    scenario: str
    p_b1: float
    p_b2: float
    null_boundary: float
    planned_delta: float
    separation: float
    pair_correlation: float
    variance_difference: float
    one_sided_alpha: float
    target_power: float
    required_pairs: int


def _probability(name: str, value: float) -> None:
    if not 0.0 <= value <= 1.0:
        raise ValueError(f"{name} must be in [0, 1]")


def _pair_correlation(value: float) -> None:
    if not 0.0 <= value <= 1.0:
        raise ValueError("pair_correlation must be in [0, 1]")


def paired_binary_variance(
    p_left: float,
    p_right: float,
    pair_correlation: float = 0.0,
) -> float:
    """Return Var(Y_right - Y_left) for a positively coupled binary pair.

    The correlation is a planning input, not an estimate of SIM-01 or a claim
    about the later simulator. Bernoulli feasibility is checked explicitly.
    """

    _probability("p_left", p_left)
    _probability("p_right", p_right)
    _pair_correlation(pair_correlation)
    left_variance = p_left * (1.0 - p_left)
    right_variance = p_right * (1.0 - p_right)
    covariance = pair_correlation * sqrt(left_variance * right_variance)
    joint_one = p_left * p_right + covariance
    joint = (
        joint_one,
        p_left - joint_one,
        p_right - joint_one,
        1.0 - p_left - p_right + joint_one,
    )
    if min(joint) < -1e-12:
        raise ValueError("pair_correlation is infeasible for the Bernoulli marginals")
    return max(0.0, left_variance + right_variance - 2.0 * covariance)


def required_pairs(
    separation: float,
    variance_difference: float,
    *,
    one_sided_alpha: float = 0.025,
    target_power: float = 0.80,
) -> int:
    """Normal-approximation planning count for a paired mean difference."""

    if separation <= 0.0:
        raise ValueError("separation must be positive")
    if variance_difference < 0.0:
        raise ValueError("variance_difference must be non-negative")
    if not 0.0 < one_sided_alpha < 1.0:
        raise ValueError("one_sided_alpha must be in (0, 1)")
    if not 0.0 < target_power < 1.0:
        raise ValueError("target_power must be in (0, 1)")
    critical = NormalDist().inv_cdf(1.0 - one_sided_alpha)
    power_quantile = NormalDist().inv_cdf(target_power)
    count = ((critical + power_quantile) ** 2 * variance_difference) / (separation**2)
    return max(1, ceil(count))


def planning_rows(
    *,
    correctness_margin: float = 0.05,
    planned_correctness_delta: float = 0.10,
    resolution_margin: float = 0.05,
    planned_resolution_delta: float = 0.0,
    one_sided_alpha: float = 0.025,
    target_power: float = 0.80,
    pair_correlations: Iterable[float] = (0.0, 0.25, 0.50),
) -> tuple[PlanningRow, ...]:
    """Return the preregistered sensitivity grid used in the SAP."""

    scenarios = (
        ("correctness_low", "correctness", 0.55, planned_correctness_delta, correctness_margin),
        ("correctness_mid", "correctness", 0.70, planned_correctness_delta, correctness_margin),
        ("correctness_high", "correctness", 0.85, planned_correctness_delta, correctness_margin),
        ("resolution_low", "resolution", 0.70, planned_resolution_delta, -resolution_margin),
        ("resolution_mid", "resolution", 0.85, planned_resolution_delta, -resolution_margin),
        ("resolution_high", "resolution", 0.95, planned_resolution_delta, -resolution_margin),
    )
    rows: list[PlanningRow] = []
    for scenario, endpoint, p_b1, planned_delta, null_boundary in scenarios:
        p_b2 = p_b1 + planned_delta
        separation = planned_delta - null_boundary
        for correlation in pair_correlations:
            variance = paired_binary_variance(p_b1, p_b2, correlation)
            rows.append(
                PlanningRow(
                    endpoint=endpoint,
                    scenario=scenario,
                    p_b1=p_b1,
                    p_b2=p_b2,
                    null_boundary=null_boundary,
                    planned_delta=planned_delta,
                    separation=separation,
                    pair_correlation=correlation,
                    variance_difference=variance,
                    one_sided_alpha=one_sided_alpha,
                    target_power=target_power,
                    required_pairs=required_pairs(
                        separation,
                        variance,
                        one_sided_alpha=one_sided_alpha,
                        target_power=target_power,
                    ),
                )
            )
    return tuple(rows)


def render_markdown(rows: Iterable[PlanningRow]) -> str:
    lines = [
        "| Endpoint | Scenario | p(B1) | p(B2) | Null | Planned delta | Separation | Pair rho | Var(D) | Required pairs |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in rows:
        lines.append(
            f"| {row.endpoint} | {row.scenario} | {row.p_b1:.2f} | "
            f"{row.p_b2:.2f} | {row.null_boundary:.2f} | {row.planned_delta:.2f} | "
            f"{row.separation:.2f} | {row.pair_correlation:.2f} | "
            f"{row.variance_difference:.6f} | {row.required_pairs} |"
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="SIM-02 analytical power planning only")
    parser.add_argument("--format", choices=("json", "markdown"), default="json")
    args = parser.parse_args()
    rows = planning_rows()
    if args.format == "markdown":
        print(render_markdown(rows))
    else:
        print(json.dumps([asdict(row) for row in rows], indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
