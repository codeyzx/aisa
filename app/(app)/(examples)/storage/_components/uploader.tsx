'use client'

/**
 * The storage demo: pick a file -> presigned direct PUT -> key -> download /
 * delete. `useUpload` owns the two-hop flow and its own status, so this
 * component only renders it.
 *
 * The uploaded keys are kept in local state ON PURPOSE. A real feature persists
 * the key on a Firestore doc the moment the upload resolves — that key is the
 * ONLY durable handle to the object, and an upload whose key is never written
 * down is an orphan billing you forever. This demo has no entity to hang it on,
 * so the list resets on reload; that is the one thing here you should not copy.
 *
 * The thing you SHOULD copy is the `assets` reference feature, which does persist
 * the key and reaps the object on delete/replace — see
 * `docs/explanation/architecture.md` ("Why `assets` exists") and
 * `app/(app)/(examples)/assets/`. This demo
 * is the seam; that vertical is the seam wired into a real entity.
 */
import * as React from 'react'
import { Download, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'

import { useUpload } from '@/hooks/use-upload'
import { settleAction } from '@/lib/data/action.contract'
import { MAX_UPLOAD_BYTES } from '@/lib/storage/limits'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { FilePicker } from '@/components/ui/file-picker'
import { Spinner } from '@/components/ui/spinner'

import { deleteObjectAction, presignDownloadAction } from '../_actions'

export function Uploader() {
  const { upload, status, error } = useUpload()
  const [keys, setKeys] = React.useState<string[]>([])

  async function onPick(file: File) {
    const key = await upload(file)
    if (key) {
      setKeys((current) => [key, ...current])
      toast.success('Terunggah', { description: file.name })
    }
  }

  async function onDownload(key: string) {
    const result = await settleAction(() => presignDownloadAction(key))
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    // Presigned GET: the browser fetches straight from storage, not through us.
    window.open(result.data, '_blank', 'noopener,noreferrer')
  }

  React.useEffect(() => {
    if (status === 'error' && error) toast.error(error)
  }, [status, error])

  const isUploading = status === 'uploading'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FilePicker
          label="Pilih berkas"
          busy={isUploading}
          onPick={onPick}
          trigger={
            <Button>
              {isUploading ? <Spinner /> : <Upload />}
              {isUploading ? 'Mengunggah…' : 'Pilih berkas'}
            </Button>
          }
        />
        <p className="text-sm text-muted-foreground">
          Maksimal {MAX_UPLOAD_BYTES / 1024 / 1024} MB. Langsung ke object
          storage — byte tidak pernah menyentuh server aplikasi.
        </p>
      </div>

      {keys.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Belum ada yang diunggah</EmptyTitle>
            <EmptyDescription>
              Objek yang diunggah muncul di sini beserta storage key-nya.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y divide-border rounded-md border">
          {keys.map((key) => (
            <li key={key} className="flex items-center gap-3 p-3">
              <code className="min-w-0 flex-1 truncate text-xs">{key}</code>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Unduh ${key}`}
                onClick={() => onDownload(key)}
              >
                <Download />
              </Button>
              <ConfirmDialog
                destructive
                trigger={
                  <Button
                    variant="destructive"
                    size="icon-sm"
                    aria-label={`Hapus ${key}`}
                  >
                    <Trash2 />
                  </Button>
                }
                title="Hapus objek ini?"
                description="Objek dihapus dari object storage. Ini tidak dapat dibatalkan."
                confirmText="Hapus"
                onConfirm={() => deleteObjectAction(key)}
                onSuccess={() => {
                  setKeys((current) => current.filter((k) => k !== key))
                  toast.success('Dihapus')
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
