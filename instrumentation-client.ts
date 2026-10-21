import * as Sentry from '@sentry/nextjs'

import { sentryInitOptions } from '@/lib/observability/sentry'

/**
 * The BROWSER half of error monitoring. Next runs this file after the document
 * loads and BEFORE React hydration
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md),
 * which is the only point early enough to catch a hydration failure.
 *
 * THE FILENAME IS THE API. `instrumentation-client.ts` at the repo root is the
 * Next 16 convention; the older `sentry.client.config.ts` that most Sentry
 * examples still show is not read by this version — a file by that name would sit
 * there silently doing nothing, which is exactly the failure mode this comment
 * exists to prevent. Nothing imports this file; Next finds it by name.
 *
 * WIRED-OPTIONAL, like the server half: no DSN => `init` is never called => no
 * network request, no global handlers installed, no dead UI. `sentryInitOptions`
 * returning `undefined` IS that switch, so there is no second place to turn error
 * monitoring off and forget about.
 */
const options = sentryInitOptions()

if (options) {
  Sentry.init({
    ...options,
    /**
     * Drop `BrowserTracing` from the browser defaults.
     *
     * Not redundant with omitting `tracesSampleRate`: the Next.js browser SDK
     * pushes `browserTracingIntegration()` into its default set UNCONDITIONALLY
     * (verified in node_modules/@sentry/nextjs/build/esm/client/index.js — the
     * only guard is the `__SENTRY_TRACING__` build constant, not the sample
     * rate). Left in, it patches `fetch`/`XHR`/history and installs performance
     * observers on every page load to build spans that are then never sampled.
     * Tracing is opt-in per project, and opt-in has to mean it costs nothing
     * until someone opts in.
     */
    integrations: (defaults) =>
      defaults.filter((integration) => integration.name !== 'BrowserTracing'),
  })
}

/**
 * Client-side navigation notifications — Next 16's `onRouterTransitionStart`
 * hook, which the SDK wants wired here (it has no other way to see an App Router
 * navigation start).
 *
 * HONEST ABOUT WHAT IT DOES TODAY: `captureRouterTransitionStart` forwards to a
 * handler that only `browserTracingIntegration` registers, and that integration
 * is filtered out above — so with tracing off this is a no-op in both the
 * DSN-less and the DSN-configured case. It is exported anyway because it is the
 * OPT-IN SEAM: a project that wants tracing sets `tracesSampleRate` and drops the
 * filter, and navigation spans then start working with no second file to find.
 * Navigation CONTEXT is not lost meanwhile — the `breadcrumbs` integration
 * instruments history independently of tracing.
 */
// THE DISABLE BELOW IS NOT A PAPER-OVER. `@sentry/nextjs` ships a DIFFERENT
// module per export condition, and `captureRouterTransitionStart` exists only on
// the `browser` one. oxlint's resolver reads the package's `main` — the SERVER
// build — and so cannot see it; `tsc` reads `index.types.d.ts`, which merges the
// conditions and does resolve it. This file only ever runs in a browser, so the
// export is real where it executes: the linter is looking at the wrong build.
// oxlint-disable-next-line import/namespace
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
