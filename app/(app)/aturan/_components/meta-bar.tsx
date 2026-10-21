import {
  DatabaseIcon,
  HistoryIcon,
  InfoIcon,
  SlidersHorizontalIcon,
} from 'lucide-react'
import Link from 'next/link'

import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { Rules } from '@/features/aisa/aisa.schema'
import { formatDate, formatTime } from '@/lib/format/date'

export function MetaBar({
  rules,
  onEdit,
}: {
  rules: Pick<Rules, 'version' | 'changedAt' | 'reason'>
  /** Absent for a seat without `aisa:configure`: no edit control is shown. */
  onEdit?: () => void
}) {
  return (
    <Card className="gap-0 p-0">
      <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
            <DatabaseIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">Aturan versi {rules.version}</p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-success"
                />
                Sedang dipakai
              </span>
            </div>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Disimpan di Firestore · diperbarui {formatDate(rules.changedAt)},{' '}
              {formatTime(rules.changedAt)} · {rules.reason}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href="/riwayat"
            className={buttonVariants({ variant: 'outline' })}
          >
            <HistoryIcon />
            Riwayat perubahan
          </Link>
          {onEdit ? (
            <Button onClick={onEdit}>
              <SlidersHorizontalIcon />
              Ubah aturan
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex items-start gap-2 border-t bg-muted/50 px-4 py-2.5 text-[13px] text-muted-foreground">
        <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
        <p>
          Perubahan hanya berlaku untuk proposal yang masuk setelah disimpan.
          Skor dan kategori proposal lama tidak dihitung ulang.
        </p>
      </div>
    </Card>
  )
}
