"""`aisa migrate-grades`: the dry run writes nothing and calls no model; --apply moves rules,
assessed proposals, dailyStats and pending confirmations to the new scale, and a second run
changes nothing."""

from __future__ import annotations

import copy
from datetime import timedelta

import pytest

from aisa import intake
from aisa.migrate_grades import migrate
from aisa.models import (
    DEFAULT_WEIGHTS,
    RULES_REASON_NEW_SCALE,
    Criterion,
    CriterionResult,
    Profile,
    Thresholds,
    default_rules,
    to_doc,
)
from aisa.penilai import Attempt
from conftest import T0, seed_proposal

OLD_KEYS = ("tim", "pasar", "produk", "traksi", "bisnis")
DATE = "2026-10-21"  # WIB date of T0


def old_rules_doc() -> dict:
    d = to_doc(default_rules(T0))
    d.update(version=3, reason="lama",
             weights={"tim": 0.275, "pasar": 0.30, "produk": 0.20, "traksi": 0.125, "bisnis": 0.10},
             anchors={k: {"1": "a", "3": "b", "5": "c"} for k in OLD_KEYS},
             thresholds={"sangatCocok": 80, "cocok": 65, "kurangCocok": 45, "qualityOutsideFocus": 65},
             retentionDays=30, minCharsPerPage=150)
    d["fit"]["sectors"] = ["agritech", "edtech"]
    return d


def old_assessment(score: float) -> dict:
    return {"criteria": {k: {"value": 3, "reason": "lama", "notMentioned": False,
                             "citations": [{"page": 1, "quote": "kutipan lama"}]} for k in OLD_KEYS},
            "score": score, "rulesVersion": 3, "model": "m"}


def attempt(values: dict[Criterion, int], sector: str) -> Attempt:
    crit = {c: CriterionResult(value=v, reason=f"alasan {c.value}", notMentioned=False,
                               citations=[{"page": 1, "quote": "kutipan baru"}])
            for c, v in values.items()}
    return Attempt(True, crit, Profile(sector=sector, stage="seed", fundingAskIdr=5_000_000_000),
                   "Nama Dari Deck", None, 100, 50, 10)


ALL5 = {c: 5 for c in Criterion}
# .25*.75 + .20*.5 + .20*.5 + .25*.5 + .10*0 = 0.5125 → 51,2 → risiko tinggi
MID = {Criterion.manajemen: 4, Criterion.kinerja: 3, Criterion.risiko: 3, Criterion.rencana: 3,
       Criterion.dampak: 1}


def seed_old(fs, pid: str, name: str, **fields) -> None:
    """A proposal as the old scale stored it: seeded, then overwritten with raw old values
    the current model would refuse."""
    seed_proposal(fs, pid, name, status=fields.get("status", "dinilai"))
    fs.document(f"proposals/{pid}").update(fields)


@pytest.fixture
def world(fs, sent):
    fs.document("settings/rules").set(old_rules_doc())
    assessed = {"assessedAt": T0}
    seed_old(fs, "p1", "Tani Maju", **assessed, assessment=old_assessment(70.0),
                  category="cocok", effectiveCategory="sangat_cocok", qualityOutsideFocus=False,
                  correction={"category": "sangat_cocok", "reason": "tim kuat", "at": T0, "via": "wa"},
                  response={"kind": "pantau", "at": T0, "via": "wa", "note": None}, responded=True,
                  tokens={"in": 1000, "out": 200})
    seed_old(fs, "p2", "Kopi Rakyat", **assessed, assessment=old_assessment(79.0),
                  category="tidak_cocok", effectiveCategory="tidak_cocok", qualityOutsideFocus=True)
    seed_old(fs, "p3", "Deck Scan", status="perlu_dicek_manual", statusReason="teks sedikit",
             qualityOutsideFocus=False)
    seed_old(fs, "p4", "Antre Dulu", status="antre", qualityOutsideFocus=False)
    seed_old(fs, "p5", "Gagal Nilai", **assessed, assessment=old_assessment(50.0),
                  category="kurang_cocok", effectiveCategory="kurang_cocok", qualityOutsideFocus=False)
    for pid in ("p1", "p2", "p5"):
        fs.document(f"proposalTexts/{pid}").set({"pages": [f"deck {pid} kutipan baru"], "charCount": 20})
    # Five counted on this date; one of them belongs to a proposal deleted since.
    fs.document(f"dailyStats/{DATE}").set({"date": DATE, "proposalsIn": 5, "perluDicekManual": 1,
                                           "byCategory": {"cocok": 1, "tidak_cocok": 1,
                                                          "kurang_cocok": 2}})
    fs.document("pendingConfirmations/6281200002356").set(
        {"command": "arsipkan semua tidak cocok", "proposalIds": ["p2"], "expiresAt": T0})
    return fs


@pytest.fixture
def scripted(env):
    """The Penilai, scripted per deck text: p1 high in focus, p2 middling out of focus, p5
    invalid twice."""
    calls: list[str] = []

    def fake(pages, rules):
        calls.append(pages[0])
        if "p1" in pages[0]:
            return attempt(ALL5, "agritech")
        if "p2" in pages[0]:
            return attempt(MID, "f&b")
        return Attempt(False, None, None, None, "manajemen: tanpa kutipan halaman", 10, 5, 3)

    env.setattr(intake, "assess_once", fake)
    return calls


def test_dry_run_writes_nothing_and_calls_no_model(world, scripted):
    before = copy.deepcopy(world.docs)
    lines: list[str] = []
    report = migrate(apply=False, out=lines.append)
    assert world.docs == before
    assert scripted == []
    text = "\n".join(lines)
    assert "versi 3 → 4" in text
    assert "p1 Tani Maju: Cocok (skala lama) (koreksi manajer dihapus) → akan dinilai ulang" in text
    assert "p2 Kopi Rakyat: Tidak cocok (skala lama) → akan dinilai ulang" in text
    assert "Deck Scan" not in text and "Antre Dulu" not in text
    assert "Konfirmasi WhatsApp tertunda: 1 akan dihapus." in text
    assert f"{DATE}:" in text and "1 dari proposal yang sudah dihapus" in text
    assert [r["id"] for r in report["proposal"]] == ["p5", "p2", "p1"]  # sorted by name


def test_apply_moves_everything_to_the_new_scale(world, scripted):
    lines: list[str] = []
    migrate(apply=True, out=lines.append)

    rules = world.get("settings/rules")
    assert rules["version"] == 4 and rules["reason"] == RULES_REASON_NEW_SCALE
    assert rules["weights"] == {c.value: w for c, w in DEFAULT_WEIGHTS.items()}
    assert set(rules["anchors"]) == {c.value for c in Criterion}
    assert rules["thresholds"] == to_doc(Thresholds())
    # Carried over from the old rules.
    assert rules["retentionDays"] == 30 and rules["minCharsPerPage"] == 150
    assert rules["fit"]["sectors"] == ["agritech", "edtech"]
    assert world.get("rulesVersions/4") == rules

    p1 = world.get("proposals/p1")
    assert p1["assessment"]["score"] == 100.0 and p1["assessment"]["rulesVersion"] == 4
    assert set(p1["assessment"]["criteria"]) == {c.value for c in Criterion}
    assert p1["category"] == p1["effectiveCategory"] == "sangat_layak"
    assert p1["correction"] is None and "qualityOutsideFocus" not in p1
    assert p1["fit"]["passed"] is True
    # Kept: the manager's response, the name, the original timestamps; tokens accumulate.
    assert p1["response"]["kind"] == "pantau" and p1["responded"] is True
    assert p1["name"] == "Tani Maju" and p1["createdAt"] == T0 and p1["assessedAt"] == T0
    assert p1["tokens"] == {"in": 1100, "out": 250}

    p2 = world.get("proposals/p2")
    assert p2["assessment"]["score"] == 51.2 and p2["category"] == "risiko_tinggi"
    assert p2["fit"]["passed"] is False and "qualityOutsideFocus" not in p2

    p5 = world.get("proposals/p5")
    assert p5["status"] == "perlu_dicek_manual"
    assert p5["statusReason"].startswith("penilaian ulang gagal: manajemen: tanpa kutipan")
    assert p5["assessment"] is None and p5["category"] is None and p5["effectiveCategory"] is None
    assert "qualityOutsideFocus" not in p5

    # Other statuses are untouched.
    assert world.get("proposals/p3")["statusReason"] == "teks sedikit"
    assert world.get("proposals/p4")["status"] == "antre"

    hist = [h for h in world.all("history").values() if h["action"] == "dinilai_ulang"]
    by = {h["proposalId"]: h for h in hist}
    assert set(by) == {"p1", "p2", "p5"}
    assert by["p1"]["before"] == "cocok" and by["p1"]["after"] == "sangat_layak"
    assert by["p1"]["detail"] == "Tani Maju dinilai ulang dengan skala baru: skor 100, Sangat layak"
    assert by["p2"]["detail"] == ("Kopi Rakyat dinilai ulang dengan skala baru: skor 51,2, "
                                  "Risiko tinggi, di luar fokus")
    assert by["p5"]["after"] == "perlu_dicek_manual"
    rules_rows = [h for h in world.all("history").values() if h["action"] == "aturan_diubah"]
    assert len(rules_rows) == 1 and rules_rows[0]["via"] == "sistem"

    jobs = world.all("jobs")
    assert {j["title"] for j in jobs.values()} == {
        "Menilai ulang Tani Maju (skala baru)", "Menilai ulang Kopi Rakyat (skala baru)",
        "Menilai ulang Gagal Nilai (skala baru)"}
    assert all(j["kind"] == "penilaian" and j["status"] == "selesai" for j in jobs.values())
    assert p1["jobId"] in jobs

    # Recomputed from the surviving assessed proposals; the deleted one drops out.
    stats = world.get(f"dailyStats/{DATE}")
    assert stats["byCategory"] == {"sangat_layak": 1, "risiko_tinggi": 1}
    assert stats["proposalsIn"] == 5

    assert world.all("pendingConfirmations") == {}
    text = "\n".join(lines)
    assert "p2 Kopi Rakyat: Tidak cocok (skala lama) → Risiko tinggi, skor 51,2, di luar fokus" in text


def test_second_run_changes_nothing(world, scripted):
    migrate(apply=True, out=lambda _: None)
    calls = len(scripted)
    snapshot = copy.deepcopy(world.docs)
    lines: list[str] = []
    migrate(apply=True, out=lines.append)
    assert len(scripted) == calls
    assert world.docs == snapshot
    assert "Aturan: sudah skala baru (versi 4); tidak diubah." in lines


def test_proposal_assessed_on_the_new_rules_is_not_regraded(world, scripted):
    migrate(apply=True, out=lambda _: None)
    # A later intake on rules v4 is already on the new scale.
    seed_proposal(world, "p6", "Baru Masuk", category="layak_bersyarat", score=80.0,
                  assessedAt=T0 + timedelta(days=1))
    world.document("proposals/p6").update({"assessment.rulesVersion": 4})
    calls = len(scripted)
    migrate(apply=True, out=lambda _: None)
    assert len(scripted) == calls
    assert world.get("proposals/p6")["category"] == "layak_bersyarat"
