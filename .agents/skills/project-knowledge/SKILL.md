---
name: project-knowledge
description: Use when this project's docs need to stay true or absorb something durable — claim-check the explanation, how-to and contract docs against the tree, route a new decision/convention/gotcha to the layer that owns it, or consolidate drift and duplication. NOT for one code edit or writing a contract's body from scratch.
---

# Keep this project's knowledge honest

The docs here have no compiler — `tsc` cannot fail a stale paragraph — so truth is kept by
hand. This skill has three jobs on the project's durable docs: **claim-check** (keep them
true), **capture** (route a new fact to its layer), **tidy** (consolidate drift). Reach for
the one the moment names.

## claim-check — keep the docs true against the tree

1. For `docs/explanation/*`, `docs/how-to/*` and `docs/reference/contracts/*`, `rg` each file
   path and code symbol they name and confirm it resolves in the tree. A claim that no longer
   resolves is fixed or deleted — not softened, not left to sit.
2. Don't document a capability that isn't on disk. A planned-but-unlanded seam does not go in
   `docs/explanation/architecture.md` yet — document what is on disk at merge time.
3. Don't restate a rule. MUST / MUST-NOT rules live in `docs/reference/contracts/<seam>.md`;
   explanation says why a seam exists and links to the contract that owns the rule, and a
   how-to links rather than restates. Two spellings of one rule is drift waiting to happen.
4. `pnpm docs:check` is the machine half — it enforces index membership, manifest membership,
   contract metadata, link resolution and generated-doc drift. Run it; it is not a substitute
   for the claim-check above, which is the half no script can do.

## capture — route a durable fact to its layer

When work produces something worth keeping (a decision, a convention, a gotcha), put it in the
**one** layer that owns it, same batch — correct or condense what's there, never add a copy:

- a per-seam rule → the owning `docs/reference/contracts/<seam>.md`;
- a procedure → the owning `docs/how-to/*.md`;
- why a choice was made → the rationale section of the doc it belongs to;
- a cross-cutting, always-apply rule → an `AGENTS.md` line that **names the file it owns**.

Convert relative dates to absolute. A NEW doc is added to `scripts/docs/manifest.ts` and linked
from `docs/README.md` in the same batch — `docs:check` fails on either omission.

## tidy — consolidate drift and duplication

When the docs have accumulated stale or duplicated material: inventory what's in scope, then
**delete / merge / rehome / fix** — default to consolidation, preserve only what earns its
place. A near-duplicate becomes one canonical line; a claim contradicted by the code is deleted
now, not marked "stale".

## Common mistakes

- **Editing inside the `<!-- BEGIN:nextjs-agent-rules -->` … `<!-- END: -->` block** in
  `AGENTS.md`. It is injected; the next injection silently overwrites anything there. Write
  below the END marker.
- **"Syncing" `CLAUDE.md` and `AGENTS.md`.** `CLAUDE.md` is a symlink to `AGENTS.md` — one
  file, two names, nothing to sync.
- **Trusting careful prose over `rg`.** The prose is what drifts; the claim-check is what
  catches it.

## Done means

The fact lives in exactly one layer, the index resolves, no duplicate is left behind, and every
path/symbol a doc names still resolves in the tree. Report the paths changed — not "docs updated".
