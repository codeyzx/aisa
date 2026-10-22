'use client'

import { BanIcon, CheckIcon, ThumbsUpIcon } from 'lucide-react'
import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { respondToProposalAction } from '@/features/aisa/aisa.action'
import { RESPONSE_LABEL, RESPONSE_MEANING } from '@/features/aisa/aisa.labels'
import { MAX_REASON_LENGTH } from '@/features/aisa/aisa.limits'
import { type ResponseKind } from '@/features/aisa/aisa.schema'
import { cn } from '@/lib/utils'

import { useApiAction } from '../../_components/use-api-action'

/**
 * Setuju / Tolak with an optional note — the decision is the manager's. Setuju
 * sends at once; Tolak is drawn apart from it and asks once more inside the card,
 * since a rejected proposal is later deleted by retention. The current answer is
 * marked and cannot be sent again (the API would only write a duplicate history
 * row).
 */
export function RespondPanel({
  proposalId,
  proposalName,
  current,
  retentionDays,
}: {
  proposalId: string
  proposalName: string
  current: ResponseKind | null
  /** From the active rules; `null` when no rules are stored yet. */
  retentionDays: number | null
}) {
  const [note, setNote] = useState('')
  const [confirmReject, setConfirmReject] = useState(false)
  const { pending, error, run } = useApiAction()

  function respond(kind: ResponseKind) {
    run(() => respondToProposalAction(proposalId, kind, note), {
      success: `Keputusan tersimpan: ${RESPONSE_LABEL[kind]}.`,
      onSuccess: () => {
        setNote('')
        setConfirmReject(false)
      },
      onError: () => setConfirmReject(false),
    })
  }

  const isApproved = current === 'setuju'
  const isRejected = current === 'tolak'

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={pending || isApproved}
        aria-pressed={isApproved}
        onClick={() => respond('setuju')}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-default',
          isApproved
            ? 'border-success bg-success-soft'
            : 'border-success/40 hover:bg-success-soft disabled:opacity-60',
        )}
      >
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-lg',
            isApproved
              ? 'bg-success text-white'
              : 'bg-success-soft text-success',
          )}
        >
          <ThumbsUpIcon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            {RESPONSE_LABEL.setuju}
          </span>
          <span className="block text-xs text-muted-foreground">
            {RESPONSE_MEANING.setuju}
          </span>
        </span>
        {isApproved ? (
          <CheckIcon
            className="size-4 text-success"
            aria-label="Pilihan saat ini"
          />
        ) : null}
      </button>

      {confirmReject ? (
        <fieldset className="space-y-2 rounded-xl border border-destructive/50 bg-destructive/5 p-3">
          <legend className="float-left w-full text-sm font-semibold">
            Tolak {proposalName}?
          </legend>
          <p className="text-xs text-muted-foreground">
            Proposal tidak dilanjutkan.
            {retentionDays
              ? ` Proposal yang ditolak dihapus otomatis setelah ${retentionDays} hari.`
              : ''}{' '}
            Riwayatnya tetap tersimpan.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => respond('tolak')}
            >
              Ya, tolak
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirmReject(false)}
            >
              Batal
            </Button>
          </div>
        </fieldset>
      ) : (
        <button
          type="button"
          disabled={pending || isRejected}
          aria-pressed={isRejected}
          onClick={() => setConfirmReject(true)}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl border border-dashed p-3 text-left transition-colors disabled:cursor-default',
            isRejected
              ? 'border-solid border-destructive bg-destructive/5'
              : 'hover:border-destructive/60 hover:bg-destructive/5 disabled:opacity-60',
          )}
        >
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-lg',
              isRejected
                ? 'bg-destructive text-white'
                : 'bg-muted text-destructive',
            )}
          >
            <BanIcon className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {RESPONSE_LABEL.tolak}
            </span>
            <span className="block text-xs text-muted-foreground">
              {RESPONSE_MEANING.tolak}
            </span>
          </span>
          {isRejected ? (
            <CheckIcon
              className="size-4 text-destructive"
              aria-label="Pilihan saat ini"
            />
          ) : null}
        </button>
      )}

      <Input
        aria-label="Catatan (opsional)"
        placeholder="Catatan untuk keputusan (opsional)"
        value={note}
        maxLength={MAX_REASON_LENGTH}
        onChange={(event) => setNote(event.target.value)}
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <p className="pt-1 text-xs text-muted-foreground">
        Bisa juga lewat WhatsApp: ketik “setuju {proposalName}” atau “tolak{' '}
        {proposalName}”.
      </p>
    </div>
  )
}
