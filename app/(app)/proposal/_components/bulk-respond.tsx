'use client'

import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { bulkRespondAction } from '@/features/aisa/aisa.action'
import {
  RESPONSE_KINDS,
  type Category,
  type ResponseKind,
} from '@/features/aisa/aisa.schema'

import { useApiAction } from '../../_components/use-api-action'

/** The bulk button's words and the question it asks before sending. */
const BULK: Record<
  ResponseKind,
  { button: string; ask: (count: number) => string; done: string }
> = {
  setuju: {
    button: 'Setujui semua',
    ask: (count) => `Setujui ${count} proposal?`,
    done: 'Disetujui',
  },
  tolak: {
    button: 'Tolak semua',
    ask: (count) => `Tolak ${count} proposal?`,
    done: 'Ditolak',
  },
}

/**
 * Tanggapan massal for the filtered grade — the dashboard twin of
 * "tolak semua tidak layak". Asks once more before sending, since it touches
 * every unresponded proposal in the grade.
 */
export function BulkRespond({
  category,
  categoryLabel,
  count,
}: {
  category: Category
  categoryLabel: string
  count: number
}) {
  const [confirming, setConfirming] = useState<ResponseKind | null>(null)
  const { pending, error, run } = useApiAction()

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm shadow-xs">
      <span>
        Tanggapi semua {count} proposal <strong>{categoryLabel}</strong> yang
        belum ditanggapi:
      </span>
      {confirming ? (
        <>
          <span className="font-medium">{BULK[confirming].ask(count)}</span>
          <Button
            size="sm"
            variant={confirming === 'tolak' ? 'destructive' : 'default'}
            disabled={pending}
            onClick={() =>
              run(() => bulkRespondAction(category, confirming), {
                // The API's count, not the page's: proposals answered over
                // WhatsApp since this page rendered are not counted again.
                success: ({ count: done }) =>
                  `${BULK[confirming].done}: ${done} proposal ${categoryLabel}.`,
                onSuccess: () => setConfirming(null),
              })
            }
          >
            Ya, lanjutkan
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
            Batal
          </Button>
        </>
      ) : (
        RESPONSE_KINDS.map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant="outline"
            className={
              kind === 'tolak'
                ? 'border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive'
                : undefined
            }
            onClick={() => setConfirming(kind)}
          >
            {BULK[kind].button}
          </Button>
        ))
      )}
      {error ? (
        <Alert variant="destructive" className="basis-full">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
