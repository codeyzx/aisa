import { ClockIcon, SunriseIcon, SunsetIcon } from 'lucide-react'

import { nextDigestSlot } from '@/components/shell/shell-routes'
import type { Digest, Proposal } from '@/features/aisa/aisa.schema'
import { formatDate, formatTime } from '@/lib/format/date'
import { LOCALE, TIME_ZONE } from '@/lib/format/locale'

import {
  buildDigestPreview,
  digestLines,
  INLINE_MAX,
  MANUAL_MAX,
  OUT_OF_FOCUS_MARK,
  SANGAT_DETAIL_MAX,
} from './digest-preview'
import { SettingsTabLink } from './settings-dirty'
import { SettingsPanel, SettingsRow } from './settings-panel'
import { WhatsappPreview } from './whatsapp-preview'

const weekday = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  weekday: 'long',
})
const hourMinute = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** The opening's "since" sentence, worded as `opening()` in digest.py words it. */
function sinceSentence(latest: Digest | null, newCount: number): string {
  if (!latest)
    return `Ini ringkasan pertama dari AISA. Sejauh ini masuk ${newCount} proposal.`
  const at = latest.sentAt
  return `Sejak ringkasan ${weekday.format(at)} pukul ${hourMinute.format(at).replace(':', '.')} masuk ${newCount} proposal baru.`
}

/**
 * The ringkasan schedule (fixed: aisa-api only accepts the 09.00 and 17.00
 * slots) and a live, read-only preview of its body.
 */
export function DigestTab({
  unresponded,
  latest,
  newCount,
  now,
}: {
  unresponded: Proposal[]
  latest: Digest | null
  /** Proposals created since the last ringkasan (all of them before the first). */
  newCount: number
  now: Date
}) {
  const preview = buildDigestPreview(unresponded)
  const lines = digestLines(preview)
  const next = nextDigestSlot(now)
  const nextIsTomorrow =
    next === '09.00' && Number(hourMinute.format(now).slice(0, 2)) >= 17

  const contents = [
    {
      label: 'Sangat layak',
      text: `Ditulis lengkap: nama, sektor, dana, skor, dan alasan singkat. Paling banyak ${SANGAT_DETAIL_MAX} proposal.`,
    },
    {
      label: 'Layak bersyarat, Perlu penyesuaian',
      text: `Nama dan skor dalam satu baris per grade. Paling banyak ${INLINE_MAX} proposal per grade.`,
    },
    { label: 'Risiko tinggi, Tidak layak', text: 'Jumlahnya saja.' },
    {
      label: 'Di luar fokus',
      text: `Tetap di grade-nya, diberi tanda “${OUT_OF_FOCUS_MARK}” dan ditaruh setelah yang sesuai fokus. Jumlahnya ditulis satu baris: prioritas rendah.`,
    },
    {
      label: 'Perlu dicek manual',
      text: `Nama saja. Paling banyak ${MANUAL_MAX} proposal.`,
    },
  ]

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-5">
        <SettingsPanel
          title="Jadwal kirim"
          description="Dua kali sehari AISA mengirim daftar proposal yang belum ditanggapi. Jadwal ini tetap dan diatur di server."
          footer={
            <p className="flex items-start gap-2">
              <ClockIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Berikutnya{' '}
                <b className="font-medium text-foreground">
                  {nextIsTomorrow ? 'besok' : 'hari ini'} pukul {next} WIB
                </b>
              </span>
            </p>
          }
        >
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {[
              { icon: SunriseIcon, label: 'Ringkasan pagi', time: '09.00' },
              { icon: SunsetIcon, label: 'Ringkasan sore', time: '17.00' },
            ].map((slot) => (
              <div key={slot.time} className="flex flex-col gap-2">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <slot.icon className="size-4 text-muted-foreground" />
                  {slot.label}
                </p>
                <p className="flex h-8 items-center rounded-lg border bg-muted/40 px-2.5 font-mono text-sm tabular-nums">
                  {slot.time} WIB
                </p>
              </div>
            ))}
          </div>
        </SettingsPanel>

        <SettingsPanel
          title="Isi pesan"
          description="Proposal dengan skor tertinggi ditulis lengkap. Sisanya cukup dihitung per grade agar pesan tetap pendek."
        >
          {contents.map((row) => (
            <SettingsRow key={row.label} label={row.label}>
              <p className="text-[13px] leading-relaxed @xl:pt-1.5">
                {row.text}
              </p>
            </SettingsRow>
          ))}
          <SettingsRow
            label="Dikirim ke"
            description="Nomor manajer yang diatur di server aisa-api."
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 @xl:pt-1.5">
              <span className="text-sm text-muted-foreground">
                Tidak ditampilkan di dashboard
              </span>
              <SettingsTabLink tab="profil">Lihat profil</SettingsTabLink>
            </div>
          </SettingsRow>
        </SettingsPanel>
      </div>

      <aside
        aria-label="Pratinjau pesan WhatsApp"
        className="min-w-0 space-y-3 xl:sticky xl:top-16"
      >
        <WhatsappPreview
          lines={lines}
          pending={preview.pending}
          since={sinceSentence(latest, newCount)}
          initialSlot={next}
        />
        <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
          <p>
            Isi mengikuti {preview.pending} proposal yang belum ditanggapi saat
            ini. Saat dikirim, AISA menambah kalimat “Yang menarik” dan boleh
            merapikan bahasanya tanpa mengubah nama dan angka.
          </p>
          {latest ? (
            <p>
              Ringkasan {latest.slot} terakhir terkirim{' '}
              {formatDate(latest.sentAt)} pukul {formatTime(latest.sentAt)} ·{' '}
              {latest.counts.belumDitanggapi} proposal belum ditanggapi.
            </p>
          ) : (
            <p>Belum ada ringkasan yang terkirim.</p>
          )}
        </div>
      </aside>
    </div>
  )
}
