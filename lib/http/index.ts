/**
 * In-memory fixed-window rate limiter.
 *
 * ===================== WHAT THIS IS, AND IS NOT =====================
 * This is a COST GUARD. It is NOT a credential-stuffing defence, and no call
 * site may describe it as one.
 *
 * This origin has no login endpoint. A password never reaches it: the browser
 * calls signInWithEmailAndPassword against Google (app/login/login-form.tsx) and
 * only then hands the server an already-verified idToken. So credential stuffing
 * never transits this app — Firebase throttles it, and lib/api/errors.normalize.ts already
 * maps `auth/too-many-requests` -> RESOURCE_EXHAUSTED. Building our own would be
 * a parallel taxonomy of something the system already owns.
 * ====================================================================
 *
 * KEY: a RESOLVED IDENTITY (a uid), and nothing else. Never an IP, not even as
 * a fallback. Here `x-forwarded-for` is client-controlled — we are not on Vercel,
 * compose.yaml publishes :3000 with no proxy in front, and Next 16 exposes no
 * trusted request IP — so a limiter keyed on it would report protection it does
 * not have, on the auth boundary. `rateLimit` THROWS when handed no key rather
 * than synthesizing a placeholder: a limiter you bypass by deleting a header
 * fails silently forever, and a loud failure is the one you notice.
 *
 * SCOPE: applied EXPLICITLY per route, never globally. A global limiter is a
 * special-case branch on a path that must stay uniform.
 *
 * THE LIMITATION, stated because config that lies is worse than no config: this
 * counter lives in ONE PROCESS. Two replicas double the effective limit; a cold
 * start resets it. It is a cost guard against a single client burning a paid
 * upstream call, not a global quota. The `store` seam below is where Redis goes
 * when a real global limit is needed.
 */

/** A budget lives as a MODULE CONSTANT beside its call site and is passed in as an argument — never an env key. */
export interface RateLimitBudget {
  /** Requests allowed per window. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
}

export interface RateLimitResult {
  /** False when the caller has exhausted the budget for this window. */
  ok: boolean
  /** Whole seconds until the window resets. Legitimate `details` on a 429. */
  retryAfter: number
}

/** The window state for one key. Exported so an external store can name it. */
export interface Counter {
  count: number
  resetAt: number
}

/**
 * The swap seam for a Redis-backed limiter. It implements this
 * one method; nothing else about a call site changes. Kept to `hit` alone
 * because that is the only operation a fixed window needs — a reset/read pair
 * would be API surface no caller has asked for.
 *
 * `hit` is ASYNC because the store this seam exists for is over a network. A
 * synchronous signature is one no Redis client can implement, so it would force
 * a second breaking change to the very interface whose purpose is to absorb the
 * swap — the in-memory store simply resolves immediately. The asynchrony is the
 * seam's whole point, not an incidental detail of the default implementation.
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number, now: number): Promise<Counter>
}

export function createMemoryStore(): RateLimitStore {
  const counters = new Map<string, Counter>()

  return {
    // No `await` inside: the in-memory window needs no I/O. It is `async` to
    // satisfy the seam, which exists for stores that do.
    async hit(key, windowMs, now) {
      const existing = counters.get(key)
      if (!existing || existing.resetAt <= now) {
        const fresh = { count: 1, resetAt: now + windowMs }
        counters.set(key, fresh)
        // Opportunistic sweep: without it the Map grows one entry per uid seen,
        // forever, and an in-memory limiter becomes an in-memory leak. Done on
        // the cold path (a new window) so the hot path stays O(1).
        for (const [otherKey, counter] of counters) {
          if (counter.resetAt <= now) counters.delete(otherKey)
        }
        return fresh
      }
      existing.count += 1
      return existing
    },
  }
}

const defaultStore = createMemoryStore()

export interface RateLimitOptions {
  /** Defaults to the process-wide in-memory store. Injected by tests and by a future Redis swap. */
  store?: RateLimitStore
  /** Injected so a test can drive the window deterministically instead of sleeping. */
  now?: number
}

/**
 * Count one event against `key`'s budget.
 *
 * `key` MUST embed a resolved uid (e.g. `session:${uid}`). Namespacing by
 * purpose is what keeps two unrelated budgets from sharing a counter.
 *
 * Async because the `store` seam is (see `RateLimitStore`). Every caller already
 * sits in an async body, so awaiting costs nothing today and buys the Redis swap
 * without touching a single call site later.
 *
 * @throws when `key` is empty — see the KEY note above. This is the boundary
 * rejecting an input it cannot honour, not a defensive nicety. It REJECTS rather
 * than throwing synchronously now; every caller awaits, so it is still loud.
 */
export async function rateLimit(
  key: string,
  budget: RateLimitBudget,
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  if (key.trim().length === 0) {
    throw new Error(
      'rateLimit requires a resolved key (a uid). Refusing to meter an anonymous caller: an IP or placeholder key reports protection it does not have.',
    )
  }

  const now = options.now ?? Date.now()
  const store = options.store ?? defaultStore
  const counter = await store.hit(key, budget.windowMs, now)
  const retryAfter = Math.max(0, Math.ceil((counter.resetAt - now) / 1000))

  return { ok: counter.count <= budget.limit, retryAfter }
}
