'use client'

import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'

import { cn } from '@/lib/utils'

import { SettingsPanel } from './settings-panel'

const THEMES = [
  {
    value: 'light',
    title: 'Terang',
    description: 'Cocok untuk siang hari',
    icon: SunIcon,
  },
  {
    value: 'dark',
    title: 'Gelap',
    description: 'Nyaman di ruangan redup',
    icon: MoonIcon,
  },
  {
    value: 'system',
    title: 'Ikuti sistem',
    description: 'Sesuai pengaturan perangkat',
    icon: MonitorIcon,
  },
]

// A miniature workspace. The colours are literal on purpose: each card pictures
// another theme, not the active one.
function pane(dark: boolean) {
  return (
    <div
      className={cn(
        'flex h-full flex-1 gap-1.5 p-2',
        dark ? 'bg-zinc-900' : 'bg-zinc-100',
      )}
    >
      <div
        className={cn(
          'w-1/4 space-y-1 rounded p-1',
          dark ? 'bg-zinc-800' : 'bg-white',
        )}
      >
        <div
          className={cn(
            'h-1.5 w-3/4 rounded-full',
            dark ? 'bg-zinc-600' : 'bg-zinc-300',
          )}
        />
        <div
          className={cn(
            'h-1.5 w-full rounded-full',
            dark ? 'bg-sky-400/70' : 'bg-blue-700/70',
          )}
        />
        <div
          className={cn(
            'h-1.5 w-2/3 rounded-full',
            dark ? 'bg-zinc-600' : 'bg-zinc-300',
          )}
        />
      </div>
      <div
        className={cn(
          'flex-1 space-y-1.5 rounded p-1.5',
          dark ? 'bg-zinc-800' : 'bg-white',
        )}
      >
        <div
          className={cn(
            'h-2 w-1/2 rounded-full',
            dark ? 'bg-zinc-500' : 'bg-zinc-400',
          )}
        />
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                'h-4 rounded',
                dark ? 'bg-zinc-700' : 'bg-zinc-100',
              )}
            />
          ))}
        </div>
        <div
          className={cn(
            'h-1.5 w-full rounded-full',
            dark ? 'bg-zinc-700' : 'bg-zinc-200',
          )}
        />
        <div
          className={cn(
            'h-1.5 w-4/5 rounded-full',
            dark ? 'bg-zinc-700' : 'bg-zinc-200',
          )}
        />
      </div>
    </div>
  )
}

function Preview({ mode }: { mode: string }) {
  return (
    <div aria-hidden className="flex h-24 overflow-hidden rounded-lg border">
      {mode === 'system' ? (
        <>
          {pane(false)}
          {pane(true)}
        </>
      ) : (
        pane(mode === 'dark')
      )}
    </div>
  )
}

/** The theme is UI state (next-themes, this device), not data: it applies at once. */
export function AppearanceTab() {
  const { theme: stored, setTheme } = useTheme()
  // The stored theme is only known in the browser; the first render shows no choice.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const theme = mounted ? stored : undefined

  return (
    <SettingsPanel
      title="Tema"
      description="Pilih warna tampilan yang paling nyaman untuk mata Anda."
      footer={
        <span>
          Bisa juga diganti cepat lewat ikon bulan/matahari di kanan atas.
        </span>
      }
    >
      <fieldset aria-label="Tema" className="grid gap-3 p-5 sm:grid-cols-3">
        {THEMES.map((t) => {
          const on = theme === t.value
          return (
            <button
              key={t.value}
              type="button"
              aria-pressed={on}
              onClick={() => setTheme(t.value)}
              className={cn(
                'relative cursor-pointer space-y-3 rounded-xl border p-2.5 text-left transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                on
                  ? 'border-primary ring-4 ring-primary/20'
                  : 'hover:border-foreground/25',
              )}
            >
              <Preview mode={t.value} />
              <div className="flex items-center gap-2 px-1">
                <t.icon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.description}
                  </p>
                </div>
                <span
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded-full border transition-colors',
                    on && 'border-primary bg-primary text-primary-foreground',
                  )}
                >
                  {on && <CheckIcon className="size-3" />}
                </span>
              </div>
            </button>
          )
        })}
      </fieldset>
    </SettingsPanel>
  )
}
