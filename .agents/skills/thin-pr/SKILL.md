---
name: thin-pr
description: Use when opening a PR, when a change is growing, or when deciding where a slice boundary goes. Keeps a PR reviewable — one dominant question, a size budget, and a split before it sprawls.
---

# Keep a PR to one review question

A change is reviewable when a reviewer can hold it in their head — that is a size
budget, and this skill is the self-contained procedure for holding the line.

## Instructions

1. **State the PR's one dominant review question before you code**, and keep the
   work inside it. If you cannot say the PR in its title + first paragraph, it is
   two PRs.
2. **Budget:** ≤400 changed LOC (`+A/-D`), 1–3 commits. Measure, do not eyeball:
   `git diff --shortstat` and `git diff --stat` (against the base branch for
   stacked work: `git diff --shortstat <base>...HEAD`).
3. **Split BEFORE you cross the line** — when the diff exceeds ~300 LOC, would
   exceed 400, touches more than ~8 source files, or **mixes concerns**
   (feature + refactor, UI + schema, product behaviour + test harness, code +
   broad docs sweep, generated + handwritten). Splitting after the fact is harder
   than never crossing.
4. **No opportunistic work.** "also", "while here", "cleanup", "follow-up" is a
   different PR. A feature fix that carries unrelated tidy-up is two changes
   wearing one diff.
5. **Allowed oversize**, and only then: formatting, codemods, generated files,
   lockfile churn, tooling migrations — marked `Oversize reason: <which>`.
6. **Report the size when you call it done:** commits, files, `+A/-D = total LOC`,
   the dominant theme, and whether a split is still needed.

## Done means

The PR asks one question, fits the budget or names why it cannot, and its size is
reported, not guessed.
