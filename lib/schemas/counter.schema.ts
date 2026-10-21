import * as z from 'zod'

/**
 * A single auto-increment bucket backing human-readable codes (`INV-0001`).
 *
 * One document per sequence, id = the counter's name (`invoice`). Unlike every
 * other entity here it carries no timestamps and is never listed, paginated or
 * shown to a user: it is infrastructure for `lib/repos/counter.repo.ts`, which
 * is the only thing that should ever write it.
 *
 * `prefix` and `width` live HERE, on the document, rather than being passed by
 * each caller — the sequence owns its own format. Two call sites disagreeing
 * about the width of one sequence is a bug that stays invisible until the
 * sequence crosses a power of ten (`INV-9999` -> `INV-10000`), which is years
 * after either call site was written and impossible to attribute by then.
 */
export const CounterSchema = z.object({
  /** The counter's name, e.g. `invoice`. Equals the document id. */
  id: z.string().min(1),
  /** Literal text before the number, e.g. `INV-`. May be empty. */
  prefix: z.string(),
  /** Zero-padding width. NOT a maximum — see lib/data/counters.ts:formatCode. */
  width: z.number().int().min(1).max(12),
  /** The last value handed out. The next mint is `value + 1`. */
  value: z.number().int().min(0),
})

export type Counter = z.infer<typeof CounterSchema>
