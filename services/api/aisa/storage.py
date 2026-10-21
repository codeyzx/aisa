"""Pitch deck bytes: GCS for uploads, Drive for form submissions, V4 signed URLs for viewing."""

from __future__ import annotations

import re
from datetime import timedelta
from functools import lru_cache

import google.auth
import httpx
from google.auth.transport.requests import Request
from google.cloud import storage

from .config import settings
from .models import Source, SourceKind

MAX_PDF_BYTES = 20 * 1024 * 1024
DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly"


@lru_cache
def _gcs() -> storage.Client:
    return storage.Client(project=settings().project)


def _bucket() -> storage.Bucket:
    name = settings().decks_bucket
    if not name:
        raise RuntimeError("DECKS_BUCKET belum diatur")
    return _gcs().bucket(name)


def deck_blob_name(proposal_id: str) -> str:
    return f"decks/{proposal_id}.pdf"


def upload_deck(proposal_id: str, pdf: bytes) -> str:
    blob = _bucket().blob(deck_blob_name(proposal_id))
    blob.upload_from_string(pdf, content_type="application/pdf")
    return f"gs://{blob.bucket.name}/{blob.name}"


def delete_deck(gcs_path: str) -> bool:
    """Delete a stored deck. Returns False when it was already gone."""
    from google.api_core.exceptions import NotFound

    bucket, _, name = gcs_path.removeprefix("gs://").partition("/")
    try:
        _gcs().bucket(bucket).blob(name).delete()
        return True
    except NotFound:
        return False


def download_drive(file_id: str) -> bytes:
    creds, _ = google.auth.default(scopes=[DRIVE_SCOPE])
    creds.refresh(Request())
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
    with httpx.Client(timeout=60, follow_redirects=True) as c:
        r = c.get(url, params={"alt": "media", "supportsAllDrives": "true"},
                  headers={"Authorization": f"Bearer {creds.token}"})
        r.raise_for_status()
    if len(r.content) > MAX_PDF_BYTES:
        raise ValueError("PDF lebih dari 20 MB")
    return r.content


def fetch_pdf(source: Source) -> bytes:
    if source.kind == SourceKind.form and source.driveFileId:
        return download_drive(source.driveFileId)
    if source.gcsPath:
        bucket, _, name = source.gcsPath.removeprefix("gs://").partition("/")
        return _gcs().bucket(bucket).blob(name).download_as_bytes()
    raise ValueError("sumber pitch deck tidak diketahui")


def inline_pdf_disposition(file_name: str) -> str:
    """Content-Disposition that makes the browser render the deck instead of downloading it.
    The name is reduced to a header-safe ASCII subset so a quote or newline in an uploaded
    file name cannot break the signed header."""
    stem = re.sub(r"[^A-Za-z0-9._ -]+", "_", file_name.removesuffix(".pdf")).strip(" ._") or "deck"
    return f'inline; filename="{stem}.pdf"'


def signed_deck_url(source: Source, proposal_id: str) -> str:
    """V4 signed URL valid 15 minutes that renders inline as a PDF (the response headers are
    overridden in the signature, so a stored object with a different Content-Type still opens
    in the browser's PDF viewer). Signing uses IAM signBlob for the runtime service
    account (Cloud Run has no private key), so that account needs
    roles/iam.serviceAccountTokenCreator on itself. Locally, set SIGNER_SERVICE_ACCOUNT to
    an account your user may impersonate for signing."""
    if source.gcsPath:
        bucket, _, name = source.gcsPath.removeprefix("gs://").partition("/")
        blob = _gcs().bucket(bucket).blob(name)
    else:
        blob = _bucket().blob(deck_blob_name(proposal_id))
        if not blob.exists():
            raise FileNotFoundError("pitch deck tidak tersimpan di GCS")
    creds, _ = google.auth.default()
    creds.refresh(Request())
    email = settings().signer_service_account or getattr(creds, "service_account_email", None)
    if not email or email == "default":
        raise RuntimeError("tidak ada service account untuk menandatangani URL")
    return blob.generate_signed_url(version="v4", expiration=timedelta(minutes=15), method="GET",
                                    service_account_email=email, access_token=creds.token,
                                    response_disposition=inline_pdf_disposition(source.fileName),
                                    response_type="application/pdf")
