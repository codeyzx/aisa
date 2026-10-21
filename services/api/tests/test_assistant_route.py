"""`POST /api/assistant/ask`: the dashboard's "Tanya AISA" reaches the same Asisten path as a
WhatsApp question, against the in-memory Firestore with the agent faked out."""

from __future__ import annotations

import pytest
from conftest import KEY
from fastapi.testclient import TestClient

from aisa import assistant_client as ac
from aisa import main
from aisa.models import Runtime, to_doc

SESSION = "dashboard-uid123"


@pytest.fixture
def client(fs, sent):
    return TestClient(main.app)


@pytest.fixture
def asked(env):
    """Questions that reached the in-process agent; it answers "Ada 3 proposal." each time."""
    calls: list[tuple[str, str]] = []

    def fake(session, text, on_event):
        calls.append((session, text))
        on_event([("count_proposals", {"category": "sangat_cocok"})], 120, 8)
        on_event([], 40, 12)
        return "  Ada 3 proposal.  "

    env.setattr(ac, "_ask_local", fake)
    return calls


def ask(client, body, key=KEY):
    headers = {"X-AISA-Key": key} if key else {}
    return client.post("/api/assistant/ask", json=body, headers=headers)


@pytest.mark.parametrize("key", [None, "kunci-salah"], ids=["tanpa-kunci", "kunci-salah"])
def test_requires_the_key(client, fs, asked, key):
    r = ask(client, {"session": SESSION, "text": "halo"}, key=key)
    assert r.status_code == 401 and r.json() == {"detail": "kunci tidak valid"}
    assert asked == [] and fs.all("jobs") == {}


def test_answer_is_returned_and_recorded_as_an_asisten_job(client, fs, asked, sent):
    r = ask(client, {"session": SESSION, "text": "  Fintech yang sangat cocok "})
    assert r.status_code == 200 and r.json() == {"answer": "Ada 3 proposal."}
    assert asked == [(SESSION, "Fintech yang sangat cocok")]
    jobs = list(fs.all("jobs").values())
    assert len(jobs) == 1
    assert jobs[0]["kind"] == "asisten" and jobs[0]["status"] == "selesai"
    # No WhatsApp traffic: neither the reply nor a wait message goes to a phone.
    assert sent == []


@pytest.mark.parametrize("body", [
    {"session": "6281200002356", "text": "halo"},
    {"session": "dashboard-", "text": "halo"},
    {"session": "dashboard-a/b", "text": "halo"},
    {"session": SESSION, "text": ""},
    {"session": SESSION, "text": "   "},
    {"session": SESSION},
], ids=["nomor-telepon", "tanpa-id", "garis-miring", "kosong", "spasi", "tanpa-text"])
def test_bad_body_is_422_and_never_reaches_the_agent(client, fs, asked, body):
    assert ask(client, body).status_code == 422
    assert asked == [] and fs.all("jobs") == {}


def test_paused_answers_without_calling_the_agent(client, fs, asked):
    fs.document("settings/runtime").set(to_doc(Runtime(paused=True)))
    r = ask(client, {"session": SESSION, "text": "halo"})
    assert r.status_code == 200 and r.json() == {"answer": main.DASHBOARD_PAUSED_REPLY}
    assert asked == [] and fs.all("jobs") == {}


def test_answer_cancelled_by_stop_says_so(client, env):
    env.setattr(ac, "ask", lambda session, text: None)
    r = ask(client, {"session": SESSION, "text": "halo"})
    assert r.status_code == 200 and r.json() == {"answer": main.DASHBOARD_CANCELLED_REPLY}
