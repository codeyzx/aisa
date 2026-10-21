'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const EVERY_MS = 4000
/** About five minutes; a reload still shows the latest state after that. */
const MAX_REFRESHES = 75

/**
 * Re-reads the detail page every few seconds while its proposal is still
 * `antre` or `dinilai_proses`, so a freshly uploaded deck turns into its
 * assessment without a manual reload. The server render decides `active`; once
 * a refresh brings a settled status the effect is torn down, and it gives up
 * after `MAX_REFRESHES` so a stuck job does not poll forever.
 */
export function RefreshWhileScoring({ active }: { active: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!active) return
    let count = 0
    const timer = setInterval(() => {
      count += 1
      if (count > MAX_REFRESHES) clearInterval(timer)
      else router.refresh()
    }, EVERY_MS)
    return () => clearInterval(timer)
  }, [active, router])
  return null
}
