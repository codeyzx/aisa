import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { apiFail } from '@/lib/api/response'
import { isPublicPath, SESSION_COOKIE } from '@/lib/auth/constants'

/**
 * OPTIMISTIC auth gate. It checks that a session cookie is PRESENT. It does NOT
 * verify it, and it never will.
 *
 * ⚠️ READ THIS BEFORE TRUSTING A 401 FROM HERE. `cookies.has()` is the whole
 * check, so `session=totally-forged` walks straight past this file. A 401 from
 * the proxy means "you sent no cookie" — it NEVER means "your cookie is bad".
 * The route handler's `getSession()` is the only thing that verifies, and it
 * remains the real security boundary (`docs/reference/contracts/http-api.md`). **Do not read
 * "the gate already returns 401" as licence to drop a handler's own check** —
 * that is the one way this file becomes a vulnerability instead of a courtesy.
 * A forged cookie is refused by the handler with a byte-identical envelope, so
 * the wire cannot tell you which layer answered. This comment is the only place
 * that can.
 *
 * Two callers, two answers — one gate. A human loading a page wants to be taken
 * to the login screen; a `fetch` wants a machine-readable error. Answering both
 * with a 307 is what made a cookie-less `POST /api/storage/upload-url` hand its
 * caller login HTML at status 200 — the exact failure `api.md` forbids handlers
 * from committing. Three lanes hit it independently before anyone read this file.
 *
 * This file is NOT edge-constrained. Next 16's proxy defaults to the NODE
 * runtime, and the `runtime` config option is unavailable here — setting it
 * throws (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
 * § Runtime). Any "edge-safe imports only" rule you are carrying is Next 15
 * folklore. Cite the docs, not a comment.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE)
  const { pathname } = request.nextUrl
  const isPublic = isPublicPath(pathname)

  if (!hasSession && !isPublic) {
    // `/api/` is a transport dialect, not proof a handler exists there: an
    // unrouted `/api/typo` answers 401 rather than 404. Deliberate — refusing
    // before routing does not leak which endpoints exist — but if you are hunting
    // an auth bug on a path you just typed, check the path first.
    if (pathname.startsWith('/api/')) {
      return apiFail(request, 'UNAUTHENTICATED')
    }
    // Preserve where the reader was headed so /login can return them there after
    // sign-in. Path + query only — the login form re-validates `next` down to a
    // same-origin relative path (`safeInternalPath`, lib/safe-path.ts), so a
    // crafted destination cannot ride this into an open redirect.
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    // `/api` UNCONDITIONALLY, dots and all, and it must stay its own entry.
    // The page pattern below excludes any path containing a dot so that static
    // files are not gated — but that exclusion does not know the difference
    // between `/logo.svg` and `/api/reports/v1.2`. Without this line a
    // dotted `/api` path skips the proxy entirely, so a cookie-less request to
    // it gets Next's routing answer instead of the `UNAUTHENTICATED` envelope
    // this file promises for every `/api/` request. The lanes above are only as
    // good as the matcher that reaches them.
    //
    // Kept as a SEPARATE entry rather than adding `api` to the negative
    // lookahead below: `(?!api|…)` also swallows `/api-docs`, a page route that
    // merely shares the prefix, and would silently stop gating it.
    '/api/:path*',
    // Everything else except Next internals and files (any path with a dot).
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
}
