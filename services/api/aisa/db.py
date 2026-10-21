"""Firestore access shared by every module. All AISA writes go through this service."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from functools import lru_cache

from google.cloud import firestore

from .config import settings
from .models import Rules, Runtime

WIB = timezone(timedelta(hours=7))


@lru_cache
def client() -> firestore.Client:
    s = settings()
    return firestore.Client(project=s.project, database=s.firestore_database)


def now() -> datetime:
    return datetime.now(timezone.utc)


def wib_date(at: datetime | None = None) -> str:
    return (at or now()).astimezone(WIB).strftime("%Y-%m-%d")


class RulesMissing(RuntimeError):
    pass


def load_rules() -> Rules:
    """Active rules. Missing rules are an error: there is no silent default at runtime."""
    snap = client().document("settings/rules").get()
    if not snap.exists:
        raise RulesMissing("settings/rules tidak ada; jalankan `aisa seed-rules`")
    return Rules.model_validate(snap.to_dict())


def is_paused() -> bool:
    snap = client().document("settings/runtime").get()
    return bool(snap.exists and Runtime.model_validate(snap.to_dict()).paused)
