"""`aisa migrate-responses`: move stored decisions from undang / pantau / arsipkan to
setuju / tolak.

Dry-run by default: it reads Firestore and prints what `--apply` would do, with no write.
`--apply` rewrites each proposal whose `response.kind` is an old word — `undang` → `setuju`
and `arsipkan` → `tolak` (keeping `at`, `via` and `note`, so a `tolak` keeps the retention
clock of its archive date), `pantau` → no response, back to awaiting a decision — writes one
`tanggapan` history row per changed proposal, and deletes every pending WhatsApp
confirmation (they name old commands). Running it again finds nothing to do: no proposal
carries an old word and no confirmation is pending."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from . import db
from .jobs import write_history
from .models import LEGACY_RESPONSE_LABEL, RESPONSE_LABEL, ResponseKind, Via

# An old decision and what it becomes; None clears the response.
MAPPING: dict[str, ResponseKind | None] = {
    "undang": ResponseKind.setuju,
    "arsipkan": ResponseKind.tolak,
    "pantau": None,
}
REASON = "Skala tanggapan baru: Setuju / Tolak"


def _old_label(kind: str) -> str:
    """'Undang', 'Pantau', 'Arsipkan': the old word as the manager knew it."""
    return kind.capitalize()


def detail(name: str, old: str, new: ResponseKind | None) -> str:
    if new is None:
        return (f"Tanggapan {_old_label(old)} untuk {name} dikosongkan; proposal kembali "
                "menunggu keputusan")
    return (f"Tanggapan {name} dipindah ke skala baru: {_old_label(old)} → "
            f"{RESPONSE_LABEL[new]}")


def plan(proposals: dict[str, dict]) -> list[dict[str, Any]]:
    """One row per proposal whose response is an old word, sorted by name."""
    rows = []
    for pid, p in proposals.items():
        old = (p.get("response") or {}).get("kind")
        if old not in MAPPING:
            continue
        rows.append({"id": pid, "nama": p.get("name") or pid, "sebelum": old,
                     "sesudah": MAPPING[old].value if MAPPING[old] else None})
    rows.sort(key=lambda r: (r["nama"], r["id"]))
    return rows


def migrate(apply: bool = False, out: Callable[[str], None] = print) -> dict[str, Any]:
    fs = db.client()
    mode = "MENJALANKAN" if apply else "RENCANA (dry-run: tidak ada yang ditulis)"
    out(f"migrate-responses: {mode}")

    proposals = {s.id: s.to_dict() or {} for s in fs.collection("proposals").stream()}
    rows = plan(proposals)
    unknown = sorted(pid for pid, p in proposals.items()
                     if (k := (p.get("response") or {}).get("kind"))
                     and k not in MAPPING and k not in {r.value for r in ResponseKind})
    out(f"Proposal: {len(rows)} diubah, {len(proposals) - len(rows)} tidak diubah.")
    for r in rows:
        after = RESPONSE_LABEL[ResponseKind(r["sesudah"])] if r["sesudah"] else "menunggu keputusan"
        out(f"  - {r['id']} {r['nama']}: {LEGACY_RESPONSE_LABEL[r['sebelum']]} → {after}")
        if not apply:
            continue
        p = proposals[r["id"]]
        new = MAPPING[r["sebelum"]]
        t = db.now()
        if new is None:
            upd = {"response": None, "responded": False, "updatedAt": t}
        else:
            upd = {"response.kind": new.value, "responded": True, "updatedAt": t}
        fs.document(f"proposals/{r['id']}").update(upd)
        write_history(via=Via.sistem, action="tanggapan", proposalId=r["id"],
                      proposalName=p.get("name"), before=r["sebelum"],
                      after=new.value if new else None, reason=REASON,
                      detail=detail(r["nama"], r["sebelum"], new))
    if unknown:
        out(f"Tidak dikenali, dibiarkan: {', '.join(unknown)}")

    pending = list(fs.collection("pendingConfirmations").stream())
    out(f"Konfirmasi WhatsApp tertunda: {len(pending)} akan dihapus."
        if pending else "Konfirmasi WhatsApp tertunda: tidak ada.")
    if apply:
        for s in pending:
            s.reference.delete()
    if not apply:
        out("Tidak ada yang ditulis. Jalankan dengan --apply untuk menjalankannya.")
    return {"apply": apply, "proposal": rows, "tidakDikenali": unknown,
            "konfirmasiDihapus": len(pending)}
