import { describe, expect, it } from 'vitest'

import { decodeCursor, encodeCursor } from './pagination.contract'

/**
 * The cursor's sort binding — the one part of paging that can be silently wrong.
 *
 * `paginate()` itself needs Firestore, so it is not what is tested here. The
 * decision it delegates IS pure and lives in `decodeCursor`: given a token and
 * the sort we are about to run, may this token resume that scan? Every case
 * below names the mutation that reddens it — a test that cannot fail is worse
 * than none.
 *
 * Why this matters more than it looks: `assets` sorts on ONE field today, so the
 * only thing a reader can change is DIRECTION — and a direction mismatch throws
 * nothing, returns rows, and looks right. It is invisible to typecheck, lint,
 * build, and to any test that only round-trips a token.
 */

const DESC = { field: 'createdAt', direction: 'desc' } as const
const ASC = { field: 'createdAt', direction: 'asc' } as const

const ALL = 'status=all'
const RETIRED = 'status=retired'

describe('decodeCursor', () => {
  it('round-trips a token under the sort that minted it', () => {
    const token = encodeCursor({
      sort: DESC,
      scope: ALL,
      sortValue: { __ts: 1 },
      docId: 'a',
      nav: 'next',
    })

    expect(decodeCursor(token, DESC, ALL)).toEqual({
      sort: DESC,
      scope: ALL,
      sortValue: { __ts: 1 },
      docId: 'a',
      nav: 'next',
    })
  })

  it('refuses a token minted under the opposite DIRECTION', () => {
    // THE case. `startAfter(value)` means "past this value, scanning this way",
    // so replaying a descending token against an ascending scan serves the rows
    // on the other side of it — a full page of plausible, wrong rows, with no
    // type error and no throw anywhere.
    //
    // Mutations that redden this: dropping the `tokenSort.direction !==
    // sort.direction` half of the guard in decodeCursor; or comparing only
    // `field`, which is what "the cursor is bound to the column" naively means.
    const token = encodeCursor({
      sort: DESC,
      scope: ALL,
      sortValue: { __ts: 1 },
      docId: 'a',
      nav: 'next',
    })

    expect(decodeCursor(token, ASC, ALL)).toBeNull()
  })

  it('refuses a token minted under a different FIELD', () => {
    // Firestore requires the cursor value's type to match the ordered field's,
    // so this one usually throws downstream instead of lying — but only when
    // the types happen to differ. Two string fields would swap silently.
    //
    // Mutation that reddens this: dropping the `tokenSort.field !== sort.field`
    // half of the guard.
    const token = encodeCursor({
      sort: DESC,
      scope: ALL,
      sortValue: { __ts: 1 },
      docId: 'a',
      nav: 'next',
    })

    expect(
      decodeCursor(token, { field: 'name', direction: 'desc' }, ALL),
    ).toBeNull()
  })

  it('refuses a token that names no sort at all', () => {
    // A token that names no sort looks like this. It is not grandfathered in:
    // an unstamped token cannot prove which scan it belongs to, and a cursor is
    // ephemeral URL state, so restarting costs a click.
    //
    // Mutation that reddens this: `isCursorSort` accepting a missing sort —
    // e.g. defaulting `direction` to the one being asked for, which reads like
    // a kindness and grandfathers every unstamped token straight back in.
    const token = Buffer.from(
      JSON.stringify({ sortValue: { __ts: 1 }, docId: 'a' }),
      'utf8',
    ).toString('base64url')

    expect(decodeCursor(token, DESC, ALL)).toBeNull()
  })

  it('refuses a token whose sort is structurally junk', () => {
    // Same gate as above, other shape: `isCursorSort` is what stands between a
    // hand-edited token and `startAfter`. Mutation that reddens this: bypassing
    // it (`if (!isCursorSort(tokenSort)) return { sort, sortValue, docId }`).
    //
    // Honest note, because it is worth knowing what this does NOT prove:
    // loosening isCursorSort's own body to `return true` leaves this GREEN, as
    // the field/direction comparison below rejects the junk anyway. The strict
    // check earns its place by making the `value is CursorSort` predicate true
    // rather than by being the thing that catches this token.
    const token = Buffer.from(
      JSON.stringify({
        sort: { field: 'createdAt', direction: 'sideways' },
        sortValue: { __ts: 1 },
        docId: 'a',
      }),
      'utf8',
    ).toString('base64url')

    expect(decodeCursor(token, DESC, ALL)).toBeNull()
  })

  it('refuses a malformed token instead of throwing', () => {
    // `?cursor=` is reader-supplied: a truncated copy-paste must land on page
    // one, not crash the RSC. Mutation that reddens this: dropping the
    // try/catch around JSON.parse.
    expect(decodeCursor('not-a-real-token', DESC, ALL)).toBeNull()
  })

  it('refuses a token whose sortValue is not a sortable scalar', () => {
    // Mutation that reddens this: dropping the `validSortValue` check — an
    // array or object would then reach `startAfter` and throw at query time.
    const token = Buffer.from(
      JSON.stringify({ sort: DESC, sortValue: { nope: 1 }, docId: 'a' }),
      'utf8',
    ).toString('base64url')

    expect(decodeCursor(token, DESC, ALL)).toBeNull()
  })

  it('refuses a token with no doc id', () => {
    // The tiebreaker is not optional: `startAfter(value)` alone repeats or skips
    // every row sharing that value. Mutation that reddens this: dropping the
    // `typeof docId !== 'string'` check.
    const token = Buffer.from(
      JSON.stringify({ sort: DESC, sortValue: { __ts: 1 } }),
      'utf8',
    ).toString('base64url')

    expect(decodeCursor(token, DESC, ALL)).toBeNull()
  })
})

describe('decodeCursor — the filter axis', () => {
  it('refuses a token minted under a different FILTER', () => {
    // The half the sort guard cannot see. Same field, same direction — a sort
    // check passes cleanly — but the position was measured in a different set,
    // so `startAfter` resumes the retired rows from an offset counted through
    // the unfiltered ones. Nothing throws. The reader gets a plausible page of
    // rows that belong to neither answer.
    //
    // Reachable by hand-editing `&status=` onto a paged URL, or by a bookmark
    // outliving a filter change.
    //
    // Mutation that reddens this: dropping the `tokenScope !== scope` half of
    // the guard.
    const token = encodeCursor({
      sort: DESC,
      scope: ALL,
      sortValue: { __ts: 1 },
      docId: 'a',
      nav: 'next',
    })

    expect(decodeCursor(token, DESC, RETIRED)).toBeNull()
  })

  it('refuses a legacy token that names no filter at all', () => {
    // Tokens minted before scope existed carry none. Absent must not read as
    // "matches anything" — that is the failure the guard exists to stop, and it
    // is what a `?? ''` default on the TOKEN side would have quietly restored.
    const legacy = Buffer.from(
      JSON.stringify({ sort: DESC, sortValue: { __ts: 1 }, docId: 'a' }),
      'utf8',
    ).toString('base64url')

    expect(decodeCursor(legacy, DESC, ALL)).toBeNull()
  })
})

describe('decodeCursor — the nav axis', () => {
  it('round-trips the resume direction, so a prev token stays a prev token', () => {
    const token = encodeCursor({
      sort: DESC,
      scope: ALL,
      sortValue: { __ts: 1 },
      docId: 'a',
      nav: 'prev',
    })

    expect(decodeCursor(token, DESC, ALL)?.nav).toBe('prev')
  })

  it('refuses a legacy token that names no nav direction', () => {
    // Tokens minted before bidirectional paging carry no `nav`. Absent must not
    // read as a silent default direction — it decodes to null → page one.
    // Mutation that reddens this: defaulting `tokenNav` to `'next'`.
    const legacy = Buffer.from(
      JSON.stringify({
        sort: DESC,
        scope: ALL,
        sortValue: { __ts: 1 },
        docId: 'a',
      }),
      'utf8',
    ).toString('base64url')

    expect(decodeCursor(legacy, DESC, ALL)).toBeNull()
  })

  it('refuses a token whose nav is neither next nor prev', () => {
    const token = Buffer.from(
      JSON.stringify({
        sort: DESC,
        scope: ALL,
        sortValue: { __ts: 1 },
        docId: 'a',
        nav: 'sideways',
      }),
      'utf8',
    ).toString('base64url')

    expect(decodeCursor(token, DESC, ALL)).toBeNull()
  })
})

describe('decodeCursor — value bounds', () => {
  // The file promises a stale/hand-edited `?cursor` lands on page one, never a
  // 500. These are the values a shape-only check waves through and that then
  // throw inside `startAfter` — a forged token turning into a server error.
  it('refuses a cursor whose __ts is outside the Timestamp range', () => {
    // 253402300800000 is one ms past Firestore's representable max; it would
    // throw inside Timestamp.fromMillis. Mutation that reddens this: dropping the
    // range check in isBoxedTimestamp.
    const token = encodeCursor({
      sort: DESC,
      scope: ALL,
      sortValue: { __ts: 253402300800000 },
      docId: 'a',
      nav: 'next',
    })

    expect(decodeCursor(token, DESC, ALL)).toBeNull()
  })

  it('refuses a cursor whose __ts is non-finite', () => {
    // JSON has no Infinity literal, but `JSON.parse('1e400')` yields Infinity, so
    // a forged token can smuggle it past a bare `typeof === 'number'`. Mutation
    // that reddens this: dropping the `Number.isFinite` check.
    const token = Buffer.from(
      '{"sort":{"field":"createdAt","direction":"desc"},"scope":"status=all","sortValue":{"__ts":1e400},"docId":"a"}',
      'utf8',
    ).toString('base64url')

    expect(decodeCursor(token, DESC, ALL)).toBeNull()
  })

  it('refuses a cursor whose bare numeric sortValue is non-finite', () => {
    const token = Buffer.from(
      '{"sort":{"field":"createdAt","direction":"desc"},"scope":"status=all","sortValue":1e400,"docId":"a"}',
      'utf8',
    ).toString('base64url')

    expect(decodeCursor(token, DESC, ALL)).toBeNull()
  })

  it('refuses a cursor with an empty doc id', () => {
    // `startAfter(value, '')` throws in the SDK — the tiebreaker must name a real
    // document. Mutation that reddens this: dropping the `docId.length > 0` check.
    const token = encodeCursor({
      sort: DESC,
      scope: ALL,
      sortValue: { __ts: 1 },
      docId: '',
      nav: 'next',
    })

    expect(decodeCursor(token, DESC, ALL)).toBeNull()
  })

  it('refuses a cursor whose doc id contains a path separator', () => {
    // A real `DocumentSnapshot.id` is a single path segment, never containing
    // `/`. Mutation that reddens this: dropping the `!docId.includes('/')` check.
    const token = encodeCursor({
      sort: DESC,
      scope: ALL,
      sortValue: { __ts: 1 },
      docId: 'a/b',
      nav: 'next',
    })

    expect(decodeCursor(token, DESC, ALL)).toBeNull()
  })
})
