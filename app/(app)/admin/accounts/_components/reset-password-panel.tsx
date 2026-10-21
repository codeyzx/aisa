'use client'

/**
 * Admin password reset — the break-glass workflow, and the only control on this
 * surface that demands TWO deliberate inputs before it will run.
 *
 * ── WHY A REASON AND A CONFIRMATION, AND WHY BOTH ────────────────────────────
 * The REASON is required by the action itself (`ResetAccountPasswordSchema`) and
 * is the thing that gets recorded — the password never is. Months later, "who
 * authorised handing this person a working credential" is the question the audit
 * trail has to answer, and only the person pressing the button knows.
 *
 * The CONFIRMATION checkbox is this screen's own addition and answers a
 * different question: a reset ends every session the target holds and destroys
 * the password they are currently using. That is not undoable, and it is one
 * click away from the harmless controls above it. The checkbox is what makes it
 * two.
 *
 * ── THE ONE-TIME DISPLAY ─────────────────────────────────────────────────────
 * The minted password is rendered ONLY after an explicit `ok: true`, from client
 * state, by `TemporaryPasswordReveal` — never before, never from the URL, and
 * never a second time. Dismissing it drops the value; navigating away unmounts
 * the tree that holds it.
 */
import { useState } from 'react'
import { KeyRound, LoaderCircle } from 'lucide-react'

import { resetAccountPasswordAction } from '@/lib/actions/account.action'
import {
  AccountReasonSchema,
  type AccountSummary,
} from '@/lib/auth/account.contract'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { AccountActionStatus, useAccountAction } from './account-action-state'
import { TemporaryPasswordReveal } from './temporary-password-reveal'

export function ResetPasswordPanel({ account }: { account: AccountSummary }) {
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [issued, setIssued] = useState<string | null>(null)
  const { state, run, reset, locked } = useAccountAction<{
    temporaryPassword: string
  }>()

  const accountLabel = account.email ?? account.uid
  // The SAME bound the server parses with, read off the shared schema rather
  // than re-typed: a reason the client accepts and the server refuses would show
  // an opaque `invalid` in place of a message the reader could act on.
  const reasonValid = AccountReasonSchema.safeParse(reason).success

  if (issued) {
    return (
      <TemporaryPasswordReveal
        password={issued}
        accountLabel={accountLabel}
        onDismiss={() => {
          // Drops the only copy. The form comes back empty and un-confirmed, so
          // a second reset is as deliberate as the first was.
          setIssued(null)
          setReason('')
          setConfirmed(false)
          reset()
        }}
      />
    )
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="reset-reason">Alasan</FieldLabel>
        <Textarea
          id="reset-reason"
          rows={2}
          value={reason}
          placeholder="Mis. pengguna kehilangan akses, diminta lewat tiket #123"
          onChange={(event) => setReason(event.target.value)}
          disabled={state.kind === 'pending' || locked}
        />
        <FieldDescription>
          Alasan disimpan di riwayat akun. Kata sandi tidak pernah disimpan di
          mana pun.
        </FieldDescription>
      </Field>

      <Field orientation="horizontal">
        <Checkbox
          id="reset-confirm"
          checked={confirmed}
          disabled={state.kind === 'pending' || locked}
          onCheckedChange={(next) => setConfirmed(next === true)}
        />
        <Label htmlFor="reset-confirm" className="font-normal">
          Saya paham kata sandi {accountLabel} akan diganti dan semua sesinya
          diakhiri.
        </Label>
      </Field>

      <AccountActionStatus state={state} />

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={
            !reasonValid || !confirmed || state.kind === 'pending' || locked
          }
          onClick={() =>
            void run(
              () => resetAccountPasswordAction({ uid: account.uid, reason }),
              {
                successMessage: 'Kata sandi sementara diterbitkan.',
                onSuccess: (data) => setIssued(data.temporaryPassword),
              },
            )
          }
        >
          {state.kind === 'pending' ? (
            <>
              <LoaderCircle className="animate-spin" />
              Menyetel ulang…
            </>
          ) : (
            <>
              <KeyRound />
              Setel ulang kata sandi
            </>
          )}
        </Button>
      </div>
    </FieldGroup>
  )
}
