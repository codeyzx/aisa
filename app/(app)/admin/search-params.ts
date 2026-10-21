import { createLoader, createSerializer, parseAsString } from 'nuqs/server'

import { parseAsStrictSingle } from '@/lib/search-param'

/** The URL contract for the single canonical `/admin` picker route. */
export const adminSearchParams = {
  email: parseAsStrictSingle(parseAsString),
  pageToken: parseAsStrictSingle(parseAsString),
}

export const loadAdminSearchParams = createLoader(adminSearchParams)

const serialize = createSerializer(adminSearchParams)

export function adminPageHref(pageToken: string): string {
  return serialize('/admin', { pageToken })
}
