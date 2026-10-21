import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs'

import { getObservabilityConfig } from './config'

/**
 * THE ONE DESCRIPTION of what this app sends to an error reporter — shared by
 * `instrumentation-client.ts` (browser) and `instrumentation-node.ts` (server) so
 * the two runtimes cannot drift into reporting different things about the same
 * deploy. Type-only import of the SDK: this module is pulled into the CLIENT
 * bundle, and a value import would drag `@sentry/nextjs` into every graph that
 * merely mentions the options.
 *
 * Two rules drive every decision below.
 *
 * NO PII, DECIDED RATHER THAN ASSUMED. `lib/auth/account.contract.ts` exists
 * because a "safe DTO" has to be picked deliberately; an error reporter is the
 * same problem with a worse failure mode, because the payload leaves the machine.
 * The SDK's own default (`sendDefaultPii: false`) is NOT enough here — verified
 * against the shipped source, not from memory:
 *
 *   - `Sentry.captureRequestError` (what `onRequestError` is) puts EVERY request
 *     header on the scope, and `requestDataIntegration` copies them onto
 *     `event.request.headers` VERBATIM. The deny-list filtering in
 *     `@sentry/core` runs on the SPAN path only, not the event path — so with
 *     tracing off, the `cookie` header (this app's `__session` Firebase session
 *     token) would ship intact. That single fact is why `beforeSend` below is
 *     not defensive garnish.
 *   - `event.request.url` / `request_path` carry the QUERY STRING, which in this
 *     app can hold a search term, an id, or a future one-time token.
 *   - console breadcrumbs capture whatever `lib/log` wrote, which routinely
 *     includes uids and actor emails.
 *
 * So the payload is allow-listed, not deny-listed: an error event leaves with a
 * stack, a message, a route, a release and an environment — and nothing else that
 * identifies a person.
 *
 * TRACING IS OFF, and the way it is turned off matters. `tracesSampleRate` is
 * OMITTED rather than set to `0`, because `hasSpansEnabled()` in `@sentry/core`
 * tests `tracesSampleRate != null` — `0` is not nullish, so a literal zero reads
 * as "tracing enabled, sample none" and pulls in the whole auto-performance
 * integration set on the server, instrumenting every request to build spans that
 * are then thrown away. Omitting the key is the only spelling that actually costs
 * nothing. The browser SDK adds `BrowserTracing` to its defaults regardless of
 * that check, so it is filtered out explicitly in `instrumentation-client.ts`.
 */

/** Cut a URL back to origin + path — drops `?query` and `#fragment` alike. */
function stripQuery(url: string): string {
  const cut = url.search(/[?#]/)
  return cut === -1 ? url : url.slice(0, cut)
}

/**
 * Email addresses are the one piece of PII that reaches an error reporter through
 * the MESSAGE rather than through a structured field — Firebase Admin errors name
 * the account they failed on, and a hand-thrown message can too. Redacted by
 * shape, since there is no field to allow-list here.
 */
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g

function redactEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, '[redacted-email]')
}

/**
 * The ONLY tag keys allowed out, and the only structured context this app adds.
 * `lib/observability/report.ts` sets exactly these; anything else — a tag a
 * future integration adds, or one someone attaches in a hurry — is dropped.
 *
 * Each is non-personal by construction: a correlation UUID, a capability string
 * like `asset:write`, a closed error code. Deliberately NO uid and no email —
 * "which user" is answerable from the server log via the cid, and stays there.
 */
const ALLOWED_TAG_KEYS = new Set(['cid', 'capability', 'code'])

/**
 * The ONLY `event.contexts` keys allowed out.
 *
 * `nextjs` carries the route (query-stripped below). `runtime`, `os` and `app`
 * describe the MACHINE — "node 24 on linux, started at T" — which is what a
 * stack trace needs to be actionable and cannot identify a person. `trace` is
 * internal ids.
 *
 * Notably ABSENT: `device` (can carry a device name/model) and `culture`
 * (locale + timezone narrow a person more than most people expect). Neither
 * helps debug a server error here.
 */
const ALLOWED_CONTEXT_KEYS = new Set([
  'nextjs',
  'runtime',
  'os',
  'app',
  'trace',
])

/** Keep only `allowed` keys of `source`, or undefined if nothing survives. */
function pick<T extends Record<string, unknown>>(
  source: T | undefined,
  allowed: ReadonlySet<string>,
): T | undefined {
  if (!source) return undefined
  const kept = Object.fromEntries(
    Object.entries(source).filter(([key]) => allowed.has(key)),
  ) as T
  return Object.keys(kept).length > 0 ? kept : undefined
}

/**
 * Reduce an outgoing event to the allow-listed shape described above. Exported
 * for its own unit test: this function is the entire PII boundary, so it must be
 * checkable without standing up an SDK or a network.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  // The identity block: `id`/`email`/`username` if anything ever calls setUser,
  // and `ip_address`, which `requestDataIntegration` fills from the forwarding
  // headers. Nothing in this app needs a person attached to a stack trace, and
  // "which user" is answerable from the server log via the event's route + time.
  delete event.user

  if (event.request) {
    // Allow-list, not delete-list: a future SDK version adding another request
    // field must not silently start shipping it.
    event.request = {
      method: event.request.method,
      ...(event.request.url ? { url: stripQuery(event.request.url) } : {}),
    }
  }

  // The three ARBITRARY carriers. `extra` and `tags` are open bags that anything
  // — this app, an integration, a future SDK version — can attach a person to,
  // and `contexts` grows a new key whenever the SDK learns about a new runtime
  // detail. Deleting named bad keys here would be a deny-list that is wrong the
  // day something new appears; these are rebuilt from allow-lists instead, so
  // the default for anything unrecognised is DROPPED.
  //
  // `extra` has no allow-list at all: nothing in this app sets it, and there is
  // no allow-list that makes an arbitrary logged object safe — the same argument
  // this module already makes for dropping console breadcrumbs outright.
  delete event.extra
  event.tags = pick(event.tags, ALLOWED_TAG_KEYS)
  event.contexts = pick(event.contexts, ALLOWED_CONTEXT_KEYS)

  // `onRequestError` reports `request.path` INCLUDING its query string (Next's
  // own docs give `/blog?name=foo` as the example value).
  const nextjs = event.contexts?.nextjs
  if (nextjs && typeof nextjs.request_path === 'string') {
    nextjs.request_path = stripQuery(nextjs.request_path)
  }

  if (event.message) event.message = redactEmails(event.message)
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactEmails(exception.value)
  }

  return event
}

/**
 * Breadcrumbs are the quiet leak: they are collected continuously, before anyone
 * decides an error is worth reporting.
 *
 * `console` breadcrumbs are dropped OUTRIGHT rather than redacted. On the server
 * that category is `lib/log`'s entire output — structured objects carrying uids,
 * actor emails and document ids — and on the client it is whatever a component
 * logged. There is no allow-list that makes an arbitrary logged object safe, and
 * the same information is already in the server log, where it belongs.
 */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === 'console') return null

  // `breadcrumb.data` is the same arbitrary bag as `event.extra`, one layer
  // down: stripping the query off three known URL keys left every OTHER key
  // untouched, so a breadcrumb carrying `{ actorEmail }` shipped verbatim.
  // Rebuilt as an allow-list for the same reason the event's carriers are.
  //
  // These four are what make a `fetch`/`xhr`/`navigation` breadcrumb useful —
  // where the request went and how it ended. The URL-shaped ones keep their path
  // (it says WHERE) and lose their query (it can say WHO).
  if (breadcrumb.data) {
    const data: Record<string, unknown> = {}
    for (const key of ['url', 'from', 'to']) {
      const value = breadcrumb.data[key]
      if (typeof value === 'string') data[key] = stripQuery(value)
    }
    for (const key of ['method', 'status_code']) {
      const value = breadcrumb.data[key]
      if (typeof value === 'string' || typeof value === 'number') {
        data[key] = value
      }
    }
    breadcrumb.data = data
  }

  if (breadcrumb.message) breadcrumb.message = redactEmails(breadcrumb.message)
  return breadcrumb
}

/**
 * The init options both runtimes spread, or `undefined` when no DSN is
 * configured — in which case the caller must NOT call `Sentry.init` at all. That
 * is the difference between "optional" and "off": an initialized client with an
 * empty DSN still installs global handlers and still costs something; never
 * calling `init` costs nothing and makes every capture a no-op.
 */
export function sentryInitOptions():
  | {
      dsn: string
      release: string
      environment: string
      sendDefaultPii: false
      beforeSend: (event: ErrorEvent) => ErrorEvent
      beforeBreadcrumb: (breadcrumb: Breadcrumb) => Breadcrumb | null
    }
  | undefined {
  const { dsn, release, environment } = getObservabilityConfig()
  if (!dsn) return undefined
  return {
    dsn,
    release,
    environment,
    // Redundant beside `beforeSend` — and kept anyway, because it also switches
    // OFF collection at the source (bodies, cookies, IPs are never gathered),
    // so a mistake in the scrubber is not the only thing standing between a
    // credential and the wire.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
    // NO `tracesSampleRate` — see this module's header. Errors only.
  }
}
