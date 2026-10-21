'use client'

import { PauseIcon, PlayIcon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { setRuntimePausedAction } from '@/features/aisa/aisa.action'
import { cn } from '@/lib/utils'

import { useApiAction } from '../../_components/use-api-action'

import { SettingsPanel } from './settings-panel'

/** STOP / LANJUT — the same switch as the WhatsApp command. */
export function RuntimePanel({
  paused,
  detail,
  canConfigure,
}: {
  paused: boolean
  /** The sentence under the status, built on the server from `settings/runtime`. */
  detail: string
  canConfigure: boolean
}) {
  const { pending, error, run } = useApiAction()
  return (
    <SettingsPanel
      title="Status AI"
      description="STOP menghentikan pekerjaan AI yang sedang berjalan; LANJUT menjalankannya lagi. Sama dengan perintah STOP dan LANJUT di WhatsApp."
      action={
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium',
            paused
              ? 'bg-danger-soft text-destructive'
              : 'bg-success-soft text-success',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              paused ? 'bg-destructive' : 'bg-success',
            )}
          />
          {paused ? 'Dijeda (STOP)' : 'Berjalan'}
        </span>
      }
    >
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {detail}
        </p>
        {canConfigure ? (
          <Button
            className="shrink-0 self-start sm:self-auto"
            variant={paused ? 'default' : 'destructive'}
            disabled={pending}
            onClick={() =>
              run(() => setRuntimePausedAction(!paused), {
                success: paused
                  ? 'AI dilanjutkan (LANJUT).'
                  : 'AI dijeda (STOP).',
              })
            }
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
            {paused ? 'LANJUT' : 'STOP'}
          </Button>
        ) : null}
      </div>
      {error ? (
        <div className="px-5 pb-4">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      ) : null}
    </SettingsPanel>
  )
}
