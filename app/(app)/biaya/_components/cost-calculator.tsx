'use client'

import { parseAsInteger, useQueryStates } from 'nuqs'
import { useId, useState } from 'react'

import { type PricePeriod, pricePeriodsOf } from '@/features/aisa/aisa.pricing'
import { formatDecimal, formatNumber } from '@/lib/format/number'

import { COMPARE_DEFAULTS, compare, DIGESTS_PER_MONTH } from '../compare'
import { type UnitCost, unitUsdOn } from '../cost-data'
import { rupiah } from '../money'

/** A date inside `period`: today when today falls in it, else its first day. */
function periodDate(period: PricePeriod, today: string): string {
  const covers =
    (period.from === null || period.from <= today) &&
    (period.until === null || today <= period.until)
  return covers ? today : (period.from ?? period.until ?? today)
}

function NumberField({
  label,
  value,
  onCommit,
  suffix,
  hint,
  max,
}: {
  label: string
  value: number
  onCommit: (value: number) => void
  suffix: string
  hint?: React.ReactNode
  max: number
}) {
  const id = useId()
  // The draft lets the field be empty while typing; only a valid number reaches
  // the URL, so a half-typed value never recomputes the comparison.
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[12.5px] text-muted-foreground">
        {label}
      </label>
      <div className="flex h-9 items-center rounded-[9px] border border-input bg-card pr-3 transition-colors focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={draft ?? formatNumber(value)}
          onFocus={() => setDraft(String(value))}
          onChange={(event) => {
            // Digits only: `14.500.000` and `14500000` are the same amount.
            const digits = event.target.value.replace(/\D/g, '')
            setDraft(digits)
            if (digits !== '') onCommit(Math.min(max, Number(digits)))
          }}
          onBlur={() => setDraft(null)}
          className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-[13.5px] tabular-nums outline-none"
        />
        <span className="shrink-0 text-xs text-muted-foreground">{suffix}</span>
      </div>
      {hint ? (
        <p className="text-[11.5px] leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function CompareBar({
  label,
  amount,
  max,
  color,
}: {
  label: string
  amount: number
  max: number
  color: string
}) {
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="font-medium tabular-nums">{rupiah(amount)}</span>
      </div>
      <span className="h-3 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${max > 0 ? Math.max(amount > 0 ? 0.8 : 0, (amount / max) * 100) : 0}%`,
            background: color,
          }}
        />
      </span>
    </div>
  )
}

const minutes = (value: number) => `${formatDecimal(value, { max: 1 })} menit`

/**
 * "AISA vs cek manual". Every input is an assumption the reader can change; the
 * values live in the URL so a tuned comparison can be shared as a link.
 */
export function CostCalculator({
  pace,
  units,
  today,
}: {
  pace: { perMonth: number; days: number }
  units: { proposal: UnitCost | null; digest: UnitCost | null }
  today: string
}) {
  const periods = units.proposal ? pricePeriodsOf(units.proposal.model) : []
  const current = Math.max(
    0,
    periods.findIndex((p) => periodDate(p, today) === today),
  )
  const [q, setQ] = useQueryStates(
    {
      proposal: parseAsInteger.withDefault(pace.perMonth),
      menit: parseAsInteger.withDefault(COMPARE_DEFAULTS.manualMinutes),
      tinjau: parseAsInteger.withDefault(COMPARE_DEFAULTS.reviewMinutes),
      gaji: parseAsInteger.withDefault(COMPARE_DEFAULTS.monthlyPayIdr),
      jam: parseAsInteger.withDefault(COMPARE_DEFAULTS.hoursPerMonth),
      tarif: parseAsInteger.withDefault(current),
    },
    { history: 'replace' },
  )
  const period = periods[q.tarif] ?? periods[current]
  const priceDate = period ? periodDate(period, today) : today
  const proposalUsd = units.proposal
    ? unitUsdOn(units.proposal, priceDate)
    : null
  const digestUsd = units.digest ? unitUsdOn(units.digest, priceDate) : null

  const result = compare(
    {
      proposalsPerMonth: q.proposal,
      manualMinutes: q.menit,
      reviewMinutes: q.tinjau,
      monthlyPayIdr: q.gaji,
      hoursPerMonth: q.jam,
    },
    { proposalUsd: proposalUsd ?? 0, digestUsd: digestUsd ?? 0 },
  )
  const max = Math.max(result.manual.monthIdr, result.aisa.monthIdr)
  const cheaper = result.savedMonthIdr > 0

  return (
    <section className="a-chart a-wide" aria-labelledby="biaya-banding">
      <h3 id="biaya-banding">AISA vs cek manual</h3>
      <div className="a-sub">
        Biaya penyaringan awal per bulan. AISA menilai dan mengurutkan proposal;
        keputusan undang, pantau, atau arsipkan tetap di tangan manajer, jadi
        yang dibandingkan hanya waktu menyaring.
      </div>

      {proposalUsd === null ? (
        <p className="text-sm text-muted-foreground">
          Perbandingan muncul setelah ada proposal yang dinilai model dengan
          tarif yang tersedia.
        </p>
      ) : (
        <div className="mt-1 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
          <form
            className="grid content-start gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2"
            aria-label="Asumsi perbandingan"
            onSubmit={(event) => event.preventDefault()}
          >
            <NumberField
              label="Proposal per bulan"
              value={q.proposal}
              onCommit={(v) => void setQ({ proposal: v })}
              suffix="proposal"
              max={100_000}
              hint={`Bawaan: laju ${formatNumber(pace.days)} hari tercatat terakhir (${formatNumber(pace.perMonth)}/bulan)`}
            />
            <NumberField
              label="Menit analis per proposal"
              value={q.menit}
              onCommit={(v) => void setQ({ menit: v })}
              suffix="menit"
              max={600}
              hint={
                <>
                  Asumsi, ubah sesuai tim Anda. Pembanding: investor rata-rata 3
                  menit 44 detik hanya untuk membuka-baca proposal (
                  <a
                    className="a-navlink"
                    href="https://techcrunch.com/?p=1167693"
                    target="_blank"
                    rel="noreferrer"
                  >
                    DocSend × HBS, 2015
                  </a>
                  ), belum menilai dan mencatat.
                </>
              }
            />
            <NumberField
              label="Menit membaca hasil AISA"
              value={q.tinjau}
              onCommit={(v) => void setQ({ tinjau: v })}
              suffix="menit"
              max={600}
              hint="Asumsi: waktu manajer atau analis membaca skor dan alasan AISA per proposal"
            />
            <NumberField
              label="Gaji analis per bulan"
              value={q.gaji}
              onCommit={(v) => void setQ({ gaji: v })}
              suffix="Rp"
              max={1_000_000_000}
              hint={
                <>
                  Bawaan: rata-rata Investment Analyst (
                  <a
                    className="a-navlink"
                    href="https://grabjobs.co/indonesia/salary-guide/investment-analyst"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GrabJobs, 2026
                  </a>
                  ), gaji pokok tanpa THR dan BPJS
                </>
              }
            />
            <NumberField
              label="Jam kerja per bulan"
              value={q.jam}
              onCommit={(v) => void setQ({ jam: v })}
              suffix="jam"
              max={744}
              hint="40 jam × 52 minggu ÷ 12"
            />
            {periods.length > 1 ? (
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-[12.5px] text-muted-foreground">
                  Tarif AI
                </legend>
                <div className="a-chips">
                  {periods.map((p, index) => (
                    <button
                      key={p.label}
                      type="button"
                      title={p.label}
                      data-on={index === q.tarif}
                      aria-pressed={index === q.tarif}
                      onClick={() => void setQ({ tarif: index })}
                    >
                      {p.shortLabel}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
          </form>

          <div className="flex flex-col gap-4" aria-live="polite">
            <div className="rounded-xl bg-muted px-4 py-3.5">
              <p className="text-[12.5px] text-muted-foreground">
                {cheaper ? 'Hemat per bulan' : 'Selisih per bulan'}
              </p>
              <p
                className="text-[34px] leading-tight font-semibold tracking-tight tabular-nums"
                data-testid="hemat-bulan"
              >
                {rupiah(Math.abs(result.savedMonthIdr))}
              </p>
              <p className="text-sm text-muted-foreground">
                {result.times !== null && cheaper ? (
                  <>
                    <span className="font-medium text-success">
                      {formatDecimal(result.times, {
                        max: result.times < 10 ? 1 : 0,
                      })}
                      × lebih murah
                    </span>{' '}
                    · {formatDecimal(result.savedPercent ?? 0, { max: 1 })}%
                    lebih hemat · {rupiah(result.savedMonthIdr * 12)} per tahun
                  </>
                ) : (
                  'Dengan asumsi ini AISA tidak lebih murah dari cek manual.'
                )}
              </p>
            </div>

            <div className="grid gap-3">
              <CompareBar
                label="Cek manual per bulan"
                amount={result.manual.monthIdr}
                max={max}
                color="var(--muted-foreground)"
              />
              <CompareBar
                label="AISA per bulan"
                amount={result.aisa.monthIdr}
                max={max}
                color="var(--primary)"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="a-kpi">
                <span className="a-l">Jam analis kembali</span>
                <span className="a-v">
                  {formatDecimal(result.hoursBackPerMonth, { max: 1 })} jam
                </span>
                <span className="a-n">
                  per bulan, untuk kerja selain menyaring
                </span>
              </div>
              <div className="a-kpi">
                <span className="a-l">Biaya AI per bulan</span>
                <span className="a-v">
                  {rupiah(
                    result.aisa.aiPerProposalIdr * Math.max(0, q.proposal) +
                      result.aisa.digestsMonthIdr,
                  )}
                </span>
                <span className="a-n">
                  penilaian + hingga {DIGESTS_PER_MONTH} ringkasan WA
                </span>
              </div>
            </div>

            <div className="a-tablewrap">
              <table className="a-table" style={{ minWidth: 0 }}>
                <caption className="sr-only">Per proposal</caption>
                <thead>
                  <tr>
                    <th>Per proposal</th>
                    <th className="a-r">Cek manual</th>
                    <th className="a-r">AISA</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Waktu orang</td>
                    <td className="a-r font-mono">{minutes(q.menit)}</td>
                    <td className="a-r font-mono">{minutes(q.tinjau)}</td>
                  </tr>
                  <tr>
                    <td>Biaya waktu orang</td>
                    <td className="a-r font-mono">
                      {rupiah(result.manual.perProposalIdr)}
                    </td>
                    <td className="a-r font-mono">
                      {rupiah(result.aisa.reviewPerProposalIdr)}
                    </td>
                  </tr>
                  <tr>
                    <td>Biaya AI</td>
                    <td className="a-r font-mono">—</td>
                    <td className="a-r font-mono">
                      {rupiah(result.aisa.aiPerProposalIdr)}
                    </td>
                  </tr>
                  <tr>
                    <td className="font-medium">Total</td>
                    <td className="a-r font-mono font-medium">
                      {rupiah(result.manual.perProposalIdr)}
                    </td>
                    <td className="a-r font-mono font-medium">
                      {rupiah(result.aisa.perProposalIdr)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11.5px] leading-snug text-muted-foreground">
              Biaya AI per proposal adalah rata-rata{' '}
              {formatNumber(units.proposal?.n ?? 0)} proposal yang sudah
              dinilai, dihitung ulang dengan tarif terpilih.
              {digestUsd === null
                ? ' Ringkasan belum ikut dihitung karena belum ada ringkasan yang ditulis model.'
                : ` Ringkasan dihitung ${DIGESTS_PER_MONTH} kali sebulan (09.00 dan 17.00 setiap hari) dengan rata-rata ${rupiah(result.aisa.digestsMonthIdr / DIGESTS_PER_MONTH)} per ringkasan.`}{' '}
              Asisten tidak ikut dihitung karena dipakai sesuai pertanyaan,
              bukan per proposal.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
