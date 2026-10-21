import { describe, expect, it } from 'vitest'

import { ApiCallError, fail, isApiResponse, ok, unwrap } from './envelope'
import { toApiError } from './errors.contract'

describe('ok', () => {
  it('carries the cid and the data', () => {
    expect(ok('cid-1', { id: 'a' })).toEqual({
      ok: true,
      cid: 'cid-1',
      data: { id: 'a' },
    })
  })

  it('keeps a null payload as data rather than dropping the key', () => {
    // The void case is `data: null`, not an absent `data` — a caller reading
    // res.data must not have to distinguish "no content" from "not a success".
    expect(ok('cid-1', null)).toEqual({ ok: true, cid: 'cid-1', data: null })
  })
})

describe('fail', () => {
  it('carries the cid and the error', () => {
    expect(fail('cid-1', toApiError('NOT_FOUND'))).toEqual({
      ok: false,
      cid: 'cid-1',
      error: { code: 'NOT_FOUND', message: 'Tidak ditemukan' },
    })
  })

  it('omits details entirely when none were given', () => {
    // Not `details: undefined` — this envelope gets JSON.stringify'd, and an
    // explicit undefined key vs. an absent one is a wire-shape difference.
    expect('details' in fail('cid-1', toApiError('NOT_FOUND')).error).toBe(
      false,
    )
  })

  it('keeps caller-chosen details', () => {
    const envelope = fail(
      'cid-1',
      toApiError('INVALID_ARGUMENT', { field: 'name' }),
    )
    expect(envelope.error.details).toEqual({ field: 'name' })
  })
})

describe('unwrap', () => {
  it('returns the data on success', () => {
    expect(unwrap(ok('cid-1', { id: 'a' }))).toEqual({ id: 'a' })
  })

  it('returns falsy data as-is instead of treating it as failure', () => {
    // The discriminant is `ok`, never the truthiness of `data`.
    expect(unwrap(ok('cid-1', null))).toBe(null)
    expect(unwrap(ok('cid-1', 0))).toBe(0)
    expect(unwrap(ok('cid-1', false))).toBe(false)
  })

  it('throws an ApiCallError carrying code, cid and details', () => {
    const envelope = fail(
      'cid-1',
      toApiError('PERMISSION_DENIED', { need: 'admin' }),
    )

    // The whole point of the class over `new Error(message)`: the code survives
    // the throw, so a caller can branch on it.
    expect(() => unwrap(envelope)).toThrow(ApiCallError)
    try {
      unwrap(envelope)
      expect.unreachable('unwrap must throw on a failure envelope')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiCallError)
      const callError = error as ApiCallError
      expect(callError.code).toBe('PERMISSION_DENIED')
      expect(callError.cid).toBe('cid-1')
      expect(callError.message).toBe('Anda tidak memiliki izin')
      expect(callError.details).toEqual({ need: 'admin' })
    }
  })
})

describe('isApiResponse', () => {
  it('accepts both envelope shapes', () => {
    expect(isApiResponse(ok('cid-1', { id: 'a' }))).toBe(true)
    expect(isApiResponse(fail('cid-1', toApiError('INTERNAL')))).toBe(true)
  })

  it('rejects a success envelope with no data key', () => {
    // The exact shape the guard is for: `ok: true` and a cid, but no payload.
    // Checking only the discriminant would let this through and the caller
    // would read `res.data` as undefined believing the call succeeded.
    expect(isApiResponse({ ok: true, cid: 'cid-1' })).toBe(false)
    // ...while a no-content success (`data: null`, per ok()'s contract) stands.
    expect(isApiResponse({ ok: true, cid: 'cid-1', data: null })).toBe(true)
  })

  it('rejects anything that is not our contract', () => {
    // A proxy/CDN can answer valid JSON that is not an envelope; reading .data
    // off one of these would hand the caller undefined as if it succeeded.
    expect(isApiResponse(null)).toBe(false)
    expect(isApiResponse('ok')).toBe(false)
    expect(isApiResponse({})).toBe(false)
    expect(isApiResponse({ ok: true })).toBe(false) // no cid
    expect(isApiResponse({ cid: 'cid-1' })).toBe(false) // no discriminant
    expect(isApiResponse({ ok: 'true', cid: 'cid-1' })).toBe(false) // not the literal
    expect(isApiResponse({ ok: false, cid: 'cid-1' })).toBe(false) // failure w/o error
    expect(isApiResponse({ ok: 1, cid: 'cid-1' })).toBe(false)
  })

  it('rejects a failure envelope whose error has no real code or message', () => {
    // The exact shape the strengthened guard is for: `ok:false` with an object
    // `error`, but nothing a caller can act on. Letting it through means `unwrap`
    // builds an ApiCallError with `code: undefined` and an empty message.
    // Mutations that redden this: dropping the code/message checks, or checking
    // only `typeof error === 'object'`.
    expect(isApiResponse({ ok: false, cid: 'cid-1', error: {} })).toBe(false)
    expect(
      isApiResponse({ ok: false, cid: 'cid-1', error: { message: 'oops' } }),
    ).toBe(false) // no code
    expect(
      isApiResponse({ ok: false, cid: 'cid-1', error: { code: 'NOPE' } }),
    ).toBe(false) // code not in the taxonomy
    expect(
      isApiResponse({
        ok: false,
        cid: 'cid-1',
        error: { code: 'NOT_FOUND', message: '' },
      }),
    ).toBe(false) // empty message
    // ...while a well-formed failure still stands.
    expect(
      isApiResponse({
        ok: false,
        cid: 'cid-1',
        error: { code: 'NOT_FOUND', message: 'Tidak ditemukan' },
      }),
    ).toBe(true)
  })
})
