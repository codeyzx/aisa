"""Calls the Asisten and logs an `asisten` job with its token usage.

With ASSISTANT_ENGINE_ID set (full resource name `projects/…/locations/…/reasoningEngines/…`)
the deployed Agent Runtime engine is called, with one session per manager phone per WIB day
cached in `assistantSessions/{phone}`. Without it, `aisa.assistant.agent:root_agent` runs
in-process with an in-memory session (lost on restart). `forget` removes that state when a
proposal is deleted."""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from collections.abc import Callable
from contextlib import nullcontext
from datetime import datetime, timedelta
from functools import lru_cache
from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter

from . import db, gowa
from .config import settings
from .jobs import JobLog
from .models import AssistantSession, JobKind, JobStatus, Runtime, StepActor, to_doc

log = logging.getLogger(__name__)

APP_NAME = "aisa"
NO_ANSWER = "Maaf, asisten tidak memberi jawaban. Coba ulangi pertanyaannya."


def _usage(u: Any) -> tuple[int, int]:
    if not u:
        return 0, 0
    get = (lambda k: u.get(k)) if isinstance(u, dict) else (lambda k: getattr(u, k, None))
    return (get("prompt_token_count") or 0,
            (get("candidates_token_count") or 0) + (get("thoughts_token_count") or 0))


ARGS_MAX = 200


def args_summary(args: Any) -> str:
    try:
        s = json.dumps(args or {}, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        s = str(args)
    return s if len(s) <= ARGS_MAX else s[: ARGS_MAX - 1] + "…"


class StepRecorder:
    """Turns the agent's event stream into job steps: one step per function call (tool =
    function name, read = its arguments) carrying the usage of the event that asked for it,
    then a final answer step carrying every remaining token. The steps' tokens therefore
    sum to the run's total."""

    def __init__(self, job: Any, model: str, tool: str):
        self.job, self.model, self.tool = job, model, tool
        self.pending_in = self.pending_out = 0
        self.tool_calls = 0
        self._t = time.monotonic()
        self._answering()

    def _answering(self) -> None:
        # The agent is working towards its answer from the start and again after every tool
        # call it asked for, since recording that call's step clears the job's currentStep.
        self.job.begin("Menjawab pertanyaan", self.tool, StepActor.model)

    def _elapsed(self) -> int:
        now = time.monotonic()
        ms, self._t = int((now - self._t) * 1000), now
        return ms

    def event(self, calls: list[tuple[str, Any]], tokens_in: int, tokens_out: int) -> None:
        if not calls:
            self.pending_in += tokens_in
            self.pending_out += tokens_out
            return
        ms = self._elapsed()
        self.tool_calls += len(calls)
        for i, (name, args) in enumerate(calls):
            first = i == 0
            self.job.step(f"Memanggil {name}", name, StepActor.model, model=self.model,
                          read=args_summary(args), tokens_in=tokens_in if first else 0,
                          tokens_out=tokens_out if first else 0, duration_ms=ms if first else 0)
        self._answering()

    def stopped(self) -> None:
        """The run was cancelled by STOP: one step carrying the tokens used so far."""
        used = bool(self.pending_in or self.pending_out)
        self.job.step("Dihentikan oleh STOP", self.tool,
                      StepActor.model if used else StepActor.kode,
                      model=self.model if used else None, tokens_in=self.pending_in,
                      tokens_out=self.pending_out, duration_ms=self._elapsed(),
                      status="dihentikan")

    def answer(self, status: str = "ok", error: str | None = None) -> None:
        self.job.step("Menjawab pertanyaan", self.tool, StepActor.model, model=self.model,
                      # Only claim a data read when a tool actually ran in this answer.
                      read="data AISA (tools baca)" if status == "ok" and self.tool_calls else None,
                      tokens_in=self.pending_in, tokens_out=self.pending_out,
                      duration_ms=self._elapsed(), status=status, error=error)


OnEvent = Callable[[list[tuple[str, Any]], int, int], None]


# ---------- in-process ----------

_loop: asyncio.AbstractEventLoop | None = None
_loop_lock = threading.Lock()


def _run(coro):
    """Run a coroutine on one long-lived loop so cached async clients stay valid."""
    global _loop
    with _loop_lock:
        if _loop is None:
            _loop = asyncio.new_event_loop()
            threading.Thread(target=_loop.run_forever, daemon=True).start()
    return asyncio.run_coroutine_threadsafe(coro, _loop).result(timeout=180)


@lru_cache
def _runner():
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService

    from .assistant.agent import root_agent

    return Runner(app_name=APP_NAME, agent=root_agent, session_service=InMemorySessionService(),
                  auto_create_session=True)


def _ask_local(phone: str, text: str, on_event: OnEvent) -> str:
    from google.genai import types

    async def go():
        answer = ""
        msg = types.Content(role="user", parts=[types.Part(text=text)])
        async for ev in _runner().run_async(user_id=phone, session_id=f"{phone}-{db.wib_date()}",
                                            new_message=msg):
            a, b = _usage(ev.usage_metadata)
            on_event([(c.name, c.args) for c in ev.get_function_calls()], a, b)
            if ev.is_final_response() and ev.content and ev.content.parts:
                answer = "".join(p.text or "" for p in ev.content.parts if not getattr(p, "thought", False))
        return answer

    return _run(go())


# ---------- Agent Runtime ----------


@lru_cache
def _client():
    import vertexai

    location = settings().assistant_engine_id.split("/locations/")[1].split("/")[0]
    return vertexai.Client(project=settings().project, location=location)


@lru_cache
def _engine():
    return _client().agent_engines.get(name=settings().assistant_engine_id)


def _session_id(phone: str) -> str:
    ref = db.client().document(f"assistantSessions/{phone}")
    snap = ref.get()
    today = db.wib_date()
    if snap.exists and snap.get("date") == today:
        return snap.get("sessionId")
    s = _engine().create_session(user_id=phone)
    sid = s["id"] if isinstance(s, dict) else getattr(s, "id")
    ref.set(to_doc(AssistantSession(date=today, sessionId=sid)))
    return sid


def remote_calls(ev: dict) -> list[tuple[str, Any]]:
    """Function calls in one Agent Runtime stream_query event (a plain dict)."""
    parts = (ev.get("content") or {}).get("parts") or []
    return [(fc.get("name") or "?", fc.get("args")) for p in parts
            if isinstance(p, dict) and isinstance(fc := p.get("function_call"), dict)]


def _ask_remote(phone: str, text: str, on_event: OnEvent) -> str:
    texts: list[str] = []
    for ev in _engine().stream_query(user_id=phone, session_id=_session_id(phone), message=text):
        a, b = _usage(ev.get("usage_metadata"))
        on_event(remote_calls(ev), a, b)
        content = ev.get("content") or {}
        if content.get("role") == "model":
            t = "".join(p.get("text", "") for p in content.get("parts", []) if not p.get("thought"))
            if t:
                texts.append(t)
    return texts[-1] if texts else ""


# ---------- forgetting a deleted proposal ----------


def _not_found(e: Exception) -> bool:
    return getattr(e, "code", None) == 404


def _forget_remote(mentions: Callable[[str], bool], out: dict) -> None:
    """Sessions cannot be edited, so every one goes. The `assistantSessions` mappings are
    dropped first: if a session delete then fails, the next question still starts a fresh
    session instead of reopening the one that names the proposal. Memory Bank memories are
    deleted only when their fact mentions the proposal; the others are the manager's
    preferences and stay."""
    engine = settings().assistant_engine_id
    api = _client().agent_engines
    names: set[str] = set()
    for s in db.client().collection("assistantSessions").stream():
        if sid := (s.to_dict() or {}).get("sessionId"):
            names.add(f"{engine}/sessions/{sid}")
        s.reference.delete()
    # Also sessions no mapping points to any more (earlier days), which still hold events.
    names.update(s.name for s in api.sessions.list(name=engine) if s.name)
    for name in sorted(names):
        try:
            api.sessions.delete(name=name)
        except Exception as e:
            if not _not_found(e):
                raise
            continue
        out["sessions"] += 1
    for m in api.memories.list(name=engine):
        if m.name and m.fact and mentions(m.fact):
            try:
                api.memories.delete(name=m.name)
            except Exception as e:
                if not _not_found(e):
                    raise
                continue
            out["memories"] += 1


def _forget_local(out: dict) -> None:
    """The in-process runner keeps sessions in memory and has no memory service. Nothing to
    clear when no question has been asked since start (the runner was never built)."""
    if not _runner.cache_info().currsize:
        return
    sessions = _runner().session_service.sessions

    async def clear() -> int:  # on the runner's loop, so no answer reads it mid-change
        n = sum(len(by_id) for users in sessions.values() for by_id in users.values())
        sessions.clear()
        return n

    out["sessions"] += _run(clear())


def forget(mentions: Callable[[str], bool]) -> dict:
    """Remove the Asisten state that may still hold a deleted proposal: every session (the
    conversation events) and every Memory Bank memory whose fact `mentions` it. Returns
    `{"sessions": n, "memories": m}`, plus `error` when Agent Runtime could not be reached
    or refused; that never raises, since the proposal is already deleted from Firestore.
    The counts are deletes Agent Runtime accepted (it completes them as operations). The
    manager's WhatsApp chat is not AISA's to edit and is left as it is."""
    out: dict[str, Any] = {"sessions": 0, "memories": 0}
    try:
        if settings().assistant_engine_id:
            _forget_remote(mentions, out)
        else:
            _forget_local(out)
    except Exception as e:  # noqa: BLE001
        log.warning("asisten state scrub failed", exc_info=True)
        out["error"] = str(e)[:300] or type(e).__name__
    return out


# ---------- STOP and progress ----------

WAIT_MESSAGE = "⏳ Sedang mengambil data, mohon tunggu…"
WAIT_AFTER_S = 20.0
PRESENCE_EVERY_S = 8.0
HEARTBEAT_TICK_S = 4.0
# Longer than the 180 s an in-process answer may take: a `berjalan` asisten job older than
# this was left behind by a crashed instance and is not an answer in progress.
RUN_MAX = timedelta(seconds=200)


class Stopped(Exception):
    """STOP arrived after this answer started; it must not be sent."""


def stop_requested(started_at: datetime, rt: Runtime) -> bool:
    """An answer is cancelled while AISA is paused, or when any STOP came after it started
    (also when LANJUT has already followed that STOP)."""
    return rt.paused or (rt.lastStopAt is not None and rt.lastStopAt > started_at)


def in_progress(job: dict, now: datetime) -> bool:
    return job.get("status") == JobStatus.berjalan and job["startedAt"] > now - RUN_MAX


def cancelled_by(job: dict, last_stop: datetime | None, now: datetime) -> bool:
    """Whether STOP at `last_stop` cancelled this asisten job, or will at its next check."""
    if last_stop is None:
        return False
    if job.get("status") == JobStatus.dihentikan:
        return bool(job.get("endedAt")) and job["endedAt"] >= last_stop
    return in_progress(job, now) and job["startedAt"] < last_stop


def _asisten_jobs(status: JobStatus) -> list[dict]:
    # Two equality filters only: served without a composite index.
    q = (db.client().collection("jobs")
         .where(filter=FieldFilter("kind", "==", JobKind.asisten.value))
         .where(filter=FieldFilter("status", "==", status.value)))
    return [s.to_dict() for s in q.stream()]


def answer_in_progress() -> bool:
    now = db.now()
    return any(in_progress(j, now) for j in _asisten_jobs(JobStatus.berjalan))


def cancelled_since(last_stop: datetime | None) -> bool:
    """Whether the STOP at `last_stop` cancelled (or is cancelling) an Asisten answer."""
    if last_stop is None:
        return False
    now = db.now()
    return any(cancelled_by(j, last_stop, now)
               for st in (JobStatus.dihentikan, JobStatus.berjalan) for j in _asisten_jobs(st))


class _StopWatch:
    """Reads settings/runtime on each call until STOP is seen, then stays stopped. A failed
    read counts as not stopped: an unreadable flag must not swallow the manager's answer."""

    def __init__(self, started_at: datetime):
        self.started_at = started_at
        self.hit = False

    def __call__(self) -> bool:
        if not self.hit:
            try:
                self.hit = stop_requested(self.started_at, db.runtime())
            except Exception:  # noqa: BLE001
                log.warning("runtime read failed", exc_info=True)
        return self.hit


class _Heartbeat:
    """While an answer is prepared: keep WhatsApp's typing indicator on (it lapses on its
    own, so it is refreshed), send WAIT_MESSAGE once if the answer takes longer than
    WAIT_AFTER_S, and clear the indicator at the end or as soon as STOP is seen. Every GOWA
    call here is best-effort and can never fail the answer."""

    def __init__(self, phone: str, stopped: Callable[[], bool]):
        self.phone, self.stopped = phone, stopped
        self.done = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *_):
        self.done.set()
        self._thread.join(timeout=1)

    def _try(self, what: str, fn: Callable[[], Any]) -> None:
        try:
            fn()
        except Exception:  # noqa: BLE001
            log.warning("gowa %s failed", what, exc_info=True)

    def _run(self) -> None:
        t0 = time.monotonic()
        last_presence: float | None = None
        waited = False
        while not self.done.is_set() and not self.stopped():
            elapsed = time.monotonic() - t0
            if not waited and elapsed >= WAIT_AFTER_S:
                waited = True
                self._try("wait message", lambda: gowa.send(self.phone, WAIT_MESSAGE))
                last_presence = None  # a delivered message clears the indicator
            if not self.done.is_set() and (last_presence is None
                                           or elapsed - last_presence >= PRESENCE_EVERY_S):
                last_presence = elapsed
                self._try("presence", lambda: gowa.presence(self.phone, True))
            self.done.wait(HEARTBEAT_TICK_S)
        self._try("presence", lambda: gowa.presence(self.phone, False))


# ---------- public ----------

UNAVAILABLE_REPLY = "Maaf, asisten sedang tidak bisa dihubungi. Coba lagi sebentar."


class Unavailable(Exception):
    """The Asisten failed to answer; its `asisten` job is already recorded as failed.
    Each caller decides how to show it: WhatsApp sends UNAVAILABLE_REPLY as a message, the
    dashboard returns an error so the panel can offer a retry."""


def ask(phone: str, text: str, notify: bool = False) -> str | None:
    """The Asisten's reply, or None when STOP cancelled it (nothing must be sent). Raises
    Unavailable when the agent fails. `notify` shows the typing indicator and the wait message in the manager's chat."""
    remote = bool(settings().assistant_engine_id)
    # The label names the model the agent was deployed with (ASSISTANT_MODEL, the same
    # variable agent.py reads), not rules.models.asisten, which changes nothing at runtime.
    model = settings().assistant_model
    job = JobLog(JobKind.asisten, "Asisten", "Menjawab pertanyaan manajer", model=model)
    rec = StepRecorder(job, model, "agent_runtime" if remote else "adk.runner")
    stopped = _StopWatch(job.job.startedAt)

    def on_event(calls: list[tuple[str, Any]], tokens_in: int, tokens_out: int) -> None:
        rec.event(calls, tokens_in, tokens_out)
        if stopped():
            raise Stopped

    try:
        with _Heartbeat(phone, stopped) if notify else nullcontext():
            answer = (_ask_remote if remote else _ask_local)(phone, text, on_event)
        if stopped():
            raise Stopped
    except Stopped:
        rec.stopped()
        job.finish(JobStatus.dihentikan)
        return None
    except Exception as e:
        rec.answer(status="gagal", error=str(e)[:500])
        job.finish(JobStatus.gagal)
        raise Unavailable from e
    rec.answer()
    job.finish(JobStatus.selesai)
    return answer.strip() or NO_ANSWER
