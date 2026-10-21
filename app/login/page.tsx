import { Suspense } from 'react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { BrandMark } from '@/components/brand-mark'
import { APP_NAME } from '@/lib/app-config'
import { getSession } from '@/lib/auth/session'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Masuk',
}

export default async function LoginPage() {
  // Already authed → nothing to do here.
  const session = await getSession()
  if (session) redirect('/dashboard')

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 p-6">
      <div className="flex items-center gap-2.5">
        <BrandMark className="size-9 text-foreground" />
        <span className="font-heading text-lg font-semibold tracking-tight">
          {APP_NAME}
        </span>
      </div>
      <Suspense
        fallback={
          <div className="h-72 w-full max-w-sm rounded-xl border border-border/70 bg-card" />
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  )
}
