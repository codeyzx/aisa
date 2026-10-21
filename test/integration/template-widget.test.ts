import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { type Page } from '@/lib/data/pagination.contract'
import { requireEmulatorOrSkip } from '@/test/emulator'
import { generateTemplates } from '@/scripts/template-generate'

/**
 * The entity a forker actually gets, RUN — not compiled.
 *
 * `pnpm templates:check` proves the templates typecheck, obey the architecture
 * contracts, and leak no capability. None of that is evidence that a copied
 * entity WORKS: a converter that drops a field, a stamp that never lands, a
 * cursor whose scope string does not survive a round trip, and a transaction
 * that reads before it writes are all green under tsc. This suite materializes
 * the same `Widget` the gate compiles — same generator, so the compiled entity
 * and the executed entity cannot diverge — and drives its repo against a real
 * Firestore.
 *
 * The generated tree is written to the OS temp directory, never the worktree, so
 * nothing here needs a tsconfig, lint or format exemption to stay out of the
 * repo's own programs.
 *
 * WHY THE HAND-WRITTEN MODULE TYPE BELOW: the import specifier is a runtime path,
 * so there is nothing for `typeof import(...)` to read. Spelling the surface here
 * is not a duplicate of the template's types — it is the ASSERTION. It states the
 * API a forker is promised, and a template that renames an export or reorders a
 * parameter fails on the call, which is the same acceptance the gate gets from
 * tsc, one layer out.
 */
const reachable = await requireEmulatorOrSkip('generated entity integration')

interface Widget {
  id: string
  name: string
  description?: string
  status: 'active' | 'retired'
  createdAt: Date
  updatedAt: Date
}

interface WidgetCreate {
  name: string
  description?: string
  status?: Widget['status']
}

interface WidgetRepo {
  createWidget(input: WidgetCreate): Promise<Widget>
  getWidget(id: string): Promise<Widget | null>
  listWidgets(args: {
    limit: number
    cursor?: string | null
    status?: Widget['status']
  }): Promise<Page<Widget>>
  updateWidget(id: string, patch: Partial<WidgetCreate>): Promise<Widget>
  deleteWidget(id: string): Promise<void>
}

const generatedRoot = mkdtempSync(join(tmpdir(), 'aixel-template-widget-'))
generateTemplates(generatedRoot)

const repo = (await import(
  join(generatedRoot, 'features/_check-widget/widget.repo.ts')
)) as WidgetRepo

/** Pinned so every timestamp below is asserted BY VALUE. */
const T0 = new Date('2026-07-24T00:00:00.000Z')

/** Every doc this file creates, torn down in afterEach. */
let created: string[] = []

/**
 * Start from an empty collection. The generated entity's collection has no
 * owner: no
 * application code writes to it and no script seeds it, which is exactly why the
 * data contract records it as the one collection here that nothing writes. So
 * the ordering assertions below can say `toEqual` on a whole page instead of
 * "contains my rows somewhere" — a strictly stronger claim. This exists for the
 * run that crashed before its teardown, which would otherwise leave rows whose
 * real timestamps sort ahead of this suite's faked ones and fail it confusingly.
 */
beforeAll(async () => {
  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- drain, one page at a time
    const page = await repo.listWidgets({ limit: 100 })
    if (page.items.length === 0) break
    for (const widget of page.items) {
      // eslint-disable-next-line no-await-in-loop -- teardown, order irrelevant
      await repo.deleteWidget(widget.id)
    }
  }
})

async function seed(count: number, status?: Widget['status']) {
  const out: Widget[] = []
  for (let index = 0; index < count; index += 1) {
    // Advance the CLOCK rather than writing a timestamp: the server owns
    // createdAt, so this is the only way to make the sort values distinct while
    // the value under assertion is still the one the generated code produced.
    vi.setSystemTime(new Date(T0.getTime() + index * 60_000))
    // eslint-disable-next-line no-await-in-loop -- ordered writes, by design
    const widget = await repo.createWidget({ name: `widget ${index}`, status })
    out.push(widget)
    created.push(widget.id)
  }
  return out
}

beforeEach(() => {
  // toFake: ['Date'] IS NOT OPTIONAL — faking every timer stops firebase-admin's
  // network stack and the suite dies of a timeout that names nothing.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  created = []
})

afterEach(async () => {
  vi.useRealTimers()
  for (const id of created) {
    // eslint-disable-next-line no-await-in-loop -- teardown, order irrelevant
    await repo.deleteWidget(id)
  }
})

afterAll(() => {
  rmSync(generatedRoot, { recursive: true, force: true })
})

describe.skipIf(!reachable)('generated entity (real Firestore)', () => {
  it('stamps the server-owned fields and hydrates them back as Dates', async () => {
    const widget = await repo.createWidget({ name: 'first' })
    created.push(widget.id)

    expect(widget.id).not.toBe('')
    expect(widget.createdAt).toEqual(T0)
    expect(widget.updatedAt).toEqual(T0)
    // The schema's default, applied by the repo rather than by the caller.
    expect(widget.status).toBe('active')

    // Read back THROUGH the converter: a Firestore Timestamp that the schema
    // failed to parse would arrive here as a Timestamp, not a Date, and every
    // later date comparison in a copied feature would silently compare objects.
    const read = await repo.getWidget(widget.id)
    expect(read).toEqual(widget)
    expect(read?.createdAt).toBeInstanceOf(Date)
  })

  it('returns null for an id that does not exist', async () => {
    expect(await repo.getWidget('no-such-widget')).toBeNull()
  })

  it('keeps createdAt and moves updatedAt on a patch', async () => {
    const widget = await repo.createWidget({ name: 'before' })
    created.push(widget.id)

    const later = new Date(T0.getTime() + 3_600_000)
    vi.setSystemTime(later)
    const updated = await repo.updateWidget(widget.id, { name: 'after' })

    expect(updated.name).toBe('after')
    expect(updated.createdAt).toEqual(T0)
    expect(updated.updatedAt).toEqual(later)
  })

  it('refuses to update a document that is not there', async () => {
    await expect(
      repo.updateWidget('no-such-widget', { name: 'x' }),
    ).rejects.toThrow()
  })

  it('pages newest-first and resumes past the cursor', async () => {
    const seeded = await seed(3)
    const newestFirst = seeded.toReversed().map((widget) => widget.id)

    const first = await repo.listWidgets({ limit: 2 })
    expect(first.items.map((widget) => widget.id)).toEqual(
      newestFirst.slice(0, 2),
    )
    expect(first.nextCursor).toBeTruthy()

    const second = await repo.listWidgets({
      limit: 2,
      cursor: first.nextCursor,
    })
    expect(second.items.map((widget) => widget.id)).toEqual([newestFirst[2]])

    // Back again. A backwards page scans the SAME ordered set in reverse, so it
    // must land on the rows the first page served — not merely on some rows.
    const back = await repo.listWidgets({ limit: 2, cursor: second.prevCursor })
    expect(back.items.map((widget) => widget.id)).toEqual(
      newestFirst.slice(0, 2),
    )
  })

  it('filters by status — the shape that needs the composite index', async () => {
    const active = await seed(2, 'active')
    await seed(1, 'retired')

    const page = await repo.listWidgets({ limit: 10, status: 'active' })
    const ids = page.items.map((widget) => widget.id)

    expect(ids).toEqual(expect.arrayContaining(active.map((w) => w.id)))
    for (const widget of page.items) expect(widget.status).toBe('active')
  })

  it('deletes', async () => {
    const widget = await repo.createWidget({ name: 'doomed' })
    await repo.deleteWidget(widget.id)
    expect(await repo.getWidget(widget.id)).toBeNull()
  })
})
