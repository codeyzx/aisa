# structure:check fixtures

Purpose-built `bad/` and `good/` trees, one per check. Each check's test builds a
mini `ts.Program` rooted at a fixture dir and asserts the check produces ≥1
violation on `bad/` and 0 on `good/`.

These files are DELIBERATELY off-pattern (a shared file importing a feature, a
`'use client'` reaching `server-only`, a nav href with no page, …). They are NOT
real repo code:

- `program.ts` excludes `scripts/structure/__fixtures__/**` from the repo-tree
  run, so they never count as real violations.
- They are still syntactically valid TS and stay green under `pnpm typecheck`.
- None is named `*.test.ts`, so vitest never collects them.

Do not "fix" a fixture to match convention — the off-pattern shape is the point.
