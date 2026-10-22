import { z } from 'zod'

import { USER_DATA_PREFIX } from '@/lib/user-browser-data'

import {
  TOUR_STEP_IDS,
  TOUR_STEPS,
  type TourStep,
  type TourStepId,
} from './tour-steps'

/**
 * The tour's pure rules: which steps apply to this reader, what comes next,
 * where a step lives, and how its saved position is read back. No DOM and no
 * storage access here — the controller does the I/O and asks these.
 */

/** What the tour knows about the reader and the path they took. */
export interface TourContext {
  /** Whether this seat may upload a deck and decide (`aisa:respond`). */
  canRespond: boolean
  /** The proposal the detail steps show: the one uploaded, or the list's first. */
  proposalId: string | null
  /** True once a deck was uploaded during this tour. */
  uploaded: boolean
}

/** The saved position: enough to resume on another page or after a reload. */
export interface TourPosition {
  step: TourStepId
  proposalId: string | null
  uploaded: boolean
}

export type TourDirection = 1 | -1

export const FIRST_STEP: TourStepId = TOUR_STEPS[0].id

export function stepById(id: TourStepId): TourStep {
  const step = TOUR_STEPS.find((candidate) => candidate.id === id)
  if (!step) throw new Error(`Unknown tour step: ${id}`)
  return step
}

/** Whether `step` applies to this reader at this point of the tour. */
export function applies(step: TourStep, ctx: TourContext): boolean {
  switch (step.needs) {
    case undefined:
      return true
    case 'upload':
      return ctx.canRespond
    case 'uploaded':
      return ctx.uploaded && ctx.proposalId !== null
    case 'browse':
      return !ctx.uploaded
    case 'no-proposal':
      return !ctx.uploaded && ctx.proposalId === null
    case 'proposal':
      return ctx.proposalId !== null
  }
}

/** The steps this reader will see, in order. */
export function planFor(ctx: TourContext): TourStep[] {
  return TOUR_STEPS.filter((step) => applies(step, ctx))
}

/** The next applicable step after (or before) `id`; null past either end. */
export function stepAfter(
  id: TourStepId,
  ctx: TourContext,
  direction: TourDirection = 1,
): TourStepId | null {
  const from = TOUR_STEPS.findIndex((step) => step.id === id)
  for (
    let i = from + direction;
    i >= 0 && i < TOUR_STEPS.length;
    i += direction
  ) {
    if (applies(TOUR_STEPS[i], ctx)) return TOUR_STEPS[i].id
  }
  return null
}

/** The first step that settles which proposal the detail steps show. */
const PICKS_PROPOSAL = TOUR_STEPS.findIndex(
  (step) => step.needs === 'uploaded' || step.needs === 'browse',
)

/**
 * "3 of 18" for the reader's plan; a step outside the plan counts as the last.
 * Until the tour has picked a proposal it counts as if it will, so the total
 * does not jump when one is picked; only an empty list shortens it.
 */
export function progressOf(
  id: TourStepId,
  ctx: TourContext,
): { current: number; total: number } {
  const before = TOUR_STEPS.findIndex((step) => step.id === id) < PICKS_PROPOSAL
  const plan = planFor(
    before && ctx.proposalId === null ? { ...ctx, proposalId: '' } : ctx,
  )
  const index = plan.findIndex((step) => step.id === id)
  return {
    current: index === -1 ? plan.length : index + 1,
    total: plan.length,
  }
}

/**
 * The path a step is shown on, or null when it is shown wherever the reader is.
 * A detail step with no proposal also yields null; `applies` keeps it out of
 * the plan, so this is only reached for a stale saved position.
 */
export function routeFor(step: TourStep, ctx: TourContext): string | null {
  if (step.route === undefined) return null
  if (step.route !== 'proposal-detail') return step.route
  return ctx.proposalId === null
    ? null
    : `/proposal/${encodeURIComponent(ctx.proposalId)}`
}

function decoded(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

/** Whether `pathname` is `route`, however either spells its encoding. */
export function isOnRoute(pathname: string, route: string): boolean {
  return decoded(pathname) === decoded(route)
}

export type MissingOutcome =
  | { kind: 'center' }
  | { kind: 'skip' }
  | { kind: 'goto'; step: TourStepId }

/**
 * What to do when a step's target is absent or hidden. Walking backwards, a
 * redirect becomes a skip: following it would bounce the reader forward again.
 */
export function onMissingTarget(
  step: TourStep,
  direction: TourDirection,
): MissingOutcome {
  if (step.missing === 'center') return { kind: 'center' }
  if (step.missing === 'skip' || direction === -1) return { kind: 'skip' }
  return { kind: 'goto', step: step.missing }
}

/** The proposal id a list row links to, or null for any other link. */
export function proposalIdFromHref(href: string | null): string | null {
  const match = href?.match(/^\/proposal\/([^/?#]+)$/)
  if (!match) return null
  const id = decoded(match[1])
  return id.length > 0 ? id : null
}

/**
 * The progress card phases after which the tour moves on by itself: a score
 * came out, or AI handed the proposal back for a manual check. A stopped or
 * failed run waits for the reader to choose Lewati, since nothing more will
 * happen while they watch.
 */
export function isAssessmentSettled(phase: string | null): boolean {
  return phase === 'selesai' || phase === 'perlu_dicek_manual'
}

/**
 * Per user, outside `USER_DATA_PREFIX` on purpose: signing out clears that
 * prefix, and a reader who signs back in has still seen the tour.
 */
export function seenKey(uid: string): string {
  return `aisa:tur-dilihat:${uid}`
}

/** Per tab, and cleared on sign-out with the rest of the user's browser data. */
export const POSITION_KEY = `${USER_DATA_PREFIX}tur`

/**
 * Whether to start the tour by itself. `seen` is the stored flag, or
 * `undefined` when storage could not be read: then the tour cannot remember
 * having been shown, so it does not start by itself on every page load —
 * Panduan still starts it. An automated browser is never toured unasked: each
 * scripted session is a "first visit", and an overlay it did not ask for would
 * block whatever it came to drive.
 */
export function shouldAutostart({
  seen,
  automated,
}: {
  seen: string | null | undefined
  automated: boolean
}): boolean {
  return seen === null && !automated
}

const PositionSchema = z.object({
  uid: z.string(),
  step: z.enum(TOUR_STEP_IDS),
  proposalId: z.string().min(1).nullable(),
  uploaded: z.boolean(),
})

/** Serialise a position for `uid`, so another account in this tab never resumes it. */
export function serializePosition(uid: string, position: TourPosition): string {
  return JSON.stringify({ uid, ...position })
}

/** A saved position for `uid`, or null for anything else: absent, foreign, malformed. */
export function parsePosition(
  raw: string | null,
  uid: string,
): TourPosition | null {
  if (raw === null) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  const parsed = PositionSchema.safeParse(value)
  if (!parsed.success || parsed.data.uid !== uid) return null
  const { step, proposalId, uploaded } = parsed.data
  return { step, proposalId, uploaded }
}

/** The body to show: the read-only copy for a seat that cannot upload or respond. */
export function bodyFor(step: TourStep, ctx: TourContext): readonly string[] {
  return !ctx.canRespond && step.readOnlyBody ? step.readOnlyBody : step.body
}
