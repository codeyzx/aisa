'use server'

import 'server-only'

import { AISA_READ } from '@/features/aisa/aisa.capability'
import {
  countProposalsSince,
  getRuntime,
  listUnrespondedProposals,
} from '@/features/aisa/aisa.repo'
import { runAction, type ActionResult } from '@/lib/data/action-result'

import type { AssistantContext } from './assistant-types'

/**
 * The figures "Tanya AISA" shows beside the chat, read live from Firestore.
 * `uid` lets the panel restore only the signed-in user's own saved chat.
 */
export async function getAssistantContextAction(): Promise<
  ActionResult<AssistantContext>
> {
  return runAction(AISA_READ, async (session) => {
    const [total, unresponded, runtime] = await Promise.all([
      countProposalsSince(new Date(0)),
      listUnrespondedProposals(),
      getRuntime(),
    ])
    return {
      uid: session.uid,
      total,
      unresponded: unresponded.length,
      topUnresponded: unresponded.filter(
        (p) => p.effectiveCategory === 'sangat_cocok',
      ).length,
      paused: runtime?.paused ?? false,
    }
  })
}
