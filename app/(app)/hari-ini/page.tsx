import { type Metadata } from 'next'
import Link from 'next/link'

import { Page } from '@/components/shell/page-container'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AISA_READ, AISA_RESPOND } from '@/features/aisa/aisa.capability'
import {
  CATEGORY_LABEL,
  QUALITY_OUTSIDE_FOCUS_LABEL,
} from '@/features/aisa/aisa.labels'
import {
  countProposalsSince,
  getLatestDigest,
  getRuntime,
  listUnrespondedProposals,
} from '@/features/aisa/aisa.repo'
import {
  CATEGORIES,
  showsQualityOutsideFocus,
} from '@/features/aisa/aisa.schema'
import { requireCapability } from '@/lib/auth/guards'
import { can } from '@/lib/auth/rbac'
import { formatDate, formatTime } from '@/lib/format/date'
import { formatNumber } from '@/lib/format/number'

import { UploadDeckButton } from '../_components/upload-deck-button'

export const metadata: Metadata = { title: 'Hari ini' }

function Tile({
  label,
  value,
  href,
  hint,
}: {
  label: string
  value: number
  href: string
  hint?: string
}) {
  return (
    <Link href={href} className="block rounded-xl focus-visible:ring-2">
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tabular-nums">
            {formatNumber(value)}
          </p>
          {hint ? (
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  )
}

export default async function HariIniPage() {
  const session = await requireCapability(AISA_READ)

  const [unresponded, digest, runtime] = await Promise.all([
    listUnrespondedProposals(),
    getLatestDigest(),
    getRuntime(),
  ])
  const newSinceDigest = digest
    ? await countProposalsSince(digest.sentAt)
    : null

  const scored = unresponded.filter((p) => p.status === 'dinilai')
  const countFor = (category: (typeof CATEGORIES)[number]) =>
    scored.filter((p) => p.effectiveCategory === category).length
  const outsideFocus = scored.filter(showsQualityOutsideFocus).length
  const manual = unresponded.filter(
    (p) => p.status === 'perlu_dicek_manual',
  ).length

  return (
    <Page.Root>
      <Page.Header
        title="Hari ini"
        description={`${formatNumber(unresponded.length)} proposal belum ditanggapi.`}
      >
        {can(session, AISA_RESPOND) ? <UploadDeckButton /> : null}
      </Page.Header>

      {runtime?.paused ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          AI sedang dijeda (STOP). Proposal baru menunggu sebagai Antre sampai
          LANJUT di{' '}
          <Link href="/pengaturan" className="underline">
            Pengaturan
          </Link>
          .
        </p>
      ) : null}

      <section aria-labelledby="belum" className="space-y-3">
        <h2 id="belum" className="text-sm font-medium">
          Belum ditanggapi per kategori
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((category) => (
            <Tile
              key={category}
              label={CATEGORY_LABEL[category]}
              value={countFor(category)}
              href={`/proposal?kategori=${category}&tanggapan=belum`}
            />
          ))}
          <Tile
            label={QUALITY_OUTSIDE_FOCUS_LABEL}
            value={outsideFocus}
            href="/proposal?luarFokus=1&tanggapan=belum"
            hint="Tidak cocok, tetapi skor kualitas tinggi"
          />
          <Tile
            label="Perlu dicek manual"
            value={manual}
            href="/proposal?status=perlu_dicek_manual&tanggapan=belum"
            hint="Tidak bisa dinilai otomatis (teks tidak terbaca atau penilaian gagal)"
          />
          <Tile
            label="Baru sejak ringkasan terakhir"
            value={newSinceDigest ?? unresponded.length}
            href="/proposal"
            hint={
              digest
                ? `Sejak ${formatDate(digest.sentAt)} ${formatTime(digest.sentAt)}`
                : 'Belum ada ringkasan — menampilkan semua yang belum ditanggapi'
            }
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>
            {digest
              ? `Ringkasan ${digest.slot} · ${formatDate(digest.sentAt)}`
              : 'Ringkasan terakhir'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {digest ? (
            <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap">
              {digest.text}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              Belum ada ringkasan yang terkirim.
            </p>
          )}
        </CardContent>
      </Card>
    </Page.Root>
  )
}
