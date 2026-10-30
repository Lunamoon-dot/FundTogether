from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest


MODULE_PATH = Path(__file__).parents[1] / "tools" / "sim02_power.py"
SPEC = importlib.util.spec_from_file_location("sim02_power", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
sim02_power = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = sim02_power
SPEC.loader.exec_module(sim02_power)


def test_paired_binary_variance_matches_independent_sum() -> None:
    result = sim02_power.paired_binary_variance(0.55, 0.60, 0.0)
    assert result == pytest.approx(0.55 * 0.45 + 0.60 * 0.40)


def test_positive_pairing_reduces_planning_variance() -> None:
    independent = sim02_power.paired_binary_variance(0.55, 0.60, 0.0)
    coupled = sim02_power.paired_binary_variance(0.55, 0.60, 0.50)
    assert coupled < independent


def test_infeasible_bernoulli_pairing_is_rejected() -> None:
    with pytest.raises(ValueError, match="infeasible"):
        sim02_power.paired_binary_variance(0.10, 0.90, 1.0)


def test_invalid_planning_inputs_are_rejected() -> None:
    with pytest.raises(ValueError, match="separation"):
        sim02_power.required_pairs(0.0, 0.1)
    with pytest.raises(ValueError, match="one_sided_alpha"):
        sim02_power.required_pairs(0.05, 0.1, one_sided_alpha=0.0)
    with pytest.raises(ValueError, match="p_left"):
        sim02_power.paired_binary_variance(-0.1, 0.5)


def test_required_pairs_is_positive_and_ceil_based() -> None:
    result = sim02_power.required_pairs(0.05, 0.4875)
    assert result == 1531


def test_planning_grid_contains_six_scenarios_and_three_correlations() -> None:
    rows = sim02_power.planning_rows()
    assert len(rows) == 18
    assert [row.required_pairs for row in rows] == [
        1492, 1119, 747,
        1162, 874, 587,
        550, 428, 306,
        1319, 989, 660,
        801, 601, 401,
        299, 224, 150,
    ]
    assert max(row.required_pairs for row in rows) == 1492
    assert {row.planned_delta for row in rows if row.endpoint == "correctness"} == {0.10}
    assert {row.separation for row in rows} == {0.05}
    assert {row.endpoint for row in rows} == {"correctness", "resolution"}


def test_markdown_render_includes_null_and_separation_columns() -> None:
    rendered = sim02_power.render_markdown(sim02_power.planning_rows())
    assert "| Null | Planned delta | Separation |" in rendered
    assert "| correctness | correctness_low | 0.55 | 0.65 | 0.05 | 0.10 | 0.05 |" in rendered
