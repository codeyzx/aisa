import { type Metadata } from 'next'

import { Page } from '@/components/shell/page-container'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AISA_CONFIGURE, AISA_READ } from '@/features/aisa/aisa.capability'
import { CRITERION_LABEL, VIA_LABEL } from '@/features/aisa/aisa.labels'
import { getRules, getRuntime } from '@/features/aisa/aisa.repo'
import { CRITERIA, type Criterion } from '@/features/aisa/aisa.schema'
import { requireCapability } from '@/lib/auth/guards'
import { can } from '@/lib/auth/rbac'
import { formatRupiah } from '@/lib/format/currency'
import { formatDate, formatTime } from '@/lib/format/date'

import { RulesForm } from './_components/rules-form'
import { RulesSummary } from './_components/rules-summary'
import { RuntimeToggle } from './_components/runtime-toggle'

export const metadata: Metadata = { title: 'Pengaturan' }

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

const percent = (weight: number) =>
  `${(Math.round(weight * 1000) / 10).toLocaleString('id-ID')}%`

export default async function PengaturanPage() {
  const session = await requireCapability(AISA_READ)
  const canConfigure = can(session, AISA_CONFIGURE)
  const [rules, runtime] = await Promise.all([getRules(), getRuntime()])
  const paused = runtime?.paused ?? false

  return (
    <Page.Root>
      <Page.Header
        title="Pengaturan"
        description="Aturan penilaian dan kendali AI."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Status AI
            <Badge variant={paused ? 'destructive' : 'secondary'}>
              {paused ? 'Dijeda (STOP)' : 'Berjalan'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {paused
              ? `Pekerjaan AI berhenti${runtime?.pausedAt ? ` sejak ${formatDate(runtime.pausedAt)} ${formatTime(runtime.pausedAt)}` : ''}${runtime?.pausedVia ? ` (lewat ${VIA_LABEL[runtime.pausedVia]})` : ''}. Proposal baru menunggu sebagai Antre sampai LANJUT.`
              : 'AI menilai proposal yang masuk. STOP menghentikan pekerjaan yang sedang berjalan.'}
          </p>
          {canConfigure ? <RuntimeToggle paused={paused} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Aturan penilaian{' '}
            {rules ? (
              <Badge variant="outline">versi {rules.version}</Badge>
            ) : null}
          </CardTitle>
          {rules ? (
            <p className="text-xs text-muted-foreground">
              Diubah {formatDate(rules.changedAt)} {formatTime(rules.changedAt)}{' '}
              — {rules.reason}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-6">
          {!rules ? (
            <p className="text-sm text-muted-foreground">
              Aturan penilaian belum ada di Firestore (settings/rules).
            </p>
          ) : (
            <>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Bobot aktif</dt>
                  <dd>
                    {CRITERIA.map(
                      (c) =>
                        `${CRITERION_LABEL[c]} ${percent(rules.weights[c])}`,
                    ).join(' · ')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Fokus</dt>
                  <dd>
                    {rules.fit.sectors.join(', ')} ·{' '}
                    {rules.fit.stages.join(', ')} ·{' '}
                    {formatRupiah(rules.fit.fundingMinIdr)}–
                    {formatRupiah(rules.fit.fundingMaxIdr)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Model penilai
                  </dt>
                  <dd>
                    <code>{rules.models.penilai}</code>
                  </dd>
                </div>
              </dl>
              {canConfigure ? (
                <RulesForm
                  initial={{
                    weights: rules.weights,
                    anchors: rules.anchors,
                    fit: rules.fit,
                    thresholds: rules.thresholds,
                    models: {
                      penilai: rules.models.penilai,
                      ringkasan: rules.models.ringkasan,
                      insight: rules.models.insight,
                    },
                    minCharsPerPage: rules.minCharsPerPage,
                    retentionDays: rules.retentionDays,
                  }}
                  asistenModel={rules.models.asisten}
                />
              ) : (
                <RulesSummary rules={rules} />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dasar bobot (baseline)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Bobot baseline adalah rata-rata dua benchmark, dengan rujukan
            tambahan dari survei Gompers dkk. (885 VC, 47% menyebut tim sebagai
            faktor terpenting).
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kriteria</TableHead>
                <TableHead>Scorecard Method</TableHead>
                <TableHead>Hustle Fund (pre-seed)</TableHead>
                <TableHead className="text-right">Baseline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CRITERIA.map((c) => (
                <TableRow key={c}>
                  <TableCell className="font-medium">
                    {CRITERION_LABEL[c]}
                  </TableCell>
                  <TableCell>{BASELINE[c].scorecard}</TableCell>
                  <TableCell>{BASELINE[c].hustle}</TableCell>
                  <TableCell className="text-right font-medium">
                    {BASELINE[c].baseline}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">
            Keterbatasan: kedua sumber adalah metode angel dan investor tahap
            awal, bukan standar resmi VC, dan pemetaan ke 5 kriteria AISA adalah
            interpretasi tim.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kalibrasi</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Data kalibrasi belum ada. Rencananya 10–20 deck lama dinilai 2–3
            analis dengan matriks yang sama, lalu tingkat kesepakatan AI dengan
            analis ditampilkan di sini.
          </p>
        </CardContent>
      </Card>
    </Page.Root>
  )
}
