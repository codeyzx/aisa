'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { setRuntimePausedAction } from '@/features/aisa/aisa.action'

import { useApiAction } from '../../_components/use-api-action'

/** STOP / LANJUT — the same switch as the WhatsApp command. */
export function RuntimeToggle({ paused }: { paused: boolean }) {
  const { pending, error, run } = useApiAction()
  return (
    <div className="space-y-2">
      <Button
        variant={paused ? 'default' : 'destructive'}
        disabled={pending}
        onClick={() =>
          run(() => setRuntimePausedAction(!paused), {
            success: paused ? 'AI dilanjutkan (LANJUT).' : 'AI dijeda (STOP).',
          })
        }
      >
        {paused ? 'LANJUT' : 'STOP'}
      </Button>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
