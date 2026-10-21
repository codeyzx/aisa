from datetime import datetime, timezone

import pytest

from aisa.models import Category, Criterion as C, FitRules, Profile, Thresholds, default_rules, weights_valid
from aisa.scoring import categorize, compute_score, fit_check, format_idr

RULES = default_rules(datetime.now(timezone.utc))
W = RULES.weights
T = Thresholds()


def vals(t=3, p=3, pr=3, tr=3, b=3):
    return {C.tim: t, C.pasar: p, C.produk: pr, C.traksi: tr, C.bisnis: b}


def test_score_bounds_and_baseline_weights():
    assert compute_score(W, vals(1, 1, 1, 1, 1)) == 0.0
    assert compute_score(W, vals(5, 5, 5, 5, 5)) == 100.0
    assert compute_score(W, vals(3, 3, 3, 3, 3)) == 50.0
    # 0.275*.75 + .30*.5 + .20*.5 + .125*.75 + .10*.75 = 0.625
    assert compute_score(W, vals(4, 3, 3, 4, 4)) == 62.5


def test_score_rejects_out_of_range_and_missing():
    with pytest.raises(ValueError):
        compute_score(W, vals(6))
    with pytest.raises(ValueError):
        compute_score(W, {C.tim: 3})


def test_weights_valid():
    assert weights_valid(W)
    assert not weights_valid({**W, C.tim: 0.3})
    assert not weights_valid({k: v for k, v in W.items() if k != C.tim})


@pytest.mark.parametrize("score,v,fit,expected", [
    (85, vals(5, 5, 4, 4, 4), True, (Category.sangat_cocok, False)),
    (80, vals(5, 5, 4, 4, 2), True, (Category.sangat_cocok, False)),
    (85, vals(5, 5, 5, 5, 1), True, (Category.cocok, False)),   # >=80 but a criterion = 1
    (70, vals(), True, (Category.cocok, False)),
    (65, vals(), True, (Category.cocok, False)),
    (64.9, vals(), True, (Category.kurang_cocok, False)),
    (45, vals(), True, (Category.kurang_cocok, False)),
    (44.9, vals(), True, (Category.tidak_cocok, False)),
    (79, vals(), False, (Category.tidak_cocok, True)),          # berkualitas, di luar fokus
    (65, vals(), False, (Category.tidak_cocok, True)),
    (64.9, vals(), False, (Category.tidak_cocok, False)),
    (95, vals(5, 5, 5, 5, 5), False, (Category.tidak_cocok, True)),
])
def test_categorize(score, v, fit, expected):
    assert categorize(score, v, fit, T) == expected


FIT = FitRules(sectors=["agritech", "fintech"], stages=["pre-seed", "seed", "seri-a"],
               fundingMinIdr=1_000_000_000, fundingMaxIdr=20_000_000_000)


def test_fit_pass():
    f = fit_check(Profile(sector="Agritech", stage="Pre Seed", fundingAskIdr=5_000_000_000), FIT)
    assert f.passed


def test_fit_missing_fields_fail_as_tidak_disebut():
    f = fit_check(Profile(), FIT)
    assert not f.passed
    assert f.checks.sector.reason == f.checks.stage.reason == f.checks.funding.reason == "tidak disebut"


def test_fit_out_of_focus():
    f = fit_check(Profile(sector="f&b", stage="seri-b", fundingAskIdr=24_000_000_000), FIT)
    assert not f.passed
    assert not f.checks.sector.passed and not f.checks.stage.passed and not f.checks.funding.passed
    edge = fit_check(Profile(sector="fintech", stage="seed", fundingAskIdr=20_000_000_000), FIT)
    assert edge.passed


def test_format_idr():
    assert format_idr(5_000_000_000) == "Rp5 M"
    assert format_idr(2_500_000_000) == "Rp2,5 M"
    assert format_idr(750_000_000) == "Rp750 jt"
