import type { SessionDenial } from '@/lib/auth/guards'
import { log } from '@/lib/log'
import { reportError } from '@/lib/observability/report'

import { CORRELATION_ID_HEADER, resolveCorrelationId } from './cid'
import { fail, ok } from './envelope'
import {
  API_ERROR_STATUS,
  type ApiErrorCode,
  toApiError,
} from './errors.contract'
import { normalizeError } from './errors.normalize'

/**
 * The server half of the contract: turn an envelope into a `Response` that a
 * route handler returns.
 *
 * Built on the web-standard `Response.json` rather than `NextResponse.json`
 * (which only adds cookie/rewrite helpers this does not use). That keeps lib/api
 * free of a framework import, so these functions are unit-testable in the node
 * test environment without booting Next.
 */

/**
 * The ONE place a `Response` is constructed here — which is why both
 * always-true headers live in it rather than at the four call sites.
 *
 * `x-correlation-id`: echo the cid back so the caller can quote it, and so a
 * proxy log can join on it without parsing the body.
 *
 * `Cache-Control: no-store`: every envelope this module builds is per-REQUEST
 * and most are per-SESSION. Two concrete failures it forecloses — a shared cache
 * (a CDN, a corporate proxy) serving one user's `data` to the next caller of the
 * same URL, and a browser back-button resurrecting an authenticated JSON body
 * from disk after logout. Neither is hypothetical: the default for a 200 with no
 * cache header is "heuristically cacheable", so silence here is not neutral.
 *
 * It sits in this private helper precisely so NO call site can forget it. A
 * per-route `Cache-Control` would be one `apiOk` away from a leak, and the
 * omission would be invisible — the response still looks correct.
 *
 * This covers `/api/health` too, which answers through `apiOk` like every other
 * route: a cached health check is not a health check. `force-dynamic` on that
 * route stops the SERVER prerendering it; only this header stops something
 * between us and the prober from answering 200 on our behalf long after the
 * process stopped being able to.
 */
function jsonResponse(body: unknown, cid: string, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      [CORRELATION_ID_HEADER]: cid,
      'Cache-Control': 'no-store',
    },
  })
}

/**
 * Answer with a success envelope. Pass `null` for a no-content success.
 *
 * `status` is a 2xx literal, not `number`, so `apiOk(request, data, 404)` is a
 * compile error. `apiFail` already refuses to let a call site hand-pick a status
 * ("one code, one status, everywhere"); a success that could answer 404 while
 * saying `ok: true` would be the one place the module lets the status line and
 * the envelope contradict each other. 204 is absent on purpose — it forbids a
 * body, and an envelope IS a body.
 */
export function apiOk<T>(
  request: Request,
  data: T,
  status: 200 | 201 | 202 = 200,
): Response {
  const cid = resolveCorrelationId(request)
  return jsonResponse(ok(cid, data), cid, status)
}

/**
 * Answer with a failure envelope for a KNOWN, EXPECTED condition — the caller is
 * unauthenticated, the body failed validation, the row is gone. The status comes
 * from the code (`API_ERROR_STATUS`), never hand-picked at the call site: one
 * code, one status, everywhere.
 *
 * `details` is caller-chosen and CLIENT-VISIBLE. Pass only what the client is
 * entitled to (e.g. `z.treeifyError(parsed.error)` for a 400). MUST NOT pass a
 * raw caught error — see `apiFailFrom` for that path.
 */
export function apiFail(
  request: Request,
  code: ApiErrorCode,
  details?: unknown,
): Response {
  const cid = resolveCorrelationId(request)
  return jsonResponse(
    fail(cid, toApiError(code, details)),
    cid,
    API_ERROR_STATUS[code],
  )
}

/**
 * Answer with a failure envelope for an UNEXPECTED throw: normalise it, log the
 * raw error server-side keyed by cid, and return only the code to the client.
 *
 * This is the pair to `runAction`'s catch-all, and it makes the same promise:
 * internals never cross the boundary. `child({ cid })` binds the same id the
 * envelope owns, so the log line and the client's response can be joined.
 *
 * The raw `error` is logged here and NEVER placed in `details`: the client gets
 * the code, the operator gets the error, and the cid is what connects them.
 */
export function apiFailFrom(request: Request, error: unknown): Response {
  const cid = resolveCorrelationId(request)
  const apiError = normalizeError(error)
  log.child({ cid }).error('[api] unhandled error', {
    code: apiError.code,
    error,
  })
  // Into MONITORING as well, but only for INTERNAL — the "we do not know what
  // this was" bucket. Everything else reaching here was successfully CLASSIFIED
  // by `normalizeError`, so it is a known condition with a known remedy: a
  // Firestore `NOT_FOUND`, a `PERMISSION_DENIED`, an `UNAVAILABLE` during a
  // provider outage. Those belong in the log, not in an alert stream that has to
  // stay worth reading. Like `runAction`'s catch, this path never propagates, so
  // without this call `onRequestError` never sees the failure at all.
  if (apiError.code === 'INTERNAL') {
    reportError(error, { cid, code: apiError.code })
  }
  return jsonResponse(fail(cid, apiError), cid, API_ERROR_STATUS[apiError.code])
}

/**
 * Answer with the failure envelope for an authorization denial.
 *
 * The HTTP taxonomy is deliberately closed and smaller than the denial set, so
 * `password_change_required` lands on `PERMISSION_DENIED` rather than earning a
 * new wire code. That is honest for this boundary: an HTTP client's remedy is
 * the same either way — it cannot act on the distinction, and only the human in
 * the browser can, who meets the page-level redirect instead.
 */
export function apiFailFromDenial(
  request: Request,
  denial: SessionDenial,
): Response {
  return apiFail(
    request,
    denial === 'unauthenticated' ? 'UNAUTHENTICATED' : 'PERMISSION_DENIED',
  )
}
