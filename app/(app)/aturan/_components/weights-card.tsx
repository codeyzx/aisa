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
import {
  CRITERION_LABEL,
  CRITERION_LETTER,
  CRITERION_MEANING,
} from '@/features/aisa/aisa.labels'
import {
  CRITERIA,
  type Criterion,
  type Rules,
} from '@/features/aisa/aisa.schema'

import { CriterionName } from './criterion-name'
import { num, toPercent } from './helpers'
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
          Lima kriteria (A–E) dan seberapa besar pengaruh tiap kriteria terhadap
          skor kualitas 0–100. Totalnya selalu 100%. Tim investasi dapat
          mengubahnya sesuai tesis dana, misalnya lebih mementingkan dampak
          daripada bisnis.
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
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  <CriterionName criterion={c} />
                </p>
                <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                  {CRITERION_MEANING[c]}
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
            {CRITERION_LETTER[top]}. {CRITERION_LABEL[top]}
          </span>{' '}
          paling berpengaruh: nilai sempurna di kriteria ini menyumbang{' '}
          {num(percent[top])} dari 100 poin.
        </p>
      </CardContent>
    </Card>
  )
}
