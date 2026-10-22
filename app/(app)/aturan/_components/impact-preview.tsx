import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  SparklesIcon,
} from 'lucide-react'

import { CATEGORY_LABEL } from '@/features/aisa/aisa.labels'
import { CATEGORIES } from '@/features/aisa/aisa.schema'
import { cn } from '@/lib/utils'

import { CATEGORY_DOT } from '../../_components/badges'

import type { Simulation } from './scoring'

function Delta({ value }: { value: number }) {
  if (!value)
    return <span className="w-8 text-right text-muted-foreground">–</span>
  return (
    <span
      className={cn(
        'w-8 text-right font-medium',
        value > 0 ? 'text-success' : 'text-danger',
      )}
    >
      {value > 0 ? `+${value}` : value}
    </span>
  )
}

/** "3 di antaranya …", or nothing when no move is held by a koreksi. */
function heldNote(sim: Simulation): string | null {
  if (!sim.held) return null
  return sim.held === sim.moves.length
    ? 'Semuanya tetap pada grade koreksi manajer.'
    : `${sim.held} di antaranya tetap pada grade koreksi manajer.`
}

/**
 * The draft rules simulated on the proposals already scored. It compares the
 * AI's grade under both rule sets; a manager koreksi is never rewritten by
 * a rule change, so a move it holds is marked rather than counted as visible.
 * A preview only: saving does not re-score them.
 */
export function ImpactPreview({
  sim,
  dirty,
  compact = false,
}: {
  /** `null` while the draft is invalid. */
  sim: Simulation | null
  /** Whether the draft changes a scoring rule (weights, thresholds, focus). */
  dirty: boolean
  compact?: boolean
}) {
  const status = !sim ? 'invalid' : !dirty ? 'idle' : 'ready'

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-[13px]">
        {status === 'invalid' ? (
          <>
            <AlertCircleIcon className="size-4 shrink-0 text-warning" />
            <span className="text-muted-foreground">
              Perbaiki isian dulu, misalnya total bobot harus 100%.
            </span>
          </>
        ) : status === 'idle' || !sim ? (
          <>
            <SparklesIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">
              Ubah isian untuk melihat dampaknya pada proposal.
            </span>
          </>
        ) : (
          <>
            <SparklesIcon className="size-4 shrink-0 text-primary" />
            <span>
              <span className="font-semibold">{sim.moves.length} proposal</span>{' '}
              pindah grade AI
              {sim.moves.length > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  · {sim.up} naik, {sim.down} turun
                  {sim.held ? `, ${sim.held} tetap pada koreksi manajer` : ''}
                </span>
              )}
            </span>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="flex items-center gap-1.5 font-semibold">
          <SparklesIcon className="size-4 text-primary" />
          Dampak perubahan
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {sim
            ? `Simulasi grade AI pada ${sim.total} proposal yang sudah dinilai. Hanya pratinjau, skor lama tidak diubah.`
            : 'Simulasi menunggu semua isian benar.'}
        </p>
      </div>

      {status === 'invalid' || !sim ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft p-3 text-[13px]">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            Ada isian yang belum benar, misalnya total bobot belum 100%.
            Perbaiki dulu untuk melihat dampaknya.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border bg-background p-3">
            {status === 'idle' ? (
              <p className="text-[13px] text-muted-foreground">
                Belum ada perubahan. Geser bobot atau ubah batas, hasilnya
                langsung terlihat di sini.
              </p>
            ) : (
              <>
                <p className="font-mono text-3xl leading-none font-semibold tabular-nums">
                  {sim.moves.length}
                </p>
                <p className="mt-1 text-[13px]">
                  {sim.moves.length
                    ? 'proposal akan pindah grade AI'
                    : 'Tidak ada proposal yang pindah grade AI'}
                </p>
                {heldNote(sim) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {heldNote(sim)}
                  </p>
                )}
                {sim.moves.length > 0 && (
                  <div className="mt-2 flex gap-3 text-xs">
                    <span className="flex items-center gap-1 text-success">
                      <ArrowUpIcon className="size-3.5" />
                      {sim.up} naik
                    </span>
                    <span className="flex items-center gap-1 text-danger">
                      <ArrowDownIcon className="size-3.5" />
                      {sim.down} turun
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          <table className="w-full text-[13px]">
            <caption className="pb-2 text-left text-xs leading-relaxed text-muted-foreground">
              Grade dari AI, dihitung ulang dengan aturan sekarang dan aturan
              baru. Koreksi manajer tidak ikut berubah, jadi angka ini bisa
              berbeda dari kartu Batas grade.
            </caption>
            <thead className="text-[11px] text-muted-foreground">
              <tr>
                <th className="pb-1.5 text-left font-medium">Grade</th>
                <th className="pb-1.5 text-right font-medium">AI sekarang</th>
                <th className="pb-1.5 text-right font-medium">Aturan baru</th>
                <th className="w-8 pb-1.5">
                  <span className="sr-only">Selisih</span>
                </th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {CATEGORIES.map((category) => (
                <tr key={category} className="border-t">
                  <td className="py-1.5 font-sans">
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className={cn(
                          'size-2 rounded-full',
                          CATEGORY_DOT[category],
                        )}
                      />
                      {CATEGORY_LABEL[category]}
                    </span>
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">
                    {sim.before[category]}
                  </td>
                  <td className="py-1.5 text-right font-medium">
                    {sim.after[category]}
                  </td>
                  <td className="py-1.5 text-right">
                    <Delta value={sim.after[category] - sim.before[category]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {sim.moves.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">
                Contoh yang pindah grade AI
              </p>
              <ul className="flex flex-col gap-1">
                {sim.moves.slice(0, 5).map((move) => (
                  <li
                    key={move.proposal.id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">
                        {move.proposal.name}
                      </span>
                      {move.proposal.corrected && (
                        <span className="text-[11px] text-muted-foreground">
                          Tetap {CATEGORY_LABEL[move.proposal.category]}{' '}
                          (koreksi manajer)
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                      {CATEGORY_LABEL[move.from]}
                      <ArrowRightIcon className="size-3" />
                      <span className="text-foreground">
                        {CATEGORY_LABEL[move.to]}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {sim.moves.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  dan {sim.moves.length - 5} proposal lainnya
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
