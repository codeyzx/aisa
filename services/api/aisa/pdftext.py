"""Per-page PDF text extraction. Text only; no OCR."""

from __future__ import annotations

import io

from pypdf import PdfReader


def extract_pages(pdf: bytes) -> list[str]:
    reader = PdfReader(io.BytesIO(pdf))
    pages: list[str] = []
    for page in reader.pages:
        try:
            pages.append((page.extract_text() or "").strip())
        except Exception:  # one unreadable page must not sink the deck
            pages.append("")
    return pages


def with_markers(pages: list[str]) -> str:
    return "\n\n".join(f"[hal. {i}]\n{t}" for i, t in enumerate(pages, start=1))


def too_little_text(pages: list[str], min_chars_per_page: int) -> bool:
    if not pages:
        return True
    return sum(len(p) for p in pages) / len(pages) < min_chars_per_page
