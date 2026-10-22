"""Retention: proposals decided `tolak` are deleted `rules.retentionDays` after that
decision, through the same `domain.delete_proposal` a founder's request uses. `setuju` is
never deleted automatically."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter

from . import db, domain
from .jobs import JobLog
from .models import JobKind, JobStatus, ResponseKind, Via


def due(rows: list[tuple[str, dict[str, Any] | None]], now: datetime, days: int) -> list[str]:
    """Ids whose response is `tolak` and was given strictly more than `days` days ago."""
    cutoff = now - timedelta(days=days)
    out = []
    for pid, response in rows:
        if not response or response.get("kind") != ResponseKind.tolak.value:
            continue
        at = response.get("at")
        if isinstance(at, datetime) and at < cutoff:
            out.append(pid)
    return out


def run() -> dict:
    """Delete every `tolak` proposal past retention, logged as one job."""
    days = db.load_rules().retentionDays
    reason = f"retensi otomatis {days} hari"
    job = JobLog(JobKind.perintah, "Retensi", f"Retensi otomatis {days} hari")
    try:
        with job.code_step(f"Cari proposal ditolak lebih dari {days} hari", "firestore",
                           read="proposals"):
            # Equality on one field only, then the date in code: no composite index needed.
            q = db.client().collection("proposals").where(
                filter=FieldFilter("response.kind", "==", ResponseKind.tolak.value))
            ids = due([(s.id, s.to_dict().get("response")) for s in q.stream()], db.now(), days)
        deleted = []
        for pid in ids:
            with job.code_step("Hapus proposal", "kode", wrote=f"proposals/{pid}"):
                try:
                    domain.delete_proposal(pid, reason, Via.sistem)
                    deleted.append(pid)
                except domain.DomainError as e:
                    if e.status != 404:  # already gone between the query and now
                        raise
        job.finish(JobStatus.selesai)
        return {"retentionDays": days, "deleted": len(deleted), "proposalIds": deleted}
    except Exception:
        job.finish(JobStatus.gagal)
        raise
