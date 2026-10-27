from dataclasses import replace

import pytest

from fundtogether_pilot.backer_model import ACCEPT, APPEAL
from fundtogether_pilot.court_model import CourtResult, evaluate_court
from fundtogether_pilot.judge_model import JudgeModel
from fundtogether_pilot.random_streams import KeyedRandom
from fundtogether_pilot.workflows import PROTOCOL_FAIL, run_b0, run_b1, run_b2


def _courts(nonreveal_probability: float = 0.0) -> list[CourtResult]:
    model = JudgeModel(KeyedRandom(12), 0.70, 0.30, nonreveal_probability)
    case = model.create_case(0, "workflow-test")
    return [
        evaluate_court(model.observe(case, f"attempt-{attempt}-judge-{i}") for i in range(3))
        for attempt in range(4)
    ]


def test_initial_court_is_identical_across_b0_b1_b2() -> None:
    courts = _courts()
    b0 = run_b0(courts[0])
    b1 = run_b1(courts[0], courts[1])
    b2 = run_b2(courts[0], courts[1], dao_decision=ACCEPT, court2=courts[2], replacement_court2=courts[3])
    assert b0.court1_verdict == b1.court1_verdict == b2.court1_verdict
    assert all(result.terminally_complete for result in (b0, b1, b2))
    assert not any(result.payout_assumed for result in (b0, b1, b2))


def test_court2_opens_only_after_appeal() -> None:
    courts = _courts()
    accept = run_b2(courts[0], courts[1], dao_decision=ACCEPT, court2=courts[2], replacement_court2=courts[3])
    appeal = run_b2(courts[0], courts[1], dao_decision=APPEAL, court2=courts[2], replacement_court2=courts[3])
    assert not accept.court2_opened
    assert appeal.court2_opened


def test_invalid_courts_end_as_protocol_failure_not_verdict_fail() -> None:
    valid = _courts()[0]
    invalid = replace(valid, valid=False, verdict=None)
    assert run_b0(invalid).final_state == PROTOCOL_FAIL
    assert run_b1(invalid, invalid).final_state == PROTOCOL_FAIL
    result = run_b2(invalid, invalid, dao_decision=APPEAL, court2=invalid, replacement_court2=invalid)
    assert result.final_state == PROTOCOL_FAIL
    assert not result.substantively_resolved


def test_overlapping_court2_identity_rejects() -> None:
    courts = _courts()
    overlapping = replace(courts[2], judge_ids=courts[0].judge_ids)
    with pytest.raises(ValueError, match="forbidden"):
        run_b2(courts[0], courts[1], dao_decision=APPEAL, court2=overlapping, replacement_court2=courts[3])


def test_actual_dao_voter_is_excluded_from_court2() -> None:
    courts = _courts()
    with pytest.raises(ValueError, match="DAO voter"):
        run_b2(
            courts[0],
            courts[1],
            dao_decision=APPEAL,
            court2=courts[2],
            replacement_court2=courts[3],
            dao_voters=(courts[2].judge_ids[0],),
        )


def test_valid_court_rewards_are_not_double_counted() -> None:
    courts = _courts()
    b1 = run_b1(courts[0], courts[1])
    b2 = run_b2(courts[0], courts[1], dao_decision=APPEAL, court2=courts[2], replacement_court2=courts[3])
    assert b1.valid_court_rewards == 1
    assert b2.valid_court_rewards == 2
