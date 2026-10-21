// TEMPLATE — copy-me starter for a new entity's repository. See
// `_template.schema.ts` for the token legend. After copying to
// `features/<entity>/<entity>.repo.ts`:
//
//   1. Copy `_template.path.ts` beside this file, then bind that feature-owned
//      path in the sibling `<entity>.collection.ts` (copy
//      `_template.collection.ts`) — that keeps `lib/` domain-agnostic.
//   2. Keep this repo THIN (a typed-accessor, not a CRUD facade). ONLY
//      `cache()`'d reads, cursor pagination, and transactions belong here.
//      One-off reads/queries go DIRECT off `__entities__Collection()` at the
//      call site — never add a pass-through wrapper (see the anti-sprawl rule in
//      docs/reference/contracts/data.md).
//   3. If you KEEP the status-filtered list below, register its COMPOSITE INDEX
//      in firestore.indexes.json — `status` ASCENDING + `createdAt` DESCENDING,
//      which is the exact shape this query issues. Without it the filtered query
//      500s in production with FAILED_PRECONDITION while the emulator serves it
//      happily. The `widgets` block there is this list's index, generated and
//      driven; copy it and rename the collection. Paging BACKWARDS reuses the
//      same index (driven), but adding a sort TOGGLE means a second one with
//      `createdAt` ASCENDING. See docs/reference/contracts/data.md.
//
// EXCLUDED from typecheck by the `_template.*` name.

import 'server-only'

import { cache } from 'react'

import { withDeadline } from '@/lib/data/deadline'
import { requireFound } from '@/lib/data/domain-error'
import { stampCreated, stampUpdated } from '@/lib/data/stamps'
import { type Page } from '@/lib/data/pagination.contract'
import { paginate } from '@/lib/data/pagination.firestore'
import { adminDb } from '@/lib/firebase/admin-db'
import { __entities__Collection } from './__entity__.collection'
import type {
  __Entity__,
  __Entity__Create,
  __Entity__Update,
} from './__entity__.schema'

/** Fetch one by id, or `null`. Deduped per render pass via React `cache()`. */
export const get__Entity__ = cache(
  async (id: string): Promise<__Entity__ | null> => {
    const snap = await __entities__Collection().doc(id).get()
    return snap.data() ?? null
  },
)

export interface List__Entities__Args {
  limit: number
  cursor?: string | null
  status?: __Entity__['status']
}

/** Paginated list, newest first, optionally filtered by status. */
export function list__Entities__(
  args: List__Entities__Args,
): Promise<Page<__Entity__>> {
  const base = __entities__Collection()
  const query = args.status ? base.where('status', '==', args.status) : base
  return paginate<__Entity__>(query, {
    limit: args.limit,
    cursor: args.cursor,
    orderByField: 'createdAt',
    direction: 'desc',
    // STAMP the cursor with the filter it was built under, so a cursor from one
    // status set can never page another (each mints a distinct token). Match this
    // to your filter — see features/asset/asset.repo.ts.
    scope: `status=${args.status ?? 'all'}`,
  })
}

/**
 * Create in a transaction; the server owns id + timestamps.
 *
 * EVERY write here is wrapped in `withDeadline`. Keep it that way when you copy
 * this file: the Admin SDK bounds transaction ATTEMPTS, never wall-clock, so an
 * unwrapped write hangs for the SDK's own (long, undocumented) timeout while a
 * user watches a spinner. Do NOT add a second retry wrapper: the Admin SDK
 * already retries transactions and a second one would compound.
 */
export function create__Entity__(input: __Entity__Create): Promise<__Entity__> {
  const ref = __entities__Collection().doc()
  const write = adminDb().runTransaction(async (tx) => {
    const __entity__: __Entity__ = {
      ...stampCreated(ref.id, input),
      status: input.status ?? 'active',
    }
    tx.set(ref, __entity__)
    return __entity__
  })
  return withDeadline(write, 'create__Entity__')
}

/** Read-modify-write in a transaction; throws if it does not exist. */
export function update__Entity__(
  id: string,
  patch: __Entity__Update,
): Promise<__Entity__> {
  const ref = __entities__Collection().doc(id)
  const write = adminDb().runTransaction(async (tx) => {
    const current = requireFound(
      (await tx.get(ref)).data(),
      '__entity__ not found',
    )
    const __entity__: __Entity__ = stampUpdated(current, patch)
    tx.set(ref, __entity__)
    return __entity__
  })
  return withDeadline(write, 'update__Entity__')
}

/** Delete by id. */
export async function delete__Entity__(id: string): Promise<void> {
  await withDeadline(
    __entities__Collection().doc(id).delete(),
    'delete__Entity__',
  )
}
