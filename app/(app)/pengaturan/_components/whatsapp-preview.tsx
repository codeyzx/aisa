'use client'

import { CheckCheckIcon } from 'lucide-react'
import { Fragment, useState } from 'react'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type Period = 'harian' | 'mingguan'

const PERIOD: Record<Period, { time: string; day: string; toggle: string }> = {
  harian: { time: '09.00', day: 'Hari ini', toggle: 'Harian' },
  mingguan: { time: '17.00', day: 'Jumat', toggle: 'Mingguan' },
}

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
 * A chat bubble built from the real proposals, for the daily or the weekly
 * ringkasan. Theme tokens, not WhatsApp green, so it reads as a preview rather
 * than a screenshot.
 */
export function WhatsappPreview({
  messages,
  initialPeriod,
}: {
  /** Each message's lines, opening first, built on the server. */
  messages: Record<Period, string[]>
  initialPeriod: Period
}) {
  const [period, setPeriod] = useState<Period>(initialPeriod)
  const meta = PERIOD[period]
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Pratinjau pesan</p>
        <ToggleGroup
          size="sm"
          variant="outline"
          spacing={0}
          value={[period]}
          onValueChange={(value) => {
            const next = value[0] as Period | undefined
            if (next) setPeriod(next)
          }}
          aria-label="Pratinjau ringkasan"
        >
          {(Object.keys(PERIOD) as Period[]).map((key) => (
            <ToggleGroupItem key={key} value={key} className="px-3 text-xs">
              {PERIOD[key].toggle}
            </ToggleGroupItem>
          ))}
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
              {meta.day}
            </span>
          </p>
          <div
            key={period}
            className="relative max-w-[94%] animate-in space-y-2 rounded-xl rounded-tl-sm bg-card px-3.5 py-2.5 text-[13px] leading-relaxed text-card-foreground shadow-xs duration-300 fade-in"
          >
            {messages[period].map((line) => (
              <Line key={line} text={line} />
            ))}
            <p className="-mt-1 flex items-center justify-end gap-1 text-[10.5px] text-muted-foreground">
              {meta.time}
              <CheckCheckIcon className="size-3.5 text-primary" />
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
