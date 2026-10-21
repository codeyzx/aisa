// TEMPLATE — copy-me starter for a new entity's Zod schema.
//
// Copy this file to `features/<entity>/<entity>.schema.ts`, then find-replace the
// placeholder tokens (they also appear in the sibling repo/action templates):
//
//   __Entity__    -> PascalCase singular  (e.g. Invoice)   type + schema names
//   __Entities__  -> PascalCase plural    (e.g. Invoices)  identifiers naming a
//                                                          set (listInvoices)
//   __entity__    -> camelCase singular   (e.g. invoice)   local vars, audit tag
//   __entities__  -> camelCase plural     (e.g. invoices)  collection key + path
//   __ENTITY__    -> SCREAMING singular   (e.g. INVOICE)   const maps (label)
//   __ENTITIES__  -> SCREAMING plural     (e.g. INVOICES)  collection-path const
//
// Order does not matter — the passes are case-sensitive, so they cannot clobber
// each other. Just do not SKIP one: each survives the differently cased passes
// and ships as an unresolved identifier, which is valid TypeScript and compiles.
//
// Then reshape the fields for your entity and delete this header. Reads are
// hydrated through this schema by the collection converter, so declare stored
// types (e.g. `createdAt: TimestampSchema` yields a real `Date` after parse).
//
// This file is EXCLUDED from typecheck by its `_template.*` name (see tsconfig
// `exclude`), so the unresolved placeholder tokens never break the build.

import * as z from 'zod'

import { TimestampSchema } from '@/lib/data/timestamp'

/** Lifecycle state. Extend the enum as your entity grows. */
export const __Entity__StatusSchema = z.enum(['active', 'retired'])

export type __Entity__Status = z.infer<typeof __Entity__StatusSchema>

/**
 * Human labels for the enum above — colocated with it, never in a registry
 * module. Every surface that shows this status to a reader (table cell, filter,
 * Select) imports THIS map instead of spelling the member itself.
 *
 * Keep the `Record<__Entity__Status, string>` annotation: it is what makes
 * adding an enum member a COMPILE ERROR until its label exists, so a raw
 * `snake_case` value can never leak into the UI.
 */
export const __ENTITY___STATUS_LABEL: Record<__Entity__Status, string> = {
  active: 'Aktif',
  retired: 'Nonaktif',
}

/** Full stored shape — what a hydrated read returns. */
export const __Entity__Schema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  // A REQUIRED number? Do NOT use `z.coerce.number()` — it turns an empty submit
  // ('') into a real 0, silently saving a value nobody chose. Require a number OR
  // a non-empty string so a blank errors while an explicit 0 stays valid:
  //   amount: z
  //     .union([z.number(), z.string().trim().min(1, 'Amount is required')])
  //     .transform((v) => Number(v))
  //     .pipe(z.number().int().min(0)),
  // See features/asset/asset.schema.ts (`value`) and the data contract.
  status: __Entity__StatusSchema.default('active'),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export type __Entity__ = z.infer<typeof __Entity__Schema>

/** Fields a caller may supply on create; the server owns id + timestamps. */
export const __Entity__CreateSchema = __Entity__Schema.pick({
  name: true,
  description: true,
  status: true,
})

/** Partial patch for an update — any subset of the create fields. */
export const __Entity__UpdateSchema = __Entity__CreateSchema.partial()

export type __Entity__Create = z.infer<typeof __Entity__CreateSchema>
export type __Entity__Update = z.infer<typeof __Entity__UpdateSchema>

/** Complete controlled values shared by create and edit forms. */
export type __Entity__FormValues = Required<__Entity__Create>
