"""Thin google-genai wrapper: one call, its text/parsed output and its token usage."""

from __future__ import annotations

import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from google import genai
from google.genai import types

from .config import settings


@lru_cache
def client() -> genai.Client:
    s = settings()
    return genai.Client(vertexai=True, project=s.project, location=s.genai_location)


@dataclass
class LlmResult:
    text: str
    parsed: Any
    tokens_in: int
    tokens_out: int
    duration_ms: int


def generate(
    model: str,
    system: str,
    prompt: str,
    schema: Any = None,
    temperature: float | None = 0.2,
    seed: int | None = None,
    pdf: bytes | None = None,
    thinking_level: types.ThinkingLevel | None = None,
) -> LlmResult:
    """`temperature=None` keeps the model's default. A `pdf` is sent before the prompt, as
    the model reads a single document best when it comes first."""
    cfg = types.GenerateContentConfig(system_instruction=system, temperature=temperature, seed=seed)
    if schema is not None:
        cfg.response_mime_type = "application/json"
        cfg.response_schema = schema
    if thinking_level is not None:
        cfg.thinking_config = types.ThinkingConfig(thinking_level=thinking_level)
    contents: Any = prompt
    if pdf is not None:
        # Medium is where document OCR quality saturates; higher only spends more tokens.
        contents = [types.Part.from_bytes(data=pdf, mime_type="application/pdf",
                                          media_resolution=types.PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM),
                    prompt]
    t0 = time.monotonic()
    r = client().models.generate_content(model=model, contents=contents, config=cfg)
    u = r.usage_metadata
    tin = (u.prompt_token_count or 0) if u else 0
    # Thinking tokens are billed as output, so they count as "token keluar".
    tout = ((u.candidates_token_count or 0) + (u.thoughts_token_count or 0)) if u else 0
    return LlmResult(
        text=r.text or "",
        parsed=r.parsed if schema is not None else None,
        tokens_in=tin,
        tokens_out=tout,
        duration_ms=int((time.monotonic() - t0) * 1000),
    )
