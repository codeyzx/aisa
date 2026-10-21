"""The Asisten's read tools against an in-memory Firestore (no network, no model).

Test names carry the row id from docs/qa/asisten.md. What the model says with these
results is only provable live; here the tools must return the right rows, the right
counts, and never founder contact data.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from conftest import DocRef, FakeFirestore, Query, Snap
from google.cloud.firestore_v1.base_query import FieldFilter

from aisa.assistant import store, tools

FOUNDER = {"name": "Rina Founder", "email": "rina@contoh.test", "phone": "6281111111111"}


def _p(pid, name, *, score=None, eff=None, cat=None, sector=None, stage=None, status="dinilai",
       responded=False, response=None, qof=False, correction=None, criteria=None, fit=None):
    doc = {
        "name": name, "nameLower": name.lower(), "status": status,
        "category": cat or eff, "effectiveCategory": eff, "qualityOutsideFocus": qof,
        "responded": responded, "response": response, "correction": correction,
        "profile": {"sector": sector, "stage": stage, "fundingAskIdr": 2_000_000_000,
                    "oneLiner": "x" * 300},
        "founder": FOUNDER,
        "createdAt": datetime(2026, 10, 20, 3, 0, tzinfo=UTC),
    }
    if score is not None:
        doc["assessment"] = {"score": score, "rulesVersion": 1, "model": "gemini-x",
                             "criteria": criteria or {}}
    if fit is not None:
        doc["fit"] = fit
    return pid, doc


SEED = [
    _p("p1", "Kopi Teras Senja", score=82.5, eff="sangat_cocok", sector="F&B", stage="Seed",
       criteria={"tim": {"value": 5, "reason": "r" * 400,
                         "citations": [{"page": 2, "quote": "q" * 300}] * 5},
                 "traksi": {"value": 1, "notMentioned": True, "reason": "tidak ada"}},
       fit={"passed": True, "checks": {"sector": {"passed": True, "reason": "ok"}}}),
    _p("p2", "Kelas Kode Rakyat", score=71.0, eff="cocok", sector="Edtech", stage="Pre-seed",
       responded=True, response={"kind": "undang", "via": "wa"},
       fit={"passed": False, "checks": {"stage": {"passed": False, "reason": "tahap"},
                                        "sector": {"passed": True, "reason": "ok"}}}),
    _p("p3", "Kelas Kode Pro", score=40.0, eff="kurang_cocok", sector="edtech", stage="Seed"),
    # Quality outside focus, still Tidak cocok: the mark shows.
    _p("p4", "Tambak Cerdas", score=78.0, eff="tidak_cocok", sector="Agritech", stage="Series A",
       qof=True),
    # Flag kept after a correction to Cocok: the mark must not show.
    _p("p5", "Roti Lembah", score=76.0, cat="tidak_cocok", eff="cocok", sector="F&B",
       stage="Seed", qof=True, correction={"category": "cocok", "reason": "fokus baru", "via": "wa",
                                           "at": datetime(2026, 10, 21, 1, 0, tzinfo=UTC)}),
    # No score: manual check.
    _p("p6", "Arsip Pindaian", status="perlu_dicek_manual"),
]


@pytest.fixture
def afs(monkeypatch):
    """The Asisten's store reading a fake Firestore that, unlike the real one, ignores the
    field projection: founder data is in every document it returns, so only the store's
    own guard can keep it out."""
    fake = FakeFirestore()
    for pid, doc in SEED:
        fake.document(f"proposals/{pid}").set(doc)
    monkeypatch.setattr(store, "client", lambda: fake)
    monkeypatch.setattr(DocRef, "get", lambda self, transaction=None, field_paths=None:
                        Snap(self, self.fs.docs.get(self.path)))
    fake.get_all = lambda refs: [r.get() for r in refs]
    # The store uses the positional where(field, op, value) form; the shared fake only
    # takes filter=FieldFilter(...).
    where = Query.where
    monkeypatch.setattr(Query, "where", lambda self, *a, filter=None:
                        where(self, filter or FieldFilter(*a)))
    return fake


def _names(out):
    return [r["nama"] for r in out["proposal"]]


# ---------- AST-11: search_proposals ----------

def test_ast11_search_sorted_by_score_unscored_last(afs):
    out = tools.search_proposals()
    assert out["totalCocok"] == 6
    assert _names(out) == ["Kopi Teras Senja", "Tambak Cerdas", "Roti Lembah",
                           "Kelas Kode Rakyat", "Kelas Kode Pro", "Arsip Pindaian"]


def test_ast11_search_category_is_effective_category(afs):
    assert _names(tools.search_proposals(category="cocok")) == ["Roti Lembah", "Kelas Kode Rakyat"]
    # Spelling as the manager writes it is normalised.
    assert _names(tools.search_proposals(category="Sangat cocok")) == ["Kopi Teras Senja"]
    assert _names(tools.search_proposals(category="tidak-cocok")) == ["Tambak Cerdas"]
    row = tools.search_proposals(category="cocok")["proposal"][0]
    assert row["kategori"] == "Cocok" and row["kategoriAsliAI"] == "Tidak cocok"


def test_ast11_search_unknown_category_or_status_is_an_error(afs):
    assert "tidak dikenal" in tools.search_proposals(category="bagus")["error"]
    assert "tidak dikenal" in tools.search_proposals(status="selesai")["error"]


def test_ast11_search_sector_stage_partial_case_insensitive(afs):
    assert _names(tools.search_proposals(sector="EDTECH")) == ["Kelas Kode Rakyat", "Kelas Kode Pro"]
    assert _names(tools.search_proposals(sector="f&b", stage="seed")) == [
        "Kopi Teras Senja", "Roti Lembah"]
    # "seed" is a substring of "Pre-seed": partial match is the documented behaviour.
    assert "Kelas Kode Rakyat" in _names(tools.search_proposals(stage="seed"))


def test_ast11_search_responded_status_min_score(afs):
    assert _names(tools.search_proposals(responded=True)) == ["Kelas Kode Rakyat"]
    assert tools.search_proposals(responded=False)["totalCocok"] == 5
    assert _names(tools.search_proposals(status="perlu_dicek_manual")) == ["Arsip Pindaian"]
    # An unscored proposal never passes a score floor.
    assert _names(tools.search_proposals(min_score=76)) == [
        "Kopi Teras Senja", "Tambak Cerdas", "Roti Lembah"]


def test_ast11_search_quality_outside_focus_follows_effective_category(afs):
    assert _names(tools.search_proposals(quality_outside_focus=True)) == ["Tambak Cerdas"]
    out = tools.search_proposals(quality_outside_focus=False)
    assert "Roti Lembah" in _names(out) and out["totalCocok"] == 5
    rows = {r["nama"]: r for r in tools.search_proposals()["proposal"]}
    assert rows["Tambak Cerdas"]["berkualitasDiLuarFokus"] is True
    assert "berkualitasDiLuarFokus" not in rows["Roti Lembah"]


def test_ast11_search_limit_clamped(afs, monkeypatch):
    # The cap is 50 so a list answer ("sebutkan semua yang minta di bawah Rp3 M") fits one call.
    many = [{"id": f"m{i}", "name": f"M{i}", "status": "dinilai", "effectiveCategory": "cocok",
             "assessment": {"score": float(i)}} for i in range(60)]
    monkeypatch.setattr(tools.store, "list_proposals", lambda: many)
    out = tools.search_proposals(limit=100)
    assert out["totalCocok"] == 60 and out["ditampilkan"] == 50 and len(out["proposal"]) == 50
    assert tools.search_proposals(limit=40)["ditampilkan"] == 40
    assert tools.search_proposals(limit=0)["ditampilkan"] == 10  # 0 falls back to default
    assert tools.search_proposals(limit=-3)["ditampilkan"] == 1


def test_ast11_summary_trims_one_liner(afs):
    row = tools.search_proposals(category="sangat_cocok")["proposal"][0]
    assert len(row["ringkas"]) == 140 and row["ringkas"].endswith("…")
    assert row["tanggapan"] == "belum ditanggapi"


# ---------- AST-11: funding filters ----------

@pytest.fixture
def funded(afs):
    """SEED asks Rp2 M everywhere; give each proposal its own amount, one with none."""
    asks = {"p1": 2_999_999_999, "p2": 3_000_000_000, "p3": 500_000_000,
            "p4": 12_000_000_000, "p5": None, "p6": 10_000_000_000}
    for pid, amount in asks.items():
        afs.docs[f"proposals/{pid}"]["profile"]["fundingAskIdr"] = amount
    return afs


def test_ast11_search_funding_below_and_above(funded):
    below = tools.search_proposals(max_funding_idr=2_999_999_999)
    assert _names(below) == ["Kopi Teras Senja", "Kelas Kode Pro"]
    assert below["totalCocok"] == 2 and below["danaTidakDisebut"] == 1
    assert {r["danaDiminta"] for r in below["proposal"]} == {2_999_999_999, 500_000_000}
    # both bounds are inclusive: exactly Rp10 M is in for min=10 M, out for "lebih dari"
    assert _names(tools.search_proposals(min_funding_idr=10_000_000_000)) == [
        "Tambak Cerdas", "Arsip Pindaian"]
    assert _names(tools.search_proposals(min_funding_idr=10_000_000_001)) == ["Tambak Cerdas"]
    rng = tools.search_proposals(min_funding_idr=1_000_000_000, max_funding_idr=3_000_000_000)
    assert _names(rng) == ["Kopi Teras Senja", "Kelas Kode Rakyat"]


def test_ast11_funding_combines_with_other_filters_and_unknown_is_counted_after_them(funded):
    out = tools.search_proposals(category="cocok", max_funding_idr=5_000_000_000)
    # Roti Lembah (Cocok, no amount) is the unknown one; Kelas Kode Rakyat asks Rp3 M
    assert _names(out) == ["Kelas Kode Rakyat"] and out["danaTidakDisebut"] == 1
    assert tools.search_proposals(category="sangat_cocok", max_funding_idr=1)["danaTidakDisebut"] == 0


def test_ast11_no_funding_filter_no_unknown_field(funded):
    assert "danaTidakDisebut" not in tools.search_proposals()
    assert "danaTidakDisebut" not in tools.count_proposals()


def test_ast11_count_by_funding(funded):
    out = tools.count_proposals(group_by="category", max_funding_idr=2_999_999_999)
    assert out["total"] == 2 and out["danaTidakDisebut"] == 1
    assert out["jumlah"] == {"Sangat cocok": 1, "Kurang cocok": 1}
    above = tools.count_proposals(min_funding_idr=10_000_000_001, responded=False)
    assert above["total"] == 1 and above["danaTidakDisebut"] == 1


def test_ast11_overview_rows_carry_funding(funded):
    rows = {r["nama"]: r for r in tools.get_overview()["proposal"]}
    assert rows["Tambak Cerdas"]["danaDiminta"] == 12_000_000_000
    assert "danaDiminta" not in rows["Roti Lembah"]


# ---------- AST-11: count_proposals ----------

@pytest.mark.parametrize(("group_by", "expected"), [
    ("category", {"Cocok": 2, "Sangat cocok": 1, "Kurang cocok": 1, "Tidak cocok": 1,
                  "tanpa kategori (belum/tidak dinilai)": 1}),
    ("sector", {"f&b": 2, "edtech": 2, "agritech": 1, "tidak disebut": 1}),
    ("stage", {"seed": 3, "pre-seed": 1, "series a": 1, "tidak disebut": 1}),
    ("status", {"Dinilai": 5, "Perlu dicek manual": 1}),
    ("response", {"belum ditanggapi": 5, "undang": 1}),
    ("outside_focus", {"lainnya": 5, "berkualitas di luar fokus": 1}),
])
def test_ast11_count_group_by(afs, group_by, expected):
    out = tools.count_proposals(group_by=group_by)
    assert out["total"] == 6 and out["per"] == group_by and out["jumlah"] == expected
    assert list(out["jumlah"].values()) == sorted(expected.values(), reverse=True)


def test_ast11_count_filters_and_errors(afs):
    out = tools.count_proposals(group_by="category", responded=False)
    assert out["total"] == 5 and out["jumlah"]["Cocok"] == 1
    assert tools.count_proposals(group_by="sector", category="cocok")["jumlah"] == {
        "f&b": 1, "edtech": 1}
    assert "group_by" in tools.count_proposals(group_by="founder")["error"]
    assert "tidak dikenal" in tools.count_proposals(category="mantap")["error"]


# ---------- AST-12: get_proposal_detail ----------

def _walk(value):
    if isinstance(value, dict):
        for k, v in value.items():
            yield k
            yield from _walk(v)
    elif isinstance(value, list):
        for v in value:
            yield from _walk(v)
    else:
        yield value


def test_ast12_founder_contact_never_returned(afs):
    assert "founder" not in store.PROPOSAL_FIELDS
    outputs = [tools.get_proposal_detail("p1"), tools.get_proposal_detail("Kelas Kode Rakyat"),
               tools.search_proposals(), tools.get_overview(),
               tools.compare_proposals(["p1", "Tambak"])]
    for out in outputs:
        flat = [str(x) for x in _walk(out)]
        assert "founder" not in flat
        for secret in FOUNDER.values():
            assert all(secret not in s for s in flat), secret
    assert all("founder" not in p for p in store.list_proposals())
    assert "founder" not in store.get_proposal("p2")


def test_ast12_detail_by_id_name_and_unique_prefix(afs):
    by_id = tools.get_proposal_detail("p1")
    assert by_id["nama"] == "Kopi Teras Senja"
    assert tools.get_proposal_detail("kopi teras senja")["id"] == "p1"
    assert tools.get_proposal_detail("Tambak")["id"] == "p4"
    crit = by_id["skorDetail"]["kriteria"]
    assert crit["Tim"]["nilai"] == 5 and len(crit["Tim"]["alasan"]) == tools.TEXT_MAX
    assert len(crit["Tim"]["kutipan"]) == 3 and crit["Tim"]["kutipan"][0]["hal"] == 2
    assert len(crit["Tim"]["kutipan"][0]["kutipan"]) == tools.QUOTE_MAX
    assert crit["Traksi"]["tidakDisebut"] is True
    assert by_id["cekKecocokan"]["lulus"] is True
    assert by_id["masuk"] == "2026-10-20 10:00 WIB"


def test_ast12_detail_correction_and_response(afs):
    roti = tools.get_proposal_detail("Roti Lembah")
    assert roti["kategori"] == "Cocok" and roti["kategoriAsliAI"] == "Tidak cocok"
    assert roti["koreksi"] == {"ke": "Cocok", "alasan": "fokus baru",
                               "pada": "2026-10-21 08:00 WIB", "via": "wa"}
    assert tools.get_proposal_detail("Kelas Kode Rakyat")["tanggapanDetail"]["kind"] == "undang"
    assert "skorDetail" not in tools.get_proposal_detail("Arsip Pindaian")


def test_ast12_detail_unknown_and_ambiguous(afs):
    assert tools.get_proposal_detail("Xqzpt Vlombr") == {
        "error": "proposal 'Xqzpt Vlombr' tidak ditemukan di data AISA"}
    amb = tools.get_proposal_detail("Kelas Kode")
    assert "beberapa proposal" in amb["error"]
    assert {k["nama"] for k in amb["kandidat"]} == {"Kelas Kode Rakyat", "Kelas Kode Pro"}
    assert tools.get_proposal_detail("  ") == {"error": "nama proposal kosong"}


def test_ast12_exact_name_beats_longer_prefix_match(afs):
    afs.document("proposals/p7").set(dict(_p("p7", "Kelas Kode", score=10, eff="cocok")[1]))
    assert tools.get_proposal_detail("kelas kode")["id"] == "p7"


# ---------- AST-11: compare_proposals ----------

def test_ast11_compare(afs):
    assert "minimal dua" in tools.compare_proposals(["Kopi"])["error"]
    out = tools.compare_proposals(["Kopi Teras Senja", "Kelas Kode Rakyat", "Nihil", "Kelas Kode"])
    assert [r["nama"] for r in out["perbandingan"]] == ["Kopi Teras Senja", "Kelas Kode Rakyat"]
    assert out["perbandingan"][1]["gagalCek"] == ["stage"]
    assert out["perbandingan"][1]["lulusCekKecocokan"] is False
    assert out["perbandingan"][0]["nilaiKriteria"]["Tim"]["hal"] == [2, 2, 2]
    errs = [e["error"] for e in out["tidakDitemukan"]]
    assert any("tidak ditemukan" in e for e in errs) and any("beberapa" in e for e in errs)
    # Only the first four names are compared.
    five = tools.compare_proposals(["p1", "p2", "p3", "p4", "p5"])
    assert len(five["perbandingan"]) == 4


# ---------- AST-11: get_history ----------

def _history(fake, n):
    base = datetime(2026, 10, 21, 1, 0, tzinfo=UTC)
    for i in range(n):
        fake.document(f"history/h{i}").set({
            "at": base + timedelta(minutes=i), "via": "wa", "action": "tanggapan",
            "proposalId": "p2" if i % 2 else "p1", "proposalName": "X",
            "reason": "a" * 300, "after": "undang"})


def test_ast11_history_recent_and_per_proposal(afs):
    _history(afs, 30)
    recent = tools.get_history(limit=100)["riwayat"]
    assert len(recent) == 25 and recent[0]["at"] == "2026-10-21 08:29 WIB"
    assert len(recent[0]["reason"]) == 160
    assert "proposalId" not in recent[0]
    p2 = tools.get_history(proposal="Kelas Kode Rakyat", limit=3)["riwayat"]
    assert [r["at"] for r in p2] == ["2026-10-21 08:29 WIB", "2026-10-21 08:27 WIB",
                                     "2026-10-21 08:25 WIB"]
    assert "tidak ditemukan" in tools.get_history(proposal="Nihil")["error"]


# ---------- AST-11: get_trends ----------

def test_ast11_trends(afs, monkeypatch):
    today = date(2026, 10, 21)
    monkeypatch.setattr(store, "today_wib", lambda: today)
    for i, n in enumerate([3, 1, 0]):  # today, yesterday, 2 days ago
        afs.document(f"dailyStats/{(today - timedelta(days=i)).isoformat()}").set({
            "proposalsIn": n, "perluDicekManual": 1 if i == 0 else 0,
            "byCategory": {"cocok": n}, "bySector": {"Edtech": n}})
    afs.document("dailyStats/2026-10-18").set({"proposalsIn": 2, "byCategory": {"cocok": 2},
                                               "bySector": {"Edtech": 2}})
    out = tools.get_trends(days=3)
    assert out["periode"] == "2026-10-19 s.d. 2026-10-21 (3 hari)"
    assert out["periodeSebelumnya"] == "2026-10-16 s.d. 2026-10-18"
    assert out["harian"] == [{"tanggal": "2026-10-19", "masuk": 0},
                             {"tanggal": "2026-10-20", "masuk": 1},
                             {"tanggal": "2026-10-21", "masuk": 3}]
    assert out["sekarang"] == {"proposalMasuk": 4, "perluDicekManual": 1,
                               "perKategori": {"Cocok": 4}}
    assert out["perubahanMasukPersen"] == 100.0
    assert out["sektorTeratas"]["Edtech"] == {"sekarang": 4, "sebelumnya": 2, "perubahanPersen": 100.0}
    # No previous period: the change is unknown, not infinite.
    assert tools.get_trends(days=1)["perubahanMasukPersen"] == pytest.approx(200.0)
    monkeypatch.setattr(store, "today_wib", lambda: date(2027, 1, 1))
    assert "tidak ada statistik harian" in tools.get_trends(days=7)["error"]


def test_ast11_trends_days_clamped(afs, monkeypatch):
    monkeypatch.setattr(store, "today_wib", lambda: date(2026, 10, 21))
    afs.document("dailyStats/2026-10-21").set({"proposalsIn": 1})
    assert tools.get_trends(days=500)["periode"].endswith("(90 hari)")
    assert tools.get_trends(days=0)["periode"].endswith("(7 hari)")
    assert tools.get_trends(days=1)["perubahanMasukPersen"] is None


# ---------- AST-11: get_rules ----------

def test_ast11_rules(afs):
    assert tools.get_rules() == {"error": "aturan penilaian tidak tersedia di data AISA"}
    afs.document("settings/rules").set({
        "version": 3, "weights": {"tim": 30, "pasar": 20}, "thresholds": {"sangat_cocok": 75},
        "fit": {"sectors": ["Edtech"]}, "anchors": {"tim": {"1": "t" * 200, "5": "baik"}},
        "reason": "uji", "changedAt": datetime(2026, 10, 21, 2, 0, tzinfo=UTC)})
    out = tools.get_rules()
    assert out["versi"] == 3 and out["bobot"] == {"Tim": 30, "Pasar & masalah": 20}
    assert len(out["patokanNilai"]["Tim"]["1"]) == 120
    assert out["diubahPada"] == "2026-10-21 09:00 WIB"


# ---------- AST-11: get_overview ----------

def test_ast11_overview_counts_and_marks(afs):
    out = tools.get_overview()
    assert out["total"] == 6 and out["belumDitanggapi"] == 5 and out["ditampilkan"] == 6
    assert out["perKategori"]["tanpa kategori (belum/tidak dinilai)"] == 1
    rows = {r["nama"]: r for r in out["proposal"]}
    assert rows["Tambak Cerdas"].get("luarFokus") is True
    assert "luarFokus" not in rows["Roti Lembah"]
    assert out["proposal"][-1]["nama"] == "Arsip Pindaian" and "skor" not in out["proposal"][-1]
    assert rows["Kelas Kode Rakyat"]["tanggapan"] == "undang"


# ---------- AST-11: "Berkualitas, di luar fokus" matches the dashboard rule ----------

@pytest.mark.parametrize(("flag", "eff", "shows"), [
    (True, "tidak_cocok", True),
    (True, "cocok", False),          # corrected away from Tidak cocok
    (True, "sangat_cocok", False),
    (True, None, False),
    (False, "tidak_cocok", False),
    (None, "tidak_cocok", False),
])
def test_ast11_quality_outside_focus_matches_shows_quality_outside_focus(flag, eff, shows):
    # Same truth table as showsQualityOutsideFocus in features/aisa/aisa.schema.ts.
    assert tools._quality_outside_focus({"qualityOutsideFocus": flag, "effectiveCategory": eff}) is shows


# ---------- a failed read is a tool result, not an aborted turn ----------

def test_ast11_failed_read_returns_error(monkeypatch):
    def boom():
        raise RuntimeError("firestore down")

    monkeypatch.setattr(tools.store, "list_proposals", boom)
    wrapped = {fn.__name__: fn for fn in tools.ALL_TOOLS}
    assert wrapped["search_proposals"]() == {
        "error": "data AISA sedang tidak bisa dibaca (RuntimeError); coba lagi nanti"}
    assert set(wrapped) == {"get_overview", "search_proposals", "count_proposals",
                            "get_proposal_detail", "compare_proposals", "get_history",
                            "get_trends", "get_rules"}
