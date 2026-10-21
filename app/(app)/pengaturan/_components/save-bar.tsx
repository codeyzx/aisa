'use client'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

import { useReportDirty } from './settings-dirty'

/**
 * The floating save bar: shown only while there are unsaved changes, pinned to
 * the bottom of the screen. Lives inside the `<form>`, so Simpan is a submit.
 */
export function SaveBar({
  dirty,
  pending,
  onReset,
  hint = 'Ada perubahan yang belum disimpan',
}: {
  dirty: boolean
  pending: boolean
  onReset: () => void
  hint?: string
}) {
  useReportDirty(dirty)
  if (!dirty && !pending) return null

  return (
    <div className="pointer-events-none sticky bottom-4 z-30 col-span-full mt-2 flex justify-center pr-14 lg:pr-0">
      <div
        aria-live="polite"
        className="pointer-events-auto flex w-full max-w-lg animate-in items-center gap-3 rounded-xl border bg-popover py-2 pr-2 pl-4 text-popover-foreground shadow-lg duration-200 fade-in slide-in-from-bottom-3"
      >
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-warning" />
        <p className="min-w-0 flex-1 text-[13px] leading-tight font-medium">
          {pending ? 'Menyimpan…' : hint}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={onReset}
        >
          Batal
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Spinner />}
          Simpan
        </Button>
      </div>
    </div>
  )
}
