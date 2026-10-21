# Export Ignores The List's Search — Confirmed Widening

Owner: this repository. Direction: found in the PostgreSQL fork, confirmed here.
Status: `OPEN — confirmed by static read, not yet driven`. Effort: M.

## What Is Wrong

The asset list genuinely searches. `app/(app)/(examples)/assets/page.tsx` computes
`const search = toSearchTerm(query.q)` and passes it to `listAssets`, which calls
`assetsQuery(args.status, args.search)` — the `searchPrefixes array-contains` narrowing at
`features/asset/asset.repo.ts:77-84`.

The export does not. `resolveAssetDataset` reads exactly one parameter:

- `features/asset/asset.dataset.ts:89` — `const values = new URL(request.url).searchParams.getAll('status')`
- `features/asset/asset.dataset.ts:47` — `assetDatasetQuery` calls `assetsQuery(status)`

`assetsQuery(status?, search?)` is positional, so the second argument is simply omitted.
That is why it typechecks. `GET /api/export/assets/csv?status=active&q=kursi` answers 200
with every active asset, and the file is named `assets-active.csv` — a set nobody asked
for, under a name that does not admit it. Both routes spell the filename from a
status-only projection (`csv/route.ts:97`, `xlsx/route.ts:68`).

This is the failure the dataset file's own header swears against at lines 21-28 — "the
file a reader downloads would describe a different set than the screen they clicked
from" — and that `docs/reference/contracts/export.md` calls the one direction a mistake
here must never go. The export shares the _function_ with the list. It does not share the
_input_.

## What Bounds The Severity

Both of these are real and neither makes the boundary correct:

- `export:read` is admin-only (`lib/auth/rbac.ts:40`). The extra rows go to someone already
  entitled to the whole collection. No privilege escalation, no unauthenticated egress.
- No link in the app emits `?q` to these routes. `datasetHref(format, status)` at
  `app/(app)/(examples)/export/search-params.ts:91-101` builds only `?status`, and the
  assets list deliberately has no download button. Reaching the widening today takes a
  hand-built or copied URL.

Call it a fail-open boundary, not an exploit. Fix it as a boundary.

## One Thing That Makes This Cheap Here

`firestore.indexes.json` already declares `searchPrefixes CONTAINS + createdAt DESC` and
`searchPrefixes CONTAINS + status ASC + createdAt DESC` — the two shapes a searched export
would run under `DEFAULT_ASSET_SORT`. The fix needs no new composite index.

Do not take that on faith at the end. `pnpm indexes:check` only sees queries that actually
ran, and the emulator never flags a missing index, so a searched export that was never
driven locally can still fail in production. Drive both shapes before believing the file.

## The Change

In `features/asset/asset.dataset.ts`:

1. Add a `singleParam(params, name)` helper returning `{present:false}` / `{present:true,
   value}` / `null`, and run **both** `status` and `q` through it, so `?q=a&q=b` is refused
   for the same reason `?status=active&status=retired` already is.
2. Normalise `?q` with `toSearchTerm` from `@/lib/data/search-prefix`. When it normalises
   away — empty, punctuation-only, one character — return `null` so the route answers 400.
   A `q` that cannot be honoured must never fall through to the whole collection.
3. Carry the whole filter on `AssetDataset` instead of `status` alone, so a future
   dimension cannot be honoured by `assetsQuery` and dropped by its only URL-building caller.
4. Pass the term through:
   `assetsQuery(status, search).orderBy(DEFAULT_ASSET_SORT.field, DEFAULT_ASSET_SORT.direction)`.

Then correct two sentences that the fix makes false:

- `features/asset/asset.repo.ts` — "The export routes pass no `search`, so their index bill
  is unchanged". After the fix they do. Say instead that the searched shapes are already
  declared.
- `docs/reference/contracts/export.md` — the fail-closed rule is written for `?status`
  only. It needs the `?q` half, or the contract keeps blessing the gap.

## The Structural Question To Decide

The fork's version of this fix introduced a named `AssetFilter` type. Here `assetsQuery`
is **positional**, which is precisely how the search argument got dropped.

The repository's own "name the type, derive the variants" rule points at naming the filter
once in `asset.repo.ts` and having `assetsQuery`, `assetScope`, `ListAssetsArgs` and
`AssetDataset` all read it. That is the version that makes the class of bug impossible
rather than fixing one instance.

It is also wider: it touches `assetsQuery`, `assetScope`, `ListAssetsArgs`, `listAssets`
and `countAssets`, and **`assetScope`'s string is stamped into every pagination cursor and
into the bulk-selection scope**. Change how that string is built and every live cursor and
selection is invalidated on deploy. Change how it is _spelled_ and you have shipped a
migration nobody planned.

If that is too wide for this slice, the minimum that still closes the bug is
`AssetDataset { query; status; search }` plus `assetDatasetFilename({status, search}, ext)`.
Take the minimum if you must — but say in the commit that the positional trap is still
there. Leaving it unmentioned is how the next person re-drops the argument.

## Do Not

- Do not copy the fork's filename normalisation verbatim. It re-runs its normaliser and
  rewrites spaces to `-` because its term can contain spaces. `toSearchTerm` returns a
  single lowercase alphanumeric word capped at 15 characters, so `assets-active-kursi.csv`
  needs no space handling. If you comment on why it is safe, give this reason — already
  words-only — not the fork's.
- Do not add a search control to `/export` or teach `datasetHref` to emit `?q`. The fork
  did not either. A UI addition is a product call, and the two examples must stay
  independently deletable. If a search box is ever wanted there, it must land _after_ this
  fix — a UI emitting `?q` against today's route would ship the widening as a feature.
- Do not add a compatibility shim for the 400. A caller sending `?q=` today receives the
  whole collection and will start receiving an error. That is the intended direction; it
  deserves one line in the change description and nothing more.

## Checkable Finish

Against the emulator, seed four assets — "Kursi kantor"/active, "Kursi lipat"/retired,
"Meja rapat"/active, "Lemari arsip"/retired.

In a new `test/integration/asset-dataset.test.ts`, assert exported rows **against
`listAssets` for the same URL**, not against a hand-written list. A restated expectation is
the second source of truth the shared query exists to kill.

- `?q=kursi` yields exactly the two Kursi rows, and equals `listAssets({search:'kursi',limit:50}).items`.
- `?status=active&q=kursi` yields exactly "Kursi kantor", and equals the matching `listAssets`.
- No parameters still yields all four.

Then the fail-closed half, which is the half that matters. Each of `?q=`, `?q=--`, `?q=a`,
`?q=kursi&q=meja`, `?status=active&status=retired`, `?status=activ` resolves to `null` and
answers 400 — never a wider file.

Filename units: `assets.csv`, `assets-retired.csv`, `assets-kursi.xlsx`,
`assets-active-kursi.csv`, and `{search:'AST-0001"\n'}` → `assets-ast-0001.csv`, which
proves the header cannot carry a raw `?q`.

None of the above talks HTTP, so finish by driving it. Signed in as an admin in a real
browser: `GET /api/export/assets/csv?q=kursi` downloads a two-data-row file named
`assets-kursi.csv`; `?q=a` answers a JSON 400 envelope rather than a saved spreadsheet;
`/xlsx` does the same. Then run `pnpm indexes:check` in that same session and report that
it saw the searched export's shape and asked for no new index.

Report the row counts observed. Not that the suite was green.

## Files

- `features/asset/asset.dataset.ts`
- `app/api/export/assets/csv/route.ts`
- `app/api/export/assets/xlsx/route.ts`
- `features/asset/asset.repo.ts`
- `test/integration/asset-dataset.test.ts` (new)
- `docs/reference/contracts/export.md`

## Sequencing

Nothing blocks this. It is best done before any slice touching `assetsQuery`'s signature
or `assetScope`'s output, since both would collide in `features/asset/asset.repo.ts`.
