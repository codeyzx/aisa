'use client'

import {
  ArchiveIcon,
  CheckIcon,
  EyeIcon,
  MailIcon,
  type LucideIcon,
} from 'lucide-react'
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
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { respondToProposalAction } from '@/features/aisa/aisa.action'
import { RESPONSE_LABEL } from '@/features/aisa/aisa.labels'
import { MAX_REASON_LENGTH } from '@/features/aisa/aisa.limits'
import { type ResponseKind } from '@/features/aisa/aisa.schema'
import { cn } from '@/lib/utils'

import { useApiAction } from '../../_components/use-api-action'

const BUTTONS: { value: ResponseKind; hint: string; icon: LucideIcon }[] = [
  { value: 'undang', hint: 'Ajak founder diskusi', icon: MailIcon },
  { value: 'pantau', hint: 'Lihat lagi nanti', icon: EyeIcon },
  { value: 'arsipkan', hint: 'Tidak dilanjutkan', icon: ArchiveIcon },
]

/**
 * Undang / Pantau / Arsipkan with an optional note — the decision is the
 * manager's. Arsipkan asks once more; the current answer is marked and cannot
 * be sent again (the API would only write a duplicate history row).
 */
export function RespondPanel({
  proposalId,
  proposalName,
  current,
}: {
  proposalId: string
  proposalName: string
  current: ResponseKind | null
}) {
  const [note, setNote] = useState('')
  const [confirmArchive, setConfirmArchive] = useState(false)
  const { pending, error, run } = useApiAction()

  function respond(kind: ResponseKind) {
    run(() => respondToProposalAction(proposalId, kind, note), {
      success: `Tanggapan tersimpan: ${RESPONSE_LABEL[kind]}.`,
      onSuccess: () => {
        setNote('')
        setConfirmArchive(false)
      },
      onError: () => setConfirmArchive(false),
    })
  }

  return (
    <div className="space-y-2">
      {BUTTONS.map((item) => {
        const on = current === item.value
        return (
          <button
            key={item.value}
            type="button"
            disabled={pending || on}
            aria-pressed={on}
            onClick={() =>
              item.value === 'arsipkan'
                ? setConfirmArchive(true)
                : respond(item.value)
            }
            className={cn(
              'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
              on
                ? 'border-primary bg-primary/5'
                : 'hover:bg-muted/60 disabled:opacity-60',
            )}
          >
            <span
              className={cn(
                'grid size-9 shrink-0 place-items-center rounded-lg',
                on
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              <item.icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                {RESPONSE_LABEL[item.value]}
              </span>
              <span className="block text-xs text-muted-foreground">
                {item.hint}
              </span>
            </span>
            {on ? <CheckIcon className="size-4 text-primary" /> : null}
          </button>
        )
      })}
      <Input
        aria-label="Catatan (opsional)"
        placeholder="Catatan untuk tanggapan (opsional)"
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
        Bisa juga lewat WhatsApp: ketik “undang {proposalName}”.
      </p>

      <AlertDialog
        open={confirmArchive}
        onOpenChange={(next) => !pending && setConfirmArchive(next)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arsipkan {proposalName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Proposal ini tidak lagi muncul di daftar yang perlu ditanggapi.
              Riwayatnya tetap tersimpan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => respond('arsipkan')}
            >
              Arsipkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
