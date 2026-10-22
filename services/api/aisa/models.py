"""Source of truth for every AISA Firestore collection
(docs/reference/contracts/aisa-firestore.md). Field names are camelCase because that is
what is stored; `Tokens.in_` is the one alias, since `in` is a Python keyword.

Write a model to Firestore with `to_doc(model)` so aliases are honoured."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class _M(BaseModel):
    model_config = ConfigDict(populate_by_name=True, use_enum_values=True)


def to_doc(model: BaseModel) -> dict[str, Any]:
    return model.model_dump(by_alias=True, mode="python")


# ---------- enums ----------


class Criterion(StrEnum):
    """Declared in A–E order; every list, prompt and chart follows it."""

    manajemen = "manajemen"
    kinerja = "kinerja"
    risiko = "risiko"
    rencana = "rencana"
    dampak = "dampak"


class Category(StrEnum):
    """The grade, decided by the score alone; declared from best to worst."""

    sangat_layak = "sangat_layak"
    layak_bersyarat = "layak_bersyarat"
    perlu_penyesuaian = "perlu_penyesuaian"
    risiko_tinggi = "risiko_tinggi"
    tidak_layak = "tidak_layak"


CATEGORY_LABEL: dict[Category, str] = {
    Category.sangat_layak: "Sangat layak",
    Category.layak_bersyarat: "Layak bersyarat",
    Category.perlu_penyesuaian: "Perlu penyesuaian",
    Category.risiko_tinggi: "Risiko tinggi",
    Category.tidak_layak: "Tidak layak",
}

# The action (Aksi) that goes with each grade.
CATEGORY_ACTION: dict[Category, str] = {
    Category.sangat_layak: "Lanjutkan investasi",
    Category.layak_bersyarat: "Investasi dengan syarat",
    Category.perlu_penyesuaian: "Sesuaikan dulu sebelum lanjut",
    Category.risiko_tinggi: "Pertimbangkan menolak",
    Category.tidak_layak: "Tolak",
}

# Grade rank for sorting: 0 is the best grade.
CATEGORY_RANK: dict[str, int] = {c.value: i for i, c in enumerate(Category)}


class ProposalStatus(StrEnum):
    antre = "antre"
    dinilai_proses = "dinilai_proses"
    dinilai = "dinilai"
    perlu_dicek_manual = "perlu_dicek_manual"
    dihentikan = "dihentikan"


class ResponseKind(StrEnum):
    """The manager's decision on a proposal."""

    setuju = "setuju"
    tolak = "tolak"


RESPONSE_LABEL: dict[ResponseKind, str] = {
    ResponseKind.setuju: "Setuju",
    ResponseKind.tolak: "Tolak",
}

# Decisions of the earlier scale. They are no longer accepted anywhere, but history rows
# written before `aisa migrate-responses` still carry them.
LEGACY_RESPONSE_LABEL: dict[str, str] = {
    "undang": "Undang (lama)",
    "pantau": "Pantau (lama)",
    "arsipkan": "Arsipkan (lama)",
}


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
    # Written only by `aisa migrate-grades`: a proposal re-assessed on the new scale.
    "dinilai_ulang",
]

Slot = Literal["09.00", "17.00"]
# 09.00 is the daily digest; 17.00 is always the weekly summary.
DigestPeriod = Literal["harian", "mingguan"]


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
    """Minimum score of each grade; below `risikoTinggi` the grade is tidak_layak."""

    sangatLayak: float = 85
    layakBersyarat: float = 75
    perluPenyesuaian: float = 65
    risikoTinggi: float = 50

    @model_validator(mode="after")
    def _descending(self) -> Thresholds:
        t = [self.sangatLayak, self.layakBersyarat, self.perluPenyesuaian, self.risikoTinggi]
        if not all(0 < x <= 100 for x in t):
            raise ValueError("batas grade harus di antara 0 (tidak termasuk) dan 100")
        if not all(a > b for a, b in zip(t, t[1:], strict=False)):
            raise ValueError("batas grade harus menurun: sangatLayak > layakBersyarat > "
                             "perluPenyesuaian > risikoTinggi")
        return self


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
    # Proposals decided `tolak` are deleted this many days after that decision.
    retentionDays: int = Field(90, ge=1)
    changedAt: datetime
    reason: str


class Runtime(_M):
    paused: bool = False
    pausedAt: datetime | None = None
    pausedVia: Via | None = None
    # Set on every STOP and never cleared by LANJUT: an Asisten answer that started before
    # it is cancelled even when LANJUT arrives before the answer would have been sent.
    lastStopAt: datetime | None = None


# ---------- jobs ----------


class CurrentStep(_M):
    """The step a running job has started but not yet recorded under `steps`."""
    action: str
    tool: str
    actor: StepActor
    startedAt: datetime


class Job(_M):
    kind: JobKind
    agent: str
    title: str
    model: str | None = None
    proposalId: str | None = None
    # Every proposal a job acted on when it touched several (a confirmed bulk response), so
    # deleting one of them can find the job.
    proposalIds: list[str] | None = None
    digestId: str | None = None
    status: JobStatus
    startedAt: datetime
    endedAt: datetime | None = None
    durationMs: int | None = None
    stepCount: int = 0
    tokensIn: int = 0
    tokensOut: int = 0
    # Set when a step starts; null again once that step's doc is written and when the job
    # finishes, so a non-null value always names work still in progress.
    currentStep: CurrentStep | None = None


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
    sangat_layak: int = 0
    layak_bersyarat: int = 0
    perlu_penyesuaian: int = 0
    risiko_tinggi: int = 0
    tidak_layak: int = 0
    luarFokus: int = 0  # unresponded proposals whose fit failed, in any grade
    perluDicekManual: int = 0
    belumDitanggapi: int = 0
    baruMasuk: int = 0


class WeekRange(_M):
    """WIB dates (YYYY-MM-DD): the Monday the week starts and the day the summary was sent."""

    start: str
    end: str


class SectorShare(_M):
    sector: str  # the stored sector, lowercased
    label: str  # as the dashboard shows it ("f&b" → "F&B")
    count: int
    percent: int  # of `WeeklyStats.proposalsIn`, rounded half up


class WeeklyStats(_M):
    """Every number the weekly summary states, counted by code. "This week" is Monday 00:00
    WIB → send time, "last week" the full Monday–Sunday before it; proposals are placed in a
    week by `createdAt`, decisions by `response.at`. Deleted proposals are not counted."""

    proposalsIn: int
    proposalsInLastWeek: int
    topSectors: list[SectorShare] = []  # at most 3, most proposals first
    noSector: int = 0  # proposals in this week with no sector read yet
    assessed: int = 0  # this week's proposals with status `dinilai`
    byCategory: dict[Category, int] = {}  # of those, per effective grade
    good: int = 0  # Sangat layak + Layak bersyarat
    outOfFocus: int = 0
    outOfFocusPercent: int | None = None  # of `assessed`; None when nothing was assessed
    avgScore: float | None = None  # one decimal
    avgScoreLastWeek: float | None = None
    setuju: int = 0
    tolak: int = 0
    waiting: int = 0  # every proposal awaiting a decision now, whatever week it came in
    oldestWaitingDays: int | None = None
    perluDicekManual: int = 0  # this week's proposals with status `perlu_dicek_manual`


class Digest(_M):
    slot: Slot
    # Absent on docs written before the weekly summary existed: those are all daily.
    period: DigestPeriod = "harian"
    windowStart: datetime | None = None
    sentAt: datetime
    text: str
    # Daily and weekly alike: the unresponded proposals at send time, per grade, plus
    # `baruMasuk`, the proposals that came in during the window.
    counts: DigestCounts
    # The proposals the message names (weekly: its top 3, best first).
    proposalIds: list[str]
    usedTemplate: bool
    insight: str | None = None  # the insight sentence used, without the "Yang menarik:" label
    jobId: str
    gowaMessageIds: list[str] = []
    week: WeekRange | None = None  # weekly only
    weekly: WeeklyStats | None = None  # weekly only


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


# ---------- default rules (written by `seed-rules` and `migrate-grades`) ----------

RULES_REASON_NEW_SCALE = "Skala penilaian baru: 5 kriteria (A–E) dan 5 grade"

DEFAULT_WEIGHTS: dict[Criterion, float] = {
    Criterion.manajemen: 0.25,
    Criterion.kinerja: 0.20,
    Criterion.risiko: 0.20,
    Criterion.rencana: 0.25,
    Criterion.dampak: 0.10,
}


def _a(one: str, three: str, five: str) -> Anchors:
    return Anchors(**{"1": one, "3": three, "5": five})


DEFAULT_ANCHORS: dict[Criterion, Anchors] = {
    Criterion.manajemen: _a(
        "Tim tidak dikenalkan, atau hanya disebut tanpa latar belakang",
        "Tim disebut dengan peran dan pengalaman umum, tanpa rekam jejak yang bisa dicek",
        "Rekam jejak spesifik dan relevan (tempat kerja, jabatan, capaian berangka) dan peran "
        "kunci lengkap"),
    Criterion.kinerja: _a(
        "Belum ada bukti bisnis berjalan, atau angkanya saling bertentangan",
        "Ada pengguna atau pendapatan awal, tetapi angkanya tanpa periode atau tanpa nama "
        "pelanggan",
        "Pendapatan, pengguna, dan pertumbuhan berperiode, dengan pelanggan atau mitra yang "
        "disebut namanya"),
    Criterion.risiko: _a(
        "Ada risiko besar yang tidak dibahas, informasinya bertentangan, atau risiko tidak "
        "dibahas sama sekali",
        "Sebagian risiko disebut, tetapi mitigasinya umum atau tren pasar tidak didukung data",
        "Risiko utama (persaingan, regulasi, ketergantungan) disebut beserta mitigasinya, dan "
        "tren makro/pasar yang mendukung dibuktikan data bersumber"),
    Criterion.rencana: _a(
        "Tidak ada rencana penggunaan dana atau proyeksi keuangan",
        "Ada rencana penggunaan dana atau proyeksi, tetapi tanpa dasar data atau unit ekonomi",
        "Penggunaan dana rinci, proyeksi berdasar data aktual, unit ekonomi, dan potensi imbal "
        "hasil bagi investor dijelaskan"),
    Criterion.dampak: _a(
        "Dampak sosial atau lingkungan tidak disebut",
        "Dampak disebut tetapi belum diukur (mis. 'membantu petani')",
        "Dampak terukur dengan angka (mis. lapangan kerja, inklusi, emisi) dan cara mengukurnya"),
}


def default_rules(now: datetime) -> Rules:
    m = "gemini-3.8-flash"
    return Rules(
        version=1,
        weights=dict(DEFAULT_WEIGHTS),
        anchors=dict(DEFAULT_ANCHORS),
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
