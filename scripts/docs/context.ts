/**
 * The production `CheckContext` — the real repo wired into the checks. Kept
 * separate from `check.ts` (the CLI) so `check.test.ts` can assert the real tree
 * is clean without shelling out.
 */
import { fileURLToPath } from 'node:url'

import type { CheckContext, GeneratedPair, ReadmeProfile } from './checks.ts'
import { generatedReferencePairs } from './generate-reference.ts'
import { docsManifest } from './manifest.ts'

/** Repo root — this file lives at `<root>/scripts/docs/context.ts`. */
export const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

/**
 * Tokens that match a banned pattern but are legitimate here.
 * - `R2` is Cloudflare R2 (the S3-compatible storage backend), not a requirement
 *   id — it appears throughout the storage/deploy docs and is not brittle.
 */
export const allowlistTokens: string[] = ['R2']

/**
 * Generated/source doc pairs, taken straight from the generator so `docs:check`
 * and `docs:generate` share ONE render function. Anything else would let the two
 * disagree about what "up to date" means, which is the failure a generated doc
 * is most likely to have.
 */
export const generatedPairs: GeneratedPair[] = generatedReferencePairs

/**
 * The machine-checkable half of `docs/reference/contracts/project-readme.md`.
 * The contract is the authority; this is only the part a script can prove, and
 * it is deliberately the smaller of the two — shape and ownership, never prose.
 */
export const readmeProfile: ReadmeProfile = {
  file: 'README.md',
  packageFile: 'package.json',
  commandFiles: [
    'docs/reference/contracts/project-readme.md',
    'docs/how-to/maintain-project-readme.md',
  ],
  areas: [
    {
      id: 'product',
      required: true,
      describe: 'problem, adopter, outcome, workflows, boundary, non-scope',
    },
    {
      id: 'quickstart',
      required: true,
      describe: 'prerequisites, the shortest command path, observable success',
    },
    {
      id: 'verification',
      required: true,
      describe: 'the one canonical verification command and its limits',
    },
    {
      id: 'navigation',
      required: true,
      describe: 'the role-oriented map into the canonical docs',
    },
    {
      id: 'deployment',
      required: true,
      describe: 'the deployment target and a link to its runbook',
    },
    {
      id: 'ownership',
      required: false,
      describe: 'real product/technical/support destinations, or nothing',
    },
  ],
  owners: [
    {
      area: 'root orientation',
      path: 'README.md',
      type: 'root-guide',
      normative: false,
    },
    {
      area: 'README contract',
      path: 'docs/reference/contracts/project-readme.md',
      type: 'reference-contract',
      normative: true,
    },
    {
      area: 'README maintenance',
      path: 'docs/how-to/maintain-project-readme.md',
      type: 'how-to',
      normative: false,
    },
    {
      area: 'product facts',
      path: 'docs/explanation/product-context.md',
      type: 'explanation',
      normative: false,
    },
    {
      area: 'command reference',
      path: 'docs/reference/commands.md',
      type: 'reference',
      normative: false,
    },
    {
      area: 'configuration reference',
      path: 'docs/reference/configuration.md',
      type: 'reference',
      normative: false,
    },
    {
      area: 'capability reference',
      path: 'docs/reference/capabilities.md',
      type: 'reference',
      normative: false,
    },
    {
      area: 'project layout reference',
      path: 'docs/reference/project-layout.md',
      type: 'reference',
      normative: false,
    },
  ],
  // `install` is the package manager's own verb, not a repo script. Nothing else
  // is exempt: inside these three files a bare `pnpm <word>` must be real.
  packageManagerVerbs: ['install'],
}

export const realContext: CheckContext = {
  root: repoRoot,
  docsDir: 'docs',
  indexFile: 'docs/README.md',
  manifest: docsManifest,
  scanExtras: ['README.md', 'AGENTS.md'],
  symlink: { link: 'CLAUDE.md', target: 'AGENTS.md' },
  allowlistTokens,
  generatedPairs,
  readmeProfile,
}
