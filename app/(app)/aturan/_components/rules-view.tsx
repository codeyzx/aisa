'use client'

import { useState } from 'react'

import type { Rules } from '@/features/aisa/aisa.schema'

import { AnchorsCard } from './anchors-card'
import { ExampleCard } from './example-card'
import { FocusCard, focusOptions } from './focus-card'
import type { RulesTab } from './helpers'
import { HowItWorks } from './how-it-works'
import { MetaBar } from './meta-bar'
import { ModelsCard } from './models-card'
import { RulesDialog } from './rules-dialog'
import type { ScoredProposal } from './scoring'
import { ThresholdsCard } from './thresholds-card'
import { WeightsCard } from './weights-card'

/**
 * The Aturan penilaian body. Edit controls exist only when `canConfigure`; a
 * read-only seat sees every rule with no "Ubah" anywhere.
 */
export function RulesView({
  rules,
  proposals,
  canConfigure,
}: {
  rules: Rules
  proposals: ScoredProposal[]
  canConfigure: boolean
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<RulesTab>('bobot')
  const edit = (target: RulesTab) =>
    canConfigure
      ? () => {
          setTab(target)
          setOpen(true)
        }
      : undefined

  const sectorOptions = focusOptions(
    rules.fit.sectors,
    proposals.map((p) => p.sector),
  )
  const stageOptions = focusOptions(
    rules.fit.stages,
    proposals.map((p) => p.stage),
  )

  return (
    <div className="flex w-full flex-col gap-6">
      <MetaBar rules={rules} onEdit={edit('bobot')} />
      <HowItWorks rules={rules} />

      <div className="grid items-start gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <WeightsCard rules={rules} onEdit={edit('bobot')} />
        </div>
        <div className="lg:col-span-2">
          <ExampleCard
            rules={rules}
            version={rules.version}
            proposals={proposals}
          />
        </div>
      </div>

      <ThresholdsCard
        rules={rules}
        proposals={proposals}
        onEdit={edit('batas')}
      />
      <FocusCard rules={rules} proposals={proposals} onEdit={edit('fokus')} />
      <AnchorsCard rules={rules} onEdit={edit('patokan')} />
      <ModelsCard rules={rules} onEdit={edit('lanjutan')} />

      {canConfigure ? (
        <RulesDialog
          rules={rules}
          proposals={proposals}
          sectorOptions={sectorOptions}
          stageOptions={stageOptions}
          open={open}
          onOpenChange={setOpen}
          tab={tab}
          onTabChange={setTab}
        />
      ) : null}
    </div>
  )
}
