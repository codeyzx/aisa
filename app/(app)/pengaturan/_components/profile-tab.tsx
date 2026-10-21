import { CheckIcon, LockIcon, XIcon } from 'lucide-react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  AISA_CONFIGURE,
  AISA_READ,
  AISA_RESPOND,
} from '@/features/aisa/aisa.capability'
import { ROLE_LABEL, roleCan, type Capability } from '@/lib/auth/rbac'
import type { Session } from '@/lib/auth/session.contract'
import { cn } from '@/lib/utils'

import { SettingsPanel, SettingsRow } from './settings-panel'
import { SettingsTabLink } from './settings-dirty'

/** What each capability lets a seat do, in the words the pages use. */
const ABILITIES: { capability: Capability; title: string; note: string }[] = [
  {
    capability: AISA_READ,
    title: 'Melihat semua halaman',
    note: 'Proposal, tren, aktivitas AI, riwayat, dan aturan penilaian.',
  },
  {
    capability: AISA_RESPOND,
    title: 'Menanggapi proposal',
    note: 'Undang, pantau, arsipkan, koreksi kategori, dan unggah deck.',
  },
  {
    capability: AISA_CONFIGURE,
    title: 'Mengatur AISA',
    note: 'Mengubah aturan penilaian, STOP/LANJUT, dan hapus data.',
  },
]

/** Read-only: the dashboard has no path that writes a user's account. */
export function ProfileTab({ session }: { session: Session }) {
  const email = session.email ?? 'Pengguna tak dikenal'
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <SettingsPanel>
        <div className="flex flex-wrap items-center gap-4 border-b px-5 py-5">
          <Avatar className="size-14">
            <AvatarFallback className="bg-primary text-lg font-semibold text-primary-foreground">
              {email.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{email}</p>
            <p className="truncate text-sm text-muted-foreground">
              {ROLE_LABEL[session.role]}
            </p>
          </div>
          <p className="flex w-full items-center gap-1.5 text-xs text-muted-foreground @lg:w-auto">
            <LockIcon className="size-3.5" />
            Akun dan peran diatur pemilik akun
          </p>
        </div>
        <SettingsRow label="Email" description="Untuk masuk ke AISA.">
          <p className="pt-1.5 text-sm font-medium break-all">{email}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {session.emailVerified
              ? 'Email sudah terverifikasi.'
              : 'Email belum terverifikasi.'}
          </p>
        </SettingsRow>
        <SettingsRow
          label="Peran"
          description="Menentukan tombol apa yang tampil untuk Anda."
        >
          <ul className="space-y-3 pt-1.5">
            {ABILITIES.map((item) => {
              const ok = roleCan(session.role, item.capability)
              return (
                <li key={item.capability} className="flex gap-3">
                  <span
                    className={cn(
                      'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full',
                      ok
                        ? 'bg-success-soft text-success'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {ok ? (
                      <CheckIcon className="size-3" />
                    ) : (
                      <XIcon className="size-3" />
                    )}
                  </span>
                  <span>
                    <span
                      className={cn(
                        'block text-sm font-medium',
                        !ok && 'text-muted-foreground',
                      )}
                    >
                      {item.title}
                    </span>
                    <span className="block text-[13px] text-muted-foreground">
                      {item.note}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </SettingsRow>
      </SettingsPanel>

      <SettingsPanel
        title="WhatsApp"
        description="AISA mengirim ringkasan ke nomor manajer, dan manajer bisa membalas langsung dengan undang, pantau, atau arsipkan."
      >
        <SettingsRow
          label="Nomor WhatsApp"
          description={
            <SettingsTabLink tab="ringkasan">
              Lihat jadwal ringkasan
            </SettingsTabLink>
          }
        >
          <p className="pt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            Diatur di server aisa-api (MANAGER_PHONES), bukan dari dashboard.
          </p>
        </SettingsRow>
      </SettingsPanel>
    </div>
  )
}
