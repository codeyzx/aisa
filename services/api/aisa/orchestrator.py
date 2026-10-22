"""Orchestrator: commands are recognised by code (`commands.parse`); anything else goes to
the Asisten. Returns the reply text, or None when there is nothing to send (an Asisten answer
cancelled by STOP); sending it is the caller's job."""

from __future__ import annotations

import threading
from datetime import timedelta

from . import assistant_client, db, domain, intake
from .commands import (
    Confirm,
    Correct,
    LegacyWord,
    Resume,
    Respond,
    RespondBulk,
    Stop,
    match_name,
    parse,
)
from .digest import fmt_score
from .jobs import JobLog
from .models import (
    CATEGORY_LABEL,
    JobKind,
    JobStatus,
    PendingConfirmation,
    ResponseKind,
    Via,
    to_doc,
)

CONFIRM_TTL = timedelta(minutes=10)
PAUSED_REPLY = "AISA sedang dijeda (STOP). Kirim LANJUT untuk melanjutkan."
LEGACY_REPLY = "Perintah sekarang: setuju <nama> atau tolak <nama>."
# "… untuk menyetujui semuanya" / "Selesai: 3 proposal disetujui."
VERB = {ResponseKind.setuju: "menyetujui", ResponseKind.tolak: "menolak"}
DONE = {ResponseKind.setuju: "disetujui", ResponseKind.tolak: "ditolak"}


def stop_reply(answer_cancelled: bool) -> str:
    return ("AISA dijeda (STOP)."
            + (" Jawaban yang sedang diproses dibatalkan." if answer_cancelled else "")
            + " Proposal baru akan antre. Kirim LANJUT untuk melanjutkan.")


def resume_reply(answer_cancelled: bool) -> str:
    return ("Pekerjaan AI dilanjutkan."
            + (" Pertanyaan yang dibatalkan perlu dikirim ulang." if answer_cancelled else ""))


def _all_names() -> list[tuple[str, str]]:
    return [(s.id, s.get("name"))
            for s in db.client().collection("proposals").select(["name"]).stream()]


def _resolve(name: str) -> tuple[str | None, str]:
    """(proposal id, its stored name) or (None, reply listing candidates)."""
    names = _all_names()
    m = match_name(name, names)
    if m.id:
        return m.id, dict(names)[m.id]
    if not m.candidates:
        return None, f"Proposal \"{name}\" tidak ditemukan. Tidak ada yang diubah."
    lines = [f"Ada beberapa proposal yang mirip \"{name}\":"]
    lines += [f"{i}. {n}" for i, (_, n) in enumerate(m.candidates, 1)]
    lines.append("Tidak ada yang diubah. Kirim ulang perintah dengan nama lengkap.")
    return None, "\n".join(lines)


def _pending_ref(phone: str):
    return db.client().document(f"pendingConfirmations/{phone}")


def command_title(cmd) -> str:
    """The job title for a command: what was asked and of which proposal, never the free-text
    reason of a correction (that lives in history, which deletion scrubs)."""
    if isinstance(cmd, Stop):
        return "Perintah: STOP"
    if isinstance(cmd, Resume):
        return "Perintah: LANJUT"
    if isinstance(cmd, Confirm):
        return "Perintah: YA"
    if isinstance(cmd, Respond):
        return f"Perintah: {cmd.kind.value} {cmd.name[:60]}"
    if isinstance(cmd, Correct):
        return f"Perintah: pindahkan {cmd.name[:60]}"
    if isinstance(cmd, RespondBulk):
        return f"Perintah: {cmd.kind.value} semua {CATEGORY_LABEL[cmd.category].lower()}"
    raise AssertionError(cmd)


def _execute(phone: str, cmd, job: JobLog | None = None) -> str:
    """Run a command; `job`, when given, is linked to the proposals the command acts on."""
    def link(**kw) -> None:
        if job is not None:
            job.link(**kw)

    if isinstance(cmd, Stop):
        # Any answer running now started before this STOP, so it will be cancelled.
        running = assistant_client.answer_in_progress()
        domain.set_paused(True, Via.wa)
        return stop_reply(running)
    if isinstance(cmd, Resume):
        cancelled = assistant_client.cancelled_since(db.runtime().lastStopAt)
        domain.set_paused(False, Via.wa)
        threading.Thread(target=intake.process_queue, daemon=True).start()
        return resume_reply(cancelled)
    if isinstance(cmd, Respond):
        pid, found = _resolve(cmd.name)
        if not pid:
            return found
        link(title=f"Perintah: {cmd.kind.value} {found}", proposal_id=pid)
        p = domain.respond(pid, cmd.kind, Via.wa)
        return f"Tercatat: {p.name} → {cmd.kind.value}."
    if isinstance(cmd, Correct):
        # The name is resolved before the reason is checked: an unknown or ambiguous name is
        # the reply that matters, and asking for a reason first would invite a retry that
        # still fails. A resolved name links the job to the proposal even when the reason is
        # missing, so the job goes with the proposal on deletion.
        pid, found = _resolve(cmd.name)
        if not pid:
            return found
        link(title=f"Perintah: pindahkan {found}", proposal_id=pid)
        if not cmd.reason:
            return ("Koreksi grade perlu alasan. Contoh: pindahkan "
                    f"{cmd.name} ke {CATEGORY_LABEL[cmd.category].lower()} karena <alasan>")
        p = domain.correct(pid, cmd.category, cmd.reason, Via.wa)
        score = p.assessment.score if p.assessment else None
        return (f"Grade {p.name} dipindahkan ke {CATEGORY_LABEL[cmd.category]}."
                + (f" Skor kualitas tetap {fmt_score(score)}." if score is not None else ""))
    if isinstance(cmd, RespondBulk):
        found = domain.unresponded_in(cmd.category)
        label = CATEGORY_LABEL[cmd.category]
        if not found:
            return f"Tidak ada proposal {label} yang belum ditanggapi."
        link(proposal_ids=[i for i, _ in found])
        command = f"{cmd.kind.value} semua {label.lower()}"
        pc = PendingConfirmation(command=command, proposalIds=[i for i, _ in found],
                                 expiresAt=db.now() + CONFIRM_TTL)
        _pending_ref(phone).set(to_doc(pc))
        names = ", ".join(n for _, n in found[:15]) + ("…" if len(found) > 15 else "")
        return (f"Ada {len(found)} proposal {label} yang belum ditanggapi: {names}\n"
                f"Balas YA dalam 10 menit untuk {VERB[cmd.kind]} semuanya.")
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
        link(proposal_ids=pc.proposalIds)
        n = domain.respond_bulk(bulk.category, bulk.kind, Via.wa, pc.proposalIds)
        return f"Selesai: {n} proposal {DONE[bulk.kind]}."
    raise AssertionError(cmd)


def handle(phone: str, text: str) -> str | None:
    cmd = parse(text)
    if isinstance(cmd, LegacyWord):
        # Nothing is run, so no job is logged; the Asisten would only guess at the old word.
        return LEGACY_REPLY
    if cmd is None:
        # STOP pauses all AI work, the Asisten included; commands still run.
        if db.is_paused():
            return PAUSED_REPLY
        try:
            return assistant_client.ask(phone, text, notify=True)
        except assistant_client.Unavailable:
            return assistant_client.UNAVAILABLE_REPLY
    job = JobLog(JobKind.perintah, "Orchestrator", command_title(cmd))
    try:
        with job.code_step(f"Jalankan perintah {type(cmd).__name__.lower()}", "kode",
                           wrote="proposals/history"):
            reply = _execute(phone, cmd, job)
        job.finish(JobStatus.selesai)
        return reply
    except domain.DomainError as e:
        job.finish(JobStatus.gagal)
        return f"Tidak bisa dijalankan: {e}"
    except Exception:
        job.finish(JobStatus.gagal)
        raise
