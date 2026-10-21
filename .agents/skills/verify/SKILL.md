---
name: verify
description: Use before committing or merging a change in this repo. Runs the full verify chain, the env fail-fast, and the composite-index check, then drives the change in a browser — because green is not the gate here.
---

# Verify a change

Green is necessary, not sufficient: this repo's worst bug class passes typecheck, lint AND
build. A change is verified when it is **green AND driven**.

## Instructions

1. Run the chain, stop at the first red step:
   `pnpm typecheck && pnpm templates:check && pnpm lint && pnpm lint:rules && pnpm format:check && pnpm test`
2. Build: `pnpm build:ci` — a secret-less build that still VALIDATES. It supplies the shared
   dummy public values from `scripts/public-env-fixture.ts`; there is no bypass flag, so a
   renamed or forgotten `NEXT_PUBLIC_*` still fails here.
3. Prove the env fail-fast is intact — this needs plain `pnpm build`, since `build:ci` fills
   the public gap by design. Move `.env` aside so `next build` cannot read it from disk, then
   confirm the build FAILS with `Invalid client Firebase environment`:
   `mv .env .env.bak && env -i PATH="$PATH" HOME="$HOME" pnpm build; mv .env.bak .env`
4. **Drive it.** Start the emulator and app on your port band, sign in, and exercise the change
   in a browser. Report the behaviour you observed — not the gate you passed.
5. If the change added or altered a `.where(A,'==') + .orderBy(B)` query, exercise it against the
   emulator, then run `pnpm indexes:check` — nothing else catches a missing composite index.

## Common mistakes

- **Reporting a green gate as proof.** It is the one check that provably misses this repo's bug
  class. Name a driven observation.
- **`env -i pnpm build` passing.** It is vacuous while a `.env` sits on disk — `next build` reads
  it. Move `.env` aside first (step 3).
- **Reading a green `pnpm build:ci` as the fail-fast proof.** It deliberately supplies dummy
  public values, so it proves the schema is satisfiable, not that a missing var bites. Only
  step 3 proves that. Server config is not covered by either — it is validated at BOOT
  (`lib/env/registry.ts`), so drive a real start to see it.
- **Bare `pnpm format`.** It rewrites the whole tree, including others' uncommitted work. Scope it:
  `pnpm exec oxfmt <your paths>`.
- **`pnpm indexes:check` on an un-driven emulator.** It only sees queries that actually ran; a
  shape no drive exercised is invisible. Widen the driving, not the script.
