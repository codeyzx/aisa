"""Penilai agent: rates the five criteria 1–5 with page citations and extracts the profile.
The model only rates; the score, fit and category are computed by `scoring`."""

from __future__ import annotations

import re
from dataclasses import dataclass

from pydantic import BaseModel, ValidationError

from . import llm
from .models import Criterion, CriterionResult, Profile, Rules
from .pdftext import with_markers

# Same deck, same rules → as close to the same answer as the model allows.
TEMPERATURE = 0.0
SEED = 20261021


class PCitation(BaseModel):
    page: int
    quote: str


class PCriterion(BaseModel):
    # Field order is the response's property order: the model writes its quotes and reasoning
    # before it commits to a value, so the value follows from the evidence, not the reverse.
    citations: list[PCitation]
    notMentioned: bool
    reason: str
    value: int


class PProfile(BaseModel):
    startupName: str | None
    sector: str | None
    stage: str | None
    fundingAskIdr: int | None
    oneLiner: str | None


class PenilaiOutput(BaseModel):
    tim: PCriterion
    pasar: PCriterion
    produk: PCriterion
    traksi: PCriterion
    bisnis: PCriterion
    profile: PProfile


CRITERION_LABEL = {
    Criterion.tim: "Tim",
    Criterion.pasar: "Pasar & masalah",
    Criterion.produk: "Produk & keunggulan",
    Criterion.traksi: "Traksi",
    Criterion.bisnis: "Model bisnis & keuangan",
}

# What counts as hard (verifiable) evidence for each criterion.
HARD_EVIDENCE = {
    Criterion.tim: "rekam jejak spesifik founder: nama perusahaan/lembaga sebelumnya, jabatan, "
                   "lama, dan capaian berangka yang relevan dengan masalah",
    Criterion.pasar: "masalah dan ukuran pasar didukung data bersumber dan berperiode (statistik "
                     "resmi yang disebut sumbernya, survei dengan jumlah responden dan waktu)",
    Criterion.produk: "produk sudah dipakai dengan data kinerja/hasil terukur, atau keunggulan "
                      "dibuktikan angka pembanding, paten, atau hasil uji yang disebut",
    Criterion.traksi: "angka pengguna/pendapatan/pertumbuhan/retensi dengan tanggal atau periode, "
                      "dan pelanggan, mitra, atau pilot yang disebut namanya",
    Criterion.bisnis: "pendapatan aktual, margin, dan unit ekonomi (mis. CAC, LTV) berperiode; "
                      "proyeksi saja tidak cukup",
}


def system_prompt(rules: Rules) -> str:
    lines = [
        "Anda adalah Penilai proposal startup untuk manajer investasi yang skeptis. Nilai HANYA "
        "dari teks pitch deck yang diberikan; jangan menebak atau memakai pengetahuan luar. "
        "Deck yang rapi dan penuh kata sifat BUKAN bukti.",
        "Patokan dari aturan penilaian:",
    ]
    for c in Criterion:
        a = rules.anchors[c]
        lines.append(f"- {c.value} ({CRITERION_LABEL[c]}): 1 = {a.one}; 3 = {a.three}; 5 = {a.five}")
    lines += [
        "Skala yang wajib dipakai (bilangan bulat 1–5):",
        "- 5 = bukti keras yang dapat diverifikasi dan menutup inti kriteria, dari beberapa bukti "
        "yang saling menguatkan tanpa celah penting. Bukti keras: angka dengan periode atau "
        "sumber, pelanggan/mitra yang disebut namanya, data pendapatan/retensi, rekam jejak "
        "spesifik founder. Ragu antara 4 dan 5 → pilih 4.",
        "- 4 = ada data aktual (angka hasil survei, pengukuran, pemakaian, atau realisasi), "
        "tetapi belum lengkap: hanya satu-dua data, angka tanpa sumber atau periode, "
        "mitra/pelanggan/perusahaan tidak disebut namanya, atau sebagian inti kriteria belum "
        "dibuktikan. Data aktual yang hanya kurang sumber atau periode tetap 4, bukan 3.",
        "- 3 = bukti sebagian: klaim spesifik, deskripsi, rencana, target, atau proyeksi tanpa "
        "data aktual sama sekali. Klaim, kata sifat, rencana, dan proyeksi tanpa data paling "
        "tinggi 3.",
        "- 2 = hanya klaim umum atau kata sifat (mis. \"berpengalaman\", \"terbaik\", "
        "\"inovatif\") atau informasi sangat tipis tentang kriteria itu.",
        "- 1 = tidak ada informasi, atau deck memuat bukti yang saling bertentangan (mis. dua "
        "angka yang tidak cocok); sebut pertentangannya di alasan.",
        "Bukti keras per kriteria:",
    ]
    for c in Criterion:
        lines.append(f"- {c.value}: {HARD_EVIDENCE[c]}.")
    lines += [
        "Aturan keluaran:",
        "- Untuk setiap kriteria tulis dulu kutipan, lalu alasan, baru nilai.",
        "- Setiap nilai wajib disertai alasan singkat (bahasa Indonesia, 1–2 kalimat) yang "
        "menyebut bukti mana yang membuat nilainya tidak lebih tinggi, dan minimal satu kutipan "
        "{page, quote}. page adalah nomor dari penanda [hal. n]; quote disalin PERSIS kata demi "
        "kata dari halaman itu (5–30 kata, tanpa parafrase, tanpa menggabungkan halaman). Kutipan "
        "yang tidak ditemukan di halamannya akan membuat nilai diturunkan.",
        "- Bila informasi untuk kriteria tidak ada di deck: value = 1, notMentioned = true, "
        "reason = \"tidak disebut\", citations = [].",
        "- Profil: startupName; sector satu kata huruf kecil (pakai persis salah satu dari "
        f"{', '.join(rules.fit.sectors)} bila sesuai, selain itu sektor sebenarnya, mis. f&b, "
        "logistik); stage salah satu dari pre-seed, seed, seri-a, seri-b, seri-c bila disebut; "
        "fundingAskIdr = besar dana yang diminta dalam rupiah (bilangan bulat; bila dalam USD "
        "konversikan dengan 1 USD = Rp16.000); oneLiner satu kalimat apa yang dikerjakan "
        "startup. Field yang tidak disebut di deck diisi null.",
    ]
    return "\n".join(lines)


class PenilaiInvalid(ValueError):
    pass


_QUOTE_CHARS = str.maketrans({"“": '"', "”": '"', "„": '"', "‘": "'", "’": "'",
                              "–": "-", "—": "-", "‐": "-", " ": " "})
_ELLIPSIS = re.compile(r"\.\.\.|…")
MIN_QUOTE_CHARS = 5  # a shorter fragment matches almost any page


def _norm(s: str) -> str:
    """Case, typographic quotes/dashes and ALL whitespace are ignored: PDF extraction breaks
    lines and doubles spaces where the model, quoting the same words, does not."""
    return re.sub(r"\s+", "", s.translate(_QUOTE_CHARS).casefold())


def quote_found(quote: str, page_text: str) -> bool:
    """True when every '...'-separated fragment of the quote is on the page."""
    page = _norm(page_text)
    frags = [_norm(f).strip("\"'") for f in _ELLIPSIS.split(quote)]
    frags = [f for f in frags if f]
    if not frags or sum(len(f) for f in frags) < MIN_QUOTE_CHARS:
        return False
    return all(f in page for f in frags)


def verify_citations(c: CriterionResult, pages: list[str]) -> CriterionResult:
    """Drop citations whose quote is not on the cited page, and downgrade the value they
    were holding up: none verified → at most 2 (a claim the deck does not show), some
    verified → one step down, never below 2; a 1 (contradiction) stays 1. The reason records the downgrade, so a stored
    value is never backed by a quote the deck does not contain."""
    if c.notMentioned:
        return c
    ok = [x for x in c.citations if quote_found(x.quote, pages[x.page - 1])]
    missing = len(c.citations) - len(ok)
    if not missing:
        return c
    if c.value < 2:
        new = c.value
    else:
        new = min(c.value, 2) if not ok else max(2, c.value - 1)
    note = (f"(nilai diturunkan dari {c.value} ke {new}: {missing} dari {len(c.citations)} "
            "kutipan tidak ditemukan di halaman yang disebut)") if new != c.value else (
            f"({missing} dari {len(c.citations)} kutipan tidak ditemukan di halaman yang "
            "disebut dan dibuang)")
    return c.model_copy(update={"value": new, "citations": ok, "reason": f"{c.reason} {note}"})


def validate(out: PenilaiOutput, pages: list[str]) -> tuple[dict[Criterion, CriterionResult], Profile]:
    criteria: dict[Criterion, CriterionResult] = {}
    for c in Criterion:
        p: PCriterion = getattr(out, c.value)
        if not 1 <= p.value <= 5:
            raise PenilaiInvalid(f"{c}: nilai {p.value} di luar 1..5")
        if p.notMentioned and p.value != 1:
            raise PenilaiInvalid(f"{c}: tidak disebut tetapi nilai {p.value}")
        if not p.notMentioned:
            if not p.citations:
                raise PenilaiInvalid(f"{c}: tanpa kutipan halaman")
            bad = [x.page for x in p.citations if not 1 <= x.page <= len(pages)]
            if bad:
                raise PenilaiInvalid(f"{c}: halaman kutipan tidak ada {bad}")
        try:
            criteria[c] = verify_citations(CriterionResult.model_validate(p.model_dump()), pages)
        except ValidationError as e:
            raise PenilaiInvalid(str(e)) from e
    pr = out.profile
    ask = pr.fundingAskIdr if pr.fundingAskIdr and pr.fundingAskIdr > 0 else None
    profile = Profile(
        sector=(pr.sector or "").strip().lower() or None,
        stage=(pr.stage or "").strip().lower() or None,
        fundingAskIdr=ask,
        oneLiner=(pr.oneLiner or "").strip() or None,
    )
    return criteria, profile


@dataclass
class Attempt:
    ok: bool
    criteria: dict[Criterion, CriterionResult] | None
    profile: Profile | None
    startup_name: str | None
    error: str | None
    tokens_in: int
    tokens_out: int
    duration_ms: int


def assess_once(pages: list[str], rules: Rules) -> Attempt:
    """One Penilai call plus validation. Pure apart from the model call: no Firestore."""
    try:
        r = llm.generate(rules.models.penilai, system_prompt(rules), with_markers(pages),
                         schema=PenilaiOutput, temperature=TEMPERATURE, seed=SEED)
    except Exception as e:  # transport/model failure counts as a failed attempt
        return Attempt(False, None, None, None, f"panggilan model gagal: {e}"[:500], 0, 0, 0)
    try:
        out = r.parsed if isinstance(r.parsed, PenilaiOutput) else PenilaiOutput.model_validate_json(r.text)
        criteria, profile = validate(out, pages)
        name = (out.profile.startupName or "").strip() or None
        return Attempt(True, criteria, profile, name, None, r.tokens_in, r.tokens_out, r.duration_ms)
    except (ValidationError, PenilaiInvalid, ValueError) as e:
        return Attempt(False, None, None, None, str(e)[:500], r.tokens_in, r.tokens_out, r.duration_ms)
