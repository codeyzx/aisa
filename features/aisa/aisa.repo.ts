import 'server-only'

import { cache } from 'react'

import {
  dailyStatsCollection,
  digestsCollection,
  historyCollection,
  jobsCollection,
  jobStepsCollection,
  proposalsCollection,
  rulesSettingsCollection,
  runtimeSettingsCollection,
} from './aisa.collection'
import { RULES_DOC_ID, RUNTIME_DOC_ID } from './aisa.path'
import type {
  DailyStats,
  Digest,
  Job,
  Proposal,
  ProposalStatus,
  Rules,
  Runtime,
  Step,
} from './aisa.schema'

/**
 * How many proposals the list page loads, newest first. Filtering happens in
 * memory over this window rather than as Firestore `where` clauses: five
 * independent filters plus a sort would need a composite index per combination,
 * and a one-manager inbox is well inside this bound. The page says so when the
 * window is full, so a truncated list never reads as the whole inbox.
 */
export const PROPOSAL_WINDOW = 500

export const getProposal = cache(
  async (id: string): Promise<Proposal | null> => {
    const snap = await proposalsCollection().doc(id).get()
    return snap.data() ?? null
  },
)

/** Newest proposals, bounded by `PROPOSAL_WINDOW`. */
export const listRecentProposals = cache(async (): Promise<Proposal[]> => {
  const snap = await proposalsCollection()
    .orderBy('createdAt', 'desc')
    .limit(PROPOSAL_WINDOW)
    .get()
  return snap.docs.map((doc) => doc.data())
})

/** Every proposal the manager has not responded to — the digest's population. */
export const listUnrespondedProposals = cache(async (): Promise<Proposal[]> => {
  const snap = await proposalsCollection().where('responded', '==', false).get()
  return snap.docs.map((doc) => doc.data())
})

/**
 * Every proposal the manager reviewed (a tanggapan or a koreksi), for
 * Kalibrasi. Two single-field queries merged by id, so no composite index; not
 * windowed like the list, because an agreement rate over a truncated set would
 * read as the whole history.
 */
export const listReviewedProposals = cache(async (): Promise<Proposal[]> => {
  const [responded, corrected] = await Promise.all([
    proposalsCollection().where('responded', '==', true).get(),
    proposalsCollection().where('correction', '!=', null).get(),
  ])
  const byId = new Map<string, Proposal>()
  for (const doc of [...responded.docs, ...corrected.docs])
    byId.set(doc.id, doc.data())
  return [...byId.values()]
})

/** Proposals created strictly after `since`. A single-field range, no index. */
export async function countProposalsSince(since: Date): Promise<number> {
  const snap = await proposalsCollection()
    .where('createdAt', '>', since)
    .count()
    .get()
  return snap.data().count
}

export const getLatestDigest = cache(async (): Promise<Digest | null> => {
  const snap = await digestsCollection()
    .orderBy('sentAt', 'desc')
    .limit(1)
    .get()
  return snap.docs[0]?.data() ?? null
})

/**
 * How many recent digests the Tren page searches for an insight. A template
 * fallback or a quiet slot sends a digest without one, so the newest digest
 * alone would often show nothing.
 */
const INSIGHT_LOOKBACK = 10

/** The newest digest that carried an insight, within `INSIGHT_LOOKBACK`. */
export const getLatestInsightDigest = cache(
  async (): Promise<Digest | null> => {
    const snap = await digestsCollection()
      .orderBy('sentAt', 'desc')
      .limit(INSIGHT_LOOKBACK)
      .get()
    return (
      snap.docs.map((doc) => doc.data()).find((d) => d.insight?.trim()) ?? null
    )
  },
)

export const getRules = cache(async (): Promise<Rules | null> => {
  const snap = await rulesSettingsCollection().doc(RULES_DOC_ID).get()
  return snap.data() ?? null
})

export const getRuntime = cache(async (): Promise<Runtime | null> => {
  const snap = await runtimeSettingsCollection().doc(RUNTIME_DOC_ID).get()
  return snap.data() ?? null
})

/** The last `days` daily stats, oldest first (ready to chart left→right). */
export const listDailyStats = cache(
  async (days: number): Promise<DailyStats[]> => {
    const snap = await dailyStatsCollection()
      .orderBy('date', 'desc')
      .limit(days)
      .get()
    return snap.docs.map((doc) => doc.data()).toReversed()
  },
)

export interface JobWithSteps extends Job {
  steps: Step[]
}

async function withSteps(job: Job): Promise<JobWithSteps> {
  const snap = await jobStepsCollection(job.id).orderBy('seq', 'asc').get()
  return { ...job, steps: snap.docs.map((doc) => doc.data()) }
}

/** One job with its steps, or null when it does not exist. */
export async function getJobWithSteps(
  jobId: string,
): Promise<JobWithSteps | null> {
  const job = (await jobsCollection().doc(jobId).get()).data()
  return job ? withSteps(job) : null
}

/** What the live progress view needs of one recorded step. */
export type ProgressStep = Pick<
  Step,
  'seq' | 'action' | 'tool' | 'actor' | 'at' | 'durationMs' | 'status' | 'error'
>

/**
 * A proposal's assessment as it stands right now, for the detail page's live
 * progress view: its status, whether STOP is on, and its job's steps so far
 * plus the step still running. `serverNow` lets the browser time the running
 * step on the server's clock rather than its own.
 */
export interface AssessmentProgress {
  status: ProposalStatus
  statusReason: string | null
  paused: boolean
  serverNow: Date
  job:
    | (Pick<Job, 'id' | 'status' | 'startedAt'> & {
        endedAt: Date | null
        durationMs: number | null
        currentStep: NonNullable<Job['currentStep']> | null
        steps: ProgressStep[]
      })
    | null
}

/** Null when the proposal does not exist (it may have been deleted meanwhile). */
export async function getAssessmentProgress(
  proposalId: string,
): Promise<AssessmentProgress | null> {
  const [proposal, runtime] = await Promise.all([
    proposalsCollection().doc(proposalId).get(),
    getRuntime(),
  ])
  const p = proposal.data()
  if (!p) return null
  const job = p.jobId ? await getJobWithSteps(p.jobId) : null
  return {
    status: p.status,
    statusReason: p.statusReason ?? null,
    paused: runtime?.paused ?? false,
    serverNow: new Date(),
    job: job
      ? {
          id: job.id,
          status: job.status,
          startedAt: job.startedAt,
          endedAt: job.endedAt ?? null,
          durationMs: job.durationMs ?? null,
          currentStep: job.currentStep ?? null,
          steps: job.steps.map(
            ({ seq, action, tool, actor, at, durationMs, status, error }) => ({
              seq,
              action,
              tool,
              actor,
              at,
              durationMs,
              status,
              error: error ?? null,
            }),
          ),
        }
      : null,
  }
}

/** The newest jobs, without their steps. */
export const listRecentJobs = cache(async (limit: number): Promise<Job[]> => {
  const snap = await jobsCollection()
    .orderBy('startedAt', 'desc')
    .limit(limit)
    .get()
  return snap.docs.map((doc) => doc.data())
})

/**
 * The newest jobs with their steps. `focusJobId` (the "Lihat log penilaian"
 * link) is always included, even when it has scrolled out of the window.
 */
export async function listJobsWithSteps(
  limit: number,
  focusJobId?: string,
): Promise<JobWithSteps[]> {
  const jobs = [...(await listRecentJobs(limit))]
  if (focusJobId && !jobs.some((job) => job.id === focusJobId)) {
    const focus = (await jobsCollection().doc(focusJobId).get()).data()
    if (focus) jobs.unshift(focus)
  }
  return Promise.all(jobs.map(withSteps))
}

export async function listHistory(limit: number) {
  const snap = await historyCollection()
    .orderBy('at', 'desc')
    .limit(limit)
    .get()
  return snap.docs.map((doc) => doc.data())
}

/**
 * One proposal's audit rows (responses, corrections), newest first.
 * `where(proposalId) + orderBy(at)` — needs the `history` composite index in
 * firestore.indexes.json.
 */
export async function listProposalHistory(proposalId: string) {
  const snap = await historyCollection()
    .where('proposalId', '==', proposalId)
    .orderBy('at', 'desc')
    .limit(50)
    .get()
  return snap.docs.map((doc) => doc.data())
}

/** Digests sent at or after `since` — the denominator for tokens per ringkasan. */
export async function countDigestsSince(since: Date): Promise<number> {
  const snap = await digestsCollection()
    .where('sentAt', '>=', since)
    .count()
    .get()
  return snap.data().count
}
