"""Pure scoring logic: no I/O, no model. Everything numeric about a proposal is decided here."""

from __future__ import annotations

import re

from .models import (
    Category,
    Criterion,
    CriterionResult,
    Fit,
    FitChecks,
    FitItem,
    FitRules,
    Profile,
    Thresholds,
)

NOT_MENTIONED = "tidak disebut"


def compute_score(weights: dict[Criterion, float], values: dict[Criterion, int]) -> float:
    """skor = Σ bobot × (nilai − 1) / 4, scaled to 0–100, one decimal."""
    missing = {c.value for c in Criterion} - {str(k) for k in values}
    if missing:
        raise ValueError(f"nilai kriteria hilang: {sorted(missing)}")
    total = 0.0
    for c in Criterion:
        v = values[c]
        if not 1 <= v <= 5:
            raise ValueError(f"nilai {c} di luar 1..5: {v}")
        total += weights[c] * (v - 1) / 4
    return round(total * 100, 1)


def normalize_token(s: str) -> str:
    """Lowercase and collapse spaces/underscores/dashes to '-': 'Pre Seed' → 'pre-seed'."""
    return re.sub(r"[\s_\-]+", "-", s.strip().lower())


def fit_check(profile: Profile, rules: FitRules) -> Fit:
    """A field the deck does not state fails its check with reason 'tidak disebut'."""
    sectors = {normalize_token(s) for s in rules.sectors}
    stages = {normalize_token(s) for s in rules.stages}

    if not profile.sector:
        sector = FitItem(passed=False, reason=NOT_MENTIONED)
    elif normalize_token(profile.sector) in sectors:
        sector = FitItem(passed=True, reason=f"{profile.sector} termasuk sektor fokus")
    else:
        sector = FitItem(passed=False, reason=f"{profile.sector} di luar sektor fokus")

    if not profile.stage:
        stage = FitItem(passed=False, reason=NOT_MENTIONED)
    elif normalize_token(profile.stage) in stages:
        stage = FitItem(passed=True, reason=f"tahap {profile.stage} sesuai")
    else:
        stage = FitItem(passed=False, reason=f"tahap {profile.stage} di luar fokus")

    ask = profile.fundingAskIdr
    if ask is None:
        funding = FitItem(passed=False, reason=NOT_MENTIONED)
    elif rules.fundingMinIdr <= ask <= rules.fundingMaxIdr:
        funding = FitItem(passed=True, reason=f"{format_idr(ask)} dalam rentang")
    else:
        funding = FitItem(
            passed=False,
            reason=f"{format_idr(ask)} di luar rentang {format_idr(rules.fundingMinIdr)}–{format_idr(rules.fundingMaxIdr)}",
        )

    checks = FitChecks(sector=sector, stage=stage, funding=funding)
    return Fit(passed=sector.passed and stage.passed and funding.passed, checks=checks)


def categorize(score: float, t: Thresholds) -> Category:
    """The grade from the score alone, by the bands in `t`; fit does not change it."""
    if score >= t.sangatLayak:
        return Category.sangat_layak
    if score >= t.layakBersyarat:
        return Category.layak_bersyarat
    if score >= t.perluPenyesuaian:
        return Category.perlu_penyesuaian
    if score >= t.risikoTinggi:
        return Category.risiko_tinggi
    return Category.tidak_layak


def values_of(criteria: dict[Criterion, CriterionResult]) -> dict[Criterion, int]:
    return {Criterion(k): r.value for k, r in criteria.items()}


def format_idr(amount: int) -> str:
    """Indonesian short form: Rp5 M (miliar), Rp750 jt. Integer rupiah in, display out."""
    if amount >= 1_000_000_000:
        v = amount / 1_000_000_000
        s = f"{v:.1f}".rstrip("0").rstrip(".").replace(".", ",")
        return f"Rp{s} M"
    if amount >= 1_000_000:
        return f"Rp{amount // 1_000_000} jt"
    return f"Rp{amount}"
