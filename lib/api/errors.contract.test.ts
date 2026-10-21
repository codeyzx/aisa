import { describe, expect, it } from 'vitest'

import {
  API_ERROR_CODES,
  API_ERROR_MESSAGE,
  API_ERROR_STATUS,
  type ApiErrorCode,
  toApiError,
} from './errors.contract'

/**
 * The status contract, re-declared by hand on purpose (same reasoning as
 * lib/auth/rbac.test.ts): reading it back off API_ERROR_STATUS would agree with
 * the implementation by construction and prove nothing. This is an independent
 * statement of the intended wire contract — changing a status silently breaks
 * every client, so it must break this first.
 *
 * `Record<ApiErrorCode, number>` is what keeps it honest: a new code fails
 * typecheck here until someone states its status.
 */
const EXPECTED_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  INVALID_ARGUMENT: 400,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  RESOURCE_EXHAUSTED: 429,
  DEADLINE_EXCEEDED: 504,
  UNAVAILABLE: 503,
  INTERNAL: 500,
}

describe('the taxonomy', () => {
  it('maps every code to its agreed status', () => {
    expect(API_ERROR_STATUS).toEqual(EXPECTED_STATUS)
  })

  it('gives every code a message and a status', () => {
    // Derived from API_ERROR_CODES so that adding a code without stating its
    // message/status fails here rather than producing `undefined` on the wire.
    for (const code of API_ERROR_CODES) {
      expect(API_ERROR_MESSAGE[code], `message for ${code}`).toBeTruthy()
      expect(API_ERROR_STATUS[code], `status for ${code}`).toBeTruthy()
    }
  })
})

describe('toApiError', () => {
  it('takes the canonical message for the code', () => {
    expect(toApiError('NOT_FOUND')).toEqual({
      code: 'NOT_FOUND',
      message: 'Tidak ditemukan',
    })
  })

  it('attaches details only when given', () => {
    expect(toApiError('INVALID_ARGUMENT', { field: 'name' })).toEqual({
      code: 'INVALID_ARGUMENT',
      message: 'Permintaan tidak valid',
      details: { field: 'name' },
    })
    expect('details' in toApiError('INVALID_ARGUMENT')).toBe(false)
  })
})
