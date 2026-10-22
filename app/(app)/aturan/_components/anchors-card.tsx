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
  ANCHOR_LEVELS,
  CRITERIA,
  type Rules,
} from '@/features/aisa/aisa.schema'
import { cn } from '@/lib/utils'

import { CriterionName } from './criterion-name'
import { ANCHOR_UNDEFINED, RUBRIC_INTRO, SCALE_NOTE } from './rules-labels'

/** The 1–5 rubric (patokan skor) the Penilai reads for every criterion. */
export function AnchorsCard({
  rules,
  onEdit,
}: {
  rules: Pick<Rules, 'anchors'>
  onEdit?: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-semibold">Patokan skor</CardTitle>
        <CardDescription>
          {RUBRIC_INTRO} {SCALE_NOTE} Tim investasi dapat menyesuaikan
          definisinya dengan tesis dana, misalnya skor 1 untuk perusahaan yang
          berdiri kurang dari 1 tahun.
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
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[56rem] text-[13px]">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="w-44 px-3 py-2 text-left font-medium">
                  Kriteria
                </th>
                {ANCHOR_LEVELS.map((level) => (
                  <th key={level} className="px-3 py-2 text-left font-medium">
                    Skor {level}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {CRITERIA.map((c) => (
                <tr key={c} className="align-top">
                  <td className="px-3 py-2.5 font-medium">
                    <CriterionName
                      criterion={c}
                      className="[&>span:last-child]:whitespace-normal"
                    />
                  </td>
                  {ANCHOR_LEVELS.map((level) => {
                    const text = rules.anchors[c][level].trim()
                    return (
                      <td
                        key={level}
                        className={cn(
                          'px-3 py-2.5 leading-snug text-muted-foreground',
                          !text && 'text-warning italic',
                        )}
                      >
                        {text || ANCHOR_UNDEFINED}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
