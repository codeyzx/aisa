import { type Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { requireCapability } from '@/lib/auth/guards'
import { cn } from '@/lib/utils'
import { Page } from '@/components/shell/page-container'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'

import { AuditHistory } from './_components/audit-history'
import { loadAuditSearchParams } from './search-params'

export const metadata: Metadata = {
  title: 'Riwayat admin',
}

interface AuditPageProps {
  // Next 16: `searchParams` is a Promise.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * The durable account-administration history — ONE canonical full page, for
 * every navigation mode. There is no modal variant and there cannot be one:
 * `structure:check`'s `one-surface-per-url` forbids a parallel slot or an
 * intercepting segment anywhere under `app/`.
 *
 * Gated on `admin:audit:read`, the same capability the history component
 * re-asserts before it reads. The page gate keeps a reader without audit
 * authority off the URL entirely; the component gate makes the READ safe
 * wherever it is rendered. Neither is redundant.
 *
 * An IMPERSONATED session cannot open this page and nothing special-cases that:
 * while impersonating, the session IS the target, and the target's role holds no
 * `admin:audit:read` — `requireCapability` answers /403 before a document is
 * read. See docs/reference/contracts/impersonation.md.
 *
 * ── THE CLAIM THIS PAGE MAKES, AND THE ONE IT MUST NOT ──────────────────────
 * The honesty notice below is not decoration and must not be trimmed as noise.
 * This is a Firestore collection written by the Admin SDK: anyone holding those
 * credentials — this application, a console user, a future script — can edit or
 * delete a row, and nothing here would show it. Calling that "tamper-evident"
 * or "compliance storage" would be the most dangerous sentence in the module
 * (`account-audit.contract.ts` says the same thing at the other end), because a
 * reader would then trust it in a dispute it cannot settle. Retention, export,
 * and immutability are downstream responsibilities this starter does not claim.
 */
export default async function AuditPage({ searchParams }: AuditPageProps) {
  await requireCapability('admin:audit:read')
  const params = loadAuditSearchParams(await searchParams)

  return (
    <Page.Root className="w-full">
      <Page.Header
        eyebrow="Admin"
        title="Riwayat administrasi akun"
        description="Peristiwa yang tersimpan untuk setiap operasi akun dan setiap impersonasi: siapa yang benar-benar bertindak, atas nama siapa, terhadap siapa, dan bagaimana operasi itu berakhir."
      >
        <Link
          href="/admin"
          prefetch={false}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <ArrowLeft />
          Admin
        </Link>
      </Page.Header>

      <Alert>
        <AlertDescription>
          Ini adalah riwayat aplikasi, bukan penyimpanan kepatuhan yang anti
          rusak. Peristiwa ditulis ke Firestore oleh Admin SDK, sehingga
          pemegang kredensial yang sama dapat mengubah atau menghapusnya tanpa
          jejak di halaman ini. Gunakan untuk menelusuri dan merekonsiliasi
          operasi administrasi — bukan sebagai bukti yang tidak dapat dibantah.
        </AlertDescription>
      </Alert>

      <AuditHistory
        query={{
          action: params.action,
          result: params.result,
          targetUid: params.targetUid,
          cursor: params.cursor,
        }}
      />
    </Page.Root>
  )
}
