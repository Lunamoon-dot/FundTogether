import numpy as np
import pytest

from fundtogether_pilot.court_model import evaluate_court
from fundtogether_pilot.judge_model import FAIL, JudgeModel
from fundtogether_pilot.random_streams import KeyedRandom


@pytest.mark.parametrize(
    "accuracy,rho",
    [(0.0, 0.2), (1.0, 0.2), (0.7, -0.1), (0.7, 1.0)],
)
def test_invalid_beta_bernoulli_parameters_reject(accuracy: float, rho: float) -> None:
    with pytest.raises(ValueError):
        JudgeModel(KeyedRandom(1), accuracy, rho)


def test_rho_zero_is_independent_bernoulli_without_case_latent() -> None:
    random = KeyedRandom(20261027)
    model = JudgeModel(random, 0.70, 0.0)
    left = []
    right = []
    for replication_id in range(3000):
        case = model.create_case(replication_id, "rho-zero")
        assert case.shared_probability is None
        left.append(model.observe(case, "judge-left").correct)
        right.append(model.observe(case, "judge-right").correct)
    assert abs(float(np.corrcoef(left, right)[0, 1])) < 0.06


def test_shared_case_model_reproduces_marginal_and_correlation() -> None:
    random = KeyedRandom(20261027)
    model = JudgeModel(random, 0.70, 0.30)
    left = []
    right = []
    for replication_id in range(5000):
        case = model.create_case(replication_id, "shared")
        left.append(model.observe(case, "judge-left").correct)
        right.append(model.observe(case, "judge-right").correct)
    assert abs(float(np.mean(left + right)) - 0.70) < 0.03
    assert abs(float(np.corrcoef(left, right)[0, 1]) - 0.30) < 0.07


def test_fresh_courts_share_case_latent_without_identity_overlap() -> None:
    random = KeyedRandom(20261027)
    model = JudgeModel(random, 0.70, 0.30)
    court1_first = []
    court2_first = []
    for replication_id in range(3000):
        case = model.create_case(replication_id, "courts")
        court1 = [model.observe(case, f"court1-{i}") for i in range(3)]
        court2 = [model.observe(case, f"court2-{i}") for i in range(3)]
        assert not {item.judge_id for item in court1} & {item.judge_id for item in court2}
        court1_first.append(court1[0].correct)
        court2_first.append(court2[0].correct)
    assert float(np.corrcoef(court1_first, court2_first)[0, 1]) > 0.20


def test_nonreveal_invalidates_court_without_substantive_fail() -> None:
    model = JudgeModel(KeyedRandom(9), 0.70, 0.30, 1.0)
    case = model.create_case(0, "invalid")
    result = evaluate_court(model.observe(case, f"judge-{i}") for i in range(3))
    assert not result.valid
    assert result.verdict is None


def test_collusion_changes_vote_target_but_not_truth() -> None:
    model = JudgeModel(KeyedRandom(2), 0.70, 0.30)
    case = model.create_case(0, "collusion")
    observation = model.observe(case, "attacker", colluding=True, attacker_target=FAIL)
    assert observation.potential_vote == FAIL
    assert case.truth in ("PASS", "FAIL")


def test_coordinated_nonreveal_uses_one_group_control() -> None:
    model = JudgeModel(KeyedRandom(3), 0.70, 0.30)
    for replication_id in range(100):
        case = model.create_case(replication_id, "coordinated")
        flags = {
            model.observe(
                case,
                f"judge-{index}",
                coordinated_nonreveal=True,
                coordinated_probability=0.25,
            ).nonreveal
            for index in range(3)
        }
        assert len(flags) == 1
