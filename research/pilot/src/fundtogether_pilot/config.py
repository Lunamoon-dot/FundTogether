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
