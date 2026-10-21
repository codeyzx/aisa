import 'server-only'

import { typedCollection } from '@/lib/firebase/collections'

import {
  DAILY_STATS_COLLECTION,
  DIGESTS_COLLECTION,
  HISTORY_COLLECTION,
  JOB_STEPS_SUBCOLLECTION,
  JOBS_COLLECTION,
  PROPOSALS_COLLECTION,
  SETTINGS_COLLECTION,
} from './aisa.path'
import {
  DailyStatsSchema,
  DigestSchema,
  HistorySchema,
  JobSchema,
  ProposalSchema,
  RulesSchema,
  RuntimeSchema,
  StepSchema,
} from './aisa.schema'

export const proposalsCollection = () =>
  typedCollection(PROPOSALS_COLLECTION, ProposalSchema)
export const jobsCollection = () => typedCollection(JOBS_COLLECTION, JobSchema)
export const jobStepsCollection = (jobId: string) =>
  typedCollection(
    `${JOBS_COLLECTION}/${jobId}/${JOB_STEPS_SUBCOLLECTION}`,
    StepSchema,
  )
export const historyCollection = () =>
  typedCollection(HISTORY_COLLECTION, HistorySchema)
export const digestsCollection = () =>
  typedCollection(DIGESTS_COLLECTION, DigestSchema)
export const dailyStatsCollection = () =>
  typedCollection(DAILY_STATS_COLLECTION, DailyStatsSchema)
/** `settings/*` holds two differently shaped docs, so each gets its own binding. */
export const rulesSettingsCollection = () =>
  typedCollection(SETTINGS_COLLECTION, RulesSchema)
export const runtimeSettingsCollection = () =>
  typedCollection(SETTINGS_COLLECTION, RuntimeSchema)
