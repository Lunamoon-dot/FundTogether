from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class PilotConfig:
    values: dict[str, Any]

    @property
    def master_seed(self) -> int:
        return int(self.values["master_seed"])

    def __getitem__(self, key: str) -> Any:
        return self.values[key]


def load_config(path: str | Path) -> PilotConfig:
    config_path = Path(path)
    with config_path.open("r", encoding="utf-8") as handle:
        values = json.load(handle)
    required = {
        "repository_commit",
        "research_spec_commit",
        "model_version",
        "policy_version",
        "random_stream_version",
        "master_seed",
        "judge_scenarios",
        "calibration_tolerances",
    }
    missing = sorted(required - values.keys())
    if missing:
        raise ValueError(f"missing configuration fields: {', '.join(missing)}")
    return PilotConfig(values)


def load_comparative_config(path: str | Path) -> PilotConfig:
    config_path = Path(path)
    with config_path.open("r", encoding="utf-8") as handle:
        values = json.load(handle)
    required = {
        "experiment_id",
        "schema_version",
        "repository_commit",
        "research_spec_commit",
        "model_version",
        "workflow_model_version",
        "policy_version",
        "random_stream_version",
        "master_seed",
        "replications_per_cell",
        "judge_accuracy",
        "rho_levels",
        "nonreveal_probabilities",
        "signal_scenarios",
        "judge_pool_levels",
        "backers_per_case",
        "backer_participation_probability",
        "creator_id",
        "candidate_policy_fixture",
        "analytical_sanity_tolerance",
    }
    missing = sorted(required - values.keys())
    if missing:
        raise ValueError(f"missing comparative configuration fields: {', '.join(missing)}")
    if values["experiment_id"] != "SIM-01":
        raise ValueError("comparative configuration experiment_id must be SIM-01")
    if values["schema_version"] not in {"sim-01-comparative-raw-v1", "sim-01-comparative-raw-v2"}:
        raise ValueError("unsupported SIM-01 schema version")
    if values["schema_version"] == "sim-01-comparative-raw-v2" and "judge_backer_overlap_ratios" not in values:
        raise ValueError("remediation configuration requires judge_backer_overlap_ratios")
    return PilotConfig(values)
