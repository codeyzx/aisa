/**
 * The CSRF origin check: does this state-changing request come from a page this
 * app actually served?
 *
 * IT COMPARES `Origin` TO THE HOST THE BROWSER ADDRESSED — the `Host` header, or
 * `X-Forwarded-Host` when a proxy set one. It does NOT compare against
 * `new URL(request.url).origin`, and that distinction is the whole reason this
 * file has a comment this long.
 *
 * WHAT THE PREVIOUS VERSION DID, AND WHY IT SHIPPED BROKEN. It compared against
 * `new URL(request.url).origin`. In the standalone server that origin reflects the
 * HOSTNAME the server was started with, not the host the browser asked for. The
 * Containerfile sets `HOSTNAME=0.0.0.0` (it must, to listen on all interfaces in a
 * container), so the only `Origin` the shipped image would accept was
 * `http://0.0.0.0:3000` — a value no browser will ever send. Driven against the
 * real image on 2026-07-22:
 *
 *   Origin: http://localhost:3100  -> 403
 *   Origin: http://127.0.0.1:3100  -> 403
 *   Origin: http://0.0.0.0:3100    -> 200
 *
 * So sign-in was broken in the artifact that ships, and doubly so behind the
 * reverse proxy `docs/reference/contracts/operations.md` requires, where the browser sends the public
 * hostname. It passed every gate: unit tests construct a `Request` whose URL and
 * Origin agree, and `pnpm dev` runs with HOSTNAME=localhost, where it works.
 *
 * WHY COMPARING TO `Host` IS NOT A WEAKENING. A cross-site attacker needs the
 * VICTIM'S BROWSER to send the request, because only then are cookies attached
 * automatically — and the browser sets `Host` itself to the server it dialled,
 * with no way for page script to override it. `X-Forwarded-Host` is not a
 * CORS-safelisted header, so cross-origin script cannot set it either. A request
 * with a hand-forged `Host` is one the attacker made themselves, carrying none of
 * the victim's credentials, which authenticates nobody. (Trusting
 * `X-Forwarded-Host` IS dangerous where a host is used to GENERATE a URL — reset
 * links, cache keys. This only ever compares.)
 *
 * WHY THIS SHAPE SPECIFICALLY: it is what Next.js itself does for every Server
 * Action in this app, so the alternative was not "stricter" — it was
 * "inconsistent with the check already protecting the mutations". Verified in
 * `node_modules/next/dist/server/app-render/action-handler.js` (`parseHostHeader`
 * + the `originHost !== host.value` comparison) and stated in
 * `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`: "The request's
 * `Origin` is compared to the `Host` (or `X-Forwarded-Host`)."
 *
 * Matching Next also means matching its two judgement calls, both deliberate:
 *   - COMPARE HOST, NOT FULL ORIGIN. `host` is `hostname:port`; the scheme is not
 *     compared, because behind a TLS-terminating proxy the browser's `https` and
 *     the app's inbound `http` legitimately differ, and there is no reliable way
 *     to tell that apart from a downgrade.
 *   - A MISSING `Origin` IS ALLOWED. Some legitimate clients omit it. It is not a
 *     hole here because `sameSite=lax` on the session cookie is the other half of
 *     this defence — see the route's own comment.
 */

/**
 * The host the browser addressed. `X-Forwarded-Host` wins when present, and only
 * its FIRST entry — a chain of proxies appends, and the first is the one the
 * browser actually dialled.
 */
function addressedHost(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-host')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('host') ?? undefined
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true

  const host = addressedHost(request)
  if (!host) return false

  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
