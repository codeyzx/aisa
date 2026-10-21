import { type Metadata } from 'next'
import Link from 'next/link'

import { Page } from '@/components/shell/page-container'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AISA_READ } from '@/features/aisa/aisa.capability'
import {
  CATEGORY_LABEL,
  QUALITY_OUTSIDE_FOCUS_LABEL,
  STATUS_LABEL,
} from '@/features/aisa/aisa.labels'
import { listRecentProposals, PROPOSAL_WINDOW } from '@/features/aisa/aisa.repo'
import {
  CATEGORIES,
  PROPOSAL_STATUSES,
  showsQualityOutsideFocus,
} from '@/features/aisa/aisa.schema'
import { requireCapability } from '@/lib/auth/guards'
import { formatDate } from '@/lib/format/date'
import { formatNumber } from '@/lib/format/number'
import { cn } from '@/lib/utils'

import { CategoryCell, ResponseCell } from '../_components/badges'
import { UploadDeckButton } from '../_components/upload-deck-button'
import { BulkRespond } from './_components/bulk-respond'
import { parseProposalListParams } from './search-params'

export const metadata: Metadata = { title: 'Proposal' }

const selectClass =
  'h-8 rounded-lg border border-input bg-background px-2 text-sm dark:bg-input/30'

export default async function ProposalListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(AISA_READ)
  const params = parseProposalListParams(await searchParams)
  const all = await listRecentProposals()

  const sectors = [
    ...new Set(
      all.map((p) => p.profile?.sector).filter((s): s is string => !!s),
    ),
  ].sort((a, b) => a.localeCompare(b, 'id'))

  const needle = params.q?.toLowerCase()
  const rows = all.filter(
    (p) =>
      (!params.kategori || p.effectiveCategory === params.kategori) &&
      (!params.status || p.status === params.status) &&
      (!params.sektor || p.profile?.sector === params.sektor) &&
      (!params.tanggapan || p.responded === (params.tanggapan === 'sudah')) &&
      (!params.luarFokus || showsQualityOutsideFocus(p)) &&
      (!needle || p.nameLower.includes(needle)),
  )
  const bulkCandidates = params.kategori
    ? all.filter((p) => !p.responded && p.effectiveCategory === params.kategori)
        .length
    : 0

  return (
    <Page.Root>
      <Page.Header
        title="Proposal"
        description="Semua proposal yang masuk, terbaru di atas."
      >
        <UploadDeckButton />
      </Page.Header>

      {/* A GET form: filters are a shareable URL and work before hydration. */}
      <search>
        <form className="flex flex-wrap items-end gap-2">
          <label htmlFor="cari-nama" className="grid gap-1 text-xs">
            Cari nama
            <Input
              id="cari-nama"
              name="q"
              defaultValue={params.q}
              className="w-48"
            />
          </label>
          <label className="grid gap-1 text-xs">
            Kategori efektif
            <select
              name="kategori"
              defaultValue={params.kategori ?? ''}
              className={selectClass}
            >
              <option value="">Semua</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            Status
            <select
              name="status"
              defaultValue={params.status ?? ''}
              className={selectClass}
            >
              <option value="">Semua</option>
              {PROPOSAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            Sektor
            <select
              name="sektor"
              defaultValue={params.sektor ?? ''}
              className={selectClass}
            >
              <option value="">Semua</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            Tanggapan
            <select
              name="tanggapan"
              defaultValue={params.tanggapan ?? ''}
              className={selectClass}
            >
              <option value="">Semua</option>
              <option value="belum">Belum ditanggapi</option>
              <option value="sudah">Sudah ditanggapi</option>
            </select>
          </label>
          <label className="flex h-8 items-center gap-2 text-xs">
            <input
              type="checkbox"
              name="luarFokus"
              value="1"
              defaultChecked={params.luarFokus === '1'}
            />
            {QUALITY_OUTSIDE_FOCUS_LABEL}
          </label>
          <button type="submit" className={cn(buttonVariants({ size: 'sm' }))}>
            Terapkan
          </button>
          <Link
            href="/proposal"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
          >
            Reset
          </Link>
        </form>
      </search>

      {params.kategori && bulkCandidates > 0 ? (
        <BulkRespond
          category={params.kategori}
          categoryLabel={CATEGORY_LABEL[params.kategori]}
          count={bulkCandidates}
        />
      ) : null}

      <Table>
        <TableCaption className="sr-only">
          Daftar proposal — nama, sektor, skor, kategori, tanggapan, tanggal
          masuk
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Nama</TableHead>
            <TableHead>Sektor</TableHead>
            <TableHead className="text-right">Skor</TableHead>
            <TableHead>Kategori</TableHead>
            <TableHead>Tanggapan</TableHead>
            <TableHead className="text-right">Masuk</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-8 text-center text-muted-foreground"
              >
                Tidak ada proposal yang cocok dengan filter ini.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link
                    href={`/proposal/${encodeURIComponent(p.id)}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {p.name}
                  </Link>
                  {p.profile?.oneLiner ? (
                    <p className="max-w-xs truncate text-xs text-muted-foreground">
                      {p.profile.oneLiner}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell>{p.profile?.sector ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.assessment ? p.assessment.score.toFixed(1) : '—'}
                </TableCell>
                <TableCell>
                  <CategoryCell proposal={p} />
                </TableCell>
                <TableCell>
                  <ResponseCell proposal={p} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatDate(p.createdAt)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <p className="text-sm text-muted-foreground">
        Menampilkan {formatNumber(rows.length)} dari {formatNumber(all.length)}{' '}
        proposal
        {all.length >= PROPOSAL_WINDOW
          ? ` (hanya ${formatNumber(PROPOSAL_WINDOW)} proposal terbaru yang dimuat)`
          : ''}
        .
      </p>
    </Page.Root>
  )
}
