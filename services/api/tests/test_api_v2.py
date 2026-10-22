from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException

from aisa import orchestrator
from aisa.assistant_client import StepRecorder, args_summary, remote_calls
from aisa.auth import oidc_ok, scheduler_or_key
from aisa.domain import DELETED_NAME, scrub_name, scrubbed_history
from aisa.models import CriterionResult, Rules, StepActor, default_rules, to_doc
from aisa.penilai import verify_citations
from aisa.retention import due

NOW = datetime(2026, 10, 21, 2, 0, tzinfo=UTC)
SA = "hackathon-runtime@hackathon-primestep-09.iam.gserviceaccount.com"
AUD = "https://aisa-api.example.run.app"


# ---------- deletion (pure parts) ----------

def test_scrubbed_history_drops_name_and_details():
    s = scrubbed_history()
    assert s["proposalName"] == DELETED_NAME
    assert s["before"] is None and s["after"] is None and s["reason"] is None
    assert "Kopi" not in s["detail"]


def test_scrub_name_whole_word_case_insensitive():
    detail = "Tolak semua tidak layak: 3 proposal (Kopi Rakyat, kopi rakyat, Kopi Rakyatku)"
    assert scrub_name(detail, "Kopi Rakyat") == \
        "Tolak semua tidak layak: 3 proposal ((dihapus), (dihapus), Kopi Rakyatku)"
    assert scrub_name("a.b (x)", "a.b") == "(dihapus) (x)"  # regex characters are literal
    assert scrub_name("teks", "  ") == "teks"


# ---------- retention ----------

def test_retention_selects_only_tolak_past_the_window():
    old, recent = NOW - timedelta(days=91), NOW - timedelta(days=89)
    rows = [
        ("a", {"kind": "tolak", "at": old}),
        ("b", {"kind": "tolak", "at": recent}),
        ("c", {"kind": "setuju", "at": old}),  # setuju is never deleted automatically
        ("d", None),
        ("e", {"kind": "tolak", "at": NOW - timedelta(days=90)}),  # exactly 90: kept
        ("f", {"kind": "tolak"}),
        ("g", {"kind": "arsipkan", "at": old}),  # an old word left unmigrated is not deleted
    ]
    assert due(rows, NOW, 90) == ["a"]
    assert due(rows, NOW, 1) == ["a", "b", "e"]


def test_rules_retention_default_and_legacy_orchestrator_tolerated():
    doc = to_doc(default_rules(NOW))
    assert doc["retentionDays"] == 90 and "orchestrator" not in doc["models"]
    legacy = {**doc, "models": {**doc["models"], "orchestrator": "x"}}
    legacy.pop("retentionDays")
    r = Rules.model_validate(legacy)
    assert r.retentionDays == 90 and "orchestrator" not in to_doc(r)["models"]
    with pytest.raises(ValueError):
        Rules.model_validate({**doc, "retentionDays": 0})


# ---------- scheduler auth ----------

def verifier(claims=None, exc=None):
    seen = []

    def v(token, audience):
        seen.append((token, audience))
        if exc:
            raise exc
        return claims
    v.seen = seen
    return v


GOOD = {"email": SA, "email_verified": True, "aud": AUD}


def test_oidc_accepts_matching_service_account():
    v = verifier(GOOD)
    assert oidc_ok("Bearer tok", SA, AUD, v) and v.seen == [("tok", AUD)]


@pytest.mark.parametrize("auth,claims,exc", [
    ("Bearer tok", {**GOOD, "email": "other@x.iam.gserviceaccount.com"}, None),
    ("Bearer tok", {**GOOD, "email_verified": False}, None),
    ("Bearer tok", None, ValueError("Token has wrong audience")),
    ("Basic tok", GOOD, None),
    ("Bearer ", GOOD, None),
    (None, GOOD, None),
])
def test_oidc_rejects(auth, claims, exc):
    assert not oidc_ok(auth, SA, AUD, verifier(claims, exc))


def test_oidc_unconfigured_never_accepts():
    assert not oidc_ok("Bearer tok", "", AUD, verifier(GOOD))
    assert not oidc_ok("Bearer tok", SA, "", verifier(GOOD))


def test_scheduler_or_key():
    kw = {"key": "k3y", "sa_email": SA, "audience": AUD}
    assert scheduler_or_key("Bearer tok", None, verify=verifier(GOOD), **kw) == "oidc"
    assert scheduler_or_key(None, "k3y", verify=verifier(GOOD), **kw) == "key"
    # a rejected token still falls back to a valid key
    assert scheduler_or_key("Bearer bad", "k3y", verify=verifier(exc=ValueError("x")), **kw) == "key"
    with pytest.raises(HTTPException) as e:
        scheduler_or_key("Bearer bad", "nope", verify=verifier(exc=ValueError("x")), **kw)
    assert e.value.status_code == 401
    with pytest.raises(HTTPException) as e:
        scheduler_or_key(None, "k3y", key="", sa_email="", audience="", verify=verifier(GOOD))
    assert e.value.status_code == 503
    # OIDC alone (no key configured) still works
    assert scheduler_or_key("Bearer tok", None, key="", sa_email=SA, audience=AUD,
                            verify=verifier(GOOD)) == "oidc"


# ---------- citationsUnverified ----------

PAGES = ["Traksi: 3.850 petani aktif bulanan per September 2026"]


def crit(value, quotes):
    return CriterionResult(value=value, reason="r", notMentioned=False,
                           citations=[{"page": 1, "quote": q} for q in quotes])


def test_all_quotes_dropped_flags_unverified():
    c = verify_citations(crit(5, ["12.000 petani aktif bulanan"]), PAGES)
    assert c.value == 2 and c.citations == [] and c.citationsUnverified
    assert "diturunkan dari 5 ke 2" in c.reason


def test_flag_not_set_when_a_quote_survives_or_value_is_one():
    some = verify_citations(crit(5, ["3.850 petani aktif bulanan", "unicorn sebelumnya"]), PAGES)
    assert some.value == 4 and len(some.citations) == 1 and not some.citationsUnverified
    one = verify_citations(crit(1, ["angka yang tidak ada"]), PAGES)
    assert one.value == 1 and not one.citationsUnverified
    ok = verify_citations(crit(4, ["3.850 petani aktif bulanan"]), PAGES)
    assert not ok.citationsUnverified


def test_no_value_two_or_more_without_citations_or_flag():
    for v in range(2, 6):
        c = verify_citations(crit(v, ["kutipan karangan sendiri"]), PAGES)
        assert c.citations or c.citationsUnverified


# ---------- Asisten steps and STOP ----------

class FakeJob:
    def __init__(self):
        self.steps = []

    def begin(self, action, tool, actor):
        pass

    def step(self, action, tool, actor, **kw):
        self.steps.append({"action": action, "tool": tool, "actor": actor, **kw})


def test_step_recorder_one_step_per_call_and_tokens_sum():
    job = FakeJob()
    rec = StepRecorder(job, "gemini-3.8-flash", "agent_runtime")
    rec.event([("cari_proposal", {"nama": "Tani"})], 100, 10)
    rec.event([], 0, 0)  # function response event
    rec.event([("statistik", {}), ("riwayat", {"n": 5})], 200, 20)
    rec.event([], 300, 30)  # final text
    rec.answer()
    assert [s["tool"] for s in job.steps] == ["cari_proposal", "statistik", "riwayat", "agent_runtime"]
    assert all(s["actor"] == StepActor.model and s["model"] == "gemini-3.8-flash" for s in job.steps)
    assert job.steps[0]["read"] == '{"nama": "Tani"}'
    assert sum(s["tokens_in"] for s in job.steps) == 600
    assert sum(s["tokens_out"] for s in job.steps) == 60
    assert job.steps[-1]["tokens_in"] == 300 and job.steps[2]["tokens_in"] == 0


def test_remote_calls_and_args_summary():
    ev = {"content": {"role": "model", "parts": [
        {"function_call": {"name": "cari_proposal", "args": {"nama": "Kopi"}}}, {"text": "x"}]}}
    assert remote_calls(ev) == [("cari_proposal", {"nama": "Kopi"})]
    assert remote_calls({"content": {"parts": [{"text": "hi"}]}}) == []
    assert remote_calls({}) == []
    assert len(args_summary({"q": "x" * 500})) == 200


def test_paused_asisten_is_not_called(monkeypatch):
    called = []
    monkeypatch.setattr(orchestrator.db, "is_paused", lambda: True)
    monkeypatch.setattr(orchestrator.assistant_client, "ask", lambda *a: called.append(a) or "x")
    assert orchestrator.handle("62812", "berapa proposal minggu ini?") == orchestrator.PAUSED_REPLY
    assert called == []
