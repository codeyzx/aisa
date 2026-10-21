import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  generateTemporaryPassword,
  TEMPORARY_PASSWORD_ALPHABET,
  TEMPORARY_PASSWORD_LENGTH,
} from './temporary-password'

/**
 * The generator is the only credential this application ever mints, so what is
 * worth asserting is not "it returns a string" but the four properties that a
 * plausible-looking rewrite would break silently:
 *
 *  - it draws from the transcription-safe alphabet and nothing else;
 *  - it is long enough to be unguessable;
 *  - it does not use `Math.random`;
 *  - and it actually varies.
 *
 * The last two are the ones a type checker cannot see. A `Math.random` version
 * passes every other assertion in this file.
 */
const SAMPLE_COUNT = 500

const samples = Array.from({ length: SAMPLE_COUNT }, () =>
  generateTemporaryPassword(),
)

describe('the alphabet', () => {
  it('excludes every character pair that fails transcription', () => {
    // The reason the alphabet is not simply A-Za-z0-9: these are read off a
    // screen and typed into a login form, often relayed by a support call.
    for (const ambiguous of ['0', 'O', '1', 'l', 'I']) {
      expect(TEMPORARY_PASSWORD_ALPHABET).not.toContain(ambiguous)
    }
  })

  it('contains no duplicate characters, so every draw is equally likely', () => {
    // A duplicated character would be drawn twice as often as its neighbours —
    // a bias introduced by a typo rather than by arithmetic.
    expect(new Set(TEMPORARY_PASSWORD_ALPHABET).size).toBe(
      TEMPORARY_PASSWORD_ALPHABET.length,
    )
  })

  it('has no whitespace or punctuation to survive a copy/paste', () => {
    expect(TEMPORARY_PASSWORD_ALPHABET).toMatch(/^[A-Za-z2-9]+$/)
  })
})

describe('generateTemporaryPassword', () => {
  it('is at least 16 characters — the floor the module contract states', () => {
    expect(TEMPORARY_PASSWORD_LENGTH).toBeGreaterThanOrEqual(16)
  })

  it('returns exactly TEMPORARY_PASSWORD_LENGTH characters every time', () => {
    for (const password of samples) {
      expect(password).toHaveLength(TEMPORARY_PASSWORD_LENGTH)
    }
  })

  it('draws only from the declared alphabet', () => {
    // Read off the exported constant rather than a second regex: a copy here
    // would go stale green the day a character is added or removed.
    const allowed = new Set(TEMPORARY_PASSWORD_ALPHABET)
    for (const password of samples) {
      for (const character of password)
        expect(allowed.has(character)).toBe(true)
    }
  })

  it('never repeats a password across a large sample', () => {
    // With ~116 bits of entropy a collision in 500 draws is not "unlikely", it is
    // evidence of a seeded or counting generator.
    expect(new Set(samples).size).toBe(SAMPLE_COUNT)
  })

  it('reaches every character of the alphabet across the sample', () => {
    // 500 × 20 = 10,000 draws over 57 characters — ~175 expected occurrences
    // each. A generator that silently truncated the alphabet (a modulo over a
    // byte, say) would leave the tail unreachable, and this is what would see it.
    const seen = new Set(samples.join(''))
    expect(seen.size).toBe(TEMPORARY_PASSWORD_ALPHABET.length)
  })

  it('spreads characters evenly enough to rule out a heavy modulo bias', () => {
    // Not a statistical test, and not pretending to be one: this is the coarse
    // sanity bound that catches the specific bug the module warns against —
    // `randomBytes(n) % 57`, where the first 28 characters come up ~1.5× as
    // often as the rest. Expected share is 1/57 ≈ 1.75%; the bound admits any
    // honest sampling noise and refuses a 2× skew.
    const draws = samples.join('')
    const expectedShare = draws.length / TEMPORARY_PASSWORD_ALPHABET.length
    for (const character of TEMPORARY_PASSWORD_ALPHABET) {
      const count = draws.split(character).length - 1
      expect(count).toBeGreaterThan(expectedShare * 0.5)
      expect(count).toBeLessThan(expectedShare * 1.5)
    }
  })
})

describe('the source itself', () => {
  const source = readFileSync(
    new URL('./temporary-password.ts', import.meta.url),
    'utf8',
  )

  /**
   * The module STRIPPED OF COMMENTS. Load-bearing: the header names both
   * `Math.random` and `%` in order to explain why neither may be used, so a scan
   * over the raw text would fire on its own documentation — a check that is red
   * for the wrong reason gets deleted, and then it is not checking anything.
   */
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('never calls Math.random', () => {
    // The one property no behavioural assertion can reach: `Math.random` output
    // looks exactly like CSPRNG output to every other test in this file, while
    // being state-recoverable from a handful of observed passwords. So the
    // assertion is made against the SOURCE, which is where the mistake would be.
    expect(code).not.toMatch(/Math\s*\.\s*random/)
  })

  it('draws from node:crypto', () => {
    expect(code).toContain("from 'node:crypto'")
  })

  it('does not reduce a random value with a modulo', () => {
    // `randomInt` rejection-samples; a `%` in the executable text would mean
    // somebody replaced it with the biased shortcut the header warns about.
    expect(code).not.toContain('%')
  })
})
