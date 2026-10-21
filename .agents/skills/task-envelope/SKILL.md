---
name: task-envelope
description: Use before writing, delegating, or handing off any non-trivial task in this repo — a work item, a ticket, an agent hand-off, a "can you build X". Separates user value from execution and states a checkable finish.
---

# Write a task as an envelope

A task someone else (or an agent) can execute separates **what the user gets** from
**how it is built**, and says when it is done in terms you can check. This skill is the
trigger and the full, self-contained procedure.

## Instructions

1. **Match the envelope to the risk.** A tiny reversible change gets the short
   form (`GOAL` + `DONE WHEN`). Anything non-trivial gets the full envelope:
   `WHY/GOAL` · `TARGET STATE` · `SCOPE`/`FILES` · `CHANGE`/`STEPS` · `DO NOT` ·
   `DONE WHEN` · `VERIFY` · `OUTPUT`.
2. **Write `DONE WHEN` so it can be DRIVEN, not asserted.** "Green + the behaviour
   observed in a browser", never "it compiles" — this repo's whole verify doctrine
   (AGENTS.md > Verify) is that green is not the gate. A criterion you cannot
   exercise is a wish.
3. **Keep `OUTPUT` about the deliverable's SHAPE** (the report/artifact format),
   not the product result. "Return the list of changed files" ≠ "the change works".
4. **For product/UX work, start one level up:** a user story + acceptance
   criteria, then the envelope. If the files are unknown, use `SCOPE`/`SOURCES`
   and discover before writing `STEPS` — do not guess paths.
5. **Name what NOT to do.** `DO NOT` is where scope creep dies; an empty `DO NOT`
   on a risky task usually means you have not thought about the blast radius.

## Done means

The reader can start without asking you a question, and can tell — by driving,
not by trusting — when they are finished.
