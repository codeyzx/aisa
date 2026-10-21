import { type Metadata } from 'next'
import { Page } from '@/components/shell/page-container'
import { requireCapability } from '@/lib/auth/guards'

import { PromptForm } from './_components/prompt-form'

export const metadata: Metadata = {
  title: 'AI',
}

/**
 * Inference example. Demonstrates the whole idiom: one hardcoded
 * provider bound in `lib/ai/provider.ts`, called through the Vercel AI SDK from
 * a gated server action.
 *
 * Gated with `requireCapability` at the top, before anything renders. That is UX
 * only — it stops a user who cannot generate from being shown a
 * prompt box. The real boundary is server-side: the action re-checks, because a
 * server action is a public POST endpoint.
 *
 * The model name and the per-window cap are NOT printed here. They live in
 * `PromptForm`, wired as the prompt field's `aria-describedby`, because that is
 * where they change what the reader does: a cap read out on focus lands before a
 * slot is spent, while a cap in a page subtitle is scenery the reader scrolled
 * past. Stating them in both places would be the duplication this repo forbids —
 * two copies of one number, one of which eventually lies. `lib/ai/model.ts` is
 * importable from either side (plain constants, no `server-only`, no credential),
 * so the choice is free and is made on where it helps.
 */
export default async function AiExamplePage() {
  await requireCapability('ai:invoke')

  return (
    <Page.Root>
      <Page.Header
        eyebrow="Contoh"
        title="AI"
        description="Pembuatan teks melalui Vercel AI SDK."
      />
      <PromptForm />
    </Page.Root>
  )
}
