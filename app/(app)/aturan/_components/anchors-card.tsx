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
import { CRITERIA, type Rules } from '@/features/aisa/aisa.schema'
import { cn } from '@/lib/utils'

import { CRITERION_TONE } from './helpers'

const LEVELS = ['1', '3', '5'] as const

/** The 1/3/5 patokan the Penilai reads for every criterion. */
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
        <CardTitle className="font-semibold">Patokan nilai</CardTitle>
        <CardDescription>
          Arti nilai 1, 3, dan 5 untuk tiap kriteria. AI membaca patokan ini
          saat memberi nilai.
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
          <table className="w-full min-w-[40rem] text-[13px]">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="w-48 px-3 py-2 text-left font-medium">
                  Kriteria
                </th>
                {LEVELS.map((level) => (
                  <th key={level} className="px-3 py-2 text-left font-medium">
                    Nilai {level}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {CRITERIA.map((c) => (
                <tr key={c} className="align-top">
                  <td className="px-3 py-2.5 font-medium">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          'size-2.5 shrink-0 rounded-[3px]',
                          CRITERION_TONE[c],
                        )}
                      />
                      {CRITERION_LABEL[c]}
                    </span>
                  </td>
                  {LEVELS.map((level) => (
                    <td
                      key={level}
                      className="px-3 py-2.5 leading-snug text-muted-foreground"
                    >
                      {rules.anchors[c][level]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
