'use client'

/**
 * The two access mutations that are not the password: enable/disable, and
 * sign-out-everywhere.
 *
 * They are kept as SEPARATE controls on purpose, mirroring the split the actions
 * themselves make: "sign this person out of the laptop they left on a train" and
 * "this person may no longer use the application" are different decisions, and
 * collapsing them would make the cheap reversible one cost the expensive one.
 *
 * DISABLE wears `destructive`; enable and sign-out do not. Colour is what
 * separates the action that removes access from the one beside it, and only the
 * removal earns it — red keeps its meaning only if nothing next to it borrows it.
 *
 * ── WHY NOT `ConfirmDialog` ──────────────────────────────────────────────────
 * `ConfirmDialog` collapses every failure into one inline error beside a live
 * Confirm button. For `reconciliation_required` that is exactly wrong: the
 * mutation LANDED, and offering a retry is the harm the two-step audit protocol
 * exists to prevent. These controls read the state machine in
 * `account-action-state.tsx` and remove themselves in that case.
 */
import { LoaderCircle, LogOut, ShieldCheck, ShieldOff } from 'lucide-react'

import {
  disableAccountAction,
  enableAccountAction,
  signOutAccountSessionsAction,
} from '@/lib/actions/account.action'
import type { AccountSummary } from '@/lib/auth/account.contract'
import { Button } from '@/components/ui/button'

import { AccountActionStatus, useAccountAction } from './account-action-state'

export function AccountStateActions({ account }: { account: AccountSummary }) {
  // One runner per operation, so a refusal on the disable button cannot appear
  // to be the sign-out button's answer.
  const access = useAccountAction<AccountSummary>()
  const sessions = useAccountAction<void>()

  const accountLabel = account.email ?? account.uid

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {account.disabled ? (
            <Button
              type="button"
              size="sm"
              disabled={access.state.kind === 'pending' || access.locked}
              onClick={() =>
                void access.run(
                  () => enableAccountAction({ uid: account.uid }),
                  { successMessage: 'Akun diaktifkan kembali.' },
                )
              }
            >
              {access.state.kind === 'pending' ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <ShieldCheck />
              )}
              Aktifkan akun
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={access.state.kind === 'pending' || access.locked}
              onClick={() =>
                void access.run(
                  () => disableAccountAction({ uid: account.uid }),
                  { successMessage: 'Akun dinonaktifkan.' },
                )
              }
            >
              {access.state.kind === 'pending' ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <ShieldOff />
              )}
              Nonaktifkan akun
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Menonaktifkan akun mengakhiri semua sesinya dan menolak setiap upaya
          masuk berikutnya. Mengaktifkan kembali tidak mengubah kata sandi —
          pemiliknya masuk lagi dengan kata sandi yang sama.
        </p>
        <AccountActionStatus state={access.state} />
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={sessions.state.kind === 'pending' || sessions.locked}
            onClick={() =>
              void sessions.run(
                () => signOutAccountSessionsAction({ uid: account.uid }),
                {
                  successMessage: `Semua sesi ${accountLabel} telah diakhiri.`,
                },
              )
            }
          >
            {sessions.state.kind === 'pending' ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <LogOut />
            )}
            Keluarkan semua sesi
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Akun tetap aktif dan kata sandinya tidak berubah; hanya sesi yang
          sedang berjalan yang diakhiri. Sesi Anda sendiri tidak terpengaruh.
        </p>
        <AccountActionStatus state={sessions.state} />
      </div>
    </div>
  )
}
