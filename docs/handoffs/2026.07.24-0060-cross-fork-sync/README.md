# Cross-Fork Sync Handoff

## Handoff Metadata

- Sequence: `0060`
- Repository: `/home/luthfi/code/work-noeffort/projects/aixel-std/boilerplate-nextjs-firestore`
- Created: `2026.07.24`
- Amended: `2026.07.25` — re-verified against the fork after it completed its Better Auth migration and removed Firebase from its tree entirely. Four briefs corrected, one claim of mine retracted, two topics added. See "What The Fork Closed" below; per-file corrections are marked in the files themselves.
- Parent: `docs/handoffs/2026.07.22-0050-reusability-hardening/README.md`
- Status: `OPEN — analysis complete and static-only; no listed change is landed and nothing here is driven evidence`
- Next action: Start with `fs-export-search-widening.md`. It is the only confirmed live defect in THIS repository, it is self-contained, and its fix is bounded. Everything else is either a companion brief for the PostgreSQL lead or a second Firestore slice that can wait.

## Purpose

The Firestore starter and the PostgreSQL fork have both advanced since they split, and
each has grown something the other lacks. This baton records what a topic-by-topic audit
of both trees actually found, so the two repositories can converge on purpose rather than
by whoever notices a difference first.

It splits into three kinds of item, and the distinction matters more than the list:

- Work **this repository** owns, because the audit confirmed either a defect here or a claim
  we make without evidence.
- Work the **PostgreSQL lead** owns, delivered as a companion brief per topic. This
  handoff does not edit that workspace.
- Verdicts that a topic is **not a gap**, recorded so nobody spends a slice rediscovering it.

## State

- The Firestore working tree was clean at `main` = `22aa8a4e9f8fea8769c4ff680bd04b51d612a5e7` when this handoff was written, and at `dc91a6f` when it was amended.
- The PostgreSQL fork was at `main` = `fb78ca9a2008d94ccf2401c924405fb26fe2918a` when this was written, and at `b5df7714a6ec081dd6cc24ca608ed07ba9122ad6` when it was amended — 20 commits later.
- The two histories share 291 commits. The most recent shared commit is
  `b74fb503a52bc9a1e3e5ce47b7f3bf9c3a56fb63` (`2026.07.22`), which is also what the
  `postgresql-fork-base-v1` tag peels to. Since that point Firestore added 99 commits and
  PostgreSQL added 129.
- **The fork's Better Auth migration is COMPLETE and Firebase is gone from its tree** — no code, no dependency, no environment variable, no emulator. Its own baton records `pnpm test:e2e:ci` at 14/14 against the shipped image. That is why several briefs here needed correcting: they were written against a tree mid-migration.
- **Every finding in this handoff is a static read of both trees.** No build, test,
  emulator, container, or browser command was run to produce any of it. Nothing here is
  driven evidence, and no file below may be cited as proof that a defect exists in
  running software until someone drives it.
- Some hardening has already crossed by hand in both directions — the runtime image no
  longer ships npm, the same three high advisories were cleared, the e2e hydration floor
  and the root-level JavaScript requirement landed on both sides. The traffic is real;
  this handoff only makes it deliberate.

## User Outcome

A person forking either starter should get the same guarantees at the same boundaries.
Today they do not: which of the two repositories you fork decides whether your exports
honour the filter the reader chose, whether a refused realtime stream ever recovers,
whether an admin control is gated on the capability it actually exercises, and whether a
production deploy can be pointed at an unpinned image.

The outcome is not one codebase. The two persistence models are a deliberate fork and
must stay independently forkable. The outcome is that a difference between them is always
a _decision someone made_, never a fix one side happened to receive.

## Locked Decisions

- **Better Auth is out of scope.** The PostgreSQL fork moved sign-in, sessions, account
  administration and impersonation onto Better Auth. Adopting it here was considered and
  deliberately declined for this train. Do not reopen it as part of any topic below, and
  do not let a topic drag a piece of it in sideways.
- **Do not edit the PostgreSQL workspace from this lead.** This continues the parent
  handoff's rule. The five `pg-*.md` files here are briefs written FOR that repository's
  lead, delivered as intent and evidence. They are not a licence to open that tree, and a
  file path inside them is a destination for someone else's commit.
- Keep Firestore as this repository's persistence implementation. No topic here is an
  argument for abstracting over both databases; the parent handoff already refused that
  and nothing found in this audit changes it.
- **Port the boundary behaviour, not the file.** Several findings below are the same
  defect wearing two different database costumes. Copying the other repository's code
  verbatim would import prose its own code does not support — this repository's most
  expensive recurring defect. Every brief names what must NOT be copied.
- Record a "not a gap" verdict as a first-class result. `fs-keyset-cursor-verdict.md`
  exists because the cheapest possible outcome of an audit is knowing not to do the work.
- No topic here is finished by a green gate. Each file's finish is a driven observation,
  per this repository's verification doctrine.

## What The Fork Closed

Re-verified `2026.07.25` against its current code, not against commit subjects. Recorded here
because a brief that asks for work already done wastes the reader twice — once doing it, once
discovering it was there.

- **Untouched, still open:** the proxy matcher, the unchecked copy-then-delete, the presign
  public endpoint, the digest guard, the form bridge, and the whole template parity item — zero
  commits touched the template directory or its checker.
- **Partially closed:** admin capability gating (about half the surfaces are now correctly
  gated, including the one control this handoff can stop asking for) and the mid-stream CSV item
  (a cancel handler already existed and the first draft missed it).
- **Closed outright:** the instruction to rewrite the fork's stale Firebase comments. That sweep
  landed.
- **Landed in a different shape:** final-admin retention. It shipped as a database trigger with
  an advisory lock rather than the capability predicate this handoff predicted, and the reason
  is sound — an application guard cannot cover admin endpoints Better Auth mounts and the
  application does not own. It is stronger than what was asked for, and it is no longer a
  pending note.

One claim of mine was **wrong when written** and is corrected in place: `pg-local-ci.md` said
the fork had no caches. It has a package-manager cache and always did; what it lacks is any
`actions/cache` step.

## Checked And Rejected

Each was examined against both trees and is **not** a gap. Recorded so nobody spends a slice
rediscovering it:

- **Confirming a 401 before signing a tab out.** The fork needs this because its watcher probes
  a boundary and a probe is ambiguous — a session can be replaced rather than ended. Ours
  compares a token's own issue time against a monotonic marker, so there is no ambiguous state
  to resolve and the extra round trip would be pure latency. Our impersonation is a stateless
  cookie overlay that never touches the marker at all.
- **Mandatory password change.** Already enforced here at more layers than the fork has,
  including a `firestore.rules` predicate with no fork analogue: an account owing a change
  cannot read through the client SDK at all. Both bypasses the fork closed are structurally
  impossible here — there is no raw admin HTTP surface, and an admin can only ever mint a random
  password, never choose one.
- **Final-admin protection.** Ours closes the concurrent double-demote race with a real lease,
  and its predicate reads a capability rather than a role string, so it survives a role rename.
  The fork's move into the database was driven by a Better Auth surface we do not have. Firestore
  offers no trigger or constraint that could bind an out-of-band writer, and our lease already
  declares that residual in writing.
- **The error-taxonomy rename.** Ours is already named correctly for its producer, and the
  timeout-to-504 chain is already asserted.
- **The cli-safety spawned-command form.** A real structural blind spot — our check has no
  spawned-process form — but no script here destroys through a spawned process today, so there
  is nothing live to fix. Worth ~2h pre-emptively if someone wants it; the transferable lesson
  is to key on the destructive _flag_, not the program name, or the read-only sibling gets
  flagged too.

## Topic Index

Work this repository owns:

- [`fs-export-search-widening.md`](fs-export-search-widening.md) — **confirmed live defect.** The
  CSV and XLSX asset exports read `?status` and ignore `?q`, so an export of a searched
  list is the whole collection. Start here.
- [`fs-realtime-stream-recovery.md`](fs-realtime-stream-recovery.md) — **confirmed gap.** A
  terminal listener error leaves a dead entry in the stream map forever; while any reader
  stays mounted the board never recovers and cannot say so.
- [`fs-e2e-coverage-parity.md`](fs-e2e-coverage-parity.md) — **confirmed verification gap.** The
  admin directory, the impersonation round trip, the password gate and revocation are all built,
  unit-tested, and never once driven in a browser. The fork now drives all four.
- [`fs-env-failfast-proof.md`](fs-env-failfast-proof.md) — **confirmed verification gap.** The
  documented way to prove the env fail-fast does not prove it for the shipped artifact, because
  the build copies `.env` into the standalone output. The fail-fast itself is fine.
- [`fs-keyset-cursor-verdict.md`](fs-keyset-cursor-verdict.md) — **not a gap, do not port.**
  This repository is the origin of the cursor contract the fork's keyset module builds on.

Briefs for the PostgreSQL lead:

- [`pg-digest-guard.md`](pg-digest-guard.md) — the production-image digest guard, absent there. Smallest, most self-contained item in the set.
- [`pg-hardening-backport.md`](pg-hardening-backport.md) — the post-fork hardening pass. Six ports, one adapted fix, one design note; includes a live break in presigned uploads and an admin-gating hole the auth rewrite did not preserve.
- [`pg-form-bridge.md`](pg-form-bridge.md) — the server-action form bridge, and the three ways to overreach while porting it.
- [`pg-local-ci.md`](pg-local-ci.md) — local-first CI, in three separable slices, with two driven blockers named.
- [`pg-template-parity.md`](pg-template-parity.md) — the feature scaffold, which there still stops at the action layer and inherits the reference feature's capability.

## Sequencing

Within this repository:

1. `fs-export-search-widening.md` first. It is the confirmed defect, it needs no new
   composite index, and it is independent of everything else.
2. `fs-realtime-stream-recovery.md` after, or in parallel by a different worker — the two
   share no file.
3. `fs-env-failfast-proof.md` is the cheapest item here and its deliverable is mostly
   evidence. It suits a slot where the emulator and a container are already up.
4. `fs-e2e-coverage-parity.md` is the largest at 1-2 days, and its sign-in retry must land
   before its specs. Independent of everything above.
5. `fs-keyset-cursor-verdict.md` needs no implementation. Its only possible output is a
   short note in the data contract, and even that is optional.

Across the two repositories: nothing here is blocking in either direction. The Firestore
items and the PostgreSQL briefs touch disjoint trees and can proceed at the same time.

Inside the PostgreSQL briefs two ordering constraints remain, each stated in the file that
owns it: the form bridge and the form-validation helpers are prerequisites of the template's
form and route files, and the local-CI tiering slice is a product decision that should be
confirmed before the runner slice depends on it. A third — sequencing the self-target refusal
around the fork's final-admin work — has expired, because that work has landed.

## What This Handoff Does Not Cover

- Any claim that a listed defect reproduces in running software. The audit was static.
- The Better Auth question, by the locked decision above.
- Whether the PostgreSQL lead accepts any brief. Each is intent plus evidence; the
  decision, the sequencing and the commits belong to that repository.
- The four items already cross-pollinated by hand before this audit. They are named in
  "State" as context, not as work.
- Items the fork's own baton records as its to carry: a Next.js patch release held under a
  supply-chain quarantine that clears `2026-07-28` (this repository already took it), a wrong
  database URL for its compose app container, two dead modules, and a scratch database only an
  operator may drop.
- Whether the fork's remaining coarse admin gates are a decision rather than an omission. This
  handoff reports them as still coarse and cites the files; the judgement is that lead's.
