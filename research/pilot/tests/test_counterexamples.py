from fundtogether_pilot.court_model import settle_ccps
from fundtogether_pilot.dao_model import deterministic_counterexamples


def test_q6_and_q10_reproduce_foundry_vectors() -> None:
    results = {row["scenario_id"]: row for row in deterministic_counterexamples()}
    assert results["Q6"]["appeal_weight_before"] == 3_000
    assert results["Q6"]["appeal_weight_after"] == 9_000
    assert results["Q6"]["total_contribution_before"] == results["Q6"]["total_contribution_after"]
    assert results["Q10"]["dao_decision_before"] == "ACCEPT"
    assert results["Q10"]["dao_decision_after"] == "APPEAL"
    assert results["Q10"]["total_contribution_before"] == results["Q10"]["total_contribution_after"]
    assert all(row["result"] == "PASS" for row in results.values())


def test_r3_same_actor_recaptures_finalizer_allowance_before_gas() -> None:
    controlled = ("A", "B", "C", "FINALIZER")
    result = settle_ccps(
        ("A", "B", "C"),
        ("A", "B", "C"),
        finalizer_id="FINALIZER",
        disruption_allowance=10,
        finalization_allowance=3,
        case_stake_requirement=23,
        deposited_stake=50,
        attacker_controlled_ids=controlled,
    )
    assert result.locked_stake_per_judge == 23
    assert result.penalties == {"A": 1, "B": 1, "C": 1}
    assert result.compensation == {"FINALIZER": 3}
    assert result.gross_slash == 3
    assert result.net_attacker_loss_before_gas == 0
    assert result.milestone_escrow_effect == 0


def test_ccps_rejects_undercollateralized_assignment() -> None:
    try:
        settle_ccps(
            ("A", "B", "C"),
            ("A",),
            finalizer_id="F",
            disruption_allowance=10,
            finalization_allowance=3,
            case_stake_requirement=23,
            deposited_stake=22,
        )
    except ValueError as error:
        assert "collateral" in str(error)
    else:
        raise AssertionError("undercollateralized CCPS assignment was accepted")
