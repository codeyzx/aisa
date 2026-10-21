import { type Metadata } from 'next'

import { Page } from '@/components/shell/page-container'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AISA_READ } from '@/features/aisa/aisa.capability'
import { CATEGORY_LABEL } from '@/features/aisa/aisa.labels'
import { listDailyStats } from '@/features/aisa/aisa.repo'
import { CATEGORIES } from '@/features/aisa/aisa.schema'
import { requireCapability } from '@/lib/auth/guards'

import { BarList, ColumnChart, shortDate } from '../_components/charts'
import { dailyWindow } from '../_components/daily-window'

export const metadata: Metadata = { title: 'Tren' }

const DAYS = 14

export default async function TrenPage() {
  await requireCapability(AISA_READ)
  const days = dailyWindow(await listDailyStats(DAYS), DAYS)

  const perDay = days.map((d) => ({
    label: shortDate(d.date),
    value: d.stats?.proposalsIn ?? 0,
  }))
  const tokensPerDay = days.map((d) => ({
    label: shortDate(d.date),
    value: (d.stats?.tokensIn ?? 0) + (d.stats?.tokensOut ?? 0),
  }))
  const sectorTotals = new Map<string, number>()
  for (const d of days)
    for (const [sector, n] of Object.entries(d.stats?.bySector ?? {}))
      sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + n)
  const perSector = [...sectorTotals]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
  const perCategory = CATEGORIES.map((category) => ({
    label: CATEGORY_LABEL[category],
    value: days.reduce(
      (sum, d) => sum + (d.stats?.byCategory[category] ?? 0),
      0,
    ),
  }))
  const manual = days.reduce(
    (sum, d) => sum + (d.stats?.perluDicekManual ?? 0),
    0,
  )

  return (
    <Page.Root>
      <Page.Header title="Tren" description={`${DAYS} hari terakhir (WIB).`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Proposal masuk per hari</CardTitle>
          </CardHeader>
          <CardContent>
            <ColumnChart
              points={perDay}
              caption="Proposal masuk per hari"
              unit="proposal"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Token per hari (masuk + keluar)</CardTitle>
          </CardHeader>
          <CardContent>
            <ColumnChart
              points={tokensPerDay}
              caption="Token per hari"
              unit="token"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Per sektor</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList points={perSector} unit="proposal" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Per kategori</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <BarList points={perCategory} unit="proposal" />
            <p className="text-xs text-muted-foreground">
              Kategori dari kode saat dinilai. Ditambah {manual} proposal perlu
              dicek manual (tanpa kategori).
            </p>
          </CardContent>
        </Card>
      </div>
    </Page.Root>
  )
}
