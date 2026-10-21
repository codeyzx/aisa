'use client'

import { useEffect, useState } from 'react'

import { attemptChunkReload, isChunkLoadError } from './chunk-error'

/**
 * Starts the one permitted reload for a stale chunk and reports when recovery
 * is exhausted, so an error boundary can render its local terminal fallback.
 */
export function useStaleChunkRecovery(error: Error): boolean {
  const [staleDeploy, setStaleDeploy] = useState(false)

  useEffect(() => {
    if (isChunkLoadError(error) && !attemptChunkReload()) {
      setStaleDeploy(true)
    }
  }, [error])

  return staleDeploy
}
