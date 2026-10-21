// TEMPLATE — copy-me starter for a new entity's URL contract: the one module that
// PARSES the list page's query string, and the only place a link to that page is
// built. See `_template.schema.ts` for the token legend. Copy to
// `features/<entity>/<entity>.search-params.ts`.
//
// Both sides import THIS module — the Server Component reads the URL through
// `load__Entity__ListSearchParams`, a client filter island writes it through the
// same parsers in `__entities__SearchParams`, and every link comes from an href
// below. That single declaration is what nuqs is here for: spell the contract
// twice — a page reading `?status` by hand while a filter rebuilds it from a
// `/__entities__?status=${next}` template — and renaming the key on one side
// drifts in silence while both halves still compile.
//
// SCOPE: this is the standard baseline (docs/explanation/reusability-model.md) —
// a status filter and cursor paging, nothing else. A search box, a sortable
// header, a page-size control and a table/card toggle are opt-in extensions you
// argue per entity. Read `docs/reference/contracts/ui.md` before adding one:
// a page size is a COST input — it becomes the number of documents Firestore is
// billed for — so it must be a closed literal set, never `parseAsInteger`.
//
// You may keep this module beside the route instead. Either place holds the
// contract, but if you move it there the schema stops being a sibling — change
// `./__entity__.schema` to `@/features/<entity>/<entity>.schema` or nothing
// resolves.
//
// NOT a client/server hazard: `nuqs/server` is isomorphic (parsers, a loader, a
// serializer — no framework imports), and `__entity__.schema` is schema-only, so
// a 'use client' island may import this file. Do NOT import
// `./__entity__.repo` here: it is `server-only`, and one client island importing
// it puts firebase-admin in the browser bundle.
//
// EXCLUDED from typecheck by the `_template.*` name.

import {
  createLoader,
  createSerializer,
  parseAsString,
  parseAsStringLiteral,
  type inferParserType,
} from 'nuqs/server'

import { parseAsStrictSingle } from '@/lib/search-param'
import {
  __Entity__StatusSchema,
  type __Entity__Status,
} from './__entity__.schema'

/**
 * The URL this list lives at. Every href below is built from it, so a route
 * rename is one edit here rather than a string template at each one.
 *
 * It does NOT have to equal `__ENTITIES___COLLECTION`: that names a Firestore
 * collection, this names an address the reader sees.
 */
const LIST_PATH = '/__entities__'

/**
 * The filter widens the entity's own status set with a word for "not filtered" —
 * a control has no way to render absence, so it needs a value for it.
 *
 * DERIVED from the schema, never hand-listed. The enum already owns this set; a
 * literal copy here would be a second taxonomy that goes stale the first time you
 * add a status, with nothing to redden.
 */
export const __ENTITY___STATUS_FILTER_VALUES = [
  'all',
  ...__Entity__StatusSchema.options,
] as const

export type __Entity__StatusFilterValue =
  (typeof __ENTITY___STATUS_FILTER_VALUES)[number]

/**
 * The filter's vocabulary translated into the repo's — the ONE place that
 * conversion happens.
 *
 * The paginated list in `__entity__.repo.ts` expresses "unfiltered" as an ABSENT
 * `status`, so `'all'` must become `undefined` before it reaches the query. Pass
 * it straight through instead and you build `.where('status', '==', 'all')` — a
 * query that matches no document, renders an empty list, and raises no error to
 * explain it.
 */
export function to__Entity__StatusFilter(
  status: __Entity__StatusFilterValue,
): __Entity__Status | undefined {
  return status === 'all' ? undefined : status
}

export const __entities__SearchParams = {
  /**
   * `parseAsStringLiteral` narrows to the union AND handles the invalid case the
   * way a view preference should: `?status=nope` falls back to `all` instead of
   * throwing, so a stale bookmark renders the list rather than a 500.
   *
   * `parseAsStrictSingle` makes `?status=active&status=retired` invalid rather
   * than silently resolving to the first — nuqs otherwise follows
   * `URLSearchParams.get`, and a repeated key is a reader who thinks they
   * filtered.
   */
  status: parseAsStrictSingle(
    parseAsStringLiteral(__ENTITY___STATUS_FILTER_VALUES),
  ).withDefault('all'),
  /**
   * No default: a cursor has no meaningful "first page" value — its absence IS
   * the first page. One param drives Previous and Next alike, because the token
   * carries its own `nav` direction (lib/data/pagination.contract.ts).
   */
  cursor: parseAsStrictSingle(parseAsString),
}

/** RSC-side reader. Accepts the Next 16 `searchParams` Promise directly. */
export const load__Entity__ListSearchParams = createLoader(
  __entities__SearchParams,
)

/**
 * Everything the list page reads from the URL.
 *
 * INFERRED from the parsers above rather than respelled, so the two can never
 * disagree: add a param and this type grows with it, and the `Omit` in
 * `__entities__QueryHref` keeps covering it.
 */
export type __Entity__ListQuery = inferParserType<
  typeof __entities__SearchParams
>

// `clearOnDefault` (on by default) keeps `?status=all` out of the URL, so
// /__entities__ and /__entities__?status=all are the same link and a shared URL
// says only what the reader actually chose.
const serialize = createSerializer(__entities__SearchParams)

/**
 * The next or previous page of the query in hand — one function for both, since
 * the token itself says which way it resumes.
 *
 * The filter rides along untouched: a cursor is only meaningful against the query
 * that produced it, so the pager must reproduce that query exactly. Build the
 * link from `{ cursor }` alone and page two silently drops the filter.
 */
export function __entities__PageHref(
  query: __Entity__ListQuery,
  cursor: string,
): string {
  return serialize(LIST_PATH, { ...query, cursor })
}

/**
 * A DIFFERENT ANSWER to the question the list is asking: another status, or —
 * with an empty `next` — the same one from the top.
 *
 * THE CURSOR IS DROPPED, AND NOT BY REMEMBERING TO. `next` cannot name it:
 * `Omit<__Entity__ListQuery, 'cursor'>` is what makes "page 3 of a different
 * filter" unspellable, so no caller can construct that URL by clicking. That is
 * the reason these hrefs live here instead of at each call site.
 *
 * Why it must go: a cursor names a POSITION IN ONE FILTERED, ORDERED SET. Replay
 * it under another filter and it resumes past rows that are not in the new set —
 * nothing throws, the reader just gets a plausible wrong page.
 *
 * This is the braces, not the belt. The list in `__entity__.repo.ts` stamps its
 * filter into the cursor's `scope`, and `decodeCursor` returns `null` when the
 * scope a token was minted under differs from the one it is decoded FOR
 * (lib/data/pagination.contract.ts) — that guard holds for hand-typed URLs too.
 * This function only keeps the wrong link from being OFFERED, so a reader
 * clicking around never sees paging reset itself.
 *
 * Note what does the work below: the literal `cursor: null`. The `Omit` shapes
 * the ARGUMENT — a caller cannot ask for a cursor — but it does not drop the one
 * already in `query`, which the spread would carry straight through.
 */
export function __entities__QueryHref(
  query: __Entity__ListQuery,
  next: Partial<Omit<__Entity__ListQuery, 'cursor'>>,
): string {
  return serialize(LIST_PATH, { ...query, ...next, cursor: null })
}

/**
 * The reader's CURRENT list URL — the exact place a create/edit flow must return
 * them to, and the value carried as `?returnTo`.
 *
 * It is NOT bare `LIST_PATH`: a reader who opened the form from page 3 of a
 * filtered list expects page 3 of that same list back, not the top of the default
 * one. With a cursor in hand `__entities__PageHref` reproduces the page they are
 * ON; without one they are on the first page, and `__entities__QueryHref(query,
 * {})` is that same list from the top.
 */
export function __entities__CurrentHref(query: __Entity__ListQuery): string {
  return query.cursor
    ? __entities__PageHref(query, query.cursor)
    : __entities__QueryHref(query, {})
}

/**
 * `returnTo` is a param on the FORM routes, not a member of the list query above,
 * so it gets its own small contract rather than a key in `__entities__SearchParams`.
 *
 * It carries a whole list URL, so its value contains the `&` that separates that
 * URL's own params. The serializer percent-encodes it; hand-assemble the link
 * instead and each `&` starts a new param OF THE FORM ROUTE, so everything past
 * the first one is lost and a save strands the reader on the default list.
 *
 * Encoding is not validation. What comes back out is still caller-controlled, so
 * the page that redirects to it must pass it through `safeInternalPath`
 * (lib/safe-path.ts) first, or `?returnTo=//evil.example` is an open redirect.
 */
const formSearchParams = {
  returnTo: parseAsStrictSingle(parseAsString),
}

export const load__Entity__FormSearchParams = createLoader(formSearchParams)

const serializeForm = createSerializer(formSearchParams)

export function __entity__NewHref(returnTo: string): string {
  return serializeForm(`${LIST_PATH}/new`, { returnTo })
}

export function __entity__EditHref(id: string, returnTo: string): string {
  return serializeForm(`${LIST_PATH}/${id}/edit`, { returnTo })
}
