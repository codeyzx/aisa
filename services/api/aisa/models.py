"""Source of truth for every AISA Firestore collection
(docs/reference/contracts/aisa-firestore.md). Field names are camelCase because that is
what is stored; `Tokens.in_` is the one alias, since `in` is a Python keyword.

Write a model to Firestore with `to_doc(model)` so aliases are honoured."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class _M(BaseModel):
    model_config = ConfigDict(populate_by_name=True, use_enum_values=True)


def to_doc(model: BaseModel) -> dict[str, Any]:
    return model.model_dump(by_alias=True, mode="python")


# ---------- enums ----------


class Criterion(StrEnum):
    tim = "tim"
    pasar = "pasar"
    produk = "produk"
    traksi = "traksi"
    bisnis = "bisnis"


class Category(StrEnum):
    sangat_cocok = "sangat_cocok"
    cocok = "cocok"
    kurang_cocok = "kurang_cocok"
    tidak_cocok = "tidak_cocok"


CATEGORY_LABEL: dict[Category, str] = {
    Category.sangat_cocok: "Sangat cocok",
    Category.cocok: "Cocok",
    Category.kurang_cocok: "Kurang cocok",
    Category.tidak_cocok: "Tidak cocok",
}


class ProposalStatus(StrEnum):
    antre = "antre"
    dinilai_proses = "dinilai_proses"
    dinilai = "dinilai"
    perlu_dicek_manual = "perlu_dicek_manual"
    dihentikan = "dihentikan"


class ResponseKind(StrEnum):
    undang = "undang"
    pantau = "pantau"
    arsipkan = "arsipkan"


class Via(StrEnum):
    wa = "wa"
    dashboard = "dashboard"
    sistem = "sistem"


class SourceKind(StrEnum):
    form = "form"
    upload = "upload"


class JobKind(StrEnum):
    penilaian = "penilaian"
    ringkasan = "ringkasan"
    asisten = "asisten"
    perintah = "perintah"


class JobStatus(StrEnum):
    berjalan = "berjalan"
    selesai = "selesai"
    gagal = "gagal"
    dihentikan = "dihentikan"


class StepActor(StrEnum):
    model = "model"
    kode = "kode"


StepStatus = Literal["ok", "gagal", "dihentikan"]

HistoryAction = Literal[
    "tanggapan",
    "tanggapan_massal",
    "koreksi",
    "aturan_diubah",
    "stop",
    "lanjut",
    "ringkasan_terkirim",
    "proposal_masuk",
    "proposal_dihapus",
]

Slot = Literal["09.00", "17.00"]


# ---------- proposals ----------


class Citation(_M):
    page: int
    quote: str


class CriterionResult(_M):
    value: int = Field(ge=1, le=5)
    reason: str
    notMentioned: bool
    citations: list[Citation] = []
    # Every quote the model gave was missing from its page, so the value (capped at 2)
    # rests on no verified quote; `reason` says why.
    citationsUnverified: bool = False


class Assessment(_M):
    criteria: dict[Criterion, CriterionResult]
    score: float = Field(ge=0, le=100)
    rulesVersion: int
    model: str


class Source(_M):
    kind: SourceKind
    driveFileId: str | None = None
    gcsPath: str | None = None
    fileName: str


class Founder(_M):
    name: str | None = None
    email: str | None = None


class Profile(_M):
    sector: str | None = None
    stage: str | None = None
    fundingAskIdr: int | None = None
    oneLiner: str | None = None


class FitItem(_M):
    passed: bool
    reason: str


class FitChecks(_M):
    sector: FitItem
    stage: FitItem
    funding: FitItem


class Fit(_M):
    passed: bool
    checks: FitChecks


class Correction(_M):
    category: Category
    reason: str
    at: datetime
    via: Via


class Response(_M):
    kind: ResponseKind
    at: datetime
    via: Via
    note: str | None = None


class Tokens(_M):
    in_: int = Field(0, alias="in")
    out: int = 0


class Proposal(_M):
    name: str
    nameLower: str
    source: Source
    founder: Founder = Founder()
    consent: bool
    status: ProposalStatus
    statusReason: str | None = None
    pageCount: int = 0
    profile: Profile = Profile()
    assessment: Assessment | None = None
    fit: Fit | None = None
    category: Category | None = None
    qualityOutsideFocus: bool = False
    correction: Correction | None = None
    effectiveCategory: Category | None = None
    response: Response | None = None
    responded: bool = False
    tokens: Tokens = Tokens()
    jobId: str | None = None
    createdAt: datetime
    updatedAt: datetime
    assessedAt: datetime | None = None


class ProposalText(_M):
    pages: list[str]
    charCount: int


# ---------- rules ----------


class Anchors(_M):
    one: str = Field(alias="1")
    three: str = Field(alias="3")
    five: str = Field(alias="5")


class FitRules(_M):
    sectors: list[str]
    stages: list[str]
    fundingMinIdr: int
    fundingMaxIdr: int


class Thresholds(_M):
    sangatCocok: float = 80
    cocok: float = 65
    kurangCocok: float = 45
    qualityOutsideFocus: float = 65


class ModelNames(_M):
    """Stored docs may still carry `orchestrator`; unknown keys are ignored on read."""

    penilai: str
    ringkasan: str
    insight: str
    # Informational only: the Asisten runs the model in ASSISTANT_MODEL where it is deployed.
    asisten: str


class Rules(_M):
    version: int
    weights: dict[Criterion, float]
    anchors: dict[Criterion, Anchors]
    fit: FitRules
    thresholds: Thresholds
    models: ModelNames
    minCharsPerPage: int = 200
    # Archived proposals are deleted this many days after the archive response.
    retentionDays: int = Field(90, ge=1)
    changedAt: datetime
    reason: str


class Runtime(_M):
    paused: bool = False
    pausedAt: datetime | None = None
    pausedVia: Via | None = None


# ---------- jobs ----------


class Job(_M):
    kind: JobKind
    agent: str
    title: str
    model: str | None = None
    proposalId: str | None = None
    digestId: str | None = None
    status: JobStatus
    startedAt: datetime
    endedAt: datetime | None = None
    durationMs: int | None = None
    stepCount: int = 0
    tokensIn: int = 0
    tokensOut: int = 0


class Step(_M):
    seq: int
    at: datetime
    action: str
    tool: str
    actor: StepActor
    model: str | None = None
    read: str | None = None
    wrote: str | None = None
    tokensIn: int = 0
    tokensOut: int = 0
    durationMs: int = 0
    status: StepStatus = "ok"
    error: str | None = None


# ---------- history, digests, stats, bookkeeping ----------


class History(_M):
    at: datetime
    via: Via
    action: HistoryAction
    proposalId: str | None = None
    proposalName: str | None = None
    before: Any = None
    after: Any = None
    reason: str | None = None
    detail: str


class DigestCounts(_M):
    sangat_cocok: int = 0
    cocok: int = 0
    kurang_cocok: int = 0
    tidak_cocok: int = 0
    kualitasLuarFokus: int = 0
    perluDicekManual: int = 0
    belumDitanggapi: int = 0
    baruMasuk: int = 0


class Digest(_M):
    slot: Slot
    windowStart: datetime | None = None
    sentAt: datetime
    text: str
    counts: DigestCounts
    proposalIds: list[str]
    usedTemplate: bool
    insight: str | None = None  # the insight sentence used, without the "Yang menarik:" label
    jobId: str
    gowaMessageIds: list[str] = []


class TokenPair(_M):
    in_: int = Field(0, alias="in")
    out: int = 0


class DailyStats(_M):
    """Shape only: written with Firestore `Increment`, never as a whole document."""

    date: str
    proposalsIn: int = 0
    byCategory: dict[Category, int] = {}
    bySector: dict[str, int] = {}
    perluDicekManual: int = 0
    tokensIn: int = 0
    tokensOut: int = 0
    modelCalls: int = 0
    tokensByKind: dict[JobKind, TokenPair] = {}


class WebhookEvent(_M):
    at: datetime


class PendingConfirmation(_M):
    command: str
    proposalIds: list[str]
    expiresAt: datetime


class AssistantSession(_M):
    date: str
    sessionId: str


# ---------- default rules (used only by the `seed-rules` CLI) ----------

_ANCHORS = Anchors(
    **{
        "1": "Tidak ada bukti, atau bukti bertentangan",
        "3": "Ada bukti sebagian",
        "5": "Bukti kuat: data, perilaku pelanggan, atau rekam jejak",
    }
)


def default_rules(now: datetime) -> Rules:
    m = "gemini-3.8-flash"
    return Rules(
        version=1,
        weights={
            Criterion.tim: 0.275,
            Criterion.pasar: 0.30,
            Criterion.produk: 0.20,
            Criterion.traksi: 0.125,
            Criterion.bisnis: 0.10,
        },
        anchors={c: _ANCHORS for c in Criterion},
        fit=FitRules(
            sectors=["agritech", "fintech", "edtech", "healthtech", "climate"],
            stages=["pre-seed", "seed", "seri-a"],
            fundingMinIdr=1_000_000_000,
            fundingMaxIdr=20_000_000_000,
        ),
        thresholds=Thresholds(),
        models=ModelNames(penilai=m, ringkasan=m, insight=m, asisten=m),
        minCharsPerPage=200,
        changedAt=now,
        reason="Aturan awal (baseline)",
    )


WEIGHT_TOLERANCE = 0.001


def weights_valid(weights: dict[Criterion, float] | dict[str, float]) -> bool:
    keys = {str(k) for k in weights}
    return keys == {c.value for c in Criterion} and abs(sum(weights.values()) - 1.0) <= WEIGHT_TOLERANCE
