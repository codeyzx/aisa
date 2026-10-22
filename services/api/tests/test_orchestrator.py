"""orchestrator.handle() replies and their Firestore effects, on the in-memory Firestore.
Row IDs (PWA-) are the ones in docs/qa/api.md."""

from __future__ import annotations

import time
from contextlib import nullcontext
from datetime import timedelta

import pytest
from conftest import MANAGER, seed_proposal

from aisa import assistant_client, db, intake, orchestrator
from aisa.models import ProposalStatus


@pytest.fixture
def asked(fs, env):
    calls = []
    env.setattr(assistant_client, "ask", lambda phone, text, notify=False: calls.append(text) or "jawaban")
    env.setattr(intake, "process_queue", lambda: 0)
    return calls


@pytest.fixture
def seeded(fs):
    seed_proposal(fs, "p1", "Tani Maju", category="perlu_penyesuaian", score=70.0)
    seed_proposal(fs, "p2", "Tani Makmur", category="perlu_penyesuaian", score=66.0)
    seed_proposal(fs, "p3", "Kopi Rakyat", category="tidak_layak", score=40.0)
    seed_proposal(fs, "p4", "Deck Scan", status=ProposalStatus.perlu_dicek_manual.value)
    return fs


def unchanged(fs, before):
    return fs.all("proposals") == before


def handle(text):
    return orchestrator.handle(MANAGER, text)


def jobs(fs):
    return list(fs.all("jobs").values())


def test_pwa_o01_exact_name_is_recorded(seeded, asked):
    assert handle("Undang tani maju") == "Tercatat: Tani Maju → undang."
    p = seeded.get("proposals/p1")
    assert p["responded"] and p["response"]["kind"] == "undang" and p["response"]["via"] == "wa"
    (h,) = seeded.all("history").values()
    assert h["action"] == "tanggapan" and h["via"] == "wa" and h["proposalId"] == "p1"
    (j,) = jobs(seeded)
    assert j["kind"] == "perintah" and j["status"] == "selesai" and j["model"] is None
    assert asked == []


def test_pwa_o02_name_not_found_changes_nothing(seeded, asked):
    before = seeded.all("proposals")
    assert handle("undang Startup Fiktif Zzz") == \
        'Proposal "Startup Fiktif Zzz" tidak ditemukan. Tidak ada yang diubah.'
    assert unchanged(seeded, before) and seeded.all("history") == {}


def test_pwa_o03_ambiguous_name_lists_numbered_candidates(seeded, asked):
    before = seeded.all("proposals")
    reply = handle("arsipkan Tani")
    assert reply == ('Ada beberapa proposal yang mirip "Tani":\n'
                     "1. Tani Maju\n2. Tani Makmur\n"
                     "Tidak ada yang diubah. Kirim ulang perintah dengan nama lengkap.")
    assert unchanged(seeded, before) and seeded.all("history") == {}


@pytest.mark.parametrize("text", ["pindahkan Tani Maju ke sangat layak",
                                  "pindahkan Tani Maju ke sangat layak karena",
                                  "pindahkan Tani Maju ke sangat layak karena   "],
                         ids=["tanpa-karena", "karena-kosong", "karena-spasi"])
def test_pwa_o04_correction_without_reason_asks_for_one(seeded, asked, text):
    before = seeded.all("proposals")
    assert handle(text) == ("Koreksi grade perlu alasan. Contoh: pindahkan Tani Maju ke "
                            "sangat layak karena <alasan>")
    assert unchanged(seeded, before) and seeded.all("history") == {}


@pytest.mark.parametrize("text,reply", [
    ("pindahkan Startup Fiktif Zzz ke layak bersyarat",
     'Proposal "Startup Fiktif Zzz" tidak ditemukan. Tidak ada yang diubah.'),
    ("pindahkan Tani ke layak bersyarat",
     'Ada beberapa proposal yang mirip "Tani":\n1. Tani Maju\n2. Tani Makmur\n'
     "Tidak ada yang diubah. Kirim ulang perintah dengan nama lengkap."),
], ids=["tak-dikenal", "ambigu"])
def test_correction_without_reason_reports_an_unresolved_name_first(seeded, asked, text, reply):
    before = seeded.all("proposals")
    assert handle(text) == reply
    assert unchanged(seeded, before) and seeded.all("history") == {}


def test_correction_without_reason_links_the_job_to_the_resolved_proposal(seeded, asked):
    assert handle("pindahkan tani maju ke layak bersyarat").startswith("Koreksi grade perlu alasan.")
    (j,) = jobs(seeded)
    assert j["proposalId"] == "p1"


def test_pwa_o05_correction_keeps_category_and_score(seeded, asked):
    reply = handle("pindahkan Tani Maju ke sangat layak karena tim pernah exit")
    assert reply == "Grade Tani Maju dipindahkan ke Sangat layak. Skor kualitas tetap 70."
    p = seeded.get("proposals/p1")
    assert p["category"] == "perlu_penyesuaian" and p["effectiveCategory"] == "sangat_layak"
    assert p["assessment"]["score"] == 70.0 and p["responded"] is False
    assert p["correction"]["reason"] == "tim pernah exit" and p["correction"]["via"] == "wa"


def test_pwa_o06_correction_of_unassessed_proposal_is_refused(seeded, asked):
    before = seeded.all("proposals")
    assert handle("pindahkan Deck Scan ke layak bersyarat karena isinya bagus") == \
        "Tidak bisa dijalankan: hanya proposal yang sudah dinilai yang punya grade"
    assert unchanged(seeded, before)
    (j,) = jobs(seeded)
    assert j["status"] == "gagal"


def test_pwa_o07_ya_with_nothing_pending(seeded, asked):
    before = seeded.all("proposals")
    assert handle("YA") == "Tidak ada perintah yang menunggu konfirmasi."
    assert unchanged(seeded, before) and asked == []


def test_pwa_o08_bulk_then_ya_responds_to_listed_proposals(seeded, asked):
    reply = handle("arsipkan semua tidak layak")
    assert reply == ("Ada 1 proposal Tidak layak yang belum ditanggapi: Kopi Rakyat\n"
                     "Balas YA dalam 10 menit untuk arsipkan semuanya.")
    pc = seeded.get(f"pendingConfirmations/{MANAGER}")
    assert pc["proposalIds"] == ["p3"] and pc["command"] == "arsipkan semua tidak layak"
    assert timedelta(minutes=9) < pc["expiresAt"] - db.now() <= timedelta(minutes=10)
    assert seeded.get("proposals/p3")["responded"] is False  # nothing before YA
    assert handle("ya") == "Selesai: 1 proposal ditandai arsipkan."
    assert seeded.get("proposals/p3")["response"]["kind"] == "arsipkan"
    assert seeded.get(f"pendingConfirmations/{MANAGER}") is None
    # a second YA has nothing left to confirm
    assert handle("YA") == "Tidak ada perintah yang menunggu konfirmasi."


def test_pwa_o09_ya_after_ten_minutes_has_expired(seeded, asked):
    seeded.document(f"pendingConfirmations/{MANAGER}").set({
        "command": "arsipkan semua tidak layak", "proposalIds": ["p3"],
        "expiresAt": db.now() - timedelta(minutes=1)})
    before = seeded.all("proposals")
    assert handle("YA") == "Konfirmasi sudah kedaluwarsa (lebih dari 10 menit). Kirim ulang perintahnya."
    assert unchanged(seeded, before)
    assert seeded.get(f"pendingConfirmations/{MANAGER}") is None


def test_pwa_o10_bulk_on_empty_category(seeded, asked):
    assert handle("pantau semua risiko tinggi") == "Tidak ada proposal Risiko tinggi yang belum ditanggapi."
    assert seeded.get(f"pendingConfirmations/{MANAGER}") is None


def test_pwa_o11_stop_pauses_and_replies(seeded, asked):
    assert handle("STOP") == ("AISA dijeda (STOP). Proposal baru akan antre. "
                              "Kirim LANJUT untuk melanjutkan.")
    rt = seeded.get("settings/runtime")
    assert rt["paused"] is True and rt["pausedVia"] == "wa" and rt["lastStopAt"] is not None
    assert [h["action"] for h in seeded.all("history").values()] == ["stop"]


def test_pwa_o12_paused_question_is_not_sent_to_the_asisten(seeded, asked):
    handle("stop")
    assert handle("berapa proposal minggu ini?") == \
        "AISA sedang dijeda (STOP). Kirim LANJUT untuk melanjutkan."
    assert asked == []
    assert not [j for j in jobs(seeded) if j["kind"] == "asisten"]


def test_pwa_o13_commands_still_run_while_paused(seeded, asked):
    handle("stop")
    assert handle("undang Tani Maju") == "Tercatat: Tani Maju → undang."


def test_pwa_o14_lanjut_resumes_keeps_last_stop_and_runs_queue(seeded, env):
    ran = []
    env.setattr(intake, "process_queue", lambda: ran.append(1))
    handle("STOP")
    last_stop = seeded.get("settings/runtime")["lastStopAt"]
    assert handle("lanjut") == "Pekerjaan AI dilanjutkan."
    rt = seeded.get("settings/runtime")
    assert rt["paused"] is False and rt["lastStopAt"] == last_stop
    for _ in range(50):  # process_queue runs on a daemon thread
        if ran:
            break
        time.sleep(0.01)
    assert ran == [1]


def test_pwa_o15_unpaused_question_goes_to_the_asisten(seeded, asked):
    assert handle("berapa proposal minggu ini?") == "jawaban"
    assert asked == ["berapa proposal minggu ini?"]


def test_asisten_failure_on_whatsapp_still_replies_with_the_fallback(seeded, env):
    def broken(phone, text, on_event):
        raise RuntimeError("agent down")

    env.setattr(assistant_client, "_ask_local", broken)
    env.setattr(assistant_client, "_Heartbeat", lambda phone, stopped: nullcontext())
    assert handle("berapa proposal minggu ini?") == assistant_client.UNAVAILABLE_REPLY
    (j,) = jobs(seeded)
    assert j["kind"] == "asisten" and j["status"] == "gagal"
