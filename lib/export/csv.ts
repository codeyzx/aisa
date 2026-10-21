/**
 * CSV serialisation: RFC4180 quoting plus the formula-injection guard.
 *
 * Deliberately PURE and dependency-free — it imports nothing, not even from
 * this repo. Two reasons, both load-bearing:
 *
 * - A test can reach it. `lib/repos/*` sits behind `server-only` and the server
 *   credential boundary, so an escaper living beside the route would be
 *   unfalsifiable — the same trap as a `BATCH_LIMIT` in a repo. Here the guard
 *   below is proven by `csv.test.ts` rather than asserted by a comment.
 * - No dependency, zero-dep by design. ~15 lines of quoting is not worth
 *   pulling in a package.
 *
 * Rows arrive already stringified. This module does not know what an item is,
 * and must not learn: a date or an amount is spelled by `lib/format/*`, which
 * is the ONE place those are spelled for a reader.
 */

/**
 * Characters that make a leading cell a FORMULA when the file opens in Excel,
 * Sheets, or LibreOffice.
 *
 * `-` is in the list and looks like a false positive — a negative number is a
 * perfectly ordinary cell. It is not: `-1+1` is parsed as a formula just as
 * `=1+1` is, and the spreadsheet cannot tell the two intents apart either. The
 * cost of quoting a negative number is one invisible character; the cost of
 * missing one is arbitrary formula execution in a reader's spreadsheet.
 *
 * Tab and carriage return are here because they can PRECEDE one of the above
 * and still leave the cell parsed as a formula — a guard that only checked
 * position 0 for `=` is bypassed by writing `\t=1+1`.
 */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r']

/**
 * Neutralise a cell that a spreadsheet would otherwise EXECUTE.
 *
 * The fix is the single quote prefix: spreadsheets read it as "the rest is
 * literal text", render it invisibly, and strip it on copy. So `=1+1` opens as
 * the text `=1+1` rather than as `2`.
 *
 * This runs BEFORE quoting, not after. Reversed, the `'` would land outside the
 * RFC4180 quotes for any cell that needed them and the guard would be decorative
 * on exactly the cells most likely to be hostile.
 */
function defuseFormula(value: string): string {
  return FORMULA_TRIGGERS.some((trigger) => value.startsWith(trigger))
    ? `'${value}`
    : value
}

/**
 * Quote one cell per RFC4180: wrap in double quotes when the value contains a
 * comma, a double quote, or a newline, and double any embedded quote.
 *
 * Note this is a SEPARATE concern from `defuseFormula` and does not subsume it —
 * RFC4180 is about parsing the file back into cells, and formula injection
 * happens after that parse succeeds. A correctly quoted `=1+1` still executes.
 */
export function escapeCsvCell(value: string): string {
  const defused = defuseFormula(value)
  return /[",\r\n]/.test(defused)
    ? `"${defused.replaceAll('"', '""')}"`
    : defused
}

/** One CSV record: cells escaped, comma-joined, CRLF-terminated per RFC4180. */
export function toCsvRow(cells: readonly string[]): string {
  return `${cells.map(escapeCsvCell).join(',')}\r\n`
}

/**
 * The first cell of the row appended when a stream dies after the header.
 *
 * A streamed export cannot retract its 200 — the status line and the header row
 * are on the wire long before a row throws — so the ONLY place the truth can
 * still be told is inside the file itself. Without this a failed export is a
 * SHORTER file that parses perfectly, which is indistinguishable from a
 * successful export of fewer rows: the reader gets a spreadsheet that is simply
 * missing data and no reason to doubt it.
 *
 * Deliberately not a `#` comment: CSV has no comment convention, so a leading
 * `#` is just a data row wearing a disguise. This is a value a consumer can
 * check for exactly.
 */
export const CSV_TRUNCATION_MARKER = '__EXPORT_TRUNCATED__'

export interface CsvStreamOptions {
  /** Echoed into the truncation row so a partial file names its own log line. */
  correlationId: string
  /** Called with the mid-stream throw so the caller can log it. Kept a callback
   *  because this module imports nothing — see the file header. */
  onError?: (error: unknown) => void
}

/**
 * Stream a CSV header followed by one serialized item for each consumer pull.
 * The zero queue size prevents the source from running ahead of the download.
 *
 * A row source that throws MID-STREAM ends the file with a truncation row rather
 * than dying silently — see `CSV_TRUNCATION_MARKER`. The stream is then CLOSED,
 * not errored: erroring a `ReadableStream` clears its queue, which would discard
 * the very row that explains the failure, and a `<a download>` navigation would
 * still leave a partial file on disk with nothing in it to say so. Closing keeps
 * the marker, and the response's `x-correlation-id` ties it to the server log.
 */
export function toCsvStream<T>(
  rows: AsyncIterable<T>,
  header: readonly string[],
  toCells: (row: T) => readonly string[],
  options: CsvStreamOptions,
): ReadableStream<Uint8Array> {
  const iterator = rows[Symbol.asyncIterator]()
  const encoder = new TextEncoder()

  // Padded to the header width so the failure row cannot itself break a strict
  // parser — the one row that must survive being read.
  const truncationRow = () => {
    const cells = [CSV_TRUNCATION_MARKER, options.correlationId]
    while (cells.length < header.length) cells.push('')
    return toCsvRow(cells)
  }

  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        controller.enqueue(encoder.encode(toCsvRow(header)))
      },
      async pull(controller) {
        try {
          const next = await iterator.next()
          if (next.done) {
            controller.close()
            return
          }
          // `toCells` is inside the guard too: a serialization throw truncates
          // the file exactly as a read failure does, and is just as invisible.
          controller.enqueue(encoder.encode(toCsvRow(toCells(next.value))))
        } catch (error) {
          options.onError?.(error)
          controller.enqueue(encoder.encode(truncationRow()))
          controller.close()
        }
      },
      async cancel(reason) {
        await iterator.return?.(reason)
      },
    },
    { highWaterMark: 0 },
  )
}
