import { TriangleAlert } from 'lucide-react'

import { stopImpersonationFormAction } from '@/lib/actions/impersonation.action'
import { Button } from '@/components/ui/button'

/**
 * The blocking screen for an impersonation overlay whose target could not be
 * verified (an Admin-SDK / directory outage). It REPLACES the app — never renders
 * beside it — so an inability to establish effective identity cannot continue as
 * an apparently ordinary admin. The only action is to end the overlay.
 *
 * NO `'use client'`: the exit is a plain <form> posting a server action, so it
 * works with no JS — the same reason the ordinary banner is server-rendered.
 * `stopImpersonationFormAction` clears the cookie off the SIGNED ticket and never
 * calls the directory, so it still works while the dependency is down.
 */
export function ImpersonationBlocked() {
  return (
    <div
      role="alert"
      className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center"
    >
      <TriangleAlert className="size-10 text-destructive" aria-hidden />
      <div className="max-w-md space-y-2">
        <h1 className="font-heading text-lg font-semibold">
          Identitas tidak dapat diverifikasi
        </h1>
        <p className="text-sm text-muted-foreground">
          Sesi impersonate sedang aktif, tetapi layanan direktori tidak dapat
          dihubungi untuk memverifikasi pengguna. Demi keamanan, akses ditahan
          hingga impersonate diakhiri.
        </p>
      </div>
      <form action={stopImpersonationFormAction}>
        <Button type="submit" variant="outline">
          Akhiri impersonate
        </Button>
      </form>
    </div>
  )
}
