from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable


GROUP_FIELDS = (
    "treatment_id",
    "signal_sensitivity",
    "signal_false_alarm",
    "nonreveal_configured",
    "rho_configured",
    "judge_pool_level",
    "judge_pool_size",
    "overlap_ratio_requested",
    "overlap_judge_count",
    "overlap_ratio_realized",
)


def _rate(numerator: int, denominator: int) -> float | None:
    return None if denominator == 0 else numerator / denominator


def _mean(values: Iterable[int | float], denominator: int) -> float | None:
    values_list = list(values)
    return None if denominator == 0 else sum(values_list) / denominator


def _group_key(row: dict[str, Any]) -> tuple[Any, ...]:
    return tuple(row[field] for field in GROUP_FIELDS)


def _is_substantive(row: dict[str, Any]) -> bool:
    return row["final_state"] in {"FINAL_PASS", "VERDICT_FAIL"} and row["final_verdict"] in {"PASS", "FAIL"}


def _is_substantive_court2(row: dict[str, Any]) -> bool:
    return (
        row["court2_opened"]
        and row["court2_final_valid"]
        and row["court2_final_verdict"] in {"PASS", "FAIL"}
    )


def _row_metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    trials = len(rows)
    is_b2 = bool(rows and rows[0]["model"] == "B2")
    substantive = [row for row in rows if _is_substantive(row)]
    correct = [row for row in substantive if row["final_verdict"] == row["ground_truth"]]
    truth_pass = [row for row in rows if row["ground_truth"] == "PASS"]
    truth_fail = [row for row in rows if row["ground_truth"] == "FAIL"]
    false_pass = [row for row in truth_fail if row["final_state"] == "FINAL_PASS" and row["final_verdict"] == "PASS"]
    false_fail = [row for row in truth_pass if row["final_state"] == "VERDICT_FAIL" and row["final_verdict"] == "FAIL"]
    dao_rows = [row for row in rows if row["dao_finalized"] is True]
    dao_appeals = [row for row in dao_rows if row["dao_decision"] == "APPEAL"]
    incorrect_court1 = [row for row in dao_appeals if row["court1_verdict"] is not None and row["court1_verdict"] != row["ground_truth"]]
    correct_court1 = [row for row in dao_appeals if row["court1_verdict"] is not None and row["court1_verdict"] == row["ground_truth"]]
    court2_opened = [row for row in rows if row["court2_opened"]]
    court2_substantive = [row for row in dao_appeals if _is_substantive_court2(row)]
    beneficial = [row for row in incorrect_court1 if _is_substantive_court2(row) and row["court2_final_verdict"] == row["ground_truth"]]
    harmful = [row for row in correct_court1 if _is_substantive_court2(row) and row["court2_final_verdict"] != row["ground_truth"]]
    appeal_protocol_failures = [row for row in dao_appeals if row["final_state"] == "PROTOCOL_FAIL"]
    appeal_failure_after_correct = [row for row in correct_court1 if row["final_state"] == "PROTOCOL_FAIL"]
    appeal_failure_after_incorrect = [row for row in incorrect_court1 if row["final_state"] == "PROTOCOL_FAIL"]
    court2_exhausted = [
        row for row in rows
        if row["court2_opened"] and row["final_state"] == "PROTOCOL_FAIL"
    ]
    resets_court1 = [row for row in rows if row["court1_reset_judges"]]
    resets_court2 = [row for row in rows if row["court2_reset_judges"]]
    record: dict[str, Any] = {
        "trials": trials,
        "conditional_substantive_accuracy": _rate(len(correct), len(substantive)),
        "conditional_substantive_accuracy_denominator": len(substantive),
        "conditional_substantive_accuracy_numerator": len(correct),
        "all_trial_correct_substantive": _rate(len(correct), trials),
        "all_trial_correct_substantive_denominator": trials,
        "all_trial_correct_substantive_numerator": len(correct),
        "false_pass_rate": _rate(len(false_pass), trials),
        "false_pass_rate_denominator": trials,
        "false_pass_rate_numerator": len(false_pass),
        "false_fail_rate": _rate(len(false_fail), trials),
        "false_fail_rate_denominator": trials,
        "false_fail_rate_numerator": len(false_fail),
        "false_pass_given_truth_fail": _rate(len(false_pass), len(truth_fail)),
        "false_pass_given_truth_fail_denominator": len(truth_fail),
        "false_pass_given_truth_fail_numerator": len(false_pass),
        "false_fail_given_truth_pass": _rate(len(false_fail), len(truth_pass)),
        "false_fail_given_truth_pass_denominator": len(truth_pass),
        "false_fail_given_truth_pass_numerator": len(false_fail),
        "substantive_resolution_rate": _rate(len(substantive), trials),
        "substantive_resolution_rate_denominator": trials,
        "substantive_resolution_rate_numerator": len(substantive),
        "terminal_completion_rate": _rate(sum(int(row["terminally_complete"]) for row in rows), trials),
        "terminal_completion_rate_denominator": trials,
        "terminal_completion_rate_numerator": sum(int(row["terminally_complete"]) for row in rows),
        "protocol_failure_rate": _rate(sum(int(row["final_state"] == "PROTOCOL_FAIL") for row in rows), trials),
        "protocol_failure_rate_denominator": trials,
        "protocol_failure_rate_numerator": sum(int(row["final_state"] == "PROTOCOL_FAIL") for row in rows),
        "stuck_rate": _rate(sum(int(not row["terminally_complete"]) for row in rows), trials),
        "stuck_rate_denominator": trials,
        "stuck_rate_numerator": sum(int(not row["terminally_complete"]) for row in rows),
        "court1_reset_rate": _rate(len(resets_court1), trials),
        "court1_reset_rate_denominator": trials,
        "court1_reset_rate_numerator": len(resets_court1),
        "court2_reset_rate": _rate(len(resets_court2), trials) if is_b2 else None,
        "court2_reset_rate_denominator": trials if is_b2 else 0,
        "court2_reset_rate_numerator": len(resets_court2) if is_b2 else 0,
        "court2_exhaustion_rate": _rate(len(court2_exhausted), trials) if is_b2 else None,
        "court2_exhaustion_rate_denominator": trials if is_b2 else 0,
        "court2_exhaustion_rate_numerator": len(court2_exhausted) if is_b2 else 0,
        "dao_appeal_rate": _rate(len(dao_appeals), len(dao_rows)) if is_b2 else None,
        "dao_appeal_rate_denominator": len(dao_rows) if is_b2 else 0,
        "dao_appeal_rate_numerator": len(dao_appeals) if is_b2 else 0,
        "alpha_appeal": _rate(len(incorrect_court1), len([row for row in dao_rows if row["court1_verdict"] is not None and row["court1_verdict"] != row["ground_truth"]])) if is_b2 else None,
        "alpha_appeal_denominator": len([row for row in dao_rows if row["court1_verdict"] is not None and row["court1_verdict"] != row["ground_truth"]]) if is_b2 else 0,
        "alpha_appeal_numerator": len(incorrect_court1) if is_b2 else 0,
        "beta_appeal": _rate(len(correct_court1), len([row for row in dao_rows if row["court1_verdict"] is not None and row["court1_verdict"] == row["ground_truth"]])) if is_b2 else None,
        "beta_appeal_denominator": len([row for row in dao_rows if row["court1_verdict"] is not None and row["court1_verdict"] == row["ground_truth"]]) if is_b2 else 0,
        "beta_appeal_numerator": len(correct_court1) if is_b2 else 0,
        "N_incorrect_appealed": len(incorrect_court1) if is_b2 else 0,
        "N_correct_appealed": len(correct_court1) if is_b2 else 0,
        "N_beneficial_reversals": len(beneficial) if is_b2 else 0,
        "N_harmful_reversals": len(harmful) if is_b2 else 0,
        "N_appeal_protocol_failures": len(appeal_protocol_failures) if is_b2 else 0,
        "N_court2_substantive": len(court2_substantive) if is_b2 else 0,
        "beneficial_reversal_rate": _rate(len(beneficial), len(incorrect_court1)) if is_b2 else None,
        "beneficial_reversal_rate_numerator": len(beneficial) if is_b2 else 0,
        "beneficial_reversal_rate_denominator": len(incorrect_court1) if is_b2 else 0,
        "harmful_reversal_rate": _rate(len(harmful), len(correct_court1)) if is_b2 else None,
        "harmful_reversal_rate_numerator": len(harmful) if is_b2 else 0,
        "harmful_reversal_rate_denominator": len(correct_court1) if is_b2 else 0,
        "appeal_protocol_failure_rate": _rate(len(appeal_protocol_failures), len(dao_appeals)) if is_b2 else None,
        "appeal_protocol_failure_rate_numerator": len(appeal_protocol_failures) if is_b2 else 0,
        "appeal_protocol_failure_rate_denominator": len(dao_appeals) if is_b2 else 0,
        "appeal_protocol_failure_all_trials": _rate(len(appeal_protocol_failures), trials) if is_b2 else None,
        "appeal_protocol_failure_all_trials_numerator": len(appeal_protocol_failures) if is_b2 else 0,
        "appeal_protocol_failure_all_trials_denominator": trials if is_b2 else 0,
        "appeal_failure_after_correct_court1": _rate(len(appeal_failure_after_correct), len(correct_court1)) if is_b2 else None,
        "appeal_failure_after_correct_court1_numerator": len(appeal_failure_after_correct) if is_b2 else 0,
        "appeal_failure_after_correct_court1_denominator": len(correct_court1) if is_b2 else 0,
        "appeal_failure_after_incorrect_court1": _rate(len(appeal_failure_after_incorrect), len(incorrect_court1)) if is_b2 else None,
        "appeal_failure_after_incorrect_court1_numerator": len(appeal_failure_after_incorrect) if is_b2 else 0,
        "appeal_failure_after_incorrect_court1_denominator": len(incorrect_court1) if is_b2 else 0,
        "court2_substantive_completion_rate": _rate(len(court2_substantive), len(dao_appeals)) if is_b2 else None,
        "court2_substantive_completion_rate_numerator": len(court2_substantive) if is_b2 else 0,
        "court2_substantive_completion_rate_denominator": len(dao_appeals) if is_b2 else 0,
        "courts_attempted_mean": _mean((row["courts_attempted"] for row in rows), trials),
        "valid_courts_mean": _mean((row["valid_courts"] for row in rows), trials),
        "procedural_resets_mean": _mean((row["procedural_resets"] for row in rows), trials),
        "assigned_judge_seats_mean": _mean((row["assigned_judge_seats"] for row in rows), trials),
        "ballots_mean": _mean((row["ballots_cast"] for row in rows if row["ballots_cast"] is not None), len([row for row in rows if row["ballots_cast"] is not None])),
        "court2_assignments_mean": _mean((row["court2_assignments"] for row in rows if row["model"] == "B2"), len(rows)) if is_b2 else None,
        "valid_court_rewards_mean": _mean((row["valid_court_rewards"] for row in rows), trials),
    }
    return record


def _with_group(row: dict[str, Any], group: tuple[Any, ...], model: str) -> dict[str, Any]:
    result = {field: value for field, value in zip(GROUP_FIELDS, group)}
    result["model"] = model
    result.update(row)
    return result


def _paired_comparisons(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_group: dict[tuple[Any, ...], dict[str, dict[str, Any]]] = defaultdict(dict)
    for row in rows:
        by_group[(_group_key(row), row["base_case_id"])][row["model"]] = row
    metrics = {
        "substantive_resolution": lambda row: float(row["substantively_resolved"]),
        "all_trial_correct_substantive": lambda row: float(row["substantively_resolved"] and row["final_verdict"] == row["ground_truth"]),
        "protocol_failure": lambda row: float(row["final_state"] == "PROTOCOL_FAIL"),
        "terminal_completion": lambda row: float(row["terminally_complete"]),
        "court1_reset": lambda row: float(bool(row["court1_reset_judges"])),
    }
    comparisons = (("B1", "B0", "B1_minus_B0"), ("B2", "B1", "B2_minus_B1"))
    output: list[dict[str, Any]] = []
    grouped_values: dict[tuple[Any, ...], dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for (group, _base_case_id), models in by_group.items():
        for left, right, label in comparisons:
            if left not in models or right not in models:
                continue
            for metric, function in metrics.items():
                grouped_values[(group, label, metric)]["left"].append(function(models[left]))
                grouped_values[(group, label, metric)]["right"].append(function(models[right]))
    for (group, label, metric), values in grouped_values.items():
        left = values["left"]
        right = values["right"]
        differences = [a - b for a, b in zip(left, right)]
        result = {field: value for field, value in zip(GROUP_FIELDS, group)}
        result.update(
            {
                "comparison": label,
                "metric": metric,
                "paired_mean_difference": sum(differences) / len(differences),
                "paired_observations": len(differences),
                "left_mean": sum(left) / len(left),
                "right_mean": sum(right) / len(right),
            }
        )
        output.append(result)
    return output


def _eligibility_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    is_b2 = bool(rows and rows[0]["model"] == "B2")
    metrics = {
        "trials": len(rows),
        "court1_assignee_count_mean": _mean((row["court1_assignee_count"] for row in rows), len(rows)),
        "dao_eligible_judge_count_mean": _mean(
            (row["dao_eligible_judge_count"] for row in rows if row["dao_eligible_judge_count"] is not None),
            len([row for row in rows if row["dao_eligible_judge_count"] is not None]),
        ),
        "dao_voting_judge_count_mean": _mean(
            (row["dao_voting_judge_count"] for row in rows if row["dao_voting_judge_count"] is not None),
            len([row for row in rows if row["dao_voting_judge_count"] is not None]),
        ),
        "court2_eligible_judges_before_dao_mean": _mean(
            (row["court2_eligible_judges_before_dao"] for row in rows if row["court2_eligible_judges_before_dao"] is not None),
            len([row for row in rows if row["court2_eligible_judges_before_dao"] is not None]),
        ),
        "court2_eligible_judges_after_dao_mean": _mean(
            (row["court2_eligible_judges_after_dao"] for row in rows if row["court2_eligible_judges_after_dao"] is not None),
            len([row for row in rows if row["court2_eligible_judges_after_dao"] is not None]),
        ),
        "court2_assignment_attempted_rate": _rate(
            sum(int(row["court2_assignment_attempted"]) for row in rows), len(rows)
        ) if is_b2 else None,
        "court2_assignment_succeeded_rate": _rate(
            sum(int(row["court2_assignment_succeeded"]) for row in rows), len(rows)
        ) if is_b2 else None,
        "court2_exhaustion_rate": _rate(
            sum(int(row["court2_exhaustion_reason"] is not None) for row in rows), len(rows)
        ) if is_b2 else None,
    }
    return metrics


def build_metrics(records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    by_group: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        by_group[(_group_key(record), record["model"])].append(record)
    scenario_summary: list[dict[str, Any]] = []
    for (group, model), rows in sorted(by_group.items(), key=lambda item: (item[0][0], item[0][1])):
        scenario_row = _with_group(_row_metrics(rows), group, model)
        scenario_row.update(_eligibility_summary(rows))
        scenario_summary.append(scenario_row)

    diagnostics: list[dict[str, Any]] = []
    eligibility: list[dict[str, Any]] = []
    for row in scenario_summary:
        diagnostics.append(
            {
                **{field: row[field] for field in GROUP_FIELDS},
                "model": row["model"],
                "diagnostic": "negative_or_unfavorable_b2_preserved",
                "value": row["harmful_reversal_rate"],
                "denominator": row["harmful_reversal_rate_denominator"],
            }
        )
        eligibility.append(
            {
                **{field: row[field] for field in GROUP_FIELDS},
                "model": row["model"],
                **_eligibility_summary(
                    [
                        record
                        for record in records
                        if record["model"] == row["model"]
                        and _group_key(record) == tuple(row[field] for field in GROUP_FIELDS)
                    ]
                ),
            }
        )
    overlap_sensitivity = [
        {
            **{field: row[field] for field in GROUP_FIELDS},
            "model": row["model"],
            "trials": row["trials"],
            "substantive_resolution_rate": row["substantive_resolution_rate"],
            "all_trial_correct_substantive": row["all_trial_correct_substantive"],
            "protocol_failure_rate": row["protocol_failure_rate"],
            "court2_substantive_completion_rate": row["court2_substantive_completion_rate"],
            "beneficial_reversal_rate": row["beneficial_reversal_rate"],
            "harmful_reversal_rate": row["harmful_reversal_rate"],
            "court2_eligible_judges_after_dao_mean": next(
                item["court2_eligible_judges_after_dao_mean"]
                for item in eligibility
                if item["model"] == row["model"]
                and all(item[field] == row[field] for field in GROUP_FIELDS)
            ),
        }
        for row in scenario_summary
    ]
    return {
        "scenario_summary": scenario_summary,
        "paired_comparisons": _paired_comparisons(records),
        "diagnostics": diagnostics,
        "court2_eligibility": eligibility,
        "overlap_sensitivity": overlap_sensitivity,
    }
