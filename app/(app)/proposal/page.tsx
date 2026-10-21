import { type Metadata } from 'next'

import { AISA_READ, AISA_RESPOND } from '@/features/aisa/aisa.capability'
import {
  getRules,
  listRecentProposals,
  PROPOSAL_WINDOW,
} from '@/features/aisa/aisa.repo'
import { requireCapability } from '@/lib/auth/guards'
import { can } from '@/lib/auth/rbac'

import { ProposalsList } from './_components/proposals-list'
import { toProposalRow } from './_components/proposal-row'

export const metadata: Metadata = { title: 'Proposal' }

/**
 * Filters, sort and page are URL state read on the client (`search-params.ts`),
 * so typing in the search box never waits on a server round-trip; the page only
 * guards and loads the proposal window once.
 */
export default async function ProposalListPage() {
  const session = await requireCapability(AISA_READ)
  const [all, rules] = await Promise.all([listRecentProposals(), getRules()])

  return (
    <ProposalsList
      rows={all.map(toProposalRow)}
      thresholds={rules?.thresholds ?? null}
      canRespond={can(session, AISA_RESPOND)}
      windowLimit={all.length >= PROPOSAL_WINDOW ? PROPOSAL_WINDOW : null}
    />
  )
}
