# AISA Firestore contract

- Type: Normative reference contract
- Owns: every AISA collection, its document shape, and the enum values stored in it
- Source of truth: `services/api/aisa/models.py` (Pydantic). The dashboard's zod schemas
  mirror these shapes and only read; every write goes through `aisa-api`.
- Read when: touching any AISA collection from Python, the assistant tools, or the dashboard
- Does not define: how a proposal is scored (see `overview-project.md`), HTTP routes
  (see `services/api/README.md`)

Field names are camelCase in Firestore. Timestamps are Firestore timestamps (UTC);
WIB is a display concern. Money is an integer number of rupiah.

## Enums

| Name             | Values                                                                   |
| ---------------- | ------------------------------------------------------------------------ |
| `Criterion`      | `tim`, `pasar`, `produk`, `traksi`, `bisnis`                             |
| `Category`       | `sangat_cocok`, `cocok`, `kurang_cocok`, `tidak_cocok`                   |
| `ProposalStatus` | `antre`, `dinilai_proses`, `dinilai`, `perlu_dicek_manual`, `dihentikan` |
| `ResponseKind`   | `undang`, `pantau`, `arsipkan`                                           |
| `Via`            | `wa`, `dashboard`, `sistem`                                              |
| `SourceKind`     | `form`, `upload`                                                         |
| `JobKind`        | `penilaian`, `ringkasan`, `asisten`, `perintah`                          |
| `JobStatus`      | `berjalan`, `selesai`, `gagal`, `dihentikan`                             |
| `StepActor`      | `model`, `kode`                                                          |

`ProposalStatus` and `Category` are separate axes: only `dinilai` proposals carry a
category; `perlu_dicek_manual` never carries a score or category.

## `proposals/{proposalId}`

`proposalId` is deterministic from the source so intake is idempotent:
`form-<driveFileId>` or `upload-<first 16 hex of sha256(pdf bytes)>`.

| Field                                   | Type                                                            | Notes                                                               |
| --------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| `name`                                  | string                                                          | startup name (from form, else from Penilai profile, else file name) |
| `nameLower`                             | string                                                          | for name lookup in commands                                         |
| `source`                                | `{kind: SourceKind, driveFileId?, gcsPath?, fileName}`          |                                                                     |
| `founder`                               | `{name?, email?}`                                               | never sent to a model or to WhatsApp                                |
| `consent`                               | bool                                                            | form consent; uploads by the manager are `true`                     |
| `status`                                | `ProposalStatus`                                                |                                                                     |
| `statusReason`                          | string?                                                         | e.g. "teks terlalu sedikit (34 karakter di 12 halaman)"             |
| `pageCount`                             | int                                                             |                                                                     |
| `profile`                               | `{sector?, stage?, fundingAskIdr?, oneLiner?}`                  | extracted by Penilai; `null` field = tidak disebut                  |
| `assessment`                            | `Assessment?`                                                   | see below                                                           |
| `fit`                                   | `{passed, checks: {sector, stage, funding: {passed, reason}}}?` | code                                                                |
| `category`                              | `Category?`                                                     | computed by code                                                    |
| `qualityOutsideFocus`                   | bool                                                            | the "Berkualitas, di luar fokus" mark                               |
| `correction`                            | `{category, reason, at, via}?`                                  | koreksi kategori; does not touch `category`                         |
| `effectiveCategory`                     | `Category?`                                                     | `correction.category` if set, else `category`                       |
| `response`                              | `{kind: ResponseKind, at, via, note?}?`                         | `null` = belum ditanggapi                                           |
| `responded`                             | bool                                                            | `response != null`, kept for queries                                |
| `tokens`                                | `{in, out}`                                                     | sum over this proposal's penilaian job                              |
| `jobId`                                 | string?                                                         | the penilaian job                                                   |
| `createdAt`, `updatedAt`, `assessedAt?` | timestamp                                                       |                                                                     |

`Assessment`: `{criteria: {<Criterion>: {value: 1..5, reason, notMentioned: bool,
citations: [{page: int, quote}]}}, score: 0..100 (float, 1 decimal), rulesVersion: int,
model}`.

Page text lives in `proposalTexts/{proposalId}`: `{pages: [string], charCount}` (index 0 =
page 1). Kept apart so list queries never load deck text.

## `settings/rules` (active) and `rulesVersions/{version}`

`settings/rules` holds the active `Rules`; every change also writes an immutable copy to
`rulesVersions/{version}` plus a `history` row with the reason.

`Rules`: `{version: int, weights: {<Criterion>: float}` (sum 1.0), `anchors: {<Criterion>:
{1, 3, 5: string}}`, `fit: {sectors: [string], stages: [string], fundingMinIdr,
fundingMaxIdr}`, `thresholds: {sangatCocok: 80, cocok: 65, kurangCocok: 45,
qualityOutsideFocus: 65}`, `models: {penilai, ringkasan, insight, asisten, orchestrator}`,
`minCharsPerPage: int, changedAt, reason}`.

## `settings/runtime`

`{paused: bool, pausedAt?, pausedVia?}` — STOP sets `paused`, LANJUT clears it.

## `jobs/{jobId}` and `jobs/{jobId}/steps/{stepId}`

Job: `{kind: JobKind, agent, title, model?, proposalId?, digestId?, status: JobStatus,
startedAt, endedAt?, durationMs?, stepCount, tokensIn, tokensOut}`.

Step: `{seq: int, at, action, tool, actor: StepActor, model?, read?, wrote?, tokensIn,
tokensOut, durationMs, status: "ok" | "gagal" | "dihentikan", error?}`. Code steps have
`actor: "kode"` and zero tokens. Tokens come from the model response `usage_metadata`.

## `history/{id}`

Audit trail (Riwayat): `{at, via: Via, action, proposalId?, proposalName?, before?, after?,
reason?, detail}` where `action` ∈ `tanggapan`, `tanggapan_massal`, `koreksi`,
`aturan_diubah`, `stop`, `lanjut`, `ringkasan_terkirim`, `proposal_masuk`.

## `digests/{digestId}`

`{slot: "09.00" | "17.00", windowStart?, sentAt, text, counts: {<Category>, kualitasLuarFokus,
perluDicekManual, belumDitanggapi, baruMasuk}, proposalIds, usedTemplate: bool, jobId,
gowaMessageIds: [string]}`. `windowStart` is null for the first digest ever sent.

## `dailyStats/{YYYY-MM-DD}` (WIB date)

`{date, proposalsIn, byCategory: {<Category>: int}, bySector: {<sector>: int},
perluDicekManual, tokensIn, tokensOut, modelCalls, tokensByKind: {<JobKind>: {in, out}}}`,
updated with `Increment`.

## Bookkeeping

- `webhookEvents/{gowaMessageId}` — `{at}`; created with `create()` so a duplicate
  delivery fails and is ignored.
- `pendingConfirmations/{phone}` — `{command, proposalIds, expiresAt}` for bulk responses
  awaiting `YA`.
