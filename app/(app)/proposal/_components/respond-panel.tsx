'use client'

import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { respondToProposalAction } from '@/features/aisa/aisa.action'
import { RESPONSE_LABEL } from '@/features/aisa/aisa.labels'
import { MAX_REASON_LENGTH } from '@/features/aisa/aisa.limits'
import { RESPONSE_KINDS, type ResponseKind } from '@/features/aisa/aisa.schema'

import { useApiAction } from '../../_components/use-api-action'

/** Undang / Pantau / Arsipkan with an optional note — the decision is the manager's. */
export function RespondPanel({
  proposalId,
  current,
}: {
  proposalId: string
  current: ResponseKind | null
}) {
  const [note, setNote] = useState('')
  const { pending, error, run } = useApiAction()

  return (
    <div className="space-y-2">
      <Input
        aria-label="Catatan (opsional)"
        placeholder="Catatan (opsional)"
        value={note}
        maxLength={MAX_REASON_LENGTH}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {RESPONSE_KINDS.map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant={kind === 'arsipkan' ? 'outline' : 'default'}
            disabled={pending || current === kind}
            onClick={() =>
              run(() => respondToProposalAction(proposalId, kind, note), {
                success: `Tanggapan tersimpan: ${RESPONSE_LABEL[kind]}.`,
                onSuccess: () => setNote(''),
              })
            }
          >
            {RESPONSE_LABEL[kind]}
          </Button>
        ))}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
