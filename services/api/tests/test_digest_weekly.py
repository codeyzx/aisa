"""The 09.00 window since the previous 09.00 digest, and the 17.00 weekly summary: its window,
every section's numbers, and the checks that send a wrong model text back to the template."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest
from conftest import MANAGER, T0, seed_proposal

from aisa import db, digest, llm
from aisa.digest import Row, percent, sector_label, weekly_stats
from aisa.llm import LlmResult
from aisa.models import Digest

FRIDAY = datetime(2026, 10, 23, 10, 0, tzinfo=UTC)  # Jumat 17.00 WIB
MONDAY = datetime(2026, 10, 18, 17, 0, tzinfo=UTC)  # Senin 19 Oktober 00.00 WIB


def fit(passed: bool) -> dict:
    item = {"passed": passed, "reason": "x"}
    return {"passed": passed, "checks": {"sector": item, "stage": item, "funding": item}}


# ---------- daily window ----------

@pytest.fixture
def morning(fs, rules, sent, env):
    env.setattr(db, "now", lambda: T0)
    return fs


def test_daily_window_runs_from_the_previous_0900_not_the_weekly_summary(morning):
    morning.document("digests/2026-10-20-0900").set({"slot": "09.00", "sentAt": T0 - timedelta(hours=24)})
    morning.document("digests/2026-10-20-1700").set({"slot": "17.00", "sentAt": T0 - timedelta(hours=16)})
    morning.document("digests/2026-10-19-0900").set({"slot": "09.00", "sentAt": T0 - timedelta(hours=48)})
    seed_proposal(morning, "a", "Sesudah Pagi", created=T0 - timedelta(hours=20))
    seed_proposal(morning, "b", "Sebelum Pagi", created=T0 - timedelta(hours=30))
    data, _, _ = digest.collect("09.00", T0)
    assert data.window_start == T0 - timedelta(hours=24) and data.first is False
    assert data.baru_masuk == 1
    assert "Sejak ringkasan Selasa pukul 09.00 masuk 1 proposal baru." in digest.template(data)


def test_first_daily_digest_counts_the_last_24_hours(morning, sent):
    morning.document("digests/2026-10-20-1700").set({"slot": "17.00", "sentAt": T0 - timedelta(hours=16)})
    seed_proposal(morning, "a", "Baru", created=T0 - timedelta(hours=2))
    seed_proposal(morning, "b", "Lama", created=T0 - timedelta(hours=30))
    r = digest.run_digest("09.00", send=False)
    assert r["counts"]["baruMasuk"] == 1 and r["period"] == "harian"
    assert ("Ini ringkasan pagi pertama dari AISA. Dalam 24 jam terakhir masuk 1 proposal baru."
            in r["text"])


def test_digest_docs_written_before_the_weekly_summary_still_parse():
    old = {"slot": "17.00", "windowStart": None, "sentAt": T0, "text": "x", "counts": {},
           "proposalIds": [], "usedTemplate": True, "jobId": "j"}
    d = Digest.model_validate(old)
    assert d.period == "harian" and d.week is None and d.weekly is None


# ---------- weekly numbers (pure) ----------

def row(pid, days_after_monday, *, sector=None, status="dinilai", category="perlu_penyesuaian",
        score=70.0, luar=False, kind=None, decided_days=None, responded=None):
    at = MONDAY + timedelta(days=days_after_monday)
    assessed = status == "dinilai"
    return Row(id=pid, name=pid.upper(), at=at, status=status, sector=sector,
               category=category if assessed else None, score=score if assessed else None,
               out_of_focus=luar, responded=kind is not None if responded is None else responded,
               response_kind=kind,
               response_at=MONDAY + timedelta(days=decided_days) if decided_days is not None else None)


def test_sector_labels_mirror_the_dashboard():
    assert sector_label("f&b") == "F&B"
    assert sector_label("agritech") == "Agritech"
    assert sector_label("edu/tech & media") == "Edu/Tech & Media"


@pytest.mark.parametrize("n,total,expected", [(4, 10, 40), (1, 8, 13), (3, 8, 38), (2, 3, 67),
                                              (1, 3, 33), (0, 5, 0), (5, 5, 100)])
def test_percent_rounds_half_up(n, total, expected):
    assert percent(n, total) == expected


def test_sector_shares_top_three_of_all_new_proposals():
    rows = ([row(f"f{i}", 1, sector="f&b") for i in range(3)]
            + [row(f"a{i}", 2, sector="Agritech") for i in range(2)]
            + [row("e", 3, sector="edtech"), row("c", 3, sector="climate"),
               row("x", 0, sector=None, status="antre")])
    st, _ = weekly_stats(rows, FRIDAY)
    assert st.proposalsIn == 8 and st.noSector == 1
    assert [(s.label, s.count, s.percent) for s in st.topSectors] == [
        ("F&B", 3, 38), ("Agritech", 2, 25), ("Climate", 1, 13)]  # tie: by label
    d = digest.WeeklyData(salutation="Pak", window_start=digest.week_start(FRIDAY), stats=st,
                          top=[], counts_=digest.weekly_counts(rows, st), at=FRIDAY)
    assert ("*Sektor*: F&B 38% (3 dari 8) · Agritech 25% (2 dari 8) · Climate 13% (1 dari 8) · "
            "tanpa sektor 1") in digest.weekly_template(d)


def test_grades_focus_average_and_change_vs_last_week():
    rows = [
        row("s", 0, sector="fintech", category="sangat_layak", score=90.0),
        row("l", 1, sector="fintech", category="layak_bersyarat", score=80.0, luar=True),
        row("r", 2, sector="fintech", category="risiko_tinggi", score=55.0),
        row("m", 3, sector="fintech", status="perlu_dicek_manual"),
        # last week (Mon 12 – Sun 18 Oct)
        row("w1", -6, category="layak_bersyarat", score=76.0),
        row("w2", -1, category="tidak_layak", score=40.0),
        # the week before that: in neither
        row("old", -8, category="sangat_layak", score=99.0),
    ]
    st, top = weekly_stats(rows, FRIDAY)
    assert (st.proposalsIn, st.proposalsInLastWeek) == (4, 2)
    assert st.assessed == 3 and st.good == 2 and st.perluDicekManual == 1
    assert st.byCategory == {"sangat_layak": 1, "layak_bersyarat": 1, "perlu_penyesuaian": 0,
                             "risiko_tinggi": 1, "tidak_layak": 0}
    assert (st.outOfFocus, st.outOfFocusPercent) == (1, 33)
    assert (st.avgScore, st.avgScoreLastWeek) == (75.0, 58.0)
    assert [r.id for r in top] == ["s", "l", "r"]
    d = digest.WeeklyData(salutation="Pak", window_start=digest.week_start(FRIDAY), stats=st,
                          top=top, counts_=digest.weekly_counts(rows, st), at=FRIDAY)
    t = digest.weekly_template(d)
    assert "*Proposal masuk*: 4 (minggu lalu 2, naik 2)" in t
    assert ("*Grade* (3 dinilai): Sangat layak 1 · Layak bersyarat 1 · Perlu penyesuaian 0 · "
            "Risiko tinggi 1 · Tidak layak 0") in t
    assert "Sangat layak + Layak bersyarat: 2 · di luar fokus: 33% (1 dari 3)" in t
    assert "*Rata-rata skor*: 75 (minggu lalu 58, naik 17)" in t
    assert "1. S · Sangat layak · 90\n2. L · Layak bersyarat · 80 (di luar fokus)\n3. R · Risiko tinggi · 55" in t
    assert "*Perlu dicek manual*: 1" in t


def test_top_three_puts_in_focus_first_within_a_grade_and_ignores_last_week():
    rows = [row("luar", 0, category="sangat_layak", score=95.0, luar=True),
            row("fokus", 1, category="sangat_layak", score=86.0),
            row("bersyarat", 1, category="layak_bersyarat", score=84.0),
            row("lagi", 2, category="layak_bersyarat", score=76.0),
            row("lalu", -2, category="sangat_layak", score=99.0)]
    _, top = weekly_stats(rows, FRIDAY)
    assert [r.id for r in top] == ["fokus", "luar", "bersyarat"]


def test_decisions_this_week_and_the_whole_backlog():
    rows = [row("a", 0, kind="setuju", decided_days=1),
            row("b", 1, kind="tolak", decided_days=2),
            row("c", -10, kind="tolak", decided_days=3),  # old proposal, decided this week
            row("d", -9, kind="setuju", decided_days=-8),  # decided last week: not counted
            row("e", -20),  # waiting since 20 days before Monday
            row("f", 2, status="perlu_dicek_manual"),
            row("g", 3, status="antre")]  # not yet awaiting a decision
    st, _ = weekly_stats(rows, FRIDAY)
    assert (st.setuju, st.tolak) == (1, 2)
    assert st.waiting == 2 and st.oldestWaitingDays == 24  # Monday-20 → Friday 17.00
    c = digest.weekly_counts(rows, st)
    assert c.belumDitanggapi == 2 and c.perluDicekManual == 1 and c.perlu_penyesuaian == 1


def test_empty_week_still_has_every_section():
    st, top = weekly_stats([row("lalu", -3, category="layak_bersyarat", score=80.0)], FRIDAY)
    d = digest.WeeklyData(salutation="Pak", window_start=digest.week_start(FRIDAY), stats=st,
                          top=top, counts_=digest.weekly_counts([], st), at=FRIDAY)
    t = digest.weekly_template(d)
    assert t.startswith("Selamat sore, Pak. Ini ringkasan mingguan AISA, 19–23 Oktober 2026.")
    for line in ("*Proposal masuk*: 0 (minggu lalu 1, turun 1)", "*Sektor*: belum ada proposal masuk",
                 "*Grade*: belum ada yang dinilai", "*Rata-rata skor*: belum ada yang dinilai",
                 "*Keputusan minggu ini*: Setuju 0 · Tolak 0", "Menunggu keputusan: 1 (terlama 7 hari)",
                 "*Top 3 minggu ini*: belum ada", "*Perlu dicek manual*: 0"):
        assert line in t
    assert all(h in t for h in digest.WEEKLY_HEADINGS)


def test_mid_week_trigger_summarises_the_week_so_far():
    wednesday = datetime(2026, 10, 21, 3, 30, tzinfo=UTC)  # Rabu 10.30 WIB
    rows = [row("senin", 0), row("rabu", 2), row("kamis-lalu", -4)]
    st, _ = weekly_stats(rows, wednesday)
    assert (st.proposalsIn, st.proposalsInLastWeek) == (2, 1)
    assert digest.week_range(wednesday).model_dump() == {"start": "2026-10-19", "end": "2026-10-21"}
    assert digest.fmt_range(digest.week_start(wednesday), wednesday) == "19–21 Oktober 2026"
    cands = digest.weekly_candidates(st, wednesday)
    assert cands == [{"jenis": "menungguKeputusan", "menunggu": 3, "terlamaHari": 6}]


def test_range_across_months_and_years():
    assert digest.fmt_range(datetime(2026, 10, 25, 17, tzinfo=UTC),
                            datetime(2026, 10, 30, 10, tzinfo=UTC)) == "26–30 Oktober 2026"
    assert digest.fmt_range(datetime(2026, 11, 29, 17, tzinfo=UTC),
                            datetime(2026, 12, 4, 10, tzinfo=UTC)) == "30 November – 4 Desember 2026"
    assert digest.fmt_range(datetime(2026, 12, 27, 17, tzinfo=UTC),
                            datetime(2027, 1, 1, 10, tzinfo=UTC)) == "28 Desember 2026 – 1 Januari 2027"


def test_weekly_insight_candidates_in_order_and_their_template_text():
    rows = ([row(f"f{i}", 1, sector="f&b", luar=i == 0) for i in range(4)]
            + [row(f"a{i}", 2, sector="agritech") for i in range(3)]
            + [row(f"e{i}", 3, sector="edtech") for i in range(3)])
    st, _ = weekly_stats(rows, FRIDAY)
    cands = digest.weekly_candidates(st, FRIDAY)
    assert [c["jenis"] for c in cands] == ["sektorTerbanyak", "perubahanMasuk", "diLuarFokus",
                                           "menungguKeputusan"]
    assert cands[0] == {"jenis": "sektorTerbanyak", "sektor": "F&B", "persen": 40, "jumlah": 4,
                        "total": 10}
    assert digest.weekly_template_insight(cands) == (
        "minggu ini paling banyak F&B: 40% (4 dari 10 proposal).")
    assert digest.weekly_template_insight(cands[1:]) == (
        "proposal masuk minggu ini (sampai Jumat) 10, naik 10 dibanding minggu lalu (0).")
    assert digest.weekly_template_insight(cands[2:]) == (
        "1 dari 10 proposal yang dinilai minggu ini di luar fokus (10%).")
    assert digest.weekly_template_insight(cands[3:]) == (
        "10 proposal masih menunggu keputusan; yang terlama sudah 3 hari.")


def test_tied_leading_sector_is_not_claimed():
    rows = [row(f"f{i}", 1, sector="f&b") for i in range(2)] + [
        row(f"a{i}", 1, sector="agritech") for i in range(2)]
    st, _ = weekly_stats(rows, FRIDAY)
    assert all(c["jenis"] != "sektorTerbanyak" for c in digest.weekly_candidates(st, FRIDAY))


# ---------- weekly run ----------

@pytest.fixture
def model(env):
    state = type("M", (), {})()
    state.calls = []
    state.rewrite = lambda draft: draft
    state.insight = ""

    def generate(model_name, system, prompt, schema=None, temperature=0.2, seed=None):
        state.calls.append(system)
        if system == digest.WEEKLY_INSIGHT_SYSTEM:
            return LlmResult(state.insight, None, 10, 5, 1)
        assert system == digest.WEEKLY_SYSTEM
        return LlmResult(state.rewrite(json.loads(prompt)["draf"]), None, 100, 50, 1)

    env.setattr(llm, "generate", generate)
    return state


@pytest.fixture
def week(fs, rules, sent, env):
    env.setattr(db, "now", lambda: FRIDAY)
    day = timedelta(days=1)
    seed_proposal(fs, "p1", "Tani Maju", category="sangat_layak", score=88.0, created=MONDAY + day,
                  fit=fit(True))
    seed_proposal(fs, "p2", "Kopi Rakyat", category="layak_bersyarat", score=79.0, sector="f&b",
                  created=MONDAY + 2 * day, fit=fit(False))
    seed_proposal(fs, "p3", "Roti Lembah", category="perlu_penyesuaian", score=66.0, sector="f&b",
                  created=MONDAY + 2 * day, responded=True,
                  response={"kind": "tolak", "at": MONDAY + 3 * day, "via": "wa", "note": None})
    seed_proposal(fs, "p4", "Warung Data", category="tidak_layak", score=40.0, sector="f&b",
                  created=MONDAY + 3 * day)
    seed_proposal(fs, "p5", "Lalu", category="layak_bersyarat", score=75.0, created=MONDAY - 3 * day)
    return fs


DIGEST_ID = "2026-10-23-1700"


def test_weekly_dry_run_writes_and_sends_nothing(week, model, sent):
    before = dict(week.docs)
    r = digest.run_digest("17.00", send=False)
    assert week.docs == before and sent == [] and model.calls == []
    assert r["period"] == "mingguan" and r["week"] == {"start": "2026-10-19", "end": "2026-10-23"}
    assert r["weekly"]["proposalsIn"] == 4 and r["weekly"]["topSectors"][0]["label"] == "F&B"
    assert "*Sektor*: F&B 75% (3 dari 4) · Agritech 25% (1 dari 4)" in r["text"]
    assert r["insight"] == "minggu ini paling banyak F&B: 75% (3 dari 4 proposal)."


def test_weekly_good_ai_text_is_sent_and_recorded(week, model, sent):
    model.insight = "F&B paling banyak minggu ini: 75% (3 dari 4)."
    model.rewrite = lambda draft: draft.replace("Ini ringkasan mingguan", "Berikut ringkasan mingguan")
    r = digest.run_digest("17.00")
    assert r["usedTemplate"] is False and sent == [(MANAGER, r["text"])]
    d = week.get(f"digests/{DIGEST_ID}")
    assert d["period"] == "mingguan" and d["slot"] == "17.00"
    assert d["week"] == {"start": "2026-10-19", "end": "2026-10-23"}
    assert d["windowStart"] == MONDAY
    assert d["proposalIds"] == ["p1", "p2", "p3"]
    w = d["weekly"]
    assert (w["proposalsIn"], w["proposalsInLastWeek"], w["tolak"], w["waiting"]) == (4, 1, 1, 4)
    assert d["counts"]["belumDitanggapi"] == 4 and d["counts"]["baruMasuk"] == 4
    assert d["insight"] == "F&B paling banyak minggu ini: 75% (3 dari 4)."
    assert Digest.model_validate(d).weekly.avgScore == 68.2
    (h,) = [h for h in week.all("history").values() if h["action"] == "ringkasan_terkirim"]
    assert h["detail"] == "Ringkasan mingguan terkirim (4 masuk minggu ini, 4 menunggu keputusan)"
    (job,) = week.all("jobs").values()
    assert job["title"] == "Ringkasan mingguan" and job["status"] == "selesai"


@pytest.mark.parametrize("bad", [
    # a count that exists elsewhere in the draft, moved to the wrong line
    lambda draft: draft.replace("Setuju 0 · Tolak 1", "Setuju 1 · Tolak 0"),
    lambda draft: draft + "\nTotal 999 proposal.",
    lambda draft: draft.replace("*Perlu dicek manual*", "Perlu dicek manual"),
    lambda draft: draft.replace("Tani Maju", "Tani"),
    lambda draft: draft.replace(" (di luar fokus)", ""),
    lambda draft: draft + "\nSebaiknya segera setujui Tani Maju.",
], ids=["angka-tertukar", "angka-baru", "judul-hilang", "nama-hilang", "tanda-fokus-hilang", "saran"])
def test_weekly_ai_text_failing_checks_falls_back_to_template(week, model, sent, bad):
    model.rewrite = bad
    preview = digest.run_digest("17.00", send=False)
    r = digest.run_digest("17.00")
    assert r["usedTemplate"] is True and r["text"] == preview["text"]
    assert week.get(f"digests/{DIGEST_ID}")["usedTemplate"] is True


def test_weekly_insight_with_a_wrong_number_uses_the_code_insight(week, model, sent):
    model.insight = "F&B paling banyak minggu ini: 80% (3 dari 4)."
    r = digest.run_digest("17.00")
    assert week.get(f"digests/{DIGEST_ID}")["insight"] == (
        "minggu ini paling banyak F&B: 75% (3 dari 4 proposal).")
    assert "Yang menarik: minggu ini paling banyak F&B: 75%" in r["text"]


def test_weekly_paused_uses_template_without_model(week, model, sent):
    week.document("settings/runtime").set({"paused": True})
    r = digest.run_digest("17.00")
    assert r["usedTemplate"] is True and model.calls == [] and len(sent) == 1


def test_weekly_sent_once_per_day(week, model, sent):
    digest.run_digest("17.00")
    assert digest.run_digest("17.00") == {"digestId": DIGEST_ID, "skipped": "sudah terkirim"}
    assert len(sent) == 1
