import { CalendarRangeIcon, ClockIcon, SunriseIcon } from 'lucide-react'

import { nextDigest } from '@/components/shell/shell-routes'
import type { Digest, Proposal } from '@/features/aisa/aisa.schema'
import { MANAGER_SALUTATION } from '@/lib/app-config'
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
import { weeklyLines, type WeeklyPreview } from './weekly-preview'
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

/**
 * The daily opening's "since" sentence, worded as `opening()` in digest.py words
 * it: the window starts at the previous 09.00 ringkasan, or covers the last 24
 * hours before the first one.
 */
function sinceSentence(morning: Digest | null, newCount: number): string {
  if (!morning)
    return `Ini ringkasan pagi pertama dari AISA. Dalam 24 jam terakhir masuk ${newCount} proposal baru.`
  const at = morning.sentAt
  return `Sejak ringkasan ${weekday.format(at)} pukul ${hourMinute.format(at).replace(':', '.')} masuk ${newCount} proposal baru.`
}

export const SCHEDULE = [
  {
    period: 'harian',
    icon: SunriseIcon,
    label: 'Ringkasan harian',
    time: '09.00 setiap hari',
    note: 'Proposal baru sejak ringkasan pagi sebelumnya',
  },
  {
    period: 'mingguan',
    icon: CalendarRangeIcon,
    label: 'Ringkasan mingguan',
    time: '17.00 setiap Jumat',
    note: 'Ringkasan minggu ini',
  },
] as const

const WEEKLY_CONTENTS = [
  {
    label: 'Proposal masuk',
    text: 'Jumlah minggu ini (Senin sampai saat kirim), dibanding minggu lalu.',
  },
  {
    label: 'Sektor',
    text: 'Tiga sektor terbanyak minggu ini, dengan persen dan jumlahnya.',
  },
  {
    label: 'Grade',
    text: 'Jumlah per grade untuk proposal minggu ini yang sudah dinilai, berapa yang Sangat layak + Layak bersyarat, dan berapa persen di luar fokus.',
  },
  {
    label: 'Rata-rata skor',
    text: 'Rata-rata skor minggu ini, dibanding minggu lalu.',
  },
  {
    label: 'Keputusan',
    text: 'Berapa yang Setuju dan Tolak minggu ini, berapa yang masih menunggu keputusan, dan umur yang terlama.',
  },
  {
    label: 'Top 3 minggu ini',
    text: 'Tiga proposal terbaik minggu ini: grade dulu, yang sesuai fokus dulu, lalu skor.',
  },
  {
    label: 'Perlu dicek manual',
    text: 'Jumlah proposal minggu ini yang perlu dicek manual.',
  },
]

/**
 * The ringkasan schedule (fixed: aisa-api only accepts the 09.00 and 17.00
 * slots; 09.00 is daily, 17.00 is the weekly summary sent on Fridays) and a live,
 * read-only preview of both messages.
 */
export function DigestTab({
  unresponded,
  latest,
  morning,
  newCount,
  weekly,
  now,
}: {
  unresponded: Proposal[]
  latest: Digest | null
  /** The newest 09.00 ringkasan: where the next daily window starts. */
  morning: Digest | null
  /** Proposals created in the next daily ringkasan's window. */
  newCount: number
  weekly: WeeklyPreview
  now: Date
}) {
  const preview = buildDigestPreview(unresponded)
  const daily = [
    `Selamat pagi, ${MANAGER_SALUTATION}. ${sinceSentence(morning, newCount)} Ada ${preview.pending} proposal yang belum ${MANAGER_SALUTATION} tanggapi.`,
    ...digestLines(preview),
  ]
  const next = nextDigest(now)

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
          description="AISA mengirim ringkasan harian setiap pagi dan ringkasan mingguan setiap Jumat sore. Jadwal ini tetap dan diatur di server."
          footer={
            <p className="flex items-start gap-2">
              <ClockIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Berikutnya{' '}
                <b className="font-medium text-foreground">
                  {`${next.tomorrow ? 'besok' : 'hari ini'} pukul ${next.slot} WIB (${next.period})`}
                </b>
              </span>
            </p>
          }
        >
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {SCHEDULE.map((slot) => (
              <div key={slot.period} className="flex flex-col gap-2">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <slot.icon className="size-4 text-muted-foreground" />
                  {slot.label}
                </p>
                <p className="flex min-h-8 items-center rounded-lg border bg-muted/40 px-2.5 text-sm font-medium tabular-nums">
                  {slot.time}
                </p>
                <p className="text-xs text-muted-foreground">{slot.note}</p>
              </div>
            ))}
          </div>
        </SettingsPanel>

        <SettingsPanel
          title="Isi ringkasan harian"
          description="Proposal yang belum ditanggapi. Yang skornya tertinggi ditulis lengkap; sisanya cukup dihitung per grade agar pesan tetap pendek."
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

        <SettingsPanel
          title="Isi ringkasan mingguan"
          description="Angka minggu ini, dihitung oleh kode. Tiap bagian diberi judul tebal agar mudah dibaca di WhatsApp."
        >
          {WEEKLY_CONTENTS.map((row) => (
            <SettingsRow key={row.label} label={row.label}>
              <p className="text-[13px] leading-relaxed @xl:pt-1.5">
                {row.text}
              </p>
            </SettingsRow>
          ))}
        </SettingsPanel>
      </div>

      <aside
        aria-label="Pratinjau pesan WhatsApp"
        className="min-w-0 space-y-3 xl:sticky xl:top-16"
      >
        <WhatsappPreview
          messages={{
            harian: daily,
            // Sent at 17.00, so it greets "Selamat sore" whenever it is previewed.
            mingguan: weeklyLines(weekly, 'Selamat sore'),
          }}
          initialPeriod={next.period}
        />
        <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
          <p>
            Harian mengikuti {preview.pending} proposal yang belum ditanggapi
            saat ini; mingguan menghitung minggu ini sampai sekarang. Saat
            dikirim, AISA menambah kalimat “Yang menarik” dan boleh merapikan
            bahasanya tanpa mengubah nama dan angka.
          </p>
          {latest ? (
            <p>
              Ringkasan {latest.period} {latest.slot} terakhir terkirim{' '}
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
