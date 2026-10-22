// A read-only mirror of how `services/api/aisa/digest.py` counts and words the
// weekly summary (`weekly_stats` + `weekly_template`), so Pengaturan can preview
// the Friday 17.00 message from the proposals stored right now. The "Yang
// menarik" insight is added by aisa-api at send time and is not reproduced
// here; the Ringkasan agent may also reword the draft, keeping every name and
// number.

import { CATEGORY_LABEL, sectorLabel } from '@/features/aisa/aisa.labels'
import {
  CATEGORIES,
  isOutsideFocus,
  type Category,
  type Proposal,
} from '@/features/aisa/aisa.schema'
import { MANAGER_SALUTATION } from '@/lib/app-config'

import { fmtScore, OUT_OF_FOCUS_MARK } from './digest-preview'

const TOP_SECTORS = 3
const TOP_PROPOSALS = 3
const DAY_MS = 86_400_000
/** WIB is UTC+7 all year (no daylight saving). */
const WIB_OFFSET_MS = 7 * 3_600_000

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]

/** `week_start`: Monday 00:00 WIB of the week `now` falls in. */
export function weekStart(now: Date): Date {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS)
  const sinceMonday = (wib.getUTCDay() + 6) % 7
  const midnight = Date.UTC(
    wib.getUTCFullYear(),
    wib.getUTCMonth(),
    wib.getUTCDate(),
  )
  return new Date(midnight - sinceMonday * DAY_MS - WIB_OFFSET_MS)
}

/** `percent`: n of total as a whole percent, half rounded up (1 of 8 → 13). */
export function percent(n: number, total: number): number {
  return Math.floor((n * 200 + total) / (2 * total))
}

const wibParts = (date: Date) => {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS)
  return {
    day: wib.getUTCDate(),
    month: wib.getUTCMonth(),
    year: wib.getUTCFullYear(),
  }
}

/** `fmt_range`: "19–23 Oktober 2026", "26 Oktober – 1 November 2026". */
export function fmtRange(start: Date, end: Date): string {
  const a = wibParts(start)
  const b = wibParts(end)
  const tail = `${b.day} ${MONTHS[b.month]} ${b.year}`
  if (a.year === b.year && a.month === b.month && a.day === b.day) return tail
  if (a.year === b.year && a.month === b.month) return `${a.day}–${tail}`
  if (a.year === b.year) return `${a.day} ${MONTHS[a.month]} – ${tail}`
  return `${a.day} ${MONTHS[a.month]} ${a.year} – ${tail}`
}

/** `greeting`: by the WIB hour the message is sent. */
export function greetingAt(at: Date): string {
  const hour = new Date(at.getTime() + WIB_OFFSET_MS).getUTCHours()
  if (hour < 11) return 'Selamat pagi'
  if (hour < 15) return 'Selamat siang'
  if (hour < 18) return 'Selamat sore'
  return 'Selamat malam'
}

interface Row {
  name: string
  at: Date
  status: Proposal['status']
  sector: string | null
  /** Effective grade, only for an assessed proposal. */
  category: Category | null
  score: number | null
  outOfFocus: boolean
  responded: boolean
  responseKind: string | null
  responseAt: Date | null
}

function rowOf(p: Proposal): Row {
  const dinilai = p.status === 'dinilai'
  return {
    name: p.name,
    at: p.createdAt,
    status: p.status,
    sector: p.profile?.sector ?? null,
    category: dinilai ? (p.effectiveCategory ?? null) : null,
    score: dinilai ? (p.assessment?.score ?? null) : null,
    outOfFocus: dinilai && isOutsideFocus(p),
    responded: p.responded,
    responseKind: p.response?.kind ?? null,
    responseAt: p.response?.at ?? null,
  }
}

const isAssessed = (r: Row) => r.status === 'dinilai' && r.category !== null
const isWaiting = (r: Row) =>
  !r.responded && (isAssessed(r) || r.status === 'perlu_dicek_manual')

/** `_avg`: one decimal. */
function avg(rows: Row[]): number | null {
  const scores = rows.flatMap((r) => (r.score === null ? [] : [r.score]))
  if (!scores.length) return null
  return (
    Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
  )
}

export interface WeeklyPreview {
  start: Date
  at: Date
  proposalsIn: number
  proposalsInLastWeek: number
  topSectors: { label: string; count: number; percent: number }[]
  noSector: number
  assessed: number
  byCategory: Record<Category, number>
  good: number
  outOfFocus: number
  outOfFocusPercent: number | null
  avgScore: number | null
  avgScoreLastWeek: number | null
  setuju: number
  tolak: number
  waiting: number
  oldestWaitingDays: number | null
  perluDicekManual: number
  top: {
    name: string
    category: Category
    score: number
    outOfFocus: boolean
  }[]
}

/**
 * `weekly_stats` over `proposals`. Python reads every proposal; the caller may
 * pass fewer as long as it includes every one created since the previous
 * Monday, every one decided this week, and every one still waiting — the only
 * proposals any number here counts. A proposal passed twice counts once.
 */
export function buildWeeklyPreview(
  proposals: readonly Proposal[],
  now: Date,
): WeeklyPreview {
  const rows = [...new Map(proposals.map((p) => [p.id, rowOf(p)])).values()]
  const start = weekStart(now)
  const lastStart = new Date(start.getTime() - 7 * DAY_MS)
  const thisWeek = rows.filter((r) => r.at >= start && r.at <= now)
  const lastWeek = rows.filter((r) => r.at >= lastStart && r.at < start)

  const per = new Map<string, number>()
  let noSector = 0
  for (const r of thisWeek) {
    const key = (r.sector ?? '').trim().toLowerCase()
    if (key) per.set(key, (per.get(key) ?? 0) + 1)
    else noSector += 1
  }
  const topSectors = [...per.entries()]
    .toSorted(
      ([a, n], [b, m]) =>
        m - n ||
        (sectorLabel(a) < sectorLabel(b)
          ? -1
          : sectorLabel(a) > sectorLabel(b)
            ? 1
            : 0),
    )
    .slice(0, TOP_SECTORS)
    .map(([key, count]) => ({
      label: sectorLabel(key),
      count,
      percent: percent(count, thisWeek.length),
    }))

  const assessed = thisWeek.filter(isAssessed)
  const byCategory = Object.fromEntries(
    CATEGORIES.map((c) => [c, assessed.filter((r) => r.category === c).length]),
  ) as Record<Category, number>
  const outOfFocus = assessed.filter((r) => r.outOfFocus).length
  const decided = rows.filter(
    (r) => r.responseAt && r.responseAt >= start && r.responseAt <= now,
  )
  const waiting = rows.filter(isWaiting)
  const ages = waiting.map((r) =>
    Math.floor((now.getTime() - r.at.getTime()) / DAY_MS),
  )
  const top = assessed
    .toSorted(
      (a, b) =>
        CATEGORIES.indexOf(a.category!) - CATEGORIES.indexOf(b.category!) ||
        Number(a.outOfFocus) - Number(b.outOfFocus) ||
        (b.score ?? 0) - (a.score ?? 0),
    )
    .slice(0, TOP_PROPOSALS)
    .map((r) => ({
      name: r.name,
      category: r.category!,
      score: r.score ?? 0,
      outOfFocus: r.outOfFocus,
    }))

  return {
    start,
    at: now,
    proposalsIn: thisWeek.length,
    proposalsInLastWeek: lastWeek.length,
    topSectors,
    noSector,
    assessed: assessed.length,
    byCategory,
    good: byCategory.sangat_layak + byCategory.layak_bersyarat,
    outOfFocus,
    outOfFocusPercent: assessed.length
      ? percent(outOfFocus, assessed.length)
      : null,
    avgScore: avg(assessed),
    avgScoreLastWeek: avg(lastWeek.filter(isAssessed)),
    setuju: decided.filter((r) => r.responseKind === 'setuju').length,
    tolak: decided.filter((r) => r.responseKind === 'tolak').length,
    waiting: waiting.length,
    oldestWaitingDays: ages.length ? Math.max(...ages) : null,
    perluDicekManual: thisWeek.filter((r) => r.status === 'perlu_dicek_manual')
      .length,
    top,
  }
}

/** `_change`: "sama", "naik 3", "turun 1,5". */
function change(
  now: number,
  before: number,
  fmt: (n: number) => string = String,
): string {
  if (now === before) return 'sama'
  return `${now > before ? 'naik' : 'turun'} ${fmt(Math.abs(now - before))}`
}

/**
 * `weekly_template` without the insight, one string per line. `greeting` is
 * by the hour it is sent; the preview passes the scheduled 17.00's.
 */
export function weeklyLines(
  st: WeeklyPreview,
  greeting = greetingAt(st.at),
): string[] {
  const lines = [
    `${greeting}, ${MANAGER_SALUTATION}. Ini ringkasan mingguan AISA, ${fmtRange(st.start, st.at)}.`,
  ]
  lines.push(
    `*Proposal masuk*: ${st.proposalsIn} (minggu lalu ${st.proposalsInLastWeek}, ${change(st.proposalsIn, st.proposalsInLastWeek)})`,
  )
  if (st.topSectors.length) {
    const parts = st.topSectors.map(
      (s) => `${s.label} ${s.percent}% (${s.count} dari ${st.proposalsIn})`,
    )
    if (st.noSector) parts.push(`tanpa sektor ${st.noSector}`)
    lines.push(`*Sektor*: ${parts.join(' · ')}`)
  } else {
    lines.push(
      `*Sektor*: ${st.proposalsIn ? `tanpa sektor ${st.noSector}` : 'belum ada proposal masuk'}`,
    )
  }
  if (st.assessed) {
    const grades = CATEGORIES.map(
      (c) => `${CATEGORY_LABEL[c]} ${st.byCategory[c]}`,
    ).join(' · ')
    lines.push(`*Grade* (${st.assessed} dinilai): ${grades}`)
    lines.push(
      `Sangat layak + Layak bersyarat: ${st.good} · di luar fokus: ${st.outOfFocusPercent}% (${st.outOfFocus} dari ${st.assessed})`,
    )
  } else {
    lines.push('*Grade*: belum ada yang dinilai')
  }
  if (st.avgScore === null) {
    lines.push('*Rata-rata skor*: belum ada yang dinilai')
  } else if (st.avgScoreLastWeek === null) {
    lines.push(
      `*Rata-rata skor*: ${fmtScore(st.avgScore)} (minggu lalu belum ada)`,
    )
  } else {
    const delta = change(st.avgScore, st.avgScoreLastWeek, (x) =>
      fmtScore(Math.round(x * 10) / 10),
    )
    lines.push(
      `*Rata-rata skor*: ${fmtScore(st.avgScore)} (minggu lalu ${fmtScore(st.avgScoreLastWeek)}, ${delta})`,
    )
  }
  lines.push(`*Keputusan minggu ini*: Setuju ${st.setuju} · Tolak ${st.tolak}`)
  lines.push(
    `Menunggu keputusan: ${st.waiting}` +
      (st.oldestWaitingDays === null
        ? ''
        : ` (terlama ${st.oldestWaitingDays} hari)`),
  )
  if (st.top.length) {
    lines.push('*Top 3 minggu ini*')
    st.top.forEach((r, i) =>
      lines.push(
        `${i + 1}. ${r.name} · ${CATEGORY_LABEL[r.category]} · ${fmtScore(r.score)}` +
          (r.outOfFocus ? ` ${OUT_OF_FOCUS_MARK}` : ''),
      ),
    )
  } else {
    lines.push('*Top 3 minggu ini*: belum ada')
  }
  lines.push(`*Perlu dicek manual*: ${st.perluDicekManual}`)
  return lines
}
