import numpy as np
import pytest

from fundtogether_pilot.court_model import select_judges
from fundtogether_pilot.random_streams import KeyedRandom


def test_bit_for_bit_replay_and_order_independence() -> None:
    random = KeyedRandom(20261027)
    expected = random.uniform(4, "judge_case.correctness", ("case-1", "judge-2"), 3)
    for index in range(50):
        random.uniform(4, "backer.signal", ("unrelated", index))
    assert random.uniform(4, "judge_case.correctness", ("case-1", "judge-2"), 3) == expected


def test_domains_are_empirically_independent() -> None:
    random = KeyedRandom(20261027)
    first = [random.uniform(i, "case.truth", ("check",)) for i in range(3000)]
    second = [random.uniform(i, "backer.signal", ("check",)) for i in range(3000)]
    assert abs(float(np.corrcoef(first, second)[0, 1])) < 0.06


def test_replication_ids_are_distinct() -> None:
    random = KeyedRandom(20261027)
    values = {
        random.uniform(i, "court.assignment", ("court-1",)) for i in range(100)
    }
    assert len(values) == 100


def test_rejects_unknown_domain_and_ambiguous_entity_type() -> None:
    random = KeyedRandom(1)
    with pytest.raises(ValueError, match="unregistered"):
        random.uniform(0, "unknown", ())
    with pytest.raises(TypeError, match="unsupported"):
        random.uniform(0, "case.truth", (1.5,))


def test_court_selection_is_replayable_unique_and_respects_exclusions() -> None:
    random = KeyedRandom(20261027)
    candidates = [f"judge-{index}" for index in range(8)]
    selected = select_judges(
        random,
        5,
        candidates,
        case_id="case-5",
        court_level="court-2",
        attempt=0,
        excluded=("judge-0", "judge-1"),
    )
    replay = select_judges(
        random,
        5,
        reversed(candidates),
        case_id="case-5",
        court_level="court-2",
        attempt=0,
        excluded=("judge-0", "judge-1"),
    )
    assert selected == replay
    assert len(set(selected)) == 3
    assert not set(selected) & {"judge-0", "judge-1"}
