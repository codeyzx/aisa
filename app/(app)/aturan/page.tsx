import { type Metadata } from 'next'

import { calibrate } from '@/features/aisa/aisa.calibration'
import { AISA_CONFIGURE, AISA_READ } from '@/features/aisa/aisa.capability'
import {
  getRules,
  listRecentProposals,
  listReviewedProposals,
} from '@/features/aisa/aisa.repo'
import { requireCapability } from '@/lib/auth/guards'
import { can } from '@/lib/auth/rbac'

import { BaselineCard } from './_components/baseline-card'
import { Kalibrasi } from './_components/kalibrasi'
import { RulesView } from './_components/rules-view'
import { toScored, type ScoredProposal } from './_components/scoring'

export const metadata: Metadata = { title: 'Aturan penilaian' }

export default async function AturanPage() {
  const session = await requireCapability(AISA_READ)
  const [rules, recent, reviewed] = await Promise.all([
    getRules(),
    listRecentProposals(),
    listReviewedProposals(),
  ])

  if (!rules) {
    return (
      <p className="text-sm text-muted-foreground">
        Aturan penilaian belum ada di Firestore (settings/rules).
      </p>
    )
  }

  const proposals = recent
    .map(toScored)
    .filter((p): p is ScoredProposal => p !== null)

  return (
    <div className="flex w-full flex-col gap-6">
      <RulesView
        rules={rules}
        proposals={proposals}
        canConfigure={can(session, AISA_CONFIGURE)}
      />
      <BaselineCard />
      <Kalibrasi calibration={calibrate(reviewed)} />
    </div>
  )
}
