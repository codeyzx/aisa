'use client'

/**
 * The asset form's attachment control — the reference feature's answer to the
 * storage demo's warning ("a real feature persists the key on a Firestore doc").
 *
 * It reuses the HOOK, not the demo: `useUpload` owns the presigned
 * two-hop flow (POST /api/storage/upload-url -> PUT straight to storage), and
 * this component keeps the ONE thing the demo could not — the resolved key,
 * carried into the form so it lands on the asset doc. `Uploader` (the storage
 * example) and this field share that hook and differ only in what they do with
 * the key, which is exactly the gap this field exists to close. It does NOT import
 * from the storage example: that would break the one-shot `trash (app)/(examples)`
 * removal in both directions.
 *
 * THE JS FLOOR: a presigned upload is two client fetches, so it cannot
 * happen without JS. The hidden input below carries the key AFTER the upload
 * resolves — same trick the status Select uses — so without JS the form still
 * submits and still creates the asset; it just has no attachment. Degradation,
 * not breakage. The size limit is the browser pre-flight in `useUpload`; the real
 * ceiling is signed into the URL server-side.
 */
import * as React from 'react'
import { Download, LoaderCircle, Paperclip, Upload, X } from 'lucide-react'
import { toast } from 'sonner'

import { presignAssetAttachmentAction } from '@/features/asset/asset.action'
import { useUpload } from '@/hooks/use-upload'
import { settleAction } from '@/lib/data/action.contract'
import { filenameFromKey } from '@/lib/storage/keys'
import { MAX_UPLOAD_BYTES } from '@/lib/storage/limits'
import { Button } from '@/components/ui/button'
import { FilePicker } from '@/components/ui/file-picker'

interface AttachmentFieldProps {
  /** The form field name — the hidden input posts the key under it. */
  name: string
  /** Current key ('' when none). Controlled by the TanStack field upstream. */
  value: string
  /** Hand the resolved key (or '' to clear) back to the form field. */
  onChange: (key: string) => void
  /**
   * The asset's id, on the EDIT page only — create has no persisted asset yet.
   * Download is requested by this id, never by a key.
   */
  assetId?: string
  /**
   * The attachment key already ON THE DOC when the form loaded. Download is
   * offered only while `value` still equals it: the moment the reader replaces
   * the file, the new key is not on the doc yet, so a download-by-id would hand
   * back the OLD file. Honest to hide it until they save.
   */
  persistedKey?: string
  /**
   * Report whether an upload is in flight, so the FORM can refuse to submit
   * while one is.
   *
   * This lifts state rather than keeping it local because the race is not this
   * control's to lose: `onChange` fires only when an upload RESOLVES, so between
   * picking a file and the PUT completing the field still holds the OLD key.
   * A submit in that window saves the old key and strands the new object —
   * a save that silently did not do what the screen showed. The control is the
   * only thing that knows an upload is running; the submit button is the only
   * thing that can refuse. So the fact has to travel.
   */
  onUploadingChange?: (uploading: boolean) => void
}

export function AttachmentField({
  name,
  value,
  onChange,
  assetId,
  persistedKey,
  onUploadingChange,
}: AttachmentFieldProps) {
  const { upload, status, error } = useUpload()
  const [isDownloading, setIsDownloading] = React.useState(false)

  // The current attachment is downloadable only when it is the one on the doc:
  // an id-keyed download reads the doc, so a just-replaced-but-unsaved key would
  // resolve to the previous file.
  const canDownload = Boolean(assetId && value && value === persistedKey)

  async function onDownload() {
    if (!assetId) return
    setIsDownloading(true)
    const result = await settleAction(() =>
      presignAssetAttachmentAction(assetId),
    )
    setIsDownloading(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    // Presigned GET: the browser fetches straight from storage, not through us.
    window.open(result.data, '_blank', 'noopener,noreferrer')
  }

  async function onPick(file: File) {
    const key = await upload(file)
    if (key) {
      onChange(key)
      toast.success('Terlampir', { description: file.name })
    }
  }

  React.useEffect(() => {
    if (status === 'error' && error) toast.error(error)
  }, [status, error])

  const isUploading = status === 'uploading'

  // Mirror the in-flight flag to the form. An effect, not a call inside
  // `onPick`, so the UNMOUNT case is covered too: a control that disappears
  // mid-upload (a conditional field, a step change) would otherwise leave the
  // form disabled forever with nothing left on screen to explain why.
  React.useEffect(() => {
    onUploadingChange?.(isUploading)
    return () => onUploadingChange?.(false)
  }, [isUploading, onUploadingChange])

  return (
    <div className="flex flex-col gap-2">
      {/* Carries the key into the POSTed FormData. `type="hidden"`, so it is the
          form's value even though the file input below is never submitted (the
          bytes went straight to storage, not through this form). */}
      <input type="hidden" name={name} value={value} />
      {value ? (
        <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <Paperclip className="size-4 shrink-0 text-muted-foreground" />
          {/* The SANITIZED name (see filenameFromKey) — the key's own copy, not a
              hand-split of it. `min-w-0 truncate` so a long name does not push the
              buttons off the row. */}
          <span className="min-w-0 flex-1 truncate">
            {filenameFromKey(value)}
          </span>
          {canDownload && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Unduh ${filenameFromKey(value)}`}
              disabled={isDownloading}
              onClick={onDownload}
            >
              {isDownloading ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Download />
              )}
            </Button>
          )}
          <FilePicker
            label="Ganti lampiran"
            busy={isUploading}
            onPick={onPick}
            trigger={
              <Button type="button" variant="outline" size="sm">
                {isUploading ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Upload />
                )}
                Ganti
              </Button>
            }
          />
          {/* Clears the field to '' — the action maps that back to `undefined`,
              so submitting a cleared field removes the attachment from the doc
              (and the replace-on-edit cleanup reaps the old object). */}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Hapus lampiran"
            disabled={isUploading}
            onClick={() => onChange('')}
          >
            <X />
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <FilePicker
            label="Pilih berkas"
            busy={isUploading}
            onPick={onPick}
            trigger={
              <Button type="button" variant="outline">
                {isUploading ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Upload />
                )}
                {isUploading ? 'Mengunggah…' : 'Pilih berkas'}
              </Button>
            }
          />
          <p className="text-sm text-muted-foreground">
            Maksimal {MAX_UPLOAD_BYTES / 1024 / 1024} MB. Langsung ke object
            storage — byte tidak pernah menyentuh server aplikasi.
          </p>
        </div>
      )}
    </div>
  )
}
