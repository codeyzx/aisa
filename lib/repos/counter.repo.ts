import 'server-only'

import type { Transaction } from 'firebase-admin/firestore'

import { COUNTERS_COLLECTION, formatCode } from '@/lib/data/counters'
import { typedCollection } from '@/lib/firebase/collections'
import { CounterSchema, type Counter } from '@/lib/schemas/counter.schema'

/**
 * Sequential human-readable codes (`INV-0001`), minted safely under concurrency.
 *
 * The naive shape this exists to replace is `count() + 1`, which RACES: two
 * callers read 41, both mint INV-0042, and the duplicate is discovered by a
 * human reading an invoice. The fix is not a bigger read — it is doing the
 * read-modify-write inside a transaction, so Firestore's own contention
 * detection re-runs the loser against the value the winner committed.
 *
 * This repo earns its slot under the anti-sprawl rule
 * (docs/reference/contracts/data.md) on the transaction clause: it is not
 * wrapping a query, it IS
 * the read-modify-write. The FORMAT half is deliberately not here — it is pure,
 * and this file sits behind `server-only` and the credential boundary. See
 * lib/data/counters.ts.
 */

/**
 * A counter's identity and its format, supplied by the call site.
 *
 * The format fields are a SEED used only when the counter document does not yet
 * exist, so a fresh project mints its first code without an ops step. Once the
 * document exists it is the authority and this is checked against it — see
 * `nextCode`.
 */
export interface CounterDef {
  /** The counter's name and document id, e.g. `invoice`. */
  id: string
  /** Literal text before the number, e.g. `INV-`. */
  prefix: string
  /** Zero-padding width. NOT a maximum (lib/data/counters.ts:formatCode). */
  width: number
}

/**
 * Mint the next code for `def`, INSIDE the caller's transaction.
 *
 * ⚠️ It takes the caller's `tx` rather than opening its own, and that is the
 * whole point. A counter that ran its own transaction would commit the increment
 * independently of the document being named — so a parent transaction that later
 * rolls back leaves a code minted for nothing: a permanent gap in the sequence
 * and, worse, a code a user may already have been shown. Sharing the caller's
 * transaction makes the code and the thing it names commit or fail together.
 *
 * ⚠️ FIRESTORE ORDERING RULE: a transaction must do ALL reads before ANY writes.
 * This function reads. So call it BEFORE your first `tx.set`/`tx.update`, or
 * Firestore throws "Firestore transactions require all reads to be executed
 * before all writes" — at runtime, on the write path.
 *
 * Contention is handled by the SDK, which re-runs the whole transaction body on
 * ABORTED (default 5 attempts). Do NOT add a second retry wrapper: the SDK
 * already retries and a second one would compound. Note the callback must
 * therefore be idempotent,
 * which it is: every value is re-read on each attempt.
 */
export async function nextCode(
  tx: Transaction,
  def: CounterDef,
): Promise<string> {
  const ref = typedCollection(COUNTERS_COLLECTION, CounterSchema).doc(def.id)
  const current = (await tx.get(ref)).data()

  // First mint: seed the document from `def` so a fresh project needs no ops
  // step. Every later mint reads its format back off the document.
  if (!current) {
    const seeded: Counter = {
      id: def.id,
      prefix: def.prefix,
      width: def.width,
      value: 1,
    }
    tx.set(ref, seeded)
    return formatCode(seeded.prefix, seeded.width, seeded.value)
  }

  // The document is the authority, and a caller that disagrees with it is
  // REJECTED rather than silently ignored. Quietly preferring the stored format
  // would let a call site ship `width: 6`, see INV-0001 come back, and never
  // learn that its own argument does nothing — config that lies. Throwing is
  // also strictly safer than honouring the caller, which would re-format a live
  // sequence mid-flight and mint a duplicate-looking code.
  if (current.prefix !== def.prefix || current.width !== def.width) {
    throw new Error(
      `counter_format_conflict: counter "${def.id}" is stored as ` +
        `prefix="${current.prefix}" width=${current.width} but was called with ` +
        `prefix="${def.prefix}" width=${def.width}. The stored format wins; ` +
        `change the document, not the call site.`,
    )
  }

  const value = current.value + 1
  tx.set(ref, { ...current, value })
  return formatCode(current.prefix, current.width, value)
}
