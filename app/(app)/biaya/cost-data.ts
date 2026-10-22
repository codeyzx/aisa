import {
  ratesOn,
  type TokenCost,
  tokenCost,
  type TokenCount,
} from '@/features/aisa/aisa.pricing'
import type { DailyStats, Job, Rules } from '@/features/aisa/aisa.schema'

import {
  dailyWindow,
  dayLabel,
  daysBetween,
  fullDayLabel,
  todayIso,
  trimLeadingEmpty,
  wibIsoDate,
} from '../_components/daily-window'

/** The job kinds that call a model, in the order the page lists them. */
export const PRICED_KINDS = ['penilaian', 'ringkasan', 'asisten'] as const
export type PricedKind = (typeof PRICED_KINDS)[number]

/** The `agent` name each kind's jobs carry, and what that agent does. */
export const KIND_AGENT: Record<PricedKind, { agent: string; does: string }> = {
  penilaian: { agent: 'Penilai', does: 'Membaca dan menilai proposal' },
  ringkasan: {
    agent: 'Pembuat ringkasan',
    does: 'Ringkasan WhatsApp harian 09.00 dan mingguan Jumat 17.00, termasuk insight-nya',
  },
  asisten: { agent: 'Asisten', does: 'Menjawab pertanyaan manajer' },
}

/**
 * Which configured model(s) spend a kind's tokens. `dailyStats` counts tokens
 * per kind but not per model, so a day is priced with the model the rules name
 * for that agent now. The ringkasan job also writes the insight, so both models
 * must share one tariff for its tokens to have a price.
 */
const KIND_MODELS: Record<PricedKind, (models: Rules['models']) => string[]> = {
  penilaian: (m) => [m.penilai],
  ringkasan: (m) => [m.ringkasan, m.insight],
  asisten: (m) => [m.asisten],
}

/** How many trailing days the proposal pace for the calculator is read over. */
export const PACE_DAYS = 30
/**
 * The daily chart reads at most this many days, newest last, and starts at the
 * first of them with a cost.
 */
export const CHART_DAYS = 60

const ZERO_COST: TokenCost = { inputUsd: 0, outputUsd: 0, usd: 0 }

const addCost = (a: TokenCost, b: TokenCost): TokenCost => ({
  inputUsd: a.inputUsd + b.inputUsd,
  outputUsd: a.outputUsd + b.outputUsd,
  usd: a.usd + b.usd,
})

const addTokens = (a: TokenCount, b: TokenCount): TokenCount => ({
  in: a.in + b.in,
  out: a.out + b.out,
})

function kindCost(
  kind: PricedKind,
  tokens: TokenCount,
  models: Rules['models'] | null,
  isoDate: string,
): TokenCost | null {
  if (!models) return null
  const rates = KIND_MODELS[kind](models).map((model) =>
    ratesOn(model, isoDate),
  )
  const [first] = rates
  if (
    !first ||
    rates.some(
      (r) => !r || r.input !== first.input || r.output !== first.output,
    )
  )
    return null
  return tokenCost(tokens, first)
}

export interface KindUsage {
  kind: PricedKind
  tokens: TokenCount
  /** `null` when any of its days had no tariff for the configured model. */
  cost: TokenCost | null
}

export type CostDay = {
  date: string
  label: string
  full: string
  usd: number
} & Record<PricedKind, number>

/** One unit of work (an assessed proposal, a question, a ringkasan), averaged. */
export interface UnitCost {
  /** How many units the average is over. */
  n: number
  /** Mean tokens per unit. */
  tokens: TokenCount
  /** Mean cost per unit, each job priced on its own date and model. */
  usd: number
  /** The model the newest unit ran on, for pricing the mean at another tariff. */
  model: string
}

export interface CostData {
  /** The first WIB date `dailyStats` holds; `null` before anything ran. */
  firstDate: string | null
  /** True when the read hit its row limit, so older days may exist. */
  truncated: boolean
  tokens: TokenCount
  modelCalls: number
  /** The priced share of `tokens`, summed day by day at each day's tariff. */
  cost: TokenCost
  /** Tokens with no tariff: an unknown model, or a kind no agent maps to. */
  unpricedTokens: number
  kinds: KindUsage[]
  daily: CostDay[]
  units: Record<PricedKind, UnitCost | null>
  jobsRead: number
  /** Proposals that came in over the pace window, scaled to 30 days. */
  pace: { perMonth: number; days: number }
}

function sumTokens(jobs: readonly Job[]): TokenCount {
  return jobs.reduce<TokenCount>(
    (t, job) => ({ in: t.in + job.tokensIn, out: t.out + job.tokensOut }),
    { in: 0, out: 0 },
  )
}

function jobCost(job: Job): TokenCost | null {
  const rates = ratesOn(job.model, wibIsoDate(job.startedAt))
  return rates
    ? tokenCost({ in: job.tokensIn, out: job.tokensOut }, rates)
    : null
}

/** Mean over groups of jobs; a group with any unpriced job is left out. */
function unitCost(groups: readonly (readonly Job[])[]): UnitCost | null {
  const priced = groups.filter(
    (group) => group.length > 0 && group.every((job) => jobCost(job)),
  )
  const newest = priced
    .flat()
    .toSorted((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0]
  if (!newest?.model) return null
  const n = priced.length
  const tokens = sumTokens(priced.flat())
  const usd = priced
    .flat()
    .reduce((total, job) => total + (jobCost(job)?.usd ?? 0), 0)
  return {
    n,
    tokens: { in: tokens.in / n, out: tokens.out / n },
    usd: usd / n,
    model: newest.model,
  }
}

const spent = (job: Job) => job.tokensIn + job.tokensOut > 0

/**
 * Per-unit averages from `jobs`. Penilaian jobs are grouped by proposal, so a
 * proposal assessed twice (after a STOP, say) counts its whole cost once.
 */
export function unitCosts(
  jobs: readonly Job[],
): Record<PricedKind, UnitCost | null> {
  const ofKind = (kind: PricedKind) =>
    jobs.filter((job) => job.kind === kind && spent(job))
  const byProposal = new Map<string, Job[]>()
  for (const job of ofKind('penilaian')) {
    if (!job.proposalId) continue
    byProposal.set(job.proposalId, [
      ...(byProposal.get(job.proposalId) ?? []),
      job,
    ])
  }
  return {
    penilaian: unitCost([...byProposal.values()]),
    ringkasan: unitCost(ofKind('ringkasan').map((job) => [job])),
    asisten: unitCost(ofKind('asisten').map((job) => [job])),
  }
}

/** Price a unit's mean tokens at the tariff in force on `isoDate`. */
export function unitUsdOn(unit: UnitCost, isoDate: string): number | null {
  const rates = ratesOn(unit.model, isoDate)
  return rates ? tokenCost(unit.tokens, rates).usd : null
}

export function costData({
  stats,
  limit,
  models,
  jobs,
  now = new Date(),
}: {
  /** `listDailyStats(limit)`: oldest first. */
  stats: readonly DailyStats[]
  limit: number
  models: Rules['models'] | null
  jobs: readonly Job[]
  now?: Date
}): CostData {
  let tokens: TokenCount = { in: 0, out: 0 }
  let cost = ZERO_COST
  let unpricedTokens = 0
  let modelCalls = 0
  const kinds = new Map<PricedKind, KindUsage>(
    PRICED_KINDS.map((kind) => [
      kind,
      { kind, tokens: { in: 0, out: 0 }, cost: ZERO_COST },
    ]),
  )
  const dayUsd = new Map<string, Record<PricedKind, number>>()

  for (const row of stats) {
    tokens = addTokens(tokens, { in: row.tokensIn, out: row.tokensOut })
    modelCalls += row.modelCalls
    const perKind = { penilaian: 0, ringkasan: 0, asisten: 0 }
    let attributed = 0
    for (const kind of PRICED_KINDS) {
      const t = row.tokensByKind[kind]
      if (!t) continue
      attributed += t.in + t.out
      const usage = kinds.get(kind) as KindUsage
      usage.tokens = addTokens(usage.tokens, t)
      const c = kindCost(kind, t, models, row.date)
      if (c) {
        cost = addCost(cost, c)
        perKind[kind] = c.usd
        if (usage.cost) usage.cost = addCost(usage.cost, c)
      } else {
        unpricedTokens += t.in + t.out
        if (t.in + t.out > 0) usage.cost = null
      }
    }
    // Tokens of a kind this build does not price (or a row older than the
    // per-kind split) are counted, never priced as something they are not.
    unpricedTokens += Math.max(0, row.tokensIn + row.tokensOut - attributed)
    dayUsd.set(row.date, perKind)
  }

  const firstDate = stats[0]?.date ?? null
  const today = todayIso(now)
  const span = firstDate ? daysBetween(firstDate, today) + 1 : 0
  const chartDays = dailyWindow(
    [...stats],
    Math.min(CHART_DAYS, span),
    now,
  ).map(({ date }) => {
    const perKind = dayUsd.get(date) ?? {
      penilaian: 0,
      ringkasan: 0,
      asisten: 0,
    }
    return {
      date,
      label: dayLabel(date),
      full: fullDayLabel(date),
      usd: perKind.penilaian + perKind.ringkasan + perKind.asisten,
      penilaian: perKind.penilaian,
      ringkasan: perKind.ringkasan,
      asisten: perKind.asisten,
    }
  })
  const daily = trimLeadingEmpty(chartDays, (day) =>
    PRICED_KINDS.every((kind) => day[kind] <= 0),
  )

  const paceDays = Math.min(PACE_DAYS, span)
  const paceSince = dailyWindow([...stats], paceDays, now)
  const paceIn = paceSince.reduce(
    (total, d) => total + (d.stats?.proposalsIn ?? 0),
    0,
  )

  return {
    firstDate,
    truncated: stats.length >= limit,
    tokens,
    modelCalls,
    cost,
    unpricedTokens,
    kinds: [...kinds.values()],
    daily,
    units: unitCosts(jobs),
    jobsRead: jobs.length,
    pace: {
      perMonth: paceDays ? Math.round((paceIn / paceDays) * 30) : 0,
      days: paceDays,
    },
  }
}
