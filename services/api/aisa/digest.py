"""Ringkasan: the 09.00 daily digest and the 17.00 weekly summary. Code collects and counts;
the Insight and Ringkasan agents only word it, and any number they write that is not in the
data sends us to the template."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter

from . import db, gowa, llm
from .config import settings
from .jobs import JobLog, write_history
from .models import (
    CATEGORY_LABEL,
    CATEGORY_RANK,
    Category,
    Digest,
    DigestCounts,
    Fit,
    JobKind,
    JobStatus,
    Proposal,
    ProposalStatus,
    ResponseKind,
    SectorShare,
    StepActor,
    Via,
    WeeklyStats,
    WeekRange,
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
ADVICE_WORDS = ("sarankan", "sebaiknya", "rekomendasi", "rekomendasikan", "hubungi", "segera undang",
                "segera setujui", "segera tolak")
DAILY_SLOT, WEEKLY_SLOT = "09.00", "17.00"
# With no earlier 09.00 digest, the daily window is the last 24 hours.
FIRST_WINDOW = timedelta(hours=24)


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
    category: str | None = None  # effective grade; set where a list mixes grades


def rank_key(it: Item) -> tuple:
    """Within one grade: in-focus before out-of-focus, then the higher score."""
    return (it.out_of_focus, -it.score)


@dataclass
class DigestData:
    slot: str
    salutation: str
    # Start of the window "baru masuk" counts from: the previous 09.00 digest, or 24 hours
    # back when `first`. None only in hand-built data: every proposal is then new.
    window_start: datetime | None
    groups: dict[Category, list[Item]]
    manual: list[Item]
    baru_masuk: int
    insight: str | None = None
    manager_name: str = ""
    at: datetime | None = None  # send time; picks the greeting
    first: bool = False  # no 09.00 digest was sent before this one

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
    elif d.first:
        head = (f"Ini ringkasan pagi pertama dari AISA. Dalam 24 jam terakhir masuk "
                f"{d.baru_masuk} proposal baru.")
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


# ---------- weekly (pure) ----------

MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus",
          "September", "Oktober", "November", "Desember"]
TOP_SECTORS = 3
TOP_PROPOSALS = 3
WEEKLY_HEADINGS = ("*Proposal masuk*", "*Sektor*", "*Grade*", "*Rata-rata skor*",
                   "*Keputusan minggu ini*", "*Top 3 minggu ini*", "*Perlu dicek manual*")


def sector_label(sector: str) -> str:
    """The dashboard's `sectorLabel`: upper-case the first letter and each letter after '&'
    or '/' ("f&b" → "F&B", "agritech" → "Agritech")."""
    return re.sub(r"(^|[&/]\s*)(\w)",
                  lambda m: m[1] + (m[2].upper() if m[2].islower() else m[2]), sector)


def percent(n: int, total: int) -> int:
    """n of total as a whole percent, half rounded up (1 of 8 → 13)."""
    return (n * 200 + total) // (2 * total)


def week_start(now: datetime) -> datetime:
    """Monday 00:00 WIB of the week `now` falls in."""
    w = now.astimezone(db.WIB)
    return (w - timedelta(days=w.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)


def week_range(now: datetime) -> WeekRange:
    return WeekRange(start=db.wib_date(week_start(now)), end=db.wib_date(now))


def fmt_range(start: datetime, end: datetime) -> str:
    """'19–23 Oktober 2026', '26 Oktober – 1 November 2026', '19 Oktober 2026'."""
    a, b = start.astimezone(db.WIB), end.astimezone(db.WIB)
    tail = f"{b.day} {MONTHS[b.month - 1]} {b.year}"
    if a.date() == b.date():
        return tail
    if (a.year, a.month) == (b.year, b.month):
        return f"{a.day}–{tail}"
    if a.year == b.year:
        return f"{a.day} {MONTHS[a.month - 1]} – {tail}"
    return f"{a.day} {MONTHS[a.month - 1]} {a.year} – {tail}"


@dataclass
class Row:
    """One stored proposal as the weekly summary reads it."""
    id: str
    name: str
    at: datetime | None  # createdAt
    status: str | None
    sector: str | None = None
    category: str | None = None  # effective grade, only for an assessed proposal
    score: float | None = None  # only for an assessed proposal
    out_of_focus: bool = False
    responded: bool = False
    response_kind: str | None = None
    response_at: datetime | None = None

    @property
    def assessed(self) -> bool:
        return self.status == ProposalStatus.dinilai.value and self.category in CATEGORY_RANK

    @property
    def waiting(self) -> bool:
        """Awaiting the manager's decision, as the daily digest counts "belum ditanggapi"."""
        return not self.responded and (
            self.assessed or self.status == ProposalStatus.perlu_dicek_manual.value)


def row_of(pid: str, raw: dict) -> Row:
    """Read straight from the stored dict, so a field of an older shape cannot fail the
    whole summary."""
    dinilai = raw.get("status") == ProposalStatus.dinilai.value
    response = raw.get("response") or {}
    return Row(id=pid, name=raw.get("name") or pid, at=raw.get("createdAt"),
               status=raw.get("status"), sector=(raw.get("profile") or {}).get("sector"),
               category=raw.get("effectiveCategory") if dinilai else None,
               score=(raw.get("assessment") or {}).get("score") if dinilai else None,
               out_of_focus=dinilai and out_of_focus(raw.get("fit")),
               responded=bool(raw.get("responded")), response_kind=response.get("kind"),
               response_at=response.get("at"))


def _avg(rows: list[Row]) -> float | None:
    scores = [r.score for r in rows if r.score is not None]
    return round(sum(scores) / len(scores), 1) if scores else None


def weekly_stats(rows: list[Row], now: datetime) -> tuple[WeeklyStats, list[Row]]:
    """Every number of the weekly summary, plus its top proposals (grade, in-focus first,
    then score). This week: Monday 00:00 WIB → `now`; last week: the seven days before."""
    start = week_start(now)
    last_start = start - timedelta(days=7)
    this = [r for r in rows if r.at is not None and start <= r.at <= now]
    last = [r for r in rows if r.at is not None and last_start <= r.at < start]

    per: dict[str, int] = {}
    no_sector = 0
    for r in this:
        key = (r.sector or "").strip().lower()
        if key:
            per[key] = per.get(key, 0) + 1
        else:
            no_sector += 1
    ranked = sorted(per.items(), key=lambda kv: (-kv[1], sector_label(kv[0])))[:TOP_SECTORS]
    shares = [SectorShare(sector=k, label=sector_label(k), count=n, percent=percent(n, len(this)))
              for k, n in ranked]

    assessed = [r for r in this if r.assessed]
    by_cat = {c.value: sum(r.category == c.value for r in assessed) for c in Category}
    luar = sum(r.out_of_focus for r in assessed)
    decided = [r for r in rows if r.response_at is not None and start <= r.response_at <= now]
    waiting = [r for r in rows if r.waiting]
    ages = [(now - r.at).days for r in waiting if r.at is not None]
    top = sorted(assessed, key=lambda r: (CATEGORY_RANK[r.category], r.out_of_focus,
                                          -(r.score or 0)))[:TOP_PROPOSALS]
    stats = WeeklyStats(
        proposalsIn=len(this), proposalsInLastWeek=len(last), topSectors=shares,
        noSector=no_sector, assessed=len(assessed), byCategory=by_cat,
        good=by_cat[Category.sangat_layak.value] + by_cat[Category.layak_bersyarat.value],
        outOfFocus=luar, outOfFocusPercent=percent(luar, len(assessed)) if assessed else None,
        avgScore=_avg(assessed), avgScoreLastWeek=_avg([r for r in last if r.assessed]),
        setuju=sum(r.response_kind == ResponseKind.setuju.value for r in decided),
        tolak=sum(r.response_kind == ResponseKind.tolak.value for r in decided),
        waiting=len(waiting), oldestWaitingDays=max(ages) if ages else None,
        perluDicekManual=sum(r.status == ProposalStatus.perlu_dicek_manual.value for r in this),
    )
    return stats, top


def weekly_counts(rows: list[Row], stats: WeeklyStats) -> DigestCounts:
    """The same backlog counts a daily digest records, from the same read."""
    unresponded = [r for r in rows if r.waiting and r.assessed]
    return DigestCounts(
        **{c.value: sum(r.category == c.value for r in unresponded) for c in Category},
        luarFokus=sum(r.out_of_focus for r in unresponded),
        perluDicekManual=sum(r.waiting and not r.assessed for r in rows),
        belumDitanggapi=stats.waiting, baruMasuk=stats.proposalsIn)


@dataclass
class WeeklyData:
    salutation: str
    window_start: datetime  # Monday 00:00 WIB
    stats: WeeklyStats
    top: list[Row]
    counts_: DigestCounts
    at: datetime  # send time
    insight: str | None = None
    manager_name: str = ""

    @property
    def belum(self) -> int:
        return self.stats.waiting

    def counts(self) -> DigestCounts:
        return self.counts_

    def week(self) -> WeekRange:
        return week_range(self.at)


def _change(now: float, before: float, fmt=str) -> str:
    if now == before:
        return "sama"
    return f"{'naik' if now > before else 'turun'} {fmt(abs(now - before))}"


def _age(days: int) -> str:
    return f"{days} hari" if days else "kurang dari 1 hari"


def weekly_template(d: WeeklyData) -> str:
    st = d.stats
    addressee = f"{d.salutation} {d.manager_name}" if d.manager_name else d.salutation
    lines = [(f"{greeting(d.at)}, {addressee}. Ini ringkasan mingguan AISA, "
              f"{fmt_range(d.window_start, d.at)}."), ""]
    lines.append(f"*Proposal masuk*: {st.proposalsIn} (minggu lalu {st.proposalsInLastWeek}, "
                 f"{_change(st.proposalsIn, st.proposalsInLastWeek)})")
    if st.topSectors:
        parts = [f"{s.label} {s.percent}% ({s.count} dari {st.proposalsIn})" for s in st.topSectors]
        if st.noSector:
            parts.append(f"tanpa sektor {st.noSector}")
        lines.append("*Sektor*: " + " · ".join(parts))
    else:
        lines.append("*Sektor*: " + ("belum ada proposal masuk" if not st.proposalsIn
                                      else f"tanpa sektor {st.noSector}"))
    if st.assessed:
        grades = " · ".join(f"{CATEGORY_LABEL[c]} {st.byCategory.get(c.value, 0)}"
                            for c in Category)
        lines.append(f"*Grade* ({st.assessed} dinilai): {grades}")
        lines.append(f"Sangat layak + Layak bersyarat: {st.good} · di luar fokus: "
                     f"{st.outOfFocusPercent}% ({st.outOfFocus} dari {st.assessed})")
    else:
        lines.append("*Grade*: belum ada yang dinilai")
    if st.avgScore is None:
        lines.append("*Rata-rata skor*: belum ada yang dinilai")
    elif st.avgScoreLastWeek is None:
        lines.append(f"*Rata-rata skor*: {fmt_score(st.avgScore)} (minggu lalu belum ada)")
    else:
        delta = _change(st.avgScore, st.avgScoreLastWeek, lambda x: fmt_score(round(x, 1)))
        lines.append(f"*Rata-rata skor*: {fmt_score(st.avgScore)} (minggu lalu "
                     f"{fmt_score(st.avgScoreLastWeek)}, {delta})")
    lines.append(f"*Keputusan minggu ini*: Setuju {st.setuju} · Tolak {st.tolak}")
    lines.append(f"Menunggu keputusan: {st.waiting}"
                 + (f" (terlama {_age(st.oldestWaitingDays)})"
                    if st.oldestWaitingDays is not None else ""))
    if d.top:
        lines.append("*Top 3 minggu ini*")
        for i, r in enumerate(d.top, 1):
            lines.append(f"{i}. {r.name} · {CATEGORY_LABEL[Category(r.category)]} · "
                         f"{fmt_score(r.score or 0)}" + (f" {OUT_OF_FOCUS}" if r.out_of_focus else ""))
    else:
        lines.append("*Top 3 minggu ini*: belum ada")
    lines.append(f"*Perlu dicek manual*: {st.perluDicekManual}")
    if d.insight:
        lines += ["", f"{INSIGHT_LABEL} {d.insight}"]
    return "\n".join(lines)


def weekly_candidates(st: WeeklyStats, now: datetime) -> list[dict]:
    """The facts an insight may pick from, every number counted by code, in a fixed order:
    the leading sector, the change in proposals vs last week, the share out of focus, and the
    decision backlog. A sector lead is only claimed when it is not tied."""
    out: list[dict] = []
    s = st.topSectors
    if st.proposalsIn >= MIN_INSIGHT_COUNT and s and (len(s) == 1 or s[0].count > s[1].count):
        out.append({"jenis": "sektorTerbanyak", "sektor": s[0].label, "persen": s[0].percent,
                    "jumlah": s[0].count, "total": st.proposalsIn})
    a, b = st.proposalsIn, st.proposalsInLastWeek
    if max(a, b) >= MIN_INSIGHT_COUNT:
        c = {"jenis": "perubahanMasuk", "mingguIni": a, "mingguLalu": b,
             "arah": "naik" if a > b else "turun" if a < b else "sama", "selisih": abs(a - b)}
        if now.astimezone(db.WIB).weekday() < 6:
            c["mingguIniSampai"] = DAYS[now.astimezone(db.WIB).weekday()]
        out.append(c)
    if st.assessed >= MIN_INSIGHT_COUNT and st.outOfFocus:
        out.append({"jenis": "diLuarFokus", "diLuarFokus": st.outOfFocus, "dinilai": st.assessed,
                    "persen": st.outOfFocusPercent})
    if st.waiting:
        c = {"jenis": "menungguKeputusan", "menunggu": st.waiting}
        if st.oldestWaitingDays is not None:
            c["terlamaHari"] = st.oldestWaitingDays
        out.append(c)
    return out


def weekly_template_insight(cands: list[dict]) -> str | None:
    if not cands:
        return None
    c = cands[0]
    kind = c["jenis"]
    if kind == "sektorTerbanyak":
        return (f"minggu ini paling banyak {c['sektor']}: {c['persen']}% ({c['jumlah']} dari "
                f"{c['total']} proposal).")
    if kind == "perubahanMasuk":
        until = f" (sampai {c['mingguIniSampai']})" if "mingguIniSampai" in c else ""
        if c["arah"] == "sama":
            return f"proposal masuk minggu ini{until} {c['mingguIni']}, sama dengan minggu lalu."
        return (f"proposal masuk minggu ini{until} {c['mingguIni']}, {c['arah']} "
                f"{c['selisih']} dibanding minggu lalu ({c['mingguLalu']}).")
    if kind == "diLuarFokus":
        return (f"{c['diLuarFokus']} dari {c['dinilai']} proposal yang dinilai minggu ini di luar "
                f"fokus ({c['persen']}%).")
    if kind == "menungguKeputusan":
        tail = f"; yang terlama sudah {_age(c['terlamaHari'])}" if "terlamaHari" in c else ""
        return f"{c['menunggu']} proposal masih menunggu keputusan{tail}."
    return None


def same_numbers(text: str, draft: str) -> bool:
    """The same numbers in the same order. Stricter than `numbers_ok`: the weekly summary is
    nearly all numbers, and a count moved to another line ("Setuju 2" where the draft has
    "Tolak 2") would pass a check that only asks whether each number occurs somewhere."""
    return [int(x) for x in _DIGITS.findall(text)] == [int(x) for x in _DIGITS.findall(draft)]


def weekly_text_ok(text: str, draft: str, d: WeeklyData) -> bool:
    """A rewrite keeps the draft's numbers in order, every section heading, every top
    proposal with its focus mark, and the insight label; it adds no advice."""
    return (bool(text) and same_numbers(text, draft)
            and all(h in text for h in WEEKLY_HEADINGS)
            and all(r.name in text for r in d.top)
            and text.count(OUT_OF_FOCUS) >= sum(r.out_of_focus for r in d.top)
            and (not d.insight or INSIGHT_LABEL in text) and not has_advice(text))


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
    "(jangan menyarankan menyetujui, menolak, atau menghubungi). Untuk setiap proposal "
    "Sangat layak, boleh ganti kalimat penjelasnya dengan satu kalimat singkat dari 'alasan' "
    "yang diberikan. Bila draf berisi baris 'Yang menarik:', pertahankan label itu persis di "
    "awal barisnya. Balas hanya dengan teks pesan."
)


WEEKLY_INSIGHT_SYSTEM = (
    "Anda menulis insight ringkasan mingguan untuk manajer investasi dari kandidat yang SUDAH "
    "dihitung kode. Pilih satu atau dua kandidat yang paling menarik dan tulis 1–2 kalimat "
    "bahasa Indonesia, tanpa salam, tanpa saran tindak lanjut. Pakai HANYA angka yang ada di "
    "data; jangan menghitung angka baru. Awali dengan huruf kecil karena kalimat akan "
    "disambung setelah 'Yang menarik: '. Nama sektor ditulis persis seperti di data (mis. "
    "F&B). 'mingguIniSampai' berarti minggu ini baru dihitung sampai hari itu, sedangkan "
    "minggu lalu satu minggu penuh; sebut itu bila membandingkan jumlah. 'di luar fokus' "
    "berarti tidak sesuai fokus investasi (sektor, tahap, atau dana), bukan grade."
)

WEEKLY_SYSTEM = (
    "Anda merapikan pesan WhatsApp ringkasan mingguan proposal untuk manajer investasi. Anda "
    "menerima draf yang sudah benar. Rapikan bahasanya bila perlu, tetap singkat dan mudah "
    "dipindai, tetapi: pertahankan setiap judul bagian *tebal* persis (*Proposal masuk*, "
    "*Sektor*, *Grade*, *Rata-rata skor*, *Keputusan minggu ini*, *Top 3 minggu ini*, *Perlu "
    "dicek manual*) dan urutannya, SEMUA angka persis seperti di draf, SEMUA nama proposal "
    "dan urutannya, dan setiap tanda '(di luar fokus)' di samping nama yang sama. Jangan "
    "menambah angka baru dan jangan menambah saran tindak lanjut (jangan menyarankan "
    "menyetujui, menolak, atau menghubungi). Bila draf berisi baris 'Yang menarik:', "
    "pertahankan label itu persis di awal barisnya. Balas hanya dengan teks pesan."
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


def previous_morning() -> datetime | None:
    """When the latest 09.00 digest was sent. Equality on `slot` alone and the latest picked
    in code: an order on a second field would need a composite index, and there are at most
    two digests a day."""
    q = db.client().collection("digests").where(filter=FieldFilter("slot", "==", DAILY_SLOT))
    return max((at for s in q.select(["sentAt"]).stream() if (at := s.get("sentAt"))),
               default=None)


def _proposals() -> list[tuple[str, dict]]:
    return [(s.id, s.to_dict() or {}) for s in db.client().collection("proposals").stream()]


def collect(slot: str, now: datetime) -> tuple[DigestData, list[dict], list[str]]:
    """The daily digest. Its window runs from the previous 09.00 digest, so the weekly
    summary in between does not shorten it; before the first one, the last 24 hours."""
    prev = previous_morning()
    window_start = prev or now - FIRST_WINDOW

    groups: dict[Category, list[Item]] = {c: [] for c in Category}
    manual: list[Item] = []
    ids: list[str] = []
    seen: list[Seen] = []
    # One read of every proposal: the counts, "baru masuk" and the insight all come from it,
    # so no number in the message can disagree with another.
    for pid, raw in _proposals():
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
            it = _item(pid, p)
            groups[Category(p.effectiveCategory)].append(it)
            ids.append(pid)
        elif p.status == ProposalStatus.perlu_dicek_manual:
            manual.append(Item(id=pid, name=p.name, score=0.0))
            ids.append(pid)
    for v in groups.values():
        v.sort(key=rank_key)

    baru = sum(is_new(x, window_start) for x in seen)
    data = DigestData(slot=slot, salutation=settings().manager_salutation, window_start=window_start,
                      groups=groups, manual=manual, baru_masuk=baru,
                      manager_name=settings().manager_name, at=now, first=prev is None)
    return data, insight_candidates(seen, data, now), ids


def collect_weekly(now: datetime) -> tuple[WeeklyData, list[dict], list[str]]:
    """The weekly summary, from one read of every proposal."""
    rows = [row_of(pid, raw) for pid, raw in _proposals()]
    stats, top = weekly_stats(rows, now)
    data = WeeklyData(salutation=settings().manager_salutation, window_start=week_start(now),
                      stats=stats, top=top, counts_=weekly_counts(rows, stats), at=now,
                      manager_name=settings().manager_name)
    return data, weekly_candidates(stats, now), [r.id for r in top]


@dataclass(frozen=True)
class _Period:
    """What differs between the daily digest and the weekly summary; the run is shared."""
    name: str  # Digest.period
    title: str
    collect_step: str
    insight_system: str
    rewrite_system: str


DAILY = _Period("harian", "Ringkasan 09.00", "Ambil proposal belum ditanggapi dan hitung per grade",
                INSIGHT_SYSTEM, RINGKASAN_SYSTEM)
WEEKLY = _Period("mingguan", "Ringkasan mingguan", "Ambil proposal dan hitung ringkasan minggu ini",
                 WEEKLY_INSIGHT_SYSTEM, WEEKLY_SYSTEM)


def _collect(slot: str, now: datetime):
    return collect_weekly(now) if slot == WEEKLY_SLOT else collect(slot, now)


def _template(data) -> str:
    return weekly_template(data) if isinstance(data, WeeklyData) else template(data)


def _template_insight(data, cands: list[dict]) -> str | None:
    return (weekly_template_insight(cands) if isinstance(data, WeeklyData)
            else template_insight(cands))


def _rewrite_payload(data, draft: str) -> dict:
    if isinstance(data, WeeklyData):
        return {"draf": draft}
    return {"draf": draft, "alasanSangatLayak": {
        it.name: it.reasons for it in data.groups[DETAILED][:SANGAT_DETAIL_MAX]}}


def _rewrite_ok(data, text: str, draft: str) -> bool:
    if isinstance(data, WeeklyData):
        return weekly_text_ok(text, draft, data)
    return (bool(text) and numbers_ok(text, draft, SANGAT_DETAIL_MAX)
            and names_present(text, data) and label_ok(text, data)
            and focus_marks_ok(text, data) and grade_headings_ok(text)
            and not has_advice(text))


def _weekly_fields(data) -> dict[str, Any]:
    if not isinstance(data, WeeklyData):
        return {}
    return {"week": data.week(), "weekly": data.stats}


def run_digest(slot: str, send: bool = True) -> dict:
    """Build, check, and (if `send`) deliver and record the digest: 09.00 the daily one,
    17.00 the weekly summary, whatever the weekday. With send=False nothing is written and no
    message leaves; the template text is returned for inspection."""
    if slot not in (DAILY_SLOT, WEEKLY_SLOT):
        raise ValueError("slot harus 09.00 atau 17.00")
    period = WEEKLY if slot == WEEKLY_SLOT else DAILY
    now = db.now()
    digest_id = f"{db.wib_date(now)}-{slot.replace('.', '')}"
    ref = db.client().document(f"digests/{digest_id}")
    already_sent = ref.get().exists
    if send and already_sent:
        return {"digestId": digest_id, "skipped": "sudah terkirim"}
    rules = db.load_rules()

    if not send:
        data, cands, ids = _collect(slot, now)
        data.insight = _template_insight(data, cands)
        preview = {"digestId": digest_id, "period": period.name, "text": _template(data),
                   "usedTemplate": True, "insight": data.insight,
                   "counts": to_doc(data.counts()), "insightCandidates": cands,
                   "wouldSkip": already_sent,
                   **{k: to_doc(v) for k, v in _weekly_fields(data).items()}}
        if already_sent:
            preview["note"] = "slot ini sudah terkirim; pengiriman sungguhan akan dilewati"
        return preview

    job = JobLog(JobKind.ringkasan, "Pembuat ringkasan", period.title,
                 model=rules.models.ringkasan, digest_id=digest_id)
    try:
        with job.code_step(period.collect_step, "firestore", read="proposals"):
            data, cands, ids = _collect(slot, now)
        paused = db.is_paused()

        insight = _template_insight(data, cands)
        if cands and not paused:
            cand_json = json.dumps(cands, ensure_ascii=False)
            job.begin("Menulis insight", "gemini.generate_content", StepActor.model)
            try:
                r = llm.generate(rules.models.insight, period.insight_system, f"Data:\n{cand_json}",
                                 temperature=0.3)
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
        draft = _template(data)

        text, used_template = draft, True
        if not paused:
            job.begin("Menyusun teks ringkasan", "gemini.generate_content", StepActor.model)
            try:
                r = llm.generate(rules.models.ringkasan, period.rewrite_system,
                                 json.dumps(_rewrite_payload(data, draft), ensure_ascii=False),
                                 temperature=0.3)
                job.step("Menyusun teks ringkasan", "gemini.generate_content", StepActor.model,
                         model=rules.models.ringkasan, read="data ringkasan", tokens_in=r.tokens_in,
                         tokens_out=r.tokens_out, duration_ms=r.duration_ms)
                candidate = r.text.strip()
                with job.code_step("Cek angka di ringkasan", "kode"):
                    good = _rewrite_ok(data, candidate, draft)
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
        d = Digest(slot=slot, period=period.name, windowStart=data.window_start, sentAt=db.now(),
                   text=text, counts=data.counts(), proposalIds=ids, usedTemplate=used_template,
                   insight=data.insight, jobId=job.id, gowaMessageIds=message_ids,
                   **_weekly_fields(data))
        ref.set(to_doc(d))
        tail = ", template" if used_template else ""
        if isinstance(data, WeeklyData):
            detail = (f"Ringkasan mingguan terkirim ({data.stats.proposalsIn} masuk minggu ini, "
                      f"{data.belum} menunggu keputusan{tail})")
        else:
            detail = f"Ringkasan {slot} terkirim ({data.belum} belum ditanggapi{tail})"
        write_history(via=Via.sistem, action="ringkasan_terkirim", detail=detail)
        job.finish(JobStatus.selesai)
        return {"digestId": digest_id, "usedTemplate": used_template, "text": text,
                "gowaMessageIds": message_ids}
    except Exception:
        job.finish(JobStatus.gagal)
        raise
