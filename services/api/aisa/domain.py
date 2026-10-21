"""Manager actions shared by WhatsApp commands and the dashboard API, so both paths write
identical proposal changes and history rows."""

from __future__ import annotations

from typing import Any

from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from . import db
from .jobs import write_history
from .models import (
    CATEGORY_LABEL,
    Category,
    Correction,
    Proposal,
    ProposalStatus,
    Response,
    ResponseKind,
    Rules,
    Runtime,
    Via,
    to_doc,
    weights_valid,
)


class DomainError(ValueError):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


def _proposals():
    return db.client().collection("proposals")


def get_proposal(pid: str) -> Proposal:
    snap = _proposals().document(pid).get()
    if not snap.exists:
        raise DomainError("proposal tidak ditemukan", 404)
    return Proposal.model_validate(snap.to_dict())


def respond(pid: str, kind: ResponseKind, via: Via, note: str | None = None) -> Proposal:
    p = get_proposal(pid)
    t = db.now()
    r = Response(kind=kind, at=t, via=via, note=(note or "").strip() or None)
    _proposals().document(pid).update({"response": to_doc(r), "responded": True, "updatedAt": t})
    write_history(via=via, action="tanggapan", proposalId=pid, proposalName=p.name,
                  before=p.response.kind if p.response else None, after=r.kind, reason=r.note,
                  detail=f"{kind.value.capitalize()} {p.name}")
    return get_proposal(pid)


def unresponded_in(category: Category) -> list[tuple[str, str]]:
    """(id, name) of assessed, unresponded proposals in an effective category."""
    q = (_proposals().where(filter=FieldFilter("status", "==", ProposalStatus.dinilai.value))
         .where(filter=FieldFilter("responded", "==", False))
         .where(filter=FieldFilter("effectiveCategory", "==", category.value)))
    return [(s.id, s.get("name")) for s in q.stream()]


def respond_bulk(category: Category, kind: ResponseKind, via: Via,
                 proposal_ids: list[str] | None = None) -> int:
    """Respond to every unresponded proposal in `category`. When `proposal_ids` is given
    (a confirmed WA command), only those still unresponded in that category are touched."""
    current = dict(unresponded_in(category))
    ids = [i for i in (proposal_ids if proposal_ids is not None else list(current)) if i in current]
    if not ids:
        return 0
    t = db.now()
    r = to_doc(Response(kind=kind, at=t, via=via))
    batch = db.client().batch()
    for n, pid in enumerate(ids, 1):
        batch.update(_proposals().document(pid), {"response": r, "responded": True, "updatedAt": t})
        if n % 400 == 0:
            batch.commit()
            batch = db.client().batch()
    batch.commit()
    write_history(via=via, action="tanggapan_massal", after=kind.value,
                  detail=f"{kind.value.capitalize()} semua {CATEGORY_LABEL[category].lower()}: "
                         f"{len(ids)} proposal ({', '.join(current[i] for i in ids[:20])}"
                         f"{'…' if len(ids) > 20 else ''})")
    return len(ids)


def correct(pid: str, category: Category, reason: str, via: Via) -> Proposal:
    reason = (reason or "").strip()
    if not reason:
        raise DomainError("koreksi kategori wajib disertai alasan")
    p = get_proposal(pid)
    if p.status != ProposalStatus.dinilai:
        raise DomainError("hanya proposal yang sudah dinilai yang punya kategori", 409)
    t = db.now()
    c = Correction(category=category, reason=reason, at=t, via=via)
    _proposals().document(pid).update({"correction": to_doc(c), "effectiveCategory": category.value,
                                       "updatedAt": t})
    write_history(via=via, action="koreksi", proposalId=pid, proposalName=p.name,
                  before=p.effectiveCategory, after=category.value, reason=reason,
                  detail=f"Kategori {p.name} dipindahkan ke {CATEGORY_LABEL[category]}")
    return get_proposal(pid)


def set_paused(paused: bool, via: Via) -> Runtime:
    rt = Runtime(paused=paused, pausedAt=db.now() if paused else None,
                 pausedVia=via if paused else None)
    db.client().document("settings/runtime").set(to_doc(rt))
    write_history(via=via, action="stop" if paused else "lanjut",
                  detail="Pekerjaan AI dijeda (STOP)" if paused else "Pekerjaan AI dilanjutkan (LANJUT)")
    return rt


def update_rules(new: dict[str, Any], reason: str, via: Via) -> Rules:
    """Validate, bump the version, write settings/rules + rulesVersions/{v} + history."""
    reason = (reason or "").strip()
    if not reason:
        raise DomainError("perubahan aturan wajib disertai alasan")
    if not weights_valid(new.get("weights") or {}):
        raise DomainError("bobot harus berisi kelima kriteria dan berjumlah 1,0")
    rules_ref = db.client().document("settings/rules")

    @firestore.transactional
    def tx_update(tx) -> Rules:
        snap = rules_ref.get(transaction=tx)
        old_version = snap.get("version") if snap.exists else 0
        data = {**new, "version": old_version + 1, "changedAt": db.now(), "reason": reason}
        try:
            rules = Rules.model_validate(data)
        except Exception as e:
            raise DomainError(f"aturan tidak valid: {e}") from e
        doc = to_doc(rules)
        tx.set(rules_ref, doc)
        tx.set(db.client().document(f"rulesVersions/{rules.version}"), doc)
        return rules

    rules = tx_update(db.client().transaction())
    write_history(via=via, action="aturan_diubah", before=rules.version - 1, after=rules.version,
                  reason=reason, detail=f"Aturan penilaian diubah ke versi {rules.version}")
    return rules
