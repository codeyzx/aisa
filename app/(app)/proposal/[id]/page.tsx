import { type Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Page } from '@/components/shell/page-container'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AISA_CONFIGURE,
  AISA_READ,
  AISA_RESPOND,
} from '@/features/aisa/aisa.capability'
import {
  CATEGORY_LABEL,
  CRITERION_LABEL,
  HISTORY_ACTION_LABEL,
  labelOf,
  QUALITY_OUTSIDE_FOCUS_LABEL,
  RESPONSE_LABEL,
  STATUS_LABEL,
  VIA_LABEL,
} from '@/features/aisa/aisa.labels'
import { getProposal, listProposalHistory } from '@/features/aisa/aisa.repo'
import { CRITERIA, showsQualityOutsideFocus } from '@/features/aisa/aisa.schema'
import { requireCapability } from '@/lib/auth/guards'
import { can } from '@/lib/auth/rbac'
import { formatRupiah } from '@/lib/format/currency'
import { formatDate, formatTime } from '@/lib/format/date'
import { formatNumber, formatScore } from '@/lib/format/number'
import { cn } from '@/lib/utils'

import { CategoryCell } from '../../_components/badges'
import { CorrectionForm } from '../_components/correction-form'
import { DeckButton } from '../_components/deck-button'
import { DeleteProposalButton } from '../_components/delete-proposal-button'
import { RespondPanel } from '../_components/respond-panel'

export const metadata: Metadata = { title: 'Detail proposal' }

function when(date: Date) {
  return `${formatDate(date)} ${formatTime(date)}`
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  )
}

const notMentioned = (
  <span className="text-muted-foreground">tidak disebut</span>
)

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireCapability(AISA_READ)
  const { id } = await params
  const proposalId = decodeURIComponent(id)
  const [proposal, history] = await Promise.all([
    getProposal(proposalId),
    listProposalHistory(proposalId),
  ])
  if (!proposal) notFound()
  const canRespond = can(session, AISA_RESPOND)
  const canDelete = can(session, AISA_CONFIGURE)
  const { assessment, fit, profile } = proposal

  return (
    <Page.Root>
      <Page.Header
        eyebrow={<Link href="/proposal">← Proposal</Link>}
        title={proposal.name}
        description={profile?.oneLiner ?? undefined}
      >
        {proposal.source.kind === 'upload' ? (
          <DeckButton proposalId={proposal.id} />
        ) : null}
        {proposal.jobId ? (
          <Link
            href={`/aktivitas?job=${encodeURIComponent(proposal.jobId)}#job-${proposal.jobId}`}
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Lihat log penilaian
          </Link>
        ) : null}
        {canDelete ? (
          <DeleteProposalButton
            proposalId={proposal.id}
            proposalName={proposal.name}
          />
        ) : null}
      </Page.Header>

      <div className="flex flex-wrap items-center gap-2">
        {proposal.effectiveCategory ? (
          <CategoryCell proposal={proposal} />
        ) : null}
        <Badge
          variant={
            proposal.status === 'perlu_dicek_manual' ? 'destructive' : 'outline'
          }
        >
          {STATUS_LABEL[proposal.status]}
        </Badge>
        {proposal.statusReason ? (
          <span className="text-sm text-muted-foreground">
            {proposal.statusReason}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Profil</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Fact label="Sektor" value={profile?.sector ?? notMentioned} />
              <Fact label="Tahap" value={profile?.stage ?? notMentioned} />
              <Fact
                label="Dana yang diminta"
                value={
                  profile?.fundingAskIdr != null
                    ? formatRupiah(profile.fundingAskIdr)
                    : notMentioned
                }
              />
              <Fact label="Halaman" value={formatNumber(proposal.pageCount)} />
              <Fact
                label="Sumber"
                value={`${proposal.source.kind === 'form' ? 'Form' : 'Unggahan'} · ${proposal.source.fileName}`}
              />
              <Fact label="Masuk" value={when(proposal.createdAt)} />
              <Fact
                label="Token (masuk / keluar)"
                value={`${formatNumber(proposal.tokens.in)} / ${formatNumber(proposal.tokens.out)}`}
              />
              <Fact
                label="Dinilai"
                value={proposal.assessedAt ? when(proposal.assessedAt) : '—'}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tanggapan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {proposal.response ? (
              <p className="text-sm">
                <Badge>{RESPONSE_LABEL[proposal.response.kind]}</Badge>{' '}
                {when(proposal.response.at)} via{' '}
                {VIA_LABEL[proposal.response.via]}
                {proposal.response.note ? ` — ${proposal.response.note}` : ''}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Belum ditanggapi.</p>
            )}
            {canRespond ? (
              <RespondPanel
                proposalId={proposal.id}
                current={proposal.response?.kind ?? null}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Tahap 1 — Skor kualitas{' '}
            {assessment ? (
              <span className="tabular-nums">
                {formatScore(assessment.score)}
              </span>
            ) : null}
          </CardTitle>
          {assessment ? (
            <p className="text-xs text-muted-foreground">
              Aturan v{assessment.rulesVersion} · model {assessment.model} ·
              skor = Σ bobot × (nilai − 1) / 4, dihitung kode
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          {assessment ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kriteria</TableHead>
                  <TableHead className="text-right">Nilai</TableHead>
                  <TableHead>Alasan dan kutipan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {CRITERIA.map((criterion) => {
                  const item = assessment.criteria[criterion]
                  if (!item)
                    return (
                      <TableRow key={criterion}>
                        <TableCell className="font-medium">
                          {CRITERION_LABEL[criterion]}
                        </TableCell>
                        <TableCell className="text-right">—</TableCell>
                        <TableCell className="text-muted-foreground">
                          Tidak ada hasil untuk kriteria ini.
                        </TableCell>
                      </TableRow>
                    )
                  return (
                    <TableRow key={criterion} className="align-top">
                      <TableCell className="font-medium">
                        {CRITERION_LABEL[criterion]}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.value}/5
                      </TableCell>
                      <TableCell className="space-y-1 whitespace-normal">
                        {item.notMentioned || item.citationsUnverified ? (
                          <div className="flex flex-wrap gap-1">
                            {item.notMentioned ? (
                              <Badge variant="destructive">tidak disebut</Badge>
                            ) : null}
                            {item.citationsUnverified ? (
                              <Badge
                                variant="outline"
                                title="Tidak ada kutipan yang ditemukan di halamannya, jadi nilai dibatasi 2"
                              >
                                kutipan tidak terverifikasi
                              </Badge>
                            ) : null}
                          </div>
                        ) : null}
                        <p>{item.reason}</p>
                        {item.citations.length ? (
                          <ul className="space-y-0.5 text-xs text-muted-foreground">
                            {item.citations.map((c, i) => (
                              <li key={i}>
                                <span className="font-medium text-foreground">
                                  hal. {c.page}
                                </span>{' '}
                                “{c.quote}”
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              {proposal.status === 'perlu_dicek_manual'
                ? 'Tidak dinilai: deck perlu dicek manual, tanpa skor dan kategori.'
                : 'Belum ada penilaian.'}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              Tahap 2 — Cek kecocokan{' '}
              {fit ? (
                <Badge variant={fit.passed ? 'secondary' : 'destructive'}>
                  {fit.passed ? 'Lulus' : 'Gagal'}
                </Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fit ? (
              <ul className="space-y-2 text-sm">
                {(
                  [
                    ['Sektor', fit.checks.sector],
                    ['Tahap pendanaan', fit.checks.stage],
                    ['Besar dana', fit.checks.funding],
                  ] as const
                ).map(([label, check]) => (
                  <li key={label} className="flex gap-2">
                    <Badge variant={check.passed ? 'secondary' : 'destructive'}>
                      {check.passed ? 'Lulus' : 'Gagal'}
                    </Badge>
                    <span>
                      <span className="font-medium">{label}:</span>{' '}
                      {check.reason}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Belum ada cek kecocokan.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kategori</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              <Fact
                label="Dari kode"
                value={
                  proposal.category ? CATEGORY_LABEL[proposal.category] : '—'
                }
              />
              <Fact
                label="Efektif"
                value={
                  proposal.effectiveCategory
                    ? CATEGORY_LABEL[proposal.effectiveCategory]
                    : '—'
                }
              />
            </dl>
            {showsQualityOutsideFocus(proposal) ? (
              <Badge variant="outline">{QUALITY_OUTSIDE_FOCUS_LABEL}</Badge>
            ) : null}
            {proposal.correction ? (
              <p>
                Dikoreksi ke{' '}
                <strong>{CATEGORY_LABEL[proposal.correction.category]}</strong>{' '}
                ({when(proposal.correction.at)},{' '}
                {VIA_LABEL[proposal.correction.via]}):{' '}
                {proposal.correction.reason}
              </p>
            ) : null}
            {canRespond && proposal.status === 'dinilai' ? (
              <CorrectionForm
                proposalId={proposal.id}
                current={proposal.effectiveCategory ?? null}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat proposal ini</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length ? (
            <ul className="space-y-2 text-sm">
              {history.map((row) => (
                <li key={row.id} className="flex flex-wrap gap-2">
                  <span className="text-muted-foreground tabular-nums">
                    {when(row.at)}
                  </span>
                  <Badge variant="outline">
                    {labelOf(HISTORY_ACTION_LABEL, row.action)}
                  </Badge>
                  <span>{row.detail}</span>
                  {row.reason ? (
                    <span className="text-muted-foreground">
                      — {row.reason}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground">
                    ({VIA_LABEL[row.via]})
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Belum ada riwayat.</p>
          )}
        </CardContent>
      </Card>
    </Page.Root>
  )
}
