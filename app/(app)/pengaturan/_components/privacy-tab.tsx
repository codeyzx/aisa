import { CheckIcon, ShieldCheckIcon, Trash2Icon } from 'lucide-react'

import type { EditableRules } from '@/features/aisa/aisa.schema'
import { formatNumber } from '@/lib/format/number'

import { RetentionForm } from './retention-form'
import { SettingsPanel } from './settings-panel'

// What a proposal document and its deck text hold (aisa-firestore contract).
const STORED = [
  {
    title: 'Nama startup, nama dan email founder',
    note: 'Untuk mengenali pengirim dan menghubungi founder',
  },
  {
    title: 'Berkas proposal dan teksnya per halaman',
    note: 'Berkas dari formulir di Google Drive; berkas yang diunggah di penyimpanan AISA',
  },
  {
    title: 'Nilai, kutipan, dan nomor halaman',
    note: 'Bukti di balik setiap nilai kriteria',
  },
  {
    title: 'Sektor, tahap, dan dana yang dicari',
    note: 'Untuk tiga cek fokus',
  },
]

// What `domain.delete_proposal` removes or scrubs — the path both "Hapus data"
// and retention take.
const ON_DELETE = [
  { title: 'Proposal, teksnya, dan log penilaiannya', note: 'Dihapus' },
  {
    title: 'Berkas proposal yang diunggah ke AISA',
    note: 'Dihapus dari penyimpanan',
  },
  {
    title: 'Riwayat dan catatan ringkasan terkirim',
    note: 'Tetap ada sebagai jejak audit, tanpa nama proposal',
  },
  {
    title: 'Berkas proposal dari formulir di Google Drive',
    note: 'Tidak disentuh AISA; hapus dari Drive bila diminta',
  },
]

export function PrivacyTab({
  rules,
  version,
  proposalCount,
  canConfigure,
}: {
  rules: EditableRules
  version: number
  proposalCount: number
  canConfigure: boolean
}) {
  const facts = [
    {
      value: formatNumber(proposalCount),
      label: 'proposal tersimpan saat ini',
    },
    {
      value: `${rules.retentionDays} hari`,
      label: 'proposal yang ditolak lalu dihapus',
    },
    { value: 'Wajib', label: 'persetujuan founder di formulir' },
  ]

  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <section className="rounded-xl border bg-card xl:col-span-2">
        <div className="flex items-start gap-3 border-b p-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success-soft text-success">
            <ShieldCheckIcon className="size-[18px]" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <h3 className="text-[15px] font-semibold tracking-tight">
              Data founder di AISA
            </h3>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Proposal dari formulir hanya diproses bila founder memberi
              persetujuan, dan proposal yang ditolak dihapus otomatis setelah{' '}
              {rules.retentionDays} hari.
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-3 divide-x">
          {facts.map((fact) => (
            <div key={fact.label} className="px-3 py-4 sm:px-5">
              <dt className="sr-only">{fact.label}</dt>
              <dd className="text-base font-semibold tabular-nums sm:text-xl">
                {fact.value}
              </dd>
              <dd className="text-xs leading-snug text-muted-foreground">
                {fact.label}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <SettingsPanel
        title="Data apa yang disimpan"
        description="Sekilas tentang data founder di AISA, dan apa yang terjadi saat proposal dihapus."
      >
        <div className="grid md:grid-cols-2 md:divide-x">
          <div className="space-y-3 p-5">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Disimpan AISA
            </p>
            <ul className="space-y-3">
              {STORED.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                    <CheckIcon className="size-3" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">
                      {item.title}
                    </span>
                    <span className="block text-[13px] text-muted-foreground">
                      {item.note}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-3 border-t p-5 md:border-t-0">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Saat proposal dihapus
            </p>
            <ul className="space-y-3">
              {ON_DELETE.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                    <Trash2Icon className="size-3" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">
                      {item.title}
                    </span>
                    <span className="block text-[13px] text-muted-foreground">
                      {item.note}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SettingsPanel>

      <div className="space-y-5">
        <RetentionForm
          rules={rules}
          version={version}
          canConfigure={canConfigure}
        />
        <SettingsPanel
          title="Permintaan hapus dari founder"
          description="Buka proposalnya, lalu pilih Hapus data. Penghapusan wajib disertai alasan dan tercatat di Riwayat."
        >
          <p className="px-5 py-4 text-[13px] text-muted-foreground">
            Hanya peran yang boleh mengatur AISA yang melihat tombol Hapus data.
          </p>
        </SettingsPanel>
      </div>
    </div>
  )
}
