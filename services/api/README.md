# aisa-api

One FastAPI service for AISA: proposal intake and scoring, the WhatsApp digests (09.00
daily, 17.00 weekly summary), the GOWA webhook (commands + Asisten for any 1:1 WhatsApp sender), and the dashboard's write API.
Every AISA Firestore write goes through here; shapes are owned by `aisa/models.py`
(see `docs/reference/contracts/aisa-firestore.md`).

## Run locally

```bash
cd services/api
uv sync
gcloud auth application-default login         # ADC: Firestore, Vertex AI, GCS, Drive
uv run aisa seed-rules                          # writes settings/rules v1 only if absent
uv run uvicorn aisa.main:app --port 8080
uv run pytest                                   # pure-logic unit tests
```

CLI helpers:

- `uv run aisa intake-file deck.pdf [--name "Tani Maju"]` registers and assesses a local
  PDF as an upload (writes Firestore, skips GCS).
- `uv run aisa digest 09.00|17.00` prints the template digest (17.00: the weekly summary)
  as JSON and writes nothing; `--send` really sends it through GOWA and records it.
- `uv run aisa delete-proposal <id> --reason "..."` deletes one proposal (same path as
  `DELETE /api/proposals/{id}`, recorded with `via: sistem`).
- `uv run aisa retention` runs retention now (same as `POST /retention/run`).
- `uv run aisa migrate-grades [--apply]` moves stored data from the old scale (criteria
  tim/pasar/produk/traksi/bisnis, categories sangat_cocok…tidak_cocok) to the A–E criteria and
  5 grades. Without `--apply` it only prints the plan: the rules change, each assessed
  proposal (id, name, old category → "akan dinilai ulang", and whether a manager correction
  will be dropped), the pending confirmations to delete, and the `dailyStats` dates; it makes
  no model call and writes nothing. With `--apply` it:
  1. bumps `settings/rules` (and `rulesVersions/{v}`) to the default weights, anchors and
     thresholds of the new scale, keeping `fit`, `models`, `minCharsPerPage` and
     `retentionDays`, with one `aturan_diubah` history row (`via: sistem`);
  2. deletes every `pendingConfirmations` doc (they may name an old category);
  3. re-assesses every `dinilai` proposal whose `assessment.rulesVersion` is not the new
     version from its stored `proposalTexts`, through the same Penilai, score, fit and grade
     code as intake, with a `penilaian` job "Menilai ulang <nama> (skala baru)". It writes
     `assessment`, `profile`, `fit`, `category`, `effectiveCategory`, `jobId`, sets
     `correction` to null, deletes `qualityOutsideFocus` and adds the tokens; `response`,
     `responded`, `name`, `createdAt` and `assessedAt` are kept. Two failed validations (or
     no stored text) → `perlu_dicek_manual` with "penilaian ulang gagal: …". Each proposal
     gets one `dinilai_ulang` history row (`before` = old `category`). Other statuses are not
     touched;
  4. recomputes `dailyStats.byCategory` for every existing date from the `dinilai` proposals
     by the WIB date of `assessedAt` (a deleted proposal cannot be re-assessed and drops
     out; `proposalsIn` and `perluDicekManual` are left as they were),
     and prints each proposal's old category → new grade and score. A second run finds nothing
     to do and writes nothing.
- `uv run aisa migrate-responses [--apply]` moves stored decisions from undang / pantau /
  arsipkan to setuju / tolak. Without `--apply` it prints each proposal whose
  `response.kind` is an old word (id, name, old → new) and the number of pending
  confirmations, and writes nothing. With `--apply` it:
  1. sets `response.kind` `undang` → `setuju` and `arsipkan` → `tolak`, keeping `at`, `via`
     and `note` (so a `tolak` keeps its retention clock from the archive date); `pantau` →
     `response: null`, `responded: false` (back to awaiting a decision);
  2. writes one `tanggapan` history row per changed proposal (`via: sistem`, `before` the old
     word, `after` the new one or null, e.g. "Tanggapan Tani Maju dipindah ke skala baru:
     Undang → Setuju" / "Tanggapan Pantau untuk X dikosongkan; proposal kembali menunggu
     keputusan");
  3. deletes every `pendingConfirmations` doc (they name old commands).
     A `response.kind` that is neither an old nor a new word is listed and left alone. A second
     run finds nothing to do and writes nothing.
- `uv run aisa migrate-anchors [--apply]` completes a `settings/rules` doc saved before rubric
  levels 2 and 4 existed. Without `--apply` it prints, per criterion, which of `"2"` and `"4"`
  would be filled, and writes nothing. With `--apply` it fills only a level that is missing or
  blank, from `DEFAULT_ANCHORS`; a level with stored text is never changed. It saves through
  the same path as `PUT /api/rules`: the next version in `settings/rules` and
  `rulesVersions/{v}`, and one `aturan_diubah` history row (`via: sistem`, reason "Lengkapi
  patokan skor 2 dan 4 dari baseline"). A missing criterion or a blank 1/3/5 is reported and
  nothing is written. When every level is present it says so and writes nothing.
- `uv run aisa seed-demo [--apply]` writes a fictional demo dataset so every dashboard chart
  has data; `uv run aisa seed-demo --remove [--apply]` takes it out again. Both only print the
  plan without `--apply`. Every doc it creates has an id starting with `demo-`, in
  `proposals`, `proposalTexts`, `jobs` (with `steps`), `history` and `digests`; real docs are
  never touched. Over the 13 WIB days before today it writes 42 Form proposals (no
  `driveFileId`, so no deck button; 40 assessed, 2 `perlu_dicek_manual`) scored, graded and
  fit-checked by `scoring` against the live `settings/rules`, each with its `proposalTexts`,
  its `penilaian` job and a `proposal_masuk` row, plus a setuju/tolak `tanggapan` for about half
  of the older ones; a few `asisten` jobs a day; and a 09.00 digest each day and the weekly
  summary on Fridays, built with `digest.py`'s templates, each with its `ringkasan` job and
  row. A digest slot that already has a real digest that day is skipped. The digest text
  greets with `MANAGER_SALUTATION` / `MANAGER_NAME` from the environment it runs in.
  `dailyStats` is changed in the same transaction as each unit (a proposal with its job, or
  one job), by exactly what intake and `JobLog.finish` would add; `--remove` subtracts it again,
  computed from the stored docs, drops a map key that reaches zero and deletes a `dailyStats`
  doc left with nothing in it. Ids and the RNG seed are fixed, so a second `--apply` skips
  every unit that exists. A demo proposal deleted from the dashboard keeps its `dailyStats`
  contribution (as a real one does), and `--remove` can no longer subtract it.

## Routes

| Route                                                 | Auth                                                                    | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                         | none                                                                    | liveness                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `POST /intake/form`                                   | `X-AISA-Signature: sha256=<hex HMAC-SHA256(raw body, INTAKE_SECRET)>`   | Apps Script trigger. Body `{driveFileId, fileName, startupName, founderName?, founderEmail?, consent, submittedAt}`; `consent: false` → 422. Returns 202 `{proposalId, created}`; assessment runs in the background                                                                                                                                                                                                                 |
| `POST /intake/upload`                                 | `X-AISA-Key`                                                            | multipart `file` (PDF ≤ 20 MB) + optional `name`; stored at `gs://$DECKS_BUCKET/decks/<proposalId>.pdf`; 202                                                                                                                                                                                                                                                                                                                        |
| `POST /digest/run?slot=09.00\|17.00[&dryRun=true]`    | scheduler OIDC or `X-AISA-Key`                                          | Cloud Scheduler target. `09.00` is the daily digest; `17.00` is always the weekly summary, on any weekday (mid-week it covers the week so far). One digest per slot per WIB day (a retry returns `skipped`). `dryRun` returns the template text (plus `period`, and for 17.00 `week` and `weekly`) and writes/sends nothing                                                                                                         |
| `POST /retention/run`                                 | scheduler OIDC or `X-AISA-Key`                                          | Deletes proposals whose `response.kind` is `tolak` and `response.at` is more than `rules.retentionDays` (default 90) days ago, reason "retensi otomatis N hari", `via: sistem`; logged as a `perintah` job. Returns `{retentionDays, deleted, proposalIds}`                                                                                                                                                                         |
| `POST /webhook/gowa`                                  | `X-Hub-Signature-256: sha256=<hex HMAC(raw body, GOWA_WEBHOOK_SECRET)>` | GOWA events. Only `event: message`, not from me, not a group, any sender with a phone JID (`…@s.whatsapp.net`; LID-only senders ignored); deduped by `webhookEvents/{payload.id}`; processed in the background, reply sent via GOWA                                                                                                                                                                                                 |
| `POST /api/proposals/{id}/response`                   | `X-AISA-Key`                                                            | `{kind: setuju\|tolak, note?}`; any other kind (the old undang/pantau/arsipkan included) → 422                                                                                                                                                                                                                                                                                                                                      |
| `POST /api/proposals/{id}/correction`                 | `X-AISA-Key`                                                            | `{category, reason}`; reason required; only `dinilai` proposals                                                                                                                                                                                                                                                                                                                                                                     |
| `POST /api/proposals/bulk-response`                   | `X-AISA-Key`                                                            | `{category, kind: setuju\|tolak}` → `{count}`; every unresponded `dinilai` proposal in that effective grade                                                                                                                                                                                                                                                                                                                         |
| `DELETE /api/proposals/{id}`                          | `X-AISA-Key`                                                            | body `{reason}` (required, non-empty, else 422); any status; 404 if missing → 200 `{deleted: true, assistantScrub}`. See "Deleting a proposal" below                                                                                                                                                                                                                                                                                |
| `PUT /api/rules`                                      | `X-AISA-Key`                                                            | `{rules, reason}`; weights must cover the five criteria A–E and sum to 1 ± 0.001, thresholds strictly descending within (0, 100], else 422. Version bumped by server                                                                                                                                                                                                                                                                |
| `POST /api/runtime/stop` / `POST /api/runtime/resume` | `X-AISA-Key`                                                            | pause / resume; resume assesses `antre` and `dihentikan` proposals                                                                                                                                                                                                                                                                                                                                                                  |
| `GET /api/proposals/{id}/deck-url`                    | `X-AISA-Key`                                                            | `{url, previewUrl, expiresIn}`. Uploads: one V4 signed GCS URL (15 min, `expiresIn: 900`) signed with `Content-Type: application/pdf` and `Content-Disposition: inline`, so it renders in an `<iframe>` and in a new tab; `previewUrl` equals `url`. Form decks stay in Drive: `url` is the `/view` link, `previewUrl` the embeddable `/preview` link (renders only for a Google account that can open the file), `expiresIn: null` |
| `POST /api/assistant/ask`                             | `X-AISA-Key`                                                            | `{session: "dashboard-<id>", text}` → `{answer}`. The Asisten for the dashboard's "Tanya AISA": same agent, STOP check and `asisten` job as a WhatsApp question, no GOWA traffic, commands not parsed. Paused → a fixed reply without calling the agent; cancelled by STOP → a fixed reply; agent failure → 503 with the WhatsApp fallback text as `detail`, job recorded `gagal`                                                   |

Domain errors come back as `{"detail": "..."}` with 404 / 409 / 422.

"Scheduler OIDC" means `Authorization: Bearer <Google ID token>` whose audience is
`SCHEDULER_AUDIENCE` and whose verified `email` is `SCHEDULER_SA_EMAIL`, checked with
`google.oauth2.id_token.verify_oauth2_token`. `X-AISA-Key` is still accepted on those routes
for manual and dashboard triggers. The log line `scheduler route authenticated via oidc|key`
records which one was used.

### Deleting a proposal

`domain.delete_proposal` (used by the route, the CLI and retention) removes
`proposals/{id}`, `proposalTexts/{id}`, the GCS deck when `source.gcsPath` is set (a form
deck stays in Drive), every `jobs/{jobId}` with `proposalId == id` plus its `steps`, and
every `pendingConfirmations` doc listing the id. `history` rows of the proposal are kept but
scrubbed: `proposalName: "(dihapus)"`, `before`, `after` and `reason` set to null, and
`detail` replaced. The name is also replaced by "(dihapus)" in `tanggapan_massal` history
details and in the text of `digests` that listed the proposal (whose `proposalIds` drop the
id). Finally one `history` row `{action: "proposal_dihapus", via, proposalId, reason}` is
written, with no name or founder data. Aggregate counters in `dailyStats` are not changed.
The proposal document is deleted last, so a failed call can be repeated.

Then the Asisten's state is cleared (`assistant_client.forget`), since its conversations may
name the startup. With `ASSISTANT_ENGINE_ID` set: every `assistantSessions` doc is deleted
(so the next question opens a new session), then every Agent Runtime session of the engine
(`agent_engines.sessions.list` / `.delete`, the mapped ones and earlier days' alike; a 404 is
skipped), then every Memory Bank memory whose `fact` names the proposal by the same
whole-word, case-insensitive rule as the scrub above (`agent_engines.memories.list` /
`.delete`); other memories stay. Without it, the in-process runner's in-memory sessions are
cleared. The response carries `assistantScrub: {sessions, memories}`, counting the deletes
Agent Runtime accepted (they finish as long-running operations; nothing waits for them). An
Agent Runtime failure is logged and returned as `assistantScrub.error`; the Firestore
deletion stands and is not retried, and what was not deleted stays until a later deletion
clears sessions again. A sender's WhatsApp chat itself is not ours to edit: answers
already sent there keep the name.

### WhatsApp commands (recognised by code, case-insensitive)

`setuju <nama>` · `tolak <nama>` (reply "Tercatat: Tani Maju → setuju.") ·
`setuju semua <grade>` · `tolak semua <grade>` (asks for confirmation; `YA` within 10 minutes
executes, reply "Selesai: N proposal disetujui." / "… ditolak.") ·
`pindahkan <nama> ke <grade> karena <alasan>` · `STOP` · `LANJUT`. Names match exact → unique
prefix → unique fuzzy (≥ 0.85); otherwise the reply lists candidates and nothing changes. A
message starting with an old decision word (`undang`, `pantau`, `arsipkan`) changes nothing
and gets "Perintah sekarang: setuju <nama> atau tolak <nama>." (no job, not sent to the
Asisten). Any other message goes to the Asisten.
`<grade>` is one of "sangat layak", "layak bersyarat", "perlu penyesuaian", "risiko tinggi",
"tidak layak" (any case, any spacing); "layak" alone is not a grade.

## Environment

| Var                      | Notes                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `GOOGLE_CLOUD_PROJECT`   | default `hackathon-primestep-09`                                                          |
| `GENAI_LOCATION`         | default `global` — Gemini 3.x is only served there for this project                       |
| `FIRESTORE_DATABASE`     | default `(default)`                                                                       |
| `DECKS_BUCKET`           | GCS bucket for uploaded decks                                                             |
| `INTERNAL_API_KEY`       | secret; `X-AISA-Key` for dashboard + scheduler. Unset → those routes return 503           |
| `INTAKE_SECRET`          | secret; HMAC key shared with Apps Script. Unset → `/intake/form` rejects everything       |
| `GOWA_BASE_URL`          | default `https://gowa.aixel.id`                                                           |
| `GOWA_BASIC_AUTH`        | secret, `user:pass`                                                                       |
| `GOWA_DEVICE_ID`         | sent as `X-Device-Id`                                                                     |
| `GOWA_WEBHOOK_SECRET`    | secret; unset → every webhook is rejected                                                 |
| `MANAGER_PHONES`         | comma-separated digits, e.g. `62812…`; the digest recipients (the bot answers any phone)  |
| `MANAGER_SALUTATION`     | default `Pak`                                                                             |
| `MANAGER_NAME`           | optional; digest greeting becomes "Selamat pagi, Pak Budi." Empty → salutation only       |
| `ASSISTANT_MODEL`        | model the Asisten runs (default `gemini-3.8-flash`); also the `asisten` job's model label |
| `SCHEDULER_SA_EMAIL`     | service account Cloud Scheduler signs its OIDC token as; unset → OIDC is not accepted     |
| `SCHEDULER_AUDIENCE`     | expected token audience: the service URL; unset → OIDC is not accepted                    |
| `ASSISTANT_ENGINE_ID`    | full `projects/…/locations/…/reasoningEngines/…`; unset → Asisten runs in-process         |
| `SIGNER_SERVICE_ACCOUNT` | optional; service account used to sign deck URLs (defaults to the runtime SA)             |

## Cloud Run notes

- Deploy with **CPU always allocated** (`--no-cpu-throttling`): intake and webhook replies
  run as background tasks after the response is returned, and would stall otherwise.
- Runtime service account needs: Firestore user, Vertex AI user, Storage object admin on
  `DECKS_BUCKET`, `roles/iam.serviceAccountTokenCreator` on itself (signed URLs use IAM
  signBlob), and read access to the Drive folder (share the folder with the SA email;
  the Drive download requests the `drive.readonly` scope). With `ASSISTANT_ENGINE_ID`, also
  permission to query that Agent Runtime engine.
- Secrets: inject from Secret Manager as env vars (`--set-secrets`).
- Scheduler (time zone `Asia/Jakarta`, OIDC with `--oidc-service-account-email
  $SCHEDULER_SA_EMAIL --oidc-token-audience $SCHEDULER_AUDIENCE`, no key header):
  `aisa-ringkasan-pagi` → `POST /digest/run?slot=09.00` daily at 09:00, `aisa-ringkasan-sore`
  → `?slot=17.00` meant for Fridays at 17:00 (cron `0 17 * * 5`; the service itself does not
  check the weekday), `aisa-retensi` → `POST /retention/run` daily at 02:00. The digest
  runs synchronously; give the job a generous attempt deadline (several model calls).
- Image: `Containerfile` (python 3.13 slim + uv, non-root, listens on `$PORT`).

## Behaviour worth knowing

- Missing `settings/rules` makes intake and digest fail loudly; there is no runtime default.
- Intake is idempotent by `proposalId`; a proposal is only assessed while `antre` or
  `dihentikan`. An infrastructure failure puts it back to `antre` (with `statusReason`).
- Too little text (average < `minCharsPerPage`) means the deck is image-only (a scan, or
  slides exported as pictures). Then one model step "Baca teks dari gambar" sends the PDF
  itself to the Penilai model (`aisa/ocr.py`: PDF before the prompt, media resolution
  medium, thinking low, default temperature) and asks it to copy each page's visible text;
  that transcript replaces `proposalTexts/{id}` and the Penilai rates from it as usual, its
  quotes verified against the transcript. A deck over 15 MB or 50 pages, a failed or
  invalid transcription, or a transcript that is still too little text →
  `perlu_dicek_manual`, no score, with the reason in `statusReason`.
- Two failed Penilai validations → `perlu_dicek_manual`, no score.
- The Penilai rates five criteria 1–5, in order A. `manajemen` (Tim manajemen), B. `kinerja`
  (Kinerja bisnis saat ini), C. `risiko` (Risiko bisnis & tren makro, where 5 means risks named
  and mitigated with a supportive trend), D. `rencana` (Rencana bisnis & potensi imbal hasil),
  E. `dampak` (Potensi dampak). Code computes `skor = Σ bobot × (nilai − 1) / 4 × 100` (default
  weights 0.25/0.20/0.20/0.25/0.10) and the grade from the score alone by `rules.thresholds`:
  ≥ `sangatLayak` (85) Sangat layak, ≥ `layakBersyarat` (75) Layak bersyarat, ≥
  `perluPenyesuaian` (65) Perlu penyesuaian, ≥ `risikoTinggi` (50) Risiko tinggi, else Tidak
  layak. The fit check (sector, stage, funding) is stored in `fit` and never changes the
  grade; `fit.passed == false` is what "di luar fokus" means everywhere.
- STOP is checked between intake steps (→ `dihentikan`) and before new intake (→ stays
  `antre`). While paused the digest is sent from the template, without model calls, and a
  WhatsApp message that is not a command gets "AISA sedang dijeda (STOP). Kirim LANJUT
  untuk melanjutkan." instead of reaching the Asisten.
- Every STOP (WhatsApp or dashboard) also sets `settings/runtime.lastStopAt`, which LANJUT
  never clears. An Asisten answer whose job started before `lastStopAt`, or that is running
  while paused, is cancelled: the client stops reading the engine's stream at the next event
  (a model or tool call already under way may still finish on the engine), checks once more
  before returning, sends nothing, and ends the job `dihentikan` with a step "Dihentikan oleh
  STOP" carrying the tokens used so far. The STOP reply adds "Jawaban yang sedang diproses
  dibatalkan." when an `asisten` job was `berjalan` (started within the last 200 s); the
  LANJUT reply adds "Pertanyaan yang dibatalkan perlu dikirim ulang." when such an answer was
  cancelled since the last STOP. LANJUT does not resend the question.
- While the Asisten works, the chat shows "mengetik…" (`POST /send/chat-presence`, refreshed
  every 8 s, cleared at the end or when STOP is seen), and an answer still missing after 20 s
  sends one "⏳ Sedang mengambil data, mohon tunggu…". Presence and that message are
  best-effort: a GOWA failure there is logged and never affects the answer.
- The Asisten is told to answer broad questions from one `get_overview` call (one compact row
  per proposal, at most 50, ranked grade → in focus first → score, plus counts per grade,
  per decision (Setuju, Tolak, "menunggu keputusan"), out of focus and unresponded), to call
  `get_proposal_detail` for at most 2 named proposals unless asked for more, and to stay
  around 4 tool calls per answer. This is an instruction to the model, not a limit enforced
  by code.
- A job that ends without any model call (e.g. a deck too large to read as images) has
  `model: null`.
- Every Asisten function call is its own step (`tool` = function name, `read` = its
  arguments), followed by the answer step; the steps' tokens sum to the job total.
- A criterion whose quotes were all missing from their pages is capped at 2 and stored with
  `citationsUnverified: true`.
- Digest greetings follow the WIB send time (pagi < 11, siang < 15, sore < 18, else
  malam). Every `digests` doc has `period` (`harian` or `mingguan`; absent on older docs,
  which read as `harian`), `windowStart`, and `counts` (the unresponded proposals at send
  time per grade, plus `baruMasuk`, the proposals that came in during the window).
- The 09.00 daily digest counts "baru masuk" since the previous 09.00 digest (a 17.00
  summary in between does not shorten it); before the first one, over the last 24 hours. It
  has one heading per grade: Sangat layak proposals are listed with the top
  criterion's reason, Layak bersyarat and Perlu penyesuaian inline with their scores, Risiko
  tinggi and Tidak layak as counts only. Within a grade, in-focus proposals come first, then
  higher scores; an out-of-focus proposal is marked "(di luar fokus)", and a line says how many
  unresponded proposals are out of focus (`digests.counts.luarFokus`). The insight used is
  stored in `digests.insight`.
- The 17.00 weekly summary covers Monday 00:00 WIB → send time; "minggu lalu" is the full
  Monday–Sunday before. Proposals are placed in a week by `createdAt`, decisions by
  `response.at`; deleted proposals are not counted. Its sections, all counted by code
  (`digests.weekly`, with `week: {start, end}` as WIB dates): _Proposal masuk_ (vs minggu
  lalu, naik/turun); _Sektor_: the top 3 sectors with percent of this week's proposals,
  rounded half up, and count ("F&B 40% (4 dari 10)"; labels as the dashboard's
  `sectorLabel`, plus "tanpa sektor N" when some have none); _Grade_: per grade of this
  week's `dinilai` proposals, Sangat layak + Layak bersyarat, and the share out of focus;
  _Rata-rata skor_ (vs minggu lalu); _Keputusan minggu ini_: Setuju n · Tolak n, and every
  proposal still awaiting a decision (any week; `dinilai` or `perlu_dicek_manual`, not
  responded) with the oldest one's age in whole days since `createdAt`; _Top 3 minggu ini_
  (grade, in focus first, then score: name · grade · score; `proposalIds` lists them); and
  _Perlu dicek manual_ this week. The Insight agent picks one or two code-computed candidates
  (leading sector when not tied and at least 3 proposals came in; the change vs last week;
  the share out of focus; the decision backlog); an insight with a number that is not in the
  candidates is replaced by the first candidate's template sentence.
- The daily digest's model-written text is used only if every number in it appears in the
  data, every listed proposal name, every "(di luar fokus)" mark and every grade heading is
  present, the insight (when there is one) is still introduced by "Yang menarik:", and it
  contains no follow-up advice. The weekly one is held stricter on numbers: it must carry
  exactly the draft's numbers in the same order, plus every bold section heading, the top 3
  names and their marks, the insight label, and no advice. Otherwise the deterministic
  template is sent. Messages are split under 3500 characters.
- Retention deletes only `tolak` decisions; `setuju` is never deleted automatically.
- The Penilai is not deterministic: on the earlier scale the same deck scored 62.5 and 70.0
  on two runs.
