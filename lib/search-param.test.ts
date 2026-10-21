import { describe, expect, it } from 'vitest'

import { parseAsString } from 'nuqs/server'

import { parseAsStrictSingle } from './search-param'

describe('parseAsStrictSingle', () => {
  const parser = parseAsStrictSingle(parseAsString)

  it('parses exactly one scalar value', () => {
    expect(parser.parse(['cursor-1'])).toBe('cursor-1')
  })

  it('rejects missing and repeated values', () => {
    expect(parser.parse([])).toBeNull()
    expect(parser.parse(['first', 'second'])).toBeNull()
  })

  it('serializes one scalar value', () => {
    expect(parser.serialize('cursor-1')).toEqual(['cursor-1'])
  })
})
