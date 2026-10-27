from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Iterable, Sequence

import numpy as np


STREAM_VERSION = "blake2b-256-numpy-pcg64dxsm-v1"

DOMAINS = frozenset(
    {
        "case.truth",
        "case.shared_difficulty",
        "judge.stable_quality",
        "judge_case.correctness",
        "judge_case.nonreveal",
        "judge.collusion",
        "court.selection",
        "court.assignment",
        "backer.signal",
        "backer.participation",
        "backer.strategy",
        "dao.ballot",
        "timing.event",
    }
)


def _stable_entity(value: object) -> dict[str, object]:
    if isinstance(value, bool):
        return {"type": "bool", "value": value}
    if isinstance(value, int):
        return {"type": "int", "value": str(value)}
    if isinstance(value, str):
        return {"type": "str", "value": value}
    raise TypeError(f"unsupported random-stream entity type: {type(value).__name__}")


@dataclass(frozen=True)
class KeyedRandom:
    master_seed: int

    def _seed(
        self,
        replication_id: int,
        domain: str,
        entity_ids: Sequence[object] = (),
        draw_index: int = 0,
    ) -> int:
        if domain not in DOMAINS:
            raise ValueError(f"unregistered random domain: {domain}")
        if replication_id < 0 or draw_index < 0:
            raise ValueError("replication_id and draw_index must be non-negative")
        payload = {
            "stream_version": STREAM_VERSION,
            "master_seed": str(self.master_seed),
            "replication_id": str(replication_id),
            "domain": domain,
            "entity_ids": [_stable_entity(value) for value in entity_ids],
            "draw_index": str(draw_index),
        }
        encoded = json.dumps(
            payload, ensure_ascii=True, sort_keys=True, separators=(",", ":")
        ).encode("ascii")
        digest = hashlib.blake2b(
            encoded, digest_size=32, person=b"FT-PILOT-01-RNG"
        ).digest()
        return int.from_bytes(digest, "big")

    def generator(
        self,
        replication_id: int,
        domain: str,
        entity_ids: Sequence[object] = (),
        draw_index: int = 0,
    ) -> np.random.Generator:
        return np.random.Generator(
            np.random.PCG64DXSM(
                self._seed(replication_id, domain, entity_ids, draw_index)
            )
        )

    def uniform(
        self,
        replication_id: int,
        domain: str,
        entity_ids: Sequence[object] = (),
        draw_index: int = 0,
    ) -> float:
        return float(
            self.generator(replication_id, domain, entity_ids, draw_index).random()
        )

    def bernoulli(
        self,
        probability: float,
        replication_id: int,
        domain: str,
        entity_ids: Sequence[object] = (),
        draw_index: int = 0,
    ) -> bool:
        if not 0.0 <= probability <= 1.0:
            raise ValueError("probability must be in [0, 1]")
        return self.uniform(replication_id, domain, entity_ids, draw_index) < probability

    def beta(
        self,
        alpha: float,
        beta: float,
        replication_id: int,
        domain: str,
        entity_ids: Sequence[object] = (),
        draw_index: int = 0,
    ) -> float:
        if alpha <= 0.0 or beta <= 0.0:
            raise ValueError("beta shape parameters must be positive")
        return float(
            self.generator(replication_id, domain, entity_ids, draw_index).beta(
                alpha, beta
            )
        )

    def ordered(
        self,
        values: Iterable[str],
        replication_id: int,
        domain: str,
        entity_ids: Sequence[object] = (),
    ) -> list[str]:
        return sorted(
            values,
            key=lambda value: (
                self.uniform(replication_id, domain, (*entity_ids, value)),
                value,
            ),
        )
