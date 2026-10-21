import { type Metadata } from 'next'
import Link from 'next/link'

import { Page } from '@/components/shell/page-container'
import { Badge } from '@/components/ui/badge'
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
  HISTORY_ACTION_LABEL,
  labelOf,
  VIA_LABEL,
} from '@/features/aisa/aisa.labels'
import { listHistory } from '@/features/aisa/aisa.repo'
import { DELETED_PROPOSAL_NAME } from '@/features/aisa/aisa.schema'
import { requireCapability } from '@/lib/auth/guards'
import { formatDate, formatTime } from '@/lib/format/date'

export const metadata: Metadata = { title: 'Riwayat' }

const LIMIT = 200

export default async function RiwayatPage() {
  await requireCapability(AISA_READ)
  const rows = await listHistory(LIMIT)

  return (
    <Page.Root>
      <Page.Header
        title="Riwayat"
        description={`Jejak audit semua tanggapan, koreksi, perubahan aturan, dan STOP/LANJUT — ${LIMIT} terbaru.`}
      />
      <Table>
        <TableCaption className="sr-only">
          Riwayat — waktu, aksi, proposal, keterangan, alasan, lewat
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Waktu</TableHead>
            <TableHead>Aksi</TableHead>
            <TableHead>Proposal</TableHead>
            <TableHead>Keterangan</TableHead>
            <TableHead>Alasan</TableHead>
            <TableHead>Lewat</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-8 text-center text-muted-foreground"
              >
                Belum ada riwayat.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id} className="align-top">
                <TableCell className="tabular-nums">
                  {formatDate(row.at)} {formatTime(row.at)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {labelOf(HISTORY_ACTION_LABEL, row.action)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {row.proposalName === DELETED_PROPOSAL_NAME ? (
                    <span className="text-muted-foreground">
                      {DELETED_PROPOSAL_NAME}
                    </span>
                  ) : row.proposalId ? (
                    <Link
                      href={`/proposal/${encodeURIComponent(row.proposalId)}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {row.proposalName ?? row.proposalId}
                    </Link>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {row.detail}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {row.reason ?? '—'}
                </TableCell>
                <TableCell>{VIA_LABEL[row.via]}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Page.Root>
  )
}
