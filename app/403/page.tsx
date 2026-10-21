import type { Metadata } from 'next'
import Link from 'next/link'

import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'Akses ditolak',
}

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>403 — Akses ditolak</CardTitle>
          <CardDescription>
            Anda tidak memiliki izin untuk melihat halaman ini.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Styled <Link>, not <Button render={<Link/>}> — Base UI's Button
              stamps button semantics onto whatever it renders, which an anchor
              must not carry. See docs/reference/contracts/ui.md. */}
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
          >
            Kembali ke dasbor
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
