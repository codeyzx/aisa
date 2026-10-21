'use client'

import { ArrowRightIcon } from 'lucide-react'
import { createContext, use, useEffect } from 'react'

import type { SettingsTab } from './sections'

interface DirtyContext {
  setDirty: (dirty: boolean) => void
  selectTab: (tab: SettingsTab) => void
}

const SettingsDirtyContext = createContext<DirtyContext>({
  setDirty: () => {},
  selectTab: () => {},
})

export const SettingsDirtyProvider = SettingsDirtyContext.Provider

/**
 * A form reports unsaved changes so switching tab asks first, and the browser
 * warns before the page is left.
 */
export function useReportDirty(dirty: boolean) {
  const { setDirty } = use(SettingsDirtyContext)
  useEffect(() => {
    setDirty(dirty)
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      setDirty(false)
    }
  }, [dirty, setDirty])
}

/** A link to another Pengaturan tab that still goes through the unsaved-changes check. */
export function SettingsTabLink({
  tab,
  children,
}: {
  tab: SettingsTab
  children: React.ReactNode
}) {
  const { selectTab } = use(SettingsDirtyContext)
  return (
    <button
      type="button"
      onClick={() => selectTab(tab)}
      className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
    >
      {children}
      <ArrowRightIcon className="size-3.5" />
    </button>
  )
}
