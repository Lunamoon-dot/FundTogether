import copy
import json
import math
from pathlib import Path

import pytest

from fundtogether_pilot.comparative import run_comparative
from fundtogether_pilot.comparative_schema import (
    ComparativeSchemaError,
    validate_comparative_jsonl_schema,
    validate_comparative_record,
)
from fundtogether_pilot.config import load_comparative_config
from fundtogether_pilot.random_streams import KeyedRandom
from fundtogether_pilot.scenarios import (
    SignalTreatment,
    generate_backer_observations,
    generate_base_scenario,
    shared_signal_draw,
)


def _config() -> object:
    root = Path(__file__).parents[1]
    return load_comparative_config(root / "configs" / "sim_01_exploratory.json")


def _records(tmp_path: Path, replications: int = 3) -> list[dict[str, object]]:
    config = _config()
    values = dict(config.values)
    values["replications_per_cell"] = replications
    result = run_comparative(type(config)(values), tmp_path / "sim")
    raw = tmp_path / "sim" / "raw" / "sim_01.jsonl"
    assert result["manifest"]["raw_record_count"] == sum(1 for _ in raw.open(encoding="utf-8"))
    return [json.loads(line) for line in raw.read_text(encoding="utf-8").splitlines()]


def test_signal_treatments_share_case_latent_and_participation_draws() -> None:
    random = KeyedRandom(20261027)
    base = generate_base_scenario(
        random,
        replication_id=0,
        base_case_id="paired-case",
        judge_pool_size=9,
        backers_per_case=20,
        judge_accuracy=0.70,
        rho=0.30,
        nonreveal_probability=0.0,
        creator_id="creator",
    )
    informative = generate_backer_observations(
        random,
        base,
        SignalTreatment("informative", 0.80, 0.20),
        court_incorrect=False,
        participation_probability=0.80,
    )
    misleading = generate_backer_observations(
        random,
        base,
        SignalTreatment("misleading", 0.20, 0.80),
        court_incorrect=False,
        participation_probability=0.80,
    )
    assert base.ground_truth == base.case.truth
    assert base.case_latent == base.case.shared_probability
    assert [item["participated"] for item in informative] == [item["participated"] for item in misleading]
    expected_informative = [
        shared_signal_draw(
            random,
            replication_id=base.replication_id,
            base_case_id=base.base_case_id,
            backer_id=backer_id,
        ) < 0.20
        for backer_id in base.backer_population
    ]
    assert [item["private_signal"] for item in informative] == expected_informative


def test_base_generation_is_independent_of_signal_iteration_order() -> None:
    kwargs = dict(
        replication_id=4,
        base_case_id="stable-base",
        judge_pool_size=9,
        backers_per_case=20,
        judge_accuracy=0.70,
        rho=0.30,
        nonreveal_probability=0.20,
        creator_id="creator",
    )
    first = generate_base_scenario(KeyedRandom(9), **kwargs)
    second = generate_base_scenario(KeyedRandom(9), **kwargs)
    assert first == second
    assert tuple(first.potential_behaviors) == tuple(second.potential_behaviors)


def test_comparative_baselines_are_paired_and_b2_uses_ballots(tmp_path: Path) -> None:
    records = _records(tmp_path, replications=2)
    by_key: dict[tuple[str, str], dict[str, dict[str, object]]] = {}
    for record in records:
        by_key.setdefault((str(record["base_case_id"]), str(record["treatment_id"])), {})[str(record["model"])] = record
    for models in by_key.values():
        if models["B0"]["court1_initial_valid"]:
            assert models["B0"]["court1_verdict"] == models["B1"]["court1_verdict"]
        assert models["B1"]["court1_verdict"] == models["B2"]["court1_verdict"]
        b2 = models["B2"]
        if b2["dao_decision"] is not None:
            accept_weight = 0
            appeal_weight = 0
            for observation in b2["backer_observations"]:
                if observation["cast_ballot"] is None:
                    continue
                weight = math.isqrt(
                    next(
                        item["contribution"]
                        for item in b2["contribution_snapshot"]
                        if item["wallet_id"] == observation["backer_id"]
                    )
                )
                if observation["cast_ballot"] == "ACCEPT":
                    accept_weight += weight
                else:
                    appeal_weight += weight
            assert b2["dao_accept_weight"] == accept_weight
            assert b2["dao_appeal_weight"] == appeal_weight
            if b2["dao_decision"] == "ACCEPT":
                assert not b2["court2_opened"]
                assert b2["final_verdict"] == models["B1"]["final_verdict"]
            else:
                assert b2["court2_opened"]


def test_constrained_pool_records_exhaustion_instead_of_adding_judges(tmp_path: Path) -> None:
    records = _records(tmp_path, replications=4)
    constrained = [
        record for record in records
        if record["judge_pool_level"] == "constrained"
        and record["model"] == "B1"
    ]
    assert any(record["failure_reason"] == "COURT1_RESET_INSUFFICIENT_JUDGE_SUPPLY" for record in constrained)
    assert all(record["judge_pool_size"] == 3 for record in constrained)
    assert all(len(record["judge_population"]) == 4 for record in constrained)


def test_typed_schema_rejects_key_complete_inconsistent_records(tmp_path: Path) -> None:
    record = next(record for record in _records(tmp_path, replications=1) if record["model"] == "B2")
    invalid = copy.deepcopy(record)
    invalid["final_state"] = "PROTOCOL_FAIL"
    invalid["final_verdict"] = "PASS"
    with pytest.raises(ComparativeSchemaError, match="PROTOCOL_FAIL"):
        validate_comparative_record(invalid)

    invalid = copy.deepcopy(record)
    invalid["court2_opened"] = True
    invalid["dao_decision"] = "ACCEPT"
    with pytest.raises(ComparativeSchemaError, match="Court 2|APPEAL"):
        validate_comparative_record(invalid)

    path = tmp_path / "duplicate.jsonl"
    path.write_text(json.dumps(record) + "\n" + json.dumps(record) + "\n", encoding="utf-8")
    with pytest.raises(ComparativeSchemaError, match="duplicate"):
        validate_comparative_jsonl_schema(path)


def test_comparative_replay_is_bit_for_bit(tmp_path: Path) -> None:
    config = _config()
    values = dict(config.values)
    values["replications_per_cell"] = 1
    small = type(config)(values)
    first = run_comparative(small, tmp_path / "first")
    second = run_comparative(small, tmp_path / "second")
    assert first["manifest"]["raw_sha256"] == second["manifest"]["raw_sha256"]
    assert (tmp_path / "first" / "raw" / "sim_01.jsonl").read_bytes() == (tmp_path / "second" / "raw" / "sim_01.jsonl").read_bytes()
