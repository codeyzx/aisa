/**
 * Structured JSON logger — one line per event, zero dependency (builtin
 * `JSON` + `console`, no pino).
 *
 * ============================== COMPLIANCE ==============================
 * NEVER pass PII as log fields. Log IDS AND OUTCOMES — a uid, a cid, a code,
 * a duration — never an email, a phone number, a token, a password, or a
 * request body.
 *
 * There is deliberately NO deny-list of field names here, and there must never
 * be one: a name-matching redactor misses a key and the log then lies QUIETLY,
 * worse than claiming no protection at all. Scrub only leaks ACTUALLY OBSERVED,
 * on the path where they were seen, and name the leak in the comment; with no
 * such leak, this module ships zero scrubbers.
 * =======================================================================
 *
 * Correlation: this logger CONSUMES the cid the envelope already owns
 * (lib/api/cid.ts) via `child({ cid })`. It does NOT mint an id of its own,
 * which keeps it one system, not two.
 */

export { LOG_LEVELS } from './levels'
export type { LogLevel } from './levels'

import type { LogLevel } from './levels'

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

/**
 * The threshold used until `setLogLevel` says otherwise. Matches
 * `lib/env/server.ts`'s `LOG_LEVEL` default, deliberately: the two agree, so a
 * process that never calls `setLogLevel` (a unit test) behaves like one that did.
 */
export const DEFAULT_LOG_LEVEL: LogLevel = 'info'

let processLevel: LogLevel = DEFAULT_LOG_LEVEL

/**
 * Set the threshold for the process-wide `log`. Called ONCE, from
 * `instrumentation.ts`'s register(), with `getLoggingConfig().level`.
 *
 * The level is PUSHED IN, not read from `lib/env/server` here: that module is
 * `server-only` and importing it would drag the whole server config boundary
 * into this leaf module (imported by `lib/api/response.ts`, and thus every
 * route), making it unimportable from a unit test and from the edge runtime. A
 * process where register() never ran (a test, the edge runtime) keeps
 * DEFAULT_LOG_LEVEL.
 */
export function setLogLevel(level: LogLevel): void {
  processLevel = level
}

let processBindings: LogFields = {}

/**
 * Fields the process-wide `log` carries on EVERY line — the deploy identity
 * (`sha`, `env`), bound once from `instrumentation.ts`'s register().
 *
 * PUSHED IN for exactly the reason `setLogLevel` is: the values live behind
 * `lib/env/server` (`server-only`) and this leaf module must stay importable from
 * a unit test and from the edge runtime. Resolved PER EMIT, so a child logger
 * built at module load — before register() ran — still carries them.
 *
 * These sit BELOW per-call fields in the record order, so a boot binding can
 * never overwrite what a call site said.
 */
export function setLogBindings(fields: LogFields): void {
  processBindings = { ...fields }
}

/** Structured fields. Values are ids and outcomes — see the COMPLIANCE rule above. */
export type LogFields = Record<string, unknown>

export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  /**
   * A logger that carries `bindings` on every line. The canonical binding is
   * `child({ cid })` at a request boundary: bind once, and every line for that
   * request joins to the response the client holds — which is the whole point
   * of the cid, and why no call site should re-pass it by hand.
   */
  child(bindings: LogFields): Logger
}

export interface CreateLoggerOptions {
  /**
   * Lines below this are dropped. Defaults to `DEFAULT_LOG_LEVEL`.
   *
   * A THUNK is allowed, and is how the process-wide `log` tracks
   * `setLogLevel`: resolved per emit, so a logger built at module load still
   * honours a level set later at boot. A plain value is resolved once, which is
   * what a test wants.
   */
  level?: LogLevel | (() => LogLevel)
  /**
   * Fields present on every line from this logger.
   *
   * A THUNK is allowed for the same reason the level accepts one, and is how the
   * process-wide `log` tracks `setLogBindings`: resolved per emit, so a child
   * built at module load carries bindings set later at boot.
   */
  bindings?: LogFields | (() => LogFields)
  /** Sink. Injected so a test can read the line instead of the terminal. */
  write?: (line: string) => void
  /** Clock. Injected so a test can assert an exact timestamp. */
  now?: () => Date
}

/**
 * The bounds on one emitted line. A log line is a TRANSPORT record, not a heap
 * dump: an unbounded field (an SDK error holding a whole HTTP response, a base64
 * payload, a 50k-row array) blows past the per-line limit of every collector and
 * gets the line dropped or split — i.e. logging more loses more. Each bound
 * replaces the excess with a MARKER that states what was cut, so a reader can
 * always tell truncation from real content.
 */
const MAX_DEPTH = 4
const MAX_STRING_CHARS = 512
const MAX_ARRAY_ITEMS = 32
const MAX_LINE_BYTES = 8192

const DEPTH_MARKER = '[Depth]'
const CIRCULAR_MARKER = '[Circular]'

const encoder = new TextEncoder()
const byteLength = (line: string) => encoder.encode(line).length

/**
 * An `Error` JSON.stringify's to `{}` — the message and stack are non-enumerable
 * — so an unserialized error field would log the ABSENCE of the thing being
 * logged. This is not a redactor: it makes an Error representable at all.
 *
 * `code` is included when the error carries a string/number one, because Firebase
 * and Node errors put the actionable identity there (`auth/id-token-expired`,
 * `ENOTFOUND`) — an id, which is exactly what this logger is for.
 *
 * THE STACK IS NOT EMITTED BY DEFAULT, and that is an environment policy, not a
 * redactor: a stack in stdout leaks absolute filesystem paths and, for some SDK
 * errors, values embedded in frame arguments — to whoever reads the log
 * aggregator, which is a wider audience than whoever may see the incident. The
 * operator who actually needs one turns on `LOG_LEVEL=debug` (an env key the app
 * ALREADY owns and validates — no new key for this), and the optional Sentry
 * capture keeps full stacks whenever it is configured. The threshold consulted is
 * the PROCESS one, so the policy is a property of the deployment rather than of
 * whichever logger happened to write the line — including `lib/data/audit.ts`,
 * whose fixed `debug` threshold exists to keep audit lines emitting under
 * `LOG_LEVEL=warn`, and must not double as a stack opt-in. Audit lines lose
 * nothing by it: they carry ids and outcomes, not errors.
 */
function serializeError(error: Error): LogFields {
  const code: unknown = (error as { code?: unknown }).code
  return {
    name: error.name,
    message: error.message,
    ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
    // Bounded like any other string by `boundValue` below.
    ...(processLevel === 'debug' ? { stack: error.stack } : {}),
  }
}

/**
 * One value, reduced to something JSON-safe and bounded. Recursive rather than a
 * `JSON.stringify` replacer because depth is not observable from a replacer, and
 * depth is the bound that matters most: it is what stops one nested SDK object
 * from dragging its entire object graph into the line.
 *
 * `toJSON` is honoured first so a Date (or a Firestore Timestamp) still
 * serializes the way `JSON.stringify` alone would.
 */
function boundValue(value: unknown, depth: number, seen: Set<object>): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') {
    return value.length > MAX_STRING_CHARS
      ? `${value.slice(0, MAX_STRING_CHARS)}…(${value.length} chars)`
      : value
  }
  if (value === null || typeof value !== 'object') return value

  // Cycles are the realistic case here (an SDK error holding a response holding
  // a request). Tracked along the CURRENT PATH, so the same object appearing
  // twice side by side is logged twice rather than mislabelled circular.
  if (seen.has(value)) return CIRCULAR_MARKER
  if (depth >= MAX_DEPTH) return DEPTH_MARKER

  seen.add(value)
  try {
    if (value instanceof Error) {
      return boundValue(serializeError(value), depth, seen)
    }
    const toJSON = (value as { toJSON?: unknown }).toJSON
    if (typeof toJSON === 'function') {
      return boundValue(
        (toJSON as (this: unknown) => unknown).call(value),
        depth,
        seen,
      )
    }
    if (Array.isArray(value)) {
      const kept = value
        .slice(0, MAX_ARRAY_ITEMS)
        .map((item) => boundValue(item, depth + 1, seen))
      return value.length > MAX_ARRAY_ITEMS
        ? [...kept, `…(${value.length - MAX_ARRAY_ITEMS} more items)`]
        : kept
    }
    const bounded: LogFields = {}
    for (const [key, item] of Object.entries(value)) {
      bounded[key] = boundValue(item, depth + 1, seen)
    }
    return bounded
  } finally {
    seen.delete(value)
  }
}

/**
 * Stringify one record, safely and within `MAX_LINE_BYTES`.
 *
 * THIS FUNCTION MUST NEVER THROW. `apiFailFrom` calls it from a CATCH block with
 * an arbitrary thrown value, so a throw in here would replace the real error with
 * a logging error and lose the incident entirely — hence the try/catch around
 * every serialization step, including the fallbacks, and a last resort built from
 * literals alone.
 *
 * `base` (level/time/msg + bindings) is passed separately from `fields` so an
 * oversize line can degrade to a record that still ROUTES — same level, same
 * time, same msg, same cid — instead of a silently truncated JSON string, which
 * would break every parser downstream.
 */
function stringify(base: LogFields, fields?: LogFields): string {
  try {
    const line = JSON.stringify(
      boundValue({ ...base, ...fields }, 0, new Set()),
    )
    const size = byteLength(line)
    if (size <= MAX_LINE_BYTES) return line
    const dropped = JSON.stringify({
      ...(boundValue(base, 0, new Set()) as LogFields),
      logError: `log fields dropped: ${size} bytes exceeds the ${MAX_LINE_BYTES}-byte line limit`,
    })
    if (byteLength(dropped) <= MAX_LINE_BYTES) return dropped
    // Even the bindings do not fit: keep only what a collector routes on.
    return JSON.stringify({
      level: base.level,
      time: base.time,
      msg: base.msg,
      logError: `log record dropped: ${size} bytes exceeds the ${MAX_LINE_BYTES}-byte line limit`,
    })
  } catch {
    return JSON.stringify({
      level: base.level,
      time: base.time,
      msg: base.msg,
      logError: 'log record could not be serialized',
    })
  }
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const level = options.level ?? DEFAULT_LOG_LEVEL
  const resolveLevel = () => (typeof level === 'function' ? level() : level)
  const bindings = options.bindings ?? {}
  const resolveBindings = () =>
    typeof bindings === 'function' ? bindings() : bindings
  // Default sink is stdout via console.log for every level, including `error`;
  // the `level` field carries severity, so splitting across stdout/stderr would
  // only interleave two pipes and corrupt line order.
  const write = options.write ?? ((line: string) => console.log(line))
  const now = options.now ?? (() => new Date())

  function emit(entry: LogLevel, message: string, fields?: LogFields): void {
    if (LEVEL_RANK[entry] < LEVEL_RANK[resolveLevel()]) return
    // Order matters: `level`/`time`/`msg` first for readability, bindings next,
    // and per-call fields last so a call site can override a binding knowingly.
    // The split is also what an oversize line degrades to — see `stringify`.
    write(
      stringify(
        {
          level: entry,
          time: now().toISOString(),
          msg: message,
          ...resolveBindings(),
        },
        fields,
      ),
    )
  }

  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    child: (childBindings) =>
      createLogger({
        ...options,
        level,
        // A thunk, so a lazy parent stays lazy through any depth of child.
        bindings: () => ({ ...resolveBindings(), ...childBindings }),
      }),
  }
}

/**
 * The process-wide logger. A route binds its request to it with
 * `log.child({ cid })` rather than calling it directly.
 *
 * Its threshold AND its bindings are thunks, so `setLogLevel`/`setLogBindings` at
 * boot reach this logger and every child already derived from it.
 */
export const log = createLogger({
  level: () => processLevel,
  bindings: () => processBindings,
})
