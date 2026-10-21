# Remove a capability you do not need

This starter is built to be **deleted from**, not worked around. Every optional
capability is a directory you can `trash`, plus a small, named set of one-line
references. If removing something means editing shared code in three places, that is
a design bug in the capability — not a reason to keep it.

The rule that makes this work: dependencies point **example → feature → lib**, never
back. So the demos come out in one shot, and a capability comes out with its own
directory.

## The shape of every removal

1. **Read the capability's own removal checklist** in its contract (linked below).
   Each one names the specific references only that capability has — a provider, a
   nav entry, a dependency to `pnpm remove`.
2. **`trash` its directory.** Its config schema lives next to its code, so it goes
   with it.
3. **Remove its line from `lib/env/registry.ts`** if it had one. That registry is what
   `instrumentation-node.ts` validates at boot — leaving the line behind means the app
   demands a secret for code that no longer exists.
4. **Remove its line from `lib/auth/capability-availability.ts`** if it had a
   deployment toggle (today only AI does).
5. **Remove its example route and its navigation entry**, unless you are deleting the
   whole demo set anyway (below).
6. **Grep for the import path** and fix each caller the checklist told you to expect.
7. **Prove it**: `pnpm verify` green — it runs `pnpm structure:check`, which is what
   fails on a nav entry still pointing at a route you deleted — then boot the app and
   click through: no route that 500s.

A dead sidebar URL is caught by `structure:check`'s `public-path-match`: it reads every
literal `href` in `app/navigation.ts` and `components/shell/nav-config.ts` and demands a
matching `page.tsx`. Know its edges — it does **not** check the reverse (a surviving
route with no nav entry is not a violation), and it only sees hrefs written as string
literals, not ones built at run time.

## Delete the whole demo set first

Before removing individual capabilities, remove the examples — most of what looks like
capability code is demo code.

```bash
trash "app/(app)/(examples)"
```

That takes out the entire route group: `ai`, `assets`, `export`, `realtime`, `state`,
`storage`. Then remove the whole `Contoh` section from `app/navigation.ts` — it owns
the routes, labels, icons, and capabilities for those links. `components/shell/` is
reusable and needs no change.

### Prove the seam, in a throwaway worktree

The point of the proof is that shared infrastructure does not import the examples. Run
it somewhere disposable so an in-progress migration is never at risk:

```bash
git worktree add ../aisa-examples-proof HEAD
cd ../aisa-examples-proof
ln -s ../aisa/node_modules node_modules   # see below
trash "app/(app)/(examples)"
pnpm typecheck && pnpm build:ci   # must still be green
```

**A fresh worktree has no `node_modules`,** and `pnpm typecheck` cannot run without
one. Symlinking the main checkout's is enough and takes no time; a real
`pnpm install` there works too and costs minutes. If pnpm answers
`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`, it is trying to reinstall over the
symlink — add `--config.verify-deps-before-run=false` to the command (the
environment-variable form of that setting does not apply here).

**Run `pnpm structure:check` there too**, and do not stop at `typecheck && build:ci`:
it is the gate that catches a nav entry pointing at a route you deleted
(`public-path-match`) and a capability left declared and enforced nowhere
(`capability-completeness`). Neither is a type error, so both survive a green build.

The proof deliberately removes **only** the route group, so it does not touch
navigation — which is why it runs `typecheck && build:ci` rather than `pnpm verify`. With
the nav entries still declared, `public-path-match` would report every href it just
orphaned; those hrefs are removed in the real removal, not in this proof. Remove the
worktree once the proof is recorded, and never use `git checkout` to overwrite migration
work in progress.

If this build ever fails, a change has made `lib/` or `features/` import from the
example layer. Fix the direction; do not fix the build.

## Where each removal checklist lives

- **AI / inference** — [`ai` contract](../reference/contracts/ai.md)
- **Storage / uploads** — [`storage` contract](../reference/contracts/storage.md)
- **Export (PDF, Excel, CSV)** — [`export` contract](../reference/contracts/export.md)
- **Realtime listener** — [`realtime` contract](../reference/contracts/realtime.md)
- **Client state layers (nuqs, zustand)** — [`ui` contract](../reference/contracts/ui.md)
- **Rate limiting, the API envelope, and the security-header baseline** —
  [`http-api` contract](../reference/contracts/http-api.md)
- **An entity and its collection** — [`data` contract](../reference/contracts/data.md)

Two capabilities are shaped differently and are described here because no checklist
owns them:

- **Impersonation** — [`impersonation` contract](../reference/contracts/impersonation.md)
  has no removal checklist, and that is the honest answer rather than an omission: it
  leaves no server record to tear up, so removal is code-only. Unlike error monitoring
  below, it owns a capability STRING, so it also comes out of the three places a
  capability lives — see
  [extending roles / capabilities](../reference/contracts/auth.md#how-to-extend-roles--capabilities).
  Read that contract before touching the feature at all; it is a sanctioned auth bypass
  and the highest-risk surface in the repo.
- **Error monitoring** — `trash lib/observability/ instrumentation-client.ts`, drop
  both the call to it in `validateClientEnv()` **and its `import`** at the top of
  `lib/env/client.ts` (dropping only the call leaves an import of a directory you
  just deleted, and typecheck fails), and remove the
  two `Sentry` references in `instrumentation.ts` and `instrumentation-node.ts`. It is
  already optional at run time: with no DSN configured the SDK is never initialized in
  either runtime, so deleting it is about shipping less code, not about turning it off.

## What a capability costs you to keep

A capability that still ships **must** have its configuration to boot. "We never
upload" does not drop the requirement — the gate is boot, not first use. That is
deliberate: it is the reason a misconfigured deployment fails at startup, named,
instead of failing inside a server action the first time a user tries something. If
you do not want the requirement, delete the capability.
