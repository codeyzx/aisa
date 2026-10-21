import { PencilIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { CRITERION_LABEL } from '@/features/aisa/aisa.labels'
import {
  CRITERIA,
  type Criterion,
  type Rules,
} from '@/features/aisa/aisa.schema'
import { cn } from '@/lib/utils'

import { CRITERION_COLOR } from '../../_components/badges'

import { CRITERION_EVIDENCE, num, toPercent } from './helpers'
import { WeightBar } from './weight-bar'

export function WeightsCard({
  rules,
  onEdit,
}: {
  rules: Pick<Rules, 'weights'>
  onEdit?: () => void
}) {
  const percent = Object.fromEntries(
    CRITERIA.map((c) => [c, toPercent(rules.weights[c])]),
  ) as Record<Criterion, number>
  const top = CRITERIA.toSorted((a, b) => percent[b] - percent[a])[0]!

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-semibold">Bobot kriteria</CardTitle>
        <CardDescription>
          Seberapa besar pengaruh tiap kriteria terhadap skor. Totalnya selalu
          100%.
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
      <CardContent className="flex flex-col gap-4">
        <WeightBar percent={percent} showLabels={false} />
        <ul className="-my-1 divide-y divide-border">
          {CRITERIA.map((c) => (
            <li
              key={c}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 py-3"
            >
              <span
                aria-hidden
                className={cn('mt-1 size-3 rounded-[4px]', CRITERION_COLOR[c])}
              />
              <div className="min-w-0">
                <p className="font-medium">{CRITERION_LABEL[c]}</p>
                <p className="text-[13px] leading-snug text-muted-foreground">
                  {CRITERION_EVIDENCE[c]}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-lg leading-none font-semibold tabular-nums">
                  {num(percent[c])}%
                </p>
                <p className="mt-1 text-[11px] whitespace-nowrap text-muted-foreground">
                  maks. {num(percent[c])} poin
                </p>
              </div>
            </li>
          ))}
        </ul>
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">
            {CRITERION_LABEL[top]}
          </span>{' '}
          paling berpengaruh: nilai sempurna di kriteria ini menyumbang{' '}
          {num(percent[top])} dari 100 poin.
        </p>
      </CardContent>
    </Card>
  )
}
