import { CORRELATION_ID_HEADER, newCorrelationId } from './cid'
import { type ApiResponse, fail, isApiResponse } from './envelope'
import { toApiError } from './errors.contract'

/**
 * The client half of the contract: a typed `fetch` for routes that answer with
 * an `ApiResponse` envelope.
 *
 * NEVER THROWS. A network failure, a non-JSON body, and a 500 from the route all
 * resolve to the same failure envelope, so a caller writes ONE branch on
 * `res.ok` instead of a `try/catch` wrapped around an `if`. Callers who want the
 * exception-based shape compose `unwrap(await apiFetch(...))` — that choice
 * belongs to the call site, not to the fetcher.
 *
 * Zero dependency: builtin `fetch` + `JSON`, no client library.
 *
 * Isomorphic — a plain module with no 'use client'. Works in a client component,
 * and server-side too if given an absolute URL.
 */

/**
 * Call an envelope-speaking route.
 *
 * `T` is the route's success payload and is ASSERTED, not validated: this trusts
 * our own server. It is not a schema boundary — if you are calling something
 * that can lie to you, parse `res.data` with a zod schema at the call site.
 */
export async function apiFetch<T>(
  input: string | URL,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  // One id spans the WHOLE call chain, not just one hop (one system). An
  // id the caller already holds wins — a route handler forwarding to another
  // route passes the cid it was given, and minting a fresh one here would cut
  // the trace in half at exactly the hop worth tracing. Only an originating
  // call (the browser, typically) has none, and that is where a cid is born.
  const headers = new Headers(init?.headers)
  const cid = headers.get(CORRELATION_ID_HEADER) ?? newCorrelationId()
  headers.set(CORRELATION_ID_HEADER, cid)

  let response: Response
  try {
    response = await fetch(input, { ...init, headers })
  } catch {
    // Offline, DNS, CORS, aborted. The raw reason is not actionable to a user
    // and the server never saw the request, so there is nothing to correlate to.
    return fail(cid, toApiError('UNAVAILABLE'))
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return fail(cid, toApiError('UNAVAILABLE', { status: response.status }))
  }

  // The body is only usable if it IS an envelope. A proxy's HTML error page or a
  // CDN's JSON parses fine but is not our contract, and reading `.data` off it
  // would hand the caller undefined as if it were a success. `isApiResponse`
  // also rejects a failure envelope whose `error` carries no known code or
  // message, so a malformed failure lands here as a clean UNAVAILABLE rather
  // than surfacing later as an `ApiCallError` with an undefined code.
  //
  // Note this does NOT re-derive a code from `response.status`: the envelope
  // already carries the code the server chose, and inverting API_ERROR_STATUS
  // here would be a second, drifting taxonomy for the same fact.
  if (!isApiResponse(body)) {
    return fail(cid, toApiError('UNAVAILABLE', { status: response.status }))
  }

  return body as ApiResponse<T>
}
