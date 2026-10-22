import { describe, expect, it } from 'vitest'

import {
  isAssessmentSettled,
  isOnRoute,
  onMissingTarget,
  parsePosition,
  planFor,
  progressOf,
  proposalIdFromHref,
  routeFor,
  serializePosition,
  shouldAutostart,
  stepAfter,
  stepById,
  type TourContext,
} from './tour-plan'

const manager: TourContext = {
  canRespond: true,
  proposalId: null,
  uploaded: false,
}
const viewer: TourContext = { ...manager, canRespond: false }

const ids = (ctx: TourContext) => planFor(ctx).map((step) => step.id)

describe('planFor', () => {
  it('offers the upload step only to a seat that can upload', () => {
    expect(ids(manager)).toContain('intake-upload')
    expect(ids(viewer)).not.toContain('intake-upload')
  })

  it('follows the upload into its assessment and skips the list', () => {
    const plan = ids({ ...manager, uploaded: true, proposalId: 'p1' })
    expect(plan).toContain('progress')
    expect(plan).not.toContain('list-first')
    expect(plan).not.toContain('list-empty')
  })

  it('without an upload, picks from the list and never waits on an assessment', () => {
    const plan = ids(manager)
    expect(plan).toContain('list-first')
    expect(plan).not.toContain('progress')
  })

  it('shows the detail steps only once there is a proposal to show', () => {
    expect(ids(manager)).not.toContain('detail-grade')
    expect(ids({ ...manager, proposalId: 'p1' })).toContain('detail-grade')
  })

  it('starts with the welcome and ends with the finish for every reader', () => {
    for (const ctx of [manager, viewer]) {
      expect(ids(ctx)[0]).toBe('welcome')
      expect(ids(ctx).at(-1)).toBe('finish')
    }
  })
})

describe('stepAfter', () => {
  it('goes from the Form step straight to the list for a viewer', () => {
    expect(stepAfter('intake-form', viewer)).toBe('list-first')
  })

  it('goes from the Form step to the upload for a manager', () => {
    expect(stepAfter('intake-form', manager)).toBe('intake-upload')
  })

  it('after the list hands over a proposal, skips the empty notice', () => {
    expect(stepAfter('list-first', { ...manager, proposalId: 'p1' })).toBe(
      'detail-score',
    )
  })

  it('with an empty list, goes from the notice past every detail step', () => {
    expect(stepAfter('list-empty', manager)).toBe('assistant')
  })

  it('walks backwards over steps that do not apply', () => {
    expect(stepAfter('list-first', viewer, -1)).toBe('intake-form')
    expect(
      stepAfter('detail-score', { ...manager, proposalId: 'p1' }, -1),
    ).toBe('list-first')
  })

  it('returns null past either end', () => {
    expect(stepAfter('finish', manager)).toBeNull()
    expect(stepAfter('welcome', manager, -1)).toBeNull()
  })
})

describe('progressOf', () => {
  it('keeps the same total before and after a proposal is picked', () => {
    const before = progressOf('intake-upload', manager).total
    const after = progressOf('detail-grade', {
      ...manager,
      proposalId: 'p1',
    }).total
    expect(before).toBe(after)
  })

  it('counts within the reader’s own plan', () => {
    const picked = { ...viewer, proposalId: 'p1' }
    const { current, total } = progressOf('welcome', viewer)
    expect(current).toBe(1)
    expect(total).toBe(planFor(picked).length)
    expect(progressOf('finish', picked).current).toBe(total)
  })
})

describe('routeFor / isOnRoute', () => {
  it('resolves the detail route to the chosen proposal, encoded', () => {
    expect(
      routeFor(stepById('detail-grade'), { ...manager, proposalId: 'a b/c' }),
    ).toBe('/proposal/a%20b%2Fc')
  })

  it('has no route for a step shown wherever the reader is', () => {
    expect(routeFor(stepById('assistant'), manager)).toBeNull()
  })

  it('has no route for a detail step without a proposal', () => {
    expect(routeFor(stepById('detail-grade'), manager)).toBeNull()
  })

  it('matches a path however its encoding is spelled', () => {
    expect(isOnRoute('/proposal/a b', '/proposal/a%20b')).toBe(true)
    expect(isOnRoute('/proposal', '/dashboard')).toBe(false)
  })
})

describe('onMissingTarget', () => {
  it('skips, centres, or redirects as the step says', () => {
    expect(onMissingTarget(stepById('detail-grade'), 1)).toEqual({
      kind: 'skip',
    })
    expect(onMissingTarget(stepById('nav-aturan'), 1)).toEqual({
      kind: 'center',
    })
    expect(onMissingTarget(stepById('list-first'), 1)).toEqual({
      kind: 'goto',
      step: 'list-empty',
    })
  })

  it('does not follow a redirect when walking backwards', () => {
    expect(onMissingTarget(stepById('list-first'), -1)).toEqual({
      kind: 'skip',
    })
  })
})

describe('proposalIdFromHref', () => {
  it('reads the id off a detail link', () => {
    expect(proposalIdFromHref('/proposal/form-abc')).toBe('form-abc')
    expect(proposalIdFromHref('/proposal/a%20b')).toBe('a b')
  })

  it('refuses anything that is not a detail link', () => {
    expect(proposalIdFromHref(null)).toBeNull()
    expect(proposalIdFromHref('/proposal')).toBeNull()
    expect(proposalIdFromHref('/proposal/x/y')).toBeNull()
    expect(proposalIdFromHref('javascript:alert(1)')).toBeNull()
    expect(proposalIdFromHref('https://evil.test/proposal/x')).toBeNull()
  })
})

describe('isAssessmentSettled', () => {
  it('moves on after a result or a manual-check hand-back only', () => {
    expect(isAssessmentSettled('selesai')).toBe(true)
    expect(isAssessmentSettled('perlu_dicek_manual')).toBe(true)
    for (const phase of ['antre', 'berjalan', 'dijeda', 'gagal', null]) {
      expect(isAssessmentSettled(phase)).toBe(false)
    }
  })
})

describe('shouldAutostart', () => {
  it('starts once, for a person, when storage says it was never shown', () => {
    expect(shouldAutostart({ seen: null, automated: false })).toBe(true)
    expect(shouldAutostart({ seen: '1', automated: false })).toBe(false)
  })

  it('does not start when storage cannot be read', () => {
    expect(shouldAutostart({ seen: undefined, automated: false })).toBe(false)
  })

  it('does not start in an automated browser', () => {
    expect(shouldAutostart({ seen: null, automated: true })).toBe(false)
  })
})

describe('parsePosition', () => {
  const position = {
    step: 'detail-grade' as const,
    proposalId: 'p1',
    uploaded: true,
  }

  it('round-trips a position for the same user', () => {
    expect(parsePosition(serializePosition('u1', position), 'u1')).toEqual(
      position,
    )
  })

  it('never resumes another account’s position', () => {
    expect(parsePosition(serializePosition('u1', position), 'u2')).toBeNull()
  })

  it('rejects absent, malformed, and unknown-step values', () => {
    expect(parsePosition(null, 'u1')).toBeNull()
    expect(parsePosition('{nope', 'u1')).toBeNull()
    expect(
      parsePosition(
        JSON.stringify({ ...position, uid: 'u1', step: 'gone' }),
        'u1',
      ),
    ).toBeNull()
  })
})
