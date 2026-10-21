import { describe, expect, it } from 'vitest'

import {
  CORRELATION_ID_HEADER,
  isCorrelationId,
  newCorrelationId,
  resolveCorrelationId,
} from './cid'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function requestWithCid(cid: string): Request {
  return new Request('https://example.test/api/thing', {
    headers: { [CORRELATION_ID_HEADER]: cid },
  })
}

describe('newCorrelationId', () => {
  it('mints a v4 uuid', () => {
    expect(newCorrelationId()).toMatch(UUID_PATTERN)
  })

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newCorrelationId()))
    expect(ids.size).toBe(100)
  })
})

describe('isCorrelationId', () => {
  it('accepts what we mint and other conservative schemes', () => {
    expect(isCorrelationId(newCorrelationId())).toBe(true)
    expect(isCorrelationId('trace_123-abc')).toBe(true)
  })

  it('rejects values that would corrupt a log line', () => {
    // An inbound cid is untrusted and lands straight in log records.
    expect(isCorrelationId('')).toBe(false)
    expect(isCorrelationId('has space')).toBe(false)
    expect(isCorrelationId('a\nlevel=error msg="forged"')).toBe(false)
    expect(isCorrelationId('semi;colon')).toBe(false)
    expect(isCorrelationId('a'.repeat(129))).toBe(false)
  })

  it('accepts exactly at the length limit', () => {
    expect(isCorrelationId('a'.repeat(128))).toBe(true)
  })
})

describe('resolveCorrelationId', () => {
  it('adopts a well-formed inbound cid', () => {
    // This is what stitches the client half of a trace to the server half.
    expect(resolveCorrelationId(requestWithCid('trace-abc'))).toBe('trace-abc')
  })

  it('trims surrounding whitespace before adopting', () => {
    expect(resolveCorrelationId(requestWithCid('  trace-abc  '))).toBe(
      'trace-abc',
    )
  })

  it('mints one when the header is absent', () => {
    const request = new Request('https://example.test/api/thing')
    expect(resolveCorrelationId(request)).toMatch(UUID_PATTERN)
  })

  it('REPLACES a malformed cid instead of failing the request', () => {
    // A bad trace header is not a reason to reject otherwise valid work.
    const resolved = resolveCorrelationId(requestWithCid('a'.repeat(200)))
    expect(resolved).toMatch(UUID_PATTERN)
  })

  it('replaces an injection attempt rather than echoing it', () => {
    const resolved = resolveCorrelationId(requestWithCid('x" level="error'))
    expect(resolved).toMatch(UUID_PATTERN)
  })
})
