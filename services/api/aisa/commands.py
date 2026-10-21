"""Pure command recognition for manager WhatsApp messages. Commands never depend on a model."""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass

from .models import Category, ResponseKind

CATEGORY_WORDS: dict[str, Category] = {
    "sangat cocok": Category.sangat_cocok,
    "cocok": Category.cocok,
    "kurang cocok": Category.kurang_cocok,
    "tidak cocok": Category.tidak_cocok,
}
_CAT = r"(sangat\s+cocok|kurang\s+cocok|tidak\s+cocok|cocok)"
_KIND = r"(undang|pantau|arsipkan)"


@dataclass(frozen=True)
class Stop: ...


@dataclass(frozen=True)
class Resume: ...


@dataclass(frozen=True)
class Confirm: ...


@dataclass(frozen=True)
class Respond:
    kind: ResponseKind
    name: str


@dataclass(frozen=True)
class RespondBulk:
    kind: ResponseKind
    category: Category


@dataclass(frozen=True)
class Correct:
    name: str
    category: Category
    reason: str | None  # None = manager omitted "karena …"; caller must ask for it


Command = Stop | Resume | Confirm | Respond | RespondBulk | Correct


def _cat(s: str) -> Category:
    return CATEGORY_WORDS[re.sub(r"\s+", " ", s.lower())]


def parse(text: str) -> Command | None:
    t = re.sub(r"\s+", " ", text).strip().rstrip(".!")
    low = t.lower()
    if low == "stop":
        return Stop()
    if low == "lanjut":
        return Resume()
    if low in ("ya", "iya"):
        return Confirm()
    if m := re.fullmatch(rf"{_KIND} semua {_CAT}", t, re.I):
        return RespondBulk(ResponseKind(m[1].lower()), _cat(m[2]))
    if m := re.fullmatch(rf"pindahkan (.+?) ke {_CAT}(?: karena(?: (.*))?)?", t, re.I):
        reason = (m[3] or "").strip() or None
        return Correct(m[1].strip(), _cat(m[2]), reason)
    if m := re.fullmatch(rf"{_KIND} (.+)", t, re.I):
        return Respond(ResponseKind(m[1].lower()), m[2].strip())
    return None


FUZZY_MIN = 0.85


@dataclass(frozen=True)
class NameMatch:
    id: str | None  # set only when exactly one proposal matches
    candidates: list[tuple[str, str]]  # (id, name) to offer when id is None


def match_name(query: str, proposals: list[tuple[str, str]]) -> NameMatch:
    """Exact (case-insensitive) → unique prefix → unique fuzzy ≥ 0.85. Anything else
    returns candidates and no id, so the caller changes nothing."""
    q = query.strip().lower()
    exact = [p for p in proposals if p[1].lower() == q]
    if len(exact) == 1:
        return NameMatch(exact[0][0], [])
    if len(exact) > 1:
        return NameMatch(None, exact)
    prefix = [p for p in proposals if p[1].lower().startswith(q)]
    if len(prefix) == 1:
        return NameMatch(prefix[0][0], [])
    if len(prefix) > 1:
        return NameMatch(None, prefix[:5])
    scored = sorted(
        ((difflib.SequenceMatcher(None, q, p[1].lower()).ratio(), p) for p in proposals),
        key=lambda x: x[0],
        reverse=True,
    )
    strong = [p for r, p in scored if r >= FUZZY_MIN]
    if len(strong) == 1:
        return NameMatch(strong[0][0], [])
    if strong:
        return NameMatch(None, strong[:5])
    return NameMatch(None, [p for r, p in scored[:3] if r >= 0.5])
