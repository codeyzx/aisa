'use client'

import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { updateRulesAction } from '@/features/aisa/aisa.action'
import { MAX_REASON_LENGTH } from '@/features/aisa/aisa.limits'
import type { EditableRules } from '@/features/aisa/aisa.schema'
import { formatDate } from '@/lib/format/date'

import { useApiAction } from '../../_components/use-api-action'
import { RETENTION_EXPLANATION } from '../../aturan/_components/rules-labels'

import { SaveBar } from './save-bar'
import { SettingsPanel, SettingsRow } from './settings-panel'

const OPTIONS = [
  { value: 30, hint: 'Paling hemat data' },
  { value: 90, hint: 'Bawaan' },
  { value: 180, hint: 'Untuk ditinjau ulang nanti' },
]

const DAY_MS = 86_400_000

/**
 * Retention is part of the scoring rules document, so a change saves a new
 * rules version through the same action, with the same required reason.
 */
export function RetentionForm({
  rules,
  version,
  canConfigure,
}: {
  rules: EditableRules
  version: number
  canConfigure: boolean
}) {
  const saved = rules.retentionDays
  const [days, setDays] = useState(saved)
  const [reason, setReason] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const { pending, error, run } = useApiAction()
  const dirty = days !== saved
  // The stored value may be one the options do not list; it is always offered.
  const options = OPTIONS.some((o) => o.value === saved)
    ? OPTIONS
    : [...OPTIONS, { value: saved, hint: 'Saat ini' }].toSorted(
        (a, b) => a.value - b.value,
      )
  const example = formatDate(new Date(Date.now() + days * DAY_MS))

  function reset() {
    setDays(saved)
    setReason('')
    setLocalError(null)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!reason.trim()) {
      setLocalError('Alasan perubahan wajib diisi.')
      return
    }
    setLocalError(null)
    run(() => updateRulesAction({ ...rules, retentionDays: days }, reason), {
      success: `Retensi ${days} hari tersimpan sebagai aturan versi ${version + 1}.`,
      onSuccess: () => setReason(''),
    })
  }

  const shown = localError ?? error
  return (
    <form noValidate onSubmit={submit}>
      <SettingsPanel
        title="Berapa lama proposal yang ditolak disimpan"
        description="Setelah batas ini, proposal yang Anda tolak dihapus otomatis beserta data founder-nya. Proposal yang disetujui tidak pernah dihapus otomatis."
      >
        <SettingsRow
          label="Hapus yang ditolak setelah"
          htmlFor="archive-retention"
        >
          {canConfigure ? (
            <Select
              value={String(days)}
              onValueChange={(value) => value && setDays(Number(value))}
              items={options.map((o) => ({
                value: String(o.value),
                label: `${o.value} hari`,
              }))}
            >
              <SelectTrigger id="archive-retention" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.value} hari
                    <span className="text-muted-foreground">· {o.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="pt-1.5 text-sm font-medium">{saved} hari</p>
          )}
          <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
            {RETENTION_EXPLANATION(days)} Contoh: proposal yang ditolak hari ini
            dihapus sekitar{' '}
            <b className="font-medium text-foreground">{example}</b>.
          </p>
        </SettingsRow>
        {dirty ? (
          <SettingsRow
            label="Alasan perubahan"
            description="Wajib. Tercatat di Riwayat."
            htmlFor="retention-reason"
          >
            <Textarea
              id="retention-reason"
              rows={2}
              value={reason}
              maxLength={MAX_REASON_LENGTH}
              onChange={(event) => setReason(event.target.value)}
            />
            {shown ? (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription>{shown}</AlertDescription>
              </Alert>
            ) : null}
          </SettingsRow>
        ) : null}
      </SettingsPanel>
      <SaveBar dirty={dirty} pending={pending} onReset={reset} />
    </form>
  )
}
