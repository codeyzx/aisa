import { describe, expect, it } from 'vitest'

import { FIRESTORE_BATCH_LIMIT } from '@/lib/data/batch'

import {
  ASSET_BULK_DELETE_MAX,
  ASSET_STATUS_LABEL,
  AssetSchema,
  AssetStatusSchema,
} from './asset.schema'

describe('ASSET_STATUS_LABEL', () => {
  it('covers every member of the enum, and nothing else', () => {
    // The `Record<AssetStatus, string>` annotation already makes a MISSING label
    // a compile error. This catches the direction the type cannot: a label left
    // behind after its member is removed, which typechecks fine and rots.
    expect(Object.keys(ASSET_STATUS_LABEL).sort()).toEqual(
      [...AssetStatusSchema.options].sort(),
    )
  })

  it('never shows a reader the raw enum member', () => {
    // The actual user-facing complaint: the filter and cell printed `active` /
    // `retired`. A label identical to its key means someone added a member and
    // satisfied the compiler by echoing it — the compile error's one loophole.
    for (const [status, label] of Object.entries(ASSET_STATUS_LABEL)) {
      expect(label, `${status} has no human label`).not.toBe(status)
    }
  })

  it('labels are non-empty and human-cased', () => {
    for (const [status, label] of Object.entries(ASSET_STATUS_LABEL)) {
      expect(label.trim(), `${status} label is blank`).not.toBe('')
      expect(label, `${status} label is not capitalised`).toMatch(/^[A-Z]/)
    }
  })
})

/**
 * The attachment field is `.optional()`, and this block is the proof the option
 * holds in BOTH directions — the one thing that, if wrong, breaks the whole
 * existing collection silently.
 *
 * The converter parses every read with `AssetSchema.parse()` (NOT `.safeParse`),
 * so a required `attachmentKey` would throw on every one of the 25 seeded docs —
 * which predate this field — and `/assets` would 500 for the entire list. A unit
 * test catches that before an emulator or a browser has to.
 */
describe('AssetSchema attachmentKey', () => {
  // Shared, minus the attachment — the shape a doc written before this field
  // existed hydrates from. `Date`s stand in for the Firestore Timestamps the
  // converter would hand in; `TimestampSchema` accepts a `Date` untouched.
  const base = {
    id: 'asset-1',
    code: 'AST-0001',
    name: 'Example',
    value: 1_000_000,
    status: 'active' as const,
    searchPrefixes: ['ex'],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  }

  it('hydrates a document that predates the field (no attachmentKey)', () => {
    const parsed = AssetSchema.parse(base)
    expect(parsed.attachmentKey).toBeUndefined()
    // The rest still hydrates — a missing optional must not poison the doc.
    expect(parsed.name).toBe('Example')
    expect(parsed.status).toBe('active')
  })

  it('round-trips a document that carries an attachmentKey', () => {
    const key = 'uploads/uid123/0e0d2b3c-1a2b-3c4d-5e6f-7a8b9c0d1e2f-report.pdf'
    const parsed = AssetSchema.parse({ ...base, attachmentKey: key })
    expect(parsed.attachmentKey).toBe(key)
  })

  it('rejects a non-string attachmentKey at the boundary', () => {
    expect(() => AssetSchema.parse({ ...base, attachmentKey: 42 })).toThrow()
  })

  it('rejects a document missing the required search index', () => {
    const { searchPrefixes: _, ...withoutSearchPrefixes } = base
    expect(() => AssetSchema.parse(withoutSearchPrefixes)).toThrow()
  })
})

/**
 * The value field is REQUIRED, but `z.coerce.number` ALONE turns a blank form
 * submit (`''`) into a real Rp 0 the user never chose. These pin the distinction
 * that matters: a blank is rejected, while an EXPLICIT 0 stays a valid value.
 */
describe('AssetSchema value', () => {
  const base = {
    id: 'asset-1',
    code: 'AST-0001',
    name: 'Example',
    status: 'active' as const,
    searchPrefixes: ['ex'],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  }

  it('rejects a blank value instead of coercing it to Rp 0', () => {
    // Mutation that reddens this: dropping the union and using `z.coerce.number`
    // alone — `Number('')` is 0, so a blank field would save a silent zero.
    const result = AssetSchema.safeParse({ ...base, value: '' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Nilai wajib diisi')
  })

  it('rejects a whitespace-only value', () => {
    expect(AssetSchema.safeParse({ ...base, value: '   ' }).success).toBe(false)
  })

  it('accepts an EXPLICIT zero — the value a blank must not be confused with', () => {
    expect(AssetSchema.parse({ ...base, value: '0' }).value).toBe(0)
    expect(AssetSchema.parse({ ...base, value: 0 }).value).toBe(0)
  })

  it('coerces a numeric form string to a number', () => {
    expect(AssetSchema.parse({ ...base, value: '5000000' }).value).toBe(
      5_000_000,
    )
  })

  it('rejects a negative or fractional value', () => {
    expect(AssetSchema.safeParse({ ...base, value: '-5' }).success).toBe(false)
    expect(AssetSchema.safeParse({ ...base, value: '3.5' }).success).toBe(false)
  })
})

describe('ASSET_BULK_DELETE_MAX', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(ASSET_BULK_DELETE_MAX)).toBe(true)
    expect(ASSET_BULK_DELETE_MAX).toBeGreaterThan(0)
  })

  // The product cap and Firestore's write ceiling are DISTINCT constants, but the
  // cap must not exceed the ceiling: a bulk delete is one atomic batch, so a
  // UI-built selection larger than the batch limit would be rejected by the repo
  // guard. Raising the product cap past the batch limit needs a chunking strategy,
  // not a bigger number — this test fails loudly if someone tries.
  it('never exceeds the Firestore batch write ceiling', () => {
    expect(ASSET_BULK_DELETE_MAX).toBeLessThanOrEqual(FIRESTORE_BATCH_LIMIT)
  })
})
