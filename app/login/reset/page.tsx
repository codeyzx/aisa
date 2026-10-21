import type { Metadata } from 'next'

import { BrandMark } from '@/components/brand-mark'
import { APP_NAME } from '@/lib/app-config'
import { ResetForm } from './reset-form'

export const metadata: Metadata = {
  title: 'Atur ulang kata sandi',
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 p-6">
      <div className="flex items-center gap-2.5">
        <BrandMark className="size-9 text-foreground" />
        <span className="font-heading text-lg font-semibold tracking-tight">
          {APP_NAME}
        </span>
      </div>
      <ResetForm />
    </div>
  )
}
