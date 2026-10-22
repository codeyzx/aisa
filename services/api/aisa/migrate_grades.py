"""`aisa migrate-grades`: move stored data from the old scale (5 old criteria, 4 categories)
to the A–E criteria and 5 grades.

Dry-run by default: it reads Firestore and prints what `--apply` would do, with no model call
and no write. `--apply` bumps `settings/rules`, re-assesses every assessed proposal on the new
rules through the same code as intake (`intake.assess_and_grade`), recomputes
`dailyStats.byCategory`, and deletes pending WhatsApp confirmations. Running it again finds
nothing to do: the rules already carry the new scale, every assessed proposal already carries
the new rules version, the stats already match, and no confirmation is pending."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from google.cloud import firestore

from . import db
from .digest import fmt_score
from .intake import assess_and_grade
from .jobs import JobLog, write_history
from .models import (
    CATEGORY_LABEL,
    DEFAULT_ANCHORS,
    DEFAULT_WEIGHTS,
    RULES_REASON_NEW_SCALE,
    Category,
    Criterion,
    JobKind,
    JobStatus,
    ProposalStatus,
    Rules,
    Thresholds,
    Via,
    to_doc,
)

OLD_LABEL = {
    "sangat_cocok": "Sangat cocok",
    "cocok": "Cocok",
    "kurang_cocok": "Kurang cocok",
    "tidak_cocok": "Tidak cocok",
}


def _label(value: str | None) -> str:
    if value in CATEGORY_LABEL:
        return CATEGORY_LABEL[Category(value)]
    if value in OLD_LABEL:
        return f"{OLD_LABEL[value]} (skala lama)"
    return value or "-"


def _on_new_scale(raw: dict) -> bool:
    """The rules already use the A–E criteria and the 5-grade thresholds."""
    weights = {str(k) for k in (raw.get("weights") or {})}
    return (weights == {c.value for c in Criterion}
            and "sangatLayak" in (raw.get("thresholds") or {}))


def new_rules(raw: dict, now) -> Rules:
    """The current rules moved to the new scale: new weights, anchors and thresholds, the next
    version; fit, models, minCharsPerPage and retentionDays carried over."""
    keep = {k: raw[k] for k in ("fit", "models", "minCharsPerPage", "retentionDays") if k in raw}
    return Rules.model_validate({
        **keep,
        "version": int(raw.get("version") or 0) + 1,
        "weights": dict(DEFAULT_WEIGHTS),
        "anchors": {c: to_doc(a) for c, a in DEFAULT_ANCHORS.items()},
        "thresholds": to_doc(Thresholds()),
        "changedAt": now,
        "reason": RULES_REASON_NEW_SCALE,
    })


def _wib_date(at) -> str | None:
    return db.wib_date(at) if at else None


def recomputed_by_category(proposals: dict[str, dict]) -> dict[str, dict[str, int]]:
    """{WIB date of assessedAt: {grade: count}} over the assessed proposals."""
    out: dict[str, dict[str, int]] = {}
    for p in proposals.values():
        if p.get("status") != ProposalStatus.dinilai.value or not p.get("category"):
            continue
        d = _wib_date(p.get("assessedAt"))
        if d:
            per = out.setdefault(d, {})
            per[p["category"]] = per.get(p["category"], 0) + 1
    return out


def _nonzero(m: dict | None) -> dict[str, int]:
    return {k: v for k, v in (m or {}).items() if v}


def _all(collection: str) -> dict[str, dict]:
    return {s.id: s.to_dict() or {} for s in db.client().collection(collection).stream()}


def _needs_regrade(p: dict, version: int) -> bool:
    return (p.get("status") == ProposalStatus.dinilai.value
            and (p.get("assessment") or {}).get("rulesVersion") != version)


def _regrade(pid: str, p: dict, rules: Rules) -> dict:
    """Re-assess one proposal on `rules` and write the result. Returns a report row."""
    fs = db.client()
    ref = fs.document(f"proposals/{pid}")
    name = p.get("name") or pid
    old = p.get("category")
    job = JobLog(JobKind.penilaian, "Penilai", f"Menilai ulang {name} (skala baru)",
                 model=rules.models.penilai, proposal_id=pid)
    try:
        text = fs.document(f"proposalTexts/{pid}").get()
        pages = (text.to_dict() or {}).get("pages") if text.exists else None
        if pages:
            graded, error = assess_and_grade(job, pages, rules, f"proposalTexts/{pid}")
        else:
            graded, error = None, "teks proposal tidak tersimpan"
        t = db.now()
        common = {"correction": None, "qualityOutsideFocus": firestore.DELETE_FIELD,
                  "jobId": job.id, "updatedAt": t,
                  "tokens.in": firestore.Increment(job.tokens_in),
                  "tokens.out": firestore.Increment(job.tokens_out)}
        if graded is None:
            reason = f"penilaian ulang gagal: {error}"[:300]
            ref.update({**common, "status": ProposalStatus.perlu_dicek_manual.value,
                        "statusReason": reason, "assessment": None, "category": None,
                        "effectiveCategory": None, "fit": None})
            write_history(via=Via.sistem, action="dinilai_ulang", proposalId=pid,
                          proposalName=name, before=old, after="perlu_dicek_manual",
                          reason=RULES_REASON_NEW_SCALE,
                          detail=f"{name} dinilai ulang dengan skala baru: perlu dicek manual "
                                 f"({reason})")
            job.finish(JobStatus.selesai)
            return {"id": pid, "nama": name, "sebelum": old, "sesudah": "perlu_dicek_manual",
                    "skor": None, "alasan": reason}
        cat = graded.category
        with job.code_step("Simpan hasil penilaian ulang", "firestore", wrote=f"proposals/{pid}"):
            ref.update({**common, "statusReason": None,
                        "profile": to_doc(graded.attempt.profile),
                        "assessment": to_doc(graded.assessment), "fit": to_doc(graded.fit),
                        "category": cat.value, "effectiveCategory": cat.value})
        write_history(via=Via.sistem, action="dinilai_ulang", proposalId=pid, proposalName=name,
                      before=old, after=cat.value, reason=RULES_REASON_NEW_SCALE,
                      detail=f"{name} dinilai ulang dengan skala baru: skor "
                             f"{fmt_score(graded.score)}, {CATEGORY_LABEL[cat]}"
                             + ("" if graded.fit.passed else ", di luar fokus"))
        job.finish(JobStatus.selesai)
        return {"id": pid, "nama": name, "sebelum": old, "sesudah": cat.value,
                "skor": graded.score, "diLuarFokus": not graded.fit.passed}
    except Exception:
        job.finish(JobStatus.gagal)
        raise


def migrate(apply: bool = False, out: Callable[[str], None] = print) -> dict[str, Any]:
    fs = db.client()
    rules_snap = fs.document("settings/rules").get()
    if not rules_snap.exists:
        raise db.RulesMissing("settings/rules tidak ada; jalankan `aisa seed-rules`")
    raw_rules = rules_snap.to_dict() or {}
    report: dict[str, Any] = {"apply": apply}
    mode = "MENJALANKAN" if apply else "RENCANA (dry-run: tidak ada panggilan model, tidak ada tulisan)"
    out(f"migrate-grades: {mode}")

    # 1. rules
    if _on_new_scale(raw_rules):
        rules = Rules.model_validate(raw_rules)
        out(f"Aturan: sudah skala baru (versi {rules.version}); tidak diubah.")
        report["aturan"] = {"diubah": False, "versi": rules.version}
    else:
        rules = new_rules(raw_rules, db.now())
        out(f"Aturan: versi {raw_rules.get('version')} → {rules.version}: 5 kriteria A–E "
            f"(bobot {', '.join(f'{c} {w}' for c, w in rules.weights.items())}), "
            f"batas grade {to_doc(rules.thresholds)}; fit, model, minCharsPerPage dan "
            "retentionDays tetap.")
        report["aturan"] = {"diubah": True, "dari": raw_rules.get("version"), "ke": rules.version}
        if apply:
            doc = to_doc(rules)
            fs.document("settings/rules").set(doc)
            fs.document(f"rulesVersions/{rules.version}").set(doc)
            write_history(via=Via.sistem, action="aturan_diubah", before=raw_rules.get("version"),
                          after=rules.version, reason=rules.reason,
                          detail=f"Aturan penilaian diubah ke versi {rules.version}: "
                                 f"{RULES_REASON_NEW_SCALE}")

    # 2. pending confirmations (they may name an old category)
    pending = list(fs.collection("pendingConfirmations").stream())
    out(f"Konfirmasi WhatsApp tertunda: {len(pending)} akan dihapus."
        if pending else "Konfirmasi WhatsApp tertunda: tidak ada.")
    if apply:
        for s in pending:
            s.reference.delete()
    report["konfirmasiDihapus"] = len(pending)

    # 3. proposals
    proposals = _all("proposals")
    todo = {pid: p for pid, p in proposals.items() if _needs_regrade(p, rules.version)}
    others = len(proposals) - len(todo)
    out(f"Proposal: {len(todo)} dinilai ulang, {others} tidak diubah "
        "(status lain, atau sudah dinilai dengan aturan ini).")
    rows = []
    for pid, p in sorted(todo.items(), key=lambda kv: kv[1].get("name") or kv[0]):
        corr = " (koreksi manajer dihapus)" if p.get("correction") else ""
        if not apply:
            out(f"  - {pid} {p.get('name')}: {_label(p.get('category'))}{corr} → akan dinilai ulang")
            rows.append({"id": pid, "nama": p.get("name"), "sebelum": p.get("category")})
            continue
        r = _regrade(pid, p, rules)
        rows.append(r)
        after = (f"{_label(r['sesudah'])}, skor {fmt_score(r['skor'])}"
                 + (", di luar fokus" if r.get("diLuarFokus") else "")
                 if r["skor"] is not None else f"perlu dicek manual ({r['alasan']})")
        out(f"  - {pid} {r['nama']}: {_label(r['sebelum'])}{corr} → {after}")
    report["proposal"] = rows

    # 4. dailyStats.byCategory, from the proposals as they now are
    stats = _all("dailyStats")
    current = _all("proposals") if apply else proposals
    fresh = recomputed_by_category(current)
    changed = []
    out(f"Statistik harian: {len(stats)} tanggal; byCategory dihitung ulang dari proposal yang "
        "dinilai menurut tanggal WIB assessedAt. Proposal yang sudah dihapus tidak bisa dinilai "
        "ulang, jadi tidak ikut dihitung lagi.")
    for date in sorted(stats):
        old = _nonzero(stats[date].get("byCategory"))
        if not apply:
            survivors = sum(fresh.get(date, {}).values())
            gone = max(sum(old.values()) - survivors, 0)
            out(f"  - {date}: sekarang {old or '{}'}; {survivors} proposal akan dihitung ulang"
                + (f", {gone} dari proposal yang sudah dihapus tidak dihitung lagi" if gone else ""))
            continue
        new = fresh.get(date, {})
        if new != old:
            fs.document(f"dailyStats/{date}").update({"byCategory": new})
            changed.append(date)
            out(f"  - {date}: {old or '{}'} → {new or '{}'}")
        else:
            out(f"  - {date}: tidak berubah")
    report["statistikHarian"] = {"tanggal": sorted(stats), "diubah": changed}
    if not apply:
        out("Tidak ada yang ditulis. Jalankan dengan --apply untuk menjalankannya.")
    return report

