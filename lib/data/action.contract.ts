/**
 * The pure, client-reachable contract of a server action's result: the CLOSED
 * error vocabulary, the ONE user-safe message per code, and the envelope shape.
 *
 * This mirrors `lib/api/errors.contract.ts` for the server-action boundary the way that
 * module does for HTTP: an action `code` is a CONTRACT a client can exhaustively
 * `switch` on, so the list is deliberately closed and small. The message is
 * DERIVED from the code, never from the thrown error — a raw error can carry a
 * document path, a query shape, or a bucket name the client is not entitled to
 * (the same rule `API_ERROR_MESSAGE` states). Adding a code is a contract change.
 */

/**
 * Every failure a server action can report. Each code has a producer:
 *  - `unauthenticated` / `password_change_required` / `forbidden` — the
 *    `runAction` auth gate, which asks `authorizeSession`. The middle code is
 *    NOT a flavour of `forbidden`: the user's remedy is different (replace the
 *    temporary password), and telling them they lack permission would send them
 *    looking for an administrator instead of to the password screen.
 *  - `invalid` — a Zod validation failure (the caller's input).
 *  - `not_found` / `conflict` — a typed `DomainError` a repo threw (see
 *    `domain-error.ts`); an EXPECTED, handled failure, not a bug.
 *  - `resource_exhausted` — a per-uid COST BUDGET was spent (`lib/http`'s
 *    `rateLimit`). The action-layer twin of the HTTP taxonomy's
 *    `RESOURCE_EXHAUSTED`, so the name is a RENAME of a status this codebase
 *    already speaks rather than a new idea. It earns its place by the bar stated
 *    below: no existing code carries its remedy. `unavailable` says "we could not
 *    reach the server" when the server answered on purpose; `forbidden` sends the
 *    caller to an administrator who cannot help; `conflict` tells them to reload
 *    a screen that is still correct. The remedy here is only ever "wait for the
 *    window, then send the SAME request again".
 *  - `unavailable` — we could not REACH something we depend on, from either end:
 *    a transport rejection `settleAction` caught client-side, or an upstream
 *    provider outage the server caught (a Firebase token verification that failed
 *    to reach Google — see `lib/auth/token-rejection.ts`). Both share the one
 *    remedy: try the SAME request again. It is deliberately NOT `unauthenticated`,
 *    which would tell a validly-signed-in caller their credential is bad and send
 *    them to re-authenticate against the provider that is down.
 *  - `internal` — an unknown, unhandled throw, returned OPAQUE.
 *
 * Three more belong to account administration (`lib/actions/account.action.ts`)
 * and each exists because NO existing code carries its remedy. That test is the
 * bar every addition must clear — a code whose remedy is "reload and retry" is
 * already `conflict`, and one whose remedy is "you cannot" is already
 * `forbidden`:
 *  - `lease_unavailable` — a second administrator holds the mutation lease right
 *    now. Remedy: wait a moment and retry, UNCHANGED. That is not `conflict`
 *    ("data changed, reload") — nothing changed and there is nothing to reload —
 *    and telling the admin to reload would send them to re-check a screen that is
 *    still correct.
 *  - `admin_lockout` — the mutation would strip administrator access the app
 *    must keep: the actor's own, or the last remaining one. Remedy: have another
 *    administrator do it, or promote one first. Not `forbidden`: the actor DOES
 *    hold the capability, and "you have no permission" would send them looking
 *    for an admin who cannot help either. Self-demotion, self-disable and
 *    final-admin removal share this ONE code because they share that remedy.
 *  - `reconciliation_required` — the Auth mutation LANDED but a follow-up
 *    (session revocation, or settling the audit event) did not. Remedy: do NOT
 *    retry; a human checks the account history. This is the one outcome that is
 *    neither success nor failure, and collapsing it into either is the specific
 *    lie the two-step audit protocol exists to prevent.
 */
export const ACTION_ERROR_CODES = [
  'unauthenticated',
  'password_change_required',
  'forbidden',
  'invalid',
  'not_found',
  'conflict',
  'lease_unavailable',
  'admin_lockout',
  'reconciliation_required',
  'resource_exhausted',
  'unavailable',
  'internal',
] as const

export type ActionErrorCode = (typeof ACTION_ERROR_CODES)[number]

/**
 * The single user-safe message per code — the action-layer counterpart to
 * `API_ERROR_MESSAGE`. Bahasa Indonesia (the default product language), read by
 * every surface that shows an action failure to a human (a toast, a dialog).
 * `Record<ActionErrorCode, string>` is load-bearing: adding a code is a COMPILE
 * ERROR here until its message exists, so a bare code can never reach the UI.
 */
export const ACTION_ERROR_MESSAGE: Record<ActionErrorCode, string> = {
  unauthenticated: 'Anda harus masuk terlebih dahulu',
  password_change_required:
    'Ganti kata sandi sementara Anda terlebih dahulu sebelum melanjutkan',
  forbidden: 'Anda tidak memiliki izin',
  invalid: 'Validasi gagal',
  not_found: 'Tidak ditemukan',
  conflict: 'Data telah berubah. Muat ulang lalu coba lagi.',
  lease_unavailable:
    'Administrator lain sedang melakukan perubahan akun. Tunggu sebentar lalu coba lagi.',
  admin_lockout:
    'Operasi ditolak: akses administrator harus tetap ada. Minta administrator lain melakukannya, atau tambahkan administrator baru terlebih dahulu.',
  reconciliation_required:
    'Perubahan hanya diterapkan sebagian dan perlu diperiksa. Jangan diulang — periksa riwayat akun terlebih dahulu.',
  // Opens with the same three words as `API_ERROR_MESSAGE.RESOURCE_EXHAUSTED`
  // ("Terlalu banyak permintaan") because it is the same fact over the other
  // transport, then adds the remedy the HTTP twin puts in `retryAfter` instead —
  // an action envelope has no header to carry it.
  resource_exhausted:
    'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.',
  unavailable: 'Tidak dapat menghubungi server. Coba lagi.',
  internal: 'Terjadi kesalahan',
}

/**
 * The client-safe envelope returned by programmatic server actions.
 *
 * `cid` is the correlation id of the log line this failure produced, and it is
 * present ONLY on `internal` — the one code that tells the caller nothing. Every
 * other code names its own cause and its own remedy, so an id would be noise. An
 * `internal` is deliberately opaque (internals never cross this boundary), which
 * leaves the person reporting it with nothing to quote and the operator
 * searching by timestamp. This is the same join the HTTP envelope has always had
 * via `x-correlation-id`; actions simply never grew one.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: ActionErrorCode; cid?: string }

/**
 * Build a failure envelope for a code, taking its canonical message — the
 * action-layer counterpart to `toApiError`. Every `ok:false` producer routes
 * through here so the code and its message can never disagree.
 *
 * When a `cid` is supplied the reference is composed INTO the message rather
 * than left for each caller to render. There are six-plus surfaces that show
 * `result.error` (toasts, inline alerts, form-level errors) and threading a
 * second field through all of them would mean six chances to drop it; composing
 * once here means every surface shows it and none had to be edited. The field
 * stays on the envelope for a caller that wants to render it differently.
 *
 * Only the first segment is shown. A full UUID in a toast is something a user
 * transcribes wrongly or not at all, and it is a literal PREFIX of the logged
 * `cid`, so grepping what they quoted finds the line.
 */
export function actionError(
  code: ActionErrorCode,
  cid?: string,
): {
  ok: false
  error: string
  code: ActionErrorCode
  cid?: string
} {
  const message = ACTION_ERROR_MESSAGE[code]
  if (!cid) return { ok: false, error: message, code }
  return {
    ok: false,
    error: `${message} (ref: ${cid.slice(0, 8)})`,
    code,
    cid,
  }
}

/** Normalize a rejected server-action transport into the usual result envelope. */
export async function settleAction<T>(
  action: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await action()
  } catch {
    // The action itself never throws across the RSC boundary — reaching here is
    // the TRANSPORT failing (the request never landed), which is a "try again".
    return actionError('unavailable')
  }
}
