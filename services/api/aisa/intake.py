"""Intake: the one assessment path used by both the form route and the dashboard upload.

register() records the proposal once (idempotent by proposalId); run_intake() assesses it.
A proposal is only picked up while it is `antre` or `dihentikan`, so a duplicate trigger
never re-scores an assessed proposal."""

from __future__ import annotations

import hashlib
import logging
from pathlib import PurePath

from google.api_core.exceptions import AlreadyExists
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from . import db, storage
from .digest import fmt_score
from .jobs import JobLog, write_history
from .models import (
    CATEGORY_LABEL,
    Assessment,
    Founder,
    JobKind,
    JobStatus,
    Proposal,
    ProposalStatus,
    ProposalText,
    Source,
    StepActor,
    Via,
    to_doc,
)
from .pdftext import extract_pages, too_little_text
from .penilai import assess_once
from .scoring import categorize, compute_score, fit_check, values_of

log = logging.getLogger(__name__)

PICKABLE = (ProposalStatus.antre.value, ProposalStatus.dihentikan.value)
PENILAI_ATTEMPTS = 2  # first try + one retry, then perlu_dicek_manual


def upload_id(pdf: bytes) -> str:
    return f"upload-{hashlib.sha256(pdf).hexdigest()[:16]}"


def form_id(drive_file_id: str) -> str:
    return f"form-{drive_file_id}"


def _ref(pid: str):
    return db.client().collection("proposals").document(pid)


def register(pid: str, source: Source, name: str | None, founder: Founder, consent: bool) -> bool:
    """Create the proposal as `antre`. Returns False if it already existed (no change)."""
    display = (name or "").strip() or PurePath(source.fileName).stem
    t = db.now()
    p = Proposal(name=display, nameLower=display.lower(), source=source, founder=founder,
                 consent=consent, status=ProposalStatus.antre, createdAt=t, updatedAt=t)
    try:
        _ref(pid).create(to_doc(p))
        return True
    except AlreadyExists:
        return False


class _Stopped(Exception):
    pass


def _claim(pid: str) -> Proposal | None:
    ref = _ref(pid)

    @firestore.transactional
    def tx_claim(tx):
        snap = ref.get(transaction=tx)
        if not snap.exists or snap.get("status") not in PICKABLE:
            return None
        tx.update(ref, {"status": ProposalStatus.dinilai_proses.value, "statusReason": None,
                        "updatedAt": db.now()})
        return snap.to_dict()

    d = tx_claim(db.client().transaction())
    return Proposal.model_validate(d) if d else None


def _bump_daily(category: str | None, sector: str | None, manual: bool) -> None:
    inc = firestore.Increment
    upd: dict = {"date": db.wib_date(), "proposalsIn": inc(1)}
    if category:
        upd["byCategory"] = {category: inc(1)}
    if sector:
        upd["bySector"] = {sector: inc(1)}
    if manual:
        upd["perluDicekManual"] = inc(1)
    db.client().document(f"dailyStats/{db.wib_date()}").set(upd, merge=True)


def run_intake(pid: str, pdf: bytes | None = None) -> ProposalStatus | None:
    """Assess one proposal. Returns its final status, or None if it was not pickable."""
    if db.is_paused():
        return ProposalStatus.antre
    try:
        rules = db.load_rules()
    except db.RulesMissing:
        _ref(pid).update({"statusReason": "aturan penilaian belum ada", "updatedAt": db.now()})
        log.error("intake %s: settings/rules missing", pid)
        raise
    p = _claim(pid)
    if p is None:
        return None
    ref = _ref(pid)
    job = JobLog(JobKind.penilaian, "Penilai", f"Menilai proposal {p.name}",
                 model=rules.models.penilai, proposal_id=pid)
    ref.update({"jobId": job.id})

    def check_paused():
        if db.is_paused():
            raise _Stopped()

    def finish_manual(reason: str) -> ProposalStatus:
        t = db.now()
        ref.update({"status": ProposalStatus.perlu_dicek_manual.value, "statusReason": reason,
                    "assessment": None, "category": None, "effectiveCategory": None,
                    "fit": None, "updatedAt": t, **_spent(job)})
        write_history(via=Via.sistem, action="proposal_masuk", proposalId=pid,
                      proposalName=p.name, after="perlu_dicek_manual",
                      detail=f"Proposal {p.name} masuk: perlu dicek manual ({reason})")
        _bump_daily(None, None, manual=True)
        job.finish(JobStatus.selesai)
        return ProposalStatus.perlu_dicek_manual

    try:
        if pdf is None:
            with job.code_step("Ambil pitch deck", "storage", read=p.source.gcsPath or p.source.driveFileId):
                pdf = storage.fetch_pdf(p.source)
        with job.code_step("Ekstrak teks per halaman", "pypdf", read="pitch deck",
                           wrote=f"proposalTexts/{pid}"):
            pages = extract_pages(pdf)
            chars = sum(len(x) for x in pages)
            db.client().document(f"proposalTexts/{pid}").set(
                to_doc(ProposalText(pages=pages, charCount=chars)))
            ref.update({"pageCount": len(pages)})
        with job.code_step("Cek jumlah teks", "kode", read=f"proposalTexts/{pid}"):
            little = too_little_text(pages, rules.minCharsPerPage)
        if little:
            return finish_manual(f"teks terlalu sedikit ({chars} karakter di {len(pages)} halaman)")

        attempt = None
        for i in range(PENILAI_ATTEMPTS):
            check_paused()
            attempt = assess_once(pages, rules)
            job.step("Menilai 5 kriteria" + (" (ulang)" if i else ""), "gemini.generate_content",
                     StepActor.model, model=rules.models.penilai, read=f"proposalTexts/{pid}",
                     tokens_in=attempt.tokens_in, tokens_out=attempt.tokens_out,
                     duration_ms=attempt.duration_ms, status="ok" if attempt.ok else "gagal",
                     error=attempt.error)
            if attempt.ok:
                break
        if not attempt or not attempt.ok:
            return finish_manual(f"penilaian gagal validasi: {attempt.error if attempt else ''}"[:300])
        check_paused()

        with job.code_step("Hitung skor", "kode", read=f"settings/rules v{rules.version}"):
            values = values_of(attempt.criteria)
            score = compute_score(rules.weights, values)
        with job.code_step("Cek kecocokan", "kode", read=f"settings/rules v{rules.version}"):
            fit = fit_check(attempt.profile, rules.fit)
        with job.code_step("Tentukan kategori", "kode"):
            category, qof = categorize(score, values, fit.passed, rules.thresholds)

        name = p.name
        # No name was given at intake (it fell back to the file name): use the deck's own.
        if attempt.startup_name and p.name == PurePath(p.source.fileName).stem:
            name = attempt.startup_name
            job.ref.update({"title": f"Menilai proposal {name}"})
        assessment = Assessment(criteria=attempt.criteria, score=score,
                                rulesVersion=rules.version, model=rules.models.penilai)
        t = db.now()
        with job.code_step("Simpan hasil penilaian", "firestore", wrote=f"proposals/{pid}"):
            ref.update({
                "name": name, "nameLower": name.lower(),
                "status": ProposalStatus.dinilai.value, "statusReason": None,
                "profile": to_doc(attempt.profile), "assessment": to_doc(assessment),
                "fit": to_doc(fit), "category": category.value,
                "effectiveCategory": category.value, "qualityOutsideFocus": qof,
                **_spent(job), "assessedAt": t, "updatedAt": t,
            })
        write_history(via=Via.sistem, action="proposal_masuk", proposalId=pid, proposalName=name,
                      after=category.value,
                      detail=f"Proposal {name} masuk: skor {fmt_score(score)}, {CATEGORY_LABEL[category]}"
                             + (", berkualitas di luar fokus" if qof else ""))
        _bump_daily(category.value, attempt.profile.sector, manual=False)
        job.finish(JobStatus.selesai)
        return ProposalStatus.dinilai
    except _Stopped:
        job.step("Dihentikan oleh STOP", "kode", StepActor.kode, status="dihentikan")
        ref.update({"status": ProposalStatus.dihentikan.value,
                    "statusReason": "dihentikan oleh STOP", "updatedAt": db.now(), **_spent(job)})
        job.finish(JobStatus.dihentikan)
        return ProposalStatus.dihentikan
    except Exception as e:
        log.exception("intake %s failed", pid)
        # Back to the queue: an infrastructure failure is not a verdict on the deck.
        ref.update({"status": ProposalStatus.antre.value,
                    "statusReason": f"gagal diproses: {e}"[:300], "updatedAt": db.now(), **_spent(job)})
        job.finish(JobStatus.gagal)
        return ProposalStatus.antre


def _spent(job: JobLog) -> dict:
    """Add this run's tokens to the proposal. A proposal can be run more than once (STOP then
    LANJUT, or a retry after a failure); every run spends tokens, so they accumulate."""
    return {"tokens.in": firestore.Increment(job.tokens_in),
            "tokens.out": firestore.Increment(job.tokens_out)}


def process_queue() -> int:
    """Assess every `antre`/`dihentikan` proposal (used after LANJUT). Returns how many ran."""
    snaps = db.client().collection("proposals").where(filter=FieldFilter("status", "in", list(PICKABLE))).stream()
    n = 0
    for s in snaps:
        if db.is_paused():
            break
        if run_intake(s.id) is not None:
            n += 1
    return n
