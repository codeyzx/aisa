import * as Sentry from '@sentry/nextjs'

import { log, setLogBindings, setLogLevel } from '@/lib/log'

/**
 * The Node-runtime half of `instrumentation.ts`. Split into its own module for a
 * reason that is not stylistic: it calls `process.exit`, which the Edge Runtime
 * does not support, and a mere REFERENCE to it inside instrumentation.ts fails
 * that module in BOTH runtimes. Next's own docs use this dispatch
 * (`process.env.NEXT_RUNTIME` + a runtime-specific import) for exactly this.
 * See instrumentation.ts.
 *
 * Reached only via `await import()` from register() under NEXT_RUNTIME==='nodejs',
 * so nothing here is ever bundled for the edge.
 */
export async function registerNode(): Promise<void> {
  try {
    // Imported HERE, inside the try, and this is load-bearing. These modules
    // parse env, and Next SWALLOWS a throwing instrumentation module in TOTAL
    // SILENCE — a static top-level import that threw during module evaluation
    // would leave the standalone server printing "Ready", serving /login 200
    // with zero env, and logging nothing: the boot check dead in exactly the
    // case it exists for. Do not "tidy" these into top-level imports.
    const { sentryInitOptions } = await import('@/lib/observability/sentry')
    const { getLoggingConfig, getBuildInfo } = await import('@/lib/env/server')
    const { collectConfigFailures } = await import('@/lib/env/registry')

    // Hand lib/log its threshold. It cannot read LOG_LEVEL itself: the env layer
    // owns every env key, but importing it from that leaf module would drag the
    // whole server Firebase schema in and make lib/log unimportable from a unit
    // test. This is the one place that already has env AND is guaranteed to run
    // before the server serves a request. See lib/log's setLogLevel.
    setLogLevel(getLoggingConfig().level)

    // Stamp WHICH BUILD wrote each line. Without this a stdout line is
    // undatable across a deploy — the same message from two images reads
    // identically — and the first question about any incident is "which release".
    // Pushed in for the same reason the level is: lib/log cannot read env itself.
    //
    // The server reads the RUN-time `BUILD_SHA` while Sentry's `release` reads
    // `NEXT_PUBLIC_BUILD_SHA` (lib/observability/config.ts). Not a drift risk and
    // not collapsible: both are derived by the Containerfile from the single
    // `--build-arg BUILD_SHA`, but a `NEXT_PUBLIC_*` is INLINED into the client
    // bundle at build time (the only way the browser half can carry it), while
    // this process reads its own env at run time. `env` is `NODE_ENV` for the
    // same reason `environment` is over there — it needs no plumbing and cannot
    // drift from what actually shipped.
    setLogBindings({ sha: getBuildInfo().sha, env: process.env.NODE_ENV })

    // Error monitoring (@sentry/nextjs at a self-hosted GlitchTip; the backend
    // swaps by DSN alone). Wired-optional: DSN unset => `sentryInitOptions()` is
    // undefined => init is never called and every capture no-ops, so the app runs
    // with no GlitchTip and the "a capability must delete cleanly" rule holds.
    //
    // WHAT is sent — the PII allow-list, the release/environment stamp and the
    // reason tracing is off — lives in lib/observability/sentry.ts, shared with
    // the browser half (instrumentation-client.ts) so the two cannot drift.
    // Initialising here rather than at module scope is what makes the DSN-less
    // path cost literally nothing.
    const sentryOptions = sentryInitOptions()
    if (sentryOptions) Sentry.init(sentryOptions)

    // Refuse to boot without valid env, before serving one request.
    //
    // The hole this closes: next.config.ts is the ONLY other module that
    // validates env, and output:'standalone' + CMD ["node","server.js"] means the
    // standalone runtime never runs it. Config is read lazily per request and
    // proxy.ts imports only lib/auth/constants, so without this a request 307s to
    // /login having touched no env at all — the container looks alive with
    // nothing configured.
    //
    // WHY THE REGISTRY, not a local array: this used to be a hand-maintained list
    // of reads right here, which meant the boot check and the set of capabilities
    // that read env were two lists to keep in sync. `lib/env/registry.ts` is now
    // the SINGLE MANIFEST of "which shipped capability requires which config" —
    // adding a capability that reads env WITHOUT registering it is precisely the
    // bug that list prevents, and it can no longer be prevented in one place and
    // forgotten in another. The registry also knows which capabilities are turned
    // ON, so a disabled one is never asked for
    // credentials, and deleting a capability is `trash lib/<capability>/` plus one
    // registry line rather than an edit here.
    //
    // Every ENABLED group is validated HERE, eagerly, not lazily on first use: a
    // capability that ships in this build is reachable, and a reachable feature
    // with a missing secret must fail at boot — not 500 the first time a user
    // clicks it, deep in a server action, in front of whoever is watching. "It
    // booted" has to mean "its env is good". Failures are AGGREGATED so a fresh
    // clone sees every missing var in a single boot, not one restart per var.
    //
    // The failures are logged as an ARRAY FIELD, one entry per group, and NOT
    // joined into a single Error message. Observed on the real image, not
    // reasoned about: joined, the whole aggregate is ONE string field, and
    // `lib/log` bounds a string at 512 characters — so a container missing its
    // Firebase, storage and signing config printed the first group and
    // `…(864 chars)`. Aggregation exists precisely so a fresh clone sees EVERY
    // missing var in one boot; truncating it back to the first group would have
    // silently undone the feature this block is here for. As entries, each group
    // is well under the bound and the array bound (32) is far above the number of
    // registered groups.
    const failures = collectConfigFailures()
    if (failures.length > 0) {
      log.error('[boot] environment is invalid, refusing to serve', {
        failures,
      })
      // Not a rethrow, and not the catch below: a throw out of register() is
      // swallowed (see above), and a server that logs "refusing to serve" and
      // then serves anyway is worse than one that never claimed anything. The
      // exit IS the feature.
      process.exit(1)
    }
  } catch (error) {
    // The OTHER failure: something in this block threw unexpectedly — a bad
    // import, an env module that itself blew up. Distinct from the check above,
    // which is the expected, enumerated outcome, so it keeps its own message and
    // reports the raw error rather than a list.
    log.error('[boot] instrumentation failed, refusing to serve', { error })
    process.exit(1)
  }
}
