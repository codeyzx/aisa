# What this starter is for

This repository is the standard starting point for **Aixel internal web applications**:
Next.js App Router with React Server Components on top of Firestore, shipped as a container.
This fork is the AISA manager dashboard: it reads Firestore server-side, sends every write
to the Python `aisa-api`, and signs managers in with Firebase email/password accounts.

It exists to answer one question once. Every internal app needs the same first two weeks —
sign-in that is actually server-authoritative, a role model, a typed data path, deploy — and answering that fresh each time produces a set of
apps that are subtly different in exactly the places where being different is expensive.
Here the answers are made once, written down with their reasoning, and forked.

## A verified fork base, not a library

You do not depend on this repository; you **copy** it and it becomes yours. There is no
package to upgrade and no upstream that can break you, which is the trade deliberately
made: you give up receiving fixes automatically, and you get a codebase with no version
constraint on how far you diverge.

What the fork inherits that a blank project does not is **evidence**. The seams are driven,
not just compiled: the paths that fail only in production — a missing composite index, an
environment variable that is only read on first use, a build that inlines public config —
have guards here because they have gone wrong before. That is the meaning of "verified" in
"verified fork base": claims in this repo are supposed to be ones someone drove, and where
they were not driven, the docs say so instead of implying otherwise.

The corollary is that **adapting is expected, not a violation**. Every convention here is
opinionated so you can move on day one, and every one states its reasoning. Once you
understand a trade-off, changing it is the intended use. The one thing to avoid is changing
a boundary without reading the contract that owns it — the boundaries are where the
opinions are load-bearing rather than merely convenient.

## Who it is for

- **A developer starting an internal Aixel app**, who wants to be writing domain code the
  same day. Start with [local development](../tutorials/local-development.md), then
  [adapt the starter](../how-to/adapt-starter.md).
- **A developer extending an app already forked from it**, who needs to know which rule
  owns the thing they are about to touch. The contracts in
  [`../reference/contracts/`](../reference/contracts/) are the authority; this explanation
  section is the reasoning behind them.
- **A coding agent working in either**, which is why the rules are written as contracts
  with named owners rather than as folklore spread through code comments. An agent that
  reads one file and infers a convention from it will infer wrong; the contract exists so
  it does not have to guess.

## The shape of the app it assumes

These assumptions are baked in deeply enough that fighting them costs more than forking
something else:

- **Internal and authenticated.** There is no public marketing surface and no SEO story —
  the app is walled off from indexing on three legs at once, on purpose.
- **Small, known user population**, not self-serve signup. Authorization is
  capability-based over a small role set. This fork has a single shared sign-in and no
  per-person accounts.
- **Indonesian by default.** UI copy is Bahasa Indonesia, and locale, timezone and currency
  are pinned in one file — a non-Indonesian fork changes them there, but the default is a
  choice about who this is for, not an oversight.
- **Shipped as a container image**, not tied to one platform's build system. This fork
  runs that image on Cloud Run — see [the deployment model](deployment-model.md).
- **Linux.** That is what CI runs and what the shipped image is, so it is the only platform
  this starter has evidence about. Other platforms are expected to work and are not
  exercised; the honest scope statement is the point.

## What it deliberately is not

- **Not a specification to conform to.** It is a starting point. The four-step adaptation
  path is the common route, not a cage.
- **Not a framework or a design system.** Nothing here wraps Next.js, Firestore or the UI
  kit in a house abstraction you would have to learn on top of the real thing. Where a seam
  exists, it exists to be deleted or swapped, not to hide what is underneath — the typed
  collection accessor is the clearest example: it adds validation and takes nothing away.
- **Not multi-tenant, and not built for anonymous public traffic.** Neither assumption is
  in the data model or the auth chain, and adding either is a real project, not a
  configuration.
- **Not a batteries-maximal kit.** Capabilities you do not use are meant to come out, not
  to sit there costing you review attention forever — see
  [the capability model](capability-model.md).

## Where to go next

- [Architecture](architecture.md) — how the seams connect and why.
- [Request, auth, data flow](request-auth-data-flow.md) — the path a request actually takes.
- [The capability model](capability-model.md) — why deletion is the design constraint.
- [Adapt the starter](../how-to/adapt-starter.md) — the procedure for making it yours.
