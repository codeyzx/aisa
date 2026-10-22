'use client'

import { useState } from 'react'
import { ExternalLinkIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getDeckUrlAction } from '@/features/aisa/aisa.action'
import { cn } from '@/lib/utils'

import { useApiAction } from '../../_components/use-api-action'

/**
 * "Buka deck" for uploaded proposals: asks `aisa-api` for a short-lived link at
 * click time (a link minted at render would expire on an open tab). A failure
 * shows as a toast and inline text.
 *
 * The tab is opened SYNCHRONOUSLY inside the click and only pointed at the deck
 * once the link arrives: a `window.open` after an `await` is no longer part of
 * the user gesture, and popup blockers drop it. A failed fetch closes the empty
 * tab again.
 */
export function DeckButton({
  proposalId,
  className,
}: {
  proposalId: string
  className?: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const { pending, error, run } = useApiAction()
  return (
    <span className={cn('flex flex-col gap-1', className)}>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          // No `noopener` feature here: it makes `window.open` return null, and
          // the handle is what lets us navigate the tab later. Cutting `opener`
          // by hand gives the same isolation from the deck page.
          const tab = window.open('', '_blank')
          if (tab) tab.opener = null
          run(() => getDeckUrlAction(proposalId), {
            onSuccess: (data) => {
              setUrl(data.url)
              // Blocked anyway (tab is null): the link below is the fallback.
              if (tab) tab.location.href = data.url
            },
            onError: () => tab?.close(),
          })
        }}
      >
        <ExternalLinkIcon data-icon="inline-start" />
        Buka proposal
      </Button>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs underline"
        >
          Tautan proposal (sementara)
        </a>
      ) : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  )
}
