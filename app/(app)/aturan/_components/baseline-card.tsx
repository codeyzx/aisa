import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { CRITERION_MEANING } from '@/features/aisa/aisa.labels'
import {
  CRITERIA,
  type Criterion,
  type Rules,
} from '@/features/aisa/aisa.schema'
import { cn } from '@/lib/utils'

import { CriterionName } from './criterion-name'
import { num, toPercent } from './helpers'

/**
 * The weights of the scoring guide the manager adopted (A–E: 25/20/20/25/10),
 * the same values `default_rules()` in services/api/aisa/models.py starts from.
 * Shown beside the active weights so an edit away from the guide is visible.
 */
const GUIDE_PERCENT: Record<Criterion, number> = {
  manajemen: 25,
  kinerja: 20,
  risiko: 20,
  rencana: 25,
  dampak: 10,
}

export function BaselineCard({ rules }: { rules: Pick<Rules, 'weights'> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-semibold">Bobot dari panduan</CardTitle>
        <CardDescription>
          Bobot awal kelima kriteria berasal dari panduan penilaian yang dipakai
          tim investasi. Kolom “Sekarang” adalah bobot yang sedang berlaku.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[36rem] text-[13px]">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kriteria</th>
                <th className="px-3 py-2 text-left font-medium">
                  Yang dilihat
                </th>
                <th className="px-3 py-2 text-right font-medium">Panduan</th>
                <th className="px-3 py-2 text-right font-medium">Sekarang</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {CRITERIA.map((c) => {
                const now = toPercent(rules.weights[c])
                const differs = Math.abs(now - GUIDE_PERCENT[c]) > 0.005
                return (
                  <tr key={c} className="align-top">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">
                      <CriterionName criterion={c} />
                    </td>
                    <td className="px-3 py-2 leading-snug text-muted-foreground">
                      {CRITERION_MEANING[c]}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {num(GUIDE_PERCENT[c])}%
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right font-mono font-medium tabular-nums',
                        differs && 'text-warning',
                      )}
                    >
                      {num(now)}%
                      {differs ? (
                        <span className="sr-only"> (berbeda dari panduan)</span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
