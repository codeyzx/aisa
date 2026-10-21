import {
  BanknoteIcon,
  CheckIcon,
  LayersIcon,
  PencilIcon,
  ShapesIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { Rules } from '@/features/aisa/aisa.schema'
import { formatRupiah } from '@/lib/format/currency'
import { cn } from '@/lib/utils'

import { miliar } from './helpers'
import { fitCheck, normalizeToken, type ScoredProposal } from './scoring'

/**
 * The focus values plus every value a scored deck stated, deduplicated the way
 * `fit_check` compares them — so an inactive chip is a sector or stage that
 * really arrived, never an invented option.
 */
export function focusOptions(
  configured: readonly string[],
  seen: readonly (string | null)[],
): string[] {
  const byToken = new Map<string, string>()
  for (const value of [...configured, ...seen]) {
    if (!value?.trim()) continue
    const token = normalizeToken(value)
    if (!byToken.has(token)) byToken.set(token, value.trim())
  }
  return [...byToken.values()]
}

function Chip({
  active,
  children,
}: {
  active: boolean
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
        active
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-dashed text-muted-foreground line-through decoration-muted-foreground/50',
      )}
    >
      {active && <CheckIcon className="size-3" />}
      {children}
    </span>
  )
}

function PassMeter({ pass, total }: { pass: number; total: number }) {
  const pct = total ? Math.round((pass / total) * 100) : 0
  return (
    <div className="mt-auto flex flex-col gap-1.5 border-t pt-3">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">
          Proposal saat ini yang lolos
        </span>
        <span className="font-mono font-medium tabular-nums">
          {pass}/{total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function FocusCard({
  rules,
  proposals,
  onEdit,
}: {
  rules: Pick<Rules, 'fit'>
  proposals: readonly ScoredProposal[]
  onEdit?: () => void
}) {
  const { fit } = rules
  const fits = proposals.map((p) => fitCheck(p, fit))
  const pass = {
    sector: fits.filter((f) => f.sector).length,
    stage: fits.filter((f) => f.stage).length,
    funding: fits.filter((f) => f.funding).length,
    all: fits.filter((f) => f.passed).length,
  }
  const total = proposals.length
  const sectorTokens = new Set(fit.sectors.map(normalizeToken))
  const stageTokens = new Set(fit.stages.map(normalizeToken))
  const sectors = focusOptions(
    fit.sectors,
    proposals.map((p) => p.sector),
  )
  const stages = focusOptions(
    fit.stages,
    proposals.map((p) => p.stage),
  )

  const checks = [
    {
      icon: ShapesIcon,
      title: 'Sektor',
      hint: `${fit.sectors.length} sektor fokus`,
      body: (
        <div className="flex flex-wrap gap-1.5">
          {sectors.map((s) => (
            <Chip key={s} active={sectorTokens.has(normalizeToken(s))}>
              {s}
            </Chip>
          ))}
        </div>
      ),
      pass: pass.sector,
    },
    {
      icon: LayersIcon,
      title: 'Tahap pendanaan',
      hint: `${fit.stages.length} tahap fokus`,
      body: (
        <div className="flex flex-wrap gap-1.5">
          {stages.map((s) => (
            <Chip key={s} active={stageTokens.has(normalizeToken(s))}>
              {s}
            </Chip>
          ))}
        </div>
      ),
      pass: pass.stage,
    },
    {
      icon: BanknoteIcon,
      title: 'Dana',
      hint: 'Batas bawah dan atas ikut',
      body: (
        <dl className="flex flex-col gap-2.5">
          <div>
            <dt className="text-xs text-muted-foreground">
              Dana yang dicari founder
            </dt>
            <dd className="font-semibold">
              {miliar(fit.fundingMinIdr)} – {miliar(fit.fundingMaxIdr)}
            </dd>
            <dd className="font-mono text-[11px] text-muted-foreground">
              {formatRupiah(fit.fundingMinIdr)} –{' '}
              {formatRupiah(fit.fundingMaxIdr)}
            </dd>
          </div>
        </dl>
      ),
      pass: pass.funding,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-semibold">Fokus investasi</CardTitle>
        <CardDescription>
          Dipakai untuk tiga cek fokus. Deck yang tidak menyebut sektor, tahap,
          atau dananya dianggap tidak lolos cek itu.
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
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          {checks.map((check, index) => (
            <div
              key={check.title}
              className="flex flex-col gap-3 rounded-xl border p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
                    <check.icon className="size-4" />
                  </span>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Cek {index + 1}
                    </p>
                    <p className="leading-tight font-semibold">{check.title}</p>
                  </div>
                </div>
                <span className="pt-0.5 text-right text-xs text-muted-foreground">
                  {check.hint}
                </span>
              </div>
              {check.body}
              <PassMeter pass={check.pass} total={total} />
            </div>
          ))}
        </div>
        <p className="text-[13px] text-muted-foreground">
          <span className="font-mono font-medium text-foreground tabular-nums">
            {pass.all}
          </span>{' '}
          dari {total} proposal saat ini lolos ketiga cek fokus.
        </p>
      </CardContent>
    </Card>
  )
}
