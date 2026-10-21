/**
 * The wire schema of a snapshot directory — the boundary `restore.ts` parses at.
 *
 * WHY THIS IS A SCHEMA AND NOT AN `as` CAST: a snapshot directory is EXTERNAL
 * INPUT. It is a pile of hand-editable JSON on disk, and `restore.ts` feeds its
 * values straight into `db.collection(id)`, `collection.doc(docId)` and — with
 * `--wipe` — `db.recursiveDelete(...)`. An `as Manifest` cast is a promise the
 * compiler cannot keep: it makes a hand-edited file choose which collections get
 * DELETED, while the plan the operator confirmed printed something else.
 *
 * So the file is parsed, not asserted, and it is parsed BEFORE any Firestore
 * client exists (see `restore.ts`) — a corrupt snapshot must fail at the
 * boundary, never halfway through a restore.
 */
import * as z from 'zod'

/**
 * One segment of a Firestore path: a collection id, or a document id.
 *
 * `/` IS THE WHOLE POINT OF THIS CONSTRAINT. Firestore path strings are
 * slash-separated, so an id containing one silently RE-TARGETS the operation:
 * `db.collection('assets/AST-1/audit')` addresses a sub-collection the plan never
 * printed, and under `--wipe` that is what `recursiveDelete` walks and destroys.
 * The same string is also interpolated into a file path (`<dir>/<id>.json`),
 * where a slash escapes the snapshot directory. `.` and `..` are rejected for the
 * second half of that reason: they are traversal segments in a path context (and
 * Firestore rejects them as ids anyway), so accepting them can only ever address
 * something other than what it reads like.
 *
 * Everything else is left to Firestore. This is a boundary check against
 * re-targeting, not a re-implementation of Firestore's id rules — those are
 * enforced by the SDK, and duplicating them here would be a second source of
 * truth that goes stale.
 */
const PathSegmentSchema = z
  .string()
  .min(1, 'must not be empty')
  .refine((id) => !id.includes('/'), {
    message: "must not contain '/' — that would re-target the operation",
  })
  .refine((id) => id !== '.' && id !== '..', {
    message: "must not be '.' or '..' — a path-traversal segment",
  })

/** `<dir>/_manifest.json` — the list of collection files to read. */
export const ManifestSchema = z.object({
  format: z.number(),
  project: z.string().min(1),
  collections: z.array(
    z.object({
      id: PathSegmentSchema,
      count: z.number(),
    }),
  ),
})

export type Manifest = z.infer<typeof ManifestSchema>

/** `<dir>/<collectionId>.json` — one collection's documents, codec-encoded. */
export const CollectionFileSchema = z.object({
  collection: z.string().min(1),
  // `data` stays `unknown` on purpose: its shape is the codec's business
  // (`codec.ts` decodes the `__t` tags), not this boundary's.
  docs: z.array(z.object({ id: PathSegmentSchema, data: z.unknown() })),
})

export type CollectionFile = z.infer<typeof CollectionFileSchema>

/**
 * Parse one snapshot file, or abort loudly naming the FILE and the issue path.
 *
 * Both failure modes are handled here because both mean the same thing to an
 * operator — this snapshot cannot be trusted — and neither may be allowed to
 * surface as a half-finished restore: malformed JSON (a truncated file) and a
 * well-formed file whose contents are not a snapshot.
 */
export function parseSnapshotFile<T extends z.ZodType>(
  schema: T,
  contents: string,
  file: string,
): z.infer<T> {
  let json: unknown
  try {
    json = JSON.parse(contents)
  } catch (error) {
    console.error(
      `\nRefusing to restore: ${file} is not valid JSON.\n` +
        `  ${error instanceof Error ? error.message : String(error)}\n` +
        'Nothing was read from or written to Firestore.',
    )
    process.exit(1)
  }

  const result = schema.safeParse(json)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path.map(String).join('.')
        return `  ${path === '' ? '(root)' : path}: ${issue.message}`
      })
      .join('\n')
    console.error(
      `\nRefusing to restore: ${file} is not a valid snapshot file.\n` +
        `${issues}\n` +
        'Nothing was read from or written to Firestore.',
    )
    process.exit(1)
  }
  return result.data
}
