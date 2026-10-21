"""Environment-driven settings. Secrets arrive as env vars (Cloud Run injects them from
Secret Manager); nothing secret is read from files."""

import os
from dataclasses import dataclass
from functools import lru_cache


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


@dataclass(frozen=True)
class Settings:
    project: str
    genai_location: str
    firestore_database: str
    decks_bucket: str
    gowa_base_url: str
    gowa_basic_auth: str
    gowa_device_id: str
    gowa_webhook_secret: str
    manager_phones: tuple[str, ...]
    manager_salutation: str
    manager_name: str
    internal_api_key: str
    intake_secret: str
    assistant_engine_id: str
    signer_service_account: str
    assistant_model: str
    scheduler_sa_email: str
    scheduler_audience: str


@lru_cache
def settings() -> Settings:
    phones = tuple(p.strip().lstrip("+") for p in _env("MANAGER_PHONES").split(",") if p.strip())
    return Settings(
        project=_env("GOOGLE_CLOUD_PROJECT") or _env("GCP_PROJECT") or "hackathon-primestep-09",
        # Gemini 3.x models are only served from the global endpoint in this project.
        genai_location=_env("GENAI_LOCATION", "global"),
        firestore_database=_env("FIRESTORE_DATABASE", "(default)"),
        decks_bucket=_env("DECKS_BUCKET"),
        gowa_base_url=_env("GOWA_BASE_URL", "https://gowa.aixel.id").rstrip("/"),
        gowa_basic_auth=_env("GOWA_BASIC_AUTH"),
        gowa_device_id=_env("GOWA_DEVICE_ID"),
        gowa_webhook_secret=_env("GOWA_WEBHOOK_SECRET"),
        manager_phones=phones,
        manager_salutation=_env("MANAGER_SALUTATION", "Pak"),
        manager_name=_env("MANAGER_NAME"),
        internal_api_key=_env("INTERNAL_API_KEY"),
        intake_secret=_env("INTAKE_SECRET"),
        assistant_engine_id=_env("ASSISTANT_ENGINE_ID"),
        signer_service_account=_env("SIGNER_SERVICE_ACCOUNT"),
        # The model the deployed Asisten really runs; the job label reads it from here.
        assistant_model=_env("ASSISTANT_MODEL", "gemini-3.8-flash"),
        scheduler_sa_email=_env("SCHEDULER_SA_EMAIL"),
        scheduler_audience=_env("SCHEDULER_AUDIENCE"),
    )
