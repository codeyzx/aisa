import { ArrowRightIcon, ChevronDownIcon, CompassIcon } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  CATEGORY_ACTION,
  CATEGORY_EXPLANATION,
  CATEGORY_LABEL,
  failedFitChecks,
  gradeBands,
  gradeOf,
  OUTSIDE_FOCUS_LABEL,
  OUTSIDE_FOCUS_MEANING,
  VIA_LABEL,
  type GradeBand,
} from '@/features/aisa/aisa.labels'
import {
  isOutsideFocus,
  type Proposal,
  type Thresholds,
} from '@/features/aisa/aisa.schema'
import { formatScore } from '@/lib/format/number'
import { cn } from '@/lib/utils'

import {
  CATEGORY_DOT,
  CATEGORY_SOFT,
  CATEGORY_TEXT,
  GradeBadge,
} from '../../_components/badges'
import { GradeGuide } from '../../_components/grade-guide'
import { dateTime } from './proposal-format'

/** Where `score` sits along the five bands drawn at equal width, in percent. */
function markerPercent(score: number, bands: GradeBand[]) {
  // Worst band first, so the scale reads left to right like a number line.
  const ordered = bands.toReversed()
  const i = ordered.findIndex(
    (band) => score >= band.min && (band.below == null || score < band.below),
  )
  const band = ordered[i]
  if (!band) return 0
  const top = band.below ?? 100
  const within = top > band.min ? (score - band.min) / (top - band.min) : 0
  return ((i + Math.min(1, Math.max(0, within))) / ordered.length) * 100
}

/**
 * The five grade bands as one bar, worst to best, with the score marked on it.
 * The bands are drawn at equal width so a narrow band (Layak bersyarat spans
 * ten points) stays readable; the marker sits proportionally inside its band.
 */
function GradeScale({
  score,
  thresholds,
}: {
  score: number
  thresholds: Thresholds
}) {
  const bands = gradeBands(thresholds)
  const current = gradeOf(score, thresholds)
  const band = bands.find((entry) => entry.category === current)!
  const left = Math.min(97, Math.max(3, markerPercent(score, bands)))
  return (
    <div data-testid="grade-scale">
      <p className="sr-only">
        Skor {formatScore(score)} dari 100 berada di rentang {band.text}:{' '}
        {CATEGORY_LABEL[current]}.
      </p>
      <div aria-hidden>
        <div className="relative pt-7">
          <div
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${left}%` }}
          >
            <span className="rounded-md bg-foreground px-1.5 py-0.5 text-[11px] font-semibold text-background tabular-nums">
              {formatScore(score)}
            </span>
            <span className="-mt-px size-0 border-x-4 border-t-4 border-x-transparent border-t-foreground" />
          </div>
          <div className="grid grid-cols-5 gap-1">
            {bands.toReversed().map((entry) => (
              <span
                key={entry.category}
                className={cn(
                  'h-2.5 rounded-full',
                  CATEGORY_DOT[entry.category],
                  entry.category !== current && 'opacity-25',
                )}
              />
            ))}
          </div>
        </div>
        <div className="mt-1.5 grid grid-cols-5 gap-1">
          {bands.toReversed().map((entry) => {
            const active = entry.category === current
            return (
              <div key={entry.category} className="min-w-0 text-[11px]">
                <p
                  className={cn(
                    'font-mono tabular-nums',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {entry.text}
                </p>
                <p
                  className={cn(
                    'leading-tight',
                    active
                      ? cn('font-semibold', CATEGORY_TEXT[entry.category])
                      : 'text-muted-foreground',
                  )}
                >
                  {CATEGORY_LABEL[entry.category]}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * "Grade": the proposal's grade, the step it recommends and why, where its score
 * sits on the five bands, and — when it failed a fit check — that it is out of
 * focus. The grade shown is the effective one; a correction keeps the AI's grade
 * visible beside it.
 */
export function GradeCard({
  proposal,
  thresholds,
}: {
  proposal: Pick<
    Proposal,
    'assessment' | 'category' | 'effectiveCategory' | 'correction' | 'fit'
  >
  thresholds: Thresholds | null
}) {
  const { assessment, correction } = proposal
  const grade = proposal.effectiveCategory
  if (!assessment || !grade) return null
  const score = assessment.score
  const band = thresholds
    ? gradeBands(thresholds).find(
        (entry) => entry.category === gradeOf(score, thresholds),
      )
    : undefined
  const corrected =
    correction != null &&
    proposal.category != null &&
    correction.category !== proposal.category
  const outside = isOutsideFocus(proposal)
  const failed = failedFitChecks(proposal.fit)

  return (
    <Card data-testid="grade-card" className="gap-4">
      <CardHeader>
        <CardTitle>Grade</CardTitle>
        <CardDescription>
          {corrected
            ? 'Dikoreksi oleh manajer; skor AI tetap tersimpan apa adanya.'
            : 'Ditentukan dari skor saja. Kecocokan dengan fokus investasi tidak mengubah grade.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <GradeBadge
            category={grade}
            className="h-7 px-3 text-sm [&>svg]:size-4!"
          />
          <p className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold tabular-nums">
              {formatScore(score)}
            </span>
            <span className="text-sm text-muted-foreground">/100</span>
          </p>
          {band ? (
            <p className="text-sm text-muted-foreground">
              {/* A corrected grade is not the score's band, so name both. */}
              {corrected
                ? `Skor ini di rentang ${band.text} (${CATEGORY_LABEL[band.category]})`
                : `Rentang skor ${band.text}`}
            </p>
          ) : null}
        </div>

        <div
          data-testid="grade-action"
          className={cn('rounded-xl p-4', CATEGORY_SOFT[grade])}
        >
          <p className="text-xs font-medium text-muted-foreground">
            Aksi yang disarankan
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-base font-semibold">
            <ArrowRightIcon
              aria-hidden
              className={cn('size-4', CATEGORY_TEXT[grade])}
            />
            {CATEGORY_ACTION[grade]}
          </p>
          <p className="mt-1 text-sm">{CATEGORY_EXPLANATION[grade]}</p>
        </div>

        {corrected ? (
          <p className="rounded-lg border px-3 py-2 text-[13px]">
            AI memberi grade{' '}
            <strong>{CATEGORY_LABEL[proposal.category!]}</strong> dari skornya,
            lalu dikoreksi ke{' '}
            <strong>{CATEGORY_LABEL[correction.category]}</strong> (
            {dateTime(correction.at)}, {VIA_LABEL[correction.via]}): “
            {correction.reason}”. Aksi di atas mengikuti grade hasil koreksi.
          </p>
        ) : null}

        {thresholds ? (
          <GradeScale score={score} thresholds={thresholds} />
        ) : null}

        {outside ? (
          <div
            data-testid="outside-focus-callout"
            className="flex gap-3 rounded-xl border border-dashed border-muted-foreground/60 bg-muted/50 p-4"
          >
            <CompassIcon aria-hidden className="mt-0.5 size-5 shrink-0" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold">
                {OUTSIDE_FOCUS_LABEL} — prioritas rendah
              </p>
              <p className="text-muted-foreground">{OUTSIDE_FOCUS_MEANING}</p>
              {failed.length ? (
                <ul className="list-disc space-y-0.5 pl-4">
                  {failed.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}

        {thresholds ? (
          <details className="group rounded-xl border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
              Cara membaca grade
              <ChevronDownIcon
                aria-hidden
                className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="border-t px-4 pt-1 pb-3">
              <GradeGuide
                thresholds={thresholds}
                current={gradeOf(score, thresholds)}
                showExplanation
              />
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  )
}
