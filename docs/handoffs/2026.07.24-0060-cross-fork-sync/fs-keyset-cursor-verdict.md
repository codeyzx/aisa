# Keyset Cursor Contract — Not A Gap, Do Not Port

Owner: this repository. Direction: considered from the PostgreSQL fork, declined.
Status: `CLOSED — verdict recorded, no implementation required`. Effort: S (and the correct
amount is zero).

## Why This File Exists

The fork landed a commit titled "add a keyset cursor contract and codec". Read as a subject
line, that sounds like something this repository lacks. It is not.

This file records the verdict so the next person reading that commit subject does not spend
a slice building a second codec. That is the specific failure mode here: two cursor modules
in one repository, drifting, which both files' own headers warn against.

## What Is Actually True

This repository is the **origin** of the design. `lib/data/pagination.contract.ts` (206
lines) already owns:

- an opaque base64url token carrying `{sort, scope, sortValue, docId, nav}`
- `encodeCursor` / `decodeCursor(token, sort, scope)`
- a boxed-Timestamp range guard and docId shape validation
- the rule that an unusable token decodes to `null` and serves page one, never a 500

Execution is isolated in the adapter `lib/data/pagination.firestore.ts`, and the rule is
documented in `docs/reference/contracts/data.md` under "Sorting and the cursor".

The fork's `pagination.keyset.ts` is a **sibling** of that file, not a replacement. It
imports this repository's own `toBase64Url` / `fromBase64Url` / `CursorSort`, and the fork
still ships `pagination.contract.ts` verbatim for its audit module.

The emulator suite here already drives forged tokens, wrong-sort tokens and wrong-scope
tokens landing on page one (`test/integration/asset-repo.test.ts`).

So for "opaque token, tamper resistance, contract doc" there is nothing to port in this
direction. The traffic already went the other way.

## The One Real Divergence, And Why It Is Not A Defect

The fork built a feature delta on top of the shared rule: a `kind:'last'` anchorless final
page, database-derived `hasPrev` / `hasNext`, and bounded relative jumps whose skip is
capped at decode time.

That cap is a security control **in the fork**, because a hand-edited cursor there could
otherwise smuggle a deep SQL `OFFSET`. This repository's token has no skip field, so there
is no vector to cap. Copying the cap here would be cargo cult — a guard against an attack
the token shape makes unrepresentable.

Last-page and nearby-jump are therefore pure UX. `Page<T>` and its pager render Previous and
Next only, and that is a product choice, not a missing guarantee.

## If Someone Later Wants The Navigation Surface

Treat it as an optional UX slice with its own justification, not as fork parity. In rough
order of value:

- **A `kind:'last'` cursor** is the cleanest single win. Firestore serves it cheaply and
  anchorlessly via `ordered.limitToLast(limit + 1)`.
- **Database-derived `hasPrev` / `hasNext`.** The prev branch here hardcodes `hasNext = true`
  on the reasoning that we arrived from a later page. The fork deliberately stopped trusting
  that, because rows can be deleted between requests.
- **Bounded nearby jumps.** In Firestore these mean `.offset(n)`, which bills a real read per
  skipped document. That is a money cost, where the fork pays a scan-time cost. If this ever
  ships, the cap must be justified on billing and that reason must be written in the code —
  it is a different argument from the fork's, and reusing the fork's wording would be a
  sentence this code does not support.

Widening `Page<T>` touches `lib/audit` and every list consumer. Keep any new field additive
and optional, which is the shape the data table already tolerates, or a UX nicety becomes a
sweep. Adding a `'last'` kind to the `Cursor` union must not weaken `decodeCursor`: a token
missing `sortValue` or `docId` returns `null` today and that guard is load-bearing.

## Checkable Finish

If the verdict is accepted as written, there is nothing to run. The finish is this file,
plus at most one sentence in `docs/reference/contracts/data.md` naming the fork's keyset
module as a sibling rather than drift — worth adding only if someone has already been
confused by it once.

If the optional last-page slice is ever taken, it finishes with an emulator-driven test in
`test/integration/asset-repo.test.ts` over a row count that is an exact multiple of the page
size, asserting that the last page returns the true final rows in sort order and not
reversed; that its `nextCursor` is null and `prevCursor` is not; that walking Next from page
one reaches a byte-identical page; and that a `last` token minted under a different sort or
scope decodes to null and serves page one. Then drive the pager in a browser and report the
pages observed.

## Files

Read-only for this verdict. Listed so the reader can check the claim rather than trust it:

- `lib/data/pagination.contract.ts`
- `lib/data/pagination.firestore.ts`
- `features/asset/asset.repo.ts`
- `components/ui/data-table.tsx`
- `docs/reference/contracts/data.md`
- `test/integration/asset-repo.test.ts`
