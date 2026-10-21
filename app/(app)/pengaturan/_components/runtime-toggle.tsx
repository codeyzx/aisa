'use client'

import { PauseIcon, PlayIcon } from 'lucide-react'
import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { setRuntimePausedAction } from '@/features/aisa/aisa.action'
import { cn } from '@/lib/utils'

import { useApiAction } from '../../_components/use-api-action'

import { SettingsPanel } from './settings-panel'

/**
 * STOP / LANJUT — the same switch as the WhatsApp command. STOP pauses the AI
 * in production, so it asks first; LANJUT only resumes and runs in one click.
 * The confirmation stays open on a refusal so the API's message can be read.
 */
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
  const [confirming, setConfirming] = useState(false)

  function stop() {
    run(() => setRuntimePausedAction(true), {
      success: 'AI dijeda (STOP).',
      onSuccess: () => setConfirming(false),
    })
  }
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
        {canConfigure && paused ? (
          <Button
            className="shrink-0 self-start sm:self-auto"
            disabled={pending}
            onClick={() =>
              run(() => setRuntimePausedAction(false), {
                success: 'AI dilanjutkan (LANJUT).',
              })
            }
          >
            <PlayIcon />
            LANJUT
          </Button>
        ) : null}
        {canConfigure && !paused ? (
          <AlertDialog
            open={confirming}
            onOpenChange={(next) => {
              if (!pending) setConfirming(next)
            }}
          >
            <AlertDialogTrigger
              render={
                <Button
                  className="shrink-0 self-start sm:self-auto"
                  variant="destructive"
                  disabled={pending}
                />
              }
            >
              <PauseIcon />
              STOP
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Jeda semua pekerjaan AI?</AlertDialogTitle>
                <AlertDialogDescription>
                  Selama dijeda, proposal baru menunggu sebagai Antre, Asisten
                  menjawab “AISA sedang dijeda”, dan pekerjaan yang sedang
                  berjalan dihentikan di antara langkah. Tekan LANJUT untuk
                  menjalankannya lagi.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  focusableWhenDisabled
                  className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
                  disabled={pending}
                  onClick={stop}
                >
                  {pending ? <Spinner /> : null}
                  Ya, jeda AI
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
      {error && !confirming ? (
        <div className="px-5 pb-4">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      ) : null}
    </SettingsPanel>
  )
}
