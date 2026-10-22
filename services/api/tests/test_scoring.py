from datetime import datetime, timezone

import pytest

from aisa.models import Category, Criterion as C, FitRules, Profile, Thresholds, default_rules, weights_valid
from aisa.scoring import categorize, compute_score, fit_check, format_idr

RULES = default_rules(datetime.now(timezone.utc))
W = RULES.weights
T = Thresholds()


def vals(m=3, k=3, r=3, re=3, d=3):
    return {C.manajemen: m, C.kinerja: k, C.risiko: r, C.rencana: re, C.dampak: d}


def test_score_bounds_and_baseline_weights():
    assert compute_score(W, vals(1, 1, 1, 1, 1)) == 0.0
    assert compute_score(W, vals(5, 5, 5, 5, 5)) == 100.0
    assert compute_score(W, vals(3, 3, 3, 3, 3)) == 50.0
    # .25*.75 + .20*.5 + .20*.5 + .25*.75 + .10*.75 = 0.65
    assert compute_score(W, vals(4, 3, 3, 4, 4)) == 65.0
    # A deck silent on impact (dampak 1) loses only its 10% weight.
    assert compute_score(W, vals(5, 5, 5, 5, 1)) == 90.0


def test_default_weights_follow_the_guide():
    assert list(W) == [C.manajemen, C.kinerja, C.risiko, C.rencana, C.dampak]
    assert [W[c] for c in C] == [0.25, 0.20, 0.20, 0.25, 0.10]
    assert set(RULES.anchors) == set(C)


def test_score_rejects_out_of_range_and_missing():
    with pytest.raises(ValueError):
        compute_score(W, vals(6))
    with pytest.raises(ValueError):
        compute_score(W, {C.manajemen: 3})


def test_weights_valid():
    assert weights_valid(W)
    assert not weights_valid({**W, C.manajemen: 0.3})
    assert not weights_valid({k: v for k, v in W.items() if k != C.manajemen})


@pytest.mark.parametrize("score,expected", [
    (100, Category.sangat_layak),
    (85, Category.sangat_layak),
    (84.9, Category.layak_bersyarat),
    (75, Category.layak_bersyarat),
    (74.9, Category.perlu_penyesuaian),
    (65, Category.perlu_penyesuaian),
    (64.9, Category.risiko_tinggi),
    (50, Category.risiko_tinggi),
    (49.9, Category.tidak_layak),
    (0, Category.tidak_layak),
])
def test_categorize_bands(score, expected):
    assert categorize(score, T) == expected


def test_categorize_uses_the_rules_thresholds():
    t = Thresholds(sangatLayak=90, layakBersyarat=80, perluPenyesuaian=60, risikoTinggi=40)
    assert categorize(85, t) == Category.layak_bersyarat
    assert categorize(45, t) == Category.risiko_tinggi


@pytest.mark.parametrize("bad", [
    {"sangatLayak": 75, "layakBersyarat": 75},           # not strictly descending
    {"perluPenyesuaian": 80},                             # above layakBersyarat
    {"sangatLayak": 101},                                 # above 100
    {"risikoTinggi": 0},                                  # 0 is not in (0, 100]
    {"risikoTinggi": -5},
])
def test_thresholds_must_descend_within_0_100(bad):
    with pytest.raises(ValueError):
        Thresholds(**bad)


def test_thresholds_default_and_top_at_100():
    assert Thresholds().model_dump() == {"sangatLayak": 85, "layakBersyarat": 75,
                                         "perluPenyesuaian": 65, "risikoTinggi": 50}
    Thresholds(sangatLayak=100)


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
