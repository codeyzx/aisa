from datetime import UTC, datetime, timedelta, timezone

import pytest

from aisa.digest import (
    INSIGHT_LABEL,
    DigestData,
    Item,
    greeting,
    label_ok,
    strip_label,
    template,
)
from aisa.models import Category

WIB = timezone(timedelta(hours=7))


def at(h, m=0):
    return datetime(2026, 10, 21, h, m, tzinfo=WIB)


def data(**over):
    g = {c: [] for c in Category}
    g[Category.sangat_layak] = [Item("a", "Tani Maju", 93, "agritech", 5_000_000_000, "Marketplace panen.",
                                     reasons=["Kinerja 3.850 petani aktif per September 2026.", "Tim kuat."])]
    g[Category.layak_bersyarat] = [Item("c", "Kopi Rakyat", 79, "f&b", out_of_focus=True)]
    d = DigestData(slot="09.00", salutation="Pak", window_start=None, groups=g, manual=[], baru_masuk=2,
                   insight="proposal agritech naik 50% dibanding minggu lalu (4 → 6).", at=at(9))
    for k, v in over.items():
        setattr(d, k, v)
    return d


@pytest.mark.parametrize("h,expected", [
    (0, "Selamat pagi"), (9, "Selamat pagi"), (10, "Selamat pagi"), (11, "Selamat siang"),
    (14, "Selamat siang"), (15, "Selamat sore"), (17, "Selamat sore"), (18, "Selamat malam"),
    (23, "Selamat malam"),
])
def test_greeting_by_wib_send_time(h, expected):
    assert greeting(at(h, 59)) == expected
    assert greeting(at(h).astimezone(UTC)) == expected  # UTC input, WIB hour


def test_greeting_names_the_manager_when_set():
    assert template(data(manager_name="Budi")).startswith("Selamat pagi, Pak Budi. ")
    assert template(data()).startswith("Selamat pagi, Pak. ")
    # the slot no longer decides: a 17.00 digest sent late is "malam"
    assert template(data(slot="17.00", at=at(18, 5))).startswith("Selamat malam, Pak.")


def test_out_of_focus_proposal_keeps_its_grade_and_is_marked():
    t = template(data())
    assert "*Layak bersyarat (1)*: Kopi Rakyat (79) (di luar fokus)" in t
    assert "1 di antaranya di luar fokus" in t


def test_sangat_layak_line_uses_top_criterion_reason_not_one_liner():
    t = template(data())
    assert "1. Tani Maju (agritech, Rp5 M) · 93. Kinerja 3.850 petani aktif per September 2026." in t
    assert "Marketplace panen." not in t


def test_sangat_layak_line_falls_back_to_one_liner_without_reasons():
    d = data()
    d.groups[Category.sangat_layak][0].reasons = []
    assert "· 93. Marketplace panen." in template(d)


def test_label_required_when_insight_exists():
    d = data()
    t = template(d)
    assert f"{INSIGHT_LABEL} proposal agritech" in t and label_ok(t, d)
    assert not label_ok(t.replace(INSIGHT_LABEL, "Menarik:"), d)
    no_insight = data(insight=None)
    assert label_ok(template(no_insight), no_insight)


def test_strip_label_from_model_insight():
    assert strip_label("Yang menarik: proposal fintech naik.") == "proposal fintech naik."
    assert strip_label("  proposal fintech naik.") == "proposal fintech naik."
