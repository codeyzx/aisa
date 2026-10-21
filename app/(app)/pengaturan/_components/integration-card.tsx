'use client'

import {
  ActivityIcon,
  ArrowUpRightIcon,
  CloudIcon,
  DatabaseIcon,
  FileTextIcon,
  MessageCircleIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

export type IntegrationId = 'aisa-api' | 'firestore' | 'gowa' | 'form'

export interface Integration {
  id: IntegrationId
  name: string
  role: string
  /** `null`: the dashboard cannot check this service itself. */
  status: 'terhubung' | 'terputus' | null
  /** A one-line fact the card shows under the role, e.g. the last delivery. */
  fact: string
  details: { label: string; value: string }[]
  /** Only aisa-api can be re-checked from here (its `/health`). */
  checkable?: boolean
  /** The latest health check, for a checkable service. */
  check?: { ok: boolean; latencyMs: number; at: string; error: string | null }
}

const ICONS = {
  'aisa-api': CloudIcon,
  firestore: DatabaseIcon,
  gowa: MessageCircleIcon,
  form: FileTextIcon,
} as const

const SHORTCUTS: Partial<
  Record<IntegrationId, { href: string; label: string }>
> = {
  firestore: { href: '/aturan', label: 'Buka aturan' },
  gowa: { href: '/riwayat', label: 'Riwayat ringkasan' },
  form: { href: '/proposal', label: 'Lihat proposal' },
  'aisa-api': { href: '/aktivitas', label: 'Aktivitas AI' },
}

function Icon({ id }: { id: IntegrationId }) {
  const I = ICONS[id]
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-lg border bg-muted text-foreground">
      <I className="size-[18px]" />
    </span>
  )
}

function Status({ status }: { status: Integration['status'] }) {
  if (!status) return null
  const on = status === 'terhubung'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium',
        on ? 'bg-success-soft text-success' : 'bg-danger-soft text-destructive',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          on ? 'bg-success' : 'bg-destructive',
        )}
      />
      {on ? 'Terhubung' : 'Terputus'}
    </span>
  )
}

export function IntegrationCard({ integration }: { integration: Integration }) {
  const [open, setOpen] = useState(false)
  const [checking, startCheck] = useTransition()
  const router = useRouter()
  const shortcut = SHORTCUTS[integration.id]
  const check = integration.check

  return (
    <article className="flex flex-col rounded-xl border bg-card">
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <Icon id={integration.id} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{integration.name}</h3>
              <Status status={integration.status} />
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {integration.role}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {integration.fact}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 border-t px-4 py-2.5">
        {shortcut && (
          <Link
            href={shortcut.href}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            {shortcut.label}
            <ArrowUpRightIcon />
          </Link>
        )}
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Detail
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <Icon id={integration.id} />
              <div className="min-w-0 text-left">
                <DialogTitle>{integration.name}</DialogTitle>
                <div className="mt-1">
                  <Status status={integration.status} />
                </div>
              </div>
            </div>
            <DialogDescription className="pt-2 text-left">
              {integration.role}
            </DialogDescription>
          </DialogHeader>

          <dl className="divide-y rounded-lg border text-sm">
            {integration.details.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 px-3.5 py-2.5"
              >
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="min-w-0 font-medium break-words">{row.value}</dd>
              </div>
            ))}
          </dl>

          {integration.checkable && check ? (
            <p
              aria-live="polite"
              className={cn(
                'rounded-lg px-3.5 py-2.5 text-[13px]',
                check.ok
                  ? 'bg-success-soft text-success'
                  : 'bg-danger-soft text-destructive',
              )}
            >
              {check.ok
                ? `Koneksi baik · merespons dalam ${check.latencyMs} ms (${check.at})`
                : `${check.error ?? 'Tidak merespons'} (${check.at})`}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Tutup
            </Button>
            {integration.checkable ? (
              <Button
                variant="outline"
                disabled={checking}
                onClick={() => startCheck(() => router.refresh())}
              >
                {checking ? <Spinner /> : <ActivityIcon />}
                Cek koneksi
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  )
}
