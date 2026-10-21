/**
 * What one call to `aisa-api` produced — a pure type module so client islands
 * can read it without reaching the server-only client.
 *
 * A refusal is DATA, not a throw: the API's own message ("proposal sudah
 * ditanggapi", a 422 detail, …) is what the manager needs to read, and
 * `runAction` would collapse a throw into an opaque "Terjadi kesalahan". So the
 * caller hands this back to the browser verbatim.
 */
export type AisaApiOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; error: string }
