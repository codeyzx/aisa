import type { NextConfig } from 'next'

import { validateClientEnv } from './lib/env/client'

// Validate the PUBLIC env at build time. Next.js 16 loads this TS config
// directly, so the call below runs during `next build` / `next dev` — an
// EXPLICIT call, not an import side effect: a bare `import './lib/env'` made the
// check invisible at the call site and one "unused import" cleanup away from
// silently disappearing.
//
// There is NO bypass flag. The old one turned this check off for secret-less
// builds, which meant a build that passed with no env had proven nothing.
// Secret-less builds now pass explicit non-secret dummy public values instead
// (scripts/public-env-fixture.ts), so the validator always runs.
//
// NOTE: this is the BUILD-time check only, and only the NEXT_PUBLIC_* half —
// those values are INLINED into the client bundle and cannot be fixed after the
// build. Server secrets are read per request, so they are checked at BOOT
// instead: the standalone runtime never executes this file (output:'standalone'
// + CMD ["node","server.js"]), which is why that check lives in
// instrumentation.ts.
validateClientEnv()

/**
 * Security-header baseline, applied to every response.
 *
 * STATIC on purpose. A nonce-based CSP is the obvious next ask and is
 * DELIBERATELY DEFERRED: per Next's own guide
 * (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md) it
 * requires proxy.ts to mint a per-request nonce and it FORCES DYNAMIC RENDERING
 * ON EVERY PAGE. That is a change to how the whole app renders — its own PR,
 * with its own argument and its own drive, not a line smuggled in beside four
 * static headers.
 *
 * So there is no `Content-Security-Policy` here at all, rather than a
 * script-src'd one that would either break the app or be so loose it lies. The
 * headers below are the ones that are true without a nonce.
 */
const securityHeaders = [
  // Clickjacking. `frame-ancestors` is the CSP directive that supersedes
  // X-Frame-Options, and it is safe to ship alone — it needs no nonce and no
  // script policy, so it does not force dynamic rendering.
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  // Defence in depth for the same thing: frame-ancestors is unsupported in some
  // older browsers, and this is the one X-Frame-Options still buys.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Stops a browser from MIME-sniffing a response into something executable.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Send the full URL same-origin, only the origin cross-origin, nothing over a
  // downgrade — so a path carrying an id never leaks to a third party.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // This app asks for none of these. Denying them costs nothing and shrinks the
  // surface a compromised script could reach.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  // Isolate this browsing context group from any cross-origin page that opened
  // us, and from anything we open. What it actually buys here: a window opened
  // by a third party can no longer hold a `window.opener` handle to an
  // authenticated page of this app and poke at it. It costs nothing because this
  // app has NO cross-origin popup flow — sign-in is
  // `signInWithEmailAndPassword` (browser → Google over fetch, no popup window),
  // and the two `window.open` call sites (storage/asset attachment downloads)
  // already pass `noopener,noreferrer`, so they never wanted an opener link.
  // A fork that adds `signInWithPopup` MUST revisit this line — that flow talks
  // back through `window.opener` and this header severs exactly that.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Refuse to be loaded as a subresource by another origin at all — no
  // `<img src>`, `<script src>`, or `<iframe>` on someone else's site can pull a
  // response from this app. It is the read-side complement to
  // `frame-ancestors 'none'`: that one stops embedding of PAGES, this one stops
  // embedding of EVERY response, including the JSON envelopes and the CSV/XLSX
  // exports. `same-origin` rather than `same-site` because this app serves its
  // own assets from its own origin (no CDN `assetPrefix`, no sibling subdomain
  // pulling from here), so the stricter value is the TRUE one; a fork that puts
  // `/_next/static` behind a CDN on another host relaxes this to `same-site`.
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  // Deliberately NO `Cross-Origin-Embedder-Policy`. `require-corp` would demand
  // a CORP/CORS opt-in from every cross-origin subresource, and this app talks
  // to Firebase endpoints (identitytoolkit, firestore, storage) that make no
  // such promise — shipping it would break auth to buy a
  // cross-origin-isolation this app has no use for (no SharedArrayBuffer, no
  // high-resolution timers).
  //
  // HSTS — and this is a CONTRACT with the deployer, not a default to skim.
  //
  // What this line asserts: the exact host that served it will be HTTPS-only for
  // the next two years. Browsers IGNORE the header over plain HTTP, so it is
  // inert in local dev and takes effect only where it is already true — which is
  // why it ships unconditionally rather than behind a NODE_ENV branch nobody
  // would test.
  //
  // What is NOT asserted, on purpose: `includeSubDomains`. That would extend the
  // HTTPS-only promise to EVERY subdomain of the deployment host — including
  // ones this app never serves and a boilerplate cannot know about (a legacy
  // `intranet.`, a plain-HTTP `staging.`, a vendor-hosted `status.`). Getting it
  // wrong makes those hosts unreachable for two years, from a header this app
  // shipped on their behalf. A boilerplate has no standing to make that promise.
  //
  // The deployer's one-line edit, when EVERY subdomain of the deployment domain
  // is already HTTPS: append `; includeSubDomains` to the value below.
  //
  // Still no `preload` even then: that is a one-way, hard-to-reverse commitment
  // baked into browser binaries for every downstream project's domain, and it is
  // not a boilerplate's call to make.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000',
  },
  // This app is PRIVATE and authenticated: nothing here should ever be indexed.
  // The header is the third leg of the noindex policy, beside the root `robots`
  // metadata (app/layout.tsx) and app/robots.ts — and the only one that also
  // covers NON-HTML responses (a JSON API answer, an exported PDF/CSV, an image)
  // that carry no `<meta>` tag for a crawler to read. Public SEO is an opt-in
  // fork concern; a fork that goes public removes this and flips the metadata.
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
]

const nextConfig: NextConfig = {
  // Emit `.next/standalone` — server.js plus only the traced deps — so the
  // container image ships no node_modules. See Containerfile.
  output: 'standalone',
  // Drop `X-Powered-By: Next.js` from every response. Version/stack disclosure
  // is not free: it hands a scanner the exact framework to match its CVE list
  // against before it has spent a single request probing for one.
  poweredByHeader: false,
  /**
   * Next 16 logs every Server Function call to the dev terminal WITH ITS
   * ARGUMENTS — `└─ ƒ myAction(arg1, arg2) in 5ms app/actions.ts`. Observed, not
   * inferred: driving the mandatory password change printed the user's chosen
   * password and their Firebase ID token verbatim into `pnpm dev`'s output.
   *
   * That is a credential in a terminal scrollback, a tmux buffer, a CI log, and
   * a screen share — and this module's first risk is precisely that a password
   * must never be logged. It is DEV-ONLY (production builds emit nothing of the
   * kind), which makes it easy to dismiss and is exactly why it is turned off
   * here instead: a developer's terminal is where these credentials actually
   * exist in this project, since the emulator seeds and the admin flows all run
   * there.
   *
   * What is given up is the per-call action trace during `pnpm dev`. Incoming
   * requests, fetches, and every `log.*` line are untouched, so a failing action
   * is still visible — just without its arguments printed beside it.
   */
  logging: { serverFunctions: false },
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }])
  },
}

export default nextConfig
