from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest


MODULE_PATH = Path(__file__).parents[1] / "tools" / "sim02_joint_power.py"
SPEC = importlib.util.spec_from_file_location("sim02_joint_power", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
sim02_joint_power = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = sim02_joint_power
SPEC.loader.exec_module(sim02_joint_power)


def test_categorical_table_preserves_marginals_and_logical_outcomes() -> None:
    table = sim02_joint_power.categorical_joint_table(
        (0.56, 0.24, 0.20),
        (0.66, 0.19, 0.15),
        coupling="positive",
    )

    sim02_joint_power.validate_joint_table(table)
    left, right = sim02_joint_power.table_marginals(table)
    assert left == pytest.approx((0.56, 0.24, 0.20))
    assert right == pytest.approx((0.66, 0.19, 0.15))
    assert left[0] <= left[0] + left[1]
    assert right[0] <= right[0] + right[1]
    assert set(sim02_joint_power.STATES) == {
        "CORRECT", "INCORRECT", "PROTOCOL_FAIL"
    }


def test_invalid_joint_table_and_marginals_are_rejected() -> None:
    with pytest.raises(ValueError, match="non-negative"):
        sim02_joint_power.validate_joint_table(
            ((0.60, 0.40, 0.01), (0.0, 0.0, 0.0), (0.0, 0.0, -0.01))
        )
    with pytest.raises(ValueError, match="sum"):
        sim02_joint_power.categorical_joint_table(
            (0.60, 0.30, 0.20),
            (0.60, 0.20, 0.20),
        )


def test_contrasts_report_resolution_correctness_and_dependence() -> None:
    table = sim02_joint_power.categorical_joint_table(
        (0.56, 0.24, 0.20),
        (0.66, 0.19, 0.15),
        coupling="positive",
    )
    contrasts = sim02_joint_power.paired_contrasts(table)

    assert contrasts["delta_correct"] == pytest.approx(0.10)
    assert contrasts["delta_resolution"] == pytest.approx(0.05)
    assert contrasts["correlation_contrasts"] is not None
    assert contrasts["min_cell_probability"] >= 0.0


def test_iut_and_holm_are_executable_in_original_order() -> None:
    assert sim02_joint_power.iut_joint_pvalue(0.01, 0.03) == pytest.approx(0.03)
    assert sim02_joint_power.holm_rejections((0.01, 0.06), alpha=0.05) == (True, False)
    assert sim02_joint_power.holm_rejections((0.01, 0.02), alpha=0.05) == (True, True)


def test_bootstrap_handles_boundary_degenerate_and_rare_differences() -> None:
    rng = sim02_joint_power.np.random.default_rng(11)
    assert sim02_joint_power.centered_bootstrap_pvalue([0.0] * 8, 0.0, 32, rng) == pytest.approx(1.0)
    assert sim02_joint_power.centered_bootstrap_pvalue([1.0] * 8, 0.0, 32, rng) == pytest.approx(1 / 33)
    rare = sim02_joint_power.centered_bootstrap_pvalue([0.0] * 31 + [1.0], 0.0, 32, rng)
    assert 0.0 < rare <= 1.0


def test_planning_runner_replays_and_reports_joint_decision_metrics() -> None:
    config = sim02_joint_power.PlanningConfig(
        planning_reps=6,
        bootstrap_reps=16,
        sample_sizes=(12, 16),
        scenario_names=("favorable", "joint_null_boundary"),
    )
    first = sim02_joint_power.run_planning(config)
    second = sim02_joint_power.run_planning(config)

    assert first == second
    assert first["analysis_label"] == "DESIGN_STAGE_POWER_ANALYSIS"
    assert first["results"]
    assert first["sample_size_recommendation"]["owner_approval"] == "PENDING_OWNER_APPROVAL"
    row = first["results"][0]
    assert {
        "marginal_resolution_power_r1",
        "marginal_resolution_power_r2",
        "marginal_correctness_power_r1",
        "marginal_correctness_power_r2",
        "marginal_resolution_power",
        "marginal_correctness_power",
        "regional_joint_power",
        "global_joint_power",
        "any_regional_claim_rate",
        "mc_interval_95",
    } <= row.keys()


def test_output_is_json_serializable_and_null_diagnostic_is_marked() -> None:
    result = sim02_joint_power.run_planning(
        sim02_joint_power.PlanningConfig(
            planning_reps=2,
            bootstrap_reps=8,
            sample_sizes=(10,),
            scenario_names=("joint_null_boundary",),
        )
    )
    json.dumps(result, sort_keys=True)
    assert result["scenarios"][0]["is_null_scenario"] is True
    assert result["results"][0]["null_diagnostic"] is True
    assert "R1_resolution" in result["results"][0]["mc_interval_95"]


def test_planner_uses_region_specific_mixed_nulls_and_margin_derived_boundaries() -> None:
    result = sim02_joint_power.run_planning(
        sim02_joint_power.PlanningConfig(
            planning_reps=3,
            bootstrap_reps=8,
            sample_sizes=(10,),
            correctness_margin=0.10,
            resolution_margin=0.10,
            scenario_names=("mixed_null_boundary",),
        )
    )
    scenario = result["scenarios"][0]
    assert set(scenario["regions"]) == {"R1", "R2"}
    assert scenario["regions"]["R2"]["contrasts"]["delta_correct"] == pytest.approx(0.10)
    assert scenario["regions"]["R2"]["contrasts"]["delta_resolution"] == pytest.approx(-0.10)
    assert result["results"][0]["false_regional_claim_rate"] is not None


def test_planning_rng_uses_declared_blake2_and_pcg64dxsm_family() -> None:
    rng = sim02_joint_power.keyed_rng(20261028, "R1", "case-1")
    assert isinstance(rng.bit_generator, sim02_joint_power.np.random.PCG64DXSM)
    assert sim02_joint_power.planning_seed(20261028, "R1", "case-1") < 2**128
