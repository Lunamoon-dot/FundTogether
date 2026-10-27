from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable


LEGACY_SCHEMA_VERSION = "sim-01-comparative-raw-v1"
SCHEMA_VERSION = "sim-01-comparative-raw-v2"
SUPPORTED_SCHEMA_VERSIONS = frozenset({LEGACY_SCHEMA_VERSION, SCHEMA_VERSION})
MODEL_VERSION = "fundtogether-sim-01-paired-v2"
MODELS = frozenset({"B0", "B1", "B2"})
TREATMENTS = frozenset({"informative", "non_informative", "misleading"})
VERDICTS = frozenset({"PASS", "FAIL"})
FINAL_STATES = frozenset({"FINAL_PASS", "VERDICT_FAIL", "PROTOCOL_FAIL"})
DAO_DECISIONS = frozenset({"ACCEPT", "APPEAL"})
FAILURE_REASONS = frozenset(
    {
        "COURT1_INSUFFICIENT_JUDGE_SUPPLY",
        "COURT1_NONREVEAL_FAILURE",
        "COURT1_RESET_INSUFFICIENT_JUDGE_SUPPLY",
        "COURT1_RESET_NONREVEAL_FAILURE",
        "COURT2_INSUFFICIENT_JUDGE_SUPPLY",
        "COURT2_NONREVEAL_FAILURE",
        "COURT2_RESET_INSUFFICIENT_JUDGE_SUPPLY",
        "COURT2_RESET_NONREVEAL_FAILURE",
    }
)


class ComparativeSchemaError(ValueError):
    pass


REQUIRED_FIELDS = frozenset(
    {
        "schema_version",
        "experiment_id",
        "model_version",
        "workflow_model_version",
        "experiment_id",
        "replication_id",
        "base_case_id",
        "treatment_id",
        "model",
        "seed",
        "random_stream_version",
        "ground_truth",
        "case_latent",
        "judge_accuracy_configured",
        "rho_configured",
        "nonreveal_configured",
        "signal_sensitivity",
        "signal_false_alarm",
        "judge_population",
        "judge_stake_state",
        "judge_control_state",
        "backer_population",
        "contribution_snapshot",
        "attacker_capital",
        "judge_pool_level",
        "judge_pool_size",
        "court1_initial_judges",
        "court1_initial_valid",
        "court1_initial_verdict",
        "court1_reset_judges",
        "court1_reset_valid",
        "court1_reset_verdict",
        "court1_final_judges",
        "court1_final_valid",
        "court1_verdict",
        "dao_finalized",
        "dao_decision",
        "dao_eligible_wallets",
        "dao_voters",
        "dao_total_weight",
        "dao_cast_weight",
        "dao_accept_weight",
        "dao_appeal_weight",
        "backer_observations",
        "court2_opened",
        "court2_judges",
        "court2_valid",
        "court2_verdict",
        "court2_reset_judges",
        "court2_reset_valid",
        "court2_reset_verdict",
        "court2_final_judges",
        "court2_final_valid",
        "court2_final_verdict",
        "final_verdict",
        "final_state",
        "substantively_resolved",
        "terminally_complete",
        "failure_reason",
        "courts_attempted",
        "valid_courts",
        "procedural_resets",
        "assigned_judge_seats",
        "ballots_cast",
        "court2_assignments",
        "valid_court_rewards",
        "payout_assumed",
    }
)

REMEDIATION_FIELDS = frozenset(
    {
        "backer_total_contribution",
        "overlap_ratio_requested",
        "overlap_judge_count",
        "overlap_ratio_realized",
        "judge_backer_overlap_judges",
        "creator_id",
        "court1_assignee_count",
        "dao_eligible_judge_count",
        "dao_voting_judge_count",
        "court2_eligible_judges_before_dao",
        "court2_eligible_judges_after_dao",
        "court2_excluded_by_court1_count",
        "court2_excluded_by_dao_count",
        "court2_excluded_by_creator_count",
        "court2_assignment_attempted",
        "court2_assignment_succeeded",
        "court2_exhaustion_reason",
    }
)

COURT2_EXHAUSTION_REASONS = frozenset(
    {
        "INSUFFICIENT_ELIGIBLE_JUDGE_SUPPLY",
        "NONREVEAL_PROCEDURAL_FAILURE",
        "OTHER_PROCEDURAL_FAILURE",
    }
)


def _is_bool(value: object) -> bool:
    return isinstance(value, bool)


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _require(record: dict[str, Any], field: str) -> Any:
    if field not in record:
        raise ComparativeSchemaError(f"missing field {field}")
    return record[field]


def _string(record: dict[str, Any], field: str) -> str:
    value = _require(record, field)
    if not isinstance(value, str):
        raise ComparativeSchemaError(f"{field} must be a string")
    return value


def _nullable_string(record: dict[str, Any], field: str) -> str | None:
    value = _require(record, field)
    if value is not None and not isinstance(value, str):
        raise ComparativeSchemaError(f"{field} must be a string or null")
    return value


def _nullable_number(record: dict[str, Any], field: str) -> float | None:
    value = _require(record, field)
    if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))):
        raise ComparativeSchemaError(f"{field} must be a number or null")
    return None if value is None else float(value)


def _nullable_int(record: dict[str, Any], field: str) -> int | None:
    value = _require(record, field)
    if value is not None and not _is_int(value):
        raise ComparativeSchemaError(f"{field} must be an integer or null")
    return value


def _string_list(record: dict[str, Any], field: str) -> list[str]:
    value = _require(record, field)
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise ComparativeSchemaError(f"{field} must be a string list")
    if len(set(value)) != len(value):
        raise ComparativeSchemaError(f"{field} must not contain duplicates")
    return value


def _nullable_string_list(record: dict[str, Any], field: str) -> list[str] | None:
    value = _require(record, field)
    if value is None:
        return None
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise ComparativeSchemaError(f"{field} must be a string list or null")
    if len(set(value)) != len(value):
        raise ComparativeSchemaError(f"{field} must not contain duplicates")
    return value


def _validate_wallets(record: dict[str, Any]) -> None:
    population = _string_list(record, "backer_population")
    snapshot = _require(record, "contribution_snapshot")
    if not isinstance(snapshot, list):
        raise ComparativeSchemaError("contribution_snapshot must be a list")
    wallets: list[str] = []
    for item in snapshot:
        if not isinstance(item, dict) or set(item) != {"wallet_id", "contribution"}:
            raise ComparativeSchemaError("contribution_snapshot entries must be typed wallet records")
        wallet_id = item["wallet_id"]
        contribution = item["contribution"]
        if not isinstance(wallet_id, str) or not _is_int(contribution) or contribution < 0:
            raise ComparativeSchemaError("contribution_snapshot has invalid wallet data")
        wallets.append(wallet_id)
    if wallets != population:
        raise ComparativeSchemaError("contribution snapshot must match backer population order")
    if len(set(wallets)) != len(wallets):
        raise ComparativeSchemaError("contribution snapshot wallets must be unique")


def _validate_judge_state(record: dict[str, Any]) -> None:
    population = _string_list(record, "judge_population")
    stake = _require(record, "judge_stake_state")
    if not isinstance(stake, dict) or set(stake) != set(population):
        raise ComparativeSchemaError("judge_stake_state must cover the Judge population exactly")
    if any(not _is_int(value) or value < 0 for value in stake.values()):
        raise ComparativeSchemaError("judge stake values must be non-negative integers")
    control = _string_list(record, "judge_control_state")
    if not set(control).issubset(population):
        raise ComparativeSchemaError("judge_control_state contains an unknown Judge")
    for field in (
        "court1_initial_judges",
        "court1_reset_judges",
        "court1_final_judges",
        "court2_judges",
        "court2_reset_judges",
        "court2_final_judges",
    ):
        judges = _string_list(record, field)
        if not set(judges).issubset(population):
            raise ComparativeSchemaError(f"{field} contains a Judge outside the population")
        if judges and len(judges) != 3:
            raise ComparativeSchemaError(f"{field} must contain exactly three Judges when assigned")


def _validate_backer_observations(record: dict[str, Any]) -> None:
    value = _require(record, "backer_observations")
    if value is None:
        return
    if not isinstance(value, list):
        raise ComparativeSchemaError("backer_observations must be a list or null")
    population = record["backer_population"]
    ids: list[str] = []
    for item in value:
        expected = {
            "backer_id",
            "eligible",
            "private_signal",
            "participated",
            "ballot_preference",
            "cast_ballot",
        }
        if not isinstance(item, dict) or set(item) != expected:
            raise ComparativeSchemaError("backer observations have an invalid typed shape")
        if not isinstance(item["backer_id"], str):
            raise ComparativeSchemaError("backer_id must be a string")
        ids.append(item["backer_id"])
        if not _is_bool(item["eligible"]) or not _is_bool(item["private_signal"]):
            raise ComparativeSchemaError("backer eligibility and signal must be booleans")
        if not _is_bool(item["participated"]):
            raise ComparativeSchemaError("backer participation must be boolean")
        if item["ballot_preference"] not in {"ACCEPT", "APPEAL"}:
            raise ComparativeSchemaError("invalid backer ballot preference")
        if item["cast_ballot"] not in {None, "ACCEPT", "APPEAL"}:
            raise ComparativeSchemaError("invalid cast ballot")
        if item["cast_ballot"] is not None and (not item["eligible"] or not item["participated"]):
            raise ComparativeSchemaError("only eligible participating backers may cast ballots")
    if ids != population:
        raise ComparativeSchemaError("backer observations must cover the population in order")


def _validate_remediation_fields(record: dict[str, Any]) -> None:
    backer_total = _require(record, "backer_total_contribution")
    if not _is_int(backer_total) or backer_total < 0:
        raise ComparativeSchemaError("backer_total_contribution must be a non-negative integer")
    snapshot_total = sum(item["contribution"] for item in record["contribution_snapshot"])
    if backer_total != snapshot_total:
        raise ComparativeSchemaError("backer_total_contribution must equal the snapshot total")

    requested = _nullable_number(record, "overlap_ratio_requested")
    realized = _nullable_number(record, "overlap_ratio_realized")
    overlap_count = _require(record, "overlap_judge_count")
    if requested is None or not 0.0 <= requested <= 1.0:
        raise ComparativeSchemaError("overlap_ratio_requested must be in [0, 1]")
    if realized is None or not 0.0 <= realized <= 1.0:
        raise ComparativeSchemaError("overlap_ratio_realized must be in [0, 1]")
    if not _is_int(overlap_count) or overlap_count < 0:
        raise ComparativeSchemaError("overlap_judge_count must be a non-negative integer")
    creator_id = _string(record, "creator_id")
    if creator_id not in record["judge_population"]:
        raise ComparativeSchemaError("creator_id must be in judge_population")
    judge_population = set(record["judge_population"]) - {creator_id}
    if len(judge_population) != record["judge_pool_size"]:
        raise ComparativeSchemaError("judge_pool_size must equal eligible Judge population size")
    if overlap_count > record["judge_pool_size"]:
        raise ComparativeSchemaError("overlap_judge_count cannot exceed judge_pool_size")
    overlap_judges = _string_list(record, "judge_backer_overlap_judges")
    if len(overlap_judges) != overlap_count or not set(overlap_judges).issubset(judge_population):
        raise ComparativeSchemaError("judge_backer_overlap_judges does not match the overlap count")
    if abs(realized - overlap_count / record["judge_pool_size"]) > 1e-12:
        raise ComparativeSchemaError("overlap_ratio_realized does not match the overlap count")
    backer_population = set(record["backer_population"])
    if set(overlap_judges) != backer_population & judge_population:
        raise ComparativeSchemaError("backer population does not match the recorded overlap identities")

    for field in (
        "court1_assignee_count",
        "dao_eligible_judge_count",
        "dao_voting_judge_count",
        "court2_eligible_judges_before_dao",
        "court2_eligible_judges_after_dao",
        "court2_excluded_by_court1_count",
        "court2_excluded_by_dao_count",
        "court2_excluded_by_creator_count",
    ):
        value = _nullable_int(record, field)
        if value is not None and value < 0:
            raise ComparativeSchemaError(f"{field} must not be negative")
    history = set(record["court1_initial_judges"]) | set(record["court1_reset_judges"])
    if record["court1_assignee_count"] != len(history):
        raise ComparativeSchemaError("court1_assignee_count must cover initial and reset history")

    attempted = _require(record, "court2_assignment_attempted")
    succeeded = _require(record, "court2_assignment_succeeded")
    if not _is_bool(attempted) or not _is_bool(succeeded):
        raise ComparativeSchemaError("Court 2 assignment accounting must be boolean")
    exhaustion = _nullable_string(record, "court2_exhaustion_reason")
    if exhaustion is not None and exhaustion not in COURT2_EXHAUSTION_REASONS:
        raise ComparativeSchemaError("invalid court2_exhaustion_reason")

    if record["model"] != "B2":
        if any(record[field] is not None for field in (
            "dao_eligible_judge_count",
            "dao_voting_judge_count",
            "court2_eligible_judges_before_dao",
            "court2_eligible_judges_after_dao",
            "court2_excluded_by_court1_count",
            "court2_excluded_by_dao_count",
            "court2_excluded_by_creator_count",
        )):
            raise ComparativeSchemaError("Court 2 eligibility diagnostics must be null outside B2")
        if attempted or succeeded or exhaustion is not None:
            raise ComparativeSchemaError("Court 2 assignment diagnostics must be inactive outside B2")
        return

    if record["dao_finalized"] is not True:
        if any(record[field] is not None for field in (
            "dao_eligible_judge_count",
            "dao_voting_judge_count",
            "court2_eligible_judges_before_dao",
            "court2_eligible_judges_after_dao",
            "court2_excluded_by_court1_count",
            "court2_excluded_by_dao_count",
            "court2_excluded_by_creator_count",
        )):
            raise ComparativeSchemaError("unfinalized DAO cannot have Court 2 eligibility diagnostics")
        return

    voters = set(record["dao_voters"] or [])
    overlap_set = set(overlap_judges)
    before = judge_population - history
    after = before - voters
    if record["dao_eligible_judge_count"] != len(overlap_set - history):
        raise ComparativeSchemaError("dao_eligible_judge_count is inconsistent")
    if record["dao_voting_judge_count"] != len(overlap_set & voters):
        raise ComparativeSchemaError("dao_voting_judge_count is inconsistent")
    if record["court2_eligible_judges_before_dao"] != len(before):
        raise ComparativeSchemaError("court2_eligible_judges_before_dao is inconsistent")
    if record["court2_eligible_judges_after_dao"] != len(after):
        raise ComparativeSchemaError("court2_eligible_judges_after_dao is inconsistent")
    if record["court2_excluded_by_court1_count"] != len(history & judge_population):
        raise ComparativeSchemaError("court2_excluded_by_court1_count is inconsistent")
    if record["court2_excluded_by_dao_count"] != len(voters & before):
        raise ComparativeSchemaError("court2_excluded_by_dao_count is inconsistent")
    if record["court2_excluded_by_creator_count"] != int(creator_id in record["judge_population"]):
        raise ComparativeSchemaError("court2_excluded_by_creator_count is inconsistent")
    if record["court2_opened"] is False and (attempted or succeeded or exhaustion is not None):
        raise ComparativeSchemaError("Court 2 assignment diagnostics require an opened appeal")
    if record["court2_opened"] and not attempted:
        raise ComparativeSchemaError("opened Court 2 must record an assignment attempt")
    if record["court2_final_valid"] and not succeeded:
        raise ComparativeSchemaError("valid Court 2 requires a successful assignment")
    if record["final_state"] == "PROTOCOL_FAIL" and record["court2_opened"] and exhaustion is None:
        raise ComparativeSchemaError("Court 2 protocol failure requires an exhaustion reason")
    if record["final_state"] != "PROTOCOL_FAIL" and exhaustion is not None:
        raise ComparativeSchemaError("substantive Court 2 completion cannot have an exhaustion reason")


def validate_comparative_record(record: object) -> dict[str, Any]:
    if not isinstance(record, dict):
        raise ComparativeSchemaError("record must be an object")
    missing = REQUIRED_FIELDS - record.keys()
    if missing:
        raise ComparativeSchemaError(f"missing fields: {sorted(missing)}")
    schema_version = _string(record, "schema_version")
    if schema_version not in SUPPORTED_SCHEMA_VERSIONS:
        raise ComparativeSchemaError("unsupported schema_version")
    if schema_version == SCHEMA_VERSION:
        missing_remediation = REMEDIATION_FIELDS - record.keys()
        if missing_remediation:
            raise ComparativeSchemaError(f"missing remediation fields: {sorted(missing_remediation)}")
    if _string(record, "experiment_id") != "SIM-01":
        raise ComparativeSchemaError("record has the wrong experiment_id")
    for field in ("model_version", "workflow_model_version", "base_case_id", "treatment_id", "random_stream_version"):
        _string(record, field)
    replication_id = _require(record, "replication_id")
    seed = _require(record, "seed")
    if not _is_int(replication_id) or replication_id < 0:
        raise ComparativeSchemaError("replication_id must be a non-negative integer")
    if not _is_int(seed) or seed < 0:
        raise ComparativeSchemaError("seed must be a non-negative integer")
    model = _string(record, "model")
    treatment = _string(record, "treatment_id")
    ground_truth = _string(record, "ground_truth")
    if model not in MODELS or treatment not in TREATMENTS or ground_truth not in VERDICTS:
        raise ComparativeSchemaError("invalid model, treatment, or ground truth enum")
    case_latent = _nullable_number(record, "case_latent")
    accuracy = _nullable_number(record, "judge_accuracy_configured")
    rho = _nullable_number(record, "rho_configured")
    nonreveal = _nullable_number(record, "nonreveal_configured")
    sensitivity = _nullable_number(record, "signal_sensitivity")
    false_alarm = _nullable_number(record, "signal_false_alarm")
    for field, value in (("judge_accuracy_configured", accuracy), ("rho_configured", rho), ("nonreveal_configured", nonreveal), ("signal_sensitivity", sensitivity), ("signal_false_alarm", false_alarm)):
        if value is None or not 0.0 <= value <= 1.0:
            raise ComparativeSchemaError(f"{field} must be a non-null probability in [0, 1]")
    if rho == 0.0 and case_latent is not None:
        raise ComparativeSchemaError("rho=0 must retain a null case_latent")
    if rho > 0.0 and case_latent is None:
        raise ComparativeSchemaError("rho>0 requires case_latent")
    attacker_capital = _require(record, "attacker_capital")
    if not _is_int(attacker_capital) or attacker_capital < 0:
        raise ComparativeSchemaError("attacker_capital must be a non-negative integer")
    _string(record, "judge_pool_level")
    judge_pool_size = _require(record, "judge_pool_size")
    if not _is_int(judge_pool_size) or judge_pool_size < 3:
        raise ComparativeSchemaError("judge_pool_size must be an integer of at least three")
    _validate_judge_state(record)
    _validate_wallets(record)
    _validate_backer_observations(record)
    if schema_version == SCHEMA_VERSION:
        _validate_remediation_fields(record)

    for field in ("court1_initial_valid", "court1_reset_valid", "court1_final_valid", "court2_opened", "court2_valid", "court2_reset_valid", "court2_final_valid", "payout_assumed", "substantively_resolved", "terminally_complete"):
        value = _require(record, field)
        if not _is_bool(value):
            raise ComparativeSchemaError(f"{field} must be boolean")
    for field in ("court1_initial_verdict", "court1_reset_verdict", "court1_verdict", "court2_verdict", "court2_reset_verdict", "court2_final_verdict", "final_verdict"):
        value = _nullable_string(record, field)
        if value is not None and value not in VERDICTS:
            raise ComparativeSchemaError(f"{field} has an invalid verdict")
    final_state = _string(record, "final_state")
    if final_state not in FINAL_STATES:
        raise ComparativeSchemaError("invalid final_state")
    failure_reason = _nullable_string(record, "failure_reason")
    if failure_reason is not None and failure_reason not in FAILURE_REASONS:
        raise ComparativeSchemaError("invalid failure_reason")

    for field in ("dao_finalized",):
        value = _require(record, field)
        if value is not None and not _is_bool(value):
            raise ComparativeSchemaError(f"{field} must be boolean or null")
    dao_decision = _nullable_string(record, "dao_decision")
    if dao_decision is not None and dao_decision not in DAO_DECISIONS:
        raise ComparativeSchemaError("invalid dao_decision")
    for field in ("dao_eligible_wallets", "dao_voters"):
        _nullable_string_list(record, field)
    for field in ("dao_total_weight", "dao_cast_weight", "dao_accept_weight", "dao_appeal_weight", "ballots_cast"):
        value = _nullable_int(record, field)
        if value is not None and value < 0:
            raise ComparativeSchemaError(f"{field} must not be negative")

    counts = ("courts_attempted", "valid_courts", "procedural_resets", "assigned_judge_seats", "court2_assignments", "valid_court_rewards")
    for field in counts:
        value = _require(record, field)
        if not _is_int(value) or value < 0:
            raise ComparativeSchemaError(f"{field} must be a non-negative integer")
    if record["terminally_complete"] is not True:
        raise ComparativeSchemaError("SIM-01 records must have exactly one terminal state")
    if final_state == "PROTOCOL_FAIL":
        if record["substantively_resolved"] or record["final_verdict"] is not None:
            raise ComparativeSchemaError("PROTOCOL_FAIL cannot be substantive")
        if failure_reason is None:
            raise ComparativeSchemaError("PROTOCOL_FAIL requires a failure reason")
    else:
        if not record["substantively_resolved"] or record["final_verdict"] is None:
            raise ComparativeSchemaError("substantive final state requires a final verdict")
        if failure_reason is not None:
            raise ComparativeSchemaError("substantive final state cannot have a failure reason")
    expected_final = "FINAL_PASS" if record["final_verdict"] == "PASS" else "VERDICT_FAIL" if record["final_verdict"] == "FAIL" else "PROTOCOL_FAIL"
    if final_state != expected_final:
        raise ComparativeSchemaError("final_state and final_verdict disagree")
    if record["court2_opened"] and not (model == "B2" and dao_decision == "APPEAL" and record["dao_finalized"] is True):
        raise ComparativeSchemaError("court2_opened requires finalized B2 APPEAL")
    if dao_decision == "ACCEPT" and record["court2_opened"]:
        raise ComparativeSchemaError("DAO ACCEPT cannot coexist with Court 2")
    if model != "B2":
        for field in ("dao_finalized", "dao_decision", "dao_eligible_wallets", "dao_voters", "dao_total_weight", "dao_cast_weight", "dao_accept_weight", "dao_appeal_weight", "backer_observations", "ballots_cast", "court2_opened", "court2_judges", "court2_valid", "court2_verdict", "court2_reset_judges", "court2_reset_valid", "court2_reset_verdict", "court2_final_judges", "court2_final_valid", "court2_final_verdict"):
            if field in {"court2_opened", "court2_valid", "court2_reset_valid", "court2_final_valid"}:
                continue
            if record[field] is not None and record[field] != []:
                raise ComparativeSchemaError(f"{field} must be null/not applicable outside B2")
        if record["ballots_cast"] is not None:
            raise ComparativeSchemaError("ballots_cast must be null when DAO is not modeled")
    else:
        if record["dao_finalized"] is True and record["dao_decision"] is None:
            raise ComparativeSchemaError("finalized DAO requires a decision")
        if record["dao_decision"] is not None and record["backer_observations"] is None:
            raise ComparativeSchemaError("DAO decision requires generated backer observations")
    initial = record["court1_initial_judges"]
    reset = record["court1_reset_judges"]
    if record["court1_initial_valid"] and record["court1_reset_judges"]:
        raise ComparativeSchemaError("valid Court 1 cannot also execute a reset")
    if reset and set(initial) & set(reset):
        raise ComparativeSchemaError("Court 1 reset must exclude prior assignees")
    court1_history = set(initial) | set(reset)
    if record["court2_opened"]:
        court2_history = set(record["court2_judges"]) | set(record["court2_reset_judges"])
        if court1_history & court2_history:
            raise ComparativeSchemaError("Court 2 must exclude all Court 1 assignees")
        if set(record["dao_voters"]) & court2_history:
            raise ComparativeSchemaError("Court 2 must exclude actual DAO voters")
        if record["court2_judges"] and record["court2_reset_judges"] and set(record["court2_judges"]) & set(record["court2_reset_judges"]):
            raise ComparativeSchemaError("Court 2 reset must exclude prior Court 2 assignees")
    if record["valid_court_rewards"] != record["valid_courts"]:
        raise ComparativeSchemaError("valid court rewards must equal valid courts exactly once")
    if record["model"] == "B0" and record["procedural_resets"] != 0:
        raise ComparativeSchemaError("B0 cannot reset")
    if record["model"] in {"B0", "B1"} and record["court2_assignments"] != 0:
        raise ComparativeSchemaError("B0/B1 cannot assign Court 2")
    return record


def validate_comparative_records(records: Iterable[object]) -> int:
    count = 0
    keys: set[tuple[object, ...]] = set()
    for record in records:
        validated = validate_comparative_record(record)
        identity_fields = ("experiment_id", "replication_id", "treatment_id", "model")
        if validated["schema_version"] == SCHEMA_VERSION:
            identity_fields += ("overlap_ratio_requested",)
        key = tuple(validated[field] for field in identity_fields)
        if key in keys:
            raise ComparativeSchemaError(f"duplicate experimental record identity: {key}")
        keys.add(key)
        count += 1
    if count == 0:
        raise ComparativeSchemaError("comparative JSONL is empty")
    return count


def validate_comparative_jsonl_schema(path: str | Path) -> int:
    records: list[dict[str, Any]] = []
    with Path(path).open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                record = json.loads(line)
                records.append(record)
            except json.JSONDecodeError as error:
                raise ComparativeSchemaError(f"line {line_number} is not valid JSON: {error}") from error
    return validate_comparative_records(records)
