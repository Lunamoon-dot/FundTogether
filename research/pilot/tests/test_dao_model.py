import pytest

from fundtogether_pilot.backer_model import ACCEPT, APPEAL
from fundtogether_pilot.dao_model import UINT128_MAX, BackerDao, WalletSnapshot, evaluate_vector


def test_zero_electorate_and_zero_effective_weight_default_accept() -> None:
    assert BackerDao([]).finalize().decision == ACCEPT
    assert BackerDao([WalletSnapshot("dust", 0)]).finalize().decision == ACCEPT


def test_below_exact_and_above_threshold_use_integer_cross_products() -> None:
    below = BackerDao(
        [WalletSnapshot("voter", 19**2), WalletSnapshot("abstainer", 81**2)]
    )
    below.cast("voter", APPEAL)
    assert below.finalize().decision == ACCEPT

    exact = BackerDao(
        [WalletSnapshot("voter", 20**2), WalletSnapshot("abstainer", 80**2)]
    )
    exact.cast("voter", APPEAL)
    assert exact.finalize().decision == APPEAL

    above = BackerDao(
        [WalletSnapshot("voter", 21**2), WalletSnapshot("abstainer", 79**2)]
    )
    above.cast("voter", APPEAL)
    assert above.finalize().decision == APPEAL


def test_tie_defaults_accept() -> None:
    result = evaluate_vector([1, 4, 9], [ACCEPT, ACCEPT, APPEAL])
    assert (result.accept_weight, result.appeal_weight, result.decision) == (3, 3, ACCEPT)


def test_cap_duplicate_and_ineligible_ballots_reject() -> None:
    with pytest.raises(ValueError, match="cap"):
        BackerDao([WalletSnapshot("over", UINT128_MAX + 1)])
    dao = BackerDao([WalletSnapshot("eligible", 4), WalletSnapshot("judge", 9, True)])
    dao.cast("eligible", ACCEPT)
    with pytest.raises(ValueError, match="duplicate"):
        dao.cast("eligible", APPEAL)
    with pytest.raises(ValueError, match="ineligible"):
        dao.cast("judge", ACCEPT)


def test_snapshot_is_immutable_from_caller_data() -> None:
    wallets = [WalletSnapshot("backer", 1_000_000)]
    dao = BackerDao(wallets)
    wallets[0] = WalletSnapshot("backer", 9_000_000)
    assert dao.total_weight == 1_000
