import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Calibration } from '@/features/aisa/aisa.calibration'
import { CATEGORY_LABEL } from '@/features/aisa/aisa.labels'
import { formatDate } from '@/lib/format/date'
import { formatNumber, formatPercent, formatScore } from '@/lib/format/number'

/** One decimal is enough for a rate over a handful of proposals: `33,3%`. */
function rate(percent: number): string {
  return formatPercent(Math.round(percent * 10) / 10)
}

export function Kalibrasi({ calibration }: { calibration: Calibration }) {
  const { reviewed, agreed, agreementPercent, corrections, naik, turun } =
    calibration
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-semibold">Kalibrasi</CardTitle>
        <CardDescription>
          Seberapa sering manajer membiarkan grade dari AI, sebagai bahan
          menyesuaikan aturan di halaman ini.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <section aria-labelledby="kalibrasi-manajer" className="space-y-3">
          <h3 id="kalibrasi-manajer" className="text-sm font-semibold">
            Koreksi manajer
          </h3>
          <p className="text-muted-foreground">
            Proposal dihitung <strong>ditinjau manajer</strong> bila sudah
            diberi tanggapan atau gradenya dikoreksi.{' '}
            <strong>AI sepakat</strong> bila proposal yang ditinjau tidak
            dikoreksi ke grade lain. Koreksi tidak mengubah grade dan skor dari
            AI; angka ini bahan untuk menyesuaikan bobot dan patokan di atas.
          </p>
          {agreementPercent === null ? (
            <p className="text-muted-foreground">
              Belum ada proposal yang ditinjau manajer. Angka kesepakatan muncul
              setelah manajer memberi tanggapan atau mengoreksi grade.
            </p>
          ) : (
            <>
              <dl className="grid gap-3 rounded-xl border p-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Ditinjau manajer
                  </dt>
                  <dd className="font-mono text-xl font-semibold tabular-nums">
                    {formatNumber(reviewed)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Dikoreksi</dt>
                  <dd className="font-mono text-xl font-semibold tabular-nums">
                    {formatNumber(corrections.length)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Arah koreksi
                  </dt>
                  <dd>
                    Naik grade {formatNumber(naik)} · Turun grade{' '}
                    {formatNumber(turun)}
                  </dd>
                </div>
              </dl>
              <p>
                AI sepakat dengan manajer pada {formatNumber(agreed)} dari{' '}
                {formatNumber(reviewed)} proposal yang ditinjau (
                {rate(agreementPercent)}).
              </p>
              {corrections.length === 0 ? (
                <p className="text-muted-foreground">Belum ada koreksi.</p>
              ) : (
                <Table aria-label="Koreksi grade oleh manajer">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proposal</TableHead>
                      <TableHead>Grade AI</TableHead>
                      <TableHead>Koreksi manajer</TableHead>
                      <TableHead>Alasan</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead className="text-right">
                        Skor kualitas
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {corrections.map(({ proposal, correction, direction }) => (
                      <TableRow key={proposal.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/proposal/${encodeURIComponent(proposal.id)}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {proposal.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {proposal.category
                            ? CATEGORY_LABEL[proposal.category]
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {CATEGORY_LABEL[correction.category]}
                          {direction ? ` (${direction})` : ''}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {correction.reason}
                        </TableCell>
                        <TableCell>{formatDate(correction.at)}</TableCell>
                        <TableCell className="text-right">
                          {proposal.assessment
                            ? formatScore(proposal.assessment.score)
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="kalibrasi-analis" className="space-y-2">
          <h3
            id="kalibrasi-analis"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            Kalibrasi analis <Badge variant="outline">belum ada data</Badge>
          </h3>
          <p className="text-muted-foreground">
            Data kalibrasi belum ada. Rencananya 10–20 deck lama dinilai 2–3
            analis dengan matriks yang sama, lalu tingkat kesepakatan AI dengan
            analis ditampilkan di sini.
          </p>
        </section>
      </CardContent>
    </Card>
  )
}
