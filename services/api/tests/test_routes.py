"""Route-level tests through FastAPI's TestClient, against the in-memory Firestore and a
recorded GOWA. Row IDs (PWA-, FRM-, UNG-, KAM-, DSB-) are the ones in docs/qa/api.md."""

from __future__ import annotations

import json

import pytest
from conftest import (
    GOWA_SECRET,
    INTAKE_SECRET,
    KEY,
    MANAGER,
    OTHER,
    seed_proposal,
    sign,
)
from fastapi.testclient import TestClient

from aisa import intake, main, orchestrator, storage
from aisa.models import ProposalStatus

PDF = b"%PDF-1.4\n" + b"x" * 64


@pytest.fixture
def client(fs, sent):
    return TestClient(main.app)


@pytest.fixture
def handled(env):
    """Calls that reached the orchestrator; it answers "balasan" for each."""
    calls: list[tuple[str, str]] = []
    env.setattr(orchestrator, "handle", lambda phone, text: calls.append((phone, text)) or "balasan")
    return calls


# ---------- /webhook/gowa ----------

def event(msg_id="m1", sender=MANAGER, chat=None, body="halo", **over):
    jid = f"{sender}@s.whatsapp.net"
    payload = {"id": msg_id, "from": jid, "chat_id": chat or jid, "body": body, "is_from_me": False}
    payload.update(over)
    return {"event": "message", "payload": payload}


def post_hook(client, ev, secret=GOWA_SECRET, raw=None):
    raw = raw if raw is not None else json.dumps(ev).encode()
    headers = {"X-Hub-Signature-256": sign(raw, secret)} if secret else {}
    return client.post("/webhook/gowa", content=raw, headers=headers)


def test_pwa_w01_manager_message_is_accepted_and_answered_once(client, handled, sent, fs):
    r = post_hook(client, event())
    assert r.status_code == 200 and r.json() == {"accepted": True}
    assert handled == [(MANAGER, "halo")]
    assert sent == [(MANAGER, "balasan")]
    assert fs.get("webhookEvents/m1") is not None


@pytest.mark.parametrize("secret", [None, "rahasia-lain"], ids=["tanpa-tanda-tangan", "tanda-tangan-salah"])
def test_kam_w02_bad_or_missing_signature_is_401(client, handled, sent, fs, secret):
    r = post_hook(client, event(), secret=secret)
    assert r.status_code == 401 and r.json() == {"detail": "tanda tangan tidak valid"}
    assert handled == [] and sent == [] and fs.all("webhookEvents") == {}


def test_kam_w03_unset_secret_rejects_every_webhook(client, handled, env):
    env.setenv("GOWA_WEBHOOK_SECRET", "")
    main.settings.cache_clear()
    assert post_hook(client, event()).status_code == 401
    assert handled == []


@pytest.mark.parametrize("ev,raw,reason", [
    (None, b"bukan json{", "bukan JSON"),
    (event(sender=OTHER), None, "pengirim atau isi tidak dilayani"),
    (event(chat="120363000000000000@g.us"), None, "grup"),
    (event(**{"from": "123456789012345@lid", "chat_id": "123456789012345@lid"}), None,
     "pengirim atau isi tidak dilayani"),
    (event(is_from_me=True), None, "bukan pesan masuk"),
    (event(msg_id=None), None, "pengirim atau isi tidak dilayani"),
    (event(body="   "), None, "pengirim atau isi tidak dilayani"),
    ({"event": "receipt", "payload": event()["payload"]}, None, "bukan pesan masuk"),
], ids=["bukan-json", "bukan-manajer", "grup", "lid-saja", "is-from-me", "tanpa-id", "isi-kosong",
        "bukan-event-message"])
def test_pwa_w04_ignored_events_send_nothing(client, handled, sent, fs, ev, raw, reason):
    r = post_hook(client, ev, raw=raw)
    assert r.status_code == 200 and r.json() == {"ignored": reason}
    assert handled == [] and sent == []
    assert fs.all("webhookEvents") == {}  # an ignored event does not burn its id


def test_pwa_w05_duplicate_message_id_is_processed_once(client, handled, sent):
    assert post_hook(client, event(msg_id="dup")).json() == {"accepted": True}
    assert post_hook(client, event(msg_id="dup")).json() == {"ignored": "duplikat"}
    assert len(handled) == 1 and len(sent) == 1


@pytest.mark.parametrize("raw", [b"null", b"[1, 2]"], ids=["null", "list"])
def test_pwa_w06_signed_json_that_is_not_an_object_is_ignored(client, handled, sent, raw):
    c = TestClient(main.app, raise_server_exceptions=False)
    r = post_hook(c, None, raw=raw)
    assert r.status_code == 200 and "ignored" in r.json()
    assert handled == [] and sent == []


def test_pwa_w07_orchestrator_failure_sends_apology(client, sent, env):
    def boom(phone, text):
        raise RuntimeError("x")

    env.setattr(orchestrator, "handle", boom)
    assert post_hook(client, event()).json() == {"accepted": True}
    assert sent == [(MANAGER, "Maaf, terjadi kesalahan saat memproses pesan. Coba lagi.")]


def test_pwa_w08_cancelled_answer_sends_nothing(client, sent, env):
    env.setattr(orchestrator, "handle", lambda phone, text: None)
    assert post_hook(client, event()).json() == {"accepted": True}
    assert sent == []


def test_pwa_w09_command_end_to_end_through_the_webhook(client, sent, fs):
    seed_proposal(fs, "p1", "Tani Maju")
    assert post_hook(client, event(body="setuju tani maju")).json() == {"accepted": True}
    assert sent == [(MANAGER, "Tercatat: Tani Maju → setuju.")]
    p = fs.get("proposals/p1")
    assert p["responded"] is True and p["response"]["kind"] == "setuju" and p["response"]["via"] == "wa"


# ---------- /intake/form ----------

def form_body(**over):
    b = {"driveFileId": "drv1", "fileName": "deck.pdf", "startupName": "Tani Maju",
         "founderName": "Fiktif", "founderEmail": "fiktif@example.com", "consent": True,
         "submittedAt": "2026-10-21T09:00:00+07:00"}
    b.update(over)
    return b


@pytest.fixture
def intakes(env):
    calls = []
    env.setattr(intake, "run_intake", lambda pid, pdf=None: calls.append((pid, pdf)))
    return calls


def post_form(client, body, secret=INTAKE_SECRET, raw=None):
    raw = raw if raw is not None else json.dumps(body).encode()
    headers = {"X-AISA-Signature": sign(raw, secret)} if secret else {}
    return client.post("/intake/form", content=raw, headers=headers)


def test_frm_01_signed_form_creates_one_proposal(client, fs, intakes):
    r = post_form(client, form_body())
    assert r.status_code == 202 and r.json() == {"proposalId": "form-drv1", "created": True}
    p = fs.get("proposals/form-drv1")
    assert p["status"] == "antre" and p["name"] == "Tani Maju" and p["consent"] is True
    assert p["source"] == {"kind": "form", "driveFileId": "drv1", "gcsPath": None, "fileName": "deck.pdf"}
    assert intakes == [("form-drv1", None)]


@pytest.mark.parametrize("secret", [None, "rahasia-lain"], ids=["tanpa-tanda-tangan", "tanda-tangan-salah"])
def test_frm_02_bad_signature_is_401(client, fs, intakes, secret):
    r = post_form(client, form_body(), secret=secret)
    assert r.status_code == 401 and r.json() == {"detail": "tanda tangan tidak valid"}
    assert fs.all("proposals") == {} and intakes == []


def test_frm_03_unset_secret_rejects_everything(client, fs, intakes, env):
    env.setenv("INTAKE_SECRET", "")
    main.settings.cache_clear()
    assert post_form(client, form_body(), secret="").status_code == 401
    assert fs.all("proposals") == {}


def test_frm_04_consent_false_is_422_and_nothing_stored(client, fs, intakes):
    r = post_form(client, form_body(consent=False))
    assert r.status_code == 422 and r.json() == {"detail": "proposal tanpa persetujuan tidak diproses"}
    assert fs.all("proposals") == {} and intakes == []


def test_frm_05_invalid_body_is_422(client, fs, intakes):
    body = form_body()
    del body["driveFileId"]
    r = post_form(client, body)
    assert r.status_code == 422 and r.json()["detail"].startswith("body tidak valid")
    assert fs.all("proposals") == {}


def test_frm_06_same_drive_file_twice_is_one_proposal(client, fs, intakes):
    assert post_form(client, form_body()).json() == {"proposalId": "form-drv1", "created": True}
    r = post_form(client, form_body(startupName="Nama Lain"))
    assert r.status_code == 202 and r.json() == {"proposalId": "form-drv1", "created": False}
    assert list(fs.all("proposals")) == ["form-drv1"]
    assert fs.get("proposals/form-drv1")["name"] == "Tani Maju"
    assert len(intakes) == 1


# ---------- /intake/upload ----------

@pytest.fixture
def uploads(env):
    calls = []

    def up(pid, pdf):
        calls.append(pid)
        return f"gs://decks-test/decks/{pid}.pdf"

    env.setattr(storage, "upload_deck", up)
    return calls


def upload(client, data=PDF, key=KEY, name=None):
    headers = {"X-AISA-Key": key} if key else {}
    return client.post("/intake/upload", headers=headers, files={"file": ("deck.pdf", data, "application/pdf")},
                       data={"name": name} if name else None)


def test_ung_01_upload_creates_one_proposal(client, fs, intakes, uploads):
    r = upload(client, name="Tani Maju")
    pid = intake.upload_id(PDF)
    assert r.status_code == 202 and r.json() == {"proposalId": pid, "created": True}
    p = fs.get(f"proposals/{pid}")
    assert p["status"] == "antre" and p["name"] == "Tani Maju"
    assert p["source"]["gcsPath"] == f"gs://decks-test/decks/{pid}.pdf"
    assert intakes == [(pid, PDF)]


@pytest.mark.parametrize("key", [None, "kunci-salah"], ids=["tanpa-kunci", "kunci-salah"])
def test_ung_02_missing_or_wrong_key_is_401(client, fs, intakes, uploads, key):
    r = upload(client, key=key)
    assert r.status_code == 401 and r.json() == {"detail": "kunci tidak valid"}
    assert fs.all("proposals") == {} and uploads == [] and intakes == []


def test_ung_03_not_a_pdf_is_422(client, fs, intakes, uploads):
    r = upload(client, data=b"PK\x03\x04 ini zip")
    assert r.status_code == 422 and r.json() == {"detail": "berkas bukan PDF"}
    assert fs.all("proposals") == {} and uploads == []


def test_ung_04_over_20_mb_is_413(client, fs, intakes, uploads):
    r = upload(client, data=PDF + b"0" * (storage.MAX_PDF_BYTES - len(PDF) + 1))
    assert r.status_code == 413 and r.json() == {"detail": "PDF lebih dari 20 MB"}
    assert fs.all("proposals") == {} and uploads == []


def test_ung_05_exactly_20_mb_is_accepted(client, fs, intakes, uploads):
    r = upload(client, data=PDF + b"0" * (storage.MAX_PDF_BYTES - len(PDF)))
    assert r.status_code == 202 and r.json()["created"] is True


def test_ung_06_same_pdf_twice_is_one_proposal(client, fs, intakes, uploads):
    first = upload(client).json()
    second = upload(client).json()
    assert second == {"proposalId": first["proposalId"], "created": False}
    assert len(fs.all("proposals")) == 1 and len(intakes) == 1


def test_kam_u07_unset_key_is_503(client, env, uploads):
    env.setenv("INTERNAL_API_KEY", "")
    main.settings.cache_clear()
    r = upload(client)
    assert r.status_code == 503 and r.json() == {"detail": "INTERNAL_API_KEY belum diatur"}


# ---------- dashboard API ----------

DASHBOARD_ROUTES = [
    ("POST", "/api/proposals/p1/response", {"kind": "setuju"}),
    ("POST", "/api/proposals/p1/correction", {"category": "layak_bersyarat", "reason": "r"}),
    ("POST", "/api/proposals/bulk-response", {"category": "layak_bersyarat", "kind": "tolak"}),
    ("DELETE", "/api/proposals/p1", {"reason": "r"}),
    ("PUT", "/api/rules", {"rules": {}, "reason": "r"}),
    ("POST", "/api/runtime/stop", None),
    ("POST", "/api/runtime/resume", None),
    ("GET", "/api/proposals/p1/deck-url", None),
]


@pytest.mark.parametrize("method,path,body", DASHBOARD_ROUTES, ids=[f"{m} {p}" for m, p, _ in DASHBOARD_ROUTES])
@pytest.mark.parametrize("key", [None, "kunci-salah"], ids=["tanpa-kunci", "kunci-salah"])
def test_kam_rute01_dashboard_routes_require_key(client, fs, method, path, body, key):
    seed_proposal(fs, "p1", "Tani Maju")
    before = fs.get("proposals/p1")
    headers = {"X-AISA-Key": key} if key else {}
    r = client.request(method, path, json=body, headers=headers)
    assert r.status_code == 401 and r.json() == {"detail": "kunci tidak valid"}
    assert fs.get("proposals/p1") == before
    assert fs.all("history") == {} and fs.get("settings/runtime") is None


def api(client, method, path, body=None):
    return client.request(method, path, json=body, headers={"X-AISA-Key": KEY})


@pytest.mark.parametrize("body", [{}, {"reason": ""}, {"reason": "   "}], ids=["tanpa-reason", "kosong", "spasi"])
def test_dsb_rute02_delete_without_reason_is_422_and_keeps_proposal(client, fs, body):
    seed_proposal(fs, "p1", "Tani Maju")
    r = api(client, "DELETE", "/api/proposals/p1", body)
    assert r.status_code == 422
    assert fs.get("proposals/p1") is not None and fs.all("history") == {}


def test_dsb_rute03_delete_missing_is_404(client, fs):
    r = api(client, "DELETE", "/api/proposals/tidak-ada", {"reason": "permintaan founder"})
    assert r.status_code == 404 and r.json() == {"detail": "proposal tidak ditemukan"}
    assert fs.all("history") == {}


def test_dsb_rute04_delete_removes_everything_derived(client, fs, env):
    deleted_decks = []
    env.setattr(storage, "delete_deck", lambda path: deleted_decks.append(path) or True)
    seed_proposal(fs, "p1", "Tani Maju", jobId="job1")
    fs.document("proposalTexts/p1").set({"pages": ["x"], "charCount": 1})
    fs.document("jobs/job1").set({"proposalId": "p1"})
    fs.document("jobs/job1/steps/001").set({"seq": 1})
    fs.document(f"pendingConfirmations/{MANAGER}").set({"proposalIds": ["p1"]})
    fs.document("history/h1").set({"proposalId": "p1", "proposalName": "Tani Maju", "detail": "Setuju Tani Maju",
                                   "action": "tanggapan", "before": None, "after": "setuju", "reason": None})
    fs.document("digests/d1").set({"text": "1. Tani Maju · 80", "proposalIds": ["p1", "p2"]})
    r = api(client, "DELETE", "/api/proposals/p1", {"reason": "permintaan founder (uji)"})
    assert r.status_code == 200 and r.json()["deleted"] is True
    assert "error" not in r.json()["assistantScrub"]
    for path in ("proposals/p1", "proposalTexts/p1", "jobs/job1", "jobs/job1/steps/001",
                 f"pendingConfirmations/{MANAGER}"):
        assert fs.get(path) is None, path
    assert deleted_decks == ["gs://b/decks/p1.pdf"]
    h1 = fs.get("history/h1")
    assert h1["proposalName"] == "(dihapus)" and "Tani Maju" not in h1["detail"]
    assert fs.get("digests/d1") == {"text": "1. (dihapus) · 80", "proposalIds": ["p2"]}
    rows = [h for h in fs.all("history").values() if h["action"] == "proposal_dihapus"]
    assert len(rows) == 1 and rows[0]["via"] == "dashboard" and rows[0]["proposalName"] is None


def test_dsb_rute05_response_writes_proposal_and_history(client, fs):
    seed_proposal(fs, "p1", "Tani Maju")
    r = api(client, "POST", "/api/proposals/p1/response", {"kind": "tolak", "note": "  "})
    assert r.status_code == 200 and r.json()["response"]["kind"] == "tolak"
    p = fs.get("proposals/p1")
    assert p["responded"] is True and p["response"]["via"] == "dashboard" and p["response"]["note"] is None
    (h,) = fs.all("history").values()
    assert h["action"] == "tanggapan" and h["after"] == "tolak" and h["via"] == "dashboard"
    assert h["detail"] == "Tolak Tani Maju"


def test_dsb_rute06_response_on_missing_proposal_is_404(client, fs):
    r = api(client, "POST", "/api/proposals/tidak-ada/response", {"kind": "setuju"})
    assert r.status_code == 404


@pytest.mark.parametrize("reason", ["", "  "], ids=["kosong", "spasi"])
def test_dsb_rute07_correction_without_reason_is_422(client, fs, reason):
    seed_proposal(fs, "p1", "Tani Maju")
    r = api(client, "POST", "/api/proposals/p1/correction", {"category": "sangat_layak", "reason": reason})
    assert r.status_code == 422 and fs.get("proposals/p1")["effectiveCategory"] == "perlu_penyesuaian"


def test_dsb_rute08_correction_keeps_category_and_score(client, fs):
    seed_proposal(fs, "p1", "Tani Maju", score=70.0)
    r = api(client, "POST", "/api/proposals/p1/correction", {"category": "sangat_layak", "reason": "tim kuat"})
    assert r.status_code == 200
    p = fs.get("proposals/p1")
    assert p["category"] == "perlu_penyesuaian" and p["effectiveCategory"] == "sangat_layak"
    assert p["assessment"]["score"] == 70.0 and p["responded"] is False


def test_dsb_rute09_correction_on_unassessed_proposal_is_409(client, fs):
    seed_proposal(fs, "p1", "Deck Scan", status=ProposalStatus.perlu_dicek_manual.value)
    r = api(client, "POST", "/api/proposals/p1/correction", {"category": "layak_bersyarat", "reason": "r"})
    assert r.status_code == 409


def test_dsb_rute10_bulk_response_counts_only_unresponded_in_category(client, fs):
    seed_proposal(fs, "a", "A", category="tidak_layak", score=30.0)
    seed_proposal(fs, "b", "B", category="tidak_layak", score=30.0, responded=True)
    seed_proposal(fs, "c", "C", category="perlu_penyesuaian")
    r = api(client, "POST", "/api/proposals/bulk-response", {"category": "tidak_layak", "kind": "tolak"})
    assert r.status_code == 200 and r.json() == {"count": 1}
    assert fs.get("proposals/a")["response"]["kind"] == "tolak"
    assert fs.get("proposals/c")["responded"] is False


def _rules_body(rules) -> dict:
    return rules.model_dump(by_alias=True, mode="json")


@pytest.mark.parametrize("weights", [
    {"manajemen": 0.5, "kinerja": 0.20, "risiko": 0.20, "rencana": 0.25, "dampak": 0.10},  # sum 1.25
    {"manajemen": 0.35, "kinerja": 0.20, "risiko": 0.20, "rencana": 0.25},  # dampak missing
    {"tim": 0.275, "pasar": 0.30, "produk": 0.20, "traksi": 0.125, "bisnis": 0.10},  # old keys
    {"manajemen": 0.25, "kinerja": 0.20, "risiko": 0.20, "rencana": 0.25, "dampak": 0.10,
     "tim": 0.0},  # an old key next to the new ones
], ids=["jumlah-salah", "kriteria-hilang", "kunci-lama", "kunci-lama-tambahan"])
def test_dsb_rute11_rules_with_bad_weights_is_422(client, fs, rules, weights):
    new = _rules_body(rules)
    new["weights"] = weights
    r = api(client, "PUT", "/api/rules", {"rules": new, "reason": "uji"})
    assert r.status_code == 422 and fs.get("settings/rules")["version"] == 1


@pytest.mark.parametrize("thresholds", [
    {"sangatLayak": 75, "layakBersyarat": 75, "perluPenyesuaian": 65, "risikoTinggi": 50},
    {"sangatLayak": 85, "layakBersyarat": 60, "perluPenyesuaian": 65, "risikoTinggi": 50},
    {"sangatLayak": 101, "layakBersyarat": 75, "perluPenyesuaian": 65, "risikoTinggi": 50},
    {"sangatLayak": 85, "layakBersyarat": 75, "perluPenyesuaian": 65, "risikoTinggi": 0},
    {"sangatLayak": 85, "layakBersyarat": 75, "perluPenyesuaian": 65, "risikoTinggi": -10},
], ids=["sama", "tidak-menurun", "di-atas-100", "nol", "negatif"])
def test_dsb_rute11b_rules_with_bad_thresholds_is_422(client, fs, rules, thresholds):
    new = _rules_body(rules)
    new["thresholds"] = thresholds
    r = api(client, "PUT", "/api/rules", {"rules": new, "reason": "uji"})
    assert r.status_code == 422 and fs.get("settings/rules")["version"] == 1
    assert fs.all("history") == {}


@pytest.mark.parametrize("level", ["1", "2", "3", "4", "5"])
def test_rules_missing_an_anchor_level_is_422_not_filled(client, fs, rules, level):
    new = _rules_body(rules)
    del new["anchors"]["kinerja"][level]
    r = api(client, "PUT", "/api/rules", {"rules": new, "reason": "uji"})
    assert r.status_code == 422 and "1, 2, 3, 4, dan 5" in r.json()["detail"]
    assert fs.get("settings/rules")["version"] == 1 and fs.all("history") == {}


def test_rules_with_a_blank_level_or_a_missing_criterion_is_422(client, fs, rules):
    new = _rules_body(rules)
    new["anchors"]["dampak"]["4"] = "  "
    assert api(client, "PUT", "/api/rules", {"rules": new, "reason": "uji"}).status_code == 422
    new = _rules_body(rules)
    del new["anchors"]["dampak"]
    assert api(client, "PUT", "/api/rules", {"rules": new, "reason": "uji"}).status_code == 422
    assert fs.get("settings/rules")["version"] == 1


def test_dsb_rute11c_valid_new_scale_rules_bump_the_version(client, fs, rules):
    new = _rules_body(rules)
    new["weights"] = {"manajemen": 0.30, "kinerja": 0.20, "risiko": 0.15, "rencana": 0.25,
                      "dampak": 0.10}
    new["thresholds"] = {"sangatLayak": 100, "layakBersyarat": 80, "perluPenyesuaian": 60,
                         "risikoTinggi": 40}
    r = api(client, "PUT", "/api/rules", {"rules": new, "reason": "uji skala baru"})
    assert r.status_code == 200 and r.json()["version"] == 2
    stored = fs.get("settings/rules")
    assert stored["version"] == 2 and stored["thresholds"] == new["thresholds"]
    assert stored["weights"] == new["weights"] and fs.get("rulesVersions/2") == stored
    assert stored["anchors"] == new["anchors"]


@pytest.mark.parametrize("path,body", [
    ("/api/proposals/p1/correction", {"category": "cocok", "reason": "r"}),
    ("/api/proposals/p1/correction", {"category": "sangat_cocok", "reason": "r"}),
    ("/api/proposals/bulk-response", {"category": "cocok", "kind": "tolak"}),
    ("/api/proposals/bulk-response", {"category": "tidak_cocok", "kind": "tolak"}),
])
def test_dsb_rute13_old_category_values_are_422(client, fs, path, body):
    seed_proposal(fs, "p1", "Tani Maju")
    before = fs.all("proposals")
    r = api(client, "POST", path, body)
    assert r.status_code == 422
    assert fs.all("proposals") == before and fs.all("history") == {}


def test_dsb_rute12_stop_and_resume_set_runtime(client, fs, env):
    ran = []
    env.setattr(intake, "process_queue", lambda: ran.append(1))
    assert api(client, "POST", "/api/runtime/stop").json()["paused"] is True
    rt = fs.get("settings/runtime")
    assert rt["paused"] is True and rt["pausedVia"] == "dashboard" and rt["lastStopAt"] is not None
    assert api(client, "POST", "/api/runtime/resume").json()["paused"] is False
    rt2 = fs.get("settings/runtime")
    assert rt2["paused"] is False and rt2["lastStopAt"] == rt["lastStopAt"]
    assert ran == [1]


def test_dsb_rute13_form_deck_url_is_the_drive_link(client, fs):
    seed_proposal(fs, "form-drv1", "Tani Maju", source={"kind": "form", "driveFileId": "drv1",
                                                         "gcsPath": None, "fileName": "deck.pdf"})
    r = api(client, "GET", "/api/proposals/form-drv1/deck-url")
    assert r.json() == {"url": "https://drive.google.com/file/d/drv1/view",
                        "previewUrl": "https://drive.google.com/file/d/drv1/preview", "expiresIn": None}


class _FakeBlob:
    def __init__(self, bucket: str, name: str, calls: list):
        self.bucket_name, self.name, self.calls = bucket, name, calls

    def generate_signed_url(self, **kw):
        self.calls.append(kw)
        return f"https://storage.googleapis.com/{self.bucket_name}/{self.name}?X-Goog-Signature=s"


class _FakeGcs:
    def __init__(self, calls: list):
        self.calls = calls

    def bucket(self, b):
        calls = self.calls
        return type("B", (), {"blob": lambda _self, n: _FakeBlob(b, n, calls)})()


class _FakeCreds:
    token = "tok"
    service_account_email = "signer@p.iam.gserviceaccount.com"

    def refresh(self, _req):
        pass


def test_upload_deck_url_is_signed_inline_pdf_and_doubles_as_preview(client, fs, env):
    seed_proposal(fs, "up1", "Tani Maju", source={"kind": "upload", "driveFileId": None,
                                                   "gcsPath": "gs://b/decks/up1.pdf",
                                                   "fileName": 'Pitch "Final"\r\nX.pdf'})
    calls: list = []
    env.setattr(storage, "_gcs", lambda: _FakeGcs(calls))
    env.setattr(storage.google.auth, "default", lambda *a, **k: (_FakeCreds(), "p"))
    r = api(client, "GET", "/api/proposals/up1/deck-url")
    assert r.status_code == 200
    body = r.json()
    assert body["url"] == body["previewUrl"] == "https://storage.googleapis.com/b/decks/up1.pdf?X-Goog-Signature=s"
    assert body["expiresIn"] == 900
    (kw,) = calls
    assert kw["response_type"] == "application/pdf"
    assert kw["response_disposition"] == 'inline; filename="Pitch _Final_X.pdf"'
    assert kw["version"] == "v4" and kw["service_account_email"] == "signer@p.iam.gserviceaccount.com"


@pytest.mark.parametrize(("name", "want"), [
    ("deck.pdf", 'inline; filename="deck.pdf"'),
    ("Proposal Tani Maju", 'inline; filename="Proposal Tani Maju.pdf"'),
    ('"\n.pdf', 'inline; filename="deck.pdf"'),
])
def test_inline_pdf_disposition_is_header_safe(name, want):
    assert storage.inline_pdf_disposition(name) == want


@pytest.mark.parametrize("path,body", [
    ("/api/proposals/p1/response", {"kind": "undang"}),
    ("/api/proposals/p1/response", {"kind": "pantau"}),
    ("/api/proposals/bulk-response", {"category": "perlu_penyesuaian", "kind": "arsipkan"}),
])
def test_old_decision_words_are_422(client, fs, path, body):
    seed_proposal(fs, "p1", "Tani Maju")
    before = fs.all("proposals")
    r = api(client, "POST", path, body)
    assert r.status_code == 422
    assert fs.all("proposals") == before and fs.all("history") == {}
