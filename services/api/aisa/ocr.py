"""Image read of a deck pypdf could not get text from: the model transcribes the visible text
of each page, and that transcript stands in for the extracted text. The model only copies
text here; the Penilai still rates from the transcript and its quotes are verified against it."""

from __future__ import annotations

from dataclasses import dataclass

from google.genai import types
from pydantic import BaseModel, ValidationError

from . import llm

# Vertex AI documents 15 MB as the cap for a document sent inline, and a deck past 50 pages
# is not a pitch deck worth a long, costly transcription; both stay perlu dicek manual.
MAX_BYTES = 15 * 1024 * 1024
MAX_PAGES = 50

SYSTEM = (
    "Anda menyalin teks dari pitch deck PDF yang halamannya berupa gambar. Untuk setiap "
    "halaman, tulis semua teks yang TERLIHAT di halaman itu persis seperti tertulis: judul, "
    "isi, label dan angka pada grafik atau tabel, serta keterangan kecil. Jangan "
    "menerjemahkan, meringkas, menjelaskan gambar, atau menambah apa pun yang tidak tertulis. "
    "Pertahankan urutan baca dari atas ke bawah. Halaman tanpa teks diisi string kosong."
)


class OPage(BaseModel):
    page: int
    text: str


class OcrOutput(BaseModel):
    pages: list[OPage]


@dataclass
class OcrResult:
    ok: bool
    pages: list[str] | None
    error: str | None
    tokens_in: int
    tokens_out: int
    duration_ms: int


def fits(pdf: bytes, page_count: int) -> bool:
    return len(pdf) <= MAX_BYTES and 0 < page_count <= MAX_PAGES


def to_pages(out: OcrOutput, page_count: int) -> list[str]:
    """One text per PDF page, in page order. A page the model skipped stays empty; a page
    number outside the deck means the transcript cannot be trusted to line up with it."""
    pages = [""] * page_count
    for p in out.pages:
        if not 1 <= p.page <= page_count:
            raise ValueError(f"halaman {p.page} tidak ada di deck ({page_count} halaman)")
        pages[p.page - 1] = p.text.strip()
    return pages


def transcribe(pdf: bytes, page_count: int, model: str) -> OcrResult:
    """One model call. Thinking stays low (copying needs no reasoning) and temperature at the
    model's default, which Gemini 3 asks for: lower values can loop on long outputs."""
    prompt = (f"Deck ini punya {page_count} halaman. Salin teks setiap halaman, "
              f"halaman 1 sampai {page_count}.")
    try:
        r = llm.generate(model, SYSTEM, prompt, schema=OcrOutput, temperature=None, pdf=pdf,
                         thinking_level=types.ThinkingLevel.LOW)
    except Exception as e:  # transport/model failure: the deck falls back to manual review
        return OcrResult(False, None, f"panggilan model gagal: {e}"[:500], 0, 0, 0)
    try:
        out = r.parsed if isinstance(r.parsed, OcrOutput) else OcrOutput.model_validate_json(r.text)
        return OcrResult(True, to_pages(out, page_count), None, r.tokens_in, r.tokens_out,
                         r.duration_ms)
    except (ValidationError, ValueError) as e:
        return OcrResult(False, None, str(e)[:500], r.tokens_in, r.tokens_out, r.duration_ms)
