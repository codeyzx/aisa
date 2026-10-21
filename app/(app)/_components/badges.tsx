import {
  ArchiveIcon,
  Clock3Icon,
  EyeIcon,
  MailIcon,
  type LucideIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { CATEGORY_LABEL } from '@/features/aisa/aisa.labels'
import {
  type Category,
  type ResponseKind,
  type Rules,
} from '@/features/aisa/aisa.schema'
import { cn } from '@/lib/utils'

// Category colours read the `--category-*` tokens (text contrast ≥ 4.5:1); the
// text label always travels with the colour, so colour is never the only cue.
const CATEGORY_STYLE: Record<Category, string> = {
  sangat_cocok: 'border-category-1/30 bg-category-1-soft text-category-1',
  cocok: 'border-category-2/30 bg-category-2-soft text-category-2',
  kurang_cocok: 'border-category-3/35 bg-category-3-soft text-category-3',
  tidak_cocok: 'border-category-4/30 bg-category-4-soft text-category-4',
}

export const CATEGORY_DOT: Record<Category, string> = {
  sangat_cocok: 'bg-category-1',
  cocok: 'bg-category-2',
  kurang_cocok: 'bg-category-3',
  tidak_cocok: 'bg-category-4',
}

export function CategoryBadge({
  category,
  className,
}: {
  category: Category
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      className={cn('gap-1.5 font-medium', CATEGORY_STYLE[category], className)}
    >
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full', CATEGORY_DOT[category])}
      />
      {CATEGORY_LABEL[category]}
    </Badge>
  )
}

/** A response, or `null` for a proposal nobody has answered yet. */
export type Decision = ResponseKind | null

const DECISION: Record<
  ResponseKind | 'baru',
  { icon: LucideIcon; label: string; className: string }
> = {
  baru: {
    icon: Clock3Icon,
    label: 'Belum ditanggapi',
    className: 'border-warning/40 bg-warning-soft text-warning',
  },
  undang: {
    icon: MailIcon,
    label: 'Diundang',
    className: 'border-success/40 bg-success-soft text-success',
  },
  pantau: {
    icon: EyeIcon,
    label: 'Dipantau',
    className: 'border-primary/30 bg-primary/10 text-primary',
  },
  arsipkan: {
    icon: ArchiveIcon,
    label: 'Diarsipkan',
    className: 'border-border bg-muted/60 text-muted-foreground',
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

type Thresholds = Pick<
  Rules['thresholds'],
  'sangatCocok' | 'cocok' | 'kurangCocok'
>

/**
 * Score colour by the ACTIVE rules' category cut-offs, so the bar and the
 * category badge beside it can never disagree. Without rules there are no
 * cut-offs to colour by, so the bar stays the neutral primary.
 */
export function scoreTone(score: number, thresholds: Thresholds | null) {
  if (!thresholds) return { bar: 'bg-primary', text: 'text-foreground' }
  if (score >= thresholds.sangatCocok)
    return { bar: 'bg-category-1', text: 'text-category-1' }
  if (score >= thresholds.cocok)
    return { bar: 'bg-category-2', text: 'text-category-2' }
  if (score >= thresholds.kurangCocok)
    return { bar: 'bg-category-3', text: 'text-category-3' }
  return { bar: 'bg-category-4', text: 'text-category-4' }
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
