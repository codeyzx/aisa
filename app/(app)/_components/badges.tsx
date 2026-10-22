import {
  ArchiveIcon,
  BadgeCheckIcon,
  CircleCheckIcon,
  CircleXIcon,
  FileSearchIcon,
  Clock3Icon,
  EyeIcon,
  MailIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  CATEGORY_ACTION,
  CATEGORY_LABEL,
  gradeOf,
  STATUS_LABEL,
} from '@/features/aisa/aisa.labels'
import {
  type Category,
  type Criterion,
  type ProposalStatus,
  type ResponseKind,
  type Thresholds,
} from '@/features/aisa/aisa.schema'
import { cn } from '@/lib/utils'

/**
 * Agent colours from the `--agent-*` tokens, keyed by the job's `agent` name, in
 * the order Aktivitas AI lists its filter chips. Biaya AI paints the same agent
 * with the same colour, so a reader moving between the two pages keeps it.
 */
const AGENT_COLOR: Record<string, string> = {
  Penilai: 'var(--agent-1)',
  'Pembuat ringkasan': 'var(--agent-2)',
  Asisten: 'var(--agent-4)',
  Orchestrator: 'var(--agent-5)',
  Retensi: 'var(--agent-3)',
}
export const AGENT_ORDER = Object.keys(AGENT_COLOR)
export const agentColor = (agent: string) =>
  AGENT_COLOR[agent] ?? 'var(--muted-foreground)'

/**
 * Criterion swatches from the `--criterion-*` tokens: one hue per criterion A–E,
 * none of them a grade hue, so a criterion never reads as a verdict. Every
 * swatch sits beside its criterion's name — colour is never the only cue.
 */
export const CRITERION_COLOR: Record<Criterion, string> = {
  manajemen: 'bg-criterion-manajemen',
  kinerja: 'bg-criterion-kinerja',
  risiko: 'bg-criterion-risiko',
  rencana: 'bg-criterion-rencana',
  dampak: 'bg-criterion-dampak',
}

// Grade colours, best to worst: green, teal-blue, amber, orange, red. A badge is
// the solid `--category-N-fill` with `--category-N-on` text (≥ 4.5:1); coloured text
// on the card reads `--category-N`; dots, bars and chart fills read
// `--category-N-fill` (≥ 3:1 on the card). Risiko tinggi (orange, dark text) and
// Tidak layak (red, white text) differ in hue, lightness and text colour, and
// every badge carries its own icon and word, so colour is never the only cue.
const GRADE_TONE: Record<Category, number> = {
  sangat_layak: 1,
  layak_bersyarat: 2,
  perlu_penyesuaian: 3,
  risiko_tinggi: 4,
  tidak_layak: 5,
}

const GRADE_STYLE: Record<Category, string> = {
  sangat_layak: 'bg-category-1-fill text-category-1-on',
  layak_bersyarat: 'bg-category-2-fill text-category-2-on',
  perlu_penyesuaian: 'bg-category-3-fill text-category-3-on',
  risiko_tinggi: 'bg-category-4-fill text-category-4-on',
  tidak_layak: 'bg-category-5-fill text-category-5-on',
}

export const GRADE_ICON: Record<Category, LucideIcon> = {
  sangat_layak: BadgeCheckIcon,
  layak_bersyarat: CircleCheckIcon,
  perlu_penyesuaian: SlidersHorizontalIcon,
  risiko_tinggi: TriangleAlertIcon,
  tidak_layak: CircleXIcon,
}

/** Coloured text for a grade on the card or its soft background. */
export const CATEGORY_TEXT: Record<Category, string> = {
  sangat_layak: 'text-category-1',
  layak_bersyarat: 'text-category-2',
  perlu_penyesuaian: 'text-category-3',
  risiko_tinggi: 'text-category-4',
  tidak_layak: 'text-category-5',
}

/** A soft tinted surface for a grade: callouts, the active step of a scale. */
export const CATEGORY_SOFT: Record<Category, string> = {
  sangat_layak: 'bg-category-1-soft',
  layak_bersyarat: 'bg-category-2-soft',
  perlu_penyesuaian: 'bg-category-3-soft',
  risiko_tinggi: 'bg-category-4-soft',
  tidak_layak: 'bg-category-5-soft',
}

export const CATEGORY_DOT: Record<Category, string> = {
  sangat_layak: 'bg-category-1-fill',
  layak_bersyarat: 'bg-category-2-fill',
  perlu_penyesuaian: 'bg-category-3-fill',
  risiko_tinggi: 'bg-category-4-fill',
  tidak_layak: 'bg-category-5-fill',
}

/** The same fills as CSS values, for chart libraries that take a colour string. */
export const CATEGORY_FILL: Record<Category, string> = Object.fromEntries(
  Object.entries(GRADE_TONE).map(([c, n]) => [c, `var(--category-${n}-fill)`]),
) as Record<Category, string>

/**
 * A grade as a solid badge: its icon and word, and with `showAction` the
 * recommended next step after it ("Tolak").
 */
export function GradeBadge({
  category,
  showAction = false,
  className,
}: {
  category: Category
  showAction?: boolean
  className?: string
}) {
  const Icon = GRADE_ICON[category]
  return (
    <Badge
      variant="outline"
      data-grade={category}
      className={cn(
        'gap-1 border-transparent font-semibold',
        GRADE_STYLE[category],
        className,
      )}
    >
      <Icon aria-hidden />
      {CATEGORY_LABEL[category]}
      {showAction ? (
        <span className="font-normal opacity-90">
          · {CATEGORY_ACTION[category]}
        </span>
      ) : null}
    </Badge>
  )
}

/** A response, or `null` for a proposal nobody has answered yet. */
export type Decision = ResponseKind | null

// Decision badges carry no hue at all: every hue already means a grade in the
// column beside them, so a decision tells itself apart by its
// icon and its word. "Belum ditanggapi" — the one that needs the manager — is
// the only one drawn with a dashed outline and bold text.
const DECIDED =
  'border-border bg-muted text-foreground [&>svg]:text-muted-foreground'

const DECISION: Record<
  ResponseKind | 'baru',
  { icon: LucideIcon; label: string; className: string }
> = {
  baru: {
    icon: Clock3Icon,
    label: 'Belum ditanggapi',
    className:
      'border-dashed border-muted-foreground bg-transparent font-semibold text-foreground',
  },
  undang: { icon: MailIcon, label: 'Diundang', className: DECIDED },
  pantau: { icon: EyeIcon, label: 'Dipantau', className: DECIDED },
  arsipkan: {
    icon: ArchiveIcon,
    label: 'Diarsipkan',
    className: 'border-border bg-transparent text-muted-foreground',
  },
}

export const DECISION_LABEL = Object.fromEntries(
  Object.entries(DECISION).map(([key, value]) => [key, value.label]),
) as Record<ResponseKind | 'baru', string>

export function DecisionBadge({
  decision,
  className,
}: {
  decision: Decision
  className?: string
}) {
  const { icon: Icon, label, className: style } = DECISION[decision ?? 'baru']
  return (
    <Badge variant="outline" className={cn(style, className)}>
      <Icon />
      {label}
    </Badge>
  )
}

/**
 * Score colour by the ACTIVE rules' grade bands, so the bar and the grade badge
 * beside it can never disagree. Without rules there are no bands to colour by,
 * so the bar stays the neutral primary.
 */
export function scoreTone(score: number, thresholds: Thresholds | null) {
  if (!thresholds) return { bar: 'bg-primary', text: 'text-foreground' }
  const grade = gradeOf(score, thresholds)
  return { bar: CATEGORY_DOT[grade], text: CATEGORY_TEXT[grade] }
}

export function ScoreBar({
  score,
  thresholds,
  className,
}: {
  score: number
  thresholds: Thresholds | null
  className?: string
}) {
  return (
    // A native <meter> cannot take the per-category fill colour without
    // vendor pseudo-elements, so the bar keeps the meter role on a div.
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score}
      aria-label={`Skor ${score} dari 100`}
      className={cn(
        'h-1.5 w-full overflow-hidden rounded-full bg-muted',
        className,
      )}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width]',
          scoreTone(score, thresholds).bar,
        )}
        style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
      />
    </div>
  )
}

/**
 * A proposal status that is not a verdict. "Perlu dicek manual" asks for the
 * manager's eyes, so it gets an icon and bold text, never a grade hue: amber
 * there would read as Perlu penyesuaian.
 */
export function StatusBadge({
  status,
  className,
}: {
  status: ProposalStatus
  className?: string
}) {
  const manual = status === 'perlu_dicek_manual'
  return (
    <Badge
      variant="outline"
      className={cn(manual && 'font-semibold text-foreground', className)}
    >
      {manual ? <FileSearchIcon /> : null}
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export { OutsideFocusBadge } from './outside-focus-badge'
