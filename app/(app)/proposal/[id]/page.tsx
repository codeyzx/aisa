import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BanknoteIcon,
  CalendarIcon,
  CheckCircle2Icon,
  CircleHelpIcon,
  FileTextIcon,
  LayersIcon,
  ListTreeIcon,
  MailIcon,
  SparklesIcon,
  TagIcon,
  XCircleIcon,
  type LucideIcon,
} from 'lucide-react'
import { type Metadata } from 'next'
import { type ComponentProps } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  AISA_CONFIGURE,
  AISA_READ,
  AISA_RESPOND,
} from '@/features/aisa/aisa.capability'
import { isCorrected } from '@/features/aisa/aisa.calibration'
import {
  CATEGORY_LABEL,
  CRITERION_LABEL,
  CRITERION_LETTER,
  CRITERION_MEANING,
  sectorLabel,
  VIA_LABEL,
} from '@/features/aisa/aisa.labels'
import {
  getAssessmentProgress,
  getJobWithSteps,
  getProposal,
  getRules,
  listProposalHistory,
} from '@/features/aisa/aisa.repo'
import {
  CRITERIA,
  isOutsideFocus,
  type Proposal,
} from '@/features/aisa/aisa.schema'
import { requireCapability } from '@/lib/auth/guards'
import { can } from '@/lib/auth/rbac'
import { formatRupiah } from '@/lib/format/currency'
import { formatDecimal, formatNumber, formatScore } from '@/lib/format/number'
import { cn } from '@/lib/utils'

import {
  DecisionBadge,
  GradeBadge,
  OutsideFocusBadge,
  ScoreBar,
  scoreTone,
  StatusBadge,
} from '../../_components/badges'
import { AskAisaCard } from '../_components/ask-aisa-card'
import { AssessmentLogProvider, LogButton } from '../_components/assessment-log'
import { buildAssessmentLog } from '../_components/assessment-log-data'
import { AssessmentProgressCard } from '../_components/assessment-progress'
import { CorrectionForm } from '../_components/correction-form'
import { DeckButton } from '../_components/deck-button'
import {
  DeckPageLink,
  DeckPreviewButton,
  DeckPreviewProvider,
} from '../_components/deck-preview'
import { DeleteProposalButton } from '../_components/delete-proposal-button'
import { rubricFor } from '../_components/criterion-rubric'
import { GradeCard } from '../_components/grade-card'
import { proposalHistoryEntries } from '../_components/proposal-history'
import {
  compactNumber,
  dateTime,
  initials,
} from '../_components/proposal-format'
import { RespondPanel } from '../_components/respond-panel'

export const metadata: Metadata = { title: 'Detail proposal' }

function Meta({
  icon: Icon,
  children,
}: {
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
      <Icon className="size-3.5" />
      {children}
    </span>
  )
}

const capitalized = 'first-letter:uppercase'

/**
 * Kelebihan and Perlu dicek, read straight from the AI's per-criterion
 * reasons: a criterion it scored 4–5 is a strength, one it scored 1–2 — or
 * found nothing for, or could not back with a verified quote — is a thing to
 * check. Nothing is written that the assessment did not say.
 */
function strengthsAndChecks(proposal: Proposal) {
  const strengths: string[] = []
  const checks: string[] = []
  const criteria = proposal.assessment?.criteria ?? {}
  for (const criterion of CRITERIA) {
    const item = criteria[criterion]
    if (!item) continue
    const line = `${CRITERION_LETTER[criterion]}. ${CRITERION_LABEL[criterion]}: ${item.reason}`
    if (item.notMentioned || item.citationsUnverified || item.value <= 2)
      checks.push(line)
    else if (item.value >= 4) strengths.push(line)
  }
  return { strengths, checks }
}

/**
 * The page's two side panels. The deck preview wraps the log so a citation
 * inside the log can open the preview too.
 */
function DetailPanels({
  deck,
  children,
  ...log
}: ComponentProps<typeof AssessmentLogProvider> &
  ComponentProps<typeof DeckPreviewProvider>) {
  return (
    <DeckPreviewProvider deck={deck}>
      <AssessmentLogProvider {...log}>{children}</AssessmentLogProvider>
    </DeckPreviewProvider>
  )
}

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireCapability(AISA_READ)
  const { id } = await params
  const proposalId = decodeURIComponent(id)
  const [proposal, history, rules] = await Promise.all([
    getProposal(proposalId),
    listProposalHistory(proposalId),
    getRules(),
  ])
  if (!proposal) notFound()
  // Still queued or being scored: the live progress card starts from this.
  const inProgress =
    proposal.status === 'antre' || proposal.status === 'dinilai_proses'
  const [job, progress] = await Promise.all([
    proposal.jobId ? getJobWithSteps(proposal.jobId) : null,
    inProgress ? getAssessmentProgress(proposal.id) : null,
  ])

  const canRespond = can(session, AISA_RESPOND)
  const canDelete = can(session, AISA_CONFIGURE)
  const { assessment, fit, profile } = proposal
  const thresholds = rules?.thresholds ?? null
  const log = job ? buildAssessmentLog(job, proposal, history, rules) : null
  const tone = assessment ? scoreTone(assessment.score, thresholds) : null
  const decision = proposal.response?.kind ?? null
  const entries = proposalHistoryEntries(history, proposal.response)
  const { strengths, checks } = strengthsAndChecks(proposal)
  const tokens = proposal.tokens.in + proposal.tokens.out
  const weightsDiffer =
    assessment && rules && rules.version !== assessment.rulesVersion

  const fitItems = fit
    ? [
        { key: 'Sektor', check: fit.checks.sector },
        { key: 'Tahap', check: fit.checks.stage },
        { key: 'Dana', check: fit.checks.funding },
      ]
    : []
  const fitCount = fitItems.filter((item) => item.check.passed).length
  // A Form deck stays in Drive and opens there only while its id is known.
  const hasDeck =
    proposal.source.kind === 'upload' || Boolean(proposal.source.driveFileId)

  return (
    <DetailPanels
      log={log}
      deck={
        hasDeck
          ? {
              proposalId: proposal.id,
              fileName: proposal.source.fileName,
              pageCount: proposal.pageCount,
            }
          : null
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/proposal"
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm' }),
              '-ml-2',
            )}
          >
            <ArrowLeftIcon />
            Semua proposal
          </Link>
          {canDelete ? (
            <DeleteProposalButton
              proposalId={proposal.id}
              proposalName={proposal.name}
            />
          ) : null}
        </div>

        <Card className="py-0">
          <CardContent className="flex flex-col gap-5 p-5 md:flex-row md:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-lg font-semibold text-primary">
                {initials(proposal.name)}
              </span>
              <div className="min-w-0 space-y-2">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {proposal.name}
                  </h2>
                  {profile?.oneLiner ? (
                    <p className="text-muted-foreground">{profile.oneLiner}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <Meta icon={TagIcon}>
                    {profile?.sector ? (
                      <span>{sectorLabel(profile.sector)}</span>
                    ) : (
                      'Sektor tidak disebut'
                    )}
                  </Meta>
                  <Meta icon={LayersIcon}>
                    {profile?.stage ? (
                      <span className={capitalized}>{profile.stage}</span>
                    ) : (
                      'Tahap tidak disebut'
                    )}
                  </Meta>
                  <Meta icon={BanknoteIcon}>
                    {profile?.fundingAskIdr != null
                      ? `Cari ${formatRupiah(profile.fundingAskIdr)}`
                      : 'Dana tidak disebut'}
                  </Meta>
                  <Meta icon={CalendarIcon}>
                    Masuk {dateTime(proposal.createdAt)}
                  </Meta>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {proposal.effectiveCategory ? (
                    <GradeBadge category={proposal.effectiveCategory} />
                  ) : null}
                  {proposal.status !== 'dinilai' ? (
                    <StatusBadge status={proposal.status} />
                  ) : null}
                  <DecisionBadge decision={decision} />
                  {isCorrected(proposal) ? (
                    <Badge variant="outline">dikoreksi</Badge>
                  ) : null}
                  {isOutsideFocus(proposal) ? (
                    <OutsideFocusBadge fit={fit} />
                  ) : null}
                </div>
                {proposal.statusReason ? (
                  <p className="text-[13px] text-muted-foreground">
                    {proposal.statusReason}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="w-full shrink-0 rounded-xl bg-muted/50 p-4 md:w-56">
              <p className="text-xs font-medium text-muted-foreground">
                Skor kualitas
              </p>
              {assessment && tone ? (
                <>
                  <p className="mt-1 flex items-baseline gap-1">
                    <span
                      className={cn(
                        'text-4xl font-semibold tabular-nums',
                        tone.text,
                      )}
                    >
                      {formatScore(assessment.score)}
                    </span>
                    <span className="text-sm text-muted-foreground">/100</span>
                  </p>
                  <ScoreBar
                    score={assessment.score}
                    thresholds={thresholds}
                    className="mt-3 h-2"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {fit
                      ? `${fitCount} dari 3 syarat fokus terpenuhi`
                      : 'Belum ada cek kecocokan'}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-4xl font-semibold text-muted-foreground">
                    —
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {proposal.status === 'perlu_dicek_manual'
                      ? 'Tidak dinilai: proposal perlu dicek manual, tanpa skor dan grade.'
                      : 'Belum ada penilaian.'}
                  </p>
                </>
              )}
              <LogButton
                variant="outline"
                size="sm"
                className="mt-3 w-full bg-card"
              >
                <ListTreeIcon />
                Lihat log penilaian
              </LogButton>
            </div>
          </CardContent>
        </Card>

        <AssessmentProgressCard proposalId={proposal.id} initial={progress} />

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-5">
            <GradeCard
              proposal={proposal}
              thresholds={thresholds}
              weights={rules?.weights}
            />

            {assessment ? (
              <Card className="gap-4 border-primary/25 bg-gradient-to-b from-primary/[0.06] to-transparent">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="gap-1 bg-primary text-primary-foreground">
                      <SparklesIcon />
                      Ringkasan AI
                    </Badge>
                    <span
                      className="text-xs text-muted-foreground"
                      title={`${formatNumber(proposal.tokens.in)} token masuk / ${formatNumber(proposal.tokens.out)} token keluar`}
                    >
                      Dibuat dari proposal · {compactNumber(tokens)} token
                    </span>
                  </div>
                  <CardAction>
                    <LogButton variant="ghost" size="sm">
                      Cara AI menilai
                      <ArrowRightIcon />
                    </LogButton>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-4">
                  {profile?.oneLiner ? (
                    <p className="text-[15px] leading-relaxed">
                      {proposal.name} — {profile.oneLiner}
                    </p>
                  ) : null}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-success/20 bg-success-soft/50 p-4">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
                        <CheckCircle2Icon className="size-4" />
                        Kelebihan
                      </p>
                      {strengths.length ? (
                        <ul className="mt-2 space-y-1.5 text-sm">
                          {strengths.map((item) => (
                            <li key={item} className="flex gap-2">
                              <span className="mt-2 size-1 shrink-0 rounded-full bg-success" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Tidak ada kriteria bernilai 4 atau 5.
                        </p>
                      )}
                    </div>
                    <div className="rounded-xl border border-warning/25 bg-warning-soft/50 p-4">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
                        <AlertTriangleIcon className="size-4" />
                        Perlu dicek
                      </p>
                      {checks.length ? (
                        <ul className="mt-2 space-y-1.5 text-sm">
                          {checks.map((item) => (
                            <li key={item} className="flex gap-2">
                              <span className="mt-2 size-1 shrink-0 rounded-full bg-warning" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Tidak ada kriteria bernilai 1–2 atau tanpa bukti.
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    AI bisa salah. Cocokkan dengan kutipan di bawah, atau buka
                    log penilaian untuk melihat alasannya.
                  </p>
                </CardContent>
              </Card>
            ) : null}

            <Card className="gap-0 pb-0">
              <CardHeader className="border-b pb-4">
                <CardTitle>Nilai per kriteria</CardTitle>
                <CardDescription>
                  Lima kriteria A–E. AI memberi nilai 1–5 beserta kutipan dari
                  proposal dan alasannya; skor akhir (0–100) dihitung dari
                  bobotnya.
                  {assessment
                    ? ` Aturan v${assessment.rulesVersion} · model ${assessment.model}.`
                    : ''}
                  {weightsDiffer
                    ? ` Bobot dan patokan skor yang tampil dari aturan v${rules.version} yang berlaku sekarang.`
                    : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {assessment ? (
                  <ul>
                    {CRITERIA.map((criterion) => {
                      const item = assessment.criteria[criterion]
                      // Anchors are keyed "1".."5"; older rules may store a
                      // level empty, and an empty one is simply not shown.
                      const rubric = item
                        ? rubricFor(rules?.anchors[criterion], item.value)
                        : null
                      return (
                        <li
                          key={criterion}
                          data-criterion={criterion}
                          className="grid gap-3 border-b px-6 py-4 last:border-0 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-6"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <p className="flex items-start gap-2 font-medium">
                                <span
                                  aria-hidden
                                  className="grid size-5 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground"
                                >
                                  {CRITERION_LETTER[criterion]}
                                </span>
                                <span>
                                  <span className="sr-only">
                                    {CRITERION_LETTER[criterion]}.{' '}
                                  </span>
                                  {CRITERION_LABEL[criterion]}
                                </span>
                              </p>
                              <p className="text-sm font-semibold tabular-nums">
                                {item ? item.value : '–'}
                                <span className="text-xs font-normal text-muted-foreground">
                                  /5
                                </span>
                              </p>
                            </div>
                            {/* A 1–5 value is not a score band, so its bar stays
                                neutral rather than wearing a grade colour. */}
                            <ScoreBar
                              score={(item?.value ?? 0) * 20}
                              thresholds={null}
                              className="mt-2"
                            />
                            <p className="mt-1.5 text-xs text-muted-foreground">
                              {rules
                                ? `Bobot ${formatDecimal(
                                    rules.weights[criterion] * 100,
                                    { max: 1 },
                                  )}% · `
                                : ''}
                              {CRITERION_MEANING[criterion]}
                            </p>
                          </div>
                          {!item ? (
                            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              Tidak ada hasil untuk kriteria ini.
                            </p>
                          ) : (
                            <div className="space-y-2 md:border-l-2 md:border-border md:pl-4">
                              {item.notMentioned ? (
                                <p className="flex items-center gap-1.5 text-sm text-warning">
                                  <CircleHelpIcon className="size-4" />
                                  Tidak disebut di deck
                                </p>
                              ) : null}
                              {item.citations.map((citation) => (
                                <blockquote
                                  key={`${citation.page}:${citation.quote}`}
                                  className="text-[13.5px] leading-relaxed"
                                >
                                  “{citation.quote}”
                                  <DeckPageLink
                                    page={citation.page}
                                    className="ml-1.5 inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 align-middle text-[11px] font-medium whitespace-nowrap text-muted-foreground hover:bg-primary/10"
                                  >
                                    <FileTextIcon className="size-3" />
                                    Hal. {citation.page}
                                  </DeckPageLink>
                                </blockquote>
                              ))}
                              {item.citationsUnverified ? (
                                <Badge
                                  variant="outline"
                                  title="Tidak ada kutipan yang ditemukan di halamannya, jadi nilai dibatasi 2"
                                >
                                  kutipan tidak terverifikasi
                                </Badge>
                              ) : null}
                              <div
                                data-testid="criterion-why"
                                className="space-y-1.5 rounded-lg bg-muted/50 px-3 py-2.5 text-[13px]"
                              >
                                <p className="font-medium">
                                  Mengapa {item.value}/5?
                                </p>
                                <p className="text-muted-foreground">
                                  {item.reason}
                                </p>
                                {item.notMentioned ? (
                                  <p className="text-muted-foreground">
                                    Deck tidak membahas kriteria ini, jadi
                                    nilainya 1, nilai terendah.
                                  </p>
                                ) : null}
                                {item.citationsUnverified ? (
                                  <p className="text-muted-foreground">
                                    Kutipan yang diberikan AI tidak ditemukan di
                                    halaman deck yang disebut, jadi nilainya
                                    dibatasi paling tinggi 2. Cek sendiri di
                                    deck sebelum memutuskan.
                                  </p>
                                ) : null}
                                {rubric?.current ? (
                                  <p>
                                    <span className="font-medium">
                                      Patokan skor {rubric.current.level}:
                                    </span>{' '}
                                    {rubric.current.text}
                                  </p>
                                ) : null}
                                {rubric?.next ? (
                                  <p>
                                    <span className="font-medium">
                                      Untuk naik ke skor {rubric.next.level}:
                                    </span>{' '}
                                    {rubric.next.text}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="px-6 py-6 text-sm text-muted-foreground">
                    {proposal.status === 'perlu_dicek_manual'
                      ? 'Tidak dinilai: proposal perlu dicek manual, tanpa skor dan grade.'
                      : 'Belum ada penilaian.'}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sesuai fokus investasi?</CardTitle>
                <CardDescription>
                  Dicek otomatis dari aturan penilaian, tanpa AI. Tidak mengubah
                  grade; yang di luar fokus diberi prioritas rendah.
                </CardDescription>
                <CardAction>
                  <Link
                    href="/aturan"
                    className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                  >
                    Lihat aturan
                  </Link>
                </CardAction>
              </CardHeader>
              <CardContent>
                {fit ? (
                  <ul className="grid gap-3 sm:grid-cols-3">
                    {fitItems.map((item) => (
                      <li
                        key={item.key}
                        className={cn(
                          'rounded-xl border p-3',
                          item.check.passed
                            ? 'border-success/20 bg-success-soft/40'
                            : 'border-danger/20 bg-danger-soft/40',
                        )}
                      >
                        <p
                          className={cn(
                            'flex items-center gap-1.5 text-sm font-semibold',
                            item.check.passed ? 'text-success' : 'text-danger',
                          )}
                        >
                          {item.check.passed ? (
                            <CheckCircle2Icon className="size-4" />
                          ) : (
                            <XCircleIcon className="size-4" />
                          )}
                          {item.key}
                          <span className="sr-only">
                            {item.check.passed ? ' lulus' : ' gagal'}
                          </span>
                        </p>
                        <p className="mt-1 text-[13px] text-muted-foreground">
                          {item.check.reason}
                        </p>
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
                <CardTitle>Riwayat</CardTitle>
                <CardDescription>
                  Dari proposal masuk sampai keputusan terakhir
                </CardDescription>
                <CardAction>
                  <LogButton variant="ghost" size="sm">
                    Log penilaian
                  </LogButton>
                </CardAction>
              </CardHeader>
              <CardContent>
                {entries.length ? (
                  <ol className="ml-1.5 space-y-6 border-l pl-6">
                    {entries.map((row, i) => (
                      <li key={row.id} className="relative">
                        <span
                          aria-hidden
                          className={cn(
                            'absolute top-1 -left-[calc(1.5rem+5.5px)] size-2.5 rounded-full ring-4 ring-card',
                            i === 0 ? 'bg-primary' : 'bg-muted-foreground/40',
                          )}
                        />
                        <p className="text-sm font-medium">{row.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {row.detail}
                          {row.reason ? ` — ${row.reason}` : ''} · via{' '}
                          {VIA_LABEL[row.via]}
                        </p>
                        <time className="text-xs text-muted-foreground">
                          {dateTime(row.at)}
                        </time>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Belum ada riwayat.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="flex flex-col gap-5 xl:sticky xl:top-0">
            <Card>
              <CardHeader>
                <CardTitle>
                  {canRespond ? 'Keputusan Anda' : 'Keputusan'}
                </CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  Sekarang: <DecisionBadge decision={decision} />
                  {proposal.response ? (
                    <span className="basis-full text-xs">
                      {dateTime(proposal.response.at)} via{' '}
                      {VIA_LABEL[proposal.response.via]}
                    </span>
                  ) : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {proposal.response?.note ? (
                  <p className="rounded-lg bg-muted/60 px-3 py-2 text-[13px]">
                    “{proposal.response.note}”
                  </p>
                ) : null}
                {canRespond ? (
                  <RespondPanel
                    proposalId={proposal.id}
                    proposalName={proposal.name}
                    current={decision}
                    retentionDays={rules?.retentionDays ?? null}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Akun Anda hanya bisa membaca; tanggapan diberikan manajer
                    investasi.
                  </p>
                )}
              </CardContent>
            </Card>

            <AskAisaCard proposalName={proposal.name} />

            <Card>
              <CardHeader>
                <CardTitle>Founder</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {proposal.founder?.name || proposal.founder?.email ? (
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">
                      {initials(
                        proposal.founder.name ?? proposal.founder.email ?? '',
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {proposal.founder.name ?? 'Nama tidak disebut'}
                      </p>
                      {proposal.founder.email ? (
                        <p className="truncate text-sm text-muted-foreground">
                          {proposal.founder.email}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Data founder tidak disebut.
                  </p>
                )}
                {proposal.founder?.email || hasDeck ? (
                  <div className="grid grid-cols-2 gap-2">
                    {hasDeck ? (
                      <DeckPreviewButton size="sm" className="col-span-2" />
                    ) : null}
                    {proposal.founder?.email ? (
                      <a
                        href={`mailto:${proposal.founder.email}`}
                        className={cn(
                          buttonVariants({ variant: 'outline', size: 'sm' }),
                          proposal.source.kind !== 'upload' && 'col-span-2',
                        )}
                      >
                        <MailIcon />
                        Email
                      </a>
                    ) : null}
                    {proposal.source.kind === 'upload' ? (
                      <DeckButton
                        proposalId={proposal.id}
                        className={
                          proposal.founder?.email ? undefined : 'col-span-2'
                        }
                      />
                    ) : null}
                  </div>
                ) : null}
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileTextIcon className="size-3.5 shrink-0" />
                  <span className="truncate">
                    {proposal.source.kind === 'form' ? 'Form' : 'Unggahan'} ·{' '}
                    {proposal.source.fileName} ·{' '}
                    {formatNumber(proposal.pageCount)} halaman
                  </span>
                </p>
              </CardContent>
            </Card>

            {(canRespond && proposal.status === 'dinilai') ||
            proposal.correction ? (
              <Card>
                <CardHeader>
                  <CardTitle>Grade kurang pas?</CardTitle>
                  <CardDescription>
                    {proposal.correction
                      ? `AI menilai ${proposal.category ? CATEGORY_LABEL[proposal.category] : '—'}, lalu dikoreksi ke ${CATEGORY_LABEL[proposal.correction.category]} (${dateTime(proposal.correction.at)}, ${VIA_LABEL[proposal.correction.via]}): “${proposal.correction.reason}”.`
                      : 'Pilih grade yang menurut Anda lebih tepat. Skor dari AI tetap disimpan.'}
                  </CardDescription>
                </CardHeader>
                {canRespond && proposal.status === 'dinilai' ? (
                  <CardContent>
                    <CorrectionForm
                      proposalId={proposal.id}
                      current={proposal.effectiveCategory ?? null}
                    />
                  </CardContent>
                ) : null}
              </Card>
            ) : null}
          </aside>
        </div>
      </div>
    </DetailPanels>
  )
}
