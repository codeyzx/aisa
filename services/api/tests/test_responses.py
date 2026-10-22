"""Setuju / Tolak: retention deletes only old `tolak`, and `aisa migrate-responses` moves
undang / pantau / arsipkan onto the new scale."""

from __future__ import annotations

from datetime import timedelta

import pytest
from conftest import MANAGER, T0, seed_proposal

from aisa import db, retention, storage
from aisa.migrate_responses import migrate


@pytest.fixture
def now(env):
    env.setattr(db, "now", lambda: T0)
    return T0


def _response(kind, days_ago, note=None):
    return {"kind": kind, "at": T0 - timedelta(days=days_ago), "via": "wa", "note": note}


def test_retention_run_deletes_only_tolak_past_retention(fs, rules, now, env):
    env.setattr(storage, "delete_deck", lambda path: True)
    seed_proposal(fs, "old-tolak", "Lama Ditolak", responded=True, response=_response("tolak", 91))
    seed_proposal(fs, "new-tolak", "Baru Ditolak", responded=True, response=_response("tolak", 10))
    seed_proposal(fs, "old-setuju", "Lama Disetujui", responded=True,
                  response=_response("setuju", 400))
    out = retention.run()
    assert out == {"retentionDays": 90, "deleted": 1, "proposalIds": ["old-tolak"]}
    assert sorted(fs.all("proposals")) == ["new-tolak", "old-setuju"]
    (h,) = [h for h in fs.all("history").values() if h["action"] == "proposal_dihapus"]
    assert h["reason"] == "retensi otomatis 90 hari" and h["via"] == "sistem"


@pytest.fixture
def legacy(fs, now):
    seed_proposal(fs, "u", "Tani Maju", responded=True, response=_response("undang", 3, "ajak rapat"))
    seed_proposal(fs, "a", "Kopi Rakyat", responded=True, response=_response("arsipkan", 80))
    seed_proposal(fs, "p", "SawahKu", responded=True, response=_response("pantau", 5))
    seed_proposal(fs, "s", "Sudah Baru", responded=True, response=_response("setuju", 1))
    seed_proposal(fs, "n", "Belum", responded=False)
    fs.document(f"pendingConfirmations/{MANAGER}").set(
        {"command": "arsipkan semua tidak layak", "proposalIds": ["a"], "expiresAt": T0})
    return fs


def test_dry_run_prints_the_plan_and_writes_nothing(legacy):
    before = dict(legacy.docs)
    lines: list[str] = []
    report = migrate(apply=False, out=lines.append)
    assert legacy.docs == before
    assert [(r["id"], r["sebelum"], r["sesudah"]) for r in report["proposal"]] == [
        ("a", "arsipkan", "tolak"), ("p", "pantau", None), ("u", "undang", "setuju")]
    text = "\n".join(lines)
    assert "dry-run" in text and "Proposal: 3 diubah, 2 tidak diubah." in text
    assert "a Kopi Rakyat: Arsipkan (lama) → Tolak" in text
    assert "p SawahKu: Pantau (lama) → menunggu keputusan" in text
    assert "Konfirmasi WhatsApp tertunda: 1 akan dihapus." in text


def test_apply_maps_each_old_word_and_keeps_the_decision_time(legacy):
    migrate(apply=True, out=lambda _: None)
    u, a, p = (legacy.get(f"proposals/{i}") for i in ("u", "a", "p"))
    assert u["response"] == _response("setuju", 3, "ajak rapat") and u["responded"] is True
    # tolak keeps the archive date, so the retention clock continues from it
    assert a["response"] == _response("tolak", 80) and a["responded"] is True
    assert p["response"] is None and p["responded"] is False
    assert legacy.get("proposals/s")["response"] == _response("setuju", 1)
    assert legacy.all("pendingConfirmations") == {}


def test_apply_writes_one_history_row_per_changed_proposal(legacy):
    migrate(apply=True, out=lambda _: None)
    rows = {h["proposalId"]: h for h in legacy.all("history").values()}
    assert sorted(rows) == ["a", "p", "u"]
    for h in rows.values():
        assert h["action"] == "tanggapan" and h["via"] == "sistem"
    assert (rows["u"]["before"], rows["u"]["after"]) == ("undang", "setuju")
    assert (rows["a"]["before"], rows["a"]["after"]) == ("arsipkan", "tolak")
    assert (rows["p"]["before"], rows["p"]["after"]) == ("pantau", None)
    assert rows["u"]["detail"] == "Tanggapan Tani Maju dipindah ke skala baru: Undang → Setuju"
    assert rows["a"]["detail"] == "Tanggapan Kopi Rakyat dipindah ke skala baru: Arsipkan → Tolak"
    assert rows["p"]["detail"] == ("Tanggapan Pantau untuk SawahKu dikosongkan; proposal kembali "
                                   "menunggu keputusan")


def test_second_run_changes_nothing(legacy):
    migrate(apply=True, out=lambda _: None)
    after = dict(legacy.docs)
    lines: list[str] = []
    report = migrate(apply=True, out=lines.append)
    assert legacy.docs == after
    assert report["proposal"] == [] and report["konfirmasiDihapus"] == 0
    assert "Proposal: 0 diubah, 5 tidak diubah." in lines


def test_migrated_tolak_is_due_for_retention_from_its_old_date(legacy, rules, env):
    env.setattr(storage, "delete_deck", lambda path: True)
    legacy.document("proposals/a").update({"response.at": T0 - timedelta(days=95)})
    migrate(apply=True, out=lambda _: None)
    assert retention.run()["proposalIds"] == ["a"]
