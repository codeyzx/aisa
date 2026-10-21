'use client'

import { useMemo, useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { updateRulesAction } from '@/features/aisa/aisa.action'
import { MAX_REASON_LENGTH } from '@/features/aisa/aisa.limits'
import type { Rules } from '@/features/aisa/aisa.schema'

import { useApiAction } from '../../_components/use-api-action'

import type { RulesTab } from './helpers'
import { ImpactPreview } from './impact-preview'
import {
  changesRules,
  changesScoring,
  checkDraft,
  draftFromRules,
  type RulesDraft,
} from './rules-draft'
import {
  AdvancedFields,
  AnchorsFields,
  FocusFields,
  ThresholdsFields,
  WeightsFields,
} from './rules-fields'
import { simulate, type ScoredProposal } from './scoring'

const TABS: { value: RulesTab; label: string; short: string }[] = [
  { value: 'bobot', label: 'Bobot kriteria', short: 'Bobot' },
  { value: 'batas', label: 'Batas kategori', short: 'Batas' },
  { value: 'fokus', label: 'Fokus investasi', short: 'Fokus' },
  { value: 'patokan', label: 'Patokan nilai', short: 'Patokan' },
  { value: 'lanjutan', label: 'Model', short: 'Model' },
]

/** The weights, thresholds and focus a simulation reads; other edits move nothing. */
const scoringPart = (r: Pick<Rules, 'weights' | 'thresholds' | 'fit'>) => ({
  weights: r.weights,
  thresholds: r.thresholds,
  fit: r.fit,
})

export function RulesDialog({
  rules,
  proposals,
  sectorOptions,
  stageOptions,
  open,
  onOpenChange,
  tab,
  onTabChange,
}: {
  rules: Rules
  proposals: readonly ScoredProposal[]
  sectorOptions: string[]
  stageOptions: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: RulesTab
  onTabChange: (tab: RulesTab) => void
}) {
  const [draft, setDraftState] = useState<RulesDraft>(() =>
    draftFromRules(rules),
  )
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const { pending, error, run } = useApiAction()

  // Opening shows the rules as stored now — including after a save bumped the version.
  const [openedFor, setOpenedFor] = useState<{
    open: boolean
    version: number
  }>({
    open,
    version: rules.version,
  })
  if (openedFor.open !== open || openedFor.version !== rules.version) {
    setOpenedFor({ open, version: rules.version })
    if (open) {
      setDraftState(draftFromRules(rules))
      setReason('')
      setReasonError(null)
      setTried(false)
    }
  }

  const check = useMemo(
    () => checkDraft(draft, rules.retentionDays),
    [draft, rules.retentionDays],
  )
  const dirty = check.rules !== null && changesRules(check.rules, rules)
  const sim = useMemo(
    () =>
      check.rules
        ? simulate(proposals, scoringPart(rules), scoringPart(check.rules))
        : null,
    [check.rules, proposals, rules],
  )
  const scoringDirty = !!check.rules && changesScoring(check.rules, rules)

  const setDraft = (update: (d: RulesDraft) => RulesDraft) =>
    setDraftState((d) => update(d))
  const shownErrors = (t: RulesTab) =>
    tried || t === 'bobot' || t === 'batas' ? check.errors[t] : undefined

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setTried(true)
    if (!check.rules) {
      const first = TABS.find((t) => check.errors[t.value])
      if (first && !check.errors[tab]) onTabChange(first.value)
      return
    }
    if (!reason.trim()) {
      setReasonError('Alasan perubahan wajib diisi.')
      return
    }
    setReasonError(null)
    const next = check.rules
    run(() => updateRulesAction(next, reason), {
      success: 'Aturan penilaian tersimpan sebagai versi baru.',
      onSuccess: () => onOpenChange(false),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="content" className="max-h-[92svh] sm:max-w-5xl">
        <DialogHeader className="px-5 pt-5 pb-4">
          <DialogTitle className="text-base">Ubah aturan penilaian</DialogTitle>
          <DialogDescription>
            Disimpan sebagai versi {rules.version + 1}. Berlaku untuk proposal
            yang masuk setelah ini.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <form
            id="rules-form"
            noValidate
            onSubmit={submit}
            className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4"
          >
            <Tabs
              value={tab}
              onValueChange={(value) => onTabChange(value as RulesTab)}
              className="gap-5"
            >
              <TabsList className="w-full [scrollbar-width:none] justify-start overflow-x-auto sm:w-fit">
                {TABS.map((item) => (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="px-3"
                  >
                    <span className="sm:hidden">{item.short}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                    {tried && check.errors[item.value] ? (
                      <span
                        aria-label="ada isian yang perlu diperbaiki"
                        className="size-1.5 rounded-full bg-destructive"
                      />
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="bobot" keepMounted>
                <WeightsFields
                  draft={draft}
                  setDraft={setDraft}
                  errors={shownErrors('bobot')}
                  onReset={() =>
                    setDraft((d) => ({
                      ...d,
                      percent: draftFromRules(rules).percent,
                    }))
                  }
                />
              </TabsContent>
              <TabsContent value="batas" keepMounted>
                <ThresholdsFields
                  draft={draft}
                  setDraft={setDraft}
                  errors={shownErrors('batas')}
                  fallback={rules.thresholds}
                />
              </TabsContent>
              <TabsContent value="fokus" keepMounted>
                <FocusFields
                  draft={draft}
                  setDraft={setDraft}
                  errors={shownErrors('fokus')}
                  sectorOptions={sectorOptions}
                  stageOptions={stageOptions}
                />
              </TabsContent>
              <TabsContent value="patokan" keepMounted>
                <AnchorsFields
                  draft={draft}
                  setDraft={setDraft}
                  errors={shownErrors('patokan')}
                />
              </TabsContent>
              <TabsContent value="lanjutan" keepMounted>
                <AdvancedFields
                  draft={draft}
                  setDraft={setDraft}
                  errors={shownErrors('lanjutan')}
                  asistenModel={rules.models.asisten}
                />
              </TabsContent>
            </Tabs>
          </form>

          <aside className="hidden min-h-0 overflow-y-auto border-l bg-muted/40 p-5 lg:block">
            <ImpactPreview sim={sim} dirty={scoringDirty} />
          </aside>
        </div>

        <DialogFooter className="flex-col gap-3 bg-transparent sm:flex-col sm:items-stretch">
          <div className="lg:hidden">
            <ImpactPreview sim={sim} dirty={scoringDirty} compact />
          </div>
          <label
            htmlFor="rules-reason"
            className="grid gap-1.5 text-sm font-medium"
          >
            Alasan perubahan (wajib)
            <Textarea
              id="rules-reason"
              form="rules-form"
              rows={2}
              placeholder="Contoh: tesis dana Q4, tim lebih berat"
              value={reason}
              maxLength={MAX_REASON_LENGTH}
              aria-invalid={!!reasonError}
              onChange={(event) => setReason(event.target.value)}
              className="font-normal"
            />
          </label>
          {(reasonError ?? error) ? (
            <Alert variant="destructive">
              <AlertDescription>{reasonError ?? error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="hidden text-xs text-muted-foreground lg:block">
              Perubahan tercatat di Riwayat beserta alasannya.
            </p>
            <div className="flex gap-2 sm:justify-end">
              <DialogClose
                render={
                  <Button variant="outline" className="flex-1 sm:flex-none" />
                }
              >
                Batal
              </DialogClose>
              <Button
                type="submit"
                form="rules-form"
                disabled={pending || (!!check.rules && !dirty)}
                className="flex-1 sm:flex-none"
              >
                {pending && <Spinner />}
                Simpan versi {rules.version + 1}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
