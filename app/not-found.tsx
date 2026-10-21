// 404 UI. Serves two cases (per the not-found.js docs): an explicit `notFound()`
// call inside a route segment, and any URL that matches no route at all.
//
// Server Component, takes no props, and uses a DEFAULT export per Next's file
// convention. Not an error boundary — a missing record is an EXPECTED outcome,
// so pages should `notFound()` rather than throw.

import type { Metadata } from 'next'
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Halaman tidak ditemukan',
}

export default function NotFound() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>404 — Halaman tidak ditemukan</EmptyTitle>
          <EmptyDescription>
            Halaman yang Anda cari tidak ada atau mungkin telah dipindahkan.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Kembali ke dasbor
          </Link>
        </EmptyContent>
      </Empty>
    </div>
  )
}
