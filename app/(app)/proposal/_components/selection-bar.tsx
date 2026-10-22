'use client'

import { BanIcon, ThumbsUpIcon, XIcon } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Spinner } from '@/components/ui/spinner'
import { respondToProposalAction } from '@/features/aisa/aisa.action'
import { type ResponseKind } from '@/features/aisa/aisa.schema'
import { settleAction } from '@/lib/data/action.contract'

import { DECISION_LABEL } from '../../_components/badges'
import { type ProposalRow } from './proposal-row'

/**
 * The floating bar for the checked rows. `aisa-api` has no "respond to these
 * ids" call — its bulk call takes a whole grade — so each checked proposal
 * is answered through the single-proposal action, one after another. Every one
 * leaves its own history row, exactly as answering them one by one would.
 * Proposals that failed stay checked, and the toast names the API's reason.
 */
export function SelectionBar({
  rows,
  canRespond,
  onDone,
  onClear,
}: {
  rows: ProposalRow[]
  canRespond: boolean
  onDone: (ids: string[]) => void
  onClear: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [confirmReject, setConfirmReject] = useState(false)

  function act(kind: ResponseKind) {
    const targets = rows
    startTransition(async () => {
      const done: string[] = []
      let failure: string | null = null
      // Sequential on purpose: one proposal at a time keeps the API's write
      // order equal to the list order, and stops hammering it when it is down.
      for (const row of targets) {
        // oxlint-disable-next-line no-await-in-loop
        const result = await settleAction(() =>
          respondToProposalAction(row.id, kind),
        )
        const message = !result.ok
          ? result.error
          : !result.data.ok
            ? result.data.error
            : null
        if (message === null) done.push(row.id)
        else failure ??= message
      }
      onDone(done)
      setConfirmReject(false)
      if (done.length)
        toast.success(`${DECISION_LABEL[kind]}: ${done.length} proposal.`)
      if (failure)
        toast.error(
          `${targets.length - done.length} dari ${targets.length} proposal gagal: ${failure}`,
        )
    })
  }

  return (
    <section
      aria-label="Tanggapan massal"
      className="sticky bottom-4 z-10 mx-auto flex animate-in flex-wrap items-center gap-1 rounded-xl bg-foreground p-1.5 pl-4 text-background shadow-xl fade-in slide-in-from-bottom-2"
    >
      <span className="mr-2 text-sm font-medium tabular-nums">
        {rows.length} dipilih
      </span>
      {pending ? <Spinner className="mr-1" /> : null}
      {canRespond ? (
        <>
          <button
            className="a-bulk-btn"
            type="button"
            disabled={pending}
            onClick={() => act('setuju')}
          >
            <ThumbsUpIcon className="size-4" aria-hidden />
            Setujui
          </button>
          <button
            className="a-bulk-btn"
            type="button"
            disabled={pending}
            onClick={() => setConfirmReject(true)}
          >
            <BanIcon className="size-4" aria-hidden />
            Tolak
          </button>
        </>
      ) : null}
      <button
        className="a-bulk-btn"
        type="button"
        aria-label="Batalkan pilihan"
        disabled={pending}
        onClick={onClear}
      >
        <XIcon className="size-4" />
      </button>

      <AlertDialog
        open={confirmReject}
        onOpenChange={(next) => !pending && setConfirmReject(next)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tolak {rows.length} proposal?</AlertDialogTitle>
            <AlertDialogDescription>
              Proposal yang dipilih tidak dilanjutkan dan nanti dihapus otomatis
              sesuai masa retensi. Riwayatnya tetap tersimpan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => act('tolak')}
            >
              {pending ? <Spinner /> : null}
              Ya, tolak
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
