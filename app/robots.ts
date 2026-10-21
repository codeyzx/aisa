import type { MetadataRoute } from 'next'

/**
 * `robots.txt` for a PRIVATE, authenticated app: disallow every crawler from
 * every path. This is one of three places the "do not index" answer is stated —
 * the root `robots` metadata (`app/layout.tsx`, a `<meta name="robots">`) and the
 * global `X-Robots-Tag` header (`next.config.ts`) are the other two — because a
 * `<meta>` only reaches a crawler that fetched the (login-gated) HTML, and a
 * header only reaches one that made the request; `robots.txt` is the one a
 * well-behaved crawler reads FIRST, before requesting anything.
 *
 * No `sitemap` field: a sitemap advertises URLs to index, which is the opposite
 * of the intent here. A fork that opens the app to the public adds a permissive
 * rule and a sitemap here, deliberately.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  }
}
