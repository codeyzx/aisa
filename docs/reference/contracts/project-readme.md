# Project README contract

- Type: Normative reference contract
- Owns: what the root `README.md` of an Aixel internal web application must
  answer, which areas it owns, which areas it must delegate, and the markers the
  checker reads
- Source of truth: this file for the rules, `scripts/docs/checks.ts` +
  `scripts/docs/context.ts` for the machine-checked subset, and `package.json`
  for the scripts a README is allowed to name
- Verified by: `pnpm docs:check` (`readme-contract`, `readme-commands`,
  `canonical-ownership`, `local-links`, `banned-brittle-content`), with the
  fixtures in `scripts/docs/__fixtures__/` proving each rule bites
- Read when: writing or reviewing a root README, forking this starter into a real
  application, or changing which document owns a README-adjacent topic
- Does not define: the procedure for doing any of it — that is
  [maintain a project README](../../how-to/maintain-project-readme.md) — nor the
  starter's own product facts, which
  [product context](../../explanation/product-context.md) owns

The root README owns exactly two durable concerns: **a compact product
orientation** and **the shortest verified path to a first successful local run**.
A small navigation map to the canonical docs is the third thing it is allowed to
carry. Everything deeper belongs to the document that owns it.

"Quickstart-only" means the README is not an encyclopedia. It does not mean
product context is excluded. The shape is **product orientation + quickstart +
navigation**.

## Scope

This contract applies to the Aixel Next.js starters (Firestore and its PostgreSQL
fork) and to internal web applications derived from either. It does not attempt to
cover CLIs, libraries, mobile apps, services, or data pipelines.

A **derived** project inherits this contract unchanged. It MUST replace the
starter's product orientation with its own problem, users, outcomes, workflows,
scope and non-scope; retaining the starter's product copy as if the starter were
the shipped product is a violation.

## Questions the README MUST answer

Product, in compact prose or bullets:

- What recurring problem does this project solve?
- Who is the intended user or adopter?
- What outcome does it enable?
- What are the core workflows?
- What is inside the current product boundary?
- What is deliberately outside it?

Developer:

- What exact prerequisites are supported?
- What is the shortest clean-checkout setup path?
- What observable result proves setup succeeded?
- How does a developer obtain the local-only sign-in credential safely?
- What is the one canonical command for verifying a change?
- Where do architecture, contracts, adaptation, operations and deeper procedures
  live?

## Required areas and their markers

Heading wording is free — including its language — so the checker keys on stable
HTML-comment markers instead of prose. Each marker sits on its own line
immediately above the section it opens:

```md
<!-- readme:product -->

## Product
```

The required areas, each of which MUST appear exactly once:

- `readme:product` — product orientation: problem, adopter, outcome, workflows,
  boundary, non-scope.
- `readme:quickstart` — prerequisites, the shortest command path, and the
  observable success state.
- `readme:verification` — the one canonical verification command and what it does
  and does not prove.
- `readme:navigation` — the role-oriented map into the canonical docs.
- `readme:deployment` — one honest sentence about the deployment target plus a
  link to its runbook.

`readme:ownership` is **optional**. Include it only when the product owner,
technical owner, or support destination is real and monitored. If present, its
section MUST NOT contain a placeholder (`TODO`, `TBD`, `FIXME`, an
`<angle-bracket>` slot, or an `example.com` address). Absence stays valid — an
optional section never becomes mandatory because a fixture exists for it.

No other tracked document may carry these markers. A second file that restates
the README is a competing owner, not a template.

## Ordering

- Product orientation comes before stack and implementation detail.
- The shortest supported happy path comes before any alternate or advanced setup.
- Navigation comes after the reader can already run the thing.

## MUST

- Use only package scripts and paths that exist at the same commit. Every
  `pnpm <script>` named in the README must be a script in `package.json`; the one
  exception is the package-manager invocation `pnpm install`.
- Describe an observable success state, not only a list of commands.
- Link to exactly one canonical owner per deeper topic.
- Distinguish required foundation behaviour, optional capabilities, examples, and
  the domain choices a derived project owns.
- Describe current shipped behaviour, not roadmap intent.
- Keep the local sign-in credential to a single source — the `.env` the setup
  script generates. Passwords are not repeated across documents.
- Stay free of real secrets, production data and credentials.

## MUST NOT

- Become the full developer handbook.
- Restate a normative contract from `docs/reference/contracts/**`.
- Restate a generated reference (commands, configuration, capabilities, project
  layout) or hand-maintain a table of every variable, script, route or dependency.
- Claim support for an operating system, deployment target or provider the
  repository does not exercise.
- Ask a local developer for a fake production provider key.
- Present a destructive reset or seed as the default setup path.
- Present the `features/_template/` scaffold as a derived application's business
  domain.
- Carry a project-status vocabulary, readiness label, or a badge that
  communicates no actionable trust signal.
- Carry a source-line reference, a historical test count, an occurrence count, or
  a copy-maintained generated fact.
- Carry a long troubleshooting section; troubleshooting belongs to the owning
  how-to unless a problem blocks the shortest path for most developers.

## SHOULD

- Point directly at the first safe change.
- Say when a capability is an optional example rather than a product promise.
- Prefer adopter outcomes over framework feature names.
- Include a small ownership map only where it helps the reader pick the next
  document.

## Workflow evidence

Every core workflow the README names must be one of:

- covered by an automated acceptance test whose stable path or name the
  verification owner links, or
- explicitly identified as a documentation or adaptation workflow with a driven
  procedure behind it, or
- removed from the summary until it has observable evidence.

The full workflow records — actor, surface, capability, covering test — belong to
[product context](../../explanation/product-context.md). The README carries only
the synchronized summary.

## Canonical owners

One area, one document. The checker (`canonical-ownership`) proves each of these
appears exactly once in the docs manifest with the declared type, so a second
claimant cannot land quietly:

- Root orientation — `README.md`
- This contract — `docs/reference/contracts/project-readme.md`
- Maintenance procedure — `docs/how-to/maintain-project-readme.md`
- Product facts — `docs/explanation/product-context.md`
- Command reference — `docs/reference/commands.md`
- Configuration reference — `docs/reference/configuration.md`
- Capability reference — `docs/reference/capabilities.md`
- Project layout reference — `docs/reference/project-layout.md`

## Language

- Product orientation and onboarding prose are Bahasa Indonesia.
- Commands, identifiers, paths, protocol names and established technical terms
  stay exact and in English.
- No full bilingual duplicate — two prose copies drift.
- Direct, professional wording; no superlative that cannot be proven.

## What a persistence fork inherits

A fork onto another database inherits this contract, the checker, the
product-orientation model, the canonical script names, and the Bahasa Indonesia
onboarding rule. It replaces persistence-owned facts — setup, migration, backup,
query, index, rules, operations — and regenerates its own reference docs. It does
not write a second, competing README standard.
