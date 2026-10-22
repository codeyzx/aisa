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

| Name             | Values                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------- |
| `Criterion`      | `manajemen`, `kinerja`, `risiko`, `rencana`, `dampak` (A–E)                            |
| `Category`       | `sangat_layak`, `layak_bersyarat`, `perlu_penyesuaian`, `risiko_tinggi`, `tidak_layak` |
| `ProposalStatus` | `antre`, `dinilai_proses`, `dinilai`, `perlu_dicek_manual`, `dihentikan`               |
| `ResponseKind`   | `setuju`, `tolak`                                                                      |
| `Via`            | `wa`, `dashboard`, `sistem`                                                            |
| `SourceKind`     | `form`, `upload`                                                                       |
| `JobKind`        | `penilaian`, `ringkasan`, `asisten`, `perintah`                                        |
| `JobStatus`      | `berjalan`, `selesai`, `gagal`, `dihentikan`                                           |
| `StepActor`      | `model`, `kode`                                                                        |

`ProposalStatus` and `Category` are separate axes: only `dinilai` proposals carry a
category; `perlu_dicek_manual` never carries a score or category. A `Category` is the grade
and depends on the score only. "Di luar fokus" is not a category and has no field of its
own: it is `fit.passed == false`.

Legacy values: before the 5-grade scale, `Category` was `sangat_cocok`, `cocok`,
`kurang_cocok`, `tidak_cocok` and `Criterion` was `tim`, `pasar`, `produk`, `traksi`,
`bisnis`. The grade migration (`aisa migrate-grades`) re-grades every `dinilai` proposal,
so no proposal keeps the old criteria keys, but old values stay unrewritten in
`history.before`/`after` and in old `digests` (text and `counts` keys). Readers must
tolerate them.

Before Setuju/Tolak, `ResponseKind` was `undang`, `pantau`, `arsipkan`. The response
migration (`aisa migrate-responses`) moves `undang` → `setuju` and `arsipkan` → `tolak`
(keeping `at`, `via` and `note`, so a `tolak` keeps the retention clock of its archive
date) and clears `pantau` back to no response; it writes one `tanggapan` history row per
changed proposal and deletes every `pendingConfirmations` doc. The old words stay
unrewritten in `history.before`/`after` and `history.detail`; readers must tolerate them
(the dashboard shows them as "Undang (lama)", "Pantau (lama)", "Arsipkan (lama)").

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
| `correction`                            | `{category, reason, at, via}?`                                  | koreksi grade; does not touch `category`                            |
| `effectiveCategory`                     | `Category?`                                                     | `correction.category` if set, else `category`                       |
| `response`                              | `{kind: ResponseKind, at, via, note?}?`                         | `null` = belum ditanggapi                                           |
| `responded`                             | bool                                                            | `response != null`, kept for queries                                |
| `tokens`                                | `{in, out}`                                                     | sum over this proposal's penilaian job                              |
| `jobId`                                 | string?                                                         | the penilaian job                                                   |
| `createdAt`, `updatedAt`, `assessedAt?` | timestamp                                                       |                                                                     |

`Assessment`: `{criteria: {<Criterion>: {value: 1..5, reason, notMentioned: bool,
citations: [{page: int, quote}], citationsUnverified: bool}}, score: 0..100 (float, 1 decimal), rulesVersion: int,
model}`.

`citationsUnverified` is true when none of the criterion's quotes could be found on the
page it cites; the code then caps `value` at 2 and the dashboard shows a badge.

Page text lives in `proposalTexts/{proposalId}`: `{pages: [string], charCount}` (index 0 =
page 1). Kept apart so list queries never load deck text.

## `settings/rules` (active) and `rulesVersions/{version}`

`settings/rules` holds the active `Rules`; every change also writes an immutable copy to
`rulesVersions/{version}` plus a `history` row with the reason.

`Rules`: `{version: int, weights: {<Criterion>: float}` (sum 1.0), `anchors: {<Criterion>:
{1, 2, 3, 4, 5: string}}`, `fit: {sectors: [string], stages: [string], fundingMinIdr,
fundingMaxIdr}`, `thresholds: {sangatLayak: 85, layakBersyarat: 75, perluPenyesuaian: 65,
risikoTinggi: 50}` (strictly descending, each in (0, 100]), `models: {penilai, ringkasan, insight, asisten}`,
`minCharsPerPage: int, retentionDays: int, changedAt, reason}`. `retentionDays` defaults
to 90.

`anchors` says what each value 1–5 means for each criterion, and the Penilai prompt lists
all five. `PUT /api/rules` rejects (422) a body whose `anchors` lacks a criterion or a
non-blank text for any of the five levels. A stored doc written before levels 2 and 4
existed still loads: a missing `"2"` or `"4"` is read from the code's default text for that
criterion (`DEFAULT_ANCHORS`); reading does not write the filled text back.

There is no Orchestrator model: commands are recognised by code. `models.asisten` is
informational only; the Asisten's model is fixed when it is deployed to Agent Runtime.

## `settings/runtime`

`{paused: bool, pausedAt?, pausedVia?, lastStopAt?}` — STOP sets `paused` and
`lastStopAt`; LANJUT clears `paused` but keeps `lastStopAt`. While paused, a WhatsApp
message that is not a command gets "AISA sedang dijeda" instead of reaching the Asisten.
An Asisten answer that started before `lastStopAt` is cancelled and never sent, even if
LANJUT arrives before it finishes.

## `jobs/{jobId}` and `jobs/{jobId}/steps/{stepId}`

Job: `{kind: JobKind, agent, title, model?, proposalId?, proposalIds?, digestId?, status: JobStatus,
startedAt, endedAt?, durationMs?, stepCount, tokensIn, tokensOut, currentStep?}`. A WhatsApp command job
gets `proposalId` once its name resolves to one proposal, and `proposalIds` when it lists or
confirms a bulk response. Its title is "Perintah: <perintah> <nama>" built from the parsed
command, never the message text, so a correction's reason is not in it.

`currentStep: {action, tool, actor: StepActor, startedAt} | null` is the live progress of a
running job. It is written on the job doc just before a step starts and set back to `null` by
the same update that records any step and by the update that finishes the job (every
`status`), so a non-null value names work still in progress; once the job ends it is `null`.
Every code step sets it, and so does each Penilai assessment call ("Menilai 5 kriteria",
then "Menilai 5 kriteria (ulang)") and each ringkasan model call ("Menulis insight",
"Menyusun teks ringkasan"). An `asisten` job shows "Menjawab pertanyaan" from its start and
again after each tool call: its tool-call steps are only known once the agent asks for them,
so `currentStep` never names one. Jobs written before this field existed have no
`currentStep` key; read a missing key as `null`.

Step: `{seq: int, at, action, tool, actor: StepActor, model?, read?, wrote?, tokensIn,
tokensOut, durationMs, status: "ok" | "gagal" | "dihentikan", error?}`. Code steps have
`actor: "kode"` and zero tokens. Tokens come from the model response `usage_metadata`.
An `asisten` job writes one step per tool call. The daily retention run is a job of kind
`perintah` with agent "Retensi".

## `history/{id}`

Audit trail (Riwayat): `{at, via: Via, action, proposalId?, proposalName?, before?, after?,
reason?, detail}` where `action` ∈ `tanggapan`, `tanggapan_massal`, `koreksi`,
`aturan_diubah`, `stop`, `lanjut`, `ringkasan_terkirim`, `proposal_masuk`, `proposal_dihapus`,
`dinilai_ulang`. `dinilai_ulang` is written only by the grade migration: `before` is the old
category value, `after` the new grade. The response migration writes `tanggapan` rows with
`via: "sistem"`, `before` the old kind and `after` the new kind, or `after: null` when a
`pantau` was cleared.

## `digests/{digestId}`

`{slot: "09.00" | "17.00", period: "harian" | "mingguan", windowStart?, sentAt, text, insight: string | null,
counts: {<Category>, luarFokus, perluDicekManual, belumDitanggapi, baruMasuk}, proposalIds,
usedTemplate: bool, jobId, gowaMessageIds: [string], week?: {start, end}, weekly?: WeeklyStats}`.
The id is `<WIB date>-0900` or `<WIB date>-1700`, so each slot sends at most once per WIB day.
Slot `09.00` is the daily digest (`period: "harian"`); slot `17.00` is always the weekly summary
(`period: "mingguan"`), whatever the weekday. `period` is absent on docs written before the
weekly summary existed and then reads as `"harian"`. For the daily digest `windowStart` is the
previous `09.00` digest's `sentAt`, or 24 hours before the send when there is none (it is null only on docs
written before that rule, for the first digest ever sent); for the
weekly summary it is Monday 00:00 WIB of the send's week. `counts` is, for both periods, the
proposals awaiting a decision at send time per grade plus `baruMasuk`, the proposals that came
in during the window; `proposalIds` are the proposals the message names (weekly: its top 3).
`week` is weekly only: WIB dates `YYYY-MM-DD` of that Monday and of the send day. `weekly` is
weekly only and holds every number the summary states, counted by code (`WeeklyStats` in
`models.py` owns the shape): this week vs the full Monday–Sunday before it, proposals placed
by `createdAt` and decisions by `response.at`, deleted proposals not counted.
`insight` is the 1–2 sentence insight used in the message, stored without its "Yang
menarik:" label (the message always prints it with the label), or null when there was none.

## `dailyStats/{YYYY-MM-DD}` (WIB date)

`{date, proposalsIn, byCategory: {<Category>: int}, bySector: {<sector>: int},
perluDicekManual, tokensIn, tokensOut, modelCalls, tokensByKind: {<JobKind>: {in, out}}}`,
updated with `Increment`.

## Bookkeeping

- `webhookEvents/{gowaMessageId}` — `{at}`; created with `create()` so a duplicate
  delivery fails and is ignored.
- `pendingConfirmations/{phone}` — `{command, proposalIds, expiresAt}` for bulk responses
  awaiting `YA`.
- `assistantSessions/{key}` — `{date, sessionId}`: the Agent Runtime session the Asisten
  reuses for that key during one WIB `date`; a new day creates a new session. The key is a
  manager phone for WhatsApp, or `dashboard-<uid>-<conversationId>` for the dashboard's
  Tanya AISA (`POST /api/assistant/ask`), so a dashboard conversation never shares a
  session with a phone or with another user. Every `assistantSessions` doc is deleted when a proposal is
  deleted (see below), so the next question opens a new session.

## Deleting a proposal

A proposal is deleted on a founder's request (`DELETE /api/proposals/{id}` with a reason,
or `aisa delete-proposal`) or by the daily retention run, which deletes proposals decided
`tolak` (`response.kind` `tolak`) whose `response.at` is more than `rules.retentionDays` days ago;
a `setuju` proposal is never deleted by retention.
Either path deletes `proposals/{id}`, `proposalTexts/{id}`, the uploaded deck in GCS, the
proposal's jobs with their steps (`proposalId` equal to it), and any `pendingConfirmations`
naming it. A job listing it in `proposalIds` is kept for the other proposals with this one
removed, and any job title or step text (`action`, `read`, `wrote`, `error`) that still names
it as a whole word has the name replaced by "(dihapus)", except in jobs owned by another
proposal. `history` rows
for the proposal are kept but scrubbed: `proposalName` becomes "(dihapus)" and `before` /
`after` are removed. One `proposal_dihapus` row records the deletion and its reason.
Afterwards the Asisten's state outside Firestore is cleared: the `assistantSessions` docs,
every Agent Runtime session of the engine, and every Memory Bank memory whose fact names the
proposal (whole word, case-insensitive); the other memories stay. That step never fails the
deletion: an Agent Runtime error is returned as `assistantScrub.error` and nothing is
retried. The manager's WhatsApp chat is outside AISA and keeps what was already sent.
