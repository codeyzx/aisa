import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_LOG_LEVEL,
  createLogger,
  log,
  setLogBindings,
  setLogLevel,
} from './index'

/**
 * The sink and the clock are injected, so these assert the actual emitted LINE
 * rather than a mock's call count — the BATCH_LIMIT rule: a load-bearing
 * constant a test cannot reach is unfalsifiable.
 */
function capture() {
  const lines: string[] = []
  return {
    lines,
    records: () =>
      lines.map((line) => JSON.parse(line) as Record<string, unknown>),
    write: (line: string) => lines.push(line),
    now: () => new Date('2026-07-17T00:00:00.000Z'),
  }
}

describe('createLogger', () => {
  it('emits one JSON line per event, carrying level, time and msg', () => {
    const sink = capture()
    createLogger({ write: sink.write, now: sink.now }).info('thing happened')

    expect(sink.lines).toHaveLength(1)
    expect(sink.records()[0]).toEqual({
      level: 'info',
      time: '2026-07-17T00:00:00.000Z',
      msg: 'thing happened',
    })
  })

  it('merges per-call fields into the line', () => {
    const sink = capture()
    createLogger({ write: sink.write, now: sink.now }).warn('slow', {
      durationMs: 1200,
    })

    expect(sink.records()[0]).toMatchObject({ level: 'warn', durationMs: 1200 })
  })

  it('drops lines below the threshold', () => {
    const sink = capture()
    const logger = createLogger({ level: 'warn', write: sink.write })
    logger.debug('nope')
    logger.info('nope')
    logger.warn('yes')
    logger.error('yes')

    expect(sink.records().map((record) => record.level)).toEqual([
      'warn',
      'error',
    ])
  })

  it('defaults to DEFAULT_LOG_LEVEL, which drops debug', () => {
    const sink = capture()
    const logger = createLogger({ write: sink.write })
    logger.debug('nope')
    logger.info('yes')

    expect(DEFAULT_LOG_LEVEL).toBe('info')
    expect(sink.records().map((record) => record.msg)).toEqual(['yes'])
  })

  it('child() binds fields onto every subsequent line', () => {
    const sink = capture()
    const logger = createLogger({ write: sink.write, now: sink.now })
    const child = logger.child({ cid: 'cid-123' })
    child.info('first')
    child.error('second')

    expect(sink.records().map((record) => record.cid)).toEqual([
      'cid-123',
      'cid-123',
    ])
  })

  it('child() does not leak its bindings back into the parent', () => {
    const sink = capture()
    const logger = createLogger({ write: sink.write, now: sink.now })
    logger.child({ cid: 'cid-123' }).info('bound')
    logger.info('unbound')

    expect(sink.records()[1]).not.toHaveProperty('cid')
  })

  it('child() inherits the parent threshold', () => {
    const sink = capture()
    const child = createLogger({ level: 'error', write: sink.write }).child({
      cid: 'cid-123',
    })
    child.info('nope')
    child.error('yes')

    expect(sink.records().map((record) => record.msg)).toEqual(['yes'])
  })

  it('serializes an Error field instead of logging an empty object', () => {
    // The regression this guards: `JSON.stringify(new Error('boom'))` is '{}',
    // so an unserialized error logs the ABSENCE of the thing being logged.
    const sink = capture()
    createLogger({ write: sink.write, now: sink.now }).error('failed', {
      error: new Error('boom'),
    })

    const logged = sink.records()[0].error as Record<string, unknown>
    expect(logged.name).toBe('Error')
    expect(logged.message).toBe('boom')
  })

  it('omits the stack at the default level — an environment policy, not a redactor', () => {
    // A stack in stdout leaks absolute filesystem paths to everyone who reads the
    // aggregator. The default line stays diagnosable (name + message + code)
    // without it; `LOG_LEVEL=debug` is the opt-in, and Sentry keeps full stacks.
    const sink = capture()
    createLogger({ write: sink.write, now: sink.now }).error('failed', {
      error: new Error('boom'),
    })

    const logged = sink.records()[0].error as Record<string, unknown>
    expect(logged).not.toHaveProperty('stack')
    expect(sink.lines[0]).not.toContain('index.test.ts')
  })

  it('emits a bounded stack when the process threshold is debug', () => {
    const sink = capture()
    const error = new Error('boom')
    error.stack = 'x'.repeat(2000)

    setLogLevel('debug')
    createLogger({ write: sink.write, now: sink.now }).error('failed', {
      error,
    })
    setLogLevel(DEFAULT_LOG_LEVEL)

    const logged = sink.records()[0].error as Record<string, unknown>
    expect(logged.stack).toBe(`${'x'.repeat(512)}…(2000 chars)`)
  })

  it("keeps an error's `code` — the id Firebase and Node errors carry", () => {
    const sink = capture()
    const error = Object.assign(new Error('expired'), {
      code: 'auth/id-token-expired',
    })
    createLogger({ write: sink.write, now: sink.now }).error('failed', {
      error,
    })

    expect(sink.records()[0].error).toMatchObject({
      code: 'auth/id-token-expired',
    })
  })

  it('truncates a long string and states its original length', () => {
    const sink = capture()
    createLogger({ write: sink.write, now: sink.now }).info('big', {
      blob: 'a'.repeat(2048),
    })

    // The marker is what separates truncation from real content: a reader can
    // tell 512 a's from a value that genuinely was 512 a's.
    expect(sink.records()[0].blob).toBe(`${'a'.repeat(512)}…(2048 chars)`)
  })

  it('keeps a string that sits exactly on the limit intact', () => {
    const sink = capture()
    createLogger({ write: sink.write, now: sink.now }).info('edge', {
      blob: 'a'.repeat(512),
    })

    expect(sink.records()[0].blob).toBe('a'.repeat(512))
  })

  it('truncates a long array and names how many entries were dropped', () => {
    const sink = capture()
    createLogger({ write: sink.write, now: sink.now }).info('many', {
      ids: Array.from({ length: 40 }, (_, index) => index),
    })

    const ids = sink.records()[0].ids as unknown[]
    expect(ids).toHaveLength(33)
    expect(ids[31]).toBe(31)
    expect(ids[32]).toBe('…(8 more items)')
  })

  it('replaces values nested past the depth limit with a marker', () => {
    const sink = capture()
    createLogger({ write: sink.write, now: sink.now }).info('deep', {
      a: { b: { c: { d: { e: 'unreachable' } } } },
    })

    // Four object levels below the record survive; the fifth is a marker.
    expect(sink.records()[0].a).toEqual({ b: { c: { d: '[Depth]' } } })
    expect(sink.lines[0]).not.toContain('unreachable')
  })

  it('falls back to a routable line rather than emitting an oversize one', () => {
    // A half-JSON line breaks every parser downstream, so the oversize case
    // degrades to a COMPLETE record that still routes: level, time, msg, cid.
    const sink = capture()
    const huge: Record<string, string> = {}
    for (let index = 0; index < 40; index += 1) {
      huge[`field${index}`] = 'z'.repeat(500)
    }
    createLogger({ write: sink.write, now: sink.now })
      .child({ cid: 'cid-123' })
      .error('too big', huge)

    const record = sink.records()[0]
    expect(record).toMatchObject({
      level: 'error',
      time: '2026-07-17T00:00:00.000Z',
      msg: 'too big',
      cid: 'cid-123',
    })
    expect(record).not.toHaveProperty('field0')
    expect(record.logError).toMatch(
      /^log fields dropped: \d{5} bytes exceeds the 8192-byte line limit$/,
    )
    expect(sink.lines[0].length).toBeLessThanOrEqual(8192)
  })

  it('survives a circular field rather than throwing inside a catch block', () => {
    // apiFailFrom logs from a catch with an arbitrary thrown value; a throw here
    // would replace the real error with a logging error and lose the incident.
    const sink = capture()
    const circular: Record<string, unknown> = { name: 'loop' }
    circular.self = circular

    expect(() =>
      createLogger({ write: sink.write, now: sink.now }).error('failed', {
        circular,
      }),
    ).not.toThrow()
    expect(sink.records()[0]).toMatchObject({
      msg: 'failed',
      circular: { name: 'loop', self: '[Circular]' },
    })
  })

  it('still emits a usable line when a field cannot be serialized at all', () => {
    const sink = capture()
    const hostile = {
      get boom(): never {
        throw new Error('getter exploded')
      },
    }

    expect(() =>
      createLogger({ write: sink.write, now: sink.now }).error('failed', {
        hostile,
      }),
    ).not.toThrow()
    expect(sink.records()[0]).toEqual({
      level: 'error',
      time: '2026-07-17T00:00:00.000Z',
      msg: 'failed',
      logError: 'log record could not be serialized',
    })
  })

  it('takes a thunk level, resolved per emit so a later setLogLevel is honoured', () => {
    const sink = capture()
    let level: 'debug' | 'info' | 'warn' | 'error' = 'error'
    const logger = createLogger({ level: () => level, write: sink.write })

    logger.info('dropped')
    level = 'info'
    logger.info('kept')

    expect(sink.records().map((record) => record.msg)).toEqual(['kept'])
  })

  it('importing lib/log reads NO env — the property that keeps it testable', () => {
    // lib/api/response.ts imports this module and every route answers through
    // it, so if lib/log imported `lib/env/server` it would drag the whole
    // server-only config boundary into every unit test. The level is PUSHED IN
    // at boot (setLogLevel) precisely so this import stays free. No server env
    // is set in this suite, so the fact that this file collected at all is the
    // assertion — this case states it out loud so a future config import fails
    // here.
    expect(() => log.error('no env needed')).not.toThrow()
  })

  it('setLogLevel retunes the process-wide log and its existing children', () => {
    const lines: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((line: string) => {
      lines.push(line)
    })
    const child = log.child({ cid: 'cid-1' })

    setLogLevel('error')
    child.info('dropped after boot set the level')
    setLogLevel('debug')
    child.info('kept')
    setLogLevel(DEFAULT_LOG_LEVEL)
    spy.mockRestore()

    const kept = lines.map((line) => JSON.parse(line) as { msg: string })
    expect(kept.map((record) => record.msg)).toEqual(['kept'])
  })

  it('setLogBindings reaches a child of the process log created BEFORE it ran', () => {
    // The point of the thunk: a route module builds `log.child({ cid })` at
    // import time, which can be before register() has bound the deploy identity.
    const lines: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((line: string) => {
      lines.push(line)
    })
    const child = log.child({ cid: 'cid-1' })

    setLogBindings({ sha: 'abc123', env: 'test' })
    child.info('bound at boot')
    // A boot binding must never overwrite what a call site said.
    child.info('call site wins', { sha: 'from-call-site' })
    setLogBindings({})
    child.info('after unbind')
    spy.mockRestore()

    const records = lines.map(
      (line) => JSON.parse(line) as Record<string, unknown>,
    )
    expect(records[0]).toMatchObject({
      sha: 'abc123',
      env: 'test',
      cid: 'cid-1',
    })
    expect(records[1].sha).toBe('from-call-site')
    expect(records[2]).not.toHaveProperty('sha')
  })

  it('carries no PII deny-list: fields are emitted verbatim', () => {
    // Asserts the ABSENCE of a redactor. A re-added deny-list
    // fails here instead of shipping green under a claim it cannot honour. The
    // guard against PII in logs is the COMPLIANCE rule at the call site, not a
    // filter — so this logger must pass a field named `password` straight
    // through, and that is the point, not an oversight.
    const sink = capture()
    createLogger({ write: sink.write, now: sink.now }).info('verbatim', {
      password: 'hunter2',
      email: 'a@b.test',
    })

    expect(sink.records()[0]).toMatchObject({
      password: 'hunter2',
      email: 'a@b.test',
    })
  })
})
