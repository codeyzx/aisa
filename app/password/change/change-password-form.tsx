'use client'

/**
 * The mandatory password-change form — the browser half of a SERVER-OWNED
 * transition.
 *
 * ── WHAT THIS COMPONENT ACTUALLY DOES ────────────────────────────────────────
 * It does not change a password. It produces a PROOF and hands it over:
 *
 *  1. re-authenticate with Firebase Web Auth using the CURRENT password —
 *     browser straight to Google, exactly like `app/login/login-form.tsx`, so
 *     the password never transits this origin;
 *  2. take the fresh ID token that sign-in mints;
 *  3. submit that token PLUS the new password to ONE server action.
 *
 * Everything that matters — verifying the token, checking the claim and the
 * `auth_time`, advancing the revocation marker, writing the password, clearing
 * the claim, revoking every session, clearing this cookie, and the redirect —
 * happens in `changeOwnPasswordAction`. Nothing here can be skipped to reach a
 * cleared claim, because nothing here clears anything.
 *
 * ── WHY `signInWithEmailAndPassword` AND NOT `reauthenticateWithCredential` ──
 * They prove the same thing (possession of the current password) and mint the
 * same fresh `auth_time`. The difference is what they REQUIRE: reauthenticate
 * needs a hydrated `auth.currentUser`, which is not guaranteed here — the server
 * session cookie can outlive the SDK's IndexedDB credential (a cleared site
 * storage, a different browser profile restored from a cookie jar, a cookie
 * minted in another tab). A form that works only when a client-side cache
 * happens to be warm is a form that fails for the exact user who most needs it.
 *
 * ── WHY IT SIGNS OUT BEFORE CALLING THE ACTION ───────────────────────────────
 * The token string is already in hand, so signing out cannot cost us the proof;
 * and the server is about to revoke every refresh token anyway. What it buys is
 * that the OLD credential does not survive in IndexedDB past a successful
 * change — `getIdToken()` on a leftover refresh token plus
 * `POST /api/auth/session` is a documented path back to a session cookie
 * (see `lib/auth/use-sign-out.ts`). The revocation marker would refuse the
 * resulting cookie, but relying on the last line of defence when the first one
 * is free is not a trade worth making.
 *
 * The cost is stated rather than hidden: if the ACTION then fails, the user is
 * signed out of Firebase locally and must sign in again with the temporary
 * password to retry. That window is narrow by construction — the new password is
 * validated against the shared schema before any of this runs, and a wrong
 * current password fails at step 1, before the sign-out.
 *
 * ── WHY THE FORM IS NOT SERVER-RENDERED ──────────────────────────────────────
 * Step 1 is a Firebase Web Auth call, so this flow genuinely requires
 * JavaScript. A form rendered into the no-JS HTML would be a lie twice over: it
 * would look like it works, and submitting it would send a native GET that puts
 * the typed passwords in the URL. So the form is mounted only after hydration,
 * and the JS-off client is TOLD, in `<noscript>`, exactly what it needs.
 */
import { useEffect, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { LoaderCircle } from 'lucide-react'
import * as z from 'zod'

import { changeOwnPasswordAction } from '@/lib/actions/password.action'
import { NewPasswordSchema } from '@/lib/auth/account.contract'
import { settleAction } from '@/lib/data/action.contract'
import { firebaseAuth } from '@/lib/firebase/client-auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import { SignOutButton } from './sign-out-button'

/**
 * Per-field validators. `newPassword` is the SHARED `NewPasswordSchema` the
 * server re-validates with — the length rule and its message exist once, in
 * `account.contract.ts`, so client feedback can never promise something the
 * server refuses. `confirmPassword` is a client-only concern by design: the
 * server has no second field to compare and does not want one.
 */
const clientValidators = {
  currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi'),
  newPassword: NewPasswordSchema,
}

/** The one message every failed reauthentication gets, whatever Firebase said. */
const REAUTH_FAILED = 'Kata sandi saat ini salah'

export function ChangePasswordForm({ email }: { email: string }) {
  // `false` on the server render AND on the first client render, so hydration
  // matches; the effect flips it only where JavaScript actually runs.
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  const [formError, setFormError] = useState<string | null>(null)
  /**
   * The one outcome that is neither success nor failure. Kept apart from
   * `formError` because it must NOT be retried: the password has already
   * changed, and a second attempt would fail against a credential that no longer
   * exists. So this state hides the form entirely rather than annotating it.
   */
  const [reconciliation, setReconciliation] = useState<string | null>(null)

  const form = useForm({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    onSubmit: async ({ value }) => {
      setFormError(null)

      // Step 1 — the proof. A wrong current password stops here, before the
      // sign-out below, so the ordinary mistake costs nothing.
      let idToken: string
      try {
        const credential = await signInWithEmailAndPassword(
          firebaseAuth(),
          email,
          value.currentPassword,
        )
        idToken = await credential.user.getIdToken()
      } catch {
        // Never surface the raw Firebase code — one generic, user-safe message.
        setFormError(REAUTH_FAILED)
        return
      }

      // Step 2 — drop the local credential while we still can. See the header.
      await signOut(firebaseAuth()).catch(() => {
        // A failed local sign-out is not a reason to abandon the change: the
        // server revocation below is the authority, and the leftover credential
        // is dead the moment it lands.
      })

      // Step 3 — hand the proof over. On success this never resolves: the action
      // clears the cookie and redirects to /login.
      const result = await settleAction(() =>
        changeOwnPasswordAction({ idToken, newPassword: value.newPassword }),
      )
      if (result.ok) return
      if (result.code === 'reconciliation_required') {
        setReconciliation(result.error)
        return
      }
      setFormError(result.error)
    },
  })

  if (reconciliation) {
    return (
      <div className="flex flex-col gap-3">
        {/* No retry control, deliberately: the password mutation LANDED. What is
            unfinished is session revocation or the audit record, and neither is
            something this screen can redo. */}
        <Alert role="alert">
          <AlertDescription>{reconciliation}</AlertDescription>
        </Alert>
        <SignOutButton />
      </div>
    )
  }

  if (!ready) {
    return (
      <noscript>
        <p className="text-sm text-muted-foreground">
          Formulir ini membutuhkan JavaScript. Mengganti kata sandi dimulai
          dengan verifikasi ulang ke Firebase Authentication langsung dari
          peramban Anda, dan langkah itu tidak dapat dijalankan oleh server.
          Aktifkan JavaScript untuk situs ini, lalu muat ulang halaman.
        </p>
      </noscript>
    )
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.Field
          name="currentPassword"
          validators={{ onBlur: clientValidators.currentPassword }}
        >
          {(field) => {
            const invalid = field.state.meta.errors.length > 0
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor={field.name}>
                  Kata sandi sementara
                </FieldLabel>
                {/* type="password" on every one of these three: a password field
                    is masked by DEFAULT here, with no reveal toggle, because the
                    value being typed is one the reader already has in front of
                    them on a chat or a support call. */}
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="current-password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={invalid}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )
          }}
        </form.Field>

        <form.Field
          name="newPassword"
          validators={{ onBlur: clientValidators.newPassword }}
        >
          {(field) => {
            const invalid = field.state.meta.errors.length > 0
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor={field.name}>Kata sandi baru</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="new-password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={invalid}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )
          }}
        </form.Field>

        <form.Field
          name="confirmPassword"
          validators={{
            // Cross-field, so it reads the whole form value rather than its own.
            // A mismatch is caught here and never reaches the server, which has
            // no second field to compare and should not grow one.
            onBlur: ({ value, fieldApi }) =>
              value === fieldApi.form.state.values.newPassword
                ? undefined
                : 'Konfirmasi tidak sama dengan kata sandi baru',
          }}
        >
          {(field) => {
            const invalid = field.state.meta.errors.length > 0
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor={field.name}>
                  Ulangi kata sandi baru
                </FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="new-password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={invalid}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )
          }}
        </form.Field>

        {formError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Menyimpan…
                  </>
                ) : (
                  'Simpan kata sandi baru'
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Setelah tersimpan, semua sesi akun ini diakhiri dan Anda perlu
                masuk kembali dengan kata sandi baru.
              </p>
            </>
          )}
        </form.Subscribe>

        <SignOutButton />
      </FieldGroup>
    </form>
  )
}
