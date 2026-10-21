/**
 * Recovering from a stale deploy's missing JS chunk, exactly once.
 *
 * THE FAILURE: a long-lived tab holds an HTML document referencing chunk hashes
 * from the deploy it loaded. A new deploy replaces those files. The tab then
 * navigates, the module loader fetches a chunk that no longer exists, gets a
 * 404, and throws — and the reader sees the generic "Something went wrong"
 * panel whose "Try again" re-renders into the SAME missing chunk, forever. The
 * fix is a reload, which fetches the new document and the new hashes.
 *
 * THE TRAP, and the reason this module is not two lines: a naive
 * `location.reload()` on a chunk 404 is an INFINITE RELOAD LOOP. If the reload
 * does not fix it — CDN half-broken, chunk genuinely gone, a bad deploy — you
 * reload straight back into the same error and the tab spins forever, burning
 * the user's battery and reporting nothing. This has bitten real production
 * deploys with long-lived tabs; the guard below is the lesson: reload ONCE,
 * then stop and say so.
 *
 * Client-only by construction: `sessionStorage` and `location` do not exist on
 * the server. Every export here is called from inside a boundary's `useEffect`,
 * which only runs in the browser.
 */

/**
 * sessionStorage, deliberately — not localStorage, not a module variable.
 *
 * A module variable is reset by the very reload we are guarding, so it can
 * never see the second occurrence: it would guard nothing while looking like it
 * did. localStorage overshoots the other way — it is shared across tabs and
 * survives the browser closing, so one bad deploy on Monday would suppress the
 * reload for a genuinely stale tab on Friday. sessionStorage is scoped to this
 * tab and survives exactly one reload, which is precisely the question being
 * asked: "did I already try this, in this tab, just now?"
 */
const RELOAD_ATTEMPTED_KEY = 'chunk-reload-attempted'

/**
 * Whether `error` is a chunk that failed to load.
 *
 * TWO LEGS, BOTH LOAD-BEARING, and the message leg is NOT the one you would
 * copy from a webpack codebase.
 *
 * `name` is the primary leg and it SURVIVES a production build — verified by
 * driving it rather than assumed, because React replaces a SERVER-thrown error
 * in production with a generic `Error` carrying only `digest`, which would have
 * made detection impossible. It does not apply here: a ChunkLoadError is thrown
 * CLIENT-side by the module loader, never crosses the server boundary, and so
 * keeps its name. Measured in `next build` + `next start`: name ===
 * 'ChunkLoadError', message === 'Failed to load chunk /_next/static/chunks/
 * <hash>.js from module <id>', thrown from turbopack-<hash>.js.
 *
 * The message leg is the fallback for the day Turbopack's runtime stops setting
 * `name`. ⚠️ It matches TURBOPACK's wording ("Failed to load chunk"), which is
 * NOT webpack's ("Loading chunk 42 failed"). This repo is Next 16 / Turbopack.
 * A regex from a webpack-era codebase (whose wording is "webpack") would
 * silently never match here, and the whole recovery would be dead code that
 * passes every test. Both spellings are kept:
 * the webpack one costs nothing and covers a fallback to it.
 */
export function isChunkLoadError(error: Error): boolean {
  if (error.name === 'ChunkLoadError') return true
  return /Failed to load chunk|Loading chunk \S+ failed|Loading CSS chunk/i.test(
    error.message,
  )
}

/**
 * Try to recover from a chunk error by reloading — at most once per tab.
 *
 * Returns `true` if a reload was started (the caller should render nothing and
 * let the page go), `false` if one was already attempted (the caller must show
 * a terminal panel, NOT reload again).
 *
 * The flag is set BEFORE `reload()`, never after: `reload()` may not return, and
 * a flag written afterwards would never be written at all — which is the loop,
 * reintroduced by a line that looks like cleanup.
 *
 * KNOWN AND DELIBERATE: the flag is not cleared on a successful recovery, so a
 * SECOND, unrelated stale-deploy in the same tab session shows the panel instead
 * of auto-reloading. That is the safe direction to be wrong in — the failure is
 * "the user clicks reload themselves", not "the tab spins forever". Clearing it
 * would need a hook in the root layout on every successful load, which is a new
 * surface for a rarer case; a reader who wants it should add it deliberately.
 */
export function attemptChunkReload(): boolean {
  let alreadyTried: string | null = null
  try {
    alreadyTried = sessionStorage.getItem(RELOAD_ATTEMPTED_KEY)
  } catch {
    // sessionStorage throws in some privacy modes and in sandboxed iframes.
    // Refuse to reload rather than risk a loop we cannot guard: an unguarded
    // auto-reload is the one outcome worse than the panel.
    return false
  }

  if (alreadyTried) return false

  try {
    sessionStorage.setItem(RELOAD_ATTEMPTED_KEY, String(Date.now()))
  } catch {
    return false
  }

  globalThis.location.reload()
  return true
}
