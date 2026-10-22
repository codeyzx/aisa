"""digest.run_digest on the in-memory Firestore with a scripted model and a recorded GOWA.
Row IDs (RKS-) are the ones in docs/qa/api.md."""

from __future__ import annotations

import json
from datetime import timedelta

import pytest
from conftest import MANAGER, T0, seed_proposal

from aisa import db, digest, llm
from aisa.llm import LlmResult

DIGEST_ID = "2026-10-21-0900"


@pytest.fixture
def model(env):
    """Scripted model: `.ringkasan(draft) -> text` and `.insight -> text`; `.calls` lists systems."""
    state = type("M", (), {})()
    state.calls = []
    state.ringkasan = lambda draft: draft
    state.insight = None

    def generate(model_name, system, prompt, schema=None, temperature=0.2, seed=None):
        state.calls.append(system)
        if system == digest.INSIGHT_SYSTEM:
            return LlmResult(state.insight or "", None, 10, 5, 1)
        return LlmResult(state.ringkasan(json.loads(prompt)["draf"]), None, 100, 50, 1)

    env.setattr(llm, "generate", generate)
    return state


@pytest.fixture
def world(fs, rules, sent, env):
    env.setattr(db, "now", lambda: T0)
    seed_proposal(fs, "p1", "Tani Maju", category="sangat_layak", score=85.0)
    seed_proposal(fs, "p2", "Kopi Rakyat", category="layak_bersyarat", score=70.0, sector="f&b")
    return fs


def job_of(fs, result_or_digest_id=DIGEST_ID):
    (job,) = [j for j in fs.all("jobs").values() if j["digestId"] == result_or_digest_id]
    return job


def test_rks_01_good_ai_text_is_sent_and_recorded(world, model, sent):
    model.ringkasan = lambda draft: draft.replace("Selamat pagi", "Selamat pagi sekali")
    r = digest.run_digest("09.00")
    assert r["digestId"] == DIGEST_ID and r["usedTemplate"] is False
    assert sent == [(MANAGER, r["text"])] and "Selamat pagi sekali" in r["text"]
    d = world.get(f"digests/{DIGEST_ID}")
    assert d["usedTemplate"] is False and d["gowaMessageIds"] == ["msg-1"]
    assert d["counts"]["sangat_layak"] == 1 and d["counts"]["layak_bersyarat"] == 1 and d["counts"]["belumDitanggapi"] == 2
    assert sorted(d["proposalIds"]) == ["p1", "p2"]
    assert job_of(world)["status"] == "selesai"


def test_rks_02_same_slot_twice_is_skipped(world, model, sent):
    digest.run_digest("09.00")
    calls = len(model.calls)
    assert digest.run_digest("09.00") == {"digestId": DIGEST_ID, "skipped": "sudah terkirim"}
    assert len(sent) == 1 and len(model.calls) == calls
    assert len(world.all("jobs")) == 1
    # the other slot of the same day is its own digest
    assert digest.run_digest("17.00")["digestId"] == "2026-10-21-1700" and len(sent) == 2


@pytest.mark.parametrize("bad", [
    lambda draft: draft + "\nTotal 999 proposal.",
    lambda draft: draft.replace("Kopi Rakyat", "Kopi"),
    lambda draft: draft + "\nSebaiknya segera undang Tani Maju.",
    lambda draft: "",
], ids=["angka-baru", "nama-hilang", "saran", "kosong"])
def test_rks_03_ai_text_failing_checks_falls_back_to_template(world, model, sent, bad):
    model.ringkasan = bad
    data, cands, _ = digest.collect("09.00", T0)  # before the run records its own digest
    data.insight = digest.template_insight(cands)
    r = digest.run_digest("09.00")
    assert r["usedTemplate"] is True
    assert r["text"] == digest.template(data)
    assert sent == [(MANAGER, r["text"])]
    assert world.get(f"digests/{DIGEST_ID}")["usedTemplate"] is True


def test_rks_04_missing_insight_label_falls_back_to_template(world, model, sent):
    # three agritech proposals this week: there is an insight, so the label must stay
    for i in range(3, 6):
        seed_proposal(world, f"p{i}", f"Agri {i}", category="risiko_tinggi", score=50.0,
                      created=T0 - timedelta(days=1))
    model.insight = "ada 3 proposal agritech minggu ini."
    model.ringkasan = lambda draft: draft.replace(digest.INSIGHT_LABEL, "Menarik:")
    r = digest.run_digest("09.00")
    assert digest.INSIGHT_SYSTEM in model.calls
    assert r["usedTemplate"] is True and digest.INSIGHT_LABEL in r["text"]
    assert world.get(f"digests/{DIGEST_ID}")["insight"] == "ada 3 proposal agritech minggu ini."


def test_rks_05_insight_with_invented_number_uses_code_insight(world, model, sent):
    for i in range(3, 6):
        seed_proposal(world, f"p{i}", f"Agri {i}", category="risiko_tinggi", score=50.0,
                      created=T0 - timedelta(days=1))
    model.insight = "proposal agritech naik 300% minggu ini."
    digest.run_digest("09.00")
    d = world.get(f"digests/{DIGEST_ID}")
    assert d["insight"] == "minggu ini ada 3 proposal agritech, minggu lalu belum ada."


def test_rks_06_paused_uses_template_without_model(world, model, sent):
    world.document("settings/runtime").set({"paused": True})
    r = digest.run_digest("09.00")
    assert r["usedTemplate"] is True and model.calls == []
    assert len(sent) == 1
    job = job_of(world)
    assert job["model"] is None and job["status"] == "selesai" and job["tokensIn"] == 0


def test_rks_07_dry_run_writes_and_sends_nothing(world, model, sent):
    r = digest.run_digest("09.00", send=False)
    assert r["usedTemplate"] is True and r["text"].startswith("Selamat pagi, Ibu.")
    assert sent == [] and model.calls == []
    assert world.get(f"digests/{DIGEST_ID}") is None and world.all("jobs") == {}
    assert r["wouldSkip"] is False and "note" not in r


def test_rks_07b_dry_run_of_a_sent_slot_says_a_real_send_would_skip(world, model, sent):
    digest.run_digest("09.00")
    r = digest.run_digest("09.00", send=False)
    assert r["wouldSkip"] is True and "sudah terkirim" in r["note"]
    assert r["text"].startswith("Selamat pagi, Ibu.") and len(sent) == 1


def test_rks_08_failed_send_records_no_digest_so_a_retry_sends(world, model, sent, env):
    def down(phone, text):
        raise RuntimeError("GOWA down")

    env.setattr(digest.gowa, "send", down)
    with pytest.raises(RuntimeError):
        digest.run_digest("09.00")
    assert world.get(f"digests/{DIGEST_ID}") is None
    assert job_of(world)["status"] == "gagal"


def test_rks_09_without_a_sector_trend_the_fallback_insight_is_sent(world, model, sent):
    # Two proposals, both new: no sector clears MIN_INSIGHT_COUNT, so fallback (a) speaks.
    model.insight = "2 dari 2 proposal baru masuk kategori teratas."
    r = digest.run_digest("09.00")
    d = world.get(f"digests/{DIGEST_ID}")
    assert digest.INSIGHT_SYSTEM in model.calls
    assert d["insight"] == "2 dari 2 proposal baru masuk kategori teratas."
    assert f"{digest.INSIGHT_LABEL} 2 dari 2 proposal baru" in r["text"]


def test_rks_10_fallback_insight_with_invented_number_uses_code_text(world, model, sent):
    model.insight = "3 dari 7 proposal baru masuk Sangat layak."
    digest.run_digest("09.00")
    assert world.get(f"digests/{DIGEST_ID}")["insight"] == (
        "2 dari 2 proposal baru masuk Sangat layak atau Layak bersyarat.")


def test_rks_11_dry_run_shows_the_fallback_candidate(world, model, sent):
    r = digest.run_digest("09.00", send=False)
    assert r["insightCandidates"] == [{"jenis": "proposalBaruLayak", "proposalBaru": 2,
                                       "sangatLayak": 1, "layakBersyarat": 1}]
    assert r["insight"] == "2 dari 2 proposal baru masuk Sangat layak atau Layak bersyarat."
    assert digest.INSIGHT_LABEL in r["text"] and model.calls == []


def _fit(passed: bool) -> dict:
    item = {"passed": passed, "reason": "x"}
    return {"passed": passed, "checks": {"sector": item, "stage": item, "funding": item}}


@pytest.fixture
def focus_world(world):
    """Three Layak bersyarat proposals: the best-scoring one is out of focus."""
    seed_proposal(world, "p3", "Laut Biru", category="layak_bersyarat", score=82.0,
                  fit=_fit(False))
    seed_proposal(world, "p4", "Hutan Hijau", category="layak_bersyarat", score=76.0,
                  fit=_fit(True))
    world.document("proposals/p2").update({"fit": _fit(True)})
    return world


def test_collect_orders_in_focus_first_then_score_within_a_grade(focus_world):
    data, _, _ = digest.collect("09.00", T0)
    names = [it.name for it in data.groups[digest.Category.layak_bersyarat]]
    assert names == ["Hutan Hijau", "Kopi Rakyat", "Laut Biru"]
    assert [it.out_of_focus for it in data.groups[digest.Category.layak_bersyarat]] == [False, False, True]
    assert data.counts().luarFokus == 1
    t = digest.template(data)
    assert "*Layak bersyarat (3)*: Hutan Hijau (76), Kopi Rakyat (70), Laut Biru (82) (di luar fokus)" in t


def test_digest_records_out_of_focus_count(focus_world, model, sent):
    digest.run_digest("09.00")
    counts = focus_world.get(f"digests/{DIGEST_ID}")["counts"]
    assert counts["luarFokus"] == 1 and counts["layak_bersyarat"] == 3


@pytest.mark.parametrize("bad", [
    lambda draft: draft.replace(" (di luar fokus)", ""),
    lambda draft: draft.replace("*Risiko tinggi (0)*\n", ""),
], ids=["tanda-luar-fokus-hilang", "judul-grade-hilang"])
def test_rewrite_dropping_a_focus_mark_or_grade_heading_falls_back(focus_world, model, sent, bad):
    model.ringkasan = bad
    data, cands, _ = digest.collect("09.00", T0)
    data.insight = digest.template_insight(cands)
    r = digest.run_digest("09.00")
    assert r["usedTemplate"] is True and r["text"] == digest.template(data)
    assert "Laut Biru (82) (di luar fokus)" in r["text"]
