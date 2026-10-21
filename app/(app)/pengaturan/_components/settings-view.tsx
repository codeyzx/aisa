'use client'

import { useRouter } from 'next/navigation'
import { Fragment, useCallback, useMemo, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

import {
  SETTINGS_GROUPS,
  SETTINGS_SECTIONS,
  type SettingsTab,
} from './sections'
import { SettingsDirtyProvider } from './settings-dirty'

/**
 * Pengaturan's frame: the grouped tab bar (the tab lives in `?tab=`), the
 * active tab's one-line explanation, and the unsaved-changes guard. The tab's
 * content is rendered on the server and arrives as `children`.
 */
export function SettingsView({
  tab,
  children,
}: {
  tab: SettingsTab
  children: React.ReactNode
}) {
  const router = useRouter()
  const active = SETTINGS_SECTIONS.find((s) => s.value === tab)!
  const [dirty, setDirty] = useState(false)
  const [pendingTab, setPendingTab] = useState<SettingsTab | null>(null)

  const go = useCallback(
    (value: SettingsTab) =>
      router.replace(`/pengaturan?tab=${value}`, { scroll: false }),
    [router],
  )
  const selectTab = useCallback(
    (value: SettingsTab) => {
      if (value === tab) return
      if (dirty) setPendingTab(value)
      else go(value)
    },
    [tab, dirty, go],
  )
  const context = useMemo(() => ({ setDirty, selectTab }), [selectTab])

  return (
    <SettingsDirtyProvider value={context}>
      <div className="flex w-full flex-col gap-5">
        <nav
          aria-label="Bagian pengaturan"
          className="sticky -top-5 z-20 -mx-5 -mt-5 border-b bg-card px-5 pt-3 max-[860px]:static max-[860px]:mt-0 max-[860px]:pt-0"
        >
          <div
            role="tablist"
            className="-mb-px flex [scrollbar-width:none] items-end gap-1 overflow-x-auto"
          >
            {SETTINGS_GROUPS.map((group, index) => (
              <Fragment key={group}>
                {index > 0 && (
                  <span
                    aria-hidden
                    className="mx-2 mb-3 h-5 w-px shrink-0 bg-border"
                  />
                )}
                {SETTINGS_SECTIONS.filter((s) => s.group === group).map(
                  (section) => {
                    const on = section.value === tab
                    return (
                      <button
                        key={section.value}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => selectTab(section.value)}
                        className={cn(
                          'flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors',
                          on
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <section.icon
                          className={cn(
                            'size-4 shrink-0',
                            on && 'text-primary',
                          )}
                        />
                        {section.title}
                      </button>
                    )
                  },
                )}
              </Fragment>
            ))}
          </div>
        </nav>
        <p className="-mt-1 text-sm text-muted-foreground">
          {active.description}
        </p>
        <div key={tab}>{children}</div>
      </div>

      <AlertDialog
        open={pendingTab !== null}
        onOpenChange={(open) => !open && setPendingTab(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buang perubahan?</AlertDialogTitle>
            <AlertDialogDescription>
              Perubahan di bagian ini belum disimpan. Kalau pindah sekarang,
              perubahan itu akan hilang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingTab) go(pendingTab)
                setDirty(false)
                setPendingTab(null)
              }}
            >
              Buang dan pindah
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsDirtyProvider>
  )
}
