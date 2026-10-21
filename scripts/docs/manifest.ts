/**
 * Documentation ownership manifest — the machine-readable source of truth for
 * WHICH docs exist, WHAT kind each is, and WHETHER it is normative (carries a
 * contract other code must obey).
 *
 * `scripts/docs/check.ts` reads this to enforce membership, metadata, and drift.
 * It is deliberately a hand-maintained list, not a filesystem scan: a doc that
 * appears on disk but not here is an ORPHAN the check flags, which is the point —
 * ownership is a decision, not a side effect of `mkdir`.
 *
 * The four Diataxis modes are not decoration: the `type` of a doc decides what it
 * is ALLOWED to contain. A how-to that legislates, or a contract that embeds a
 * runbook, is a defect this manifest exists to make visible — because once a rule
 * has two homes, the two wordings drift and the reader cannot tell which is
 * current.
 */

/**
 * The reduced-Diataxis buckets a tracked doc can belong to.
 * - `tutorial` / `how-to` / `reference` / `explanation` — the four Diataxis modes.
 * - `reference-contract` — a reference doc that is NORMATIVE: a seam contract
 *   other code must obey (`docs/reference/contracts/*`).
 * - `decision` — an accepted design decision / ADR-style record.
 * - `handoff` — a transient working note under `docs/handoffs/**`; exempt from
 *   the metadata and index rules because it is short-lived by design.
 * - `index` — the docs index (`docs/README.md`) that lists the others.
 * - `root-guide` — a top-level orientation doc outside `docs/` (`README.md`,
 *   `AGENTS.md`).
 */
export type DocType =
  | 'tutorial'
  | 'how-to'
  | 'reference'
  | 'reference-contract'
  | 'explanation'
  | 'decision'
  | 'handoff'
  | 'index'
  | 'root-guide'

/** One tracked documentation file and its ownership metadata. */
export interface DocEntry {
  /** Repo-relative POSIX path. */
  path: string
  type: DocType
  /**
   * Whether the doc carries a contract other code must obey. Normative docs are
   * held to the metadata-presence rule; non-normative docs are not.
   */
  normative: boolean
}

/**
 * The six metadata fields a NORMATIVE doc must open with, so a reader knows what
 * the doc owns and how it is kept honest before trusting a word of it. Enforced
 * by the `metadata-presence` check.
 */
export const REQUIRED_METADATA_FIELDS = [
  'Type',
  'Owns',
  'Source of truth',
  'Verified by',
  'Read when',
  'Does not define',
] as const

/**
 * The normative layer contracts. Each one owns ONE seam, and the test for
 * earning a file is deletability: every contract below names something a fork
 * can remove on its own. Optional capabilities get separate files rather than
 * one combined `capabilities.md` — deleting a capability would otherwise mean
 * editing a document other capabilities share, which works directly against
 * the deletion-first model this starter is built on.
 */
const contractDocs: DocEntry[] = [
  'auth',
  'data',
  'http-api',
  'module-boundaries',
  'observability',
  'operations',
  'project-readme',
  'testing',
  'ui',
].map((name) => ({
  path: `docs/reference/contracts/${name}.md`,
  type: 'reference-contract',
  normative: true,
}))

/**
 * Reference facts GENERATED from source. Each must state how it is generated and
 * fail `docs:check`'s `generated-drift` rule when the source moves ahead of it —
 * a generated doc nobody regenerates is worse than no doc, because it reads as
 * current.
 */
const generatedReferenceDocs: DocEntry[] = [
  'commands',
  'configuration',
  'capabilities',
  'project-layout',
].map((name) => ({
  path: `docs/reference/${name}.md`,
  type: 'reference',
  normative: false,
}))

/**
 * The current documentation surface. Keep this in sync with the tree: a new doc
 * is added here in the same change that creates it, and the `index-membership`
 * check will fail until it is also linked from `docs/README.md`.
 */
export const docsManifest: DocEntry[] = [
  // The index itself.
  { path: 'docs/README.md', type: 'index', normative: false },

  // Top-level orientation guides outside docs/.
  { path: 'README.md', type: 'root-guide', normative: false },
  { path: 'AGENTS.md', type: 'root-guide', normative: false },

  // Tutorials — learning-oriented, run start to finish, no normative rules.
  {
    path: 'docs/tutorials/local-development.md',
    type: 'tutorial',
    normative: false,
  },
  {
    path: 'docs/tutorials/first-change.md',
    type: 'tutorial',
    normative: false,
  },

  // How-to — task-oriented procedures. They LINK to contracts for constraints
  // rather than restating them, so a rule has one home and one wording.
  { path: 'docs/how-to/adapt-starter.md', type: 'how-to', normative: false },
  {
    path: 'docs/how-to/maintain-project-readme.md',
    type: 'how-to',
    normative: false,
  },
  { path: 'docs/how-to/add-feature.md', type: 'how-to', normative: false },
  {
    path: 'docs/how-to/remove-capability.md',
    type: 'how-to',
    normative: false,
  },
  { path: 'docs/how-to/verify-change.md', type: 'how-to', normative: false },
  { path: 'docs/how-to/deploy.md', type: 'how-to', normative: false },
  {
    path: 'docs/how-to/setup-google-form.md',
    type: 'how-to',
    normative: false,
  },
  {
    path: 'docs/how-to/backup-and-restore.md',
    type: 'how-to',
    normative: false,
  },
  { path: 'docs/how-to/test-a-feature.md', type: 'how-to', normative: false },

  // The normative contracts.
  ...contractDocs,

  // The AISA data contract. Its source of truth is the Python Pydantic models in
  // `services/`, owned outside this app, so it is tracked as reference rather than
  // held to this repo's normative metadata rule.
  {
    path: 'docs/reference/contracts/aisa-firestore.md',
    type: 'reference',
    normative: false,
  },

  // AISA hackathon records: actual test results and how AI assistants were used. Facts
  // about this build, not rules, so not normative.
  { path: 'docs/TESTING.md', type: 'reference', normative: false },
  { path: 'docs/AI_USAGE.md', type: 'reference', normative: false },
  // QA records: one acceptance matrix per feature, with actual results and evidence ids.
  { path: 'docs/qa/inventaris-fitur.md', type: 'reference', normative: false },
  { path: 'docs/qa/api.md', type: 'reference', normative: false },
  { path: 'docs/qa/dashboard.md', type: 'reference', normative: false },
  {
    path: 'docs/qa/penerimaan-produksi.md',
    type: 'reference',
    normative: false,
  },
  { path: 'docs/qa/asisten.md', type: 'reference', normative: false },
  { path: 'docs/qa/use-case.md', type: 'reference', normative: false },
  {
    path: 'docs/qa/panduan-uji/README.md',
    type: 'reference',
    normative: false,
  },
  {
    path: 'docs/qa/panduan-uji/01-masuk-dashboard-tren.md',
    type: 'reference',
    normative: false,
  },
  {
    path: 'docs/qa/panduan-uji/02-proposal.md',
    type: 'reference',
    normative: false,
  },
  {
    path: 'docs/qa/panduan-uji/03-aktivitas-riwayat-aturan-pengaturan.md',
    type: 'reference',
    normative: false,
  },
  {
    path: 'docs/qa/panduan-uji/04-tanya-aisa-whatsapp-form.md',
    type: 'reference',
    normative: false,
  },

  // Generated reference facts.
  ...generatedReferenceDocs,

  // Explanation — rationale. Owns WHY, never commands, and links to the contract
  // that owns each current rule.
  {
    path: 'docs/explanation/architecture.md',
    type: 'explanation',
    normative: false,
  },
  {
    path: 'docs/explanation/product-context.md',
    type: 'explanation',
    normative: false,
  },
  {
    path: 'docs/explanation/request-auth-data-flow.md',
    type: 'explanation',
    normative: false,
  },
  {
    path: 'docs/explanation/capability-model.md',
    type: 'explanation',
    normative: false,
  },
  {
    path: 'docs/explanation/deployment-model.md',
    type: 'explanation',
    normative: false,
  },
  {
    path: 'docs/explanation/reusability-model.md',
    type: 'explanation',
    normative: false,
  },

  // Transient working notes (exempt from metadata/index rules).
  {
    path: 'docs/handoffs/2026.07.21-0010-next-generation-foundation/README.md',
    type: 'handoff',
    normative: false,
  },
  {
    path: 'docs/handoffs/2026.07.21-0020-admin-account-module/README.md',
    type: 'handoff',
    normative: false,
  },
  {
    path: 'docs/handoffs/2026.07.21-0030-aixel-project-readme-standard/README.md',
    type: 'handoff',
    normative: false,
  },
  {
    path: 'docs/handoffs/2026.07.22-0040-postgresql-candidate-execution/README.md',
    type: 'handoff',
    normative: false,
  },
  {
    path: 'docs/handoffs/2026.07.22-0050-reusability-hardening/README.md',
    type: 'handoff',
    normative: false,
  },
  {
    path: 'docs/handoffs/2026.07.22-0050-reusability-hardening/postgresql-fork-audit.md',
    type: 'handoff',
    normative: false,
  },
  {
    path: 'docs/handoffs/2026.07.24-0060-cross-fork-sync/README.md',
    type: 'handoff',
    normative: false,
  },
  {
    path: 'docs/handoffs/2026.07.24-0060-cross-fork-sync/fs-export-search-widening.md',
    type: 'handoff',
    normative: false,
  },
  {
    path: 'docs/handoffs/2026.07.24-0060-cross-fork-sync/fs-realtime-stream-recovery.md',
    type: 'handoff',
    normative: false,
  },
  {
    path: 'docs/handoffs/2026.07.24-0060-cross-fork-sync/fs-keyset-cursor-verdict.md',
    type: 'handoff',
    normative: false,
  },
  {
    path: 'docs/handoffs/2026.07.24-0060-cross-fork-sync/fs-e2e-coverage-parity.md',
    type: 'handoff',
    normative: false,
  },
  {
    path: 'docs/handoffs/2026.07.24-0060-cross-fork-sync/fs-env-failfast-proof.md',
    type: 'handoff',
    normative: false,
  },
  {
    path: 'docs/handoffs/2026.07.24-0060-cross-fork-sync/pg-digest-guard.md',
    type: 'handoff',
    normative: false,
  },
  {
    path: 'docs/handoffs/2026.07.24-0060-cross-fork-sync/pg-hardening-backport.md',
    type: 'handoff',
    normative: false,
  },
  {
    path: 'docs/handoffs/2026.07.24-0060-cross-fork-sync/pg-form-bridge.md',
    type: 'handoff',
    normative: false,
  },
  {
    path: 'docs/handoffs/2026.07.24-0060-cross-fork-sync/pg-local-ci.md',
    type: 'handoff',
    normative: false,
  },
  {
    path: 'docs/handoffs/2026.07.24-0060-cross-fork-sync/pg-template-parity.md',
    type: 'handoff',
    normative: false,
  },
]
