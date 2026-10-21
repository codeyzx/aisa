"""The "Yang menarik:" line when no sector trend clears MIN_INSIGHT_COUNT: each fallback,
their fixed order, and that every number comes from code."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from aisa.digest import (
    DigestData,
    Item,
    Seen,
    fallback_candidates,
    insight_candidates,
    numbers_ok,
    template,
    template_insight,
)
from aisa.models import Category

NOW = datetime(2026, 10, 21, 10, 0, tzinfo=UTC)  # 17.00 WIB
LAST_DIGEST = NOW - timedelta(hours=8)


def seen(cat=None, *, days=0.1, sector=None, score=None, responded=False):
    return Seen(at=NOW - timedelta(days=days), sector=sector, category=cat, score=score,
                responded=responded)


def digest_data(groups=None, qof=(), manual=(), window_start=LAST_DIGEST):
    g = {c: [] for c in Category}
    for c, items in (groups or {}).items():
        g[c] = list(items)
    return DigestData(slot="17.00", salutation="Ibu", window_start=window_start, groups=g,
                      quality_outside_focus=list(qof), manual=list(manual), baru_masuk=0, at=NOW)


def only(cands):
    assert len(cands) == 1
    return cands[0]


# ---------- (a) new proposals that landed in Sangat cocok / Cocok ----------

def test_a_share_of_new_good_proposals_with_top_sector():
    rows = [seen("sangat_cocok", sector="edtech"), seen("cocok", sector="edtech"),
            seen("cocok", sector="fintech"), seen("kurang_cocok", sector="edtech"),
            seen("tidak_cocok"), seen(None),
            # before the last ringkasan: not new
            seen("sangat_cocok", days=2, sector="agritech")]
    c = only(fallback_candidates(rows, digest_data(), NOW))
    assert c == {"jenis": "proposalBaruCocok", "proposalBaru": 6, "sangatCocok": 1, "cocok": 2,
                 "sektorTerbanyak": "edtech", "jumlahSektorTerbanyak": 2}
    assert template_insight([c]) == (
        "3 dari 6 proposal baru masuk Sangat cocok atau Cocok, terbanyak dari sektor edtech.")


def test_a_tied_sectors_name_none_and_single_category_wording():
    rows = [seen("cocok", sector="edtech"), seen("cocok", sector="fintech"), seen("kurang_cocok")]
    c = only(fallback_candidates(rows, digest_data(), NOW))
    assert "sektorTerbanyak" not in c
    assert template_insight([c]) == "2 dari 3 proposal baru masuk Cocok."
    one = only(fallback_candidates([seen("sangat_cocok", sector="edtech"), seen(None)],
                                   digest_data(), NOW))
    assert template_insight([one]) == "1 dari 2 proposal baru masuk Sangat cocok, dari sektor edtech."


def test_a_before_the_first_ringkasan_every_proposal_is_new():
    rows = [seen("cocok", days=30, sector="edtech"), seen("kurang_cocok", days=20)]
    c = only(fallback_candidates(rows, digest_data(window_start=None), NOW))
    assert c["proposalBaru"] == 2 and c["cocok"] == 1


# ---------- (b) average skor kualitas, this week vs last week ----------

def test_b_average_score_week_over_week():
    rows = ([seen("kurang_cocok", days=1, score=s) for s in (60.0, 70.0, 80.5)]
            + [seen("kurang_cocok", days=9, score=s) for s in (50.0, 55.0, 61.0, 70.0)])
    c = only(fallback_candidates(rows, digest_data(), NOW))
    assert c == {"jenis": "rataRataSkor", "mingguIni": "70,2", "jumlahMingguIni": 3,
                 "mingguLalu": "59", "jumlahMingguLalu": 4}
    assert template_insight([c]) == ("rata-rata skor kualitas proposal minggu ini 70,2 (3 proposal), "
                                     "naik dari 59 minggu lalu (4 proposal).")


def test_b_needs_three_scored_in_both_weeks():
    rows = ([seen("kurang_cocok", days=1, score=60.0)] * 3
            + [seen("kurang_cocok", days=9, score=50.0)] * 2 + [seen(None, days=9)])
    assert fallback_candidates(rows, digest_data(), NOW)[0]["jenis"] != "rataRataSkor"


def test_b_lower_and_equal_wording():
    down = {"jenis": "rataRataSkor", "mingguIni": "55,5", "jumlahMingguIni": 3,
            "mingguLalu": "60", "jumlahMingguLalu": 3}
    assert "turun dari 60 minggu lalu" in template_insight([down])
    assert "sama dengan 60 minggu lalu" in template_insight([{**down, "mingguIni": "60"}])


# ---------- (c) Berkualitas, di luar fokus / Perlu dicek manual ----------

def test_c_unresponded_needing_attention():
    q = Item("q", "Kopi Rakyat", 79)
    d = digest_data({Category.tidak_cocok: [q]}, qof=[q], manual=[Item("m", "Arsip", 0)])
    c = only(fallback_candidates([seen("tidak_cocok", days=3)], d, NOW))
    assert c == {"jenis": "perluPerhatian", "berkualitasDiLuarFokus": 1, "perluDicekManual": 1}
    assert template_insight([c]) == (
        "ada 1 proposal Berkualitas, di luar fokus dan 1 proposal Perlu dicek manual yang belum ditanggapi.")
    only_manual = {**c, "berkualitasDiLuarFokus": 0}
    assert template_insight([only_manual]) == "ada 1 proposal Perlu dicek manual yang belum ditanggapi."


# ---------- (d) highest-scoring unresponded ----------

def test_d_highest_scoring_unresponded():
    d = digest_data({Category.kurang_cocok: [Item("x", "Tani Maju", 85.6), Item("y", "B", 40)],
                     Category.tidak_cocok: [Item("z", "C", 30)]})
    c = only(fallback_candidates([seen("kurang_cocok", days=3)], d, NOW))
    assert c == {"jenis": "skorTertinggi", "nama": "Tani Maju", "skor": "85,6"}
    assert template_insight([c]) == "skor tertinggi yang belum ditanggapi: Tani Maju (85,6)."


# ---------- last resort and no data ----------

def test_everything_responded_still_says_one_true_thing():
    rows = [seen("cocok", days=3, responded=True), seen("tidak_cocok", days=4, responded=True),
            seen(None, days=5)]
    c = only(fallback_candidates(rows, digest_data(), NOW))
    assert template_insight([c]) == "2 dari 3 proposal sudah ditanggapi."


def test_no_proposals_no_insight():
    assert insight_candidates([], digest_data(), NOW) == []
    assert template_insight([]) is None
    assert "Yang menarik" not in template(digest_data())


# ---------- priority ----------

def test_priority_sector_trend_then_a_b_c_d():
    q = Item("q", "Kopi Rakyat", 79)
    full = digest_data({Category.tidak_cocok: [q]}, qof=[q])
    good_new = [seen("cocok", sector="edtech")]
    weekly = ([seen("kurang_cocok", days=1, score=60.0)] * 3
              + [seen("kurang_cocok", days=9, score=50.0)] * 3)
    sector = [seen("kurang_cocok", days=2, sector="agritech")] * 3

    # a sector trend wins over every fallback
    assert "sektor" in insight_candidates(sector + good_new + weekly, full, NOW)[0]
    # then (a) over (b), (c), (d)
    assert insight_candidates(good_new + weekly, full, NOW)[0]["jenis"] == "proposalBaruCocok"
    # then (b) over (c), (d)
    assert insight_candidates(weekly, full, NOW)[0]["jenis"] == "rataRataSkor"
    # then (c) over (d)
    assert insight_candidates(weekly[3:], full, NOW)[0]["jenis"] == "perluPerhatian"
    # then (d)
    plain = digest_data({Category.tidak_cocok: [q]})
    assert insight_candidates(weekly[3:], plain, NOW)[0]["jenis"] == "skorTertinggi"


def test_fallback_insight_lands_in_the_message_and_passes_its_own_number_check():
    import json
    d = digest_data({Category.kurang_cocok: [Item("x", "Tani Maju", 85.6)]})
    cands = insight_candidates([seen("kurang_cocok", days=3)], d, NOW)
    d.insight = template_insight(cands)
    assert "Yang menarik: skor tertinggi yang belum ditanggapi: Tani Maju (85,6)." in template(d)
    # what the Insight model may say is checked against the same candidate JSON
    assert numbers_ok(d.insight, json.dumps(cands, ensure_ascii=False))
    assert not numbers_ok("skor tertinggi 90,1 milik Tani Maju.", json.dumps(cands))
