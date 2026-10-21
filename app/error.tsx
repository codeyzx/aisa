'use client'

// Route-segment error boundary — the fallback for any uncaught throw below the
// root layout. Real sources in this app: `runFormAction` rethrowing a
// non-validation error, and the Zod converter throwing on a malformed document
// at read time. `runAction` never reaches here — it returns an `ActionResult`
// envelope instead of throwing.
//
// Boundaries MUST be Client Components, and Next's file convention requires a
// DEFAULT export — that is the framework contract, not a break from the
// named-exports-only house rule.
//
// NOTE: we deliberately never render `error.message`. In production React
// replaces a server-thrown error with a fresh `Error` carrying a generic
// message and nothing but `digest`, so there is nothing safe or useful in it;
// in development it holds the raw message and stack. `digest` is the only
// stable handle — it matches the server log line, so we surface it for support.

import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'
import { useEffect } from 'react'

import { Button, buttonVariants } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { useStaleChunkRecovery } from '@/lib/use-stale-chunk-recovery'
import { cn } from '@/lib/utils'

interface ErrorPageProps {
  error: Error & { digest?: string }
  /**
   * Re-fetches AND re-renders the segment (Next >= 16.2). Prefer this over the
   * older `reset`, which only clears boundary state without re-fetching and so
   * cannot recover a Server Component error — which is exactly what ours are.
   */
  unstable_retry: () => void
}

export default function ErrorPage({ error, unstable_retry }: ErrorPageProps) {
  useEffect(() => {
    // Dev: full message + stack. Prod: the generic error and its digest.
    console.error('[error boundary]', error)
  }, [error])

  // A stale deploy's chunk 404 that a reload could NOT fix. Until this is true
  // we render nothing for that case, because the reload is already in flight.
  const staleDeploy = useStaleChunkRecovery(error)

  useEffect(() => {
    // Report to the error monitor, if one is configured. A React boundary
    // SWALLOWS what it catches, so this error never reaches the SDK's global
    // handler — an unreported boundary is a crash nobody hears about.
    //
    // A stale-deploy chunk 404 is deliberately NOT reported: it is expected
    // noise on every redeploy, identical for every user with a tab open, and it
    // would bury real crashes under a per-release spike. Same rule as
    // app/global-error.tsx.
    //
    // A SERVER error that lands here was already reported by `onRequestError`
    // (instrumentation.ts). Sentry's `dedupe` integration drops the duplicate by
    // message + stack; where it cannot, two events sharing the `digest` above
    // are still better than a silent client boundary.
    if (!staleDeploy) Sentry.captureException(error)
  }, [error, staleDeploy])

  if (staleDeploy) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Halaman ini sudah kedaluwarsa</EmptyTitle>
            <EmptyDescription>
              Aplikasi diperbarui saat tab ini terbuka, dan memuat ulang
              otomatis tidak menyelesaikannya. Muat ulang halaman untuk
              mendapatkan versi terbaru.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex items-center justify-center gap-2">
              {/* Deliberately NOT `unstable_retry`: a re-render fetches the same
                  missing chunk. Only a full reload can recover this. */}
              <Button onClick={() => globalThis.location.reload()}>
                Muat ulang halaman
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Terjadi kesalahan</EmptyTitle>
          <EmptyDescription>
            Terjadi kesalahan tak terduga saat memuat halaman ini. Mencoba lagi
            biasanya menyelesaikannya.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={() => unstable_retry()}>Coba lagi</Button>
            <Link
              href="/dashboard"
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              Kembali ke dasbor
            </Link>
          </div>
          {error.digest ? (
            <p className="font-mono text-xs text-muted-foreground">
              Referensi: {error.digest}
            </p>
          ) : null}
        </EmptyContent>
      </Empty>
    </div>
  )
}
