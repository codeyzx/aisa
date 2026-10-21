'use client'

/**
 * The two profile mutations an administrator can make to another account:
 * display name, and role.
 *
 * They are two forms and two actions rather than one "save profile", and that
 * separation is the point. A display-name change grants nothing and does NOT
 * revoke sessions; a role change moves authority and revokes every session the
 * target holds (the role lives in a claim baked into the session cookie, so
 * without revocation a demoted admin keeps their old authority for up to five
 * days). Merging them behind one button would make fixing a typo cost the target
 * their session, and would hide the moment where authority actually moves.
 *
 * Both sit inline on the detail page. Neither is a dialog: `one-surface-per-url`
 * and the reason behind it (a Base UI dialog cannot server-render) push every
 * account surface toward full pages and inline forms.
 */
import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { LoaderCircle } from 'lucide-react'

import {
  updateAccountNameAction,
  updateAccountRoleAction,
} from '@/lib/actions/account.action'
import {
  UpdateAccountNameSchema,
  type AccountSummary,
} from '@/lib/auth/account.contract'
import { ROLE_LABEL, ROLES, type Role } from '@/lib/auth/rbac'
import { Button } from '@/components/ui/button'
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

export function AccountNameForm({ account }: { account: AccountSummary }) {
  const { state, run, locked } = useAccountAction<AccountSummary>()

  const form = useForm({
    // `?? ''` because the DTO models "no display name" as null while a text
    // input must hold a string. Submitting an untouched empty field is refused
    // by `AccountDisplayNameSchema.min(1)` on both sides, which is correct — an
    // account with no name keeps none until someone chooses one.
    defaultValues: { displayName: account.displayName ?? '' },
    onSubmit: async ({ value }) => {
      await run(
        () =>
          updateAccountNameAction({
            uid: account.uid,
            displayName: value.displayName,
          }),
        { successMessage: 'Nama tampilan diperbarui.' },
      )
    },
  })

  return (
    <form
      noValidate
      // A native no-op outside a <dialog>, for the same reason the account
      // CREATE form carries it: `onSubmit`'s preventDefault does not exist until
      // React hydrates, so an unhydrated submit here performed a real GET and
      // came back showing the OLD name with no error — observed 2026-07-22 as
      // `?displayName=NOJS-Rename`. A rename that silently does nothing while
      // looking like it worked is worse than one that is plainly unavailable.
      method="dialog"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.Field
          name="displayName"
          validators={{ onBlur: UpdateAccountNameSchema.shape.displayName }}
        >
          {(field) => {
            const invalid = field.state.meta.errors.length > 0
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor="account-display-name">
                  Nama tampilan
                </FieldLabel>
                <Input
                  id="account-display-name"
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={invalid}
                />
                <FieldDescription>
                  Mengubah nama tidak mengakhiri sesi pengguna — nama tidak
                  memberi wewenang apa pun.
                </FieldDescription>
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )
          }}
        </form.Field>

        <AccountActionStatus state={state} />

        <div className="flex justify-end">
          <form.Subscribe selector={(formState) => formState.canSubmit}>
            {(canSubmit) => (
              <Button
                type="submit"
                size="sm"
                disabled={!canSubmit || state.kind === 'pending' || locked}
              >
                {state.kind === 'pending' ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Menyimpan…
                  </>
                ) : (
                  'Simpan nama'
                )}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </FieldGroup>
    </form>
  )
}

/**
 * The role control. Plain `useState` rather than TanStack Form: there is one
 * field, it is a closed enum, and there is nothing to validate that the type
 * does not already guarantee.
 *
 * The button stays enabled for a SELF-demotion even though the server refuses
 * it. That is deliberate: `admin_lockout` carries a specific remedy ("have
 * another administrator do it, or promote one first"), and an administrator who
 * finds the control greyed out with no explanation learns nothing. The refusal
 * is the explanation, and it is server-authoritative either way.
 */
export function AccountRoleForm({ account }: { account: AccountSummary }) {
  const [role, setRole] = useState<Role>(account.role)
  const { state, run, locked } = useAccountAction<AccountSummary>()

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="account-role">Peran</FieldLabel>
        <ChoiceSelect
          id="account-role"
          size="default"
          value={role}
          values={ROLES}
          labels={ROLE_LABEL}
          disabled={state.kind === 'pending' || locked}
          onValueChange={setRole}
        />
        <FieldDescription>
          Mengubah peran mengakhiri semua sesi akun ini. Peran tersimpan di
          klaim token, sehingga tanpa pengakhiran sesi wewenang lama masih
          berlaku sampai cookie kedaluwarsa.
        </FieldDescription>
      </Field>

      <AccountActionStatus state={state} />

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={role === account.role || state.kind === 'pending' || locked}
          onClick={() =>
            void run(
              () => updateAccountRoleAction({ uid: account.uid, role }),
              {
                successMessage: `Peran diubah menjadi ${ROLE_LABEL[role]}.`,
              },
            )
          }
        >
          {state.kind === 'pending' ? (
            <>
              <LoaderCircle className="animate-spin" />
              Menyimpan…
            </>
          ) : (
            'Simpan peran'
          )}
        </Button>
      </div>
    </FieldGroup>
  )
}
