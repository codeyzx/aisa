import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { assets } from '@/test/builders/asset'
import { requireEmulatorOrSkip } from '@/test/emulator'

import {
  countAssets,
  createAsset,
  deleteAssets,
  getAsset,
  listAssets,
  updateAsset,
} from '@/features/asset/asset.repo'
import { assetsCollection } from '@/features/asset/asset.collection'
import { type Asset } from '@/features/asset/asset.schema'

/**
 * The item repo, driven against a REAL Firestore (the emulator, Admin SDK).
 *
 * WHY NOT AN IN-MEMORY FAKE: everything worth testing here is a fact about
 * Firestore's semantics — `startAfter(value, docId)` tuple resumption, the
 * `__name__` tiebreaker, the `limit + 1` probe, Timestamp/scalar type matching
 * in a cursor. A hand-written fake would not test `paginate` against Firestore;
 * it would test `paginate` against one author's BELIEF about Firestore, and pass
 * when that belief is wrong. A hand-written Firestore is a hand-kept copy of
 * query SEMANTICS — the same objection that rules out a hand-kept copy of query
 * shapes, one level deeper.
 *
 * The full argument lives in docs/reference/contracts/testing.md.
 *
 * NOTE: this suite is NOT an alternative to firestore.rules.test.ts. That drives
 * the CLIENT SDK against firestore.rules; this drives the ADMIN SDK, which
 * bypasses rules entirely. Different boundaries, no overlap.
 */
const reachable = await requireEmulatorOrSkip('item repo integration tests')

/** Pinned so every timestamp below is asserted BY VALUE, not `expect.any(Date)`. */
const T0 = new Date('2026-07-17T00:00:00.000Z')

/**
 * Every doc this file creates, torn down in afterEach.
 *
 * The suite must not depend on the order it ran in, and it must not depend on an
 * empty collection either: `pnpm seed` may have left 25 rows here, and the seed
 * is NOT run by this suite (scripts/seed-emulator.ts deletes the whole `items`
 * collection, which would wipe a fixture mid-drive and read as a paging bug).
 * So every assertion below is scoped to ids this file created — never to a
 * collection-wide count.
 */
let created: string[] = []

async function seed(
  count: number,
  overrides: (i: number) => Partial<Asset> = () => ({}),
) {
  const built = assets(count, overrides as never)
  const out: Asset[] = []
  for (const [index, input] of built.entries()) {
    // Stagger createdAt by advancing the CLOCK, not by writing a timestamp: the
    // server owns createdAt (createAsset stamps `new Date()` inside its
    // transaction), so this is the only way to make the sort values distinct
    // while the value under assertion is still the one the code produced.
    // Distinct sort values are what a cursor needs to have something to resume
    // past; identical ones would fall back to the __name__ tiebreaker and the
    // test would be measuring that instead.
    vi.setSystemTime(new Date(T0.getTime() + index * 60_000))
    const item = await createAsset(input)
    out.push(item)
    created.push(item.id)
  }
  return out
}

beforeEach(() => {
  // toFake: ['Date'] IS NOT OPTIONAL — see docs/reference/contracts/testing.md.
  // The bare vi.useFakeTimers() default fakes EVERY timer, including the ones
  // firebase-admin's network stack runs on, and this suite then dies of an 8s
  // timeout with no error naming the cause. Measured: same test, same emulator,
  // only this narrowing removed → "Test timed out in 8000ms".
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  created = []
})

afterEach(async () => {
  vi.useRealTimers()
  if (created.length > 0) await deleteAssets(created)
})

afterAll(() => {
  vi.useRealTimers()
})

describe.skipIf(!reachable)('item repo (real Firestore)', () => {
  describe('createAsset / updateAsset — the server owns the timestamps', () => {
    it('stamps createdAt and updatedAt with the real clock, asserted by value', async () => {
      const [item] = await seed(1)

      expect(item.createdAt).toEqual(T0)
      expect(item.updatedAt).toEqual(T0)
      expect(item.id).toBeTruthy()
      expect(item.status).toBe('active')
    })

    it('round-trips through Firestore as a Date, not a Timestamp', async () => {
      const [item] = await seed(1)

      // The converter's job: a read is hydrated through AssetSchema, so what
      // comes BACK from Firestore must be a real Date. Asserting on the write's
      // return value alone would never touch the converter's read path — the
      // object came straight out of the transaction closure.
      const fetched = await getAsset(item.id)

      expect(fetched?.createdAt).toBeInstanceOf(Date)
      expect(fetched?.createdAt).toEqual(T0)
      expect(fetched?.name).toBe('Test asset 01')
    })

    it('moves updatedAt and leaves createdAt alone', async () => {
      const [item] = await seed(1)

      const later = new Date(T0.getTime() + 3_600_000)
      vi.setSystemTime(later)
      const { asset: updated } = await updateAsset(
        item.id,
        { name: 'Renamed' },
        item.attachmentKey,
      )

      expect(updated.name).toBe('Renamed')
      expect(updated.updatedAt).toEqual(later)
      // The half a "timestamps are set" test would miss: createdAt must NOT move
      // on an update. updateAsset spreads `current` then patches, so a reordered
      // spread would silently restamp it.
      expect(updated.createdAt).toEqual(T0)
    })

    it('CLEARS an attachment when the patch carries an explicit undefined', async () => {
      // The path nothing covered, and the one `stampUpdated`'s plain spread
      // exists to protect. Clearing travels as '' -> undefined from the form,
      // reaches the repo as a PRESENT key whose value is undefined, overwrites
      // the current value in the merge, and is then dropped from the stored
      // document by ignoreUndefinedProperties on the full `set`.
      //
      // A merge that filtered undefined out of the patch — the natural
      // "improvement" — would leave the old key in place: the clear becomes a
      // silent no-op, nothing throws, and the UI reports success. Driven here
      // rather than asserted, because only a real write proves the key is gone
      // from the DOCUMENT and not merely from the returned object.
      const [item] = await seed(1, () => ({
        attachmentKey: 'uploads/uid-1/old.pdf',
      }))
      expect(item.attachmentKey).toBe('uploads/uid-1/old.pdf')

      const { asset: cleared, previousAttachmentKey } = await updateAsset(
        item.id,
        { attachmentKey: undefined },
        item.attachmentKey,
      )

      expect(cleared.attachmentKey).toBeUndefined()
      // The key the caller must reap is the one THIS transaction replaced.
      expect(previousAttachmentKey).toBe('uploads/uid-1/old.pdf')
      // And it is gone from the stored document, not just the returned object.
      const fetched = await getAsset(item.id)
      expect(fetched?.attachmentKey).toBeUndefined()
    })
  })

  describe('paginate — the probe row and the Next button to nowhere', () => {
    it('does not leak the limit+1 probe row into the page', async () => {
      await seed(5)

      const page = await listAssets({ limit: 2 })

      // paginate fetches limit+1 to LEARN whether more exist, then must throw
      // the extra away. If it leaked, this is 3.
      expect(page.items).toHaveLength(2)
      expect(page.nextCursor).not.toBeNull()
    })

    it('mints NO cursor when the row count is an exact multiple of the limit', async () => {
      // THE BUG paginate's docstring narrates, and the reason the probe row
      // exists: the old rule — mint a cursor whenever the page came back full —
      // promises a next page to every collection whose size is an exact multiple
      // of the limit, then delivers an empty one. 4 rows, limit 2: page 2 is
      // full, and there is nothing after it.
      const seeded = await seed(4)

      const page1 = await listAssets({ limit: 2 })
      const page2 = await listAssets({ limit: 2, cursor: page1.nextCursor })

      expect(page2.items).toHaveLength(2)
      // A "Next" here is a button to nowhere, sitting beside "Showing 4 of 4".
      expect(page2.nextCursor).toBeNull()
      expect(seeded).toHaveLength(4)
    })
  })

  describe('the cursor actually RESUMES', () => {
    it('walks every row exactly once across a page seam', async () => {
      // decodeCursor's unit tests prove a token is REFUSED correctly. Nothing
      // proved one RESUMES correctly — that fact lives in Firestore's
      // startAfter(value, docId), which no unit test can reach.
      const seeded = await seed(5)
      // Default sort is createdAt DESC (newest first), so the newest seeded row
      // leads.
      const expectedOrder = seeded.toReversed().map((i) => i.name)

      const page1 = await listAssets({ limit: 2 })
      const page2 = await listAssets({ limit: 2, cursor: page1.nextCursor })
      const page3 = await listAssets({ limit: 2, cursor: page2.nextCursor })

      const walked = [...page1.items, ...page2.items, ...page3.items].map(
        (i) => i.name,
      )

      // Nothing repeated, nothing vanished, and the order held ACROSS the seams.
      expect(walked).toEqual(expectedOrder)
      expect(new Set(walked).size).toBe(5)
      expect(page3.nextCursor).toBeNull()
    })

    it('walks tied sort values exactly once via the __name__ tiebreaker', async () => {
      // Every seeded row shares ONE sort value, so ordering falls ENTIRELY to the
      // __name__ (doc id) tiebreaker baked into every query. This is exactly where
      // a pager without a stable secondary sort skips or repeats a row across a
      // page seam — the case the staggered-clock seed deliberately avoids elsewhere.
      const seeded = await seed(5, () => ({ value: 1_000_000 }))
      const seededIds = new Set(seeded.map((i) => i.id))
      const byValue = { field: 'value', direction: 'asc' } as const

      const page1 = await listAssets({ limit: 2, sort: byValue })
      const page2 = await listAssets({
        limit: 2,
        sort: byValue,
        cursor: page1.nextCursor,
      })
      const page3 = await listAssets({
        limit: 2,
        sort: byValue,
        cursor: page2.nextCursor,
      })

      const walked = [...page1.items, ...page2.items, ...page3.items].map(
        (i) => i.id,
      )
      // No skip, no repeat, exactly the five seeded rows — the tiebreaker held
      // across two seams even though the primary sort value never changed.
      expect(new Set(walked).size).toBe(5)
      expect(walked.every((id) => seededIds.has(id))).toBe(true)
      expect(page3.nextCursor).toBeNull()

      // And backward through the same ties resumes on the exact prior page.
      const back = await listAssets({
        limit: 2,
        sort: byValue,
        cursor: page3.prevCursor,
      })
      expect(back.items.map((i) => i.id)).toEqual(page2.items.map((i) => i.id))
    })

    it('refuses a cursor minted under a different sort and restarts', async () => {
      await seed(4)

      const desc = await listAssets({
        limit: 2,
        sort: { field: 'createdAt', direction: 'desc' },
      })
      // Same field, OPPOSITE direction. This is the case that throws NOTHING:
      // the value is a valid Timestamp for the ordered field, so Firestore
      // would happily serve the rows on the other side of it — a plausible page
      // of wrong rows. paginate drops the token instead and serves page one.
      const asc = await listAssets({
        limit: 2,
        cursor: desc.nextCursor,
        sort: { field: 'createdAt', direction: 'asc' },
      })

      const firstPageAsc = await listAssets({
        limit: 2,
        sort: { field: 'createdAt', direction: 'asc' },
      })
      expect(asc.items.map((i) => i.name)).toEqual(
        firstPageAsc.items.map((i) => i.name),
      )
      expect(asc.items[0]?.name).toBe('Test asset 01')
    })

    it('refuses a cursor that crosses from one filter into another', async () => {
      // The half a sort check cannot see: same field, same direction, different
      // SET. Without the scope stamp, startAfter would resume the retired set
      // from an offset counted through the unfiltered one — nothing throws, and
      // the reader gets rows belonging to neither answer.
      await seed(6, (i) => ({ status: i % 2 === 0 ? 'retired' : 'active' }))

      const unfiltered = await listAssets({ limit: 2 })
      const retired = await listAssets({
        limit: 2,
        cursor: unfiltered.nextCursor,
        status: 'retired',
      })

      const retiredPage1 = await listAssets({ limit: 2, status: 'retired' })
      expect(retired.items.map((i) => i.id)).toEqual(
        retiredPage1.items.map((i) => i.id),
      )
      expect(retired.items.every((i) => i.status === 'retired')).toBe(true)
    })
  })

  describe('listAssets({ status }) — the composite-index shape', () => {
    it('filters and orders together, which is what demands the composite index', async () => {
      // THIS is the row that fills the emulator's indexUsage report that
      // `pnpm indexes:check` reads. `.where('status','==') + .orderBy('createdAt')`
      // needs a composite index that nothing else in this repo enforces — the
      // emulator serves it happily either way, and production answers
      // FAILED_PRECONDITION at RSC render.
      const seeded = await seed(6, (i) => ({
        status: i % 2 === 0 ? 'retired' : 'active',
      }))
      const expectedRetired = seeded
        .filter((i) => i.status === 'retired')
        .toReversed()
        .map((i) => i.name)

      const page = await listAssets({ limit: 10, status: 'retired' })

      expect(page.items.map((i) => i.name)).toEqual(expectedRetired)
      expect(page.items).toHaveLength(3)
    })
  })

  describe('countAssets agrees with listAssets — assetsQuery is shared so they cannot drift', () => {
    it('counts the same set the list lists, filtered and unfiltered', async () => {
      await seed(6, (i) => ({ status: i % 2 === 0 ? 'retired' : 'active' }))

      // Scoped to THIS file's docs: countAssets() counts the whole collection,
      // which a concurrent seed or another test's leftovers would also be in.
      // Comparing the filtered count against the filtered list is the invariant
      // that matters — that the label's denominator describes the rows above it.
      const retiredCount = await countAssets('retired')
      const retiredList = await listAssets({ limit: 50, status: 'retired' })
      expect(retiredCount).toBe(retiredList.items.length)

      const activeCount = await countAssets('active')
      const activeList = await listAssets({ limit: 50, status: 'active' })
      expect(activeCount).toBe(activeList.items.length)

      const total = await countAssets()
      expect(total).toBeGreaterThanOrEqual(retiredCount + activeCount)
    })
  })

  describe('deleteAssets — the batching path', () => {
    it('deletes a selection and the rows are actually gone', async () => {
      const seeded = await seed(3)
      const ids = seeded.map((i) => i.id)

      await deleteAssets(ids)
      created = []

      const remaining = await Promise.all(ids.map((id) => getAsset(id)))
      expect(remaining).toEqual([null, null, null])
    })
  })

  describe('the cursor pages BACKWARD too (Previous)', () => {
    it('returns the exact rows paging back that it showed paging forward', async () => {
      // The prev-cursor's whole job: `endBefore(anchor).limitToLast(n)` must fill
      // the SAME page a forward walk produced. No unit test can prove this — it
      // lives in Firestore's limitToLast semantics.
      await seed(5)
      const p1 = await listAssets({ limit: 2 })
      const p2 = await listAssets({ limit: 2, cursor: p1.nextCursor })

      // Page BACK from p2 using its prevCursor — must reproduce p1 exactly.
      const back = await listAssets({ limit: 2, cursor: p2.prevCursor })
      expect(back.items.map((i) => i.id)).toEqual(p1.items.map((i) => i.id))
    })

    it('has no Previous on the first page and no Next on the last', async () => {
      await seed(4)
      const p1 = await listAssets({ limit: 2 })
      expect(p1.prevCursor).toBeNull()
      expect(p1.nextCursor).not.toBeNull()

      const p2 = await listAssets({ limit: 2, cursor: p1.nextCursor })
      // 4 rows, limit 2 — the exact-multiple boundary: page 2 is the last, and it
      // offers Previous but not Next.
      expect(p2.nextCursor).toBeNull()
      expect(p2.prevCursor).not.toBeNull()
    })

    it('refuses a prev cursor that crosses into a different filter', async () => {
      // A prev token carries the same scope guard as a next one: paged back
      // across a filter change, it decodes to null and restarts at page one.
      await seed(6, (i) => ({ status: i % 2 === 0 ? 'retired' : 'active' }))
      const p1 = await listAssets({ limit: 2 })
      const p2 = await listAssets({ limit: 2, cursor: p1.nextCursor })

      const crossed = await listAssets({
        limit: 2,
        cursor: p2.prevCursor,
        status: 'retired',
      })
      const retiredPage1 = await listAssets({ limit: 2, status: 'retired' })
      expect(crossed.items.map((i) => i.id)).toEqual(
        retiredPage1.items.map((i) => i.id),
      )
    })
  })

  describe('search — normalized word-prefix over code + name', () => {
    it('matches a name-word prefix, case-insensitively', async () => {
      const names = ['Kursi Kayu', 'Meja Rapat', 'Kulkas Mini']
      await seed(3, (i) => ({ name: names[i] }))

      // `kur` is a prefix of "Kursi" only.
      const one = await listAssets({ limit: 10, search: 'kur' })
      expect(one.items.map((i) => i.name)).toEqual(['Kursi Kayu'])

      // `ku` prefixes both "Kursi" and "Kulkas".
      const two = await listAssets({ limit: 10, search: 'ku' })
      expect(two.items.map((i) => i.name).sort()).toEqual([
        'Kulkas Mini',
        'Kursi Kayu',
      ])
    })

    it('matches a code-word prefix — codes are searchable too', async () => {
      const seeded = await seed(2)
      // Every server-minted code is `AST-000N`, so `ast` prefixes all of them.
      const page = await listAssets({ limit: 10, search: 'ast' })
      const ours = page.items.filter((i) => seeded.some((s) => s.id === i.id))
      expect(ours).toHaveLength(2)
    })

    it('composes search with the status filter (the composite-index shape)', async () => {
      await seed(4, (i) => ({
        name: 'Lampu Meja',
        status: i % 2 === 0 ? 'retired' : 'active',
      }))
      const page = await listAssets({
        limit: 10,
        search: 'lampu',
        status: 'retired',
      })
      expect(page.items.length).toBeGreaterThan(0)
      expect(page.items.every((i) => i.status === 'retired')).toBe(true)
      expect(
        page.items.every((i) => i.name.toLowerCase().includes('lampu')),
      ).toBe(true)
    })

    it('counts the searched set, so the label denominator matches the rows', async () => {
      await seed(3, () => ({ name: 'Proyektor Ruang' }))
      const count = await countAssets(undefined, 'proy')
      const list = await listAssets({ limit: 50, search: 'proy' })
      expect(count).toBe(list.items.length)
      expect(count).toBeGreaterThanOrEqual(3)
    })

    it('resets when the search changes — a cursor cannot cross searches', async () => {
      await seed(6, () => ({ name: 'Meja Kayu' }))
      const p1 = await listAssets({ limit: 2, search: 'meja' })
      // Carry p1's cursor into a DIFFERENT search: decodes to null → page one.
      const crossed = await listAssets({
        limit: 2,
        search: 'kay',
        cursor: p1.nextCursor,
      })
      const kayPage1 = await listAssets({ limit: 2, search: 'kay' })
      expect(crossed.items.map((i) => i.id)).toEqual(
        kayPage1.items.map((i) => i.id),
      )
    })
  })

  describe('sort by value, and every indexed query shape', () => {
    it('orders by value in both directions', async () => {
      const seeded = await seed(3, (i) => ({ value: [3000, 1000, 2000][i] }))
      const ids = new Set(seeded.map((s) => s.id))

      const asc = await listAssets({
        limit: 50,
        sort: { field: 'value', direction: 'asc' },
      })
      expect(
        asc.items.filter((i) => ids.has(i.id)).map((i) => i.value),
      ).toEqual([1000, 2000, 3000])

      const desc = await listAssets({
        limit: 50,
        sort: { field: 'value', direction: 'desc' },
      })
      expect(
        desc.items.filter((i) => ids.has(i.id)).map((i) => i.value),
      ).toEqual([3000, 2000, 1000])
    })

    it('drives every search/filter/sort/direction shape for indexes:check', async () => {
      // This test EXISTS to fill the emulator's indexUsage report that
      // `pnpm indexes:check` reads — the same job the `{ status }` test does for
      // its one shape. Every combination the UI can reach is run here so a missing
      // composite index is caught locally, not at FAILED_PRECONDITION in prod.
      await seed(4, (i) => ({
        name: 'Lampu Sorot',
        status: i % 2 === 0 ? 'retired' : 'active',
      }))

      for (const field of ['createdAt', 'value'] as const) {
        for (const direction of ['asc', 'desc'] as const) {
          const sort = { field, direction }
          await listAssets({ limit: 5, sort }) // unfiltered (single-field, free)
          await listAssets({ limit: 5, status: 'retired', sort }) // + status
          await listAssets({ limit: 5, search: 'lampu', sort }) // + search
          await listAssets({
            limit: 5,
            search: 'lampu',
            status: 'retired',
            sort,
          }) // + both
        }
      }
      // The searched count with a status filter — array-contains + equality.
      const count = await countAssets('retired', 'lampu')
      expect(count).toBeGreaterThanOrEqual(0)
    })
  })

  describe('the converter is a real boundary, not decoration', () => {
    it('rejects a document that does not match the schema on READ', async () => {
      // `withConverter(null)` DETACHES the converter for this write only, which
      // is the whole point: it plants a document the schema forbids, exactly as
      // a legacy row or an out-of-band script would. Reaching for
      // `.collection('assets')` here would duplicate the feature-owned path;
      // this stays on
      // `assetsCollection()` and drops only the seam under test.
      const ref = assetsCollection().doc()
      await ref.withConverter(null).set({ name: 42, status: 'nonsense' })
      created.push(ref.id)

      await expect(getAsset(ref.id)).rejects.toThrow()
    })
  })
})
