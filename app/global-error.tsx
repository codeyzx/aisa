'use client'

// Last-resort boundary: catches throws in the ROOT LAYOUT itself, which
// `app/error.tsx` cannot — an `error.tsx` never wraps the `layout.tsx` in its
// own segment. When active this file REPLACES the root layout, so it must ship
// its own `<html>` / `<body>` and its own global styles
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md:
// "Global error UI must define its own `<html>` and `<body>` tags, global
// styles, fonts, or other dependencies that your error page requires.").
//
// Kept intentionally dependency-light: no ThemeProvider, no font loader, no app
// shell. Anything imported here is code that has to survive the failure that got
// us here. The `--font-sans` variable is defined by the replaced root layout, so
// type falls back to the system sans — acceptable on a crash screen.
//
// Being a Client Component, `metadata` export is unsupported here; React's
// `<title>` is the documented alternative.
//
// THE ONE EXCEPTION to "dependency-light": @sentry/nextjs. A React error boundary
// SWALLOWS the error it catches — it never reaches `window.onerror`, so the SDK's
// global handler cannot see it. A boundary that does not report is a crash that
// nobody hears about, and this is the boundary for the worst crash there is. The
// import costs nothing extra: `instrumentation-client.ts` already loads the SDK,
// and with no DSN `captureException` is a no-op against an uninitialized client.

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

import { HTML_LANG } from '@/lib/format/locale'
import { useStaleChunkRecovery } from '@/lib/use-stale-chunk-recovery'

import './globals.css'

interface GlobalErrorProps {
  error: Error & { digest?: string }
  retry: () => void
}

export default function GlobalError({ error, retry }: GlobalErrorProps) {
  // Same branch as app/error.tsx, and it belongs here too: a chunk 404 in the
  // ROOT LAYOUT's own tree never reaches app/error.tsx, and a stale deploy is
  // exactly the kind of failure that takes the root layout down. The shared
  // module is client-safe and dependency-free, so importing it does not violate
  // this file's "anything imported here must survive the failure" rule.
  const staleDeploy = useStaleChunkRecovery(error)

  useEffect(() => {
    // NOT reported when this is a stale deploy: a chunk 404 after a redeploy is
    // expected operational noise, identical for every user who had a tab open,
    // and it says nothing about a defect. Reporting it would bury real crashes
    // under a spike on every release.
    if (!staleDeploy) Sentry.captureException(error)
  }, [error, staleDeploy])

  return (
    <html lang={HTML_LANG}>
      <body className="antialiased">
        <title>Terjadi kesalahan</title>
        <div className="flex min-h-svh items-center justify-center p-6">
          <div className="flex max-w-sm flex-col items-center gap-4 text-center">
            <h1 className="text-lg font-semibold tracking-tight">
              {staleDeploy
                ? 'Halaman ini sudah kedaluwarsa'
                : 'Terjadi kesalahan'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {staleDeploy
                ? 'Aplikasi diperbarui saat tab ini terbuka, dan memuat ulang otomatis tidak menyelesaikannya. Muat ulang halaman untuk mendapatkan versi terbaru.'
                : 'Aplikasi gagal dimuat. Mencoba lagi biasanya menyelesaikannya.'}
            </p>
            {/* Plain <button>: the UI kit is not guaranteed to render if the
                root layout is what crashed.

                On a stale deploy this must RELOAD, never `retry` — a
                re-render fetches the same missing chunk and cannot ever
                succeed. */}
            <button
              type="button"
              onClick={() =>
                staleDeploy ? globalThis.location.reload() : retry()
              }
              className="inline-flex h-8 items-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground"
            >
              {staleDeploy ? 'Muat ulang halaman' : 'Coba lagi'}
            </button>
            {error.digest ? (
              <p className="font-mono text-xs text-muted-foreground">
                Referensi: {error.digest}
              </p>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  )
}
