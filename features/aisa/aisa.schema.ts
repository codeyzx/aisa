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

export const CRITERIA = ['tim', 'pasar', 'produk', 'traksi', 'bisnis'] as const
export const CriterionSchema = z.enum(CRITERIA)
export type Criterion = z.infer<typeof CriterionSchema>

export const CATEGORIES = [
  'sangat_cocok',
  'cocok',
  'kurang_cocok',
  'tidak_cocok',
] as const
export const CategorySchema = z.enum(CATEGORIES)
export type Category = z.infer<typeof CategorySchema>

export const PROPOSAL_STATUSES = [
  'antre',
  'dinilai_proses',
  'dinilai',
  'perlu_dicek_manual',
  'dihentikan',
] as const
export const ProposalStatusSchema = z.enum(PROPOSAL_STATUSES)
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>

export const RESPONSE_KINDS = ['undang', 'pantau', 'arsipkan'] as const
export const ResponseKindSchema = z.enum(RESPONSE_KINDS)
export type ResponseKind = z.infer<typeof ResponseKindSchema>

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
    tim: value,
    pasar: value,
    produk: value,
    traksi: value,
    bisnis: value,
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
  qualityOutsideFocus: z.boolean().default(false),
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
 * The "Berkualitas, di luar fokus" mark as the manager sees it: the stored flag only counts
 * while the effective kategori is still Tidak cocok. A kategori correction keeps the flag
 * (the AI result is never rewritten) but the mark no longer describes the proposal. The
 * ringkasan in `services/api/aisa/digest.py` applies the same rule.
 */
export function showsQualityOutsideFocus(
  p: Pick<Proposal, 'qualityOutsideFocus' | 'effectiveCategory'>,
): boolean {
  return p.qualityOutsideFocus && p.effectiveCategory === 'tidak_cocok'
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

export const RulesSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  weights: perCriterion(z.number()),
  anchors: perCriterion(
    z.object({ '1': z.string(), '3': z.string(), '5': z.string() }),
  ),
  fit: z.object({
    sectors: z.array(z.string()),
    stages: z.array(z.string()),
    fundingMinIdr: z.number(),
    fundingMaxIdr: z.number(),
  }),
  thresholds: z.object({
    sangatCocok: z.number(),
    cocok: z.number(),
    kurangCocok: z.number(),
    qualityOutsideFocus: z.number(),
  }),
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

export const DigestSchema = z.object({
  id: z.string(),
  slot: z.enum(['09.00', '17.00']),
  windowStart: TimestampSchema,
  sentAt: TimestampSchema,
  text: z.string(),
  counts: z.object({
    sangat_cocok: z.number().default(0),
    cocok: z.number().default(0),
    kurang_cocok: z.number().default(0),
    tidak_cocok: z.number().default(0),
    kualitasLuarFokus: z.number().default(0),
    perluDicekManual: z.number().default(0),
    belumDitanggapi: z.number().default(0),
    baruMasuk: z.number().default(0),
  }),
  proposalIds: z.array(z.string()),
  usedTemplate: z.boolean(),
  /** The "Yang menarik" sentence the ringkasan carried, if one was written. */
  insight: z.string().nullish(),
  jobId: z.string().nullish(),
  gowaMessageIds: z.array(z.string()).default([]),
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
