# The Env Fail-Fast Proof Does Not Prove The Artifact

Owner: this repository. Direction: found in the PostgreSQL fork, applies here.
Status: `OPEN — the gap is in the evidence, not in the code`. Effort: S.
Severity: verification gap.

## What Is Wrong

Two facts sit badly together.

`CLAUDE.md` prescribes the proof: the env fail-fast has no bypass flag, and you prove it by
moving `.env` aside and watching `pnpm build` fail. The `0050` handoff records the result of
following it: the env fail-fast has **no evidence at all**, because the lead's workstation
tooling refused the step.

So the repository's most-cited verification gotcha has never been driven, and the procedure it
cites has a hole in it that nobody has hit yet — because nobody has run it.

The fork ran it. They found that **`next build` copies `.env` into `.next/standalone/`**. An
empty-environment proof that moves only the project's `.env` leaves that copy in place, so the
standalone artifact boots with the environment you thought you had removed. The proof passes
and proves nothing about the thing that actually ships.

## What Is Not Wrong

Be precise about the blast radius, because it is narrower than it first sounds.

The fork also found its **build-time** gate had quietly lost its teeth: that gate existed to
catch a missing public variable before it was inlined as `undefined`, and once the only
required public variables were removed, `pnpm build` passed with no environment at all.

That has **not** happened here. The six `NEXT_PUBLIC_FIREBASE_*` variables are still required
and still inlined at build, so the build-time gate still bites. `lib/env/validate.ts` has no
bypass — a previous one was removed precisely because a check that can be switched off proves
nothing — and builds pass explicit dummy public values instead.

**This is a defect in a procedure and a hole in our evidence. It is not a broken code path.**
Do not write it up as one, and do not "fix" the validator.

## The Work

1. **Drive the fail-fast, finally.** Move `.env` aside and run `pnpm build`. Record what was
   observed: which variables it named, and whether the failure was aggregated across the group
   or stopped at the first.
2. **Drive it against the artifact**, which is the half the current procedure misses. Move
   `.next/standalone/.env` aside as well, boot the standalone output with an empty environment,
   and record that it refused to serve rather than starting and failing later on the first
   request. Do not assert the boot-time behaviour without observing it — the fork's fail-fast
   bites at boot through instrumentation, and whether ours does the same at the same moment is
   a question, not an assumption.
3. **Correct the procedure** in `CLAUDE.md` and `docs/how-to/verify-change.md` to name the
   standalone copy. One sentence: moving the project `.env` is not enough, because the build
   copies it into the standalone output.
4. **Record the evidence** where `0050` says there is none, so the next reader finds a result
   instead of an admission.

## Do Not

- Do not weaken or add a flag to `lib/env/validate.ts`. The absence of a bypass is the feature;
  the file's own header explains that the previous bypass made a passing build meaningless.
- Do not copy the fork's conclusion that the build-time gate is toothless. Theirs is, ours is
  not, and the reason is a difference in which variables are required. Writing their sentence
  here would be false.
- Do not claim `build:ci` proves anything about this. It supplies dummy public values on
  purpose, which is exactly why it cannot be the evidence.

## Checkable Finish

Two observations, both reported as behaviour rather than as a green gate:

- With `.env` moved aside, `pnpm build` fails and names the missing variables.
- With `.env` **and** `.next/standalone/.env` moved aside, the standalone artifact refuses to
  boot and exits non-zero, naming what it needs — rather than serving and failing on first use.

Then the procedure edits, and a line in `0050`'s open-items list moving the env fail-fast from
"no evidence at all" to a dated result.

If the second observation does **not** hold — if the artifact boots — that is a genuine finding
and a different, larger topic. Report it rather than filing it under this one.

## Files

- `CLAUDE.md` (the gotchas list), `docs/how-to/verify-change.md`
- `docs/handoffs/2026.07.22-0050-reusability-hardening/README.md` (the open-items line)
- No source file should change.

## Sequencing

Independent of everything else in this handoff. It is the cheapest item here and the only one
whose deliverable is mostly evidence, so it suits a slot where the emulator and a container are
already up.
