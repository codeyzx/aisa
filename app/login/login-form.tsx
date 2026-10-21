'use client'

/**
 * Client sign-in form. Firebase email/password (browser straight to Google — the
 * password never reaches this origin) → ID token → `/api/auth/session`, which
 * sets the httpOnly session cookie; then a router refresh so server components
 * re-render authed.
 *
 * Canonical form pattern: TanStack Form (v1) + the shadcn `Field` primitives, a
 * zod v4 schema used directly as a Standard Schema validator (no adapter). The
 * per-field schema is attached on `onBlur`; the default validation logic re-runs
 * blur validators on submit, so a field surfaces its message on blur AND blocks
 * an invalid submit. `FieldError` reads the field's `meta.errors` directly.
 */
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from '@tanstack/react-form'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import * as z from 'zod'

import { establishSession } from '@/lib/auth/client'
import { ApiCallError } from '@/lib/api/envelope'
import { firebaseErrorCode } from '@/lib/firebase/error-code'
import { firebaseAuth } from '@/lib/firebase/client-auth'
import { safeInternalPath } from '@/lib/safe-path'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'

const schema = z.object({
  email: z.email('Email tidak valid'),
  password: z.string().min(1, 'Kata sandi wajib diisi'),
})

/**
 * Firebase's wrong-credential codes. Current SDKs answer every one of them with
 * `auth/invalid-credential` (email-enumeration protection); the older codes are
 * kept so an older project setting still reads as "wrong", not "unavailable".
 */
const WRONG_CREDENTIAL_CODES: ReadonlySet<string> = new Set([
  'auth/invalid-credential',
  'auth/invalid-login-credentials',
  'auth/wrong-password',
  'auth/user-not-found',
  'auth/invalid-email',
  'auth/user-disabled',
])

/** One user-safe sentence per failure; never the raw provider code. */
function signInErrorMessage(error: unknown): string {
  const code =
    error instanceof ApiCallError ? error.code : firebaseErrorCode(error)
  if (code === 'UNAUTHENTICATED' || (code && WRONG_CREDENTIAL_CODES.has(code)))
    return 'Email atau kata sandi salah'
  if (code === 'RESOURCE_EXHAUSTED' || code === 'auth/too-many-requests')
    return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.'
  return 'Tidak dapat masuk saat ini. Coba lagi.'
}

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Where proxy.ts sent the reader from (the path it preserved in `?next`),
  // validated down to a same-origin path so a crafted link cannot phish by
  // redirecting off-site after a successful sign-in. See lib/safe-path.ts.
  const nextValues = searchParams.getAll('next')
  const next = safeInternalPath(
    nextValues.length === 1 ? nextValues[0] : undefined,
    '/dashboard',
  )
  const [authError, setAuthError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const form = useForm({
    defaultValues: { email: '', password: '' },
    onSubmit: async ({ value }) => {
      setAuthError(null)
      try {
        const credential = await signInWithEmailAndPassword(
          firebaseAuth(),
          value.email,
          value.password,
        )
        try {
          await establishSession(await credential.user.getIdToken())
        } catch (error) {
          // No cookie was set, so drop the SDK's refresh token too: leaving it
          // would keep the account reachable from this browser while the page
          // says sign-in failed.
          await signOut(firebaseAuth()).catch(() => undefined)
          throw error
        }
        // Drop the Router Cache so server components re-render authed, then go.
        router.refresh()
        router.push(next)
      } catch (error) {
        setAuthError(signInErrorMessage(error))
      }
    },
  })

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Masuk ke AISA</CardTitle>
        <CardDescription>Gunakan email kerja yang terdaftar.</CardDescription>
      </CardHeader>
      <CardContent>
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
              name="email"
              validators={{ onBlur: schema.shape.email }}
            >
              {(field) => {
                const invalid = field.state.meta.errors.length > 0
                return (
                  <Field data-invalid={invalid || undefined}>
                    <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      autoComplete="email"
                      placeholder="nama@perusahaan.co.id"
                      className="border-input bg-transparent"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      aria-invalid={invalid}
                    />
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )
              }}
            </form.Field>

            <form.Field
              name="password"
              validators={{ onBlur: schema.shape.password }}
            >
              {(field) => {
                const invalid = field.state.meta.errors.length > 0
                return (
                  <Field data-invalid={invalid || undefined}>
                    <FieldLabel htmlFor={field.name}>Kata sandi</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id={field.name}
                        name={field.name}
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        aria-invalid={invalid}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          size="icon-xs"
                          aria-label={
                            showPassword
                              ? 'Sembunyikan password'
                              : 'Tampilkan password'
                          }
                          onClick={() => setShowPassword((shown) => !shown)}
                        >
                          {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )
              }}
            </form.Field>

            {authError ? (
              <Alert variant="destructive">
                <AlertDescription>{authError}</AlertDescription>
              </Alert>
            ) : null}

            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Field>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <Spinner /> : null}
                    Masuk
                  </Button>
                </Field>
              )}
            </form.Subscribe>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
