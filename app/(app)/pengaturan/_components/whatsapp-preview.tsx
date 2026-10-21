'use client'

import { CheckCheckIcon } from 'lucide-react'
import { Fragment, useState } from 'react'

import { MANAGER_SALUTATION } from '@/lib/app-config'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type Slot = '09.00' | '17.00'

/** WhatsApp's `*bold*` as <b>, the only markup the ringkasan uses. */
function Line({ text }: { text: string }) {
  // Keyed by each part's offset in the line, which is stable for a given text.
  let offset = 0
  const parts = text.split(/(\*[^*]+\*)/g).map((part) => {
    const at = offset
    offset += part.length
    return { part, at }
  })
  return (
    <p>
      {parts.map(({ part, at }) =>
        part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
          <b key={at} className="font-semibold">
            {part.slice(1, -1)}
          </b>
        ) : (
          <Fragment key={at}>{part}</Fragment>
        ),
      )}
    </p>
  )
}

/**
 * A chat bubble built from the real unanswered proposals. Theme tokens, not
 * WhatsApp green, so it reads as a preview rather than a screenshot.
 */
export function WhatsappPreview({
  lines,
  pending,
  since,
  initialSlot,
}: {
  lines: string[]
  pending: number
  /** The opening's middle sentence, built on the server from the last ringkasan. */
  since: string
  initialSlot: Slot
}) {
  const [slot, setSlot] = useState<Slot>(initialSlot)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Pratinjau pesan</p>
        <ToggleGroup
          size="sm"
          variant="outline"
          spacing={0}
          value={[slot]}
          onValueChange={(value) => {
            const next = value[0] as Slot | undefined
            if (next) setSlot(next)
          }}
          aria-label="Pratinjau ringkasan"
        >
          <ToggleGroupItem value="09.00" className="px-3 text-xs">
            Pagi
          </ToggleGroupItem>
          <ToggleGroupItem value="17.00" className="px-3 text-xs">
            Sore
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="overflow-hidden rounded-2xl border shadow-sm">
        <div className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-foreground/15 text-xs font-bold">
            AI
          </span>
          <div className="min-w-0">
            <p className="text-sm leading-tight font-semibold">AISA</p>
            <p className="text-[11.5px] text-primary-foreground/90">
              lewat GOWA
            </p>
          </div>
        </div>

        <div className="max-h-[34rem] overflow-y-auto bg-muted/70 px-3 py-4">
          <p className="mb-3 text-center">
            <span className="rounded-md bg-card px-2 py-0.5 text-[11px] text-muted-foreground shadow-xs">
              Hari ini
            </span>
          </p>
          <div
            key={slot}
            className="relative max-w-[94%] animate-in space-y-2 rounded-xl rounded-tl-sm bg-card px-3.5 py-2.5 text-[13px] leading-relaxed text-card-foreground shadow-xs duration-300 fade-in"
          >
            <p>
              {slot === '09.00' ? 'Selamat pagi' : 'Selamat sore'},{' '}
              {MANAGER_SALUTATION}. {since} Ada {pending} proposal yang belum{' '}
              {MANAGER_SALUTATION} tanggapi.
            </p>
            {lines.map((line) => (
              <Line key={line} text={line} />
            ))}
            <p className="-mt-1 flex items-center justify-end gap-1 text-[10.5px] text-muted-foreground">
              {slot}
              <CheckCheckIcon className="size-3.5 text-primary" />
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
