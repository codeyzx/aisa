"""Orchestrator: commands are recognised by code (`commands.parse`); anything else goes to
the Asisten. Returns the reply text; sending it is the caller's job."""

from __future__ import annotations

import threading
from datetime import timedelta

from . import assistant_client, db, domain, intake
from .commands import (
    Confirm,
    Correct,
    Resume,
    Respond,
    RespondBulk,
    Stop,
    match_name,
    parse,
)
from .digest import fmt_score
from .jobs import JobLog
from .models import CATEGORY_LABEL, JobKind, JobStatus, PendingConfirmation, Via, to_doc

CONFIRM_TTL = timedelta(minutes=10)
PAUSED_REPLY = "AISA sedang dijeda (STOP). Kirim LANJUT untuk melanjutkan."


def _all_names() -> list[tuple[str, str]]:
    return [(s.id, s.get("name"))
            for s in db.client().collection("proposals").select(["name"]).stream()]


def _resolve(name: str) -> tuple[str | None, str | None]:
    """(proposal id, None) or (None, reply listing candidates)."""
    m = match_name(name, _all_names())
    if m.id:
        return m.id, None
    if not m.candidates:
        return None, f"Proposal \"{name}\" tidak ditemukan. Tidak ada yang diubah."
    lines = [f"Ada beberapa proposal yang mirip \"{name}\":"]
    lines += [f"{i}. {n}" for i, (_, n) in enumerate(m.candidates, 1)]
    lines.append("Tidak ada yang diubah. Kirim ulang perintah dengan nama lengkap.")
    return None, "\n".join(lines)


def _pending_ref(phone: str):
    return db.client().document(f"pendingConfirmations/{phone}")


def _execute(phone: str, cmd) -> str:
    if isinstance(cmd, Stop):
        domain.set_paused(True, Via.wa)
        return "Pekerjaan AI dijeda. Proposal baru akan antre sampai Anda kirim LANJUT."
    if isinstance(cmd, Resume):
        domain.set_paused(False, Via.wa)
        threading.Thread(target=intake.process_queue, daemon=True).start()
        return "Pekerjaan AI dilanjutkan. Proposal yang antre sedang dinilai."
    if isinstance(cmd, Respond):
        pid, reply = _resolve(cmd.name)
        if not pid:
            return reply
        p = domain.respond(pid, cmd.kind, Via.wa)
        return f"Tercatat: {p.name} → {cmd.kind.value}."
    if isinstance(cmd, Correct):
        if not cmd.reason:
            return ("Koreksi kategori perlu alasan. Contoh: pindahkan "
                    f"{cmd.name} ke {CATEGORY_LABEL[cmd.category].lower()} karena <alasan>")
        pid, reply = _resolve(cmd.name)
        if not pid:
            return reply
        p = domain.correct(pid, cmd.category, cmd.reason, Via.wa)
        score = p.assessment.score if p.assessment else None
        return (f"Kategori {p.name} dipindahkan ke {CATEGORY_LABEL[cmd.category]}."
                + (f" Skor kualitas tetap {fmt_score(score)}." if score is not None else ""))
    if isinstance(cmd, RespondBulk):
        found = domain.unresponded_in(cmd.category)
        label = CATEGORY_LABEL[cmd.category]
        if not found:
            return f"Tidak ada proposal {label} yang belum ditanggapi."
        command = f"{cmd.kind.value} semua {label.lower()}"
        pc = PendingConfirmation(command=command, proposalIds=[i for i, _ in found],
                                 expiresAt=db.now() + CONFIRM_TTL)
        _pending_ref(phone).set(to_doc(pc))
        names = ", ".join(n for _, n in found[:15]) + ("…" if len(found) > 15 else "")
        return (f"Ada {len(found)} proposal {label} yang belum ditanggapi: {names}\n"
                f"Balas YA dalam 10 menit untuk {cmd.kind.value} semuanya.")
    if isinstance(cmd, Confirm):
        ref = _pending_ref(phone)
        snap = ref.get()
        if not snap.exists:
            return "Tidak ada perintah yang menunggu konfirmasi."
        pc = PendingConfirmation.model_validate(snap.to_dict())
        ref.delete()
        if pc.expiresAt < db.now():
            return "Konfirmasi sudah kedaluwarsa (lebih dari 10 menit). Kirim ulang perintahnya."
        bulk = parse(pc.command)
        if not isinstance(bulk, RespondBulk):
            return "Perintah yang menunggu tidak dikenali. Tidak ada yang diubah."
        n = domain.respond_bulk(bulk.category, bulk.kind, Via.wa, pc.proposalIds)
        return f"Selesai: {n} proposal ditandai {bulk.kind.value}."
    raise AssertionError(cmd)


def handle(phone: str, text: str) -> str:
    cmd = parse(text)
    if cmd is None:
        # STOP pauses all AI work, the Asisten included; commands still run.
        if db.is_paused():
            return PAUSED_REPLY
        return assistant_client.ask(phone, text)
    job = JobLog(JobKind.perintah, "Orchestrator", f"Perintah: {text.strip()[:60]}")
    try:
        with job.code_step(f"Jalankan perintah {type(cmd).__name__.lower()}", "kode",
                           wrote="proposals/history"):
            reply = _execute(phone, cmd)
        job.finish(JobStatus.selesai)
        return reply
    except domain.DomainError as e:
        job.finish(JobStatus.gagal)
        return f"Tidak bisa dijalankan: {e}"
    except Exception:
        job.finish(JobStatus.gagal)
        raise
