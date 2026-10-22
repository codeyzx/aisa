import {
  MODEL_PRICES,
  PRICING_SOURCE,
  USD_IDR,
} from '@/features/aisa/aisa.pricing'
import type { Rules } from '@/features/aisa/aisa.schema'
import { formatRupiah, formatUsd } from '@/lib/format/currency'
import { formatNumber } from '@/lib/format/number'

import { isoDateLabel } from '../money'

const AGENT_MODEL: { key: keyof Rules['models']; agent: string }[] = [
  { key: 'penilai', agent: 'Penilai' },
  { key: 'ringkasan', agent: 'Pembuat ringkasan' },
  { key: 'insight', agent: 'Insight (bagian ringkasan)' },
  { key: 'asisten', agent: 'Asisten' },
]

/** How the page computes its numbers, every source, and what it leaves out. */
export function CostMethod({
  jobsRead,
  jobWindow,
  models,
}: {
  jobsRead: number
  jobWindow: number
  models: Rules['models'] | null
}) {
  return (
    <details className="group rounded-[14px] border px-4 py-3">
      <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">
        <span className="flex items-center justify-between gap-3">
          Cara menghitung dan sumber
          <span className="text-xs font-normal text-primary group-open:hidden">
            Buka
          </span>
          <span className="hidden text-xs font-normal text-primary group-open:inline">
            Tutup
          </span>
        </span>
      </summary>

      <div className="mt-3 grid gap-5 text-[13px] leading-relaxed md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h4 className="font-semibold">Harga yang dipakai</h4>
          <div className="a-tablewrap">
            <table className="a-table" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>Model · periode</th>
                  <th className="a-r">Masuk</th>
                  <th className="a-r">Masuk (cache)</th>
                  <th className="a-r">Keluar</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(MODEL_PRICES).flatMap(([model, periods]) =>
                  periods.map((p) => (
                    <tr key={`${model}-${p.label}`}>
                      <td>
                        <span className="font-mono text-xs">{model}</span>
                        <br />
                        <span className="text-xs text-muted-foreground">
                          {p.label}
                        </span>
                      </td>
                      <td className="a-r font-mono">
                        {formatUsd(p.rates.input)}
                      </td>
                      <td className="a-r font-mono">
                        {formatUsd(p.rates.cachedInput)}
                      </td>
                      <td className="a-r font-mono">
                        {formatUsd(p.rates.output)}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            USD per 1 juta token, Vertex AI tier Standard, endpoint{' '}
            {PRICING_SOURCE.endpoint}. Token keluar termasuk token berpikir.
            Sumber:{' '}
            <a
              className="a-navlink"
              href={PRICING_SOURCE.url}
              target="_blank"
              rel="noreferrer"
            >
              halaman harga Vertex AI
            </a>
            , diambil {isoDateLabel(PRICING_SOURCE.retrievedOn)}. Setiap hari
            dihitung dengan tarif yang berlaku pada tanggal pemakaiannya.
          </p>
          {Object.values(MODEL_PRICES)
            .flat()
            .filter((p) => p.invoiceNote)
            .map((p) => (
              <p key={p.label} className="text-xs text-muted-foreground">
                {p.invoiceNote}
              </p>
            ))}
          <p className="text-xs text-muted-foreground">
            Kurs acuan: {formatRupiah(USD_IDR.rate)} per USD ({USD_IDR.source},{' '}
            {isoDateLabel(USD_IDR.date)},{' '}
            <a
              className="a-navlink"
              href={USD_IDR.url}
              target="_blank"
              rel="noreferrer"
            >
              tabel resmi
            </a>
            ). Kurs di tagihan atau kartu Anda bisa berbeda.
          </p>
          {models ? (
            <dl className="a-kv">
              {AGENT_MODEL.map(({ key, agent }) => (
                <div key={key} className="contents">
                  <dt>{agent}</dt>
                  <dd className="font-mono text-xs">{models[key]}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="font-semibold">Yang dihitung</h4>
          <ul className="flex list-disc flex-col gap-1.5 pl-4">
            <li>
              Total, rincian per agent, dan grafik harian memakai catatan harian
              pemakaian (dailyStats). Catatan ini tetap ada ketika proposal
              dihapus. Karena catatan harian tidak menyimpan nama model, token
              setiap agent dihargai dengan model yang sekarang diatur untuk
              agent itu (daftar di samping).
            </li>
            <li>
              Rata-rata per proposal, per pertanyaan, dan per ringkasan memakai
              log pekerjaan AI ({formatNumber(jobsRead)} pekerjaan terbaru,
              paling banyak {formatNumber(jobWindow)}), masing-masing dengan
              model dan tanggalnya sendiri. Pekerjaan penilaian ikut terhapus
              bersama proposalnya, jadi rata-rata ini hanya dari proposal yang
              masih ada.
            </li>
            <li>
              Semua token masuk dihargai dengan tarif penuh. AISA tidak mencatat
              token yang dilayani dari cache, jadi angkanya batas atas.
            </li>
          </ul>
          <h4 className="font-semibold">Yang tidak dihitung</h4>
          <ul className="flex list-disc flex-col gap-1.5 pl-4">
            <li>
              Pembuatan memori Asisten (Memory Bank), yang memakai model
              gemini-3.5-flash dan ditagih terpisah.
            </li>
            <li>
              Komputasi dan penyimpanan Agent Runtime. Google memberi kuota
              gratis bulanan 50 vCPU-jam dan 100 GiB-jam; pemakaian sebesar ini
              kemungkinan masih di dalamnya.
            </li>
            <li>
              Panggilan model di luar aplikasi, misalnya saat pengembangan dan
              uji coba. Saat diukur pada 21 Oktober 2026, total token
              gemini-3.8-flash di Vertex AI proyek sekitar dua kali token yang
              tercatat di aplikasi.
            </li>
            <li>
              Cloud Run, Firestore, dan penyimpanan berkas proposal. Semua angka
              di halaman ini perkiraan, bukan jumlah tagihan.
            </li>
          </ul>
        </div>
      </div>
    </details>
  )
}
