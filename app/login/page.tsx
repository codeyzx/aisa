import { Suspense } from 'react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SparklesIcon } from 'lucide-react'

import { getSession } from '@/lib/auth/session'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Masuk',
}

// Outside the (app) group, so no sidebar or header.
export default async function LoginPage() {
  // Already authed → nothing to do here.
  const session = await getSession()
  if (session) redirect('/dashboard')

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6">
      <div className="space-y-3 text-center">
        <div className="flex items-center justify-center gap-2 font-semibold">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <SparklesIcon className="size-4" />
          </div>
          AISA
        </div>
        <p className="max-w-xs text-sm text-muted-foreground">
          Asisten investasi untuk menyaring proposal startup. Prototype ITB
          Agentic AI Hackathon.
        </p>
      </div>
      <div className="w-full max-w-sm">
        <Suspense
          fallback={
            <div className="h-80 w-full rounded-xl border border-border/70 bg-card" />
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
