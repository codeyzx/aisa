"""Calls the Asisten and logs an `asisten` job with its token usage.

With ASSISTANT_ENGINE_ID set (full resource name `projects/…/locations/…/reasoningEngines/…`)
the deployed Agent Runtime engine is called, with one session per manager phone per WIB day
cached in `assistantSessions/{phone}`. Without it, `aisa.assistant.agent:root_agent` runs
in-process with an in-memory session (lost on restart)."""

from __future__ import annotations

import asyncio
import threading
import time
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


def _ask_local(phone: str, text: str) -> tuple[str, int, int]:
    from google.genai import types

    async def go():
        tin = tout = 0
        answer = ""
        msg = types.Content(role="user", parts=[types.Part(text=text)])
        async for ev in _runner().run_async(user_id=phone, session_id=f"{phone}-{db.wib_date()}",
                                            new_message=msg):
            a, b = _usage(ev.usage_metadata)
            tin, tout = tin + a, tout + b
            if ev.is_final_response() and ev.content and ev.content.parts:
                answer = "".join(p.text or "" for p in ev.content.parts if not getattr(p, "thought", False))
        return answer, tin, tout

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


def _ask_remote(phone: str, text: str) -> tuple[str, int, int]:
    tin = tout = 0
    texts: list[str] = []
    for ev in _engine().stream_query(user_id=phone, session_id=_session_id(phone), message=text):
        a, b = _usage(ev.get("usage_metadata"))
        tin, tout = tin + a, tout + b
        content = ev.get("content") or {}
        if content.get("role") == "model":
            t = "".join(p.get("text", "") for p in content.get("parts", []) if not p.get("thought"))
            if t:
                texts.append(t)
    return (texts[-1] if texts else ""), tin, tout


# ---------- public ----------


def ask(phone: str, text: str) -> str:
    remote = bool(settings().assistant_engine_id)
    model = "gemini-3.8-flash"
    try:
        model = db.load_rules().models.asisten
    except db.RulesMissing:
        pass  # the label only; the agent's model is fixed where it is defined
    job = JobLog(JobKind.asisten, "Asisten", "Menjawab pertanyaan manajer", model=model)
    t0 = time.monotonic()
    try:
        answer, tin, tout = (_ask_remote if remote else _ask_local)(phone, text)
    except Exception as e:
        job.step("Menjawab pertanyaan", "agent_runtime" if remote else "adk.runner", StepActor.model,
                 model=model, status="gagal", error=str(e)[:500],
                 duration_ms=int((time.monotonic() - t0) * 1000))
        job.finish(JobStatus.gagal)
        return "Maaf, asisten sedang tidak bisa dihubungi. Coba lagi sebentar."
    job.step("Menjawab pertanyaan", "agent_runtime" if remote else "adk.runner", StepActor.model,
             model=model, read="data AISA (tools baca)", tokens_in=tin, tokens_out=tout,
             duration_ms=int((time.monotonic() - t0) * 1000))
    job.finish(JobStatus.selesai)
    return answer.strip() or NO_ANSWER
