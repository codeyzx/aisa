"""Calls the Asisten and logs an `asisten` job with its token usage.

With ASSISTANT_ENGINE_ID set (full resource name `projects/…/locations/…/reasoningEngines/…`)
the deployed Agent Runtime engine is called, with one session per manager phone per WIB day
cached in `assistantSessions/{phone}`. Without it, `aisa.assistant.agent:root_agent` runs
in-process with an in-memory session (lost on restart)."""

from __future__ import annotations

import asyncio
import json
import threading
import time
from collections.abc import Callable
from functools import lru_cache
from typing import Any

from . import db
from .config import settings
from .jobs import JobLog
from .models import AssistantSession, JobKind, JobStatus, StepActor, to_doc

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
        self._t = time.monotonic()

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
        for i, (name, args) in enumerate(calls):
            first = i == 0
            self.job.step(f"Memanggil {name}", name, StepActor.model, model=self.model,
                          read=args_summary(args), tokens_in=tokens_in if first else 0,
                          tokens_out=tokens_out if first else 0, duration_ms=ms if first else 0)

    def answer(self, status: str = "ok", error: str | None = None) -> None:
        self.job.step("Menjawab pertanyaan", self.tool, StepActor.model, model=self.model,
                      read="data AISA (tools baca)" if status == "ok" else None,
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
def _engine():
    import vertexai

    name = settings().assistant_engine_id
    location = name.split("/locations/")[1].split("/")[0]
    client = vertexai.Client(project=settings().project, location=location)
    return client.agent_engines.get(name=name)


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


# ---------- public ----------


def ask(phone: str, text: str) -> str:
    remote = bool(settings().assistant_engine_id)
    # The label names the model the agent was deployed with (ASSISTANT_MODEL, the same
    # variable agent.py reads), not rules.models.asisten, which changes nothing at runtime.
    model = settings().assistant_model
    job = JobLog(JobKind.asisten, "Asisten", "Menjawab pertanyaan manajer", model=model)
    rec = StepRecorder(job, model, "agent_runtime" if remote else "adk.runner")
    try:
        answer = (_ask_remote if remote else _ask_local)(phone, text, rec.event)
    except Exception as e:
        rec.answer(status="gagal", error=str(e)[:500])
        job.finish(JobStatus.gagal)
        return "Maaf, asisten sedang tidak bisa dihubungi. Coba lagi sebentar."
    rec.answer()
    job.finish(JobStatus.selesai)
    return answer.strip() or NO_ANSWER
