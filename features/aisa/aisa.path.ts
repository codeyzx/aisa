// Collection paths for the AISA data model. The shapes are owned by
// docs/reference/contracts/aisa-firestore.md (the Python models are the source
// of truth); this file only names the paths once so the dashboard, the seed
// script and the tests cannot spell them differently. Dependency-free on purpose.

export const PROPOSALS_COLLECTION = 'proposals'
export const JOBS_COLLECTION = 'jobs'
/** Sub-collection under `jobs/{jobId}`. */
export const JOB_STEPS_SUBCOLLECTION = 'steps'
export const HISTORY_COLLECTION = 'history'
export const DIGESTS_COLLECTION = 'digests'
export const DAILY_STATS_COLLECTION = 'dailyStats'
export const SETTINGS_COLLECTION = 'settings'
export const RULES_VERSIONS_COLLECTION = 'rulesVersions'

/** `settings/rules` — the active scoring rules. */
export const RULES_DOC_ID = 'rules'
/** `settings/runtime` — the STOP/LANJUT state. */
export const RUNTIME_DOC_ID = 'runtime'
