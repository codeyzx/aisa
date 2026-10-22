"""Shared fakes for route- and flow-level tests: an in-memory Firestore, a recorded GOWA,
and settings from env. Nothing here talks to the network."""

from __future__ import annotations

import copy
import hashlib
import hmac
import itertools
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest
from google.api_core.exceptions import AlreadyExists, NotFound
from google.cloud import firestore as gfs
from google.cloud.firestore_v1.transforms import ArrayRemove, Increment

from aisa import config, db, gowa
from aisa.models import (
    Assessment,
    Criterion,
    CriterionResult,
    Profile,
    Proposal,
    ProposalStatus,
    Source,
    SourceKind,
    default_rules,
    to_doc,
)

MANAGER = "6281200002356"
OTHER = "6289999999999"
KEY = "test-key"
GOWA_SECRET = "gowa-secret"
INTAKE_SECRET = "intake-secret"
T0 = datetime(2026, 10, 21, 2, 0, tzinfo=UTC)  # 09.00 WIB


# ---------- in-memory Firestore ----------

def _transform(old: Any, new: Any) -> Any:
    if isinstance(new, Increment):
        return (old or 0) + new.value
    if isinstance(new, ArrayRemove):
        return [x for x in (old or []) if x not in new.values]
    return copy.deepcopy(new)


def _merge(old: dict, new: dict) -> dict:
    out = dict(old)
    for k, v in new.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        elif isinstance(v, dict):
            out[k] = _merge({}, v)
        else:
            out[k] = _transform(out.get(k), v)
    return out


def _get_path(d: dict | None, path: str) -> Any:
    cur: Any = d
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


class Snap:
    def __init__(self, ref: DocRef, data: dict | None):
        self.reference, self.id, self._data = ref, ref.id, data

    @property
    def exists(self) -> bool:
        return self._data is not None

    def to_dict(self) -> dict | None:
        return copy.deepcopy(self._data)

    def get(self, field: str) -> Any:
        return copy.deepcopy(_get_path(self._data, field))


class DocRef:
    def __init__(self, fs: FakeFirestore, path: str):
        self.fs, self.path, self.id = fs, path, path.rsplit("/", 1)[-1]

    def get(self, transaction=None) -> Snap:
        return Snap(self, self.fs.docs.get(self.path))

    def create(self, data: dict) -> None:
        if self.path in self.fs.docs:
            raise AlreadyExists(self.path)
        self.fs.docs[self.path] = _merge({}, data)

    def set(self, data: dict, merge: bool = False) -> None:
        base = self.fs.docs.get(self.path, {}) if merge else {}
        self.fs.docs[self.path] = _merge(base, data)

    def update(self, data: dict) -> None:
        if self.path not in self.fs.docs:
            raise NotFound(self.path)
        doc = self.fs.docs[self.path]
        for key, v in data.items():
            parts = key.split(".")
            cur = doc
            for p in parts[:-1]:
                cur = cur.setdefault(p, {})
            if v is gfs.DELETE_FIELD:
                cur.pop(parts[-1], None)
            else:
                cur[parts[-1]] = _transform(cur.get(parts[-1]), v)

    def delete(self) -> None:
        self.fs.docs.pop(self.path, None)

    def collection(self, name: str) -> Query:
        return Query(self.fs, f"{self.path}/{name}")


class Query:
    def __init__(self, fs: FakeFirestore, path: str, filters=(), order=None, limit_n=None,
                 group: bool = False):
        self.fs, self.path, self.filters, self.order, self.limit_n = fs, path, filters, order, limit_n
        self.group = group  # a collection-group query: `path` is the collection id

    def _in(self, doc_path: str) -> bool:
        parent = doc_path.rsplit("/", 1)[0]
        return parent.rsplit("/", 1)[-1] == self.path if self.group else parent == self.path

    def _with(self, **kw) -> Query:
        q = Query(self.fs, self.path, self.filters, self.order, self.limit_n, self.group)
        for k, v in kw.items():
            setattr(q, k, v)
        return q

    def document(self, doc_id: str | None = None) -> DocRef:
        return DocRef(self.fs, f"{self.path}/{doc_id or f'auto{next(self.fs.ids)}'}")

    def add(self, data: dict):
        ref = self.document()
        ref.set(data)
        return None, ref

    def where(self, filter) -> Query:
        return self._with(filters=(*self.filters, (filter.field_path, filter.op_string, filter.value)))

    def select(self, _fields) -> Query:
        return self

    def order_by(self, field: str, direction: str = "ASCENDING") -> Query:
        return self._with(order=(field, direction))

    def limit(self, n: int) -> Query:
        return self._with(limit_n=n)

    def _match(self, data: dict) -> bool:
        for field, op, value in self.filters:
            got = _get_path(data, field)
            if op == "==":
                ok = got == value
            elif op == "in":
                ok = got in value
            elif op == "array_contains":
                ok = isinstance(got, list) and value in got
            elif op == ">=":
                ok = got is not None and got >= value
            else:
                raise NotImplementedError(op)
            if not ok:
                return False
        return True

    def stream(self):
        rows = [(p, d) for p, d in self.fs.docs.items()
                if self._in(p) and self._match(d)]
        if self.order:
            field, direction = self.order
            rows = [r for r in rows if _get_path(r[1], field) is not None]
            rows.sort(key=lambda r: _get_path(r[1], field), reverse=direction == "DESCENDING")
        if self.limit_n is not None:
            rows = rows[: self.limit_n]
        return [Snap(DocRef(self.fs, p), copy.deepcopy(d)) for p, d in rows]

    def count(self):
        n = len(self.stream())
        return SimpleNamespace(get=lambda: [[SimpleNamespace(value=n)]])


class Batch:
    def __init__(self):
        self.ops = []

    def update(self, ref, data):
        self.ops.append(lambda: ref.update(data))

    def delete(self, ref):
        self.ops.append(ref.delete)

    def set(self, ref, data, merge=False):
        self.ops.append(lambda: ref.set(data, merge=merge))

    def commit(self):
        for op in self.ops:
            op()
        self.ops = []


class Tx:
    def set(self, ref, data, merge=False):
        ref.set(data, merge=merge)

    def update(self, ref, data):
        ref.update(data)

    def delete(self, ref):
        ref.delete()


class FakeFirestore:
    def __init__(self):
        self.docs: dict[str, dict] = {}
        self.ids = itertools.count(1)

    def document(self, path: str) -> DocRef:
        return DocRef(self, path)

    def collection(self, path: str) -> Query:
        return Query(self, path)

    def collection_group(self, collection_id: str) -> Query:
        return Query(self, collection_id, group=True)

    def batch(self) -> Batch:
        return Batch()

    def transaction(self) -> Tx:
        return Tx()

    # helpers for assertions
    def get(self, path: str) -> dict | None:
        return copy.deepcopy(self.docs.get(path))

    def all(self, collection: str) -> dict[str, dict]:
        return {p.rsplit("/", 1)[-1]: copy.deepcopy(d) for p, d in self.docs.items()
                if p.rsplit("/", 1)[0] == collection}


# ---------- fixtures ----------

@pytest.fixture(autouse=True)
def _no_real_google_clients(monkeypatch):
    """A test that forgets `fs` must fail, not quietly read or write the real project with
    the developer's ADC. Same for a model call that a test forgot to script."""
    def refuse(*_a, **_k):
        raise RuntimeError("test tried to open a real Google client; use the fs fixture or a fake")

    monkeypatch.setattr(gfs.Client, "__init__", refuse)
    from google import genai
    monkeypatch.setattr(genai.Client, "__init__", refuse)
    from aisa import llm
    llm.client.cache_clear()

@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("MANAGER_PHONES", MANAGER)
    monkeypatch.setenv("INTERNAL_API_KEY", KEY)
    monkeypatch.setenv("GOWA_WEBHOOK_SECRET", GOWA_SECRET)
    monkeypatch.setenv("INTAKE_SECRET", INTAKE_SECRET)
    monkeypatch.setenv("MANAGER_SALUTATION", "Ibu")
    monkeypatch.setenv("MANAGER_NAME", "")
    monkeypatch.setenv("ASSISTANT_ENGINE_ID", "")
    config.settings.cache_clear()
    yield monkeypatch
    config.settings.cache_clear()


@pytest.fixture
def fs(env):
    fake = FakeFirestore()
    env.setattr(db, "client", lambda: fake)
    # The fake transaction applies writes directly; no retry wrapper is needed.
    env.setattr(gfs, "transactional", lambda f: f)
    return fake


@pytest.fixture
def sent(env):
    """Every GOWA send, as (phone, text). Raises if anything tries the real network."""
    out: list[tuple[str, str]] = []

    def send(phone, text):
        out.append((phone, text))
        return [f"msg-{len(out)}"]

    env.setattr(gowa, "send", send)
    env.setattr(gowa, "presence", lambda phone, typing: None)
    return out


@pytest.fixture
def rules(fs):
    r = default_rules(T0)
    fs.document("settings/rules").set(to_doc(r))
    return r


def criteria(value: int = 4) -> dict:
    return {c: CriterionResult(value=value, reason=f"alasan {c.value}", notMentioned=False,
                               citations=[{"page": 1, "quote": "kutipan yang ada"}])
            for c in Criterion}


def seed_proposal(fs: FakeFirestore, pid: str, name: str, *, category: str | None = "perlu_penyesuaian",
                  score: float = 70.0, status: str = ProposalStatus.dinilai.value,
                  sector: str | None = "agritech", created: datetime = T0,
                  responded: bool = False, **extra) -> dict:
    assessed = status == ProposalStatus.dinilai.value
    p = Proposal(
        name=name, nameLower=name.lower(),
        source=Source(kind=SourceKind.upload, gcsPath=f"gs://b/decks/{pid}.pdf", fileName=f"{pid}.pdf"),
        consent=True, status=status, profile=Profile(sector=sector),
        assessment=Assessment(criteria=criteria(), score=score, rulesVersion=1, model="m") if assessed else None,
        category=category if assessed else None,
        effectiveCategory=category if assessed else None,
        responded=responded, createdAt=created, updatedAt=created)
    doc = {**to_doc(p), **extra}
    fs.document(f"proposals/{pid}").set(doc)
    return doc


def sign(raw: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
