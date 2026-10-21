/**
 * A stand-in for `aisa-api` that the dashboard container can reach, so the
 * write buttons can be driven in E2E.
 *
 * WHAT IT PROVES AND WHAT IT CANNOT: every dashboard write is a server action
 * that calls `aisa-api` (`features/aisa/aisa.action.ts`); Next never writes an
 * AISA document itself. This mock records each call the container makes —
 * method, path, the `X-AISA-Key` it sent, and the parsed body — and answers the
 * way the real routes do (`services/api/aisa/main.py`). A spec can then assert
 * the exact request a click produced, and make the next call fail to prove the
 * API's own refusal reaches the screen verbatim. It writes NOTHING to
 * Firestore, so the end state of a write (the changed proposal, the history row)
 * is `aisa-api`'s to prove in pytest and in production, never this suite's.
 *
 * WHERE IT LISTENS: `AISA_API_URL`, the same variable the container was started
 * with. `scripts/e2e-fast.ts` sets it per shard (`127.0.0.1:8791` upward), so
 * write specs run on any shard count; outside the fast runner both sides fall
 * back to `DEFAULT_AISA_API_URL`. The container runs with `--network host`, so
 * the host's loopback is the container's loopback.
 *
 * It runs inside the Playwright worker (see `fixtures.ts`), which is what lets a
 * test read the recorded calls directly instead of through a second process.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http'

import {
  DEFAULT_AISA_API_KEY,
  DEFAULT_AISA_API_URL,
} from '../../scripts/_container.ts'

/** The address the container calls, and the key it sends. */
export const MOCK_URL = new URL(
  process.env.AISA_API_URL ?? DEFAULT_AISA_API_URL,
)
export const EXPECTED_KEY = process.env.AISA_API_KEY ?? DEFAULT_AISA_API_KEY

/** A multipart file field, as recorded (the bytes themselves are not kept). */
export interface RecordedFile {
  fileName: string
  type: string
  size: number
  /** First bytes, enough to tell a PDF (`%PDF`) from anything else. */
  head: string
}

export interface RecordedCall {
  method: string
  path: string
  /** The `X-AISA-Key` header as received, or null when it was absent. */
  key: string | null
  contentType: string | null
  /** Parsed JSON, a field map for multipart, or null for an empty body. */
  body: unknown
}

/** A refusal the way FastAPI words one: a status and `{detail}`. */
export interface Refusal {
  status: number
  detail: string
}

export interface Answer {
  status: number
  body: unknown
}

/** Proposal id `/intake/upload` answers with; a seeded queued upload. */
export const UPLOAD_ANSWER_ID = 'upload-seedlogistiknusa'

/**
 * The links `GET /api/proposals/{id}/deck-url` answers with. They point at the
 * real hosts the dashboard's `frame-src` allows, so a spec intercepts them with
 * `page.route` (see `proposal-detail.spec.ts`) instead of reaching Google: the
 * container's CSP must not be loosened to admit a loopback mock.
 */
export function deckLinkFor(proposalId: string) {
  if (proposalId.startsWith('form-')) {
    const drive = `https://drive.google.com/file/d/drive-${proposalId.slice('form-'.length)}`
    return {
      url: `${drive}/view`,
      previewUrl: `${drive}/preview`,
      expiresIn: null,
    }
  }
  const signed = `https://storage.googleapis.com/aisa-e2e/decks/${proposalId}.pdf?X-Goog-Signature=e2e`
  return { url: signed, previewUrl: signed, expiresIn: 900 }
}

/** What each real route answers on success, shaped like `main.py`'s. */
function defaultAnswer(method: string, path: string, body: unknown): Answer {
  const deck = /^\/api\/proposals\/([^/]+)\/deck-url$/.exec(path)
  if (method === 'GET' && deck)
    return {
      status: 200,
      body: deckLinkFor(decodeURIComponent(deck[1] as string)),
    }
  const proposal = /^\/api\/proposals\/([^/]+)(\/response|\/correction)?$/.exec(
    path,
  )
  if (method === 'POST' && path === '/api/proposals/bulk-response')
    return { status: 200, body: { count: 1 } }
  if (method === 'POST' && proposal?.[2] === '/response')
    return {
      status: 200,
      body: { id: decodeURIComponent(proposal[1] as string), response: body },
    }
  if (method === 'POST' && proposal?.[2] === '/correction')
    return {
      status: 200,
      body: { id: decodeURIComponent(proposal[1] as string), correction: body },
    }
  if (method === 'DELETE' && proposal && !proposal[2])
    return { status: 200, body: { deleted: true } }
  if (method === 'PUT' && path === '/api/rules')
    return { status: 200, body: { version: 2 } }
  if (method === 'POST' && path === '/api/runtime/stop')
    return { status: 200, body: { paused: true } }
  if (method === 'POST' && path === '/api/runtime/resume')
    return { status: 200, body: { paused: false } }
  if (method === 'POST' && path === '/intake/upload')
    return {
      status: 202,
      body: { proposalId: UPLOAD_ANSWER_ID, created: true },
    }
  return {
    status: 404,
    body: { detail: `mock: tidak ada rute ${method} ${path}` },
  }
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

/** Parse the body the way the real API would read it: JSON or multipart. */
async function parseBody(
  raw: Buffer,
  contentType: string | null,
): Promise<unknown> {
  if (raw.length === 0) return null
  if (contentType?.startsWith('multipart/form-data')) {
    const form = await new Response(new Uint8Array(raw), {
      headers: { 'content-type': contentType },
    }).formData()
    const fields: Record<string, string | RecordedFile> = {}
    for (const [name, value] of form.entries()) {
      if (typeof value === 'string') {
        fields[name] = value
        continue
      }
      const bytes = Buffer.from(await value.arrayBuffer())
      fields[name] = {
        fileName: value.name,
        type: value.type,
        size: bytes.length,
        head: bytes.subarray(0, 5).toString('latin1'),
      }
    }
    return fields
  }
  const text = raw.toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export interface MockAisaApi {
  /** Every call since the last `reset()`, oldest first. */
  readonly calls: RecordedCall[]
  /** Answer the next call with this status and `{detail}` instead of success. */
  refuseNext(refusal: Refusal): void
  /** Answer the next call with exactly this, e.g. a success with other data. */
  answerNext(answer: Answer): void
  /** Drop the next call's connection, as an unreachable API would. */
  dropNext(): void
  /** Hold every answer this long — to see a button stay disabled meanwhile. */
  delayAnswers(ms: number): void
  reset(): void
  close(): Promise<void>
}

/**
 * Start the mock on `MOCK_URL`. Retries a busy port for a few seconds: after a
 * failed test Playwright replaces the worker, and the old one may still be
 * letting go of the port.
 */
export async function startMockAisaApi(): Promise<MockAisaApi> {
  const calls: RecordedCall[] = []
  let pending: Answer | 'drop' | null = null
  let delay = 0

  const server: Server = createServer(async (request, response) => {
    const contentType = request.headers['content-type'] ?? null
    const raw = await readBody(request)
    const path = new URL(request.url ?? '/', MOCK_URL).pathname
    const keyHeader = request.headers['x-aisa-key']
    calls.push({
      method: request.method ?? 'GET',
      path,
      key: typeof keyHeader === 'string' ? keyHeader : null,
      contentType,
      body: await parseBody(raw, contentType),
    })

    const next = pending
    pending = null
    if (next === 'drop') {
      request.socket.destroy()
      return
    }
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    const answer: Answer = next
      ? next
      : keyHeader !== EXPECTED_KEY
        ? // `require_key` in services/api/aisa/auth.py
          { status: 401, body: { detail: 'kunci tidak valid' } }
        : defaultAnswer(
            request.method ?? 'GET',
            path,
            calls.at(-1)?.body ?? null,
          )
    response.writeHead(answer.status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(answer.body))
  })

  const port = Number(MOCK_URL.port)
  for (let attempt = 0; ; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, MOCK_URL.hostname, () => {
          server.off('error', reject)
          resolve()
        })
      })
      break
    } catch (error) {
      const busy = (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
      if (!busy || attempt >= 20) {
        throw new Error(
          `The mock aisa-api could not listen on ${MOCK_URL.host}: ${String(error)}`,
          { cause: error },
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  return {
    calls,
    refuseNext({ status, detail }) {
      pending = { status, body: { detail } }
    },
    answerNext(answer) {
      pending = answer
    },
    dropNext() {
      pending = 'drop'
    },
    delayAnswers(ms) {
      delay = ms
    },
    reset() {
      calls.length = 0
      pending = null
      delay = 0
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}
