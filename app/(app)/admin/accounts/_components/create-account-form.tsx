'use client'

/**
 * Create an account, and reveal its temporary password exactly once.
 *
 * ── WHY THIS IS NOT A PROGRESSIVELY-ENHANCED `<form action={…}>` ─────────────
 * Every other create surface in this repo POSTs FormData to a form action and
 * redirects on success. This one cannot, and the reason is the credential:
 * `createAccountAction` returns a temporary password in the action RESULT, and
 * a redirect has nowhere to carry it. The only places a redirect could put it
 * are the URL (forbidden — it would land in history, the address bar, referrers
 * and any shared link) or durable storage (forbidden — the password is never
 * persisted, and `AccountStateSchema` is strict precisely so it cannot be).
 *
 * So this is a PROGRAMMATIC action call whose result stays in client state, and
 * `method="dialog"` on the form below is what makes that safe rather than merely
 * intended. Outside a <dialog> that is a native no-op, so a submit that happens
 * before or without hydration navigates nowhere and leaks nothing. This docblock
 * once claimed that safety while the code did not have it, and an unhydrated
 * submit really did GET the typed email into the address bar and history.
 * `onSubmit`'s preventDefault cannot do this job — it does not exist until React
 * hydrates, which is precisely the window that leaked.
 *
 * The scripting-OFF case is stated once at the root layout, for the whole app,
 * rather than repeated here: without JavaScript nobody can sign in at all, so no
 * reader ever reaches this screen. Do not add a second `<noscript>` here.
 *
 * A form that looks like it works and does not is the failure mode being
 * avoided; a stated requirement is not.
 *
 * ── WHAT HAPPENS ON SUCCESS ──────────────────────────────────────────────────
 * The form is REPLACED by the reveal panel. There is no state in which the
 * password is on screen beside a form that could mint another one, and no state
 * in which it is rendered before an explicit `ok: true`. Dismissing the panel
 * drops the value from state; navigating away unmounts it. Neither can be
 * undone — recovering a lost password is a fresh admin reset, which is an
 * audited act.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useForm } from '@tanstack/react-form'
import { LoaderCircle } from 'lucide-react'

import { createAccountAction } from '@/lib/actions/account.action'
import { CreateAccountSchema } from '@/lib/auth/account.contract'
import { ROLE_LABEL, ROLES, type Role } from '@/lib/auth/rbac'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { ChoiceSelect } from '@/components/ui/choice-select'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import { AccountActionStatus, useAccountAction } from './account-action-state'
import { TemporaryPasswordReveal } from './temporary-password-reveal'
import { ACCOUNTS_PATH, accountDetailHref } from '../search-params'

/**
 * Per-field validators, derived straight from the schema the SERVER parses with.
 * No rule and no message is restated here, so the client can never accept
 * something `CreateAccountSchema.parse` will refuse — or refuse something it
 * would have taken.
 */
const clientValidators = {
  email: CreateAccountSchema.shape.email,
  displayName: CreateAccountSchema.shape.displayName,
}

/** What a completed create leaves on screen. Held in state, never in the URL. */
interface CreatedAccount {
  uid: string
  email: string
  temporaryPassword: string
}

export function CreateAccountForm() {
  const [created, setCreated] = useState<CreatedAccount | null>(null)
  const { state, run, reset, locked } = useAccountAction<{
    uid: string
    temporaryPassword: string
  }>()

  const form = useForm({
    defaultValues: {
      email: '',
      displayName: '',
      // The LEAST-PRIVILEGED role is the default, and that is a security
      // decision rather than a convenience one: an admin who submits the form
      // without touching this field must not create an administrator by
      // accident. Promotion is a deliberate, audited second act.
      role: 'user' as Role,
    },
    onSubmit: async ({ value }) => {
      await run(() => createAccountAction(value), {
        successMessage: 'Akun dibuat.',
        onSuccess: (data) =>
          setCreated({
            uid: data.uid,
            email: value.email.trim(),
            temporaryPassword: data.temporaryPassword,
          }),
      })
    },
  })

  if (created) {
    return (
      <div className="flex flex-col gap-4">
        <TemporaryPasswordReveal
          password={created.temporaryPassword}
          accountLabel={created.email}
          onDismiss={() => {
            // Drops the ONLY copy this browser holds. Deliberately irreversible.
            setCreated(null)
            reset()
            form.reset()
          }}
        />
        <div className="flex items-center justify-end gap-2 border-t border-border pt-5">
          <Link
            href={ACCOUNTS_PATH}
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Kembali ke direktori
          </Link>
          <Link
            href={accountDetailHref(created.uid)}
            className={cn(buttonVariants())}
          >
            Buka akun
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form
      noValidate
      // `method="dialog"` on a form that is NOT inside a <dialog> is a native
      // no-op: the HTML form-submission algorithm aborts before it navigates.
      // That is the whole point here. `onSubmit`'s preventDefault only runs once
      // React has hydrated, so without it a submit before (or instead of)
      // hydration performed a real GET to this same URL — putting the typed
      // email into the address bar, history and any referrer, then re-rendering
      // an apparently-reset form having created nothing. Observed 2026-07-22:
      // `?email=nojs-created%40aixel.test&displayName=`. This attribute is what
      // makes the docblock above true rather than aspirational.
      method="dialog"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.Field
          name="email"
          validators={{ onBlur: clientValidators.email }}
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
                  autoComplete="off"
                  placeholder="orang@example.com"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    // A conflict is a fact about the email that was SUBMITTED,
                    // so it stops being true the moment the reader edits this
                    // field. Without clearing it the message survived every
                    // edit: typing a brand-new unused address still showed
                    // "Sudah ada akun dengan email ini.", and submitting a
                    // malformed one rendered TWO contradictory role="alert"
                    // elements at once (observed 2026-07-22).
                    if (state.kind === 'failed' && state.code === 'conflict') {
                      reset()
                    }
                    field.handleChange(event.target.value)
                  }}
                  aria-invalid={invalid}
                />
                {/* The `conflict` code is rendered HERE, on the field that
                    caused it, rather than as a form-level error: an email that
                    is already taken is a fact about this input, and
                    `action.contract.ts` surfaces it as a distinct code so a
                    create form can say so precisely. */}
                {state.kind === 'failed' && state.code === 'conflict' ? (
                  <p role="alert" className="text-sm text-destructive">
                    Sudah ada akun dengan email ini.
                  </p>
                ) : null}
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )
          }}
        </form.Field>

        <form.Field
          name="displayName"
          validators={{ onBlur: clientValidators.displayName }}
        >
          {(field) => {
            const invalid = field.state.meta.errors.length > 0
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor={field.name}>Nama tampilan</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
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

        <form.Field name="role">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>Peran</FieldLabel>
              {/* Options and labels both come from `rbac.ts` — `ROLES` owns the
                  set and `ROLE_LABEL` owns how each member is spelled. Adding a
                  role there makes it appear here with no edit. */}
              <ChoiceSelect
                id={field.name}
                size="default"
                value={field.state.value}
                values={ROLES}
                labels={ROLE_LABEL}
                onValueChange={field.handleChange}
              />
              <FieldDescription>
                Peran menentukan kapabilitas akun. Dapat diubah kapan saja dari
                halaman akun.
              </FieldDescription>
            </Field>
          )}
        </form.Field>

        {/* The conflict case already has a field-level message above, so it is
            not repeated here — every OTHER outcome (pending is the button's own
            spinner, plus failed / unavailable / partial) shows once, here. */}
        {state.kind === 'failed' && state.code === 'conflict' ? null : (
          <AccountActionStatus state={state} />
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-5">
          <Link
            href={ACCOUNTS_PATH}
            replace
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Batal
          </Link>
          <form.Subscribe selector={(formState) => formState.canSubmit}>
            {(canSubmit) => (
              <Button
                type="submit"
                // `locked` is the reconciliation case: an account may have been
                // created while its audit or initialization did not complete, so
                // pressing Create again could mint a SECOND account for the same
                // person. There is no retry offered for that outcome.
                disabled={!canSubmit || state.kind === 'pending' || locked}
              >
                {state.kind === 'pending' ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Membuat…
                  </>
                ) : (
                  'Buat akun'
                )}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </FieldGroup>
    </form>
  )
}
