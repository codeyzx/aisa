/**
 * Read a Firebase-style string `code` off an unknown throw, or `undefined` if it
 * has none. The Admin/Web SDKs reject with an `Error` carrying a stable string
 * `code` (`auth/user-not-found`, `auth/invalid-page-token`, …); this is the ONE
 * safe way to read it without asserting a shape onto an unknown.
 *
 * It exists so the fail-safe distinction "a DEFINITIVE answer vs an inability to
 * reach the directory" is read one way (`lib/auth/token-rejection.ts`) rather
 * than re-open-coded per site. Numeric gRPC codes are the API normalizer's
 * concern (`lib/api/errors.normalize.ts`); this reads the string form only.
 */
export function firebaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined
  }
  const code: unknown = (error as { code: unknown }).code
  return typeof code === 'string' ? code : undefined
}
