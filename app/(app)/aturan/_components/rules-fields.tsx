'use client'

import {
  CheckCircle2Icon,
  CheckIcon,
  PlusIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import {
  CATEGORY_ACTION,
  CRITERION_LABEL,
  CRITERION_MEANING,
} from '@/features/aisa/aisa.labels'
import {
  CRITERIA,
  THRESHOLD_KEYS,
  type Rules,
} from '@/features/aisa/aisa.schema'
import { formatRupiah } from '@/lib/format/currency'
import { cn } from '@/lib/utils'

import { GradeBadge } from '../../_components/badges'

import { CriterionName } from './criterion-name'
import { categoryRule, num } from './helpers'
import {
  livePercent,
  parseThresholds,
  percentTotal,
  thresholdGrade,
  thresholdProblems,
  type ModelKey,
  type RulesDraft,
  type ThresholdKey,
} from './rules-draft'
import { ASISTEN_MODEL_NOTE, EDITABLE_MODEL_LABEL } from './rules-labels'
import { Scale } from './scale'
import { normalizeToken } from './scoring'
import { WeightBar } from './weight-bar'

export interface FieldsProps {
  draft: RulesDraft
  setDraft: (update: (draft: RulesDraft) => RulesDraft) => void
  errors?: string[]
}

export function WeightsFields({
  draft,
  setDraft,
  errors,
  onReset,
}: FieldsProps & { onReset: () => void }) {
  const percent = livePercent(draft)
  const total = percentTotal(percent)
  const diff = Math.round((100 - total) * 100) / 100
  const ok = diff === 0

  return (
    <div className="flex flex-col gap-5">
      <div
        className={cn(
          'flex flex-col gap-3 rounded-xl border p-4',
          ok ? 'bg-muted/40' : 'border-warning/40 bg-warning-soft/60',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p
            aria-live="polite"
            className="flex items-center gap-2 text-sm font-medium"
          >
            {ok ? (
              <CheckCircle2Icon className="size-4 text-success" />
            ) : (
              <TriangleAlertIcon className="size-4 text-warning" />
            )}
            Total <span className="font-mono tabular-nums">{num(total)}%</span>
            <span
              className={cn(
                'font-normal',
                ok ? 'text-success' : 'text-warning',
              )}
            >
              {ok
                ? '· sudah pas'
                : diff > 0
                  ? `· kurang ${num(diff)}%`
                  : `· lebih ${num(-diff)}%`}
            </span>
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={onReset}>
            <RotateCcwIcon />
            Kembalikan
          </Button>
        </div>
        <WeightBar percent={percent} />
        <FieldError errors={errors} />
      </div>

      <div className="flex flex-col gap-1">
        {CRITERIA.map((c) => (
          <div
            key={c}
            className="grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-x-4 gap-y-2 border-b py-3 last:border-b-0"
          >
            <div className="min-w-0">
              <FieldLabel htmlFor={`weight-${c}`}>
                <CriterionName criterion={c} />
              </FieldLabel>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                {CRITERION_MEANING[c]}
              </p>
            </div>
            <InputGroup>
              <InputGroupInput
                id={`weight-${c}`}
                aria-label={CRITERION_LABEL[c]}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={0.5}
                className="text-right font-mono tabular-nums"
                value={draft.percent[c]}
                onChange={(event) => {
                  const value = event.target.value
                  setDraft((d) => ({
                    ...d,
                    percent: { ...d.percent, [c]: value },
                  }))
                }}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>%</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            <Slider
              aria-label={`Bobot ${CRITERION_LABEL[c]}`}
              className="col-span-2"
              min={0}
              max={100}
              step={0.5}
              value={Math.min(100, percent[c])}
              onValueChange={(value) => {
                const v = Array.isArray(value) ? value[0] : value
                setDraft((d) => ({
                  ...d,
                  percent: { ...d.percent, [c]: String(v) },
                }))
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function ThresholdsFields({
  draft,
  setDraft,
  fallback,
}: FieldsProps & { fallback: Rules['thresholds'] }) {
  const live = parseThresholds(draft)
  const problems = thresholdProblems(live)
  const valid = Object.keys(problems).length === 0
  // The preview only draws thresholds that could save; while one is wrong it
  // keeps the last saved scale and the row says what to fix.
  const shown = valid ? live : fallback
  // Each problem shows on its own row (the same messages `checkDraft` blocks a
  // save with), so the tab's `errors` are not repeated above the rows.
  const set = (k: ThresholdKey, value: string) =>
    setDraft((d) => ({ ...d, thresholds: { ...d.thresholds, [k]: value } }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-4">
        <p className="text-sm font-medium">Pratinjau skala skor</p>
        <Scale thresholds={shown} />
        {valid ? null : (
          <p className="text-xs text-muted-foreground">
            Pratinjau memakai batas tersimpan sampai semua batas benar.
          </p>
        )}
      </div>

      <div className="flex flex-col">
        {THRESHOLD_KEYS.map((key) => {
          const category = thresholdGrade(key)
          const problem = problems[key]
          return (
            <div
              key={key}
              className="grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-x-4 gap-y-1 border-b py-3"
            >
              <div className="min-w-0">
                <FieldLabel htmlFor={`threshold-${key}`}>
                  <GradeBadge category={category} />
                </FieldLabel>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">
                  {CATEGORY_ACTION[category]} ·{' '}
                  {categoryRule(category, shown).rule}
                </p>
              </div>
              <div>
                <span className="mb-1 block text-[11px] text-muted-foreground">
                  Skor minimal
                </span>
                <Input
                  id={`threshold-${key}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  aria-invalid={problem ? true : undefined}
                  aria-describedby={
                    problem ? `threshold-${key}-error` : undefined
                  }
                  className="text-right font-mono tabular-nums"
                  value={draft.thresholds[key]}
                  onChange={(event) => set(key, event.target.value)}
                />
              </div>
              {problem ? (
                <p
                  id={`threshold-${key}-error`}
                  role="alert"
                  className="col-span-2 text-xs text-destructive"
                >
                  {problem}
                </p>
              ) : null}
            </div>
          )
        })}
        <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-x-4 py-3">
          <div className="min-w-0">
            <GradeBadge category="tidak_layak" />
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              {CATEGORY_ACTION.tidak_layak} ·{' '}
              {categoryRule('tidak_layak', shown).rule}
            </p>
          </div>
          <p className="text-right text-xs text-muted-foreground">Otomatis</p>
        </div>
      </div>
    </div>
  )
}

/** Multi-select chips over `options`, plus a field to add a value not seen yet. */
function ChipToggle({
  label,
  options,
  value,
  onChange,
  invalid,
}: {
  label: string
  options: readonly string[]
  value: string[]
  onChange: (next: string[]) => void
  invalid?: boolean
}) {
  const [extra, setExtra] = useState('')
  const has = (option: string) =>
    value.some((v) => normalizeToken(v) === normalizeToken(option))
  const all = [
    ...options,
    ...value.filter(
      (v) => !options.some((o) => normalizeToken(o) === normalizeToken(v)),
    ),
  ]
  const add = () => {
    const text = extra.trim()
    if (text && !has(text)) onChange([...value, text])
    setExtra('')
  }

  return (
    <div className="flex flex-col gap-2">
      <fieldset aria-label={label} className="flex flex-wrap gap-2">
        {all.map((option) => {
          const active = has(option)
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onChange(
                  active
                    ? value.filter(
                        (v) => normalizeToken(v) !== normalizeToken(option),
                      )
                    : [...value, option],
                )
              }
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                active
                  ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
                  : 'border-dashed text-muted-foreground hover:bg-muted hover:text-foreground',
                invalid && !active && 'border-destructive/50',
              )}
            >
              {active ? (
                <CheckIcon className="size-3.5" />
              ) : (
                <PlusIcon className="size-3.5" />
              )}
              {option}
            </button>
          )
        })}
      </fieldset>
      <div className="flex max-w-xs gap-2">
        <Input
          aria-label={`Tambah ${label.toLowerCase()}`}
          placeholder="Tambah lainnya"
          value={extra}
          onChange={(event) => setExtra(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
        />
        <Button type="button" variant="outline" onClick={add}>
          Tambah
        </Button>
      </div>
    </div>
  )
}

const asRupiah = (text: string) => {
  const n = Number(text)
  return text.trim() && Number.isFinite(n) && n >= 0
    ? formatRupiah(Math.round(n * 1_000_000_000))
    : '–'
}

export function FocusFields({
  draft,
  setDraft,
  errors,
  sectorOptions,
  stageOptions,
}: FieldsProps & { sectorOptions: string[]; stageOptions: string[] }) {
  const money = [
    { key: 'fundingMin', label: 'Dana minimum' },
    { key: 'fundingMax', label: 'Dana maksimum' },
  ] as const
  return (
    <div className="flex flex-col gap-6">
      <FieldError errors={errors} />
      <FieldSet>
        <FieldLegend variant="label">Cek 1 · Sektor fokus</FieldLegend>
        <FieldDescription>
          Proposal di luar sektor ini tidak lolos cek sektor.
        </FieldDescription>
        <ChipToggle
          label="Sektor fokus"
          options={sectorOptions}
          value={draft.sectors}
          onChange={(sectors) => setDraft((d) => ({ ...d, sectors }))}
          invalid={draft.sectors.length === 0}
        />
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Cek 2 · Tahap pendanaan</FieldLegend>
        <FieldDescription>
          Tahap startup yang ingin Anda danai.
        </FieldDescription>
        <ChipToggle
          label="Tahap pendanaan"
          options={stageOptions}
          value={draft.stages}
          onChange={(stages) => setDraft((d) => ({ ...d, stages }))}
          invalid={draft.stages.length === 0}
        />
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Cek 3 · Dana</FieldLegend>
        <FieldDescription>
          Isi dalam miliar Rupiah. Contoh: 2,5 miliar ditulis 2.5.
        </FieldDescription>
        <div className="grid gap-4 sm:grid-cols-2">
          {money.map((item) => (
            <div key={item.key} className="flex flex-col gap-2">
              <FieldLabel htmlFor={`focus-${item.key}`}>
                {item.label}
              </FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>Rp</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id={`focus-${item.key}`}
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min={0}
                  className="font-mono tabular-nums"
                  value={draft[item.key]}
                  onChange={(event) => {
                    const value = event.target.value
                    setDraft((d) => ({ ...d, [item.key]: value }))
                  }}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>miliar</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription className="font-mono text-[11px]">
                {asRupiah(draft[item.key])}
              </FieldDescription>
            </div>
          ))}
        </div>
      </FieldSet>
    </div>
  )
}

export function AnchorsFields({ draft, setDraft, errors }: FieldsProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted-foreground">
        Arti nilai 1, 3, dan 5 untuk tiap kriteria. AI membaca patokan ini saat
        memberi nilai.
      </p>
      <FieldError errors={errors} />
      {CRITERIA.map((c) => (
        <FieldSet key={c} className="border-b pb-4 last:border-b-0">
          <FieldLegend variant="label">
            <CriterionName criterion={c} />
          </FieldLegend>
          <div className="grid gap-3 sm:grid-cols-3">
            {(['1', '3', '5'] as const).map((level) => (
              <label
                key={level}
                className="grid gap-1 text-xs text-muted-foreground"
              >
                Nilai {level}
                <Textarea
                  aria-label={`${CRITERION_LABEL[c]} nilai ${level}`}
                  rows={2}
                  className="text-foreground"
                  value={draft.anchors[c][level]}
                  onChange={(event) => {
                    const value = event.target.value
                    setDraft((d) => ({
                      ...d,
                      anchors: {
                        ...d.anchors,
                        [c]: { ...d.anchors[c], [level]: value },
                      },
                    }))
                  }}
                />
              </label>
            ))}
          </div>
        </FieldSet>
      ))}
    </div>
  )
}

export function AdvancedFields({
  draft,
  setDraft,
  errors,
  asistenModel,
}: FieldsProps & { asistenModel: string }) {
  const keys = Object.keys(EDITABLE_MODEL_LABEL) as ModelKey[]
  return (
    <div className="flex flex-col gap-6">
      <FieldError errors={errors} />
      <FieldSet>
        <FieldLegend variant="label">Model AI</FieldLegend>
        <FieldDescription>
          Nama model Gemini untuk tiap pekerjaan.
        </FieldDescription>
        <div className="grid gap-4 sm:grid-cols-2">
          {keys.map((key) => (
            <div key={key} className="flex flex-col gap-2">
              <FieldLabel htmlFor={`model-${key}`}>
                {EDITABLE_MODEL_LABEL[key]}
              </FieldLabel>
              <Input
                id={`model-${key}`}
                className="font-mono"
                value={draft.models[key]}
                onChange={(event) => {
                  const value = event.target.value
                  setDraft((d) => ({
                    ...d,
                    models: { ...d.models, [key]: value },
                  }))
                }}
              />
            </div>
          ))}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="model-asisten">Asisten</FieldLabel>
            <Input
              id="model-asisten"
              className="font-mono"
              value={asistenModel}
              readOnly
              disabled
            />
            <FieldDescription>{ASISTEN_MODEL_NOTE}</FieldDescription>
          </div>
        </div>
      </FieldSet>
      <FieldSet>
        <FieldLegend variant="label">Pembacaan deck</FieldLegend>
        <div className="flex max-w-xs flex-col gap-2">
          <FieldLabel htmlFor="min-chars">
            Minimum karakter per halaman
          </FieldLabel>
          <Input
            id="min-chars"
            type="number"
            inputMode="numeric"
            min={0}
            className="font-mono tabular-nums"
            value={draft.minChars}
            onChange={(event) => {
              const value = event.target.value
              setDraft((d) => ({ ...d, minChars: value }))
            }}
          />
          <FieldDescription>
            Di bawah rata-rata ini, deck masuk “Perlu dicek manual”.
          </FieldDescription>
        </div>
      </FieldSet>
    </div>
  )
}
