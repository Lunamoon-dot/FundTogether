import json
from pathlib import Path

from fundtogether_pilot.comparative import _court1_attempts, run_comparative
from fundtogether_pilot.config import load_comparative_config
from fundtogether_pilot.random_streams import KeyedRandom
from fundtogether_pilot.scenarios import generate_base_scenario


def _base(overlap: float):
    return generate_base_scenario(
        KeyedRandom(20261027),
        replication_id=7,
        base_case_id="overlap-pair",
        judge_pool_size=9,
        backers_per_case=20,
        judge_accuracy=0.70,
        rho=0.30,
        nonreveal_probability=0.20,
        creator_id="creator",
        judge_backer_overlap_ratio=overlap,
    )


def test_overlap_rounding_and_full_overlap_semantics() -> None:
    zero = _base(0.0)
    partial_quarter = _base(0.25)
    partial_half = _base(0.50)
    full = _base(1.0)

    assert zero.overlap_judge_count == 0
    assert partial_quarter.overlap_judge_count == 2
    assert partial_half.overlap_judge_count == 5
    assert full.overlap_judge_count == 9
    assert zero.judge_backer_overlap_judges == ()
    assert full.judge_backer_overlap_judges == tuple(f"judge-{index:03d}" for index in range(9))
    assert set(full.judge_backer_overlap_judges) == set(full.backer_population[:9])
    assert sum(wallet.contribution for wallet in zero.contribution_snapshot) == sum(
        wallet.contribution for wallet in full.contribution_snapshot
    )


def test_overlap_does_not_resample_case_judges_or_initial_court_selection() -> None:
    zero = _base(0.0)
    full = _base(1.0)

    assert zero.ground_truth == full.ground_truth
    assert zero.case_latent == full.case_latent
    assert zero.potential_judge_behaviors == full.potential_judge_behaviors
    assert _court1_attempts(KeyedRandom(20261027), zero) == _court1_attempts(KeyedRandom(20261027), full)


def test_remediation_records_overlap_and_court2_eligibility_accounting(tmp_path: Path) -> None:
    root = Path(__file__).parents[1]
    config = load_comparative_config(root / "configs" / "sim_01_overlap_remediation.json")
    values = dict(config.values)
    values["replications_per_cell"] = 2
    values["judge_pool_levels"] = [{"pool_id": "large", "judge_count": 9}]
    values["rho_levels"] = [0.0]
    values["nonreveal_probabilities"] = [0.0]
    values["signal_scenarios"] = [
        {"treatment_id": "informative", "sensitivity": 0.80, "false_alarm": 0.20}
    ]
    result = run_comparative(type(config)(values), tmp_path / "remediation")
    raw = tmp_path / "remediation" / "raw" / "sim_01.jsonl"
    records = [json.loads(line) for line in raw.read_text(encoding="utf-8").splitlines()]

    assert result["manifest"]["raw_record_count"] == 2 * 4 * 1 * 3
    assert {record["overlap_judge_count"] for record in records} == {0, 2, 5, 9}
    assert all(record["backer_total_contribution"] == sum(item["contribution"] for item in record["contribution_snapshot"]) for record in records)
    for record in records:
        if record["court2_opened"]:
            court2_history = set(record["court2_judges"]) | set(record["court2_reset_judges"])
            assert not court2_history & (
                set(record["court1_initial_judges"]) | set(record["court1_reset_judges"])
            )
            assert not court2_history & set(record["dao_voters"])
            assert record["court2_eligible_judges_after_dao"] <= record["court2_eligible_judges_before_dao"]
            assert record["court2_assignment_attempted"]
