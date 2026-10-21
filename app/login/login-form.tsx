'use client'

/**
 * Client sign-in form. Firebase email/password → ID token → server session
 * cookie, then a router refresh so server components re-render authed.
 *
 * Canonical form pattern: TanStack Form (v1) + the shadcn `Field` primitives, a
 * zod v4 schema used directly as a Standard Schema validator (no adapter). The
 * per-field schema is attached on `onBlur`; the default validation logic re-runs
 * blur validators on submit, so a field surfaces its message on blur AND blocks
 * an invalid submit. `FieldError` reads the field's `meta.errors` directly.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from '@tanstack/react-form'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { LoaderCircle } from 'lucide-react'
import * as z from 'zod'

import { establishSession } from '@/lib/auth/client'
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

const schema = z.object({
  email: z.email('Email tidak valid'),
  password: z.string().min(1, 'Kata sandi wajib diisi'),
})

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
        const idToken = await credential.user.getIdToken()
        await establishSession(idToken)
        // Drop the Router Cache so server components re-render authed, then go.
        router.refresh()
        router.push(next)
      } catch {
        // Never surface the raw Firebase code — one generic, user-safe message.
        setAuthError('Email atau kata sandi salah')
      }
    },
  })

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Masuk</CardTitle>
        <CardDescription>
          Masukkan kredensial Anda untuk mengakses akun.
        </CardDescription>
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
                      placeholder="you@example.com"
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
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
                      autoComplete="current-password"
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

            {authError ? (
              <Alert variant="destructive">
                <AlertDescription>{authError}</AlertDescription>
              </Alert>
            ) : null}

            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <LoaderCircle className="animate-spin" />
                      Sedang masuk…
                    </>
                  ) : (
                    'Masuk'
                  )}
                </Button>
              )}
            </form.Subscribe>

            <div className="text-center text-sm">
              <Link
                href="/login/reset"
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Lupa kata sandi?
              </Link>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
