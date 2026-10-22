"""Read-only Firestore access for the Asisten.

The Asisten is deployed to Agent Runtime on its own, so this module reads raw
documents following docs/reference/contracts/aisa-firestore.md instead of
importing ``aisa.models``. Nothing here writes: the Asisten has no write path.

Proposals are loaded with a field projection that omits ``founder`` so founder
contact data never reaches the model, and filtered in Python so no query here
needs a composite index.
"""

from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from typing import Any

WIB = timezone(timedelta(hours=7))

# Every proposal field the Asisten may read. ``founder`` is deliberately absent.
PROPOSAL_FIELDS = [
    "name",
    "nameLower",
    "status",
    "statusReason",
    "pageCount",
    "profile",
    "assessment",
    "fit",
    "category",
    "correction",
    "effectiveCategory",
    "response",
    "responded",
    "createdAt",
    "assessedAt",
]

# Upper bound on proposals scanned per tool call; the expected volume is far below it.
MAX_SCAN = 3000


@lru_cache(maxsize=1)
def client():
    from google.cloud import firestore

    project = os.environ.get("FIRESTORE_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT")
    database = os.environ.get("FIRESTORE_DATABASE", "(default)")
    return firestore.Client(project=project, database=database)


def plain(value: Any) -> Any:
    """Make a Firestore value JSON-safe; timestamps become WIB strings."""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(WIB).strftime("%Y-%m-%d %H:%M WIB")
    if isinstance(value, dict):
        return {k: plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(v) for v in value]
    return value


def list_proposals() -> list[dict]:
    snaps = client().collection("proposals").select(PROPOSAL_FIELDS).limit(MAX_SCAN).stream()
    out = []
    for snap in snaps:
        doc = snap.to_dict() or {}
        doc.pop("founder", None)
        doc["id"] = snap.id
        out.append(doc)
    return out


def get_proposal(proposal_id: str) -> dict | None:
    snap = client().collection("proposals").document(proposal_id).get(field_paths=PROPOSAL_FIELDS)
    if not snap.exists:
        return None
    doc = snap.to_dict() or {}
    doc.pop("founder", None)
    doc["id"] = snap.id
    return doc


def recent_history(limit: int) -> list[dict]:
    from google.cloud import firestore

    snaps = (
        client()
        .collection("history")
        .order_by("at", direction=firestore.Query.DESCENDING)
        .limit(limit)
        .stream()
    )
    return [snap.to_dict() or {} for snap in snaps]


def history_for(proposal_id: str) -> list[dict]:
    # Equality only, sorted in Python: where+order_by on different fields would need
    # a composite index.
    snaps = client().collection("history").where("proposalId", "==", proposal_id).limit(200).stream()
    rows = [snap.to_dict() or {} for snap in snaps]
    rows.sort(key=lambda r: r.get("at") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return rows


def daily_stats(days: list[date]) -> dict[str, dict]:
    col = client().collection("dailyStats")
    refs = [col.document(d.isoformat()) for d in days]
    return {snap.id: snap.to_dict() or {} for snap in client().get_all(refs) if snap.exists}


def get_doc(path: str) -> dict | None:
    snap = client().document(path).get()
    return (snap.to_dict() or {}) if snap.exists else None


def today_wib() -> date:
    return datetime.now(WIB).date()
