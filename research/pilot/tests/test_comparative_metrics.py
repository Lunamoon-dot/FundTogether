from fundtogether_pilot.comparative_metrics import _row_metrics


def _row(
    *,
    truth: str = "PASS",
    court1: str = "PASS",
    final_state: str = "FINAL_PASS",
    final_verdict: str | None = "PASS",
    court2_verdict: str | None = "PASS",
    dao_decision: str = "APPEAL",
) -> dict[str, object]:
    substantive_court2 = court2_verdict in {"PASS", "FAIL"}
    return {
        "model": "B2",
        "ground_truth": truth,
        "final_state": final_state,
        "final_verdict": final_verdict,
        "substantively_resolved": final_state != "PROTOCOL_FAIL",
        "terminally_complete": True,
        "dao_finalized": True,
        "dao_decision": dao_decision,
        "court1_verdict": court1,
        "court2_opened": dao_decision == "APPEAL",
        "court2_final_valid": substantive_court2,
        "court2_final_verdict": court2_verdict,
        "court1_reset_judges": [],
        "court2_reset_judges": [],
        "courts_attempted": 2 if dao_decision == "APPEAL" else 1,
        "valid_courts": 2 if substantive_court2 else 1,
        "procedural_resets": 0,
        "assigned_judge_seats": 3,
        "ballots_cast": 1,
        "court2_assignments": 1 if dao_decision == "APPEAL" else 0,
        "valid_court_rewards": 2 if substantive_court2 else 1,
        "court1_assignee_count": 3,
        "dao_eligible_judge_count": 6,
        "dao_voting_judge_count": 1,
        "court2_eligible_judges_before_dao": 6,
        "court2_eligible_judges_after_dao": 5,
        "court2_assignment_attempted": dao_decision == "APPEAL",
        "court2_assignment_succeeded": substantive_court2,
        "court2_exhaustion_reason": "NONREVEAL_PROCEDURAL_FAILURE" if final_state == "PROTOCOL_FAIL" else None,
    }


def test_protocol_failure_is_not_a_substantive_reversal() -> None:
    rows = [
        _row(truth="PASS", court1="PASS", final_state="PROTOCOL_FAIL", final_verdict=None, court2_verdict=None),
        _row(truth="PASS", court1="FAIL", final_state="PROTOCOL_FAIL", final_verdict=None, court2_verdict=None),
    ]

    metrics = _row_metrics(rows)

    assert metrics["N_correct_appealed"] == 1
    assert metrics["N_incorrect_appealed"] == 1
    assert metrics["N_appeal_protocol_failures"] == 2
    assert metrics["N_court2_substantive"] == 0
    assert metrics["N_beneficial_reversals"] == 0
    assert metrics["N_harmful_reversals"] == 0
    assert metrics["beneficial_reversal_rate"] == 0.0
    assert metrics["harmful_reversal_rate"] == 0.0
    assert metrics["court2_substantive_completion_rate"] == 0.0


def test_substantive_reversals_use_court1_truth_class_denominators() -> None:
    rows = [
        _row(truth="PASS", court1="PASS", final_state="VERDICT_FAIL", final_verdict="FAIL", court2_verdict="FAIL"),
        _row(truth="PASS", court1="FAIL", final_state="FINAL_PASS", final_verdict="PASS", court2_verdict="PASS"),
        _row(truth="PASS", court1="PASS", final_state="FINAL_PASS", final_verdict="PASS", court2_verdict="PASS"),
        _row(truth="PASS", court1="FAIL", final_state="VERDICT_FAIL", final_verdict="FAIL", court2_verdict="FAIL"),
    ]

    metrics = _row_metrics(rows)

    assert metrics["N_correct_appealed"] == 2
    assert metrics["N_incorrect_appealed"] == 2
    assert metrics["N_beneficial_reversals"] == 1
    assert metrics["N_harmful_reversals"] == 1
    assert metrics["beneficial_reversal_rate"] == 0.5
    assert metrics["harmful_reversal_rate"] == 0.5
    assert metrics["N_court2_substantive"] == 4


def test_false_error_rates_are_joint_and_conditional_metrics() -> None:
    rows = [
        _row(truth="FAIL", court1="FAIL", final_state="FINAL_PASS", final_verdict="PASS", court2_verdict="PASS"),
        _row(truth="FAIL", court1="FAIL", final_state="PROTOCOL_FAIL", final_verdict=None, court2_verdict=None),
        _row(truth="PASS", court1="PASS", final_state="VERDICT_FAIL", final_verdict="FAIL", court2_verdict="FAIL"),
        _row(truth="PASS", court1="PASS", final_state="FINAL_PASS", final_verdict="PASS", court2_verdict="PASS"),
    ]

    metrics = _row_metrics(rows)

    assert metrics["false_pass_rate"] == 0.25
    assert metrics["false_fail_rate"] == 0.25
    assert metrics["false_pass_given_truth_fail"] == 0.5
    assert metrics["false_fail_given_truth_pass"] == 0.5
    assert metrics["false_pass_rate_denominator"] == 4
    assert metrics["false_fail_rate_denominator"] == 4


def test_zero_denominators_and_affirmations_are_explicitly_undefined_or_zero() -> None:
    rows = [
        _row(truth="PASS", court1="FAIL", final_state="VERDICT_FAIL", final_verdict="FAIL", court2_verdict="FAIL"),
        _row(truth="PASS", court1="PASS", final_state="FINAL_PASS", final_verdict="PASS", court2_verdict="PASS"),
    ]

    metrics = _row_metrics(rows)

    assert metrics["N_incorrect_appealed"] == 1
    assert metrics["N_correct_appealed"] == 1
    assert metrics["N_beneficial_reversals"] == 0
    assert metrics["N_harmful_reversals"] == 0
    assert metrics["conditional_substantive_accuracy"] == 0.5

    no_substantive = _row_metrics([
        _row(truth="PASS", court1="PASS", final_state="PROTOCOL_FAIL", final_verdict=None, court2_verdict=None),
    ])
    assert no_substantive["conditional_substantive_accuracy"] is None

    no_incorrect_appeal = _row_metrics([
        _row(truth="PASS", court1="PASS", final_state="FINAL_PASS", final_verdict="PASS", court2_verdict="PASS"),
    ])
    assert no_incorrect_appeal["beneficial_reversal_rate"] is None
