import * as z from 'zod'

import { TimestampSchema } from '@/lib/data/timestamp'

/**
 * The asset register — the boilerplate's reference feature. A small but REAL
 * domain: an asset has a server-minted human code (`AST-0001`), a name, a rupiah
 * value, an optional attachment, and an active/retired lifecycle. It exists so
 * the data layer (converter, collections, repo, actions) is exercised by
 * something concrete — and a fork renames it to its own first entity (see
 * docs/explanation/architecture.md, "Why `assets` exists").
 */

/** Lifecycle state of an asset. Extend the enum as the boilerplate grows. */
export const AssetStatusSchema = z.enum(['active', 'retired'])

export type AssetStatus = z.infer<typeof AssetStatusSchema>

/**
 * Human labels for `AssetStatusSchema` — the ONE place a status is spelled for a
 * reader. Every surface that shows a status to a human reads this map: the table
 * cell, the filter segments, the form's Select. None of them may re-spell a
 * status themselves, or the copy drifts per surface.
 *
 * Colocated with the enum it labels rather than parked in a shared registry
 * module: the label is part of what the member MEANS, and a registry is exactly
 * the parallel taxonomy that goes stale the day someone extends the enum without
 * knowing the other file exists. Living here, it cannot be missed.
 *
 * `Record<AssetStatus, string>` is the whole trick, not decoration: adding a
 * member to the enum above is a COMPILE ERROR here until its label exists, so a
 * raw enum value can never reach the UI. Widen the enum, and `pnpm typecheck`
 * names this object until you say what to call the new state.
 *
 * Deliberately no `?? status` fallback for an unmapped key. `status` is typed
 * `AssetStatus` and every read is parsed through `AssetSchema`, so an unmapped key
 * cannot reach a caller — the boundary already rejects it. A fallback would be
 * unreachable code whose only real effect is to soften the compile error above
 * into a silent shrug.
 */
export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  active: 'Aktif',
  retired: 'Nonaktif',
}

/**
 * Full stored shape. Reads are hydrated through this schema by the converter,
 * so `createdAt` / `updatedAt` arrive as real `Date`s and `status` is defaulted.
 */
export const AssetSchema = z.object({
  id: z.string(),
  // Human-readable code, `AST-0001`. Server-MINTED on create via the sequential
  // counter (`nextCode`, lib/repos/counter.repo.ts) and immutable after: no
  // caller supplies or edits it, so it is absent from `AssetCreateSchema` below,
  // exactly like `id`. This field is what lights up the otherwise-dormant
  // counter infrastructure — the one entity in the repo that needs a code.
  code: z.string(),
  // Field-level messages live here so client validators (derived from this
  // schema) and the server action surface the SAME copy — never redefined.
  name: z
    .string()
    .min(1, 'Nama wajib diisi')
    .max(120, 'Nama maksimal 120 karakter'),
  description: z
    .string()
    .max(2000, 'Deskripsi maksimal 2000 karakter')
    .optional(),
  // Rupiah value, a whole number — IDR has no circulating subunit, and
  // `formatRupiah` (lib/format/currency.ts) renders none. Rendered through
  // `formatRupiah` everywhere a human reads it (the table cell, the asset card),
  // never hand-formatted, so `Rp` and the thousands separators cannot drift.
  //
  // The union REJECTS an empty submit rather than coercing it. `z.coerce.number`
  // ALONE turns `''` into `0`, so a required field would silently save a real
  // Rp 0 the user never chose. Requiring a number OR a non-empty trimmed string
  // keeps an EXPLICIT `0` valid while a blank errors as "Value is required"; a
  // hydrated read is already a number, so the number branch is the no-op there.
  value: z
    .union([z.number(), z.string().trim().min(1, 'Nilai wajib diisi')])
    .transform((v) => Number(v))
    .pipe(
      z
        .number()
        .int('Nilai harus berupa bilangan bulat rupiah')
        .min(0, 'Nilai tidak boleh negatif'),
    ),
  // The object key of one attached file, or absent. `.optional()` is the whole
  // data-model change the reference feature needs — one attachment, persisted on
  // the doc, so the upload is no longer an orphan (the storage demo's warning).
  //
  // A BARE KEY, not a `{ key, filename, size, contentType }` object: the key
  // already carries owner and a human-legible name — `buildKey` mints
  // `uploads/<uid>/<uuid>-<safe-name>` — so an object would store a second copy
  // of a fact the system already models. The tradeoff is stated where the reader
  // meets it: the legible name is the SANITIZED one (`sanitizeFilename`), so a
  // truthful original filename would be the object shape — a real product call,
  // deliberately not taken here. Derive the display name with `filenameFromKey`
  // (lib/storage/keys.ts), never by hand-splitting the key in a component.
  //
  // NOT stored when absent: `ignoreUndefinedProperties` (lib/firebase/admin.ts)
  // drops an undefined field, exactly as it does for `description`, so a doc
  // written before this field existed round-trips unchanged.
  attachmentKey: z.string().optional(),
  status: AssetStatusSchema.default('active'),
  /**
   * SERVER-DERIVED search index — the normalised word-prefixes of the searchable
   * fields (`code` + `name`), queried with `array-contains` (lib/data/search-prefix.ts).
   * Never client input: it is absent from `AssetCreateSchema` (below), and the
   * repo derives it on every create/update from the trusted field values, so a
   * client cannot make a document match — or hide from — a search.
   *
   * This starter has no deployed Asset data, so the field is required from its
   * first write. A project that adds a derived field after deployment must ship an
   * explicit migration before making its query depend on that field.
   */
  searchPrefixes: z.array(z.string()),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export type Asset = z.infer<typeof AssetSchema>

/**
 * The fields an asset list may be ORDERED BY — the whole sortable set, and
 * deliberately just TWO: `createdAt` and `value`.
 *
 * THE STANDARD: a column is sortable if it answers "which is the most
 * X" — dates, amounts, ordered statuses. A column that only identifies a row —
 * name, description, code — is not, and SEARCH serves those instead. Alphabetising
 * a name column looks useful and almost never answers a question anyone had.
 *
 * Applied honestly to this entity:
 *
 * - `createdAt` — a date. "Most recent" is the default view.
 * - `value` — an amount. "Most / least valuable" is a real question a reader
 *   brings to a register of assets, so it earns a sort (and its index bill below).
 * - `name`, `description`, `code` — labels. Not a magnitude, no "most". Search's
 *   job (this entity now has search — see `searchPrefixes`).
 * - `status` — an enum, not a rank. "Most retired" is not a question, and
 *   `active`/`retired` is already exposed as a FILTER, which answers the real
 *   ask ("show me the retired ones") exactly, cheaply, and without an index.
 * - `id`, `updatedAt` — nothing in the table shows them, and a column nobody can
 *   see cannot be clicked.
 *
 * Widening this is never free: EVERY sortable field × EVERY direction × EVERY
 * filter that can be active alongside it is a composite index, and an index is a
 * deploy artifact. Adding `value` roughly DOUBLED the index bill (see
 * `firestore.indexes.json` and docs/reference/contracts/data.md) — that cost is the
 * reason the set stays this small and each member is argued.
 *
 * `satisfies readonly (keyof Asset)[]` binds the set to the schema above: rename
 * a field and this stops the build rather than shipping a header that sorts by
 * a field Firestore has never heard of.
 */
export const ASSET_SORT_FIELDS = [
  'createdAt',
  'value',
] as const satisfies readonly (keyof Asset)[]

export type AssetSortField = (typeof ASSET_SORT_FIELDS)[number]

/** One orderable view of the asset list: which field, and which way. */
export interface AssetSort {
  field: AssetSortField
  direction: 'asc' | 'desc'
}

/**
 * Newest first — the order `/assets` shows when the URL says nothing, and the
 * one every un-sorted caller (`/state`) gets. Lives beside the sortable set so
 * the URL parser's fallback and the repo's default are the SAME fact: a page
 * whose default disagreed with its repo's would paint an unsorted-looking
 * header over rows that were, in fact, sorted.
 */
export const DEFAULT_ASSET_SORT: AssetSort = {
  field: 'createdAt',
  direction: 'desc',
}

/**
 * How many assets a reader may bulk-select and delete at once — a PRODUCT cap on
 * the selection UI and the bulk action, owned by this feature. It is DISTINCT
 * from Firestore's 500-writes-per-batch ceiling (`FIRESTORE_BATCH_LIMIT`): that
 * is an infrastructure limit the repo enforces as a hard floor; this is a product
 * choice about how large a bulk operation should be. They are equal today, but a
 * project lowers this without touching the batch limit. It MUST stay
 * `<= FIRESTORE_BATCH_LIMIT` so a UI-built selection always commits in one batch —
 * asserted in `asset.schema.test.ts`.
 */
export const ASSET_BULK_DELETE_MAX = 500

/** Fields a caller may supply on create; the server owns id + timestamps. */
export const AssetCreateSchema = AssetSchema.pick({
  name: true,
  description: true,
  value: true,
  status: true,
  attachmentKey: true,
})

/** Partial patch for an update — any subset of the create fields. */
export const AssetUpdateSchema = AssetCreateSchema.partial()

export type AssetCreate = z.infer<typeof AssetCreateSchema>
export type AssetUpdate = z.infer<typeof AssetUpdateSchema>

/**
 * Values the create/edit FORM edits — the create fields, but with a present
 * default for every one (controlled inputs need it), so `description` is a
 * string ('' when empty; the action maps it back to undefined on write).
 * Derived from `AssetCreate` so field types are never re-declared.
 */
export type AssetFormValues = Required<AssetCreate>
