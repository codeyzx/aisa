<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- Everything below is this repo's own guide. Do not write above this line: the
     block above is injected and the next injection overwrites it silently. -->

# Working in this repo

An **Aixel internal-app starter**, and a verified base to fork from — beginner-friendly, not
a spec. `README.md` is the quickstart; `docs/README.md` is the map. This file is the
always-load spine: engineering defaults, where ownership lives, and how to verify.
`CLAUDE.md` is a symlink to this file — one file, two names, nothing to "sync".

## Engineering defaults

- **Minimum first.** Ship the smallest change that meets the requirement — no speculative
  abstraction, no dependency the framework or stdlib already covers. This starter is
  tree-shakeable: delete what you don't use instead of working around it.
- **Don't reinvent what the code already models.** Before hand-rolling a set, a lookup, or a
  special-case branch, find what already owns that concept — a Zod schema, a repo, an env
  value — and read from it. When an input can't be honored, reject it at the boundary; never
  silently drop it (a silent drop makes the UI lie about what was saved).
- **Prefer extract over duplicate**, in code and docs — one reusable unit, not two copies to
  keep in sync. This holds for TYPES too: name an `interface`/`type` rather than respelling
  the same field set in two signatures, and derive the variants (`Pick`, `Omit`, `extends`)
  instead of writing them out. Two copies of a shape are two places for it to drift, and a
  drifted shape typechecks on both sides right up until the data crosses between them.
- **Small and reversible: just do it. Big or irreversible: confirm first.** Deploys, deletes,
  data-model/schema changes, force-pushes and history rewrites need a deliberate yes. Delete
  with `trash`, never `rm`. Never open another repo's `.env` or secrets.
- **Never write a sentence the code does not support.** A comment or doc that overstates what
  the code does is this repo's most expensive recurring defect — it has shipped a header
  promising a path could not delete above a path that deleted, and a doc claiming a digest
  was enforced when a tag was accepted. If you cannot verify a claim, drop it.
- **Write the reason, never the project bookkeeping.** Comments and docs must not cite a phase
  number, a step number, a bare finding identifier, a sprint, or a ticket id. Those are only
  resolvable next to a handoff nobody reads later, they go stale the moment the plan moves, and
  to a reader — human or AI — arriving at the file cold they carry no information at all. Say
  what the code guarantees and what breaks without it: "an unreachable provider must not read
  as a bad credential" survives a reorganisation; a finding number does not. The
  `unowned-decision-id` rule in `pnpm docs:check` enforces the identifier half of this.
  Handoffs under `docs/handoffs/**` are the exception, since tracking history is their job.
- **Keep new and continuation handoffs at 400 lines or fewer.** Do not refactor a historical
  handoff merely to meet this cap; write a concise continuation that links to it and owns only
  the new decision, remaining work, and checkable finish.

## Ownership: read the contract for the layer you're about to touch

Don't infer a rule from whatever code you read first — each seam has a written contract and
the contract wins. They live in **`docs/reference/contracts/`**, one file per seam, each
carrying who owns it, what proves it, and what it deliberately does not define.

Start with **`http-api.md`** (read its boundary section — usually you should _not_ be adding
a route) and **`data.md`** (the `schema → repo → action` path plus the composite-index rule
nothing else enforces). **`aisa-firestore.md`** is the AISA data contract: the Python
Pydantic models are its source of truth, and the dashboard only reads.

`docs/README.md` is the index and states which doc owns what. Procedures live in
`docs/how-to/`, rationale in `docs/explanation/`, generated facts in `docs/reference/`.

## Verify: green is not the gate — driven is

Static typecheck/lint/build green is necessary, **never sufficient**. That is not a slogan
here: sign-in was once broken in the shipped container while typecheck, lint, build, the unit
suite, the emulator integration suite and the image smoke were all green — because the app
only failed once a real browser talked to the real artifact.

Run `pnpm verify` (static + unit + integration + build), then **drive it** — emulator plus
browser — and report the behaviour you observed, not the gate that passed. The **`verify`**
skill is this doctrine as a runnable checklist; `docs/how-to/verify-change.md` is the
procedure.

Gotchas nothing else catches:

- The **env fail-fast** has no bypass flag, and it lives at server **boot**, not in the
  build: `pnpm build` succeeds with no `.env` because no public var is required. Prove it by
  starting the built server with the required env missing
  (`env -i PATH="$PATH" HOME="$HOME" node .next/standalone/server.js`) and watching it log
  `[boot] environment is invalid, refusing to serve` and exit 1 — not by trusting a green
  build.
- A `.where(A,'==') + .orderBy(B)` query needs a **composite index** the emulator will not
  flag. Drive the query, then run `pnpm indexes:check`.
- **`pnpm test:e2e:ci` builds and drives the real image.** `next start` does not serve the
  shipped artifact and Next itself says so. It is `pnpm test:e2e:fast` (`scripts/e2e-fast.ts`):
  one image build, then `--shards N` (1–9, default 4) app containers on ports 3201 upward, each
  with its own seeded Firestore emulator (8181 upward), all sharing ONE Auth emulator on
  `127.0.0.1:9099` — that address is baked into the E2E image's browser bundle, so a spec that
  changes a seeded account leaks into every shard. It refuses to start while anything holds
  9099 or a shard's Firestore port (quit `pnpm dev` first). Each shard is a container, a JVM
  and a browser; with anything else running use `--shards 2`. Other arguments (spec files,
  `--grep`) go to every shard's `playwright test`; logs land in `test-results/e2e-fast/`.
- **Local `pnpm install` is not evidence about CI**, and the interpreter running your
  `pnpm` scripts may not be the pinned one — `pnpm node:check` will say so.

## Skills — runnable procedures, one body each

`.agents/skills/*` holds the body; `.claude/skills/*` symlinks to it. Reach for
**`verify`** before committing, **`commit`** when writing one, **`scaffold-feature`** to add
an entity, **`adapt-starter`** to make this yours, **`migrate-database`** to replace the
persistence layer, **`task-envelope`** to write work someone else can execute, and
**`thin-pr`** when a change is growing.
