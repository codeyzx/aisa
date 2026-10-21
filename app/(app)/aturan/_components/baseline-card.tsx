import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { CRITERION_LABEL } from '@/features/aisa/aisa.labels'
import { CRITERIA, type Criterion } from '@/features/aisa/aisa.schema'

/** The "Dasar bobot (baseline)" table from overview-project.md, verbatim. */
const BASELINE: Record<
  Criterion,
  { scorecard: string; hustle: string; baseline: string }
> = {
  tim: { scorecard: 'Tim 30', hustle: 'Tim 25', baseline: '27,5%' },
  pasar: {
    scorecard: 'Peluang 25',
    hustle: 'Pasar 25 + insight 10',
    baseline: '30%',
  },
  produk: {
    scorecard: 'Produk 15 + persaingan 10',
    hustle: 'Produk 10 + keunggulan 5',
    baseline: '20%',
  },
  traksi: {
    scorecard: 'Kanal penjualan & kemitraan 10',
    hustle: 'Traksi 10 + go-to-market 5',
    baseline: '12,5%',
  },
  bisnis: {
    scorecard: 'Kebutuhan dana 5 + lainnya 5',
    hustle: 'Unit economics 5 + kesiapan dana 3 + risiko 2',
    baseline: '10%',
  },
}

export function BaselineCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-semibold">Dasar bobot (baseline)</CardTitle>
        <CardDescription>
          Bobot baseline adalah rata-rata dua benchmark, dengan rujukan tambahan
          dari survei Gompers dkk. (885 VC, 47% menyebut tim sebagai faktor
          terpenting).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[36rem] text-[13px]">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kriteria</th>
                <th className="px-3 py-2 text-left font-medium">
                  Scorecard Method
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  Hustle Fund (pre-seed)
                </th>
                <th className="px-3 py-2 text-right font-medium">Baseline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {CRITERIA.map((c) => (
                <tr key={c}>
                  <td className="px-3 py-2 font-medium">
                    {CRITERION_LABEL[c]}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {BASELINE[c].scorecard}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {BASELINE[c].hustle}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-medium tabular-nums">
                    {BASELINE[c].baseline}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Keterbatasan: kedua sumber adalah metode angel dan investor tahap
          awal, bukan standar resmi VC, dan pemetaan ke 5 kriteria AISA adalah
          interpretasi tim.
        </p>
      </CardContent>
    </Card>
  )
}
