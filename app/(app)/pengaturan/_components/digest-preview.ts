// A read-only mirror of how `services/api/aisa/digest.py` composes the
// ringkasan body (`collect` + `template`), so Pengaturan can preview what the
// next one would list from the proposals that are unanswered right now. The
// opening sentence (greeting, the manager's name, the count since the last
// ringkasan) and the "Yang menarik" insight are added by aisa-api at send time
// and are not reproduced here; the Ringkasan agent may also reword the draft,
// keeping every name and number.

import { CATEGORY_LABEL } from '@/features/aisa/aisa.labels'
import {
  CATEGORIES,
  CRITERIA,
  type Category,
  isOutsideFocus,
  type Proposal,
} from '@/features/aisa/aisa.schema'

export const SANGAT_DETAIL_MAX = 10
/** Per grade named inline (Layak bersyarat, Perlu penyesuaian). */
export const INLINE_MAX = 15
export const MANUAL_MAX = 15
/** The two grades named inline, by name and score. */
export const INLINE_GRADES = ['layak_bersyarat', 'perlu_penyesuaian'] as const
/** The two lowest grades, counted only. */
export const COUNTED_GRADES = ['risiko_tinggi', 'tidak_layak'] as const
export const OUT_OF_FOCUS_MARK = '(di luar fokus)'

/** `fmt_score`: one decimal, trailing zero dropped, comma — 72,4 / 80. */
export function fmtScore(score: number): string {
  return score.toFixed(1).replace(/\.0$/, '').replace('.', ',')
}

/** `format_idr`: Rp5 M, Rp1,5 M, Rp750 jt. */
export function formatIdr(amount: number): string {
  if (amount >= 1_000_000_000) {
    const s = (amount / 1_000_000_000).toFixed(1).replace(/\.0$/, '')
    return `Rp${s.replace('.', ',')} M`
  }
  if (amount >= 1_000_000) return `Rp${Math.floor(amount / 1_000_000)} jt`
  return `Rp${amount}`
}

export interface DigestItem {
  id: string
  name: string
  score: number
  sector: string | null
  fundingAskIdr: number | null
  /** The highest-valued criterion's reason, else the one-liner. */
  why: string | null
  /** Failed a fit check: named with "(di luar fokus)", never a different grade. */
  outOfFocus: boolean
}

export interface DigestPreview {
  groups: Record<Category, DigestItem[]>
  manual: { id: string; name: string }[]
  /** `belum`: every grouped proposal plus the manual ones. */
  pending: number
  /** `luar_fokus`: grouped proposals that are out of focus. */
  outOfFocus: number
}

function item(p: Proposal): DigestItem {
  const criteria = p.assessment?.criteria ?? {}
  const top = CRITERIA.flatMap((c) => (criteria[c] ? [criteria[c]] : []))
    .toSorted((a, b) => b.value - a.value)
    .at(0)
  return {
    id: p.id,
    name: p.name,
    score: p.assessment?.score ?? 0,
    sector: p.profile?.sector ?? null,
    fundingAskIdr: p.profile?.fundingAskIdr ?? null,
    why: (top ? top.reason : p.profile?.oneLiner) || null,
    outOfFocus: isOutsideFocus(p),
  }
}

/** `rank_key`: in focus before out of focus, then the higher score. */
const rank = (a: DigestItem, b: DigestItem) =>
  Number(a.outOfFocus) - Number(b.outOfFocus) || b.score - a.score

/** Group unanswered proposals the way `collect` does. */
export function buildDigestPreview(
  unresponded: readonly Proposal[],
): DigestPreview {
  const groups = Object.fromEntries(
    CATEGORIES.map((c) => [c, [] as DigestItem[]]),
  ) as Record<Category, DigestItem[]>
  const manual: { id: string; name: string }[] = []
  for (const p of unresponded) {
    if (p.responded) continue
    if (p.status === 'dinilai' && p.effectiveCategory) {
      groups[p.effectiveCategory].push(item(p))
    } else if (p.status === 'perlu_dicek_manual') {
      manual.push({ id: p.id, name: p.name })
    }
  }
  for (const list of Object.values(groups)) list.sort(rank)
  const grouped = Object.values(groups).flat()
  return {
    groups,
    manual,
    pending: grouped.length + manual.length,
    outOfFocus: grouped.filter((it) => it.outOfFocus).length,
  }
}

const mark = (it: DigestItem) => (it.outOfFocus ? ` ${OUT_OF_FOCUS_MARK}` : '')

/** The `template` body lines after the opening, without the insight. */
export function digestLines(d: DigestPreview): string[] {
  const lines: string[] = []
  const sangat = d.groups.sangat_layak
  lines.push(`*${CATEGORY_LABEL.sangat_layak} (${sangat.length})*`)
  sangat.slice(0, SANGAT_DETAIL_MAX).forEach((it, i) => {
    const meta = [
      it.sector,
      it.fundingAskIdr ? formatIdr(it.fundingAskIdr) : null,
    ]
      .filter(Boolean)
      .join(', ')
    lines.push(
      `${i + 1}. ${it.name}${meta ? ` (${meta})` : ''} · ${fmtScore(it.score)}${mark(it)}.` +
        (it.why ? ` ${it.why}` : ''),
    )
  })
  if (sangat.length > SANGAT_DETAIL_MAX)
    lines.push(`…dan ${sangat.length - SANGAT_DETAIL_MAX} lainnya`)
  for (const grade of INLINE_GRADES) {
    const items = d.groups[grade]
    const inline = items
      .slice(0, INLINE_MAX)
      .map((it) => `${it.name} (${fmtScore(it.score)})${mark(it)}`)
      .join(', ')
    const more =
      items.length > INLINE_MAX
        ? `, dan ${items.length - INLINE_MAX} lainnya`
        : ''
    lines.push(
      `*${CATEGORY_LABEL[grade]} (${items.length})*` +
        (items.length ? `: ${inline}${more}` : ''),
    )
  }
  for (const grade of COUNTED_GRADES)
    lines.push(`*${CATEGORY_LABEL[grade]} (${d.groups[grade].length})*`)
  if (d.outOfFocus)
    lines.push(
      `${d.outOfFocus} di antaranya di luar fokus (sektor, tahap, atau dana): prioritas rendah.`,
    )
  if (d.manual.length) {
    const m = d.manual
      .slice(0, MANUAL_MAX)
      .map((it) => it.name)
      .join(', ')
    const moreManual =
      d.manual.length > MANUAL_MAX
        ? `, dan ${d.manual.length - MANUAL_MAX} lainnya`
        : ''
    lines.push(`*Perlu dicek manual (${d.manual.length})*: ${m}${moreManual}`)
  }
  return lines
}
