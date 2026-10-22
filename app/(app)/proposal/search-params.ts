import {
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  type inferParserType,
} from 'nuqs/server'

import {
  CATEGORIES,
  PROPOSAL_STATUSES,
  RESPONSE_KINDS,
} from '@/features/aisa/aisa.schema'

/**
 * The proposal list's URL contract — every filter, the sort and the page live in
 * the URL so a view is a shareable link (the Dashboard tiles link
 * straight into it). An unknown value parses as `null`, which is "no filter": a
 * hand-edited URL shows the whole list, never an error page.
 *
 * `kategori` filters the EFFECTIVE grade; `atas` is Sangat layak + Layak
 * bersyarat. A value of the old four-step scale (`cocok`, …) is unknown, so it
 * is no filter. `luarFokus=1` keeps proposals "di luar fokus" (`isOutsideFocus`),
 * `luarFokus=0` the ones that fit the focus. `tanggapan` is the tab row: belum /
 * sudah, or one response kind.
 */
export const KATEGORI_FILTERS = [...CATEGORIES, 'atas'] as const
export const FOKUS_FILTERS = ['1', '0'] as const
export const TANGGAPAN_FILTERS = ['belum', 'sudah', ...RESPONSE_KINDS] as const
/** `grade` ranks by grade, then in-focus before out-of-focus, then score. */
export const SORT_KEYS = ['grade', 'skor', 'nama', 'dana', 'masuk'] as const
export type SortKey = (typeof SORT_KEYS)[number]

export const proposalListParams = {
  kategori: parseAsStringLiteral(KATEGORI_FILTERS),
  luarFokus: parseAsStringLiteral(FOKUS_FILTERS),
  status: parseAsStringLiteral(PROPOSAL_STATUSES),
  sektor: parseAsString,
  tanggapan: parseAsStringLiteral(TANGGAPAN_FILTERS),
  q: parseAsString,
  /** Sort column; absent is the grade ranking, best first. */
  urut: parseAsStringLiteral(SORT_KEYS),
  /** Absent is the column's natural direction: A→Z for names, high→low otherwise. */
  arah: parseAsStringLiteral(['naik', 'turun'] as const),
  /** 1-based page. */
  hal: parseAsInteger,
}

export type ProposalListParams = inferParserType<typeof proposalListParams>

/** A sort column's direction when the URL does not name one. */
export const naturalDescending = (key: SortKey) => key !== 'nama'
