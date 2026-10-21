import {
  HISTORY_ACTION_LABEL,
  historyDetailText,
  labelOf,
} from '@/features/aisa/aisa.labels'
import type { History, Proposal } from '@/features/aisa/aisa.schema'

import { DECISION_LABEL } from '../../_components/badges'

/** One line of a proposal's Riwayat card. */
export interface ProposalHistoryEntry {
  id: string
  title: string
  detail: string
  reason: string | null
  via: History['via']
  at: Date
}

/**
 * The proposal-scoped history rows, newest first, plus the current response
 * when no row explains it. A single response always writes a proposal-scoped
 * `tanggapan` row after it sets `response`; a tanggapan massal writes one row
 * for the whole category with no proposal id. So a response with no
 * `tanggapan` row at or after its time came from a tanggapan massal, and its
 * entry is built from the proposal's own `response` — kind, time, channel and
 * note — rather than left out of a card that promises the last decision.
 */
export function proposalHistoryEntries(
  history: History[],
  response: Proposal['response'],
): ProposalHistoryEntry[] {
  const entries = history.map<ProposalHistoryEntry>((row) => ({
    id: row.id,
    title: labelOf(HISTORY_ACTION_LABEL, row.action),
    detail: historyDetailText(row.detail),
    reason: row.reason?.trim() || null,
    via: row.via,
    at: row.at,
  }))
  const explained =
    !response ||
    history.some(
      (row) =>
        row.action === 'tanggapan' && row.at.getTime() >= response.at.getTime(),
    )
  if (explained) return entries
  return [
    ...entries,
    {
      id: 'response-massal',
      title: HISTORY_ACTION_LABEL.tanggapan_massal,
      detail: `${DECISION_LABEL[response.kind]} lewat tanggapan massal`,
      reason: response.note?.trim() || null,
      via: response.via,
      at: response.at,
    },
  ].toSorted((a, b) => b.at.getTime() - a.at.getTime())
}
