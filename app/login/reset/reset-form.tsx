'use client'

/**
 * Client password-reset REQUEST form. Sends a Firebase reset email, then shows a
 * neutral confirmation. Firebase owns the reset landing page the email links to;
 * this form only requests it. Same TanStack Form + Field pattern as login-form.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useForm } from '@tanstack/react-form'
import { sendPasswordResetEmail } from 'firebase/auth'
import { LoaderCircle } from 'lucide-react'
import * as z from 'zod'

import { firebaseAuth } from '@/lib/firebase/client-auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
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
})

export function ResetForm() {
  const [sent, setSent] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { email: '' },
    onSubmit: async ({ value }) => {
      setAuthError(null)
      try {
        await sendPasswordResetEmail(firebaseAuth(), value.email)
      } catch (error) {
        // Account-enumeration guard: a missing account is NOT a user-facing error
        // — show the same neutral confirmation so the form never reveals whether
        // an email is registered. Only a genuine failure (network/config) speaks.
        const code = (error as { code?: string }).code
        if (code !== 'auth/user-not-found' && code !== 'auth/invalid-email') {
          setAuthError('Tidak dapat mengirim tautan. Coba lagi nanti.')
          return
        }
      }
      setSent(true)
    },
  })

  if (sent) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Periksa email Anda</CardTitle>
          <CardDescription>
            Jika email tersebut terdaftar, kami telah mengirim tautan untuk
            mengatur ulang kata sandi Anda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Styled <Link>, not <Button render={<Link/>}> — see the note in
              data-table.tsx: Base UI's Button would stamp role="button" over the
              anchor's link role, and warns about it at runtime. */}
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
          >
            Kembali ke halaman masuk
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Atur ulang kata sandi</CardTitle>
        <CardDescription>
          Masukkan email akun Anda dan kami akan mengirimkan tautan untuk
          mengatur ulang kata sandi.
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
                      Mengirim…
                    </>
                  ) : (
                    'Kirim tautan atur ulang'
                  )}
                </Button>
              )}
            </form.Subscribe>

            {/* Styled <Link>, not <Button render={<Link/>}> — same reason as
                the confirmation card above. */}
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: 'ghost' }), 'w-full')}
            >
              Kembali ke halaman masuk
            </Link>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
