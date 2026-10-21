"""Ringkasan 09.00 / 17.00. Code collects and counts; the Insight and Ringkasan agents only
word it, and any number they write that is not in the data sends us to the template."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from . import db, gowa, llm
from .config import settings
from .jobs import JobLog, write_history
from .models import (
    Category,
    Digest,
    DigestCounts,
    Fit,
    JobKind,
    JobStatus,
    Proposal,
    ProposalStatus,
    StepActor,
    Via,
    to_doc,
)
from .scoring import NOT_MENTIONED, format_idr

DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
COCOK_INLINE_MAX = 15
SANGAT_DETAIL_MAX = 10
QOF_MAX = 10
MANUAL_MAX = 15
# Below this weekly count a sector trend is noise, so no insight is written about it.
MIN_INSIGHT_COUNT = 3
INSIGHT_LABEL = "Yang menarik:"
ADVICE_WORDS = ("sarankan", "sebaiknya", "rekomendasi", "rekomendasikan", "hubungi", "segera undang")


# ---------- pure ----------


@dataclass
class Item:
    id: str
    name: str
    score: float
    sector: str | None = None
    fundingAskIdr: int | None = None
    oneLiner: str | None = None
    reasons: list[str] = field(default_factory=list)  # criterion reasons, highest value first
    fit_reasons: list[str] = field(default_factory=list)  # failed fit checks only


@dataclass
class DigestData:
    slot: str
    salutation: str
    window_start: datetime | None  # None: no digest has been sent before
    groups: dict[Category, list[Item]]
    quality_outside_focus: list[Item]
    manual: list[Item]
    baru_masuk: int
    insight: str | None = None
    manager_name: str = ""
    at: datetime | None = None  # send time; picks the greeting

    @property
    def belum(self) -> int:
        return sum(len(v) for v in self.groups.values()) + len(self.manual)

    def counts(self) -> DigestCounts:
        return DigestCounts(
            **{c.value: len(self.groups.get(c, [])) for c in Category},
            kualitasLuarFokus=len(self.quality_outside_focus),
            perluDicekManual=len(self.manual),
            belumDitanggapi=self.belum,
            baruMasuk=self.baru_masuk,
        )


def fmt_score(score: float) -> str:
    return f"{score:.1f}".rstrip("0").rstrip(".").replace(".", ",")


def opening(d: DigestData) -> str:
    sal = d.salutation
    addressee = f"{sal} {d.manager_name}" if d.manager_name else sal
    if d.window_start is None:
        head = f"Ini ringkasan pertama dari AISA. Sejauh ini masuk {d.baru_masuk} proposal."
    else:
        w = d.window_start.astimezone(db.WIB)
        head = (f"Sejak ringkasan {DAYS[w.weekday()]} pukul {w.strftime('%H.%M')} masuk "
                f"{d.baru_masuk} proposal baru.")
    return f"{greeting(d.at or db.now())}, {addressee}. {head} Ada {d.belum} proposal yang belum {sal} tanggapi."


def greeting(at: datetime) -> str:
    """By the WIB hour the message is sent, not by slot: a late retry must not say "pagi"."""
    h = at.astimezone(db.WIB).hour
    if h < 11:
        return "Selamat pagi"
    if h < 15:
        return "Selamat siang"
    if h < 18:
        return "Selamat sore"
    return "Selamat malam"


def _qof_line(it: Item) -> str:
    why = ", ".join(it.fit_reasons) or it.sector
    return f"{it.name} ({fmt_score(it.score)})" + (f" · {why}" if why else "")


def template(d: DigestData) -> str:
    lines = [opening(d), ""]
    sangat = d.groups.get(Category.sangat_cocok, [])
    lines.append(f"*Sangat cocok ({len(sangat)})*")
    for i, it in enumerate(sangat[:SANGAT_DETAIL_MAX], 1):
        meta = ", ".join(x for x in (it.sector, format_idr(it.fundingAskIdr) if it.fundingAskIdr else None) if x)
        why = it.reasons[0] if it.reasons else it.oneLiner
        lines.append(f"{i}. {it.name}{f' ({meta})' if meta else ''} · {fmt_score(it.score)}."
                     + (f" {why}" if why else ""))
    if len(sangat) > SANGAT_DETAIL_MAX:
        lines.append(f"…dan {len(sangat) - SANGAT_DETAIL_MAX} lainnya")
    cocok = d.groups.get(Category.cocok, [])
    inline = ", ".join(f"{it.name} ({fmt_score(it.score)})" for it in cocok[:COCOK_INLINE_MAX])
    more = f", dan {len(cocok) - COCOK_INLINE_MAX} lainnya" if len(cocok) > COCOK_INLINE_MAX else ""
    lines.append(f"*Cocok ({len(cocok)})*" + (f": {inline}{more}" if cocok else ""))
    lines.append(f"*Kurang cocok ({len(d.groups.get(Category.kurang_cocok, []))})*")
    lines.append(f"*Tidak cocok ({len(d.groups.get(Category.tidak_cocok, []))})*")
    if d.quality_outside_focus:
        q = "; ".join(_qof_line(it) for it in d.quality_outside_focus[:QOF_MAX])
        lines.append(f"*Berkualitas, di luar fokus ({len(d.quality_outside_focus)})*: {q}")
    if d.manual:
        m = ", ".join(it.name for it in d.manual[:MANUAL_MAX])
        more = f", dan {len(d.manual) - MANUAL_MAX} lainnya" if len(d.manual) > MANUAL_MAX else ""
        lines.append(f"*Perlu dicek manual ({len(d.manual)})*: {m}{more}")
    if d.insight:
        lines += ["", f"{INSIGHT_LABEL} {d.insight}"]
    return "\n".join(lines)


def label_ok(text: str, d: DigestData) -> bool:
    """A digest that has an insight must still introduce it with the label."""
    return not d.insight or INSIGHT_LABEL in text


def strip_label(insight: str) -> str:
    """The model sometimes repeats the label the template adds; drop it."""
    s = insight.strip()
    if s.lower().startswith(INSIGHT_LABEL.lower()):
        s = s[len(INSIGHT_LABEL):].strip()
    return s


_DIGITS = re.compile(r"\d+")


def digit_runs(text: str) -> set[str]:
    """Every maximal run of digits, leading zeros dropped ('09.00' → {'9', '0'})."""
    return {str(int(x)) for x in _DIGITS.findall(text)}


def numbers_ok(text: str, allowed_source: str, list_len: int = 0) -> bool:
    """True when every number in `text` also appears in `allowed_source` (the data rendered
    by code) or is a list index 1..list_len."""
    allowed = digit_runs(allowed_source) | {str(i) for i in range(1, list_len + 1)}
    return digit_runs(text) <= allowed


def names_present(text: str, d: DigestData) -> bool:
    must = [it.name for it in d.groups.get(Category.sangat_cocok, [])[:SANGAT_DETAIL_MAX]]
    must += [it.name for it in d.groups.get(Category.cocok, [])[:COCOK_INLINE_MAX]]
    must += [it.name for it in d.quality_outside_focus[:QOF_MAX]]
    must += [it.name for it in d.manual[:MANUAL_MAX]]
    return all(n in text for n in must)


def has_advice(text: str) -> bool:
    low = text.lower()
    return any(w in low for w in ADVICE_WORDS)


def sector_candidates(rows: list[tuple[datetime, str | None]], now: datetime) -> list[dict]:
    """Sector counts this week (last 7 days) vs the 7 days before, biggest change first. A
    sector below MIN_INSIGHT_COUNT in both weeks is dropped, and a percentage is only given
    when last week reached it too: "naik 100% (1 → 2)" reads as a trend but is not one."""
    this_start, last_start = now - timedelta(days=7), now - timedelta(days=14)
    this: dict[str, int] = {}
    last: dict[str, int] = {}
    for at, sector in rows:
        if not sector:
            continue
        if this_start <= at < now:
            this[sector] = this.get(sector, 0) + 1
        elif last_start <= at < this_start:
            last[sector] = last.get(sector, 0) + 1
    out = []
    for s in set(this) | set(last):
        a, b = this.get(s, 0), last.get(s, 0)
        if max(a, b) < MIN_INSIGHT_COUNT:
            continue
        c = {"sektor": s, "mingguIni": a, "mingguLalu": b}
        if b >= MIN_INSIGHT_COUNT:
            c["perubahanPersen"] = round((a - b) / b * 100)
        out.append(c)
    out.sort(key=lambda c: (abs(c.get("perubahanPersen", 0)), c["mingguIni"]), reverse=True)
    return out[:3]


@dataclass
class Seen:
    """One proposal as the insight candidates read it, responded or not."""
    at: datetime | None
    sector: str | None
    category: str | None  # effective category
    score: float | None
    responded: bool


GOOD = (Category.sangat_cocok.value, Category.cocok.value)


def is_new(s: Seen, window_start: datetime | None) -> bool:
    """Came in since the last ringkasan; before the first one, every proposal is new."""
    return window_start is None or (s.at is not None and s.at >= window_start)


def _category_phrase(sangat: int, cocok: int) -> str:
    if sangat and cocok:
        return "Sangat cocok atau Cocok"
    return "Sangat cocok" if sangat else "Cocok"


def fallback_candidates(seen: list[Seen], d: DigestData, now: datetime) -> list[dict]:
    """The first fact that holds, in a fixed order, when no sector trend is strong enough.
    Every number here is counted by code; at most one candidate comes back, and none only
    when there are no proposals at all."""
    new = [s for s in seen if is_new(s, d.window_start)]
    good = [s for s in new if s.category in GOOD]
    if good:
        c = {"jenis": "proposalBaruCocok", "proposalBaru": len(new),
             "sangatCocok": sum(s.category == Category.sangat_cocok.value for s in good),
             "cocok": sum(s.category == Category.cocok.value for s in good)}
        per: dict[str, int] = {}
        for s in good:
            if s.sector:
                per[s.sector] = per.get(s.sector, 0) + 1
        ranked = sorted(per.items(), key=lambda kv: kv[1], reverse=True)
        # A tie has no "terbanyak"; naming one of the tied sectors would be a guess.
        if ranked and (len(ranked) == 1 or ranked[0][1] > ranked[1][1]):
            c["sektorTerbanyak"], c["jumlahSektorTerbanyak"] = ranked[0]
        return [c]

    this_start, last_start = now - timedelta(days=7), now - timedelta(days=14)
    this = [s.score for s in seen if s.score is not None and s.at and this_start <= s.at < now]
    last = [s.score for s in seen if s.score is not None and s.at and last_start <= s.at < this_start]
    if len(this) >= MIN_INSIGHT_COUNT and len(last) >= MIN_INSIGHT_COUNT:
        return [{"jenis": "rataRataSkor", "mingguIni": fmt_score(sum(this) / len(this)),
                 "jumlahMingguIni": len(this), "mingguLalu": fmt_score(sum(last) / len(last)),
                 "jumlahMingguLalu": len(last)}]

    if d.quality_outside_focus or d.manual:
        return [{"jenis": "perluPerhatian", "berkualitasDiLuarFokus": len(d.quality_outside_focus),
                 "perluDicekManual": len(d.manual)}]

    top = max((it for v in d.groups.values() for it in v), key=lambda it: it.score, default=None)
    if top:
        return [{"jenis": "skorTertinggi", "nama": top.name, "skor": fmt_score(top.score)}]

    if seen:
        return [{"jenis": "sudahDitanggapi", "sudahDitanggapi": sum(s.responded for s in seen),
                 "total": len(seen)}]
    return []


def insight_candidates(seen: list[Seen], d: DigestData, now: datetime) -> list[dict]:
    """Sector week-over-week first; the fallbacks only when it has nothing to say."""
    rows = [(s.at, s.sector) for s in seen if s.at is not None]
    return sector_candidates(rows, now) or fallback_candidates(seen, d, now)


def _fallback_text(c: dict) -> str | None:
    kind = c.get("jenis")
    if kind == "proposalBaruCocok":
        n = c["sangatCocok"] + c["cocok"]
        text = f"{n} dari {c['proposalBaru']} proposal baru masuk {_category_phrase(c['sangatCocok'], c['cocok'])}"
        if "sektorTerbanyak" in c:
            text += (f", terbanyak dari sektor {c['sektorTerbanyak']}" if n > 1
                     else f", dari sektor {c['sektorTerbanyak']}")
        return text + "."
    if kind == "rataRataSkor":
        a, b = c["mingguIni"], c["mingguLalu"]
        va, vb = float(a.replace(",", ".")), float(b.replace(",", "."))
        arah = "naik dari" if va > vb else "turun dari" if va < vb else "sama dengan"
        return (f"rata-rata skor kualitas proposal minggu ini {a} ({c['jumlahMingguIni']} proposal), "
                f"{arah} {b} minggu lalu ({c['jumlahMingguLalu']} proposal).")
    if kind == "perluPerhatian":
        parts = []
        if c["berkualitasDiLuarFokus"]:
            parts.append(f"{c['berkualitasDiLuarFokus']} proposal Berkualitas, di luar fokus")
        if c["perluDicekManual"]:
            parts.append(f"{c['perluDicekManual']} proposal Perlu dicek manual")
        return f"ada {' dan '.join(parts)} yang belum ditanggapi."
    if kind == "skorTertinggi":
        return f"skor tertinggi yang belum ditanggapi: {c['nama']} ({c['skor']})."
    if kind == "sudahDitanggapi":
        return f"{c['sudahDitanggapi']} dari {c['total']} proposal sudah ditanggapi."
    return None


def template_insight(cands: list[dict]) -> str | None:
    if cands and "jenis" in cands[0]:
        return _fallback_text(cands[0])
    for c in cands:
        if "perubahanPersen" in c and c["perubahanPersen"] != 0:
            arah = "naik" if c["perubahanPersen"] > 0 else "turun"
            return (f"proposal {c['sektor']} {arah} {abs(c['perubahanPersen'])}% dibanding minggu "
                    f"lalu ({c['mingguLalu']} → {c['mingguIni']}).")
    if cands and cands[0]["mingguIni"]:
        c = cands[0]
        lalu = f"minggu lalu {c['mingguLalu']}" if c["mingguLalu"] else "minggu lalu belum ada"
        return f"minggu ini ada {c['mingguIni']} proposal {c['sektor']}, {lalu}."
    return None


# ---------- I/O ----------

INSIGHT_SYSTEM = (
    "Anda menulis insight untuk manajer investasi dari angka yang SUDAH dihitung kode. "
    "Tulis 1–2 kalimat bahasa Indonesia, tanpa salam, tanpa saran tindak lanjut. Pakai HANYA "
    "angka yang ada di data; jangan menghitung angka baru. Awali dengan huruf kecil karena "
    "kalimat akan disambung setelah 'Yang menarik: '. Tulis wajar seperti "
    "'proposal agritech naik 50% dibanding minggu lalu'; hindari frasa kaku seperti "
    "'mencatatkan angka'. Bila kandidat punya field 'jenis', tulis tentang kandidat itu saja; "
    "angka desimal ditulis persis seperti di data (pakai koma, mis. 72,4) dan nama kategori "
    "ditulis seperti di data (Sangat cocok, Cocok, Berkualitas, di luar fokus, Perlu dicek manual)."
)

RINGKASAN_SYSTEM = (
    "Anda menyusun pesan WhatsApp ringkasan proposal untuk manajer investasi. Anda menerima "
    "draf yang sudah benar. Rapikan bahasanya agar enak dibaca, tetapi: pertahankan struktur "
    "per kategori dan format *tebal* WhatsApp, pertahankan SEMUA nama proposal dan SEMUA angka "
    "persis seperti di draf, jangan menambah angka baru, jangan menambah saran tindak lanjut "
    "(jangan menyarankan mengundang, menghubungi, atau mengarsipkan). Untuk setiap proposal "
    "Sangat cocok, boleh ganti kalimat penjelasnya dengan satu kalimat singkat dari 'alasan' "
    "yang diberikan. Bila draf berisi baris 'Yang menarik:', pertahankan label itu persis di "
    "awal barisnya. Balas hanya dengan teks pesan."
)


FIT_LABEL = {"sector": "sektor", "stage": "tahap", "funding": "dana"}


def fit_reasons(fit: Fit | None) -> list[str]:
    """Reasons of the failed fit checks; "tidak disebut" gets the check's name in front."""
    if not fit:
        return []
    out = []
    for key, label in FIT_LABEL.items():
        item = getattr(fit.checks, key)
        if not item.passed:
            out.append(f"{label} {item.reason}" if item.reason == NOT_MENTIONED else item.reason)
    return out


def _item(pid: str, p: Proposal) -> Item:
    reasons = []
    if p.assessment:
        top = sorted(p.assessment.criteria.items(), key=lambda kv: kv[1].value, reverse=True)[:2]
        reasons = [r.reason for _, r in top]
    return Item(id=pid, name=p.name, score=p.assessment.score if p.assessment else 0.0,
                sector=p.profile.sector, fundingAskIdr=p.profile.fundingAskIdr,
                oneLiner=p.profile.oneLiner, reasons=reasons, fit_reasons=fit_reasons(p.fit))


def collect(slot: str, now: datetime) -> tuple[DigestData, list[dict], list[str]]:
    fs = db.client()
    last = list(fs.collection("digests").order_by("sentAt", direction="DESCENDING").limit(1).stream())
    window_start = last[0].get("sentAt") if last else None

    groups: dict[Category, list[Item]] = {c: [] for c in Category}
    qof: list[Item] = []
    manual: list[Item] = []
    ids: list[str] = []
    seen: list[Seen] = []
    # One read of every proposal: the counts, "baru masuk" and the insight all come from it,
    # so no number in the message can disagree with another.
    for s in fs.collection("proposals").stream():
        raw = s.to_dict()
        seen.append(Seen(at=raw.get("createdAt"), sector=(raw.get("profile") or {}).get("sector"),
                         category=raw.get("effectiveCategory"),
                         score=(raw.get("assessment") or {}).get("score")
                         if raw.get("status") == ProposalStatus.dinilai.value else None,
                         responded=bool(raw.get("responded"))))
        if raw.get("responded"):
            continue
        p = Proposal.model_validate(raw)
        if p.status == ProposalStatus.dinilai and p.effectiveCategory:
            it = _item(s.id, p)
            groups[Category(p.effectiveCategory)].append(it)
            if p.qualityOutsideFocus and p.effectiveCategory == Category.tidak_cocok:
                qof.append(it)
            ids.append(s.id)
        elif p.status == ProposalStatus.perlu_dicek_manual:
            manual.append(Item(id=s.id, name=p.name, score=0.0))
            ids.append(s.id)
    for v in groups.values():
        v.sort(key=lambda it: it.score, reverse=True)
    qof.sort(key=lambda it: it.score, reverse=True)

    baru = sum(is_new(x, window_start) for x in seen)
    data = DigestData(slot=slot, salutation=settings().manager_salutation, window_start=window_start,
                      groups=groups, quality_outside_focus=qof, manual=manual, baru_masuk=baru,
                      manager_name=settings().manager_name, at=now)
    return data, insight_candidates(seen, data, now), ids


def run_digest(slot: str, send: bool = True) -> dict:
    """Build, check, and (if `send`) deliver and record the digest. With send=False nothing
    is written and no message leaves; the text is returned for inspection."""
    if slot not in ("09.00", "17.00"):
        raise ValueError("slot harus 09.00 atau 17.00")
    now = db.now()
    digest_id = f"{db.wib_date(now)}-{slot.replace('.', '')}"
    ref = db.client().document(f"digests/{digest_id}")
    already_sent = ref.get().exists
    if send and already_sent:
        return {"digestId": digest_id, "skipped": "sudah terkirim"}
    rules = db.load_rules()

    if not send:
        data, cands, ids = collect(slot, now)
        data.insight = template_insight(cands)
        preview = {"digestId": digest_id, "text": template(data), "usedTemplate": True,
                   "insight": data.insight,
                   "counts": to_doc(data.counts()), "insightCandidates": cands,
                   "wouldSkip": already_sent}
        if already_sent:
            preview["note"] = "slot ini sudah terkirim; pengiriman sungguhan akan dilewati"
        return preview

    job = JobLog(JobKind.ringkasan, "Pembuat ringkasan", f"Ringkasan {slot}",
                 model=rules.models.ringkasan, digest_id=digest_id)
    try:
        with job.code_step("Ambil proposal belum ditanggapi dan hitung per kategori", "firestore",
                           read="proposals"):
            data, cands, ids = collect(slot, now)
        paused = db.is_paused()

        insight = template_insight(cands)
        if cands and not paused:
            cand_json = json.dumps(cands, ensure_ascii=False)
            try:
                r = llm.generate(rules.models.insight, INSIGHT_SYSTEM, f"Data:\n{cand_json}", temperature=0.3)
                ok = bool(r.text.strip()) and numbers_ok(r.text, cand_json) and not has_advice(r.text)
                job.step("Menulis insight", "gemini.generate_content", StepActor.model,
                         model=rules.models.insight, read="kandidat insight", tokens_in=r.tokens_in,
                         tokens_out=r.tokens_out, duration_ms=r.duration_ms,
                         status="ok" if ok else "gagal",
                         error=None if ok else "angka tidak cocok dengan data; pakai insight kode")
                if ok:
                    insight = strip_label(r.text) or insight
            except Exception as e:
                job.step("Menulis insight", "gemini.generate_content", StepActor.model,
                         model=rules.models.insight, status="gagal", error=str(e)[:300])
        data.insight = insight
        draft = template(data)

        text, used_template = draft, True
        if not paused:
            payload = {"draf": draft, "alasanSangatCocok": {
                it.name: it.reasons for it in data.groups[Category.sangat_cocok][:SANGAT_DETAIL_MAX]}}
            try:
                r = llm.generate(rules.models.ringkasan, RINGKASAN_SYSTEM,
                                 json.dumps(payload, ensure_ascii=False), temperature=0.3)
                job.step("Menyusun teks ringkasan", "gemini.generate_content", StepActor.model,
                         model=rules.models.ringkasan, read="data ringkasan", tokens_in=r.tokens_in,
                         tokens_out=r.tokens_out, duration_ms=r.duration_ms)
                candidate = r.text.strip()
                with job.code_step("Cek angka di ringkasan", "kode"):
                    good = (bool(candidate) and numbers_ok(candidate, draft, SANGAT_DETAIL_MAX)
                            and names_present(candidate, data) and label_ok(candidate, data)
                            and not has_advice(candidate))
                if good:
                    text, used_template = candidate, False
            except Exception as e:
                job.step("Menyusun teks ringkasan", "gemini.generate_content", StepActor.model,
                         model=rules.models.ringkasan, status="gagal", error=str(e)[:300])

        message_ids: list[str] = []
        with job.code_step("Kirim WhatsApp", "gowa.send_message", wrote="WhatsApp manajer"):
            if not settings().manager_phones:
                raise RuntimeError("MANAGER_PHONES belum diatur")
            for phone in settings().manager_phones:
                message_ids += gowa.send(phone, text)
        d = Digest(slot=slot, windowStart=data.window_start, sentAt=db.now(), text=text,
                   counts=data.counts(), proposalIds=ids, usedTemplate=used_template,
                   insight=data.insight, jobId=job.id,
                   gowaMessageIds=message_ids)
        ref.set(to_doc(d))
        write_history(via=Via.sistem, action="ringkasan_terkirim",
                      detail=f"Ringkasan {slot} terkirim ({data.belum} belum ditanggapi"
                             f"{', template' if used_template else ''})")
        job.finish(JobStatus.selesai)
        return {"digestId": digest_id, "usedTemplate": used_template, "text": text,
                "gowaMessageIds": message_ids}
    except Exception:
        job.finish(JobStatus.gagal)
        raise
