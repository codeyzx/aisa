'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { uploadDeckAction } from '@/features/aisa/aisa.action'
import { deckRefusal } from '@/features/aisa/aisa.limits'

import { notifyDeckUploaded } from './tour/tour-events'
import { useApiAction } from './use-api-action'

/**
 * "Unggah proposal": a PDF plus an optional startup name, forwarded to the
 * same intake `aisa-api` runs for the Form. Scoring is asynchronous, so success
 * opens the new proposal, which shows `Antre`/`Sedang dinilai` and refreshes
 * itself until it is done. A deck uploaded before opens its existing proposal
 * and says so. A refusal — checked here or by the API — shows inline and as a
 * toast, in the same sentence form either way.
 */
export function UploadDeckButton({ className }: { className?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const { pending, error, run } = useApiAction()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError(null)
    const data = new FormData(event.currentTarget)
    const refusal = deckRefusal(data.get('file'))
    if (refusal !== null) {
      setLocalError(refusal)
      toast.error(refusal)
      return
    }
    run(() => uploadDeckAction(data), {
      success: ({ created }) =>
        created
          ? 'Proposal diterima dan sedang diproses.'
          : 'Proposal ini sudah pernah diunggah. Membuka yang sudah ada.',
      onSuccess: ({ proposalId }) => {
        // Before the dialog closes, so a running tour never mistakes the
        // close for a cancel.
        if (proposalId) notifyDeckUploaded(proposalId)
        formRef.current?.reset()
        setOpen(false)
        if (proposalId)
          router.push(`/proposal/${encodeURIComponent(proposalId)}`)
      },
    })
  }

  const shown = localError ?? error
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button className={className} />}
        data-tour="upload"
      >
        <UploadIcon data-icon="inline-start" />
        Unggah proposal
      </DialogTrigger>
      <DialogContent data-tour="upload-dialog">
        <DialogHeader>
          <DialogTitle>Unggah proposal</DialogTitle>
          <DialogDescription>
            PDF dinilai lewat alur yang sama dengan Form. Hanya teksnya yang
            dikirim ke model, kecuali proposal hasil pindai: PDF-nya dibaca AI
            sebagai gambar.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="deck-file">Berkas PDF</Label>
            <Input
              id="deck-file"
              name="file"
              type="file"
              accept="application/pdf,.pdf"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deck-name">Nama startup (opsional)</Label>
            <Input id="deck-name" name="name" maxLength={120} />
          </div>
          {shown ? (
            <Alert variant="destructive">
              <AlertDescription>{shown}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Mengunggah…' : 'Unggah'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
