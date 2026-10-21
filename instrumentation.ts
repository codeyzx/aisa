import * as Sentry from '@sentry/nextjs'

/**
 * Observability + boot-time env check. Next gives a server process exactly one
 * `register()`, which is why error monitoring and the env check share this file.
 *
 * THIS FILE IS LOADED IN BOTH RUNTIMES — Node AND Edge — and that is the fact
 * everything here is shaped around.
 *
 * Three things hold on Next 16 that each reverse an obvious way to write this
 * file, and NONE is visible to typecheck, lint, or `pnpm test`:
 *
 * 1. `register()` does NOT run during `next build`. A logging register() is
 *    silent across a full build and fires on standalone server start
 *    (NEXT_RUNTIME=nodejs). That is what makes the env check safe: had it fired
 *    at build, reading the server config would re-impose secrets at build time
 *    and silently undo the no-secret build. So no NEXT_PHASE gate is needed.
 *
 * 2. The Edge Runtime has no `process.exit`, and a mere REFERENCE to it in this
 *    module fails the module — which fails the app. It is the sharpest edge
 *    here: with `process.exit` inline, Turbopack reports "Ecmascript file had an
 *    error" and EVERY ROUTE IN DEV ANSWERS 404, while `pnpm typecheck`, `pnpm
 *    lint`, `pnpm test` AND `pnpm build` all stay green. Hence the NEXT_RUNTIME
 *    dispatch below — the shape Next's own docs use — which keeps the Node-only
 *    code out of the edge bundle entirely.
 *
 * 3. Next SWALLOWS a throwing instrumentation module in TOTAL SILENCE, so the
 *    env read must sit inside a try — see instrumentation-node.ts, where it is.
 *
 * SCOPE: Sentry initialises on the NODE runtime only, so errors with routeType
 * 'render' | 'route' | 'action' are reported and 'proxy' (edge) ones are not.
 * The edge surface here is proxy.ts alone — a cookie-presence check that touches
 * no env and no I/O. Initialising Sentry per-runtime is the fix if that ever
 * stops being true.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNode } = await import('./instrumentation-node')
    await registerNode()
  }
}

/**
 * Report server-side errors to Sentry (Next 16 exports this from
 * instrumentation.ts; verified in node_modules/next/dist/docs). Without it, RSC
 * render errors never reach GlitchTip and error monitoring lands half-done.
 *
 * Edge-safe, and a no-op when init() was never called — so the DSN-less path and
 * the edge runtime both stay silent rather than throwing.
 */
export const onRequestError: typeof Sentry.captureRequestError =
  Sentry.captureRequestError
