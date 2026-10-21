import 'server-only'

import { log } from '@/lib/log'

import { getAisaApiConfig } from './config'
import type { AisaApiOutcome } from './outcome'

export type { AisaApiOutcome } from './outcome'

/** Bounded so a hung API cannot hold a server action open indefinitely. */
const DEFAULT_TIMEOUT_MS = 30_000

/** FastAPI answers `{detail: string}` or `{detail: [{msg, loc}]}` on failure. */
function detailText(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const detail = (body as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item: unknown) =>
        item && typeof item === 'object' && 'msg' in item
          ? String((item as { msg: unknown }).msg)
          : null,
      )
      .filter((part): part is string => part !== null)
    return parts.length ? parts.join('; ') : null
  }
  const message = (body as { message?: unknown }).message
  return typeof message === 'string' ? message : null
}

/**
 * Call `aisa-api` with the shared `X-AISA-Key`. `body` that is `FormData` is
 * sent as multipart (fetch sets the boundary); anything else is JSON.
 */
export async function callAisaApi<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  /** A route that legitimately runs long (the Asisten's model turns) widens this. */
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<AisaApiOutcome<T>> {
  const { baseUrl, apiKey } = getAisaApiConfig()
  const headers: Record<string, string> = { 'X-AISA-Key': apiKey }
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      ...(payload === undefined ? {} : { body: payload }),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    // A timeout means the API took the request and is still working on it, so
    // it must not read as "unreachable" — the work may still land.
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      log.warn('[aisa-api] timed out', { path, timeoutMs })
      return {
        ok: false,
        status: null,
        error:
          'aisa-api belum menjawab dalam batas waktu. Prosesnya mungkin masih berjalan; coba lagi sebentar lagi.',
      }
    }
    log.warn('[aisa-api] unreachable', { path, error })
    return {
      ok: false,
      status: null,
      error: 'aisa-api tidak dapat dihubungi. Coba lagi sebentar lagi.',
    }
  }

  const text = await response.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }

  if (!response.ok) {
    const error =
      detailText(parsed) ??
      (text.slice(0, 300) ||
        `aisa-api menolak permintaan (HTTP ${response.status})`)
    log.warn('[aisa-api] refused', { path, status: response.status })
    return { ok: false, status: response.status, error }
  }
  return { ok: true, data: parsed as T }
}
