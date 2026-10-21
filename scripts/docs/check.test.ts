/**
 * Proves every documentation check bites on a violation and passes when clean,
 * using isolated fixture trees under `__fixtures__/` — so the checks are exercised
 * without depending on the real docs. Also asserts the REAL tree evaluates clean
 * (zero un-exempted violations) so `docs:check` stays green as the repo evolves.
 *
 * The `CheckContext` each fixture is driven with is built inline by `fixtureCtx`
 * (that object is the "fixture manifest").
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { checks, type CheckContext, type ReadmeProfile } from './checks.ts'
import { realContext } from './context.ts'
import { evaluate } from './evaluate.ts'
import { exemptions } from './exemptions.ts'
import type { DocEntry } from './manifest.ts'

const FIX = fileURLToPath(new URL('./__fixtures__', import.meta.url))

function fixtureCtx(
  relDir: string,
  over: Partial<CheckContext> = {},
): CheckContext {
  return {
    root: resolve(FIX, relDir),
    docsDir: 'docs',
    indexFile: 'docs/README.md',
    manifest: [],
    scanExtras: [],
    symlink: null,
    allowlistTokens: [],
    generatedPairs: [],
    readmeProfile: null,
    ...over,
  }
}

const doc = (path: string, normative = false): DocEntry => ({
  path,
  type: normative ? 'reference-contract' : 'reference',
  normative,
})

/** A minimal README profile; each README describe overrides only what it drives. */
const profileOf = (over: Partial<ReadmeProfile> = {}): ReadmeProfile => ({
  file: 'README.md',
  packageFile: 'package.fixture.json',
  commandFiles: [],
  areas: [],
  owners: [],
  packageManagerVerbs: ['install'],
  ...over,
})

describe('index-membership', () => {
  const run = checks['index-membership']
  it('passes when every doc is linked and every link resolves', () => {
    expect(run(fixtureCtx('index-membership/good'))).toEqual([])
  })
  it('bites on an orphan doc AND a dead index entry', () => {
    const found = run(fixtureCtx('index-membership/bad'))
    const targets = found.map((v) => v.target)
    // Orphan: on disk, not linked.
    expect(targets).toContain('docs/orphan.md')
    // Dead entry: linked, not on disk.
    expect(targets).toContain('docs/README.md -> missing.md')
    expect(found.length).toBe(2)
  })
})

describe('metadata-presence', () => {
  const run = checks['metadata-presence']
  const manifest = [doc('docs/contract.md', true)]
  it('passes when a normative doc carries all six fields', () => {
    expect(run(fixtureCtx('metadata-presence/good', { manifest }))).toEqual([])
  })
  it('bites when a normative doc is missing the fields', () => {
    const found = run(fixtureCtx('metadata-presence/bad', { manifest }))
    expect(found).toHaveLength(1)
    expect(found[0].target).toBe('docs/contract.md')
    // All six named as missing — proves it inspects the fields, not just presence.
    for (const field of [
      'Type',
      'Owns',
      'Source of truth',
      'Verified by',
      'Read when',
      'Does not define',
    ]) {
      expect(found[0].message).toContain(field)
    }
  })
  it('ignores non-normative docs', () => {
    const nonNormative = [doc('docs/contract.md', false)]
    expect(
      run(fixtureCtx('metadata-presence/bad', { manifest: nonNormative })),
    ).toEqual([])
  })
})

describe('handoff-naming', () => {
  const run = checks['handoff-naming']

  function withHandoffs(
    names: string[],
    options: { readmes?: Record<string, string> } = {},
  ): CheckContext {
    const root = mkdtempSync(join(tmpdir(), 'handoff-naming-'))
    const handoffs = join(root, 'docs', 'handoffs')
    mkdirSync(handoffs, { recursive: true })
    for (const name of names) {
      const dir = join(handoffs, name)
      mkdirSync(dir)
      const match = /^(\d{4}\.\d{2}\.\d{2})-(\d{4})-/.exec(name)
      if (!match) continue
      writeFileSync(
        join(dir, 'README.md'),
        options.readmes?.[name] ??
          `## Handoff Metadata\n\n- Sequence: \`${match[2]}\`\n- Repository: \`/repo\`\n- Created: \`${match[1]}\`\n- Parent: \`None\`\n- Status: \`PLANNED\`\n- Next action: Continue.\n`,
      )
    }
    return fixtureCtx('.', { root })
  }

  it('passes sequenced lowercase-kebab handoff folders', () => {
    expect(
      run(
        withHandoffs([
          '2026.07.21-0010-foundation',
          '2026.07.21-0020-admin-account',
          '2026.07.22-0010-next-train',
          '2026.07.23-0040-existing-gap',
        ]),
      ),
    ).toEqual([])
  })

  it('accepts an existing 0040 gap with an absolute parent dependency', () => {
    const name = '2026.07.21-0040-postgresql-fork'
    const readme = `## Handoff Metadata\n\n- Sequence: \`0040\`\n- Repository: \`/target/repo\`\n- Created: \`2026.07.21\`\n- Parent: \`/source/repo/docs/handoffs/2026.07.21-0010-foundation/README.md\`\n- Status: \`BLOCKED ON FORK BASE\`\n- Next action: Wait for the fork base.\n`
    expect(run(withHandoffs([name], { readmes: { [name]: readme } }))).toEqual(
      [],
    )
  })

  it('bites on legacy, invalid dates, zero, non-incremental, and duplicate sequences', () => {
    const found = run(
      withHandoffs([
        '2026.07.21-foundation',
        '2026.07.21-0000-zero',
        '2026.07.21-0015-not-a-ten',
        '2026.07.21-0020-Uppercase',
        '2026.02.31-0030-not-a-date',
        '2026.07.21-0010-first',
        '2026.07.21-0010-duplicate',
      ]),
    )
    expect(found.map((violation) => violation.target).toSorted()).toEqual([
      'docs/handoffs/2026.02.31-0030-not-a-date',
      'docs/handoffs/2026.07.21-0000-zero',
      'docs/handoffs/2026.07.21-0010-first',
      'docs/handoffs/2026.07.21-0015-not-a-ten',
      'docs/handoffs/2026.07.21-0020-Uppercase',
      'docs/handoffs/2026.07.21-foundation',
    ])
  })

  it('requires a README and matching metadata block', () => {
    const name = '2026.07.21-0010-foundation'
    const root = mkdtempSync(join(tmpdir(), 'handoff-naming-'))
    const dir = join(root, 'docs', 'handoffs', name)
    mkdirSync(dir, { recursive: true })
    expect(run(fixtureCtx('.', { root }))[0].message).toContain('README.md')

    const readme = `## Handoff Metadata\n\n- Sequence: \`0020\`\n- Repository: \`/repo\`\n- Created: \`2026.07.22\`\n- Parent: \`docs/handoffs/2026.07.21-0090-missing/README.md\`\n- Status: \`BLOCKED ON INPUT\`\n- Next action: Continue.\n\n## Later template\n\n- Sequence: \`0010\`\n- Created: \`2026.07.21\`\n`
    writeFileSync(join(dir, 'README.md'), readme)
    const messages = run(fixtureCtx('.', { root })).map(
      (violation) => violation.message,
    )
    expect(messages).toContain(
      'metadata sequence must match the handoff folder',
    )
    expect(messages).toContain(
      'metadata created date must match the handoff folder',
    )
    expect(messages).toContain(
      'local metadata parent is not a valid handoff README: docs/handoffs/2026.07.21-0090-missing/README.md',
    )
  })

  it('rejects duplicate metadata and unsafe local parents', () => {
    const name = '2026.07.21-0010-foundation'
    const duplicate = `## Handoff Metadata\n\n- Sequence: \`0010\`\n- Sequence: \`0010\`\n- Repository: \`/repo\`\n- Created: \`2026.07.21\`\n- Parent: \`None\`\n- Status: \`PLANNED\`\n- Next action: Continue.\n`
    const duplicateMessages = run(
      withHandoffs([name], { readmes: { [name]: duplicate } }),
    ).map((violation) => violation.message)
    expect(duplicateMessages[0]).toContain('Sequence')

    const unsafe = `## Handoff Metadata\n\n- Sequence: \`0010\`\n- Repository: \`/repo\`\n- Created: \`2026.07.21\`\n- Parent: \`docs/handoffs/../../package.json\`\n- Status: \`PLANNED\`\n- Next action: Continue.\n`
    const unsafeMessages = run(
      withHandoffs([name], { readmes: { [name]: unsafe } }),
    ).map((violation) => violation.message)
    expect(unsafeMessages).toContain(
      'local metadata parent is not a valid handoff README: docs/handoffs/../../package.json',
    )
  })
})

describe('manifest-paths', () => {
  const run = checks['manifest-paths']
  it('bites when a manifest entry is stale', () => {
    expect(
      run(fixtureCtx('.', { manifest: [doc('docs/missing.md')] })),
    ).toEqual([
      {
        check: 'manifest-paths',
        target: 'docs/missing.md',
        message: 'manifest entry points to a document that does not exist',
      },
    ])
  })
})

describe('manifest-membership', () => {
  const run = checks['manifest-membership']
  const manifest = [doc('docs/README.md'), doc('docs/tracked.md')]

  it('passes when every doc on disk is claimed by the manifest', () => {
    expect(run(fixtureCtx('manifest-membership/good', { manifest }))).toEqual(
      [],
    )
  })

  it('bites on a doc that is on disk and indexed but absent from the manifest', () => {
    const found = run(fixtureCtx('manifest-membership/bad', { manifest }))
    expect(found).toHaveLength(1)
    expect(found[0].target).toBe('docs/unowned.md')
  })

  it('is invisible to the other two membership checks — that is why it exists', () => {
    const ctx = fixtureCtx('manifest-membership/bad', { manifest })
    // Linked from the index and on disk, so index-membership is satisfied…
    expect(checks['index-membership'](ctx)).toEqual([])
    // …and manifest-paths only walks manifest -> disk, so it never sees it.
    expect(checks['manifest-paths'](ctx)).toEqual([])
  })
})

describe('local-links', () => {
  const run = checks['local-links']
  it('passes when every relative link resolves', () => {
    expect(
      run(fixtureCtx('local-links/good', { manifest: [doc('docs/a.md')] })),
    ).toEqual([])
  })
  it('bites on a link to a missing file', () => {
    const found = run(
      fixtureCtx('local-links/bad', { manifest: [doc('docs/a.md')] }),
    )
    expect(found).toHaveLength(1)
    expect(found[0].target).toBe('docs/a.md -> missing.md')
  })
})

describe('symlink-integrity', () => {
  const run = checks['symlink-integrity']
  const spec = { link: 'CLAUDE.md', target: 'AGENTS.md' }

  it('passes when CLAUDE.md is a symlink to AGENTS.md', () => {
    const base = mkdtempSync(join(tmpdir(), 'docs-check-good-'))
    writeFileSync(join(base, 'AGENTS.md'), '# agents\n')
    symlinkSync('AGENTS.md', join(base, 'CLAUDE.md'))
    expect(run(fixtureCtx('.', { root: base, symlink: spec }))).toEqual([])
  })

  it('bites when CLAUDE.md is a regular file, not a symlink', () => {
    const base = mkdtempSync(join(tmpdir(), 'docs-check-bad-'))
    writeFileSync(join(base, 'AGENTS.md'), '# agents\n')
    writeFileSync(join(base, 'CLAUDE.md'), '# not a symlink\n')
    const found = run(fixtureCtx('.', { root: base, symlink: spec }))
    expect(found).toHaveLength(1)
    expect(found[0].target).toBe('CLAUDE.md')
  })

  it('bites when the symlink points at the wrong target', () => {
    const base = mkdtempSync(join(tmpdir(), 'docs-check-wrong-'))
    writeFileSync(join(base, 'AGENTS.md'), '# agents\n')
    writeFileSync(join(base, 'OTHER.md'), '# other\n')
    symlinkSync('OTHER.md', join(base, 'CLAUDE.md'))
    const found = run(fixtureCtx('.', { root: base, symlink: spec }))
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('OTHER.md')
  })
})

describe('banned-brittle-content', () => {
  const run = checks['banned-brittle-content']
  it('passes on clean prose (R2 is allowlisted, not a requirement id)', () => {
    expect(
      run(
        fixtureCtx('banned-brittle-content/good', {
          manifest: [doc('docs/clean.md')],
          allowlistTokens: ['R2'],
        }),
      ),
    ).toEqual([])
  })
  it('bites on line refs, test counts, unowned ids, and llms.txt', () => {
    const found = run(
      fixtureCtx('banned-brittle-content/bad', {
        manifest: [doc('docs/brittle.md')],
        allowlistTokens: ['R2'],
      }),
    )
    const kinds = found.map((v) => v.target.split('::')[1]).toSorted()
    expect(kinds).toEqual([
      'historical-test-count',
      'llms-txt-reference',
      'source-line-reference',
      'unowned-decision-id',
    ])
  })
})

describe('generated-drift', () => {
  const run = checks['generated-drift']
  /** Renders the generated doc as a verbatim copy of its one source file. */
  const copyPair = {
    generated: 'docs/gen.md',
    sources: ['docs/src.md'],
    render: (root: string) =>
      readFileSync(join(root, 'docs', 'src.md'), 'utf8'),
  }
  it('passes when the generated doc matches its source', () => {
    const found = run(
      fixtureCtx('generated-drift/good', { generatedPairs: [copyPair] }),
    )
    expect(found).toEqual([])
  })
  it('bites when the generated doc has drifted from its source', () => {
    const found = run(
      fixtureCtx('generated-drift/bad', { generatedPairs: [copyPair] }),
    )
    expect(found).toHaveLength(1)
    expect(found[0].target).toBe('docs/gen.md')
  })
  it('reports a refusing generator instead of crashing the run', () => {
    const found = run(
      fixtureCtx('generated-drift/good', {
        generatedPairs: [
          {
            generated: 'docs/gen.md',
            sources: [],
            render: () => {
              throw new Error('no entry for "widget"')
            },
          },
        ],
      }),
    )
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('no entry for "widget"')
  })
})

describe('readme-contract', () => {
  const run = checks['readme-contract']
  const areas: ReadmeProfile['areas'] = [
    { id: 'product', required: true, describe: 'product orientation' },
    { id: 'quickstart', required: true, describe: 'the shortest path' },
    { id: 'verification', required: true, describe: 'the canonical gate' },
    { id: 'navigation', required: true, describe: 'the docs map' },
    { id: 'deployment', required: true, describe: 'the deploy pointer' },
    { id: 'ownership', required: false, describe: 'real destinations only' },
  ]
  const profile = (over: Partial<ReadmeProfile> = {}): ReadmeProfile =>
    profileOf({ areas, ...over })

  it('passes when every required area is claimed exactly once', () => {
    expect(
      run(
        fixtureCtx('readme-contract/good', {
          manifest: [doc('docs/other.md')],
          scanExtras: ['README.md'],
          readmeProfile: profile(),
        }),
      ),
    ).toEqual([])
  })

  it('bites when the root README does not exist', () => {
    const found = run(
      fixtureCtx('readme-contract/good', {
        readmeProfile: profile({ file: 'NOPE.md' }),
      }),
    )
    expect(found).toHaveLength(1)
    expect(found[0].message).toBe('the root README does not exist')
  })

  it('bites on a missing area, a doubled area, an unknown marker, a placeholder, and a competing owner', () => {
    const found = run(
      fixtureCtx('readme-contract/bad', {
        manifest: [doc('docs/second-readme.md')],
        scanExtras: ['README.md'],
        readmeProfile: profile(),
      }),
    )
    const targets = found.map((v) => v.target)
    // Required area absent entirely.
    expect(targets).toContain('README.md::readme:navigation')
    // Same area opened twice in one file.
    expect(targets).toContain('README.md::readme:product')
    // Marker the contract never declared.
    expect(targets).toContain('README.md::readme:bogus')
    // Optional area present but not filled in.
    expect(
      found.filter((v) => v.target === 'README.md::readme:ownership'),
    ).not.toHaveLength(0)
    // A second document claiming an area the README owns.
    expect(targets).toContain('docs/second-readme.md')
  })
})

describe('readme-commands', () => {
  const run = checks['readme-commands']
  const profile = profileOf()

  it('passes when every documented script exists (install is the exception)', () => {
    expect(
      run(fixtureCtx('readme-commands/good', { readmeProfile: profile })),
    ).toEqual([])
  })

  it('bites on a command that is not a script', () => {
    const found = run(
      fixtureCtx('readme-commands/bad', { readmeProfile: profile }),
    )
    expect(found.map((v) => v.target).toSorted()).toEqual([
      'README.md -> pnpm setup:everything',
      'README.md -> pnpm verifyy',
    ])
  })
})

describe('canonical-ownership', () => {
  const run = checks['canonical-ownership']
  const owner = {
    area: 'command reference',
    path: 'docs/commands.md',
    type: 'reference' as const,
    normative: false,
  }
  const profile = (owners: ReadmeProfile['owners']): ReadmeProfile =>
    profileOf({ owners })

  it('passes when each area has exactly one correctly typed owner', () => {
    expect(
      run(
        fixtureCtx('.', {
          manifest: [doc('docs/commands.md')],
          readmeProfile: profile([owner]),
        }),
      ),
    ).toEqual([])
  })

  it('bites on a duplicate manifest entry for one owner', () => {
    const found = run(
      fixtureCtx('.', {
        manifest: [doc('docs/commands.md'), doc('docs/commands.md')],
        readmeProfile: profile([owner]),
      }),
    )
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('declared 2 times')
  })

  it('bites when two areas name the same document', () => {
    const found = run(
      fixtureCtx('.', {
        manifest: [doc('docs/commands.md')],
        readmeProfile: profile([
          owner,
          { ...owner, area: 'configuration reference' },
        ]),
      }),
    )
    expect(found.map((v) => v.message)).toContain(
      'one document is declared owner of 2 areas: command reference, configuration reference',
    )
  })

  it('bites when the owner is missing or registered with the wrong type', () => {
    expect(
      run(fixtureCtx('.', { manifest: [], readmeProfile: profile([owner]) }))[0]
        .message,
    ).toBe('no manifest entry owns "command reference"')

    const wrongType = run(
      fixtureCtx('.', {
        manifest: [doc('docs/commands.md', true)],
        readmeProfile: profile([owner]),
      }),
    )
    expect(wrongType[0].message).toContain('reference-contract (normative)')
  })
})

describe('real docs tree', () => {
  it('evaluates clean — zero un-exempted violations', () => {
    const report = evaluate(realContext, exemptions)
    // Surface any surprise directly in the failure message.
    expect(report.violations).toEqual([])
    expect(report.ok).toBe(true)
  })
})
