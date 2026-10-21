---
name: commit
description: Use when about to commit in this repo — writing a commit message, deciding what goes in one commit, or committing a finished batch. Keeps each commit atomic, honestly scoped, and safe.
---

# Commit one intent, and only what you touched

`git log` in this repo should read as a sequence of intents. This is the self-contained
procedure at commit time; `AGENTS.md` > Engineering defaults is the why.

## Instructions

1. **Check before you stage.** `git status` and `git diff` first. Stage the paths
   your change owns, by path — **never `git add -A`**. A file you did not touch is
   not yours to commit; if the tree is dirty in unrelated ways, stop and ask.
2. **One concern per commit**, ≤150–250 changed LOC as a target. If the diff does
   two things, it is two commits. Prefer a new commit over `--amend` unless asked
   to rewrite.
3. **Write a specific imperative subject:** `feat(items): persist an attachment
   key`, not `cleanup` / `wip` / `fix stuff`. The subject is the intent; the body
   is why, and any constraint the next reader needs.
4. **Use the configured git identity.** `git config user.name` / `user.email` —
   never invent, hardcode, or attribute a commit to anyone but the real author. If
   it is unset, stop and ask rather than guessing.
5. **Oversize is allowed only when unavoidable** (formatting, codemod, generated,
   lockfile, migration) and **marked**: `Oversize reason: <which>`.
6. **The irreversible needs a deliberate yes.** Committing locally is fine; a
   force-push, a history rewrite, a deploy, or a delete is not an autopilot move.
   Delete with `trash`, never `rm`.

## Done means

Each commit stands alone, does one thing, carries only paths you touched, and
`git log` tells the story without you narrating it.
