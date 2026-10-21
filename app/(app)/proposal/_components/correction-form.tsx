'use client'

import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { correctCategoryAction } from '@/features/aisa/aisa.action'
import { CATEGORY_LABEL } from '@/features/aisa/aisa.labels'
import { MAX_REASON_LENGTH } from '@/features/aisa/aisa.limits'
import { CATEGORIES, type Category } from '@/features/aisa/aisa.schema'

import { useApiAction } from '../../_components/use-api-action'

/** Koreksi kategori. The reason is required; the AI score is kept as it was. */
export function CorrectionForm({
  proposalId,
  current,
}: {
  proposalId: string
  current: Category | null
}) {
  const [category, setCategory] = useState<Category>(
    CATEGORIES.find((c) => c !== current) ?? 'cocok',
  )
  const [reason, setReason] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const { pending, error, run } = useApiAction()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!reason.trim()) {
      setLocalError('Alasan koreksi wajib diisi.')
      return
    }
    setLocalError(null)
    run(() => correctCategoryAction(proposalId, category, reason), {
      success: `Kategori dikoreksi ke ${CATEGORY_LABEL[category]}.`,
      onSuccess: () => setReason(''),
    })
  }

  const shown = localError ?? error
  return (
    <form onSubmit={submit} className="space-y-2 border-t pt-3">
      <p className="font-medium">Koreksi kategori</p>
      <select
        aria-label="Kategori baru"
        value={category}
        onChange={(event) => setCategory(event.target.value as Category)}
        className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm dark:bg-input/30"
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </option>
        ))}
      </select>
      <Textarea
        aria-label="Alasan koreksi"
        placeholder="Alasan (wajib)"
        value={reason}
        maxLength={MAX_REASON_LENGTH}
        onChange={(event) => setReason(event.target.value)}
      />
      {shown ? (
        <Alert variant="destructive">
          <AlertDescription>{shown}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        type="submit"
        size="sm"
        disabled={pending || category === current}
      >
        Simpan koreksi
      </Button>
    </form>
  )
}
