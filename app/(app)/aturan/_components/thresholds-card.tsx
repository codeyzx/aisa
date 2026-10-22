import { ArrowRightIcon, CompassIcon, PencilIcon } from 'lucide-react'
import Link from 'next/link'

import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  CATEGORY_ACTION,
  OUTSIDE_FOCUS_LABEL,
} from '@/features/aisa/aisa.labels'
import { CATEGORIES, type Rules } from '@/features/aisa/aisa.schema'
import { cn } from '@/lib/utils'

import { GradeBadge } from '../../_components/badges'

import { categoryRule } from './helpers'
import { Scale } from './scale'
import { emptyCounts, type ScoredProposal } from './scoring'

export function ThresholdsCard({
  rules,
  proposals,
  onEdit,
}: {
  rules: Pick<Rules, 'thresholds'>
  proposals: readonly ScoredProposal[]
  onEdit?: () => void
}) {
  const counts = emptyCounts()
  for (const p of proposals) counts[p.category] += 1
  const total = proposals.length
  const outside = proposals.filter((p) => p.outsideFocus).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-semibold">Batas grade</CardTitle>
        <CardDescription>
          Skor minimal untuk tiap grade. Grade hanya ditentukan oleh skor; cek
          fokus tidak mengubahnya.
        </CardDescription>
        {onEdit ? (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <PencilIcon />
              Ubah
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-[13px] font-medium">
              Sebaran skor {total} proposal yang sudah dinilai
            </p>
            <p className="text-xs text-muted-foreground">
              Warna batang = grade yang diterima proposal
            </p>
          </div>
          <Scale thresholds={rules.thresholds} points={proposals} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {CATEGORIES.map((category) => {
            const { range, rule } = categoryRule(category, rules.thresholds)
            const count = counts[category]
            return (
              <Link
                key={category}
                href={`/proposal?kategori=${category}`}
                className="group flex flex-col gap-3 rounded-xl border p-4 transition-colors outline-none hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <GradeBadge category={category} />
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-medium tabular-nums">
                    {range}
                  </span>
                </div>
                <p className="text-[13px] leading-snug">
                  <span className="font-medium">
                    {CATEGORY_ACTION[category]}
                  </span>
                  <span className="block text-muted-foreground">{rule}</span>
                </p>
                <div className="mt-auto flex items-end justify-between gap-2 border-t pt-3">
                  <p>
                    <span className="font-mono text-xl font-semibold tabular-nums">
                      {count}
                    </span>{' '}
                    <span className="text-xs text-muted-foreground">
                      proposal · {total ? Math.round((count / total) * 100) : 0}
                      %
                    </span>
                  </p>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary">
                    Lihat
                    <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            )
          })}
        </div>

        <div className="flex flex-col gap-3 rounded-xl bg-muted/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CompassIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-[13px] leading-relaxed">
              <span className="font-medium">
                Proposal di luar fokus tetap mendapat grade.
              </span>{' '}
              <span className="text-muted-foreground">
                Proposal yang gagal salah satu cek fokus (sektor, tahap, atau
                dana) diberi tanda “{OUTSIDE_FOCUS_LABEL}”: prioritas rendah
                karena risikonya lebih tinggi untuk portofolio. Saat ini ada{' '}
                {outside} proposal.
              </span>
            </p>
          </div>
          <Link
            href="/proposal?luarFokus=1"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'shrink-0 self-start sm:self-auto',
            )}
          >
            Lihat proposal
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
