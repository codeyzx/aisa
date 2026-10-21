'use client'

import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { updateRulesAction } from '@/features/aisa/aisa.action'
import { CRITERION_LABEL } from '@/features/aisa/aisa.labels'
import { MAX_REASON_LENGTH } from '@/features/aisa/aisa.limits'
import {
  CRITERIA,
  type Criterion,
  type EditableRules,
} from '@/features/aisa/aisa.schema'
import { formatPercent } from '@/lib/format/number'

import { useApiAction } from '../../_components/use-api-action'

import {
  ASISTEN_MODEL_NOTE,
  EDITABLE_MODEL_LABEL,
  RETENTION_EXPLANATION,
  THRESHOLD_LABEL,
} from './rules-labels'

const MODEL_KEYS = Object.keys(
  EDITABLE_MODEL_LABEL,
) as (keyof EditableRules['models'])[]

const list = (text: string) =>
  text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

/** Percent with at most 2 decimals, so 27.5% round-trips to 0.275 exactly. */
const toPercent = (weight: number) => Math.round(weight * 10000) / 100

function Num({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  step?: number
}) {
  return (
    <label className="grid gap-1 text-xs">
      {label}
      <Input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
    </label>
  )
}

/**
 * Edit the active rules. Weights are entered in percent and must total 100%;
 * every save needs a reason, and `aisa-api` writes the new version and its
 * history row. Nothing is written until the API accepts it.
 */
export function RulesForm({
  initial,
  asistenModel,
}: {
  initial: EditableRules
  /** Shown read-only: only a redeploy of the Asisten changes it. */
  asistenModel: string
}) {
  const [percent, setPercent] = useState<Record<Criterion, number>>(
    () =>
      Object.fromEntries(
        CRITERIA.map((c) => [c, toPercent(initial.weights[c])]),
      ) as Record<Criterion, number>,
  )
  const [anchors, setAnchors] = useState(initial.anchors)
  const [sectors, setSectors] = useState(initial.fit.sectors.join(', '))
  const [stages, setStages] = useState(initial.fit.stages.join(', '))
  const [fundingMin, setFundingMin] = useState(initial.fit.fundingMinIdr)
  const [fundingMax, setFundingMax] = useState(initial.fit.fundingMaxIdr)
  const [thresholds, setThresholds] = useState(initial.thresholds)
  const [models, setModels] = useState(initial.models)
  const [minChars, setMinChars] = useState(initial.minCharsPerPage)
  const [retentionDays, setRetentionDays] = useState(initial.retentionDays)
  const [reason, setReason] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const { pending, error, run } = useApiAction()

  const total =
    Math.round(CRITERIA.reduce((sum, c) => sum + (percent[c] || 0), 0) * 100) /
    100

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (Math.abs(total - 100) > 0.01) {
      setLocalError(
        `Total bobot harus 100% (sekarang ${formatPercent(total)}).`,
      )
      return
    }
    if (!reason.trim()) {
      setLocalError('Alasan perubahan wajib diisi.')
      return
    }
    if (!Number.isInteger(retentionDays) || retentionDays < 1) {
      setLocalError('Retensi minimal 1 hari (bilangan bulat).')
      return
    }
    setLocalError(null)
    const rules: EditableRules = {
      weights: Object.fromEntries(
        CRITERIA.map((c) => [c, Math.round(percent[c] * 100) / 10000]),
      ) as EditableRules['weights'],
      anchors,
      fit: {
        sectors: list(sectors),
        stages: list(stages),
        fundingMinIdr: fundingMin,
        fundingMaxIdr: fundingMax,
      },
      thresholds,
      models,
      minCharsPerPage: minChars,
      retentionDays,
    }
    run(() => updateRulesAction(rules, reason), {
      success: 'Aturan penilaian tersimpan sebagai versi baru.',
      onSuccess: () => setReason(''),
    })
  }

  const shown = localError ?? error
  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="font-medium">Bobot kriteria</legend>
        <div className="grid gap-3 sm:grid-cols-5">
          {CRITERIA.map((c) => (
            <Num
              key={c}
              label={`${CRITERION_LABEL[c]} (%)`}
              value={percent[c]}
              step={0.5}
              onChange={(value) =>
                setPercent((prev) => ({ ...prev, [c]: value }))
              }
            />
          ))}
        </div>
        <p
          className={
            Math.abs(total - 100) > 0.01
              ? 'text-sm text-destructive'
              : 'text-sm text-muted-foreground'
          }
        >
          Total: {formatPercent(total)}{' '}
          {Math.abs(total - 100) > 0.01 ? '— harus 100%' : '✓'}
        </p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-medium">Patokan nilai</legend>
        {CRITERIA.map((c) => (
          <div key={c} className="grid gap-2 sm:grid-cols-[10rem_1fr_1fr_1fr]">
            <span className="text-sm font-medium">{CRITERION_LABEL[c]}</span>
            {(['1', '3', '5'] as const).map((level) => (
              <Textarea
                key={level}
                aria-label={`${CRITERION_LABEL[c]} nilai ${level}`}
                placeholder={`Nilai ${level}`}
                value={anchors[c][level]}
                rows={2}
                onChange={(event) =>
                  setAnchors((prev) => ({
                    ...prev,
                    [c]: { ...prev[c], [level]: event.target.value },
                  }))
                }
              />
            ))}
          </div>
        ))}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-medium">Cek kecocokan</legend>
        <label htmlFor="rules-sectors" className="grid gap-1 text-xs">
          Sektor fokus (pisahkan dengan koma)
          <Input
            id="rules-sectors"
            value={sectors}
            onChange={(e) => setSectors(e.target.value)}
          />
        </label>
        <label htmlFor="rules-stages" className="grid gap-1 text-xs">
          Tahap pendanaan (pisahkan dengan koma)
          <Input
            id="rules-stages"
            value={stages}
            onChange={(e) => setStages(e.target.value)}
          />
        </label>
        <Num
          label="Dana minimum (Rp)"
          value={fundingMin}
          onChange={setFundingMin}
        />
        <Num
          label="Dana maksimum (Rp)"
          value={fundingMax}
          onChange={setFundingMax}
        />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-medium">Batas kategori (skor)</legend>
        <div className="grid gap-3 sm:grid-cols-4">
          {(
            Object.keys(
              THRESHOLD_LABEL,
            ) as (keyof EditableRules['thresholds'])[]
          ).map((key) => (
            <Num
              key={key}
              label={THRESHOLD_LABEL[key]}
              value={thresholds[key]}
              onChange={(value) =>
                setThresholds((prev) => ({ ...prev, [key]: value }))
              }
            />
          ))}
        </div>
        <Num
          label="Minimum karakter per halaman (di bawahnya: perlu dicek manual)"
          value={minChars}
          onChange={setMinChars}
        />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-medium">Model</legend>
        <div className="grid gap-3 sm:grid-cols-4">
          {MODEL_KEYS.map((key) => (
            <label key={key} className="grid gap-1 text-xs">
              {EDITABLE_MODEL_LABEL[key]}
              <Input
                value={models[key]}
                onChange={(e) =>
                  setModels((prev) => ({ ...prev, [key]: e.target.value }))
                }
              />
            </label>
          ))}
          <label className="grid gap-1 text-xs">
            Asisten
            <Input value={asistenModel} readOnly disabled />
            <span className="text-muted-foreground">{ASISTEN_MODEL_NOTE}</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-medium">Retensi</legend>
        <div className="grid gap-3 sm:grid-cols-4">
          <Num
            label="Retensi (hari)"
            value={retentionDays}
            onChange={setRetentionDays}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {RETENTION_EXPLANATION(retentionDays)}
        </p>
      </fieldset>

      <label htmlFor="rules-reason" className="grid gap-1 text-sm font-medium">
        Alasan perubahan (wajib)
        <Textarea
          id="rules-reason"
          value={reason}
          maxLength={MAX_REASON_LENGTH}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {shown ? (
        <Alert variant="destructive">
          <AlertDescription>{shown}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Menyimpan…' : 'Simpan sebagai versi baru'}
      </Button>
    </form>
  )
}
