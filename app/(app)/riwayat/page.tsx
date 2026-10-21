import { type Metadata } from 'next'

import { AISA_READ } from '@/features/aisa/aisa.capability'
import { digestsCollection } from '@/features/aisa/aisa.collection'
import {
  getRules,
  listHistory,
  listRecentProposals,
} from '@/features/aisa/aisa.repo'
import { requireCapability } from '@/lib/auth/guards'

import { toEvents } from './_components/events'
import { HistoryView } from './_components/history-view'

export const metadata: Metadata = { title: 'Riwayat' }

/** History rows loaded, newest first; the page says so when the window is full. */
const LIMIT = 500

export default async function RiwayatPage() {
  await requireCapability(AISA_READ)
  const [rows, proposals, rules] = await Promise.all([
    listHistory(LIMIT),
    listRecentProposals(),
    getRules(),
  ])
  // The digests the loaded `ringkasan_terkirim` rows announced — a single-field
  // range on `sentAt`, so no composite index.
  const oldest = rows.at(-1)?.at
  const digests = oldest
    ? (
        await digestsCollection()
          .where('sentAt', '>=', new Date(oldest.getTime() - 120_000))
          .get()
      ).docs.map((doc) => doc.data())
    : []

  return (
    <HistoryView
      events={toEvents(rows, proposals, digests)}
      now={Date.now()}
      thresholds={rules?.thresholds ?? null}
      windowFull={rows.length >= LIMIT}
    />
  )
}
