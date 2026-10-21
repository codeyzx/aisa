'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { deleteProposalAction } from '@/features/aisa/aisa.action'
import { MAX_REASON_LENGTH } from '@/features/aisa/aisa.limits'

import { useApiAction } from '../../_components/use-api-action'

/**
 * "Hapus data": permanently delete one proposal after a confirmation that needs
 * a reason. The dialog stays open on failure so the API's own message can be
 * read; on success the manager lands on /proposal with a toast.
 */
export function DeleteProposalButton({
  proposalId,
  proposalName,
}: {
  proposalId: string
  proposalName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const { pending, error, run } = useApiAction()

  function confirm() {
    if (!reason.trim()) {
      setLocalError('Alasan penghapusan wajib diisi.')
      return
    }
    setLocalError(null)
    run(() => deleteProposalAction(proposalId, reason), {
      success: `Data proposal ${proposalName} dihapus.`,
      onSuccess: () => {
        setOpen(false)
        router.replace('/proposal')
      },
    })
  }

  const shown = localError ?? error
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        if (!next) setLocalError(null)
        setOpen(next)
      }}
    >
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        Hapus data
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus data {proposalName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Proposal, teks, pitch deck, dan log penilaiannya dihapus permanen.
            Riwayat tetap ada tanpa nama proposal.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label htmlFor="delete-reason" className="grid gap-1 text-sm">
          Alasan (wajib)
          <Textarea
            id="delete-reason"
            placeholder="mis. permintaan founder"
            value={reason}
            maxLength={MAX_REASON_LENGTH}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {shown ? (
          <Alert variant="destructive">
            <AlertDescription>{shown}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            focusableWhenDisabled
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            disabled={pending}
            onClick={confirm}
          >
            {pending ? <Spinner /> : null}
            Hapus permanen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
