import { type Metadata } from 'next'
import { Page } from '@/components/shell/page-container'
import { requireCapability } from '@/lib/auth/guards'

import { Uploader } from './_components/uploader'

export const metadata: Metadata = {
  title: 'Penyimpanan',
}

/**
 * Storage example. Demonstrates the default flow: presigned direct
 * upload, then download and delete by key.
 *
 * Gated with `requireCapability` at the top, before anything renders. That is UX
 * only — it stops a user who cannot upload from being shown a
 * file picker. The real boundary is server-side: the upload-url route and the
 * example actions each re-check auth, because both are public POST endpoints.
 */
export default async function StorageExamplePage() {
  await requireCapability('storage:write')

  return (
    <Page.Root>
      <Page.Header
        eyebrow="Contoh"
        title="Penyimpanan"
        description="Unggahan langsung ter-presign ke object storage yang kompatibel dengan S3."
      />
      <Uploader />
    </Page.Root>
  )
}
