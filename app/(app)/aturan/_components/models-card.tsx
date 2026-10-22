import { CpuIcon, FileTextIcon, PencilIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { Rules } from '@/features/aisa/aisa.schema'
import { formatNumber } from '@/lib/format/number'

import { ASISTEN_MODEL_NOTE, EDITABLE_MODEL_LABEL } from './rules-labels'

const MODEL_KEYS = Object.keys(
  EDITABLE_MODEL_LABEL,
) as (keyof typeof EDITABLE_MODEL_LABEL)[]

/** Which model does which job, and when a deck is too thin to score. */
export function ModelsCard({
  rules,
  onEdit,
}: {
  rules: Pick<Rules, 'models' | 'minCharsPerPage'>
  onEdit?: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-semibold">
          Model dan pembacaan proposal
        </CardTitle>
        <CardDescription>
          Model AI untuk tiap pekerjaan, dan batas teks agar proposal bisa
          dinilai.
        </CardDescription>
        {onEdit ? (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <PencilIcon />
              Ubah
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <dl className="divide-y rounded-xl border text-sm">
          {MODEL_KEYS.map((key) => (
            <div
              key={key}
              className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 px-3.5 py-2.5"
            >
              <dt className="flex items-center gap-2 text-muted-foreground">
                <CpuIcon className="size-3.5" />
                {EDITABLE_MODEL_LABEL[key]}
              </dt>
              <dd className="min-w-0 font-mono text-[13px] font-medium break-words">
                {rules.models[key]}
              </dd>
            </div>
          ))}
          <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 px-3.5 py-2.5">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <CpuIcon className="size-3.5" />
              Asisten
            </dt>
            <dd className="min-w-0">
              <span className="font-mono text-[13px] font-medium break-words">
                {rules.models.asisten}
              </span>
              <span className="block text-xs text-muted-foreground">
                {ASISTEN_MODEL_NOTE}
              </span>
            </dd>
          </div>
        </dl>
        <div className="flex flex-col gap-2 rounded-xl border p-4">
          <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
            <FileTextIcon className="size-4" />
          </span>
          <p className="text-[11px] font-medium text-muted-foreground">
            Minimum karakter per halaman
          </p>
          <p className="font-mono text-xl font-semibold tabular-nums">
            {formatNumber(rules.minCharsPerPage)}
          </p>
          <p className="text-[13px] leading-snug text-muted-foreground">
            Proposal yang rata-rata teks per halamannya kurang dari ini masuk
            “Perlu dicek manual” dan tidak dinilai AI.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
