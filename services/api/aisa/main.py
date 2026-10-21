"""FastAPI app for aisa-api. Routes are listed in services/api/README.md."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime
from pathlib import PurePath
from typing import Any, Literal

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from google.api_core.exceptions import AlreadyExists
from pydantic import BaseModel

from . import db, digest, domain, gowa, intake, orchestrator, storage
from .config import settings
from .models import Category, Founder, ResponseKind, Source, SourceKind, Via, WebhookEvent, to_doc

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("aisa")

app = FastAPI(title="aisa-api")


@app.exception_handler(domain.DomainError)
def _domain_error(_: Request, e: domain.DomainError):
    return JSONResponse({"detail": str(e)}, status_code=e.status)


def require_key(x_aisa_key: str | None = Header(None)) -> None:
    key = settings().internal_api_key
    if not key:
        raise HTTPException(503, "INTERNAL_API_KEY belum diatur")
    if not x_aisa_key or not hmac.compare_digest(x_aisa_key, key):
        raise HTTPException(401, "kunci tidak valid")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


# ---------- intake ----------


@app.post("/intake/upload", status_code=202, dependencies=[Depends(require_key)])
def intake_upload(bg: BackgroundTasks, file: UploadFile = File(...),
                  name: str | None = Form(None)) -> dict:
    pdf = file.file.read(storage.MAX_PDF_BYTES + 1)
    if len(pdf) > storage.MAX_PDF_BYTES:
        raise HTTPException(413, "PDF lebih dari 20 MB")
    if not pdf.startswith(b"%PDF"):
        raise HTTPException(422, "berkas bukan PDF")
    pid = intake.upload_id(pdf)
    gcs_path = storage.upload_deck(pid, pdf)
    file_name = PurePath(file.filename or f"{pid}.pdf").name
    created = intake.register(pid, Source(kind=SourceKind.upload, gcsPath=gcs_path, fileName=file_name),
                              name, Founder(), consent=True)
    if created:
        bg.add_task(intake.run_intake, pid, pdf)
    return {"proposalId": pid, "created": created}


class FormIntake(BaseModel):
    driveFileId: str
    fileName: str
    startupName: str
    founderName: str | None = None
    founderEmail: str | None = None
    consent: bool
    submittedAt: datetime | str | None = None


@app.post("/intake/form", status_code=202)
async def intake_form(request: Request, bg: BackgroundTasks) -> dict:
    raw = await request.body()
    secret = settings().intake_secret
    sig = request.headers.get("x-aisa-signature", "")
    expected = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest() if secret else ""
    if not secret or not hmac.compare_digest(expected, sig.strip().lower()):
        raise HTTPException(401, "tanda tangan tidak valid")
    try:
        body = FormIntake.model_validate_json(raw)
    except Exception as e:
        raise HTTPException(422, f"body tidak valid: {e}") from e
    if not body.consent:
        raise HTTPException(422, "proposal tanpa persetujuan tidak diproses")
    pid = intake.form_id(body.driveFileId)
    created = intake.register(
        pid, Source(kind=SourceKind.form, driveFileId=body.driveFileId, fileName=body.fileName),
        body.startupName, Founder(name=body.founderName, email=body.founderEmail), consent=True)
    if created:
        bg.add_task(intake.run_intake, pid)
    return {"proposalId": pid, "created": created}


# ---------- digest ----------


@app.post("/digest/run", dependencies=[Depends(require_key)])
def digest_run(slot: Literal["09.00", "17.00"], dryRun: bool = False) -> dict:
    return digest.run_digest(slot, send=not dryRun)


# ---------- WhatsApp webhook ----------


def _sender(payload: dict) -> str | None:
    """Manager digits, or None. A LID-only sender has no phone number to allowlist."""
    for jid in (payload.get("from"), payload.get("chat_id")):
        if isinstance(jid, str) and jid.endswith("@s.whatsapp.net"):
            digits = jid.split("@")[0].split(":")[0]
            return digits if digits in settings().manager_phones else None
    return None


def _process_message(phone: str, text: str) -> None:
    try:
        reply = orchestrator.handle(phone, text)
    except Exception:
        log.exception("orchestrator failed")
        reply = "Maaf, terjadi kesalahan saat memproses pesan. Coba lagi."
    try:
        gowa.send(phone, reply)
    except Exception:
        log.exception("reply send failed")


@app.post("/webhook/gowa")
async def webhook_gowa(request: Request, bg: BackgroundTasks) -> dict:
    raw = await request.body()
    if not gowa.signature_valid(raw, request.headers.get("x-hub-signature-256"),
                                settings().gowa_webhook_secret):
        raise HTTPException(401, "tanda tangan tidak valid")
    try:
        ev = json.loads(raw)
    except ValueError:
        return {"ignored": "bukan JSON"}
    payload = ev.get("payload") or {}
    if ev.get("event") != "message" or payload.get("is_from_me"):
        return {"ignored": "bukan pesan masuk"}
    if str(payload.get("chat_id", "")).endswith("@g.us"):
        return {"ignored": "grup"}
    phone = _sender(payload)
    text = (payload.get("body") or "").strip()
    if not phone or not text or not payload.get("id"):
        return {"ignored": "pengirim atau isi tidak dilayani"}
    try:
        db.client().document(f"webhookEvents/{payload['id']}").create(to_doc(WebhookEvent(at=db.now())))
    except AlreadyExists:
        return {"ignored": "duplikat"}
    bg.add_task(_process_message, phone, text)
    return {"accepted": True}


# ---------- dashboard API ----------


class ResponseIn(BaseModel):
    kind: ResponseKind
    note: str | None = None


class CorrectionIn(BaseModel):
    category: Category
    reason: str


class BulkIn(BaseModel):
    category: Category
    kind: ResponseKind


class RulesIn(BaseModel):
    rules: dict[str, Any]
    reason: str


@app.post("/api/proposals/{pid}/response", dependencies=[Depends(require_key)])
def api_response(pid: str, body: ResponseIn) -> dict:
    return to_doc(domain.respond(pid, body.kind, Via.dashboard, body.note))


@app.post("/api/proposals/{pid}/correction", dependencies=[Depends(require_key)])
def api_correction(pid: str, body: CorrectionIn) -> dict:
    return to_doc(domain.correct(pid, body.category, body.reason, Via.dashboard))


@app.post("/api/proposals/bulk-response", dependencies=[Depends(require_key)])
def api_bulk(body: BulkIn) -> dict:
    return {"count": domain.respond_bulk(body.category, body.kind, Via.dashboard)}


@app.put("/api/rules", dependencies=[Depends(require_key)])
def api_rules(body: RulesIn) -> dict:
    return to_doc(domain.update_rules(body.rules, body.reason, Via.dashboard))


@app.post("/api/runtime/stop", dependencies=[Depends(require_key)])
def api_stop() -> dict:
    return to_doc(domain.set_paused(True, Via.dashboard))


@app.post("/api/runtime/resume", dependencies=[Depends(require_key)])
def api_resume(bg: BackgroundTasks) -> dict:
    rt = domain.set_paused(False, Via.dashboard)
    bg.add_task(intake.process_queue)
    return to_doc(rt)


@app.get("/api/proposals/{pid}/deck-url", dependencies=[Depends(require_key)])
def api_deck_url(pid: str) -> dict:
    p = domain.get_proposal(pid)
    if p.source.kind == SourceKind.form and p.source.driveFileId:
        # Form decks stay in Drive (not copied); the manager opens them there.
        return {"url": f"https://drive.google.com/file/d/{p.source.driveFileId}/view", "expiresIn": None}
    try:
        return {"url": storage.signed_deck_url(p.source, pid), "expiresIn": 900}
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e
    except RuntimeError as e:  # bucket or signer not configured
        raise HTTPException(503, str(e)) from e
