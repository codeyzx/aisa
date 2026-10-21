/**
 * Who this app says it is. The ONE place these two strings are spelled.
 *
 * ── RENAMING THIS BOILERPLATE ────────────────────────────────────────────────
 * Change `APP_NAME` here and every surface follows: the browser tab, the sidebar
 * lockup, the sign-in page. There is no second place to remember.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A plain module, not env. `NEXT_PUBLIC_*` is a BUILD ARG here, so
 * routing the name through env would inline it at build time anyway — the same
 * one-name-per-image you already have, bought with schema, validation, and a
 * `.env` an adopter must not forget. The name is a property of the product, not
 * of a deployment.
 *
 * No 'use client' and no server-only: both halves read it. The sidebar is a
 * client island, the root layout's `metadata` is server-side, and they must not
 * be able to disagree — which they can the moment each half hardcodes its own
 * copy of the name instead of reading it from here.
 */

/**
 * Locale, timezone, and currency are NOT here — they live in
 * `lib/format/locale.ts`, the one place a non-Indonesian fork changes them.
 */

/** The product. Appears in the tab title, the sidebar, and on sign-in. */
export const APP_NAME = 'AISA'

/** The organisation shipping it. The small line above APP_NAME in the sidebar. */
export const ORG_NAME = 'Aixel'

/**
 * The one-line product description. Feeds the root `description` and
 * `applicationName` metadata (`app/layout.tsx`). Bahasa Indonesia, because that
 * is the default product language — the app is private and authenticated, so
 * this is never an SEO surface (root metadata sets `robots: index:false`); it is
 * the honest description a browser or a bookmark shows.
 */
export const APP_DESCRIPTION =
  'Aplikasi internal — akses khusus untuk pengguna terautentikasi.'
