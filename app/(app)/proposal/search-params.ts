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
 * `kategori` filters the KATEGORI EFEKTIF; `atas` is Sangat cocok + Cocok.
 * `luarFokus=1` is the "Berkualitas, di luar fokus" mark as `showsQualityOutsideFocus`
 * defines it. `tanggapan` is the tab row: belum / sudah, or one response kind.
 */
export const KATEGORI_FILTERS = [...CATEGORIES, 'atas'] as const
export const TANGGAPAN_FILTERS = ['belum', 'sudah', ...RESPONSE_KINDS] as const
export const SORT_KEYS = ['skor', 'nama', 'dana', 'masuk'] as const
export type SortKey = (typeof SORT_KEYS)[number]

export const proposalListParams = {
  kategori: parseAsStringLiteral(KATEGORI_FILTERS),
  luarFokus: parseAsStringLiteral(['1'] as const),
  status: parseAsStringLiteral(PROPOSAL_STATUSES),
  sektor: parseAsString,
  tanggapan: parseAsStringLiteral(TANGGAPAN_FILTERS),
  q: parseAsString,
  /** Sort column; absent is the score, highest first. */
  urut: parseAsStringLiteral(SORT_KEYS),
  /** Absent is the column's natural direction: A→Z for names, high→low otherwise. */
  arah: parseAsStringLiteral(['naik', 'turun'] as const),
  /** 1-based page. */
  hal: parseAsInteger,
}

export type ProposalListParams = inferParserType<typeof proposalListParams>

/** A sort column's direction when the URL does not name one. */
export const naturalDescending = (key: SortKey) => key !== 'nama'
