import {
  CalculatorIcon,
  ChevronRightIcon,
  FileSearchIcon,
  ShieldCheckIcon,
  TagsIcon,
} from 'lucide-react'
import { Fragment } from 'react'

import { Card } from '@/components/ui/card'
import {
  CATEGORY_LABEL,
  CRITERION_LETTER,
  CRITERION_SHORT,
  gradeBands,
} from '@/features/aisa/aisa.labels'
import { CRITERIA, type Rules } from '@/features/aisa/aisa.schema'
import { cn } from '@/lib/utils'

import { num, toPercent } from './helpers'
import { criterionPoints } from './scoring'

export function HowItWorks({
  rules,
}: {
  rules: Pick<Rules, 'weights' | 'thresholds'>
}) {
  const manajemen = toPercent(rules.weights.manajemen)
  const criteria = CRITERIA.map(
    (c) => `${CRITERION_LETTER[c]} ${CRITERION_SHORT[c].toLowerCase()}`,
  ).join(', ')
  const top = gradeBands(rules.thresholds)[0]!
  const steps = [
    {
      icon: FileSearchIcon,
      by: 'AI',
      title: 'AI membaca proposal',
      text: `AI memberi nilai 1–5 untuk lima kriteria: ${criteria}. Setiap nilai disertai kutipan dan nomor halaman sebagai bukti.`,
      result: '5 nilai, skala 1–5',
    },
    {
      icon: CalculatorIcon,
      by: 'Sistem',
      title: 'Sistem menghitung skor',
      text: `Nilai 1 dihitung 0 poin dan nilai 5 penuh, dikalikan bobot kriterianya, lalu dijumlahkan. Contoh: nilai Tim manajemen 4 × bobot ${num(manajemen)}% = ${num(criterionPoints(rules.weights.manajemen, 4))} poin.`,
      result: 'Skor 0–100',
    },
    {
      icon: TagsIcon,
      by: 'Sistem',
      title: 'Sistem menentukan grade',
      text: `Grade ditentukan oleh skor saja, misalnya skor ${top.text} berarti ${CATEGORY_LABEL[top.category]}. Fokus investasi (sektor, tahap, dana) dicek terpisah: proposal di luar fokus tetap mendapat grade-nya, tetapi ditandai “Di luar fokus” sebagai prioritas rendah.`,
      result: '1 dari 5 grade, plus tanda fokus',
    },
  ]

  return (
    <section aria-labelledby="cara-menilai" className="flex flex-col gap-3">
      <div>
        <h2 id="cara-menilai" className="text-base font-semibold">
          Cara AISA menilai proposal
        </h2>
        <p className="text-sm text-muted-foreground">
          Tiga langkah yang sama untuk setiap proposal yang masuk.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {steps.map((step, index) => (
          <Fragment key={step.title}>
            {index > 0 && (
              <div
                aria-hidden
                className="hidden items-center text-muted-foreground lg:flex"
              >
                <ChevronRightIcon className="size-5" />
              </div>
            )}
            <Card className="gap-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground">
                    <step.icon className="size-4" />
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    Langkah {index + 1}
                  </span>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    step.by === 'AI'
                      ? 'bg-[color-mix(in_oklch,var(--agent-1)_12%,transparent)] text-[var(--agent-1)]'
                      : 'bg-primary/10 text-primary',
                  )}
                >
                  {step.by}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="font-semibold">{step.title}</h3>
                <p className="leading-relaxed text-muted-foreground">
                  {step.text}
                </p>
              </div>
              <p className="mt-auto border-t border-border pt-3 text-xs text-muted-foreground">
                Hasil:{' '}
                <span className="font-medium text-foreground">
                  {step.result}
                </span>
              </p>
            </Card>
          </Fragment>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success-soft/60 px-4 py-3">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
        <p className="text-sm leading-relaxed">
          <span className="font-medium">
            AI tidak menentukan grade dan tidak mengambil keputusan.
          </span>{' '}
          <span className="text-muted-foreground">
            Grade dihitung sistem dari aturan di halaman ini. Aksi di samping
            grade hanya saran; keputusan undang, pantau, atau arsipkan tetap di
            tangan Anda.
          </span>
        </p>
      </div>
    </section>
  )
}
