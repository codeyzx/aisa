/**
 * Browser storage that belongs to the signed-in user (e.g. the Tanya AISA
 * history) is keyed under one prefix, so signing out can remove all of it
 * without knowing which features store what. Anything kept under this prefix
 * must be safe to lose on sign-out.
 */
export const USER_DATA_PREFIX = 'aisa:pengguna:'

/** Remove every localStorage and sessionStorage entry under USER_DATA_PREFIX. */
export function clearUserBrowserData(): void {
  for (const storage of storages()) {
    const keys: string[] = []
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (key?.startsWith(USER_DATA_PREFIX)) keys.push(key)
    }
    for (const key of keys) storage.removeItem(key)
  }
}

function storages(): Storage[] {
  // Each accessor can throw (blocked site data, private mode); skip that one.
  const found: Storage[] = []
  for (const get of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      found.push(get())
    } catch {
      // unavailable — nothing stored there to clear
    }
  }
  return found
}
