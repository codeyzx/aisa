import { describe, expect, it } from 'vitest'

import {
  MODEL_PRICES,
  pricePeriodOn,
  ratesOn,
  tokenCost,
  USD_IDR,
  usdToIdr,
} from './aisa.pricing'

const FLASH = 'gemini-3.8-flash'

describe('ratesOn', () => {
  it('uses the introductory price through 31 December 2026', () => {
    expect(ratesOn(FLASH, '2026-10-21')).toEqual({
      input: 0.75,
      cachedInput: 0.075,
      output: 3.75,
    })
    expect(ratesOn(FLASH, '2026-12-31')?.input).toBe(0.75)
  })

  it('switches to the standard price on 1 January 2027', () => {
    expect(ratesOn(FLASH, '2027-01-01')).toEqual({
      input: 1.5,
      cachedInput: 0.15,
      output: 7.5,
    })
    expect(pricePeriodOn(FLASH, '2030-06-01')?.until).toBeNull()
  })

  it('has no price for a model the module does not list', () => {
    expect(ratesOn('gemini-3.1-pro-preview', '2026-10-21')).toBeNull()
    expect(ratesOn(null, '2026-10-21')).toBeNull()
    // An inherited property name is not a model.
    expect(ratesOn('constructor', '2026-10-21')).toBeNull()
  })

  it('lists every model tariff in date order without gaps', () => {
    for (const periods of Object.values(MODEL_PRICES)) {
      for (let i = 1; i < periods.length; i += 1) {
        const until = periods[i - 1]?.until
        expect(until).not.toBeNull()
        const next = new Date(`${until}T00:00:00Z`)
        next.setUTCDate(next.getUTCDate() + 1)
        expect(periods[i]?.from).toBe(next.toISOString().slice(0, 10))
      }
    }
  })
})

describe('tokenCost', () => {
  it('prices input and output (thinking included) per million tokens', () => {
    const rates = ratesOn(FLASH, '2026-10-21')
    if (!rates) throw new Error('no rates')
    const cost = tokenCost({ in: 1_000_000, out: 200_000 }, rates)
    expect(cost.inputUsd).toBeCloseTo(0.75)
    expect(cost.outputUsd).toBeCloseTo(0.75)
    expect(cost.usd).toBeCloseTo(1.5)
  })

  it('doubles for the same tokens after the 2027 switch', () => {
    const tokens = { in: 3_233, out: 3_295 }
    const before = ratesOn(FLASH, '2026-12-31')
    const after = ratesOn(FLASH, '2027-01-01')
    if (!before || !after) throw new Error('no rates')
    expect(tokenCost(tokens, before).usd).toBeCloseTo(0.01478, 5)
    expect(tokenCost(tokens, after).usd).toBeCloseTo(
      2 * tokenCost(tokens, before).usd,
      10,
    )
  })
})

describe('usdToIdr', () => {
  it('converts at the stated reference rate', () => {
    expect(USD_IDR.rate).toBe(17_917)
    expect(usdToIdr(2)).toBe(35_834)
  })
})
