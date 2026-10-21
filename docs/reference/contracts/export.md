# Export contract (PDF · Excel · CSV)

- Type: Reference — normative contract
- Owns: handing a human a file — the bytes-out route dialect, the bulk-egress gate, the shared PDF/CSV/XLSX seams, and the export removal checklist
- Source of truth: `lib/export/` (`pdf.ts`, `csv.ts`, `xlsx.ts`, `download.ts`), `components/pdf/`, `app/api/export/`, `features/asset/` (`asset.dataset.ts`, `asset.columns.ts`, `asset.document.tsx`, `asset.workbook.ts`)
- Verified by: `pnpm test` (the colocated `lib/export/*.test.ts` assert CSV quoting/defusing and read XLSX cell TYPES back out of the bytes) plus the driven gate contrast below — signed in as `user`, `/csv` must 403 while `[id]/pdf` returns a real PDF
- Read when: adding a printable document or a dataset export, touching anything under `lib/export/` or `components/pdf/`, or deleting the export capability
- Does not define: the error envelope and status codes a failure answers with ([HTTP API contract](http-api.md)), the query and index rules a dataset composes ([data contract](data.md)), or who holds `export:read` ([auth contract](auth.md))

How this repo hands a human a file. The value here is the **seam**, not the
output: a fork should be able to add its own document without re-deriving how a
route answers bytes, where the shared theme lives, who checks the capability, or
how the filename gets set.

Three strands ship: `/api/export/assets/csv`, `/api/export/assets/xlsx`, and
`/api/export/assets/[id]/pdf`. If a claim in this file stops being true, delete the
claim or fix the code.

## PDF is a document; CSV and Excel are a dataset

The routes hand a _query_ to CSV and an _id_ to the PDF. Use that to pick a
format.

- **A document** is one record, addressed by its own id, laid out to be read or
  printed. It gets a PDF.
- **A dataset** is a filtered set, addressed by a query, meant to be sorted,
  pivoted, or fed to another system. It gets CSV or Excel.

A list-shaped PDF is a worse CSV: its params are the same filter CSV already
covers, and it drags pagination and volume into the one strand that should be
about layout.

Once it is a dataset, the pick between the two dataset formats is one axis:

- **CSV** for **streamable / interchange** — an unbounded export, or bytes another
  system will parse. Plain text, no cell types, streams row-by-row with no library
  (`lib/export/csv.ts`; see "## CSV").
- **XLSX** for **typed cells / a workbook** — a date that sorts and filters _as a
  date_, a number that is a number, room for more than one sheet. That typing is
  the only thing `exceljs` earns its place for (see "## Excel").

If you cannot name a typed-cell need, it is a CSV.

## The route dialect: bytes out, envelope on failure

An export's success is **bytes + `Content-Disposition`**. `lib/api`'s `apiOk`
returns `Response.json` and structurally cannot carry that.

- **MUST** answer success through `downloadResponse()` (`lib/export/download.ts`),
  which takes a stream or a completed buffer plus a content type and filename.
  The header itself comes from `lib/http/content-disposition.ts` and is not spelled
  in a route: a presigned storage URL carries the same header as a
  `response-content-disposition` parameter, and two layers spelling it separately
  is how one download starts forcing a save while the other quietly opens inline.
- **MUST** answer failure with `apiFail` / `apiFailFromDenial` from
  `lib/api/response`.
- **MUST NOT** wrap bytes as base64 inside the envelope. It kills streaming and
  needs client JS to reassemble a file the browser already knows how to save.
- **MUST NOT** hand-roll status codes. `lib/api/errors.contract.ts` owns the taxonomy;
  re-spelling it is a parallel taxonomy.

**Why failure still goes through the envelope:** a download is a plain
`<a download>` navigation, not a `fetch`. The browser saves whatever the server
sends — so a 200 carrying an error page is saved as `asset.pdf` and opens as
garbage. An error must be a real status code.

### The download affordance is a real anchor, and two shortcuts are banned

Both of these pass typecheck, lint and every structure check, which is exactly why
they are written down rather than left to review:

- **MUST NOT** use `next/link`. The target is a route handler that answers BYTES,
  not a page. `Link` prefetches an RSC payload that does not exist and then tries
  to client-navigate to a file. Use `<a>`; reach for `buttonVariants` on the real
  anchor if you want it to look like a button.
- **MUST NOT** use `<Button nativeButton={false} render={<Link/>}>`. That prop
  stamps `role="button"` onto a link, which removes it from the screen-reader
  rotor's link list — a download that a screen-reader user can no longer find by
  navigating links, with nothing red anywhere to say so.

`app/api/storage/upload-url/route.ts` is the gating pattern to copy — the
`authorizeSession()` call and its header comment's reasoning for why not
`requireCapability` and why not `runAction`. It answers the envelope too.

XLSX has one wrinkle CSV does not: the workbook is built in memory, so a row that
fails during generation can still be turned into an envelope — but only because
nothing has been written to the wire yet. A streamed CSV that fails mid-stream
has already sent a 200, and no envelope can retract it. Keep the failure points
before the first byte.

### When a stream fails anyway: the truncation contract

"Keep the failure points before the first byte" is the goal, not a guarantee the
CSV route can make — `.stream()` can fail on row ten thousand. Since the 200
cannot be retracted, the failure is made observable in the only two places left:

- The file ENDS with a truncation row whose first cell is
  `__EXPORT_TRUNCATED__` (`CSV_TRUNCATION_MARKER`) and whose second is the
  request's correlation id, padded to the header width so a strict parser can
  still read it. A consumer detects a partial export by checking that last row.
- The response carries that same id on `x-correlation-id`, and the route logs
  the throw under it. `correlationId` is REQUIRED on `downloadResponse` for every
  download, streamed or buffered: bytes cannot carry an envelope, so this header
  is the only handle a reader holding a wrong file has on the server log.

The stream is **closed, not errored**, and that is deliberate: erroring a
`ReadableStream` clears its queue, which would discard the very row that explains
the failure, and a `<a download>` navigation would still leave a partial file on
disk with nothing in it to say so. Silently stopping is the one outcome forbidden
here — a shorter CSV parses perfectly and is indistinguishable from a successful
export of fewer rows.

## Gating: `export:read` is about BULK EGRESS, not file format

- `/api/export/assets/[id]/pdf` → **`asset:read`**. One document — the same set
  `/assets` already hands any signed-in user.
- `/api/export/assets/csv`, `/api/export/assets/xlsx` → **`export:read`**, which is
  **admin-only**.

**Driven, because only the contrast proves it:** signed in as `user` (who holds
`asset:read` but not `export:read`), `/csv` and `/xlsx` answer a JSON **403**
through the envelope while `[id]/pdf` answers **200** with a real PDF. Either
half alone passes on a build that gated everything the same way — a build that
wrongly reused `asset:read` would 200 the CSV and hand every signed-in user the
whole collection. Re-drive **both** halves if you touch these gates.

Put that reason in a comment at every gate, **or the boundary lies** and the next
reader "fixes" the inconsistency by making the two agree.

**Why not reuse `asset:read` for the bulk routes:** `ROLE_CAPABILITIES.user` is
`['asset:read', 'storage:read']`, so reusing it would hand **every signed-in
user the entire collection** in one click. The principle is
**reuse-but-fail-closed**.

**MUST gate a route with `authorizeSession(capability)` + `apiFailFromDenial`,
never `requireCapability`.** `requireCapability` **redirects**, and a 307 to
`/login` saved as `assets.csv` is a login page with a spreadsheet's name, not a
refusal. One gate covers four boundaries — `authorizeSession` also refuses a
session owing a mandatory password change, which a hand-written `getSession` +
`can()` pair silently would not. Pages are the opposite:
`app/(app)/(examples)/export/page.tsx` uses `requireCapability('export:read')`,
exactly as the storage example does.

**The accepted price:** a fresh cloner signed in as `user` clicks Download and
gets a refusal — consistent with the storage example already being admin-only. A
project that wants bulk egress for everyone adds `export:read` to `user` in
`lib/auth/rbac.ts`, deliberately, in a file it must open anyway.

> **Unauthenticated downloads answer the API error contract.** `proxy.ts` returns
> a JSON `401 UNAUTHENTICATED` for cookie-less `/api/` requests before the export
> handler runs. A browser download link therefore receives an error response, not
> a login-page redirect. That proxy check is cookie PRESENCE only, so the handler
> still runs its own gate — an invalid cookie receives the same `401` envelope
> from the handler.

## Adding a printable document

The **filesystem is the registry**. Next's router already models "a URL → a
handler"; a slug map is a hand-kept variant of it.

1. Add `features/<entity>/<entity>.document.tsx` — a react-pdf component (the
   document renders a specific entity, so it is domain) reading `pdfStyles` from
   the shared `components/pdf/theme.ts`.
2. Add `app/api/export/<entity>/[id]/pdf/route.tsx` exporting
   `GET = pdfRouteHandler({ capability, load, render, filename })`.

That is the whole cost. `pdfRouteHandler` in `lib/export/pdf.ts` owns everything
repeatable — gate, params, load, 404, render, `Content-Disposition`.

- **MUST NOT** add a `Record<slug, renderer>` map. A missing key is a **silently
  ungated document rather than a type error** — a safety cost, not a typing
  preference.
- **MUST NOT** let `lib/export/pdf.ts` import a domain module — anything under
  `features/*` (an entity's schema, repo, or `*.document.tsx`). The moment it
  does, the generic skeleton is a domain module wearing a generic name (and it
  breaks the `no-import-feature-or-app-from-shared` rule). Read its imports; it
  is a one-line check.
- **MUST NOT** build the filename from user input. `Content-Disposition` is a
  header, and a free-text name would put a `/` or a quote straight into it. The
  asset PDF uses the server-minted `code`, which is safe and still meaningful.

### ⚠️ `components/pdf/*` are NOT DOM components

They render through **react-pdf's own reconciler**. Its `<Text>` / `<View>` are
not HTML, `StyleSheet` is not the DOM's and not Tailwind, units are **points**,
and a `className` does nothing.

**Importing a react-pdf primitive into a page is a runtime error that typechecks
and lints clean.** They live under `components/` because that is where they are
indexed; this warning is here because the directory cannot carry it.

## Spelling: never re-spell what another module owns

- **MUST** read a status through `ASSET_STATUS_LABEL` — the one place a status is
  spelled for a reader. An export **is** a surface a human reads; a file saying
  `active` while the screen says `Active` is the drift that map prevents.
- **MUST** read an Asset field label through `ASSET_FIELD_LABEL`
  (`features/asset/asset.display.ts`) when the same field appears across the
  list, dataset, or document surfaces.
- **MUST** format dates through `lib/format/*` (it pins `Asia/Jakarta`) and money
  through `formatRupiah` (it pins `id-ID`).
- **MUST** spell an entity's export columns **once**, in one list both formats
  read (`features/asset/asset.columns.ts`). CSV and XLSX export the same set; two
  column lists drift, and then two files that claim to be the same export
  describe different things.

## CSV

- **MUST** escape every cell through `lib/export/csv.ts`. It is pure and
  dependency-free so a test reaches it with no config and no emulator at all — a
  server-only repo (`features/asset/asset.repo.ts`) is only importable because
  `vitest.config.ts` supplies the public env fixture, and a guard whose
  reachability depends on test-harness setup is one config edit from
  unfalsifiable.
- **MUST NOT** add a CSV package. ~15 lines of RFC4180 quoting is not worth the
  dependency.
- **Two separate guards, and quoting does not subsume injection.** A cell
  starting `=`, `+`, `-`, `@` (or hiding one behind a tab) is **executed as a
  formula** by the spreadsheet; a correctly quoted `=1+1` still runs. Defusing
  therefore runs **before** quoting — reversed, the `'` lands outside the quotes
  on exactly the hostile cells.

## Excel

`exceljs` earns its place on **typed cells** and nothing else: a date written as
a real date sorts and filters **as a date**, which CSV structurally cannot do and
which is why an ERP user asks for xlsx over csv. A date written as text sorts
alphabetically — "01 Aug" before "16 Jul".

**If that stops being true, drop the dependency.** Test it by reading the cell
back out of the bytes and asserting its **type**; asserting the rendered string
passes on a build that wrote text.

**Export only.** The round-trip half (download a validated template, fill it,
upload it back) does **not** ship: it is a write path, out of scope here.

- **MUST NOT** ship a validated template with nothing to read it back. **A
  template that goes nowhere is fiction** — documented but unwired. Better no
  template than a decorative one.

## Adding a dataset export

`features/asset/asset.dataset.ts` owns **which rows a dataset export contains** —
the filter, the order, and what `?status=` may say — and both dataset routes read
it. Spell that per-route and the CSV and the XLSX of "the same export" drift into
describing different sets, which no gate can see because both files open fine.

- **MUST** reject an unparseable `?status=` with `INVALID_ARGUMENT` (400). This
  **deliberately diverges from `/assets`**, whose search-params treat a bad
  `?status` as a view preference and fall back to unfiltered. That is right for a
  view and wrong for a file: a view shows you what it did in the same glance, a
  download does not. `?status=activ` falling back would hand a reader the entire
  collection in a file they asked to be narrow — **a bulk-egress route quietly
  exporting more than it was asked for**, the one direction a mistake here must
  never go. Fail closed.
- **MUST NOT** import `app/(app)/(examples)/assets/search-params.ts` to reuse its `'all'`
  vocabulary. Core must not import the example surface, and
  `rules/no-import-example-from-core.yml` enforces it. `'all'` is a filter
  _control's_ word; the repo's word for "no filter" is an absent param.

## Queries: do not widen the shape

The export reuses the asset list's filter (`assetsQuery`) and its default order
(`DEFAULT_ASSET_SORT`) — composed, never re-spelled, so the exported set and order
are the **same facts** the list runs rather than copies that agree today.
`firestore.indexes.json` already declares `(status, createdAt)` in **both**
directions, so that costs no new index.

**Any other sort or filter you invent needs a composite index, and nothing
catches a missing one — not even the emulator.** `pnpm indexes:check` is the
local guard, and it only sees queries that actually **ran**.

Read an unbounded export with the admin SDK's `query.stream()`, **not**
`paginate()` — `paginate` mints cursors and caps a page, and an export wants
neither. `.get()` is wrong for the opposite reason: it buffers the whole
collection before writing a byte.

## Removal checklist

The whole capability deletes cleanly:

- `trash "app/(app)/(examples)/export" app/api/export lib/export components/pdf`
- Remove the entity-side export surfaces the seam served:
  `features/asset/asset.columns.ts`, `features/asset/asset.dataset.ts`,
  `features/asset/asset.document.tsx`, `features/asset/asset.workbook.ts` and
  their colocated tests. Grep `@/lib/export` for anything left.
- `lib/http/content-disposition.ts` is SHARED with storage's presigned download,
  so leave it unless storage is going too. If you are removing both capabilities,
  it is orphaned — `trash` it then, and only then.
- Remove the export entry from `app/navigation.ts`, and drop `export:read` from
  `lib/auth/rbac.ts` plus the matching `EXPECTED_GRANTS` entries in
  `rbac.test.ts`.
- `pnpm remove @react-pdf/renderer exceljs`.
- `pnpm typecheck && pnpm build:ci` must still be green.
