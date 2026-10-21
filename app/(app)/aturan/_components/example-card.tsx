'use client'

import { ArrowRightIcon, CheckIcon, XIcon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CRITERION_LABEL } from '@/features/aisa/aisa.labels'
import { CRITERIA } from '@/features/aisa/aisa.schema'
import { formatScore } from '@/lib/format/number'
import { cn } from '@/lib/utils'

import { CategoryBadge } from '../../_components/badges'

import { num, toPercent } from './helpers'
import {
  criterionPoints,
  evaluate,
  rescorable,
  type ScoredProposal,
  type ScoringRules,
} from './scoring'

export function ExampleCard({
  rules,
  version,
  proposals,
}: {
  rules: ScoringRules
  version: number
  proposals: readonly ScoredProposal[]
}) {
  const options = proposals
    .filter(rescorable)
    .toSorted((a, b) => b.score - a.score)
  const [id, setId] = useState(options[0]?.id ?? '')
  const proposal = options.find((p) => p.id === id) ?? options[0]

  if (!proposal) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-semibold">Contoh perhitungan</CardTitle>
          <CardDescription>
            Contoh muncul setelah ada proposal yang dinilai.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const result = evaluate(proposal, rules)
  const checks = [
    { label: 'Sektor', ok: result.fit.sector },
    { label: 'Tahap', ok: result.fit.stage },
    { label: 'Dana', ok: result.fit.funding },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-semibold">Contoh perhitungan</CardTitle>
        <CardDescription>
          Begini skor satu proposal dihitung dengan aturan saat ini.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Select
          value={proposal.id}
          onValueChange={(value) => value && setId(value)}
          items={options.map((p) => ({ value: p.id, label: p.name }))}
        >
          <SelectTrigger className="w-full" aria-label="Pilih proposal contoh">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {options.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kriteria</th>
                <th className="px-2 py-2 text-right font-medium">Nilai AI</th>
                <th className="px-2 py-2 text-right font-medium">Bobot</th>
                <th className="px-3 py-2 text-right font-medium">Poin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono tabular-nums">
              {CRITERIA.map((c) => (
                <tr key={c}>
                  <td className="px-3 py-2 font-sans">{CRITERION_LABEL[c]}</td>
                  <td className="px-2 py-2 text-right">
                    {proposal.values[c]}/5
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap text-muted-foreground">
                    × {num(toPercent(rules.weights[c]))}%
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {num(criterionPoints(rules.weights[c], proposal.values[c]))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/50">
              <tr>
                <td colSpan={3} className="px-3 py-2.5 font-medium">
                  Skor (1 desimal)
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-base font-semibold tabular-nums">
                  {formatScore(result.score)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {proposal.rulesVersion !== version ? (
          <p className="-mt-2 text-xs text-muted-foreground">
            Proposal ini dinilai dengan aturan versi {proposal.rulesVersion}{' '}
            (skor tersimpan {formatScore(proposal.score)}). Angka di atas
            memakai aturan versi {version}.
          </p>
        ) : null}

        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
            <span className="mr-1 text-muted-foreground">Cek fokus</span>
            {checks.map((check) => (
              <span
                key={check.label}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                  check.ok
                    ? 'border-success/30 bg-success-soft text-success'
                    : 'border-danger/30 bg-danger-soft text-danger',
                )}
              >
                {check.ok ? (
                  <CheckIcon className="size-3" />
                ) : (
                  <XIcon className="size-3" />
                )}
                {check.label}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[13px]">
              <span className="text-muted-foreground">Hasil</span>
              <CategoryBadge category={result.category} />
            </div>
            <Link
              href={`/proposal/${encodeURIComponent(proposal.id)}`}
              className={cn(
                buttonVariants({ variant: 'link', size: 'sm' }),
                'h-auto px-0',
              )}
            >
              Buka proposal
              <ArrowRightIcon />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
