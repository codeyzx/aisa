'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import type { AisaApiOutcome } from '@/lib/aisa-api/outcome'
import { settleAction, type ActionResult } from '@/lib/data/action.contract'

/**
 * Run an `aisa-api` server action and surface BOTH failure layers — the gate's
 * envelope and the API's own refusal — as one visible message. Nothing a manager
 * clicks may fail silently: the error stays on screen until the next attempt.
 */
export function useApiAction() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run<T>(
    action: () => Promise<ActionResult<AisaApiOutcome<T>>>,
    options: {
      /** A fixed message, or one built from what the API answered. */
      success?: string | ((data: T) => string)
      onSuccess?: (data: T) => void
      onError?: (message: string) => void
    } = {},
  ) {
    setError(null)
    startTransition(async () => {
      const result = await settleAction(action)
      const message = !result.ok
        ? result.error
        : !result.data.ok
          ? result.data.error
          : null
      if (message !== null) {
        setError(message)
        toast.error(message)
        options.onError?.(message)
        return
      }
      if (result.ok && result.data.ok) {
        if (options.success)
          toast.success(
            typeof options.success === 'function'
              ? options.success(result.data.data)
              : options.success,
          )
        options.onSuccess?.(result.data.data)
      }
    })
  }

  return { pending, error, run }
}
