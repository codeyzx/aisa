// A read-only mirror of how `services/api/aisa/digest.py` composes the
// ringkasan body (`collect` + `template`), so Pengaturan can preview what the
// next one would list from the proposals that are unanswered right now. The
// opening sentence (greeting, the manager's name, the count since the last
// ringkasan) and the "Yang menarik" insight are added by aisa-api at send time
// and are not reproduced here; the Ringkasan agent may also reword the draft,
// keeping every name and number.

import {
  CATEGORIES,
  CRITERIA,
  type Category,
  type Proposal,
} from '@/features/aisa/aisa.schema'

export const SANGAT_DETAIL_MAX = 10
export const COCOK_INLINE_MAX = 15
export const QOF_MAX = 10
export const MANUAL_MAX = 15

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

const FIT_LABEL = { sector: 'sektor', stage: 'tahap', funding: 'dana' } as const
const NOT_MENTIONED = 'tidak disebut'

export interface DigestItem {
  id: string
  name: string
  score: number
  sector: string | null
  fundingAskIdr: number | null
  /** The highest-valued criterion's reason, else the one-liner. */
  why: string | null
  /** Failed fit checks, for the "Berkualitas, di luar fokus" line. */
  fitReasons: string[]
}

export interface DigestPreview {
  groups: Record<Category, DigestItem[]>
  qualityOutsideFocus: DigestItem[]
  manual: { id: string; name: string }[]
  /** `belum`: every grouped proposal plus the manual ones. */
  pending: number
}

function item(p: Proposal): DigestItem {
  const criteria = p.assessment?.criteria ?? {}
  const top = CRITERIA.flatMap((c) => (criteria[c] ? [criteria[c]] : []))
    .toSorted((a, b) => b.value - a.value)
    .at(0)
  const fit = p.fit
  const fitReasons = fit
    ? (Object.keys(FIT_LABEL) as (keyof typeof FIT_LABEL)[])
        .filter((k) => !fit.checks[k].passed)
        .map((k) =>
          fit.checks[k].reason === NOT_MENTIONED
            ? `${FIT_LABEL[k]} ${NOT_MENTIONED}`
            : fit.checks[k].reason,
        )
    : []
  return {
    id: p.id,
    name: p.name,
    score: p.assessment?.score ?? 0,
    sector: p.profile?.sector ?? null,
    fundingAskIdr: p.profile?.fundingAskIdr ?? null,
    why: (top ? top.reason : p.profile?.oneLiner) || null,
    fitReasons,
  }
}

/** Group unanswered proposals the way `collect` does. */
export function buildDigestPreview(
  unresponded: readonly Proposal[],
): DigestPreview {
  const groups = Object.fromEntries(
    CATEGORIES.map((c) => [c, [] as DigestItem[]]),
  ) as Record<Category, DigestItem[]>
  const qualityOutsideFocus: DigestItem[] = []
  const manual: { id: string; name: string }[] = []
  for (const p of unresponded) {
    if (p.responded) continue
    if (p.status === 'dinilai' && p.effectiveCategory) {
      const it = item(p)
      groups[p.effectiveCategory].push(it)
      if (p.qualityOutsideFocus && p.effectiveCategory === 'tidak_cocok')
        qualityOutsideFocus.push(it)
    } else if (p.status === 'perlu_dicek_manual') {
      manual.push({ id: p.id, name: p.name })
    }
  }
  for (const list of Object.values(groups))
    list.sort((a, b) => b.score - a.score)
  qualityOutsideFocus.sort((a, b) => b.score - a.score)
  const pending =
    Object.values(groups).reduce((n, list) => n + list.length, 0) +
    manual.length
  return { groups, qualityOutsideFocus, manual, pending }
}

/** The `template` body lines after the opening, without the insight. */
export function digestLines(d: DigestPreview): string[] {
  const lines: string[] = []
  const sangat = d.groups.sangat_cocok
  lines.push(`*Sangat cocok (${sangat.length})*`)
  sangat.slice(0, SANGAT_DETAIL_MAX).forEach((it, i) => {
    const meta = [
      it.sector,
      it.fundingAskIdr ? formatIdr(it.fundingAskIdr) : null,
    ]
      .filter(Boolean)
      .join(', ')
    lines.push(
      `${i + 1}. ${it.name}${meta ? ` (${meta})` : ''} · ${fmtScore(it.score)}.` +
        (it.why ? ` ${it.why}` : ''),
    )
  })
  if (sangat.length > SANGAT_DETAIL_MAX)
    lines.push(`…dan ${sangat.length - SANGAT_DETAIL_MAX} lainnya`)
  const cocok = d.groups.cocok
  const inline = cocok
    .slice(0, COCOK_INLINE_MAX)
    .map((it) => `${it.name} (${fmtScore(it.score)})`)
    .join(', ')
  const more =
    cocok.length > COCOK_INLINE_MAX
      ? `, dan ${cocok.length - COCOK_INLINE_MAX} lainnya`
      : ''
  lines.push(
    `*Cocok (${cocok.length})*` + (cocok.length ? `: ${inline}${more}` : ''),
  )
  lines.push(`*Kurang cocok (${d.groups.kurang_cocok.length})*`)
  lines.push(`*Tidak cocok (${d.groups.tidak_cocok.length})*`)
  if (d.qualityOutsideFocus.length) {
    const q = d.qualityOutsideFocus
      .slice(0, QOF_MAX)
      .map((it) => {
        const why = it.fitReasons.join(', ') || it.sector
        return `${it.name} (${fmtScore(it.score)})` + (why ? ` · ${why}` : '')
      })
      .join('; ')
    lines.push(
      `*Berkualitas, di luar fokus (${d.qualityOutsideFocus.length})*: ${q}`,
    )
  }
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
