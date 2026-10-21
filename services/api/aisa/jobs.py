"""Aktivitas AI log: one `jobs/{id}` card with `steps` written as they happen, plus the
token counters in `dailyStats`."""

from __future__ import annotations

import time
import uuid
from contextlib import contextmanager

from google.cloud import firestore

from . import db
from .models import Job, JobKind, JobStatus, Step, StepActor, to_doc


class JobLog:
    def __init__(self, kind: JobKind, agent: str, title: str, model: str | None = None,
                 proposal_id: str | None = None, digest_id: str | None = None):
        self.id = f"{kind.value}-{db.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"
        self.kind = kind
        self.ref = db.client().collection("jobs").document(self.id)
        self.seq = 0
        self.tokens_in = 0
        self.tokens_out = 0
        self.model_calls = 0
        self._t0 = time.monotonic()
        self.job = Job(kind=kind, agent=agent, title=title, model=model, proposalId=proposal_id,
                       digestId=digest_id, status=JobStatus.berjalan, startedAt=db.now())
        self.ref.set(to_doc(self.job))

    def step(self, action: str, tool: str, actor: StepActor, *, model: str | None = None,
             read: str | None = None, wrote: str | None = None, tokens_in: int = 0,
             tokens_out: int = 0, duration_ms: int = 0, status: str = "ok",
             error: str | None = None) -> None:
        self.seq += 1
        if actor == StepActor.model:
            self.model_calls += 1
        self.tokens_in += tokens_in
        self.tokens_out += tokens_out
        s = Step(seq=self.seq, at=db.now(), action=action, tool=tool, actor=actor, model=model,
                 read=read, wrote=wrote, tokensIn=tokens_in, tokensOut=tokens_out,
                 durationMs=duration_ms, status=status, error=error)
        self.ref.collection("steps").document(f"{self.seq:03d}").set(to_doc(s))
        self.ref.update({"stepCount": self.seq, "tokensIn": self.tokens_in,
                         "tokensOut": self.tokens_out})

    @contextmanager
    def code_step(self, action: str, tool: str, read: str | None = None,
                  wrote: str | None = None):
        """A step done by code: actor `kode`, zero tokens. Records a failure and re-raises."""
        t0 = time.monotonic()
        try:
            yield
        except Exception as e:
            self.step(action, tool, StepActor.kode, read=read, wrote=wrote, status="gagal",
                      error=str(e)[:500], duration_ms=int((time.monotonic() - t0) * 1000))
            raise
        self.step(action, tool, StepActor.kode, read=read, wrote=wrote,
                  duration_ms=int((time.monotonic() - t0) * 1000))

    def finish(self, status: JobStatus) -> None:
        end = db.now()
        self.ref.update({"status": status.value, "endedAt": end,
                         "durationMs": int((time.monotonic() - self._t0) * 1000)})
        if self.tokens_in or self.tokens_out or self.model_calls:
            inc = firestore.Increment
            db.client().document(f"dailyStats/{db.wib_date(end)}").set({
                "date": db.wib_date(end),
                "tokensIn": inc(self.tokens_in),
                "tokensOut": inc(self.tokens_out),
                "modelCalls": inc(self.model_calls),
                "tokensByKind": {self.kind.value: {"in": inc(self.tokens_in),
                                                   "out": inc(self.tokens_out)}},
            }, merge=True)


def write_history(**fields) -> None:
    from .models import History

    h = History(at=db.now(), **fields)
    db.client().collection("history").add(to_doc(h))
