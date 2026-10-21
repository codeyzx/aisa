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
    temperature: float = 0.2,
    seed: int | None = None,
) -> LlmResult:
    cfg = types.GenerateContentConfig(system_instruction=system, temperature=temperature, seed=seed)
    if schema is not None:
        cfg.response_mime_type = "application/json"
        cfg.response_schema = schema
    t0 = time.monotonic()
    r = client().models.generate_content(model=model, contents=prompt, config=cfg)
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
