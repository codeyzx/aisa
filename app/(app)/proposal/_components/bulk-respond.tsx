'use client'

import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { bulkRespondAction } from '@/features/aisa/aisa.action'
import { RESPONSE_LABEL } from '@/features/aisa/aisa.labels'
import {
  RESPONSE_KINDS,
  type Category,
  type ResponseKind,
} from '@/features/aisa/aisa.schema'

import { useApiAction } from '../../_components/use-api-action'

/**
 * Tanggapan massal for the filtered grade — the dashboard twin of
 * "arsipkan semua tidak layak". Asks once more before sending, since it touches
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
          <span className="font-medium">
            {RESPONSE_LABEL[confirming]} {count} proposal?
          </span>
          <Button
            size="sm"
            variant={confirming === 'arsipkan' ? 'destructive' : 'default'}
            disabled={pending}
            onClick={() =>
              run(() => bulkRespondAction(category, confirming), {
                // The API's count, not the page's: proposals answered over
                // WhatsApp since this page rendered are not counted again.
                success: ({ count: done }) =>
                  `${RESPONSE_LABEL[confirming]}: ${done} proposal ${categoryLabel}.`,
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
            onClick={() => setConfirming(kind)}
          >
            {RESPONSE_LABEL[kind]} semua
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
