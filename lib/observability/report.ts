import 'server-only'

import * as Sentry from '@sentry/nextjs'

/**
 * The monitoring seam for failures that are CAUGHT and folded into an envelope.
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────────
 * Sentry only ever saw errors that PROPAGATED: `onRequestError` fires for an
 * uncaught throw, and the two React error boundaries capture what reached them.
 * But `runAction` and `apiFailFrom` both catch, log, and return an envelope — so
 * an unexpected server failure never escaped, and monitoring never learned about
 * it. The application's two most-travelled failure paths were invisible to the
 * very tool bought to watch them, while the client got a polite `internal`.
 *
 * ── WHAT MUST NOT BE REPORTED ────────────────────────────────────────────────
 * EXPECTED denials and caller mistakes: a `ForbiddenError`, a Zod validation
 * failure, a typed `DomainError` (`not_found` / `conflict`), an
 * `unauthenticated`. Those are the system working. Reporting them buries the
 * real incidents in noise until nobody reads the alerts — which costs more than
 * not having them. Only the "we do not know what this was" bucket reaches here.
 *
 * ── WHY A SEAM AND NOT `Sentry.captureException` AT THE CALL SITE ────────────
 * `lib/data` and `lib/api` must not import the SDK. `sentry.ts` keeps its SDK
 * import TYPE-ONLY because it is pulled into the client bundle, and a value
 * import would drag `@sentry/nextjs` into every graph that mentions it. This
 * module is `server-only` precisely so it can hold the value import without
 * that reaching the browser. It is also the one place to change if the reporter
 * is ever swapped or removed.
 *
 * With no DSN configured `Sentry.init` is never called (see `sentryInitOptions`),
 * and `captureException` is then a no-op — so this costs nothing when
 * observability is off, and needs no `if (enabled)` branch of its own.
 */

export interface ReportContext {
  /** Ties the Sentry event to the server log line and the client's envelope. */
  cid: string
  /** The action's capability, when the failure came from `runAction`. */
  capability?: string
  /** The normalised wire code, when the failure came from an API route. */
  code?: string
}

/**
 * Report an UNEXPECTED server failure to the configured monitoring seam.
 *
 * The caller has already logged the raw error under the same `cid` — this does
 * not replace the log, it makes the failure visible somewhere an operator is
 * actually watching. The error object itself carries the stack; `scrubEvent`
 * still strips PII from the message on the way out.
 *
 * Every tag set here must appear in `ALLOWED_TAG_KEYS` (`sentry.ts`) or the
 * scrubber drops it — the allow-list is owned by the enforcer, not the writer,
 * so the safe direction is the default.
 */
export function reportError(error: unknown, context: ReportContext): void {
  Sentry.captureException(error, {
    tags: {
      cid: context.cid,
      ...(context.capability ? { capability: context.capability } : {}),
      ...(context.code ? { code: context.code } : {}),
    },
  })
}
