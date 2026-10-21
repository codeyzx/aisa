import { type AssetCreate } from '@/features/asset/asset.schema'

/**
 * Deterministic `AssetCreate`s for tests.
 *
 * Typed to `AssetCreate` — read from `@/features/asset/asset.schema`, never
 * re-declared — so the builder cannot drift from the schema the repo validates
 * against. Add a required field to the schema and this stops the build, which is
 * the point.
 *
 * Shape mirrors `scripts/seed-emulator.ts:buildAssets` (read, NOT imported —
 * that script DELETES the entire `assets` collection before seeding, so
 * importing it would arm a wipe inside a test run).
 *
 * WHAT IS DELIBERATELY ABSENT: `createdAt`. The server owns it — `createAsset`
 * stamps `new Date()` inside its transaction, and `AssetCreate` cannot carry one.
 * A test that needs STAGGERED timestamps (paging needs distinct sort values, or
 * the cursor has nothing to resume past) advances `vi.setSystemTime` between
 * creates instead. That keeps the stagger real, produced by the code under test,
 * rather than a fixture asserting a value it wrote itself.
 */
export function anAsset(overrides: Partial<AssetCreate> = {}): AssetCreate {
  return {
    name: 'Test asset',
    description: 'Built by test/builders/asset.ts',
    value: 1_000_000,
    status: 'active',
    ...overrides,
  }
}

/**
 * `count` assets named by their index — `Test asset 01`, `02`, … — so a failure
 * message names WHICH row moved rather than showing two identical objects.
 *
 * Padded to two digits so lexical order matches numeric order: unpadded, `asset
 * 10` sorts between `1` and `2`, and a test debugging a paging seam by eye reads
 * the wrong story.
 */
export function assets(
  count: number,
  overrides: (index: number) => Partial<AssetCreate> = () => ({}),
): AssetCreate[] {
  return Array.from({ length: count }, (_, index) =>
    anAsset({
      name: `Test asset ${String(index + 1).padStart(2, '0')}`,
      ...overrides(index),
    }),
  )
}
