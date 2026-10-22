// Read-only zod mirrors of the AISA Firestore contract
// (docs/reference/contracts/aisa-firestore.md). The Python Pydantic models in
// `services/api` are the source of truth and the only writer; the dashboard
// never writes these documents, so there are no create/update schemas here.
//
// Optional fields are `.nullish()` because the Python side may store an explicit
// `null` where the contract says "optional". A drifted document still fails the
// parse loudly — that is the converter's job.

import * as z from 'zod'

import { TimestampSchema } from '@/lib/data/timestamp'

/** Criteria A–E, in the order every list, chart and prompt shows them. */
export const CRITERIA = [
  'manajemen',
  'kinerja',
  'risiko',
  'rencana',
  'dampak',
] as const
export const CriterionSchema = z.enum(CRITERIA)
export type Criterion = z.infer<typeof CriterionSchema>

/** The five grades, best first. The grade follows from the score alone. */
export const CATEGORIES = [
  'sangat_layak',
  'layak_bersyarat',
  'perlu_penyesuaian',
  'risiko_tinggi',
  'tidak_layak',
] as const
export const CategorySchema = z.enum(CATEGORIES)
export type Category = z.infer<typeof CategorySchema>

/**
 * The kategori values of the earlier four-step scale. Proposals were re-graded, but
 * history rows and sent ringkasan keep these as written; they render as
 * "… (skala lama)" and are never parsed as a current grade.
 */
export const LEGACY_CATEGORIES = [
  'sangat_cocok',
  'cocok',
  'kurang_cocok',
  'tidak_cocok',
] as const
export type LegacyCategory = (typeof LEGACY_CATEGORIES)[number]

export const PROPOSAL_STATUSES = [
  'antre',
  'dinilai_proses',
  'dinilai',
  'perlu_dicek_manual',
  'dihentikan',
] as const
export const ProposalStatusSchema = z.enum(PROPOSAL_STATUSES)
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>

export const RESPONSE_KINDS = ['setuju', 'tolak'] as const
export const ResponseKindSchema = z.enum(RESPONSE_KINDS)
export type ResponseKind = z.infer<typeof ResponseKindSchema>

/**
 * Decisions of the earlier scale. No longer accepted anywhere, but history rows
 * written before the `migrate-responses` run still carry them in
 * `before`/`after`, which `HistorySchema` keeps as `unknown`.
 */
export const LEGACY_RESPONSE_KINDS = ['undang', 'pantau', 'arsipkan'] as const
export type LegacyResponseKind = (typeof LEGACY_RESPONSE_KINDS)[number]

/**
 * An enum the Python side may extend before the dashboard is redeployed: a known
 * value parses as itself, and an unknown one is kept as its raw string instead of
 * failing the whole page read. Display goes through `labelOf`, which falls back
 * to the raw value.
 */
function openEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.union([z.enum(values), z.string()]) as unknown as z.ZodType<
    T[number] | (string & {})
  >
}

export const ViaSchema = z.enum(['wa', 'dashboard', 'sistem'])
export type Via = z.infer<typeof ViaSchema>

export const JOB_KINDS = [
  'penilaian',
  'ringkasan',
  'asisten',
  'perintah',
  'retensi',
] as const
export type JobKind = (typeof JOB_KINDS)[number]
export const JobKindSchema = openEnum(JOB_KINDS)

export const JobStatusSchema = z.enum([
  'berjalan',
  'selesai',
  'gagal',
  'dihentikan',
])
export type JobStatus = z.infer<typeof JobStatusSchema>

export const StepActorSchema = z.enum(['model', 'kode'])
export const StepStatusSchema = z.enum(['ok', 'gagal', 'dihentikan'])
export type StepStatus = z.infer<typeof StepStatusSchema>

/** A record with exactly one entry per criterion. */
function perCriterion<T extends z.ZodType>(value: T) {
  return z.object({
    manajemen: value,
    kinerja: value,
    risiko: value,
    rencana: value,
    dampak: value,
  })
}

const TokensSchema = z.object({
  in: z.number().default(0),
  out: z.number().default(0),
})

const CitationSchema = z.object({ page: z.number().int(), quote: z.string() })

export const CriterionAssessmentSchema = z.object({
  value: z.number().int().min(1).max(5),
  reason: z.string(),
  notMentioned: z.boolean(),
  citations: z.array(CitationSchema).default([]),
  /** The value was capped at 2 because no quote could be verified on its page. */
  citationsUnverified: z.boolean().default(false),
})
export type CriterionAssessment = z.infer<typeof CriterionAssessmentSchema>

export const AssessmentSchema = z.object({
  // `dict[Criterion, …]` on the Python side: a criterion may be absent, and the
  // detail page shows it as missing rather than failing the whole read.
  criteria: z.partialRecord(CriterionSchema, CriterionAssessmentSchema),
  score: z.number().min(0).max(100),
  rulesVersion: z.number().int(),
  model: z.string(),
})

const FitCheckSchema = z.object({ passed: z.boolean(), reason: z.string() })

export const FitSchema = z.object({
  passed: z.boolean(),
  checks: z.object({
    sector: FitCheckSchema,
    stage: FitCheckSchema,
    funding: FitCheckSchema,
  }),
})

export const ProposalSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameLower: z.string(),
  source: z.object({
    kind: z.enum(['form', 'upload']),
    driveFileId: z.string().nullish(),
    gcsPath: z.string().nullish(),
    fileName: z.string(),
  }),
  founder: z
    .object({ name: z.string().nullish(), email: z.string().nullish() })
    .nullish(),
  consent: z.boolean(),
  status: ProposalStatusSchema,
  statusReason: z.string().nullish(),
  pageCount: z.number().int().default(0),
  profile: z
    .object({
      sector: z.string().nullish(),
      stage: z.string().nullish(),
      fundingAskIdr: z.number().nullish(),
      oneLiner: z.string().nullish(),
    })
    .nullish(),
  assessment: AssessmentSchema.nullish(),
  fit: FitSchema.nullish(),
  category: CategorySchema.nullish(),
  correction: z
    .object({
      category: CategorySchema,
      reason: z.string(),
      at: TimestampSchema,
      via: ViaSchema,
    })
    .nullish(),
  effectiveCategory: CategorySchema.nullish(),
  response: z
    .object({
      kind: ResponseKindSchema,
      at: TimestampSchema,
      via: ViaSchema,
      note: z.string().nullish(),
    })
    .nullish(),
  responded: z.boolean().default(false),
  tokens: TokensSchema.default({ in: 0, out: 0 }),
  jobId: z.string().nullish(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  assessedAt: TimestampSchema.nullish(),
})
export type Proposal = z.infer<typeof ProposalSchema>

/**
 * "Di luar fokus": the proposal failed at least one fit check (sector, stage,
 * funding). It never changes the grade, only the priority — derived from `fit`, as
 * the ringkasan in `services/api/aisa/digest.py` does, with no stored flag.
 */
export function isOutsideFocus(p: Pick<Proposal, 'fit'>): boolean {
  return p.fit?.passed === false
}

/**
 * An unanswered proposal the manager can decide on, as the ringkasan in
 * `services/api/aisa/digest.py` lists them: scored with a kategori, or flagged
 * for a manual check. One still queued or being scored has nothing to decide on.
 */
export function awaitsDecision(
  p: Pick<Proposal, 'status' | 'effectiveCategory' | 'responded'>,
): boolean {
  if (p.responded) return false
  return (
    (p.status === 'dinilai' && p.effectiveCategory != null) ||
    p.status === 'perlu_dicek_manual'
  )
}

/**
 * The lowest score of each grade above Tidak layak, strictly descending; a score below
 * `risikoTinggi` is Tidak layak.
 */
export const ThresholdsSchema = z.object({
  sangatLayak: z.number(),
  layakBersyarat: z.number(),
  perluPenyesuaian: z.number(),
  risikoTinggi: z.number(),
})
export type Thresholds = z.infer<typeof ThresholdsSchema>
/** Threshold keys, best grade first; `THRESHOLD_KEYS[i]` is the floor of `CATEGORIES[i]`. */
export const THRESHOLD_KEYS = [
  'sangatLayak',
  'layakBersyarat',
  'perluPenyesuaian',
  'risikoTinggi',
] as const satisfies readonly (keyof Thresholds)[]

/** The rubric levels of one criterion, lowest first: what earns a 1, 2, 3, 4 or 5. */
export const ANCHOR_LEVELS = ['1', '2', '3', '4', '5'] as const
export type AnchorLevel = (typeof ANCHOR_LEVELS)[number]

/**
 * One criterion's rubric. Levels 2 and 4 came later: a document stored with
 * only 1/3/5 still parses, with those two read as `''` so the dashboard can say
 * they are not defined yet rather than invent a text. aisa-api fills them from
 * its own defaults when it reads such a document; a save from the dashboard
 * must carry all five filled in.
 */
export const AnchorsSchema = z.object({
  '1': z.string(),
  '2': z.string().default(''),
  '3': z.string(),
  '4': z.string().default(''),
  '5': z.string(),
})
export type Anchors = z.infer<typeof AnchorsSchema>

export const RulesSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  weights: perCriterion(z.number()),
  anchors: perCriterion(AnchorsSchema),
  fit: z.object({
    sectors: z.array(z.string()),
    stages: z.array(z.string()),
    fundingMinIdr: z.number(),
    fundingMaxIdr: z.number(),
  }),
  thresholds: ThresholdsSchema,
  models: z.object({
    penilai: z.string(),
    ringkasan: z.string(),
    insight: z.string(),
    /**
     * The model the deployed Asisten engine runs. Informational: changing it
     * takes a redeploy of the Asisten, so the dashboard never edits it. A stored
     * `orchestrator` key from older documents is stripped by the parse.
     */
    asisten: z.string(),
  }),
  minCharsPerPage: z.number().int().default(200),
  /** Archived proposals are deleted this many days after archiving. */
  retentionDays: z.number().int().min(1).default(90),
  changedAt: TimestampSchema,
  reason: z.string(),
})
export type Rules = z.infer<typeof RulesSchema>
/** The editable body of `Rules` — what `PUT /api/rules` accepts. */
export type RulesInput = Omit<Rules, 'id' | 'version' | 'changedAt' | 'reason'>
/**
 * What the Pengaturan form edits: the PUT body minus the Asisten model, which
 * only a redeploy of the Asisten changes. The action fills it from the stored
 * rules, so the API always receives it unchanged.
 */
export type EditableRules = Omit<RulesInput, 'models'> & {
  models: Omit<RulesInput['models'], 'asisten'>
}

export const RuntimeSchema = z.object({
  id: z.string(),
  paused: z.boolean().default(false),
  pausedAt: TimestampSchema.nullish(),
  pausedVia: ViaSchema.nullish(),
})
export type Runtime = z.infer<typeof RuntimeSchema>

/**
 * The step a running job has started but not yet recorded under `steps`. The
 * API sets it before each step and clears it when the step is recorded or the
 * job ends, so a non-null value always names work still in progress.
 */
export const CurrentStepSchema = z.object({
  action: z.string(),
  tool: z.string(),
  actor: StepActorSchema,
  startedAt: TimestampSchema,
})
export type CurrentStep = z.infer<typeof CurrentStepSchema>

export const JobSchema = z.object({
  id: z.string(),
  kind: JobKindSchema,
  agent: z.string(),
  title: z.string(),
  model: z.string().nullish(),
  proposalId: z.string().nullish(),
  digestId: z.string().nullish(),
  status: JobStatusSchema,
  startedAt: TimestampSchema,
  endedAt: TimestampSchema.nullish(),
  durationMs: z.number().nullish(),
  stepCount: z.number().int().default(0),
  tokensIn: z.number().default(0),
  tokensOut: z.number().default(0),
  /** Absent on jobs written before the API recorded it: read as null. */
  currentStep: CurrentStepSchema.nullish(),
})
export type Job = z.infer<typeof JobSchema>

export const StepSchema = z.object({
  id: z.string(),
  seq: z.number().int(),
  at: TimestampSchema,
  action: z.string(),
  tool: z.string(),
  actor: StepActorSchema,
  model: z.string().nullish(),
  read: z.string().nullish(),
  wrote: z.string().nullish(),
  tokensIn: z.number().default(0),
  tokensOut: z.number().default(0),
  durationMs: z.number().default(0),
  status: StepStatusSchema.default('ok'),
  error: z.string().nullish(),
})
export type Step = z.infer<typeof StepSchema>

export const HISTORY_ACTIONS = [
  'tanggapan',
  'tanggapan_massal',
  'koreksi',
  'aturan_diubah',
  'stop',
  'lanjut',
  'ringkasan_terkirim',
  'proposal_masuk',
  'proposal_dihapus',
  'dinilai_ulang',
] as const
export type HistoryAction = (typeof HISTORY_ACTIONS)[number]
export const HistoryActionSchema = openEnum(HISTORY_ACTIONS)

/**
 * The `proposalName` `aisa-api` writes into a history row once its proposal is
 * deleted; the row stays as audit, but there is no proposal left to link to.
 */
export const DELETED_PROPOSAL_NAME = '(dihapus)'

export const HistorySchema = z.object({
  id: z.string(),
  at: TimestampSchema,
  via: ViaSchema,
  action: HistoryActionSchema,
  proposalId: z.string().nullish(),
  proposalName: z.string().nullish(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  reason: z.string().nullish(),
  detail: z.string(),
})
export type History = z.infer<typeof HistorySchema>

/** 09.00 is the daily ringkasan; 17.00 is always the weekly summary. */
export const DIGEST_PERIODS = ['harian', 'mingguan'] as const
export type DigestPeriod = (typeof DIGEST_PERIODS)[number]

/** WIB dates (YYYY-MM-DD): the Monday the week starts and the day it was sent. */
export const WeekRangeSchema = z.object({ start: z.string(), end: z.string() })

/**
 * Every number the weekly summary states, counted by `aisa-api`. "This week" is
 * Monday 00:00 WIB → send time; "last week" is the full Monday–Sunday before it.
 * `.loose()` keeps a field the API adds later instead of failing the read.
 */
export const WeeklyStatsSchema = z
  .object({
    proposalsIn: z.number(),
    proposalsInLastWeek: z.number(),
    topSectors: z
      .array(
        z.object({
          sector: z.string(),
          label: z.string(),
          count: z.number(),
          percent: z.number(),
        }),
      )
      .default([]),
    noSector: z.number().default(0),
    assessed: z.number().default(0),
    byCategory: z.record(z.string(), z.number()).default({}),
    good: z.number().default(0),
    outOfFocus: z.number().default(0),
    outOfFocusPercent: z.number().nullish(),
    avgScore: z.number().nullish(),
    avgScoreLastWeek: z.number().nullish(),
    setuju: z.number().default(0),
    tolak: z.number().default(0),
    waiting: z.number().default(0),
    oldestWaitingDays: z.number().nullish(),
    perluDicekManual: z.number().default(0),
  })
  .loose()
export type WeeklyStats = z.infer<typeof WeeklyStatsSchema>

export const DigestSchema = z.object({
  id: z.string(),
  slot: z.enum(['09.00', '17.00']),
  /** Absent on ringkasan written before the weekly summary existed: all daily. */
  period: z.enum(DIGEST_PERIODS).default('harian'),
  windowStart: TimestampSchema,
  sentAt: TimestampSchema,
  text: z.string(),
  // A ringkasan sent before the grade scale changed keeps its old count keys
  // (`sangat_cocok`, `kualitasLuarFokus`, …); `.loose()` keeps them instead of
  // failing the read, and the current keys default to 0 there.
  counts: z
    .object({
      sangat_layak: z.number().default(0),
      layak_bersyarat: z.number().default(0),
      perlu_penyesuaian: z.number().default(0),
      risiko_tinggi: z.number().default(0),
      tidak_layak: z.number().default(0),
      luarFokus: z.number().default(0),
      perluDicekManual: z.number().default(0),
      belumDitanggapi: z.number().default(0),
      baruMasuk: z.number().default(0),
    })
    .loose(),
  proposalIds: z.array(z.string()),
  usedTemplate: z.boolean(),
  /** The "Yang menarik" sentence the ringkasan carried, if one was written. */
  insight: z.string().nullish(),
  jobId: z.string().nullish(),
  gowaMessageIds: z.array(z.string()).default([]),
  week: WeekRangeSchema.nullish(),
  weekly: WeeklyStatsSchema.nullish(),
})
export type Digest = z.infer<typeof DigestSchema>

export const DailyStatsSchema = z.object({
  id: z.string(),
  date: z.string(),
  proposalsIn: z.number().default(0),
  byCategory: z.record(z.string(), z.number()).default({}),
  bySector: z.record(z.string(), z.number()).default({}),
  perluDicekManual: z.number().default(0),
  tokensIn: z.number().default(0),
  tokensOut: z.number().default(0),
  modelCalls: z.number().default(0),
  tokensByKind: z.record(z.string(), TokensSchema).default({}),
})
export type DailyStats = z.infer<typeof DailyStatsSchema>
