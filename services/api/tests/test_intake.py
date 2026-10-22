"""intake.run_intake on the in-memory Firestore with a scripted Penilai. Row IDs (EKS-, PNL-)
are the ones in docs/qa/api.md."""

from __future__ import annotations

import pytest
from conftest import criteria

from aisa import intake, ocr
from aisa.models import CATEGORY_LABEL, Founder, Profile, Source, SourceKind
from aisa.ocr import OcrOutput, OcrResult
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


@pytest.fixture(autouse=True)
def image_read(env):
    """Script the image read: set `.results`; `.calls` records (bytes, page count)."""
    state = type("O", (), {"results": [], "calls": []})()

    def transcribe(pdf, page_count, model):
        state.calls.append((len(pdf), page_count))
        return state.results.pop(0)

    env.setattr(ocr, "transcribe", transcribe)
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


def test_eks_01_too_large_scan_goes_manual_without_a_model_call(proposal, penilai, rules, image_read):
    fs = proposal(["", "logo", ""])
    big = b"%PDF" + b"0" * ocr.MAX_BYTES
    assert intake.run_intake(PID, big) == "perlu_dicek_manual"
    assert penilai.calls == 0 and image_read.calls == []
    p, job, steps = job_of(fs)
    assert p["status"] == "perlu_dicek_manual"
    assert p["statusReason"] == ("teks terlalu sedikit (4 karakter di 3 halaman); terlalu besar "
                                 "untuk dibaca sebagai gambar (maks. 15 MB dan 50 halaman)")
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


def test_eks_08_scanned_deck_is_read_as_images_then_assessed(proposal, penilai, rules, image_read):
    fs = proposal(["", "logo", ""])
    image_read.results = [OcrResult(True, RICH, None, 2000, 300, 70)]
    penilai.results = [ok_attempt()]
    assert intake.run_intake(PID, b"%PDF") == "dinilai"
    assert image_read.calls == [(4, 3)] and penilai.calls == 1
    p, job, steps = job_of(fs)
    assert p["status"] == "dinilai" and p["statusReason"] is None
    assert fs.get(f"proposalTexts/{PID}") == {"pages": RICH, "charCount": sum(map(len, RICH))}
    actions = [s["action"] for s in steps]
    assert actions[:4] == ["Ekstrak teks per halaman", "Cek jumlah teks", "Baca teks dari gambar",
                           "Menilai 5 kriteria"]
    read = steps[2]
    assert read["actor"] == "model" and read["tool"] == "gemini.generate_content"
    assert read["model"] == rules.models.penilai and read["wrote"] == f"proposalTexts/{PID}"
    assert (read["tokensIn"], read["tokensOut"], read["status"]) == (2000, 300, "ok")
    assert p["tokens"] == {"in": 3000, "out": 400}


def test_eks_09_scan_still_unreadable_goes_manual(proposal, penilai, rules, image_read):
    fs = proposal(["", "logo", ""])
    image_read.results = [OcrResult(True, ["", "LOGO", ""], None, 2000, 10, 70)]
    assert intake.run_intake(PID, b"%PDF") == "perlu_dicek_manual"
    assert penilai.calls == 0
    p, job, steps = job_of(fs)
    assert p["statusReason"] == ("teks terlalu sedikit, juga setelah dibaca sebagai gambar "
                                 "(4 karakter di 3 halaman)")
    assert p["tokens"] == {"in": 2000, "out": 10} and job["model"] == rules.models.penilai
    assert steps[-1]["action"] == "Baca teks dari gambar" and steps[-1]["status"] == "ok"


def test_eks_10_failed_image_read_goes_manual_and_keeps_the_extracted_text(proposal, penilai, rules,
                                                                          image_read):
    fs = proposal(["", "logo", ""])
    image_read.results = [OcrResult(False, None, "halaman 9 tidak ada di deck (3 halaman)", 500, 5, 30)]
    assert intake.run_intake(PID, b"%PDF") == "perlu_dicek_manual"
    p, job, steps = job_of(fs)
    assert p["statusReason"] == "gagal membaca deck sebagai gambar: halaman 9 tidak ada di deck (3 halaman)"
    assert fs.get(f"proposalTexts/{PID}") == {"pages": ["", "logo", ""], "charCount": 4}
    read = steps[-1]
    assert read["status"] == "gagal" and read["wrote"] is None and read["error"]


def test_eks_11_stop_before_the_image_read_spends_nothing(proposal, penilai, rules, image_read, env):
    fs = proposal(["", "logo", ""])
    paused = iter([False, True])
    env.setattr(intake.db, "is_paused", lambda: next(paused))
    assert intake.run_intake(PID, b"%PDF") == "dihentikan"
    assert image_read.calls == []


def test_ocr_to_pages_orders_by_page_and_fills_skipped_pages():
    out = OcrOutput(pages=[{"page": 3, "text": " c "}, {"page": 1, "text": "a"}])
    assert ocr.to_pages(out, 3) == ["a", "", "c"]
    with pytest.raises(ValueError):
        ocr.to_pages(OcrOutput(pages=[{"page": 4, "text": "x"}]), 3)


def test_ocr_fits_caps_size_and_pages():
    assert ocr.fits(b"x" * ocr.MAX_BYTES, ocr.MAX_PAGES)
    assert not ocr.fits(b"x" * (ocr.MAX_BYTES + 1), 1)
    assert not ocr.fits(b"x", ocr.MAX_PAGES + 1)
    assert not ocr.fits(b"x", 0)


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


# ---------- live progress: jobs/{id}.currentStep ----------

def current_step(fs):
    return fs.get(f"jobs/{fs.get(f'proposals/{PID}')['jobId']}")["currentStep"]


def test_current_step_names_the_running_step_and_clears_after(proposal, env, rules):
    fs = proposal(RICH)
    seen = []
    env.setattr(intake, "extract_pages", lambda pdf: seen.append(current_step(fs)) or list(RICH))

    def assess(pages, rules):
        seen.append(current_step(fs))
        return bad_attempt() if len(seen) == 2 else ok_attempt()

    env.setattr(intake, "assess_once", assess)
    assert intake.run_intake(PID, b"%PDF") == "dinilai"
    extract, first, retry = seen
    assert (extract["action"], extract["actor"], extract["tool"]) == ("Ekstrak teks per halaman", "kode", "pypdf")
    assert first["action"] == "Menilai 5 kriteria" and first["actor"] == "model"
    assert first["tool"] == "gemini.generate_content" and first["startedAt"] is not None
    # The failed attempt's step doc cleared it; the retry set it again.
    assert retry["action"] == "Menilai 5 kriteria (ulang)"
    _, job, _ = job_of(fs)
    assert job["status"] == "selesai" and job["currentStep"] is None


def test_current_step_cleared_on_stop(proposal, env, rules):
    fs = proposal(RICH)

    def assess(pages, rules):
        fs.document("settings/runtime").set({"paused": True})
        return ok_attempt()

    env.setattr(intake, "assess_once", assess)
    assert intake.run_intake(PID, b"%PDF") == "dihentikan"
    _, job, steps = job_of(fs)
    assert steps[-1]["action"] == "Dihentikan oleh STOP"
    assert job["status"] == "dihentikan" and job["currentStep"] is None


def test_current_step_cleared_when_the_model_call_raises(proposal, env, rules):
    fs = proposal(RICH)

    def assess(pages, rules):
        assert current_step(fs)["action"] == "Menilai 5 kriteria"
        raise RuntimeError("gemini down")

    env.setattr(intake, "assess_once", assess)
    assert intake.run_intake(PID, b"%PDF") == "antre"
    _, job, _ = job_of(fs)
    assert job["status"] == "gagal" and job["currentStep"] is None
