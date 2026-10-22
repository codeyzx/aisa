"""STOP cancels an in-flight Asisten answer; STOP/LANJUT replies say so."""

import time
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from aisa import assistant_client as ac
from aisa import orchestrator
from aisa.commands import Resume, Stop
from aisa.models import JobStatus, Runtime

T0 = datetime(2026, 10, 21, 13, 24, 59, tzinfo=UTC)


# ---------- pure parts ----------

def test_stop_requested():
    assert not ac.stop_requested(T0, Runtime())
    assert ac.stop_requested(T0, Runtime(paused=True))
    # STOP after the answer started cancels it, even once LANJUT cleared `paused`.
    assert ac.stop_requested(T0, Runtime(paused=False, lastStopAt=T0 + timedelta(seconds=2)))
    # An older STOP does not cancel a newer question.
    assert not ac.stop_requested(T0, Runtime(paused=False, lastStopAt=T0 - timedelta(seconds=1)))


def test_cancelled_by_and_in_progress():
    stop = T0 + timedelta(seconds=2)
    now = T0 + timedelta(seconds=9)
    running = {"status": "berjalan", "startedAt": T0}
    assert ac.in_progress(running, now)
    assert ac.cancelled_by(running, stop, now)  # will be cancelled at its next check
    assert not ac.cancelled_by(running, None, now)
    assert not ac.cancelled_by({"status": "berjalan", "startedAt": stop + timedelta(seconds=1)},
                               stop, now)
    # A `berjalan` job left behind by a crashed instance is not an answer in progress.
    stale = {"status": "berjalan", "startedAt": T0 - timedelta(minutes=10)}
    assert not ac.in_progress(stale, now) and not ac.cancelled_by(stale, stop, now)
    assert ac.cancelled_by({"status": "dihentikan", "startedAt": T0, "endedAt": now}, stop, now)
    assert not ac.cancelled_by({"status": "dihentikan", "startedAt": T0,
                                "endedAt": stop - timedelta(seconds=1)}, stop, now)
    assert not ac.cancelled_by({"status": "selesai", "startedAt": T0, "endedAt": now}, stop, now)


def test_stop_and_resume_replies():
    assert "dibatalkan" in orchestrator.stop_reply(True)
    assert "dibatalkan" not in orchestrator.stop_reply(False)
    assert orchestrator.stop_reply(False).startswith("AISA dijeda (STOP).")
    assert orchestrator.resume_reply(False) == "Pekerjaan AI dilanjutkan."
    assert orchestrator.resume_reply(True) == (
        "Pekerjaan AI dilanjutkan. Pertanyaan yang dibatalkan perlu dikirim ulang.")


def test_execute_stop_and_resume(monkeypatch):
    paused = []
    monkeypatch.setattr(orchestrator.domain, "set_paused", lambda p, via: paused.append(p))
    monkeypatch.setattr(orchestrator.intake, "process_queue", lambda: None)
    monkeypatch.setattr(orchestrator.assistant_client, "answer_in_progress", lambda: True)
    assert "dibatalkan" in orchestrator._execute("62812", Stop())
    monkeypatch.setattr(orchestrator.db, "runtime", lambda: Runtime(paused=True, lastStopAt=T0))
    monkeypatch.setattr(orchestrator.assistant_client, "cancelled_since", lambda t: t == T0)
    assert orchestrator._execute("62812", Resume()).endswith("perlu dikirim ulang.")
    monkeypatch.setattr(orchestrator.assistant_client, "cancelled_since", lambda t: False)
    assert orchestrator._execute("62812", Resume()) == "Pekerjaan AI dilanjutkan."
    assert paused == [True, False, False]


# ---------- ask() with a fake job, engine and GOWA ----------

class FakeJob:
    def __init__(self, *a, **k):
        self.job = SimpleNamespace(startedAt=T0)
        self.steps, self.status = [], None

    def begin(self, action, tool, actor):
        pass

    def step(self, action, tool, actor, **k):
        self.steps.append((action, k.get("status", "ok"), k.get("tokens_in", 0)))

    def finish(self, status):
        self.status = status


@pytest.fixture
def harness(monkeypatch):
    jobs, sent, presence = [], [], []
    rt = {"value": Runtime()}

    def make_job(*a, **k):
        jobs.append(FakeJob())
        return jobs[-1]

    monkeypatch.setattr(ac, "JobLog", make_job)
    monkeypatch.setattr(ac, "settings", lambda: SimpleNamespace(assistant_engine_id="",
                                                                assistant_model="m"))
    monkeypatch.setattr(ac.db, "runtime", lambda: rt["value"])
    monkeypatch.setattr(ac.gowa, "send", lambda phone, text: sent.append(text))
    monkeypatch.setattr(ac.gowa, "presence", lambda phone, typing: presence.append(typing))
    return SimpleNamespace(jobs=jobs, sent=sent, presence=presence, rt=rt, mp=monkeypatch)


def test_stop_between_events_cancels_and_keeps_tokens(harness):
    def fake(phone, text, on_event):
        on_event([("count_proposals", {})], 1000, 10)
        harness.rt["value"] = Runtime(paused=True, lastStopAt=T0 + timedelta(seconds=2))
        on_event([], 500, 5)  # STOP is seen here: the stream is abandoned
        raise AssertionError("must not keep consuming after STOP")

    harness.mp.setattr(ac, "_ask_local", fake)
    assert ac.ask("62812", "ringkas semua") is None
    job = harness.jobs[0]
    assert job.status == JobStatus.dihentikan
    assert job.steps[-1] == ("Dihentikan oleh STOP", "dihentikan", 500)
    assert harness.sent == []


def test_stop_then_lanjut_before_send_still_cancels(harness):
    def fake(phone, text, on_event):
        on_event([], 100, 1)
        # STOP and LANJUT both happened while the last model call ran.
        harness.rt["value"] = Runtime(paused=False, lastStopAt=T0 + timedelta(seconds=2))
        return "jawaban lama"

    harness.mp.setattr(ac, "_ask_local", fake)
    assert ac.ask("62812", "ringkas semua") is None
    assert harness.jobs[0].status == JobStatus.dihentikan


def test_answer_without_stop_is_returned(harness):
    harness.rt["value"] = Runtime(lastStopAt=T0 - timedelta(hours=1))
    harness.mp.setattr(ac, "_ask_local", lambda p, t, on_event: on_event([], 10, 1) or "Halo")
    assert ac.ask("62812", "halo") == "Halo"
    assert harness.jobs[0].status == JobStatus.selesai


def test_heartbeat_wait_message_once_and_presence_cleared(harness):
    harness.mp.setattr(ac, "WAIT_AFTER_S", 0.05)
    harness.mp.setattr(ac, "PRESENCE_EVERY_S", 0.02)
    harness.mp.setattr(ac, "HEARTBEAT_TICK_S", 0.01)
    harness.mp.setattr(ac, "_ask_local", lambda p, t, on_event: time.sleep(0.2) or "Halo")
    assert ac.ask("62812", "halo", notify=True) == "Halo"
    time.sleep(0.1)
    assert harness.sent == [ac.WAIT_MESSAGE]
    assert harness.presence[0] is True and harness.presence[-1] is False


def test_heartbeat_failures_never_break_the_answer(harness):
    def boom(*a):
        raise RuntimeError("gowa down")

    harness.mp.setattr(ac.gowa, "presence", boom)
    harness.mp.setattr(ac.gowa, "send", boom)
    harness.mp.setattr(ac, "WAIT_AFTER_S", 0.01)
    harness.mp.setattr(ac, "HEARTBEAT_TICK_S", 0.01)
    harness.mp.setattr(ac, "_ask_local", lambda p, t, on_event: time.sleep(0.1) or "Halo")
    assert ac.ask("62812", "halo", notify=True) == "Halo"


def test_heartbeat_stops_on_stop_and_sends_no_wait_message(harness):
    harness.mp.setattr(ac, "WAIT_AFTER_S", 0.1)
    harness.mp.setattr(ac, "HEARTBEAT_TICK_S", 0.01)

    def fake(phone, text, on_event):
        harness.rt["value"] = Runtime(paused=True, lastStopAt=T0 + timedelta(seconds=1))
        time.sleep(0.3)  # a long model call during which STOP arrives
        return "jawaban lama"

    harness.mp.setattr(ac, "_ask_local", fake)
    assert ac.ask("62812", "halo", notify=True) is None
    time.sleep(0.05)
    assert harness.sent == [] and harness.presence[-1] is False


def test_get_overview_is_compact(monkeypatch):
    from aisa.assistant import tools

    rows = [{"id": f"p{i}", "name": f"S{i}", "status": "dinilai", "effectiveCategory": "layak_bersyarat",
             "assessment": {"score": float(i)}, "profile": {"sector": "agri"},
             "responded": i % 2 == 0} for i in range(60)]
    monkeypatch.setattr(tools.store, "list_proposals", lambda: rows)
    out = tools.get_overview()
    assert out["total"] == 60 and out["ditampilkan"] == 50 and len(out["proposal"]) == 50
    assert out["belumDitanggapi"] == 30 and out["perGrade"] == {"Layak bersyarat": 60}
    assert out["proposal"][0]["nama"] == "S59"
    assert set(out["proposal"][0]) <= {"nama", "sektor", "skor", "grade", "aksi", "status",
                                       "tanggapan", "diLuarFokus"}
