"""intake.run_intake on the in-memory Firestore with a scripted Penilai. Row IDs (EKS-, PNL-)
are the ones in docs/qa/api.md."""

from __future__ import annotations

import pytest
from conftest import criteria

from aisa import intake
from aisa.models import CATEGORY_LABEL, Founder, Profile, Source, SourceKind
from aisa.penilai import Attempt

PID = "upload-abc"
RICH = ["Tani Maju menghubungkan petani dan pembeli. " * 10] * 3  # ~460 chars per page


def ok_attempt(name="Tani Maju"):
    return Attempt(True, criteria(4), Profile(sector="agritech", stage="seed", fundingAskIdr=5_000_000_000),
                   name, None, 1000, 100, 50)


def bad_attempt(error="tim: tanpa kutipan halaman"):
    return Attempt(False, None, None, None, error, 900, 90, 40)


@pytest.fixture
def penilai(env):
    """Script the Penilai: set `.results`; `.calls` counts calls."""
    state = type("P", (), {"results": [], "calls": 0})()

    def assess(pages, rules):
        state.calls += 1
        return state.results.pop(0)

    env.setattr(intake, "assess_once", assess)
    return state


@pytest.fixture
def proposal(fs, rules, env):
    def make(pages, name="Tani Maju"):
        env.setattr(intake, "extract_pages", lambda pdf: list(pages))
        assert intake.register(PID, Source(kind=SourceKind.upload, gcsPath=f"gs://b/decks/{PID}.pdf",
                                           fileName="deck.pdf"), name, Founder(), consent=True)
        return fs
    return make


def job_of(fs):
    p = fs.get(f"proposals/{PID}")
    job = fs.get(f"jobs/{p['jobId']}")
    steps = [d for k, d in sorted(fs.all(f"jobs/{p['jobId']}/steps").items())]
    return p, job, steps


def test_eks_01_too_little_text_goes_manual_without_a_model_call(proposal, penilai, rules):
    fs = proposal(["", "logo", ""])
    assert intake.run_intake(PID, b"%PDF") == "perlu_dicek_manual"
    assert penilai.calls == 0
    p, job, steps = job_of(fs)
    assert p["status"] == "perlu_dicek_manual"
    assert p["statusReason"] == "teks terlalu sedikit (4 karakter di 3 halaman)"
    assert p["assessment"] is None and p["category"] is None and p["effectiveCategory"] is None
    assert p["tokens"] == {"in": 0, "out": 0} and p["pageCount"] == 3
    assert job["status"] == "selesai" and job["model"] is None and job["tokensIn"] == 0
    assert all(s["actor"] == "kode" for s in steps)
    assert fs.get(f"proposalTexts/{PID}") == {"pages": ["", "logo", ""], "charCount": 4}
    (h,) = fs.all("history").values()
    assert h["action"] == "proposal_masuk" and h["after"] == "perlu_dicek_manual" and h["via"] == "sistem"
    (stats,) = fs.all("dailyStats").values()
    assert stats["perluDicekManual"] == 1 and stats["proposalsIn"] == 1
    assert "modelCalls" not in stats


def test_pnl_02_two_failed_validations_go_manual(proposal, penilai, rules):
    fs = proposal(RICH)
    penilai.results = [bad_attempt(), bad_attempt("pasar: nilai 7 di luar 1..5")]
    assert intake.run_intake(PID, b"%PDF") == "perlu_dicek_manual"
    assert penilai.calls == 2
    p, job, steps = job_of(fs)
    assert p["status"] == "perlu_dicek_manual" and p["assessment"] is None and p["category"] is None
    assert p["statusReason"] == "penilaian gagal validasi: pasar: nilai 7 di luar 1..5"
    assert p["tokens"] == {"in": 1800, "out": 180}
    model_steps = [s for s in steps if s["actor"] == "model"]
    assert [s["action"] for s in model_steps] == ["Menilai 5 kriteria", "Menilai 5 kriteria (ulang)"]
    assert all(s["status"] == "gagal" for s in model_steps)
    assert job["status"] == "selesai" and job["model"] == rules.models.penilai
    assert job["tokensIn"] == 1800


def test_pnl_03_one_failure_then_success_is_assessed(proposal, penilai, rules):
    fs = proposal(RICH)
    penilai.results = [bad_attempt(), ok_attempt()]
    assert intake.run_intake(PID, b"%PDF") == "dinilai"
    p, _, _ = job_of(fs)
    assert p["status"] == "dinilai" and p["category"] == p["effectiveCategory"] is not None
    assert p["assessment"]["score"] == 75.0 and p["tokens"] == {"in": 1900, "out": 190}


def test_eks_04_second_run_is_a_no_op(proposal, penilai, rules):
    fs = proposal(RICH)
    penilai.results = [ok_attempt()]
    assert intake.run_intake(PID, b"%PDF") == "dinilai"
    snapshot = (fs.get(f"proposals/{PID}"), fs.all("history"), fs.all("jobs"), fs.all("dailyStats"))
    assert intake.run_intake(PID, b"%PDF") is None
    assert penilai.calls == 1
    assert (fs.get(f"proposals/{PID}"), fs.all("history"), fs.all("jobs"), fs.all("dailyStats")) == snapshot
    # registering the same id again changes nothing either
    assert not intake.register(PID, Source(kind=SourceKind.upload, fileName="x.pdf"), "Lain", Founder(), True)
    assert fs.get(f"proposals/{PID}")["name"] == "Tani Maju"


def test_eks_05_paused_intake_stays_queued(proposal, penilai, rules):
    fs = proposal(RICH)
    fs.document("settings/runtime").set({"paused": True})
    assert intake.run_intake(PID, b"%PDF") == "antre"
    assert penilai.calls == 0 and fs.get(f"proposals/{PID}")["status"] == "antre"
    assert fs.all("jobs") == {}


def test_eks_06_missing_rules_fail_loudly(fs, penilai, env):
    env.setattr(intake, "extract_pages", lambda pdf: RICH)
    intake.register(PID, Source(kind=SourceKind.upload, fileName="deck.pdf"), "X", Founder(), True)
    with pytest.raises(intake.db.RulesMissing):
        intake.run_intake(PID, b"%PDF")
    p = fs.get(f"proposals/{PID}")
    assert p["status"] == "antre" and p["statusReason"] == "aturan penilaian belum ada"


def test_eks_07_deck_name_replaces_file_name_fallback(proposal, penilai, rules):
    fs = proposal(RICH, name=None)
    assert fs.get(f"proposals/{PID}")["name"] == "deck"
    penilai.results = [ok_attempt("Tani Maju")]
    intake.run_intake(PID, b"%PDF")
    assert fs.get(f"proposals/{PID}")["name"] == "Tani Maju"


def test_pnl_08_tokens_accumulate_across_runs_on_the_manual_path(proposal, penilai, rules):
    fs = proposal(RICH)
    fs.document(f"proposals/{PID}").update({"status": "dihentikan", "tokens": {"in": 500, "out": 50}})
    penilai.results = [bad_attempt(), bad_attempt()]
    assert intake.run_intake(PID, b"%PDF") == "perlu_dicek_manual"
    assert fs.get(f"proposals/{PID}")["tokens"] == {"in": 2300, "out": 230}


def test_pnl_04_history_detail_uses_comma_decimal_and_category_label(proposal, penilai, rules, env):
    fs = proposal(RICH)
    env.setattr(intake, "compute_score", lambda weights, values: 68.1)
    penilai.results = [ok_attempt()]
    assert intake.run_intake(PID, b"%PDF") == "dinilai"
    cat = fs.get(f"proposals/{PID}")["category"]
    (h,) = fs.all("history").values()
    assert h["detail"].startswith(f"Proposal Tani Maju masuk: skor 68,1, {CATEGORY_LABEL[cat]}")
