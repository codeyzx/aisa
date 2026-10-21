---
name: adapt-starter
description: Use when turning this starter into a real project — renaming it, deleting the capabilities and examples you do not need, and configuring the ones you keep. Deletion is the primary operation here, and this names what each delete actually costs.
---

# Make the starter yours

This starter is **tree-shakeable by design**: you delete what you do not use rather than
working around it. That makes deletion the main adaptation move, and the main risk — a
half-deleted capability leaves imports that compile and configuration that lies.

Full procedure and the rename checklist live in `docs/how-to/adapt-starter.md`. This skill is
the decision order and the traps.

## Do it in this order

Order matters: renaming after deleting means renaming less, and configuring before deleting
means configuring things you are about to remove.

1. **Rename** — project name, package name, the demo Firebase project id. Grep for the
   placeholder rather than trusting a list.
2. **Delete** the capabilities you do not need (below).
3. **Configure** what remains: `.env` from `.env.example`, then the capability configs.
4. **Verify** — `pnpm verify`, then drive it. See `docs/how-to/verify-change.md`.

## Deleting a capability

`docs/how-to/remove-capability.md` owns the general workflow and links each removal
checklist that still exists (an entity's is in `docs/reference/contracts/data.md`).

**The trap: a capability is not deleted when its code is gone.** It is deleted when its
config, its env vars, its nav entries, its RBAC capability string, and its docs entry are
gone too. `pnpm structure:check` catches part of this — `capability-completeness` fails if a
declared capability is unused or an used one is undeclared — but it cannot catch an orphaned
env var or a dead doc. Grep for the capability's name across the repo when you think you are
finished; the hits are your real checklist.

## What NOT to delete

- **The env fail-fast.** There is no bypass flag by design. If a variable is in your way,
  remove it from the registry — never weaken the validator.
- **`scripts/_safety.ts`.** Its gates are machine-checked by `structure:check`'s `cli-safety`,
  and they are what keeps a destructive script from reaching a real database.
- **The structure and docs checks**, unless you are deliberately giving up the guarantee. If
  you delete a rule, delete its claim from the docs in the same commit.

## Traps that cost the most time

- **Deleting a feature but leaving its composite index** in `firestore.indexes.json` — the
  index is harmless but the file now lies about what the app queries.
- **Keeping `.env.example` in sync.** If you remove a variable from the registry, remove it
  here too, or the next person configures something that no longer exists.
- **The README.** It is the first thing a new person reads and the first thing to go stale.
  `docs/how-to/maintain-project-readme.md` owns keeping it true.

## Done means

`pnpm verify` is green, `pnpm structure:check` reports no orphaned capability, grepping the
name of anything you deleted returns nothing, and the app still signs in and does its one
real job in a browser.
