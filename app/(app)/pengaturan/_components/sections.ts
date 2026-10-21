import {
  MessageSquareIcon,
  PaletteIcon,
  PlugIcon,
  ShieldCheckIcon,
  UserIcon,
  type LucideIcon,
} from 'lucide-react'

export const SETTINGS_TABS = [
  'profil',
  'tampilan',
  'ringkasan',
  'integrasi',
  'privasi',
] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]

export interface SettingsSection {
  value: SettingsTab
  title: string
  description: string
  icon: LucideIcon
  group: 'Akun' | 'Ruang kerja'
}

/** Order and copy of the Pengaturan tabs; `value` is the `?tab=` in the URL. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    value: 'profil',
    title: 'Profil',
    description:
      'Akun yang Anda pakai untuk masuk ke AISA, dan apa yang boleh dilakukannya.',
    icon: UserIcon,
    group: 'Akun',
  },
  {
    value: 'tampilan',
    title: 'Tampilan',
    description:
      'Tema AISA di perangkat ini. Langsung berlaku, tidak perlu disimpan.',
    icon: PaletteIcon,
    group: 'Akun',
  },
  {
    value: 'ringkasan',
    title: 'Ringkasan WhatsApp',
    description:
      'Kapan AISA mengirim ringkasan proposal ke WhatsApp, dan apa isinya.',
    icon: MessageSquareIcon,
    group: 'Ruang kerja',
  },
  {
    value: 'integrasi',
    title: 'Integrasi',
    description:
      'Layanan yang dipakai AISA untuk menerima, menilai, menyimpan, dan melaporkan proposal.',
    icon: PlugIcon,
    group: 'Ruang kerja',
  },
  {
    value: 'privasi',
    title: 'Privasi & data',
    description:
      'Data founder apa yang disimpan, berapa lama, dan apa yang ikut terhapus.',
    icon: ShieldCheckIcon,
    group: 'Ruang kerja',
  },
]

export const SETTINGS_GROUPS = ['Akun', 'Ruang kerja'] as const

/** An unknown or missing `?tab=` opens the first tab, never an error page. */
export function settingsTabOf(raw: string | string[] | undefined): SettingsTab {
  const value = Array.isArray(raw) ? raw[0] : raw
  return SETTINGS_TABS.find((tab) => tab === value) ?? 'profil'
}
