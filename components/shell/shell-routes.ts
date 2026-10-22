/**
 * What the shell's header says for a route, and the two clock facts it shows
 * (greeting, next ringkasan slot). Pure and directive-free so the server layout,
 * the client header and the unit test all read the same rules.
 *
 * Clock facts are computed in WIB (`TIME_ZONE`), not the host zone: the
 * ringkasan runs at 09.00 every day and 17.00 on Fridays, Jakarta time, and a browser or a server in
 * another zone must still name the slot the manager will actually receive.
 */
import { MANAGER_SALUTATION } from '@/lib/app-config'
import { LOCALE, TIME_ZONE } from '@/lib/format/locale'

export interface RouteHeading {
  title: string
  subtitle: string
  /** Dashboard swaps its subtitle for the greeting once the clock is known. */
  greets: boolean
}

interface RouteEntry {
  href: string
  title: string
  subtitle: (pending: number) => string
}

const ROUTES: readonly RouteEntry[] = [
  {
    href: '/dashboard',
    title: 'Dashboard',
    subtitle: () => 'Ringkasan pipeline proposal Anda',
  },
  {
    href: '/proposal',
    title: 'Proposal',
    subtitle: (pending) => `${pending} menunggu keputusan Anda`,
  },
  { href: '/tren', title: 'Tren', subtitle: () => '14 hari terakhir' },
  {
    href: '/aktivitas',
    title: 'Aktivitas AI',
    subtitle: () =>
      'Apa saja yang dikerjakan AI, berapa token, dan berapa lama',
  },
  {
    href: '/biaya',
    title: 'Biaya AI',
    subtitle: () =>
      'Berapa biaya AI dan berapa yang dihemat dibanding cek manual',
  },
  {
    href: '/riwayat',
    title: 'Riwayat',
    subtitle: () => 'Jejak audit: siapa melakukan apa, dan kapan',
  },
  {
    href: '/aturan',
    title: 'Aturan penilaian',
    subtitle: () => 'Cara AISA menilai proposal dan aturan yang bisa Anda ubah',
  },
  {
    href: '/pengaturan',
    title: 'Pengaturan',
    subtitle: () => 'Akun, tampilan, dan ruang kerja',
  },
]

/** `/proposal` owns `/proposal/x`, but not `/proposal-arsip`. */
export function isRouteActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function routeHeading(pathname: string, pending: number): RouteHeading {
  const entry = ROUTES.find((route) => isRouteActive(pathname, route.href))
  if (!entry) return { title: 'AISA', subtitle: '', greets: false }
  const isDetail = entry.href === '/proposal' && pathname !== '/proposal'
  return {
    title: entry.title,
    subtitle: isDetail ? 'Detail proposal' : entry.subtitle(pending),
    greets: entry.href === '/dashboard',
  }
}

const hourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hour: 'numeric',
  hourCycle: 'h23',
})

const dayFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

function wibHour(date: Date): number {
  return Number(hourFormatter.format(date))
}

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  weekday: 'short',
})

export type DigestSlot = '09.00' | '17.00'

/** The ringkasan the scheduler sends next, as the sidebar and Pengaturan name it. */
export interface NextDigest {
  slot: DigestSlot
  /** 09.00 is the daily ringkasan; 17.00 is always the weekly summary. */
  period: 'harian' | 'mingguan'
  /** `false` when it goes out today, `true` when tomorrow. */
  tomorrow: boolean
  /** "09.00", "Besok 09.00" or "17.00 (mingguan)". */
  label: string
}

/**
 * The next send in WIB: 09.00 every day and 17.00 on Fridays only. Before 09.00
 * that is today's 09.00; on a Friday between 09.00 and 17.00 the weekly 17.00;
 * any other time tomorrow's 09.00 — a slot's own hour counts as already sent.
 */
export function nextDigest(date: Date): NextDigest {
  const hour = wibHour(date)
  if (hour < 9)
    return { slot: '09.00', period: 'harian', tomorrow: false, label: '09.00' }
  if (weekdayFormatter.format(date) === 'Fri' && hour < 17)
    return {
      slot: '17.00',
      period: 'mingguan',
      tomorrow: false,
      label: '17.00 (mingguan)',
    }
  return {
    slot: '09.00',
    period: 'harian',
    tomorrow: true,
    label: 'Besok 09.00',
  }
}

/** `Selamat pagi, Pak · Rabu, 21 Oktober` — pagi before 12, siang before 15, sore after. */
export function greeting(date: Date): string {
  const hour = wibHour(date)
  const part = hour < 12 ? 'pagi' : hour < 15 ? 'siang' : 'sore'
  return `Selamat ${part}, ${MANAGER_SALUTATION} · ${dayFormatter.format(date)}`
}
