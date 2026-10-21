import { createLoader, createSerializer, parseAsString } from 'nuqs/server'

import { parseAsStrictSingle } from '@/lib/search-param'

/** The account directory's canonical path — one spelling, read by every href here. */
export const ACCOUNTS_PATH = '/admin/accounts'

/**
 * The directory's URL contract, declared ONCE and imported by both sides: the
 * Server Component reads it through `loadAccountsSearchParams`, and every link
 * that writes it is serialized from the same parsers.
 *
 * Deliberately the same two params as the impersonation picker's own
 * `search-params.ts` — an exact-email lookup and a forward-only cursor — because
 * both read the same Firebase Auth directory with the same forward-only
 * pagination. They stay SEPARATE declarations because they name different
 * routes: a shared module would have to take the path as an argument, and the
 * one thing a URL contract must own is which URL it is a contract for.
 *
 * Nothing else may go in here. A temporary password in particular must never
 * become a search param — see `temporary-password-reveal.tsx`.
 */
export const accountsSearchParams = {
  email: parseAsStrictSingle(parseAsString),
  pageToken: parseAsStrictSingle(parseAsString),
}

export const loadAccountsSearchParams = createLoader(accountsSearchParams)

const serialize = createSerializer(accountsSearchParams)

/** The next forward page. There is no backward token to serialize — see the page. */
export function accountsPageHref(pageToken: string): string {
  return serialize(ACCOUNTS_PATH, { pageToken })
}

/**
 * One account's detail surface. A path segment, not a query param, because the
 * uid identifies the RESOURCE rather than a view of the list — and because
 * `encodeURIComponent` is the only escaping a Firebase uid needs.
 */
export function accountDetailHref(uid: string): string {
  return `${ACCOUNTS_PATH}/${encodeURIComponent(uid)}`
}
