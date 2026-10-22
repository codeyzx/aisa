'use client'

import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { correctCategoryAction } from '@/features/aisa/aisa.action'
import { CATEGORY_ACTION, CATEGORY_LABEL } from '@/features/aisa/aisa.labels'
import { MAX_REASON_LENGTH } from '@/features/aisa/aisa.limits'
import { CATEGORIES, type Category } from '@/features/aisa/aisa.schema'

import { useApiAction } from '../../_components/use-api-action'

/**
 * Koreksi grade. The reason is required (checked here and by the API); the AI
 * score is kept as it was. The current grade cannot be picked. Each option
 * names the step it recommends, so the choice reads as a decision.
 */
export function CorrectionForm({
  proposalId,
  current,
}: {
  proposalId: string
  current: Category | null
}) {
  const [category, setCategory] = useState<Category | null>(null)
  const [reason, setReason] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const { pending, error, run } = useApiAction()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!category) return
    if (!reason.trim()) {
      setLocalError('Alasan koreksi wajib diisi.')
      return
    }
    setLocalError(null)
    run(() => correctCategoryAction(proposalId, category, reason), {
      success: `Grade dikoreksi ke ${CATEGORY_LABEL[category]}.`,
      onSuccess: () => {
        setReason('')
        setCategory(null)
      },
    })
  }

  const shown = localError ?? error
  return (
    <form onSubmit={submit} className="space-y-2">
      <Select
        items={CATEGORY_LABEL}
        value={category}
        onValueChange={(value) => setCategory(value as Category | null)}
      >
        <SelectTrigger className="w-full" aria-label="Grade baru">
          <SelectValue placeholder="Pilih grade baru" />
        </SelectTrigger>
        <SelectContent>
          {CATEGORIES.map((value) => (
            <SelectItem key={value} value={value} disabled={value === current}>
              <span className="flex flex-col">
                <span>{CATEGORY_LABEL[value]}</span>
                <span className="text-xs text-muted-foreground">
                  {value === current
                    ? 'Grade sekarang'
                    : CATEGORY_ACTION[value]}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={reason}
        maxLength={MAX_REASON_LENGTH}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Alasannya, mis. timnya sudah saya kenal"
        aria-label="Alasan koreksi"
      />
      {shown ? (
        <Alert variant="destructive">
          <AlertDescription>{shown}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        type="submit"
        variant="secondary"
        className="w-full"
        disabled={pending || !category}
      >
        {pending ? <Spinner /> : null}
        Simpan koreksi
      </Button>
    </form>
  )
}
