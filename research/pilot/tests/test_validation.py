import json
from pathlib import Path

from fundtogether_pilot.config import PilotConfig, load_config
from fundtogether_pilot.validation import RAW_REQUIRED_FIELDS, run_pilot, validate_jsonl_schema


def test_config_requires_manifest_fields(tmp_path: Path) -> None:
    path = tmp_path / "bad.json"
    path.write_text("{}", encoding="utf-8")
    try:
        load_config(path)
    except ValueError as error:
        assert "missing configuration fields" in str(error)
    else:
        raise AssertionError("invalid manifest was accepted")


def test_bounded_end_to_end_result_schema(tmp_path: Path) -> None:
    root = Path(__file__).parents[1]
    values = json.loads((root / "configs" / "pilot_01.json").read_text(encoding="utf-8"))
    values.update(
        {
            "judge_replications": 100,
            "nonreveal_replications": 100,
            "signal_replications": 100,
            "workflow_replications": 50,
        }
    )
    result = run_pilot(PilotConfig(values), tmp_path / "run")
    raw_path = tmp_path / "run" / "raw" / "pilot_01.jsonl"
    assert validate_jsonl_schema(raw_path) == result["manifest"]["raw_record_count"]
    first = json.loads(raw_path.read_text(encoding="utf-8").splitlines()[0])
    assert RAW_REQUIRED_FIELDS <= first.keys()
    assert (tmp_path / "run" / "figures" / "judge_accuracy.png").exists()
    assert (tmp_path / "run" / "tables" / "deterministic_counterexamples.csv").exists()


def test_schema_rejects_missing_field(tmp_path: Path) -> None:
    path = tmp_path / "bad.jsonl"
    path.write_text('{"replication_id": 1}\n', encoding="utf-8")
    try:
        validate_jsonl_schema(path)
    except ValueError as error:
        assert "missing" in str(error)
    else:
        raise AssertionError("invalid raw record was accepted")
