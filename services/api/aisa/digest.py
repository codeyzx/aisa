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
    CATEGORY_LABEL,
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
from .scoring import format_idr

DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
INLINE_MAX = 15  # per grade listed inline (layak bersyarat, perlu penyesuaian)
SANGAT_DETAIL_MAX = 10
MANUAL_MAX = 15
# Grades whose proposals are named in the message; the two lowest are counted only.
DETAILED = Category.sangat_layak
INLINE = (Category.layak_bersyarat, Category.perlu_penyesuaian)
OUT_OF_FOCUS = "(di luar fokus)"
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
    out_of_focus: bool = False  # fit.passed is False: shown, never a different grade


def rank_key(it: Item) -> tuple:
    """Within one grade: in-focus before out-of-focus, then the higher score."""
    return (it.out_of_focus, -it.score)


@dataclass
class DigestData:
    slot: str
    salutation: str
    window_start: datetime | None  # None: no digest has been sent before
    groups: dict[Category, list[Item]]
    manual: list[Item]
    baru_masuk: int
    insight: str | None = None
    manager_name: str = ""
    at: datetime | None = None  # send time; picks the greeting

    @property
    def belum(self) -> int:
        return sum(len(v) for v in self.groups.values()) + len(self.manual)

    @property
    def luar_fokus(self) -> int:
        return sum(it.out_of_focus for v in self.groups.values() for it in v)

    def counts(self) -> DigestCounts:
        return DigestCounts(
            **{c.value: len(self.groups.get(c, [])) for c in Category},
            luarFokus=self.luar_fokus,
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


def _mark(it: Item) -> str:
    return f" {OUT_OF_FOCUS}" if it.out_of_focus else ""


def _inline(items: list[Item]) -> str:
    shown = ", ".join(f"{it.name} ({fmt_score(it.score)}){_mark(it)}" for it in items[:INLINE_MAX])
    more = f", dan {len(items) - INLINE_MAX} lainnya" if len(items) > INLINE_MAX else ""
    return shown + more


def template(d: DigestData) -> str:
    """One heading per grade, best first. Sangat layak is listed with a reason, the next two
    grades inline, the two lowest by count only. An out-of-focus proposal keeps its grade and
    is marked "(di luar fokus)" wherever it is named."""
    lines = [opening(d), ""]
    sangat = d.groups.get(DETAILED, [])
    lines.append(f"*{CATEGORY_LABEL[DETAILED]} ({len(sangat)})*")
    for i, it in enumerate(sangat[:SANGAT_DETAIL_MAX], 1):
        meta = ", ".join(x for x in (it.sector, format_idr(it.fundingAskIdr) if it.fundingAskIdr else None) if x)
        why = it.reasons[0] if it.reasons else it.oneLiner
        lines.append(f"{i}. {it.name}{f' ({meta})' if meta else ''} · {fmt_score(it.score)}"
                     f"{_mark(it)}." + (f" {why}" if why else ""))
    if len(sangat) > SANGAT_DETAIL_MAX:
        lines.append(f"…dan {len(sangat) - SANGAT_DETAIL_MAX} lainnya")
    for c in INLINE:
        items = d.groups.get(c, [])
        lines.append(f"*{CATEGORY_LABEL[c]} ({len(items)})*" + (f": {_inline(items)}" if items else ""))
    for c in (Category.risiko_tinggi, Category.tidak_layak):
        lines.append(f"*{CATEGORY_LABEL[c]} ({len(d.groups.get(c, []))})*")
    if d.luar_fokus:
        lines.append(f"{d.luar_fokus} di antaranya di luar fokus (sektor, tahap, atau dana): "
                     "prioritas rendah.")
    if d.manual:
        m = ", ".join(it.name for it in d.manual[:MANUAL_MAX])
        more = f", dan {len(d.manual) - MANUAL_MAX} lainnya" if len(d.manual) > MANUAL_MAX else ""
        lines.append(f"*Perlu dicek manual ({len(d.manual)})*: {m}{more}")
    if d.insight:
        lines += ["", f"{INSIGHT_LABEL} {d.insight}"]
    return "\n".join(lines)


def _named(d: DigestData) -> list[Item]:
    """Every assessed proposal the template names."""
    out = list(d.groups.get(DETAILED, [])[:SANGAT_DETAIL_MAX])
    for c in INLINE:
        out += d.groups.get(c, [])[:INLINE_MAX]
    return out


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
    must = [it.name for it in _named(d)] + [it.name for it in d.manual[:MANUAL_MAX]]
    return all(n in text for n in must)


def focus_marks_ok(text: str, d: DigestData) -> bool:
    """A rewrite must keep every "(di luar fokus)" mark the draft has: dropping one would
    present a low-priority proposal as in focus."""
    return text.count(OUT_OF_FOCUS) >= sum(it.out_of_focus for it in _named(d))


def grade_headings_ok(text: str) -> bool:
    """Every grade keeps its heading, so no grade silently disappears from the message."""
    return all(f"{label} (" in text for label in CATEGORY_LABEL.values())


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
    category: str | None  # effective category (grade)
    score: float | None
    responded: bool
    out_of_focus: bool = False


# The grades an investor would move on: "lanjutkan investasi" and "investasi dengan syarat".
GOOD = (Category.sangat_layak.value, Category.layak_bersyarat.value)


def is_new(s: Seen, window_start: datetime | None) -> bool:
    """Came in since the last ringkasan; before the first one, every proposal is new."""
    return window_start is None or (s.at is not None and s.at >= window_start)


def _category_phrase(sangat: int, bersyarat: int) -> str:
    sl, lb = CATEGORY_LABEL[Category.sangat_layak], CATEGORY_LABEL[Category.layak_bersyarat]
    if sangat and bersyarat:
        return f"{sl} atau {lb}"
    return sl if sangat else lb


def fallback_candidates(seen: list[Seen], d: DigestData, now: datetime) -> list[dict]:
    """The first fact that holds, in a fixed order, when no sector trend is strong enough.
    Every number here is counted by code; at most one candidate comes back, and none only
    when there are no proposals at all."""
    new = [s for s in seen if is_new(s, d.window_start)]
    good = [s for s in new if s.category in GOOD]
    if good:
        c = {"jenis": "proposalBaruLayak", "proposalBaru": len(new),
             "sangatLayak": sum(s.category == Category.sangat_layak.value for s in good),
             "layakBersyarat": sum(s.category == Category.layak_bersyarat.value for s in good)}
        luar = sum(s.out_of_focus for s in good)
        if luar:
            c["diLuarFokus"] = luar
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

    if d.luar_fokus or d.manual:
        return [{"jenis": "perluPerhatian", "diLuarFokus": d.luar_fokus,
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
    if kind == "proposalBaruLayak":
        n = c["sangatLayak"] + c["layakBersyarat"]
        text = (f"{n} dari {c['proposalBaru']} proposal baru masuk "
                f"{_category_phrase(c['sangatLayak'], c['layakBersyarat'])}")
        if "sektorTerbanyak" in c:
            text += (f", terbanyak dari sektor {c['sektorTerbanyak']}" if n > 1
                     else f", dari sektor {c['sektorTerbanyak']}")
        if c.get("diLuarFokus"):
            text += (f"; {c['diLuarFokus']} di antaranya di luar fokus" if n > 1
                     else "; proposal itu di luar fokus")
        return text + "."
    if kind == "rataRataSkor":
        a, b = c["mingguIni"], c["mingguLalu"]
        va, vb = float(a.replace(",", ".")), float(b.replace(",", "."))
        arah = "naik dari" if va > vb else "turun dari" if va < vb else "sama dengan"
        return (f"rata-rata skor kualitas proposal minggu ini {a} ({c['jumlahMingguIni']} proposal), "
                f"{arah} {b} minggu lalu ({c['jumlahMingguLalu']} proposal).")
    if kind == "perluPerhatian":
        parts = []
        if c["diLuarFokus"]:
            parts.append(f"{c['diLuarFokus']} proposal di luar fokus")
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
    "angka desimal ditulis persis seperti di data (pakai koma, mis. 72,4) dan nama grade "
    "ditulis seperti di data (Sangat layak, Layak bersyarat, Perlu penyesuaian, Risiko tinggi, "
    "Tidak layak, Perlu dicek manual). 'di luar fokus' berarti tidak sesuai fokus investasi "
    "(sektor, tahap, atau dana), bukan grade."
)

RINGKASAN_SYSTEM = (
    "Anda menyusun pesan WhatsApp ringkasan proposal untuk manajer investasi. Anda menerima "
    "draf yang sudah benar. Rapikan bahasanya agar enak dibaca, tetapi: pertahankan struktur "
    "per grade (Sangat layak, Layak bersyarat, Perlu penyesuaian, Risiko tinggi, Tidak layak) "
    "beserta judul *tebal* dan jumlahnya, urutan proposal di setiap grade, SEMUA nama proposal, "
    "SEMUA angka persis seperti di draf, dan setiap tanda '(di luar fokus)' tetap di samping "
    "nama yang sama. Jangan menambah angka baru dan jangan menambah saran tindak lanjut "
    "(jangan menyarankan mengundang, menghubungi, atau mengarsipkan). Untuk setiap proposal "
    "Sangat layak, boleh ganti kalimat penjelasnya dengan satu kalimat singkat dari 'alasan' "
    "yang diberikan. Bila draf berisi baris 'Yang menarik:', pertahankan label itu persis di "
    "awal barisnya. Balas hanya dengan teks pesan."
)


def _item(pid: str, p: Proposal) -> Item:
    reasons = []
    if p.assessment:
        top = sorted(p.assessment.criteria.items(), key=lambda kv: kv[1].value, reverse=True)[:2]
        reasons = [r.reason for _, r in top]
    return Item(id=pid, name=p.name, score=p.assessment.score if p.assessment else 0.0,
                sector=p.profile.sector, fundingAskIdr=p.profile.fundingAskIdr,
                oneLiner=p.profile.oneLiner, reasons=reasons,
                out_of_focus=out_of_focus(p.fit))


def out_of_focus(fit: Fit | dict | None) -> bool:
    """"Di luar fokus" is `fit.passed == False`; a proposal with no fit is not marked."""
    if fit is None:
        return False
    passed = fit.get("passed") if isinstance(fit, dict) else fit.passed
    return passed is False


def collect(slot: str, now: datetime) -> tuple[DigestData, list[dict], list[str]]:
    fs = db.client()
    last = list(fs.collection("digests").order_by("sentAt", direction="DESCENDING").limit(1).stream())
    window_start = last[0].get("sentAt") if last else None

    groups: dict[Category, list[Item]] = {c: [] for c in Category}
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
                         responded=bool(raw.get("responded")),
                         out_of_focus=raw.get("status") == ProposalStatus.dinilai.value
                         and out_of_focus(raw.get("fit"))))
        if raw.get("responded"):
            continue
        p = Proposal.model_validate(raw)
        if p.status == ProposalStatus.dinilai and p.effectiveCategory:
            it = _item(s.id, p)
            groups[Category(p.effectiveCategory)].append(it)
            ids.append(s.id)
        elif p.status == ProposalStatus.perlu_dicek_manual:
            manual.append(Item(id=s.id, name=p.name, score=0.0))
            ids.append(s.id)
    for v in groups.values():
        v.sort(key=rank_key)

    baru = sum(is_new(x, window_start) for x in seen)
    data = DigestData(slot=slot, salutation=settings().manager_salutation, window_start=window_start,
                      groups=groups, manual=manual, baru_masuk=baru,
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
        with job.code_step("Ambil proposal belum ditanggapi dan hitung per grade", "firestore",
                           read="proposals"):
            data, cands, ids = collect(slot, now)
        paused = db.is_paused()

        insight = template_insight(cands)
        if cands and not paused:
            cand_json = json.dumps(cands, ensure_ascii=False)
            job.begin("Menulis insight", "gemini.generate_content", StepActor.model)
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
            payload = {"draf": draft, "alasanSangatLayak": {
                it.name: it.reasons for it in data.groups[DETAILED][:SANGAT_DETAIL_MAX]}}
            job.begin("Menyusun teks ringkasan", "gemini.generate_content", StepActor.model)
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
                            and focus_marks_ok(candidate, data) and grade_headings_ok(candidate)
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
