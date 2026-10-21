'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadIcon } from 'lucide-react'

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
import { MAX_DECK_BYTES } from '@/features/aisa/aisa.limits'

import { useApiAction } from './use-api-action'

/**
 * "Unggah pitch deck": a PDF plus an optional startup name, forwarded to the
 * same intake `aisa-api` runs for the Form. Scoring is asynchronous, so success
 * opens the new proposal, which shows `Antre`/`Sedang dinilai` until it is done.
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
    const file = data.get('file')
    if (!(file instanceof File) || file.size === 0) {
      setLocalError('Pilih berkas PDF.')
      return
    }
    if (file.size > MAX_DECK_BYTES) {
      setLocalError(
        `Berkas terlalu besar (maksimal ${MAX_DECK_BYTES / 1024 / 1024} MB).`,
      )
      return
    }
    run(() => uploadDeckAction(data), {
      success: 'Pitch deck diterima dan sedang diproses.',
      onSuccess: ({ proposalId }) => {
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
      <DialogTrigger render={<Button className={className} />}>
        <UploadIcon data-icon="inline-start" />
        Unggah pitch deck
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unggah pitch deck</DialogTitle>
          <DialogDescription>
            PDF dinilai lewat alur yang sama dengan Form. Hanya teks yang
            dikirim ke model.
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
