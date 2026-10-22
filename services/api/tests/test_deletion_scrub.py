"""Deleting a proposal leaves no trace of it in Aktivitas AI: command jobs are linked to the
proposals they act on, and deletion removes or scrubs every job that names it."""

from __future__ import annotations

import pytest
from conftest import MANAGER, seed_proposal

from aisa import domain, intake, orchestrator, storage
from aisa.models import Via

NAME = "QA Tambak Cerdas"


@pytest.fixture
def seeded(fs, env):
    env.setattr(intake, "process_queue", lambda: 0)
    env.setattr(storage, "delete_deck", lambda path: True)
    seed_proposal(fs, "p1", NAME, category="perlu_penyesuaian", score=68.1)
    seed_proposal(fs, "p2", "Roti Lembah", category="perlu_penyesuaian", score=66.1)
    seed_proposal(fs, "p3", "Bengkel Surya", category="risiko_tinggi", score=63.1)
    seed_proposal(fs, "p4", "Pasar Desa", category="risiko_tinggi", score=63.1)
    return fs


def handle(text):
    return orchestrator.handle(MANAGER, text)


def jobs(fs):
    return fs.all("jobs")


def only_job(fs):
    (j,) = jobs(fs).values()
    return j


def test_command_job_names_the_proposal_but_never_the_reason(seeded):
    handle("pindahkan qa tambak cerdas ke sangat layak karena uji QA kinerja petambak terukur")
    j = only_job(seeded)
    assert j["title"] == f"Perintah: pindahkan {NAME}" and j["proposalId"] == "p1"
    assert "karena" not in j["title"] and "kinerja" not in j["title"]


def test_correction_without_reason_is_still_linked(seeded):
    assert "perlu alasan" in handle("pindahkan QA Tambak Cerdas ke sangat layak")
    assert only_job(seeded)["proposalId"] == "p1"


def test_respond_job_uses_the_stored_name(seeded):
    handle("setuju qa tambak")
    j = only_job(seeded)
    assert j["title"] == f"Perintah: setuju {NAME}" and j["proposalId"] == "p1"


def test_unresolved_name_is_not_linked(seeded):
    handle("setuju Xqzpt Vlombr")
    j = only_job(seeded)
    assert j["proposalId"] is None and j["title"] == "Perintah: setuju Xqzpt Vlombr"


def test_bulk_and_confirmation_jobs_record_every_proposal(seeded):
    handle("tolak semua risiko tinggi")
    handle("YA")
    by_title = {j["title"]: j for j in jobs(seeded).values()}
    assert sorted(by_title["Perintah: tolak semua risiko tinggi"]["proposalIds"]) == ["p3", "p4"]
    assert sorted(by_title["Perintah: YA"]["proposalIds"]) == ["p3", "p4"]


def test_delete_removes_single_target_command_jobs_with_their_steps(seeded):
    handle(f"setuju {NAME}")
    handle(f"pindahkan {NAME} ke sangat layak karena uji")
    handle("setuju Roti Lembah")
    assert len(jobs(seeded)) == 3
    domain.delete_proposal("p1", "QA cleanup", Via.dashboard)
    left = jobs(seeded)
    assert [j["title"] for j in left.values()] == ["Perintah: setuju Roti Lembah"]
    assert all(not p.startswith("jobs/") or p.split("/")[1] in left for p in seeded.docs)


def test_delete_scrubs_a_shared_bulk_job_and_keeps_it_for_the_others(seeded):
    handle("tolak semua risiko tinggi")
    handle("YA")
    domain.delete_proposal("p3", "QA cleanup", Via.dashboard)
    left = list(jobs(seeded).values())
    assert len(left) == 2 and all(j["proposalIds"] == ["p4"] for j in left)


def test_delete_scrubs_name_in_unlinked_job_titles_and_steps(seeded):
    # Jobs written before commands were linked, and an Asisten tool call naming the proposal.
    seeded.document("jobs/old").set({"kind": "perintah", "title": f"Perintah: pindahkan {NAME} "
                                     "ke sangat layak karena uji QA tra", "proposalId": None})
    seeded.document("jobs/old/steps/001").set({"action": "Jalankan perintah correct"})
    seeded.document("jobs/ask").set({"kind": "asisten", "title": "Menjawab pertanyaan manajer"})
    seeded.document("jobs/ask/steps/001").set({"action": "Memanggil cari_proposal",
                                               "read": f"nama={NAME.lower()}", "error": None})
    # A second proposal with the same name keeps its own job; a longer name is a different word.
    seed_proposal(seeded, "p9", NAME, category="perlu_penyesuaian")
    seeded.document("jobs/twin").set({"kind": "penilaian", "title": f"Menilai proposal {NAME}",
                                      "proposalId": "p9"})
    seeded.document("jobs/twin/steps/001").set({"action": f"Nilai {NAME}"})
    seeded.document("jobs/longer").set({"kind": "perintah", "title": f"Perintah: setuju {NAME}2"})

    domain.delete_proposal("p1", "QA cleanup", Via.dashboard)

    assert seeded.get("jobs/old")["title"] == "Perintah: pindahkan (dihapus) ke sangat layak karena uji QA tra"
    assert seeded.get("jobs/ask/steps/001")["read"] == "nama=(dihapus)"
    assert seeded.get("jobs/twin")["title"] == f"Menilai proposal {NAME}"
    assert seeded.get("jobs/twin/steps/001")["action"] == f"Nilai {NAME}"
    assert seeded.get("jobs/longer")["title"] == f"Perintah: setuju {NAME}2"


def test_deleting_the_same_id_again_keeps_the_earlier_deletion_reason(seeded):
    domain.delete_proposal("p1", "permintaan founder", Via.dashboard)
    seed_proposal(seeded, "p1", NAME, category="perlu_penyesuaian", score=68.1)  # same PDF uploaded again
    domain.delete_proposal("p1", "QA cleanup", Via.dashboard)
    rows = [h for h in seeded.all("history").values() if h.get("action") == "proposal_dihapus"]
    assert sorted(h["reason"] for h in rows) == ["QA cleanup", "permintaan founder"]
