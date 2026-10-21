/**
 * The documentation checks. Each is a pure function over a `CheckContext`, so it
 * can run against the real repo OR against an isolated fixture tree — that is how
 * `check.test.ts` proves every check bites without touching real docs.
 *
 * Violations name their target in STABLE terms — a doc path, a link, a symlink —
 * never a source line number, because a line number is exactly the kind of
 * brittle reference the `banned-brittle-content` check exists to forbid. A stable
 * target is also what an exemption keys on.
 */
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import {
  REQUIRED_METADATA_FIELDS,
  type DocEntry,
  type DocType,
} from './manifest.ts'

/** A single problem found by a check. `check` + `target` is its stable identity. */
export interface Violation {
  /** The check that produced it (matches the registry key). */
  check: string
  /** Stable identifier of the offending thing — no source-line references. */
  target: string
  /** Human-readable explanation, owner-oriented. */
  message: string
}

/** A generated reference doc paired with the sources it is derived from. */
export interface GeneratedPair {
  /** Repo-relative path of the generated doc. */
  generated: string
  /**
   * Repo-relative paths of the sources it is derived from. Named in the failure
   * message and existence-checked. May be empty when the source is the tree
   * itself rather than a file — drift is still caught, because `render` re-reads
   * whatever it derives from on every run.
   */
  sources: string[]
  /**
   * Derive the expected content from the tree rooted at `root`. This must be the
   * SAME function the generator writes with, so the writer and the checker cannot
   * disagree about what "up to date" means.
   */
  render: (root: string) => string
}

/** One area the root README owns, identified by a stable marker rather than prose. */
export interface ReadmeArea {
  /** Marker id: the section is opened by `<!-- readme:<id> -->` on its own line. */
  id: string
  /** Whether the README must carry it. Optional areas may be absent entirely. */
  required: boolean
  /** What the area owns, quoted back in the failure message. */
  describe: string
}

/** A documentation area and the single document declared to own it. */
export interface CanonicalOwner {
  /** Stable area name, used in failure messages. */
  area: string
  /** Repo-relative path of the one owning document. */
  path: string
  /** The manifest type that document must be registered with. */
  type: DocType
  /** Whether that document must be registered as normative. */
  normative: boolean
}

/**
 * The machine-checkable part of the README contract
 * (`docs/reference/contracts/project-readme.md`), or null to skip it.
 *
 * Areas are keyed on HTML-comment MARKERS, not on heading text: the README is
 * written in Bahasa Indonesia and every fork may reword it, so a heading regex
 * would be a fragile taxonomy the moment a second project inherits the contract.
 * A marker survives translation, rewording and reordering, and it keeps the
 * machine layer smaller than the human contract — which is the point.
 */
export interface ReadmeProfile {
  /** The root README, relative to root. */
  file: string
  /** `package.json`, relative to root — the authority on which scripts exist. */
  packageFile: string
  /**
   * Docs whose `pnpm <script>` references must resolve. Deliberately narrow: the
   * README and the two documents that own its rules, not the whole tree.
   */
  commandFiles: string[]
  /** The areas the README owns. */
  areas: ReadmeArea[]
  /** One area, one document — enforced against the manifest. */
  owners: CanonicalOwner[]
  /** `pnpm` invocations that are package-manager verbs, not repo scripts. */
  packageManagerVerbs: string[]
}

/**
 * Everything a check needs, resolved against `root`. The real run points `root`
 * at the repo; a fixture run points it at a fixture directory with its own tiny
 * manifest — the checks cannot tell the difference, which is the point.
 */
export interface CheckContext {
  /** Absolute base directory all relative paths resolve against. */
  root: string
  /** Directory (relative to root) enumerated for index membership + scanning. */
  docsDir: string
  /** The docs index file, relative to root. */
  indexFile: string
  /** Tracked docs (paths relative to root). */
  manifest: DocEntry[]
  /** Extra files (relative to root) scanned for links + banned content. */
  scanExtras: string[]
  /** Symlink integrity expectation, or null to skip. */
  symlink: { link: string; target: string } | null
  /** Tokens that look like a banned id/pattern but are legitimate (e.g. `R2`). */
  allowlistTokens: string[]
  /** Generated/source pairs for the drift check (empty until any exist). */
  generatedPairs: GeneratedPair[]
  /** The root-README contract profile, or null to skip the README checks. */
  readmeProfile: ReadmeProfile | null
}

type Check = (ctx: CheckContext) => Violation[]

// --- shared helpers ---------------------------------------------------------

const abs = (ctx: CheckContext, rel: string): string => resolve(ctx.root, rel)
const rel = (ctx: CheckContext, absolute: string): string =>
  relative(ctx.root, absolute).split('\\').join('/')

/** The handoff subtree — transient notes, skipped by the content checks. */
const handoffDir = (ctx: CheckContext): string =>
  join(ctx.docsDir, 'handoffs').split('\\').join('/')

const isHandoffPath = (ctx: CheckContext, relPath: string): boolean =>
  relPath === handoffDir(ctx) || relPath.startsWith(`${handoffDir(ctx)}/`)

const handoffName = /^(\d{4}\.\d{2}\.\d{2})-(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)$/

/** All `.md` files under a directory (recursive), as paths relative to root. */
function listMarkdown(ctx: CheckContext, relDir: string): string[] {
  const dir = abs(ctx, relDir)
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const childRel = join(relDir, entry.name).split('\\').join('/')
    if (entry.isDirectory()) out.push(...listMarkdown(ctx, childRel))
    else if (entry.name.endsWith('.md')) out.push(childRel)
  }
  return out.toSorted()
}

function isCalendarDate(date: string): boolean {
  const [yearText, monthText, dayText] = date.split('.')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

function handoffMetadata(text: string): string | null {
  const heading = '## Handoff Metadata\n'
  const start = text.indexOf(heading)
  if (start < 0) return null
  const body = text.slice(start + heading.length)
  const nextHeading = body.search(/^## /m)
  return nextHeading < 0 ? body : body.slice(0, nextHeading)
}

function metadataValues(metadata: string, field: string): string[] {
  return [...metadata.matchAll(new RegExp(`^- ${field}: (.+)$`, 'gm'))].map(
    (match) => match[1].replace(/^`|`$/g, ''),
  )
}

/** Files scanned for links + banned content: tracked non-handoff docs + extras. */
function scanTargets(ctx: CheckContext): string[] {
  const fromManifest = ctx.manifest
    .filter((d) => d.type !== 'handoff')
    .map((d) => d.path)
  return [...new Set([...fromManifest, ...ctx.scanExtras])]
    .filter((p) => existsSync(abs(ctx, p)))
    .toSorted()
}

/** Markdown link targets `[text](target)` in a file (raw, unresolved). */
function markdownLinkTargets(text: string): string[] {
  const out: string[] = []
  const re = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.push(m[1])
  return out
}

/** True for links that point outside the filesystem (external / anchors / mail). */
function isExternalLink(target: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(target) || // scheme: http:, mailto:, tel:, …
    target.startsWith('#') ||
    target.startsWith('//')
  )
}

/**
 * Markdown with fenced blocks and inline code removed. Used where a doc must be
 * able to QUOTE a marker without carrying it — the README contract shows the
 * marker syntax in a fence, and that example must not read as a second claim on
 * the area.
 */
function withoutCode(text: string): string {
  const out: string[] = []
  let fence: string | null = null
  for (const line of text.split('\n')) {
    const open = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (
        open &&
        open[1].startsWith(fence[0]) &&
        open[1].length >= fence.length
      )
        fence = null
      continue
    }
    if (open) {
      fence = open[1]
      continue
    }
    out.push(line.replace(/`[^`\n]*`/g, ''))
  }
  return out.join('\n')
}

/** `<!-- readme:<id> -->` markers, in document order. */
function readmeMarkers(text: string): string[] {
  return [
    ...withoutCode(text).matchAll(/<!--\s*readme:([a-z][a-z0-9-]*)\s*-->/g),
  ].map((match) => match[1])
}

/** The slice of a README owned by one marker: up to the next marker or the end. */
function readmeSection(text: string, id: string): string {
  const start = text.search(new RegExp(`<!--\\s*readme:${id}\\s*-->`))
  if (start < 0) return ''
  const rest = text.slice(start)
  const next = rest.slice(1).search(/<!--\s*readme:[a-z][a-z0-9-]*\s*-->/)
  return next < 0 ? rest : rest.slice(0, next + 1)
}

/**
 * Shapes that mean "nobody filled this in". Rejected inside an OPTIONAL README
 * area, which is why the area stays optional: shipping `TODO` as an owner is
 * worse than shipping no owner section at all.
 */
const placeholderShapes: { label: string; re: RegExp }[] = [
  { label: 'TODO/TBD/FIXME', re: /\b(?:TODO|TBD|FIXME)\b/ },
  { label: 'an <angle-bracket> slot', re: /<[a-z][a-z0-9 _-]*>/i },
  { label: 'an example.com address', re: /\bexample\.com\b/i },
]

// --- checks ------------------------------------------------------------------

/**
 * Every tracked doc under `docsDir` (handoffs and the index itself excepted) is
 * linked from the index, and every index link resolves. Bi-directional: no
 * orphan docs, no dead index entries.
 */
const indexMembership: Check = (ctx) => {
  const violations: Violation[] = []
  const indexAbs = abs(ctx, ctx.indexFile)
  if (!existsSync(indexAbs)) {
    return [
      {
        check: 'index-membership',
        target: ctx.indexFile,
        message: 'docs index file does not exist',
      },
    ]
  }

  const indexText = readFileSync(indexAbs, 'utf8')
  const indexDir = dirname(indexAbs)
  const linked = new Set<string>()
  for (const link of markdownLinkTargets(indexText)) {
    if (isExternalLink(link)) continue
    const targetAbs = resolve(indexDir, link.split('#')[0])
    const targetRel = rel(ctx, targetAbs)
    if (!existsSync(targetAbs)) {
      violations.push({
        check: 'index-membership',
        target: `${ctx.indexFile} -> ${link}`,
        message: 'index links to a file that does not exist (dead entry)',
      })
      continue
    }
    linked.add(targetRel)
  }

  const onDisk = listMarkdown(ctx, ctx.docsDir).filter(
    (p) => p !== ctx.indexFile && !isHandoffPath(ctx, p),
  )
  for (const doc of onDisk) {
    if (!linked.has(doc)) {
      violations.push({
        check: 'index-membership',
        target: doc,
        message:
          'doc exists on disk but is not listed in the docs index (orphan)',
      })
    }
  }
  return violations
}

/** Normative docs must open with the six ownership metadata fields. */
const metadataPresence: Check = (ctx) => {
  const violations: Violation[] = []
  for (const doc of ctx.manifest) {
    if (!doc.normative) continue
    const docAbs = abs(ctx, doc.path)
    if (!existsSync(docAbs)) {
      violations.push({
        check: 'metadata-presence',
        target: doc.path,
        message: 'normative doc is missing from disk',
      })
      continue
    }
    const head = readFileSync(docAbs, 'utf8')
      .split('\n')
      .slice(0, 40)
      .join('\n')
    const missing = REQUIRED_METADATA_FIELDS.filter((field) => {
      const re = new RegExp(
        `^\\s*(?:[-*]\\s+)?\\*{0,2}${field}\\*{0,2}\\s*[:—-]`,
        'im',
      )
      return !re.test(head)
    })
    if (missing.length > 0) {
      violations.push({
        check: 'metadata-presence',
        target: doc.path,
        message: `missing required metadata field(s): ${missing.join(', ')}`,
      })
    }
  }
  return violations
}

/**
 * Every doc on disk under `docsDir` is CLAIMED by the manifest.
 *
 * This is the mirror of `manifest-paths` (manifest -> disk), and the two together
 * are what make ownership total. Without it a file that is on disk AND linked
 * from the index is invisible: `index-membership` sees it linked, `manifest-paths`
 * never looks at it, and every manifest-driven check — `metadata-presence`,
 * `local-links`, `banned-brittle-content` — iterates the manifest, so the doc
 * carries zero coverage while reading as tracked. That is exactly how the retired
 * top-level documents survived a restructure unchecked.
 *
 * The handoff subtree is excluded for the same reason `index-membership` excludes
 * it: handoffs are transient and `handoff-naming` owns them.
 */
const manifestMembership: Check = (ctx) => {
  const claimed = new Set(ctx.manifest.map((doc) => doc.path))
  return listMarkdown(ctx, ctx.docsDir)
    .filter((doc) => !isHandoffPath(ctx, doc) && !claimed.has(doc))
    .map((doc) => ({
      check: 'manifest-membership',
      target: doc,
      message:
        'doc exists on disk but is not tracked in scripts/docs/manifest.ts ' +
        '(unowned — no check reads it)',
    }))
}

/** Every manifest entry names a document that exists in the repository. */
const manifestPaths: Check = (ctx) =>
  ctx.manifest.flatMap((doc) =>
    existsSync(abs(ctx, doc.path))
      ? []
      : [
          {
            check: 'manifest-paths',
            target: doc.path,
            message: 'manifest entry points to a document that does not exist',
          },
        ],
  )

/** Handoff folders encode repository-local execution sequence and metadata. */
const handoffNaming: Check = (ctx) => {
  const dir = abs(ctx, handoffDir(ctx))
  if (!existsSync(dir)) return []

  const violations: Violation[] = []
  const seen = new Set<string>()
  for (const entry of readdirSync(dir, { withFileTypes: true }).toSorted(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    if (!entry.isDirectory()) continue
    const path = `${handoffDir(ctx)}/${entry.name}`
    const match = handoffName.exec(entry.name)
    if (!match) {
      violations.push({
        check: 'handoff-naming',
        target: path,
        message:
          'handoff folder must match YYYY.MM.DD-NNNN-lowercase-kebab-slug',
      })
      continue
    }

    const [, date, sequenceText] = match
    if (!isCalendarDate(date)) {
      violations.push({
        check: 'handoff-naming',
        target: path,
        message: 'handoff date must be a real calendar date',
      })
    }

    const sequence = Number(sequenceText)
    if (sequence < 10 || sequence % 10 !== 0) {
      violations.push({
        check: 'handoff-naming',
        target: path,
        message: 'handoff sequence must be a positive multiple of ten',
      })
    }

    const key = `${date}-${sequenceText}`
    if (seen.has(key)) {
      violations.push({
        check: 'handoff-naming',
        target: path,
        message: `handoff sequence duplicates ${key} within this repository date`,
      })
    }
    seen.add(key)

    const readme = `${path}/README.md`
    if (!existsSync(abs(ctx, readme))) {
      violations.push({
        check: 'handoff-naming',
        target: path,
        message: 'handoff folder must contain README.md',
      })
      continue
    }

    const text = readFileSync(abs(ctx, readme), 'utf8')
    const metadata = handoffMetadata(text)
    const fields = [
      'Sequence',
      'Repository',
      'Created',
      'Parent',
      'Status',
      'Next action',
    ]
    const malformed = metadata
      ? fields.filter((field) => metadataValues(metadata, field).length !== 1)
      : fields
    if (!metadata || malformed.length > 0) {
      violations.push({
        check: 'handoff-naming',
        target: readme,
        message: `handoff README has missing or duplicate metadata: ${malformed.join(', ') || 'heading'}`,
      })
      continue
    }

    if (metadataValues(metadata, 'Sequence')[0] !== sequenceText) {
      violations.push({
        check: 'handoff-naming',
        target: readme,
        message: 'metadata sequence must match the handoff folder',
      })
    }
    if (metadataValues(metadata, 'Created')[0] !== date) {
      violations.push({
        check: 'handoff-naming',
        target: readme,
        message: 'metadata created date must match the handoff folder',
      })
    }
    const parent = metadataValues(metadata, 'Parent')[0]
    if (parent.startsWith('docs/handoffs/')) {
      const validShape =
        /^docs\/handoffs\/\d{4}\.\d{2}\.\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\/README\.md$/.test(
          parent,
        )
      const parentAbs = abs(ctx, parent)
      if (
        !validShape ||
        parent === readme ||
        !existsSync(parentAbs) ||
        !lstatSync(parentAbs).isFile()
      ) {
        violations.push({
          check: 'handoff-naming',
          target: readme,
          message: `local metadata parent is not a valid handoff README: ${parent}`,
        })
      }
    }
  }
  return violations
}

/** Every relative markdown link in a tracked doc resolves to an existing file. */
const localLinks: Check = (ctx) => {
  const violations: Violation[] = []
  for (const file of scanTargets(ctx)) {
    const fileAbs = abs(ctx, file)
    const fileDir = dirname(fileAbs)
    const text = readFileSync(fileAbs, 'utf8')
    for (const link of markdownLinkTargets(text)) {
      if (isExternalLink(link)) continue
      const targetAbs = resolve(fileDir, link.split('#')[0])
      if (!existsSync(targetAbs)) {
        violations.push({
          check: 'local-links',
          target: `${file} -> ${link}`,
          message: 'relative link points to a file that does not exist',
        })
      }
    }
  }
  return violations
}

/** `CLAUDE.md` is a symlink to `AGENTS.md` and it resolves. */
const symlinkIntegrity: Check = (ctx) => {
  if (!ctx.symlink) return []
  const { link, target } = ctx.symlink
  const linkAbs = abs(ctx, link)
  let stat
  try {
    stat = lstatSync(linkAbs)
  } catch {
    return [
      {
        check: 'symlink-integrity',
        target: link,
        message: 'symlink is missing',
      },
    ]
  }
  if (!stat.isSymbolicLink()) {
    return [
      {
        check: 'symlink-integrity',
        target: link,
        message: `expected a symlink to ${target}, found a regular file`,
      },
    ]
  }
  const actual = readlinkSync(linkAbs).split('\\').join('/')
  if (actual !== target) {
    return [
      {
        check: 'symlink-integrity',
        target: link,
        message: `symlink points at "${actual}", expected "${target}"`,
      },
    ]
  }
  if (!existsSync(linkAbs)) {
    return [
      {
        check: 'symlink-integrity',
        target: link,
        message: `symlink target "${target}" does not resolve`,
      },
    ]
  }
  return []
}

/** Patterns that rot: source-line refs, historical counts, unowned ids, llms.txt. */
const bannedPatterns: { kind: string; re: RegExp; describe: string }[] = [
  {
    kind: 'source-line-reference',
    re: /\bline\s+\d+\b/gi,
    describe: 'bare source-line reference (rots as the file changes)',
  },
  {
    kind: 'historical-test-count',
    re: /\b\d+\s+tests?\s+pass(?:ing|ed)?\b/gi,
    describe: 'historical test count (rots as tests change)',
  },
  {
    kind: 'unowned-decision-id',
    re: /\b[DR]\d+\b/g,
    describe: 'bare D#/R# identifier with no owning record',
  },
  {
    kind: 'llms-txt-reference',
    re: /\bllms\.txt\b/gi,
    describe: 'reference to docs/llms.txt (not part of this docs surface)',
  },
]

/** Flag brittle references in tracked docs; `allowlistTokens` clears legit hits. */
const bannedBrittleContent: Check = (ctx) => {
  const violations: Violation[] = []
  const allow = new Set(ctx.allowlistTokens)
  for (const file of scanTargets(ctx)) {
    const text = readFileSync(abs(ctx, file), 'utf8')
    for (const { kind, re, describe } of bannedPatterns) {
      const hits = new Set<string>()
      for (const m of text.matchAll(re)) {
        if (!allow.has(m[0])) hits.add(m[0])
      }
      if (hits.size > 0) {
        violations.push({
          check: 'banned-brittle-content',
          target: `${file}::${kind}`,
          message: `${describe}: ${[...hits].toSorted().join(', ')}`,
        })
      }
    }
  }
  return violations
}

/**
 * Generated reference docs must equal what their sources render to — byte for
 * byte, because anything looser turns a stale page into a judgement call.
 *
 * This bites in both directions, which is the point: hand-editing a generated
 * doc fails it, and changing a source without regenerating fails it too. A render
 * that THROWS is reported rather than crashing the run, because the generator
 * refuses by design when a source grows something it has no wording for — that
 * refusal is the most useful failure this check can produce, and it must reach
 * the report intact.
 */
const generatedDrift: Check = (ctx) => {
  const violations: Violation[] = []
  for (const pair of ctx.generatedPairs) {
    const missingSources = pair.sources.filter((s) => !existsSync(abs(ctx, s)))
    if (missingSources.length > 0) {
      violations.push({
        check: 'generated-drift',
        target: pair.generated,
        message: `source(s) missing: ${missingSources.join(', ')}`,
      })
      continue
    }

    let expected: string
    try {
      expected = pair.render(ctx.root)
    } catch (error) {
      violations.push({
        check: 'generated-drift',
        target: pair.generated,
        message: `cannot be generated: ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
      continue
    }

    const genAbs = abs(ctx, pair.generated)
    const actual = existsSync(genAbs) ? readFileSync(genAbs, 'utf8') : null
    if (actual !== expected) {
      violations.push({
        check: 'generated-drift',
        target: pair.generated,
        message:
          'generated doc does not match its source — run `pnpm docs:generate` ' +
          `(sources: ${pair.sources.join(', ') || 'the working tree'})`,
      })
    }
  }
  return violations
}

/**
 * The root README carries every required ownership area exactly once, no other
 * doc claims one, and an optional area that IS present is actually filled in.
 *
 * What this cannot do is judge the prose — it proves the areas exist and are
 * singly owned, which is precisely the failure a README suffers as it ages:
 * the product summary quietly disappears into a stack list, or a second file
 * grows into a competing README.
 */
const readmeContract: Check = (ctx) => {
  const profile = ctx.readmeProfile
  if (!profile) return []

  const readmeAbs = abs(ctx, profile.file)
  if (!existsSync(readmeAbs)) {
    return [
      {
        check: 'readme-contract',
        target: profile.file,
        message: 'the root README does not exist',
      },
    ]
  }

  const violations: Violation[] = []
  const text = readFileSync(readmeAbs, 'utf8')
  const byId = new Map(profile.areas.map((area) => [area.id, area]))

  const counts = new Map<string, number>()
  for (const id of readmeMarkers(text)) {
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  for (const [id, count] of counts) {
    if (!byId.has(id)) {
      violations.push({
        check: 'readme-contract',
        target: `${profile.file}::readme:${id}`,
        message: 'unknown README area marker — not declared by the contract',
      })
      continue
    }
    if (count > 1) {
      violations.push({
        check: 'readme-contract',
        target: `${profile.file}::readme:${id}`,
        message: `README area is opened ${count} times; each area is owned once`,
      })
    }
  }

  for (const area of profile.areas) {
    if (!area.required || counts.has(area.id)) continue
    violations.push({
      check: 'readme-contract',
      target: `${profile.file}::readme:${area.id}`,
      message: `required README area is missing (${area.describe}) — open it with <!-- readme:${area.id} -->`,
    })
  }

  for (const area of profile.areas) {
    if (area.required || !counts.has(area.id)) continue
    const section = withoutCode(readmeSection(text, area.id))
    for (const shape of placeholderShapes) {
      if (shape.re.test(section)) {
        violations.push({
          check: 'readme-contract',
          target: `${profile.file}::readme:${area.id}`,
          message: `optional README area contains a placeholder (${shape.label}) — fill it in or delete the section`,
        })
      }
    }
  }

  for (const file of scanTargets(ctx)) {
    if (file === profile.file) continue
    const found = readmeMarkers(readFileSync(abs(ctx, file), 'utf8'))
    if (found.length > 0) {
      violations.push({
        check: 'readme-contract',
        target: file,
        message: `carries README area marker(s) the root README owns: ${[...new Set(found)].toSorted().join(', ')}`,
      })
    }
  }

  return violations
}

/**
 * Every `pnpm <script>` the README and its two owning docs name is a real script
 * in `package.json`. A README that advertises a renamed command is the single
 * most expensive documentation bug there is: it fails on the reader's first
 * minute, before they have any way to tell whether the repo or the doc is wrong.
 */
const readmeCommands: Check = (ctx) => {
  const profile = ctx.readmeProfile
  if (!profile) return []

  const packageAbs = abs(ctx, profile.packageFile)
  if (!existsSync(packageAbs)) {
    return [
      {
        check: 'readme-commands',
        target: profile.packageFile,
        message:
          'package manifest is missing — cannot verify documented scripts',
      },
    ]
  }

  const scripts = new Set(
    Object.keys(
      (JSON.parse(readFileSync(packageAbs, 'utf8')).scripts ?? {}) as Record<
        string,
        string
      >,
    ),
  )
  const verbs = new Set(profile.packageManagerVerbs)

  const violations: Violation[] = []
  for (const file of [profile.file, ...profile.commandFiles]) {
    if (!existsSync(abs(ctx, file))) continue
    const text = readFileSync(abs(ctx, file), 'utf8')
    const named = new Set<string>()
    for (const match of text.matchAll(
      /\bpnpm\s+(?:run\s+)?([A-Za-z0-9][A-Za-z0-9:._-]*)/g,
    )) {
      const name = match[1]
      if (verbs.has(name) || scripts.has(name)) continue
      named.add(name)
    }
    for (const name of [...named].toSorted()) {
      violations.push({
        check: 'readme-commands',
        target: `${file} -> pnpm ${name}`,
        message: `documented command is not a script in ${profile.packageFile}`,
      })
    }
  }
  return violations
}

/**
 * One area, one owner. Each canonical document is registered exactly once, with
 * the type the contract declares, and no two areas name the same file — so a
 * near-duplicate owner (a second README guide, a hand-written command list) has
 * to displace the incumbent rather than quietly sit beside it.
 */
const canonicalOwnership: Check = (ctx) => {
  const profile = ctx.readmeProfile
  if (!profile) return []

  const violations: Violation[] = []
  const byPath = new Map<string, string[]>()
  for (const owner of profile.owners) {
    byPath.set(owner.path, [...(byPath.get(owner.path) ?? []), owner.area])
  }
  for (const [path, areas] of byPath) {
    if (areas.length > 1) {
      violations.push({
        check: 'canonical-ownership',
        target: path,
        message: `one document is declared owner of ${areas.length} areas: ${areas.toSorted().join(', ')}`,
      })
    }
  }

  for (const owner of profile.owners) {
    const entries = ctx.manifest.filter((doc) => doc.path === owner.path)
    if (entries.length === 0) {
      violations.push({
        check: 'canonical-ownership',
        target: owner.path,
        message: `no manifest entry owns "${owner.area}"`,
      })
      continue
    }
    if (entries.length > 1) {
      violations.push({
        check: 'canonical-ownership',
        target: owner.path,
        message: `declared ${entries.length} times in the manifest for "${owner.area}"`,
      })
      continue
    }
    const [entry] = entries
    if (entry.type !== owner.type || entry.normative !== owner.normative) {
      violations.push({
        check: 'canonical-ownership',
        target: owner.path,
        message: `owner of "${owner.area}" is registered as ${entry.type}${
          entry.normative ? ' (normative)' : ''
        }, expected ${owner.type}${owner.normative ? ' (normative)' : ''}`,
      })
    }
  }
  return violations
}

/** The check registry, keyed by the name that appears in every violation. */
export const checks: Record<string, Check> = {
  'index-membership': indexMembership,
  'metadata-presence': metadataPresence,
  'manifest-paths': manifestPaths,
  'manifest-membership': manifestMembership,
  'handoff-naming': handoffNaming,
  'local-links': localLinks,
  'symlink-integrity': symlinkIntegrity,
  'banned-brittle-content': bannedBrittleContent,
  'generated-drift': generatedDrift,
  'readme-contract': readmeContract,
  'readme-commands': readmeCommands,
  'canonical-ownership': canonicalOwnership,
}

/** Run every check and return the flat list of violations. */
export function runAllChecks(ctx: CheckContext): Violation[] {
  return Object.values(checks).flatMap((check) => check(ctx))
}
