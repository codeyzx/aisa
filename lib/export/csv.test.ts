import { describe, expect, it, vi } from 'vitest'

import {
  CSV_TRUNCATION_MARKER,
  escapeCsvCell,
  toCsvRow,
  toCsvStream,
} from './csv'

describe('escapeCsvCell — RFC4180 quoting', () => {
  it('leaves an ordinary cell alone', () => {
    // The common case must stay byte-identical, or every cell in the file pays
    // for the hostile one.
    expect(escapeCsvCell('Widget')).toBe('Widget')
  })

  it('quotes a cell containing a comma', () => {
    // Unquoted, this is two cells and every column after it shifts left — the
    // file parses fine and describes the wrong thing.
    expect(escapeCsvCell('Widget, large')).toBe('"Widget, large"')
  })

  it('doubles an embedded quote and wraps the cell', () => {
    expect(escapeCsvCell('a "quoted" word')).toBe('"a ""quoted"" word"')
  })

  it('quotes a cell containing a newline', () => {
    // A bare newline mid-cell ends the RECORD; the tail becomes a short row.
    expect(escapeCsvCell('line one\nline two')).toBe('"line one\nline two"')
  })
})

describe('escapeCsvCell — formula injection (FORK 8)', () => {
  it('defuses every trigger character', () => {
    // The whole point of the guard: these open as text, not as a computed value
    // or a remote fetch. `=1+1` rendering as `2` is the observable failure.
    expect(escapeCsvCell('=1+1')).toBe("'=1+1")
    expect(escapeCsvCell('+1+1')).toBe("'+1+1")
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)")
  })

  it('defuses a leading minus, which reads like a false positive and is not', () => {
    // `-1+1` is evaluated as a formula exactly as `=1+1` is. Quoting a negative
    // number costs one invisible character; missing one costs execution.
    expect(escapeCsvCell('-1+1')).toBe("'-1+1")
  })

  it('defuses a trigger hidden behind a leading tab', () => {
    // The bypass a position-0 `=` check misses: the spreadsheet still parses
    // this as a formula. This assertion is why FORMULA_TRIGGERS carries \t.
    //
    // No RFC4180 quotes here, and that is correct rather than an oversight: a
    // tab is not one of the four characters (`"` `,` CR LF) that break the
    // record grammar, so quoting it would be noise. The two concerns are
    // genuinely separate and this cell needs only one of them.
    expect(escapeCsvCell('\t=1+1')).toBe("'\t=1+1")
  })

  it('defuses BEFORE quoting, so the guard survives a cell that also needs quotes', () => {
    // Order is the bug this pins. Quote-then-defuse puts the `'` OUTSIDE the
    // RFC4180 quotes, where the parser reads it as part of the previous field
    // separator — leaving the formula live in exactly the hostile cells.
    expect(escapeCsvCell('=HYPERLINK("http://evil","click")')).toBe(
      '"\'=HYPERLINK(""http://evil"",""click"")"',
    )
  })
})

describe('toCsvRow', () => {
  it('joins escaped cells and terminates with CRLF', () => {
    expect(toCsvRow(['id-1', 'Widget, large', '=1+1'])).toBe(
      'id-1,"Widget, large",\'=1+1\r\n',
    )
  })

  it('emits an empty field rather than dropping it', () => {
    // A dropped empty cell shifts every column after it — the same silent
    // corruption as an unquoted comma, from the opposite direction.
    expect(toCsvRow(['a', '', 'c'])).toBe('a,,c\r\n')
  })
})

describe('toCsvStream', () => {
  it('writes the header first and reads one source row for each pull', async () => {
    const iterator = {
      next: vi
        .fn<() => Promise<IteratorResult<string>>>()
        .mockResolvedValueOnce({ value: 'first', done: false })
        .mockResolvedValueOnce({ value: 'second', done: false }),
    }
    const rows = { [Symbol.asyncIterator]: () => iterator }
    const reader = toCsvStream(rows, ['Name'], (name) => [name], {
      correlationId: 'cid-abc',
    }).getReader()
    const decoder = new TextDecoder()

    const header = await reader.read()
    expect(header.done).toBe(false)
    expect(decoder.decode(header.value)).toBe('Name\r\n')
    expect(iterator.next).not.toHaveBeenCalled()

    const first = await reader.read()
    expect(first.done).toBe(false)
    expect(decoder.decode(first.value)).toBe('first\r\n')
    expect(iterator.next).toHaveBeenCalledTimes(1)

    const second = await reader.read()
    expect(decoder.decode(second.value)).toBe('second\r\n')
    expect(iterator.next).toHaveBeenCalledTimes(2)
  })

  it('returns the source iterator when the download is cancelled', async () => {
    const iterator = {
      next: vi.fn<() => Promise<IteratorResult<string>>>(),
      return: vi.fn<() => Promise<IteratorResult<string>>>().mockResolvedValue({
        value: undefined,
        done: true,
      }),
    }
    const rows = { [Symbol.asyncIterator]: () => iterator }
    const reader = toCsvStream(rows, ['Name'], (name) => [name], {
      correlationId: 'cid-abc',
    }).getReader()

    await reader.cancel('connection closed')

    expect(iterator.return).toHaveBeenCalledWith('connection closed')
  })

  /**
   * The mid-stream failure contract. The 200 and the header row are on the
   * wire before any row is read, so nothing can retract them. What must NOT
   * happen is the file simply STOPPING: a shorter CSV parses perfectly and is
   * indistinguishable from a successful export of fewer rows.
   */
  it('ends the file with a truncation row carrying the cid when a row read throws', async () => {
    const iterator = {
      next: vi
        .fn<() => Promise<IteratorResult<string>>>()
        .mockResolvedValueOnce({ value: 'first', done: false })
        .mockRejectedValueOnce(new Error('firestore stream died')),
    }
    const rows = { [Symbol.asyncIterator]: () => iterator }
    const onError = vi.fn()
    const reader = toCsvStream(rows, ['Name', 'Value'], (name) => [name, '1'], {
      correlationId: 'cid-truncated',
      onError,
    }).getReader()
    const decoder = new TextDecoder()

    expect(decoder.decode((await reader.read()).value)).toBe('Name,Value\r\n')
    expect(decoder.decode((await reader.read()).value)).toBe('first,1\r\n')

    // The failure row, padded to the header width so a strict parser can still
    // read the one row that explains the problem.
    const marker = await reader.read()
    expect(marker.done).toBe(false)
    expect(decoder.decode(marker.value)).toBe(
      `${CSV_TRUNCATION_MARKER},cid-truncated\r\n`,
    )

    // CLOSED, not errored: erroring clears the queue and would discard the
    // marker, leaving a partial file with nothing in it to say so.
    expect((await reader.read()).done).toBe(true)

    // And the server still learns about it, keyed to the same id.
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
  })

  it('truncates observably when the row SERIALIZER throws, not just the source', async () => {
    // A toCells bug truncates the file exactly as a read failure does, and is
    // just as invisible to whoever opens the spreadsheet.
    const iterator = {
      next: vi
        .fn<() => Promise<IteratorResult<string>>>()
        .mockResolvedValue({ value: 'boom', done: false }),
    }
    const rows = { [Symbol.asyncIterator]: () => iterator }
    const reader = toCsvStream(
      rows,
      ['Name'],
      () => {
        throw new Error('bad cell')
      },
      { correlationId: 'cid-serializer' },
    ).getReader()
    const decoder = new TextDecoder()

    expect(decoder.decode((await reader.read()).value)).toBe('Name\r\n')
    expect(decoder.decode((await reader.read()).value)).toBe(
      `${CSV_TRUNCATION_MARKER},cid-serializer\r\n`,
    )
    expect((await reader.read()).done).toBe(true)
  })
})
