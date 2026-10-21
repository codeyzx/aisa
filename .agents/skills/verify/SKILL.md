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
2. Build: `pnpm build:ci` — a secret-less build that still runs the public-env validation. It
   supplies the shared dummy `NEXT_PUBLIC_FIREBASE_*` values from
   `scripts/public-env-fixture.ts`; there is no bypass flag.
3. Prove the env fail-fast is intact. It lives at server BOOT (`instrumentation-node.ts` over
   `lib/env/registry.ts`), not in the build. Start the built standalone server with an empty
   environment and confirm it logs `[boot] environment is invalid, refusing to serve`, names
   every missing group (Firebase project, aisa-api), and exits 1:
   `env -i PATH="$PATH" HOME="$HOME" node .next/standalone/server.js; echo "exit=$?"`
   Next prints `Ready` before the check runs — the exit is the proof, not the banner.
4. **Drive it.** Start the emulator and app on your port band, sign in, and exercise the change
   in a browser. Report the behaviour you observed — not the gate you passed.
5. If the change added or altered a `.where(A,'==') + .orderBy(B)` query, exercise it against the
   emulator, then run `pnpm indexes:check` — nothing else catches a missing composite index.

## Common mistakes

- **Reporting a green gate as proof.** It is the one check that provably misses this repo's bug
  class. Name a driven observation.
- **Reading a passing `pnpm build` as the fail-fast proof.** The build no longer validates any
  required var, so it passes with no `.env` at all. Only a real start (step 3) proves a missing
  var bites. Check no `.env` sits inside `.next/standalone/` first, or the run is vacuous.
- **Bare `pnpm format`.** It rewrites the whole tree, including others' uncommitted work. Scope it:
  `pnpm exec oxfmt <your paths>`.
- **`pnpm indexes:check` on an un-driven emulator.** It only sees queries that actually ran; a
  shape no drive exercised is invisible. Widen the driving, not the script.
