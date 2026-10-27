import pytest

from fundtogether_pilot.backer_model import ACCEPT, APPEAL, BackerBehavior, SignalOracle
from fundtogether_pilot.dao_model import BackerDao, WalletSnapshot
from fundtogether_pilot.random_streams import KeyedRandom


def test_signal_oracle_validates_rates() -> None:
    with pytest.raises(ValueError):
        SignalOracle(KeyedRandom(1), 1.1, 0.2)


def test_backer_behavior_receives_signal_not_truth() -> None:
    behavior = BackerBehavior(KeyedRandom(1), 1.0)
    appeal = behavior.observe(0, "signal", "backer", True)
    accept = behavior.observe(0, "signal", "backer-2", False)
    assert appeal.ballot_preference == APPEAL
    assert appeal.cast_ballot == APPEAL
    assert accept.ballot_preference == ACCEPT


def test_zero_conditioning_class_is_not_fabricated_by_model_api() -> None:
    oracle = SignalOracle(KeyedRandom(1), 0.8, 0.2)
    observed = [oracle.generate(i, "only-correct", "b", court_incorrect=False) for i in range(20)]
    assert len(observed) == 20


def test_misleading_signal_can_trigger_harmful_appeal() -> None:
    random = KeyedRandom(4)
    oracle = SignalOracle(random, sensitivity=0.0, false_alarm=1.0)
    behavior = BackerBehavior(random, participation_probability=1.0)
    dao = BackerDao([WalletSnapshot(f"b-{i}", 1_000_000) for i in range(3)])
    for index in range(3):
        backer_id = f"b-{index}"
        signal = oracle.generate(0, "misleading", backer_id, court_incorrect=False)
        ballot = behavior.observe(0, "misleading", backer_id, signal).cast_ballot
        assert ballot is not None
        dao.cast(backer_id, ballot)
    assert dao.finalize().decision == APPEAL
