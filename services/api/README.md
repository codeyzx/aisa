# aisa-api

One FastAPI service for AISA: proposal intake and scoring, the 09.00/17.00 WhatsApp
digest, the GOWA webhook (manager commands + Asisten), and the dashboard's write API.
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
- `uv run aisa digest 09.00` prints the template digest and writes nothing;
  `--send` really sends it through GOWA and records it.
- `uv run aisa delete-proposal <id> --reason "..."` deletes one proposal (same path as
  `DELETE /api/proposals/{id}`, recorded with `via: sistem`).
- `uv run aisa retention` runs retention now (same as `POST /retention/run`).

## Routes

| Route                                                 | Auth                                                                    | Purpose                                                                                                                                                                                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                         | none                                                                    | liveness                                                                                                                                                                                                                                                       |
| `POST /intake/form`                                   | `X-AISA-Signature: sha256=<hex HMAC-SHA256(raw body, INTAKE_SECRET)>`   | Apps Script trigger. Body `{driveFileId, fileName, startupName, founderName?, founderEmail?, consent, submittedAt}`; `consent: false` → 422. Returns 202 `{proposalId, created}`; assessment runs in the background                                            |
| `POST /intake/upload`                                 | `X-AISA-Key`                                                            | multipart `file` (PDF ≤ 20 MB) + optional `name`; stored at `gs://$DECKS_BUCKET/decks/<proposalId>.pdf`; 202                                                                                                                                                   |
| `POST /digest/run?slot=09.00\|17.00[&dryRun=true]`    | scheduler OIDC or `X-AISA-Key`                                          | Cloud Scheduler target. One digest per slot per WIB day (a retry returns `skipped`). `dryRun` returns the template text and writes/sends nothing                                                                                                               |
| `POST /retention/run`                                 | scheduler OIDC or `X-AISA-Key`                                          | Deletes proposals whose `response.kind` is `arsipkan` and `response.at` is more than `rules.retentionDays` (default 90) days ago, reason "retensi otomatis N hari", `via: sistem`; logged as a `perintah` job. Returns `{retentionDays, deleted, proposalIds}` |
| `POST /webhook/gowa`                                  | `X-Hub-Signature-256: sha256=<hex HMAC(raw body, GOWA_WEBHOOK_SECRET)>` | GOWA events. Only `event: message`, not from me, not a group, sender in `MANAGER_PHONES`; deduped by `webhookEvents/{payload.id}`; processed in the background, reply sent via GOWA                                                                            |
| `POST /api/proposals/{id}/response`                   | `X-AISA-Key`                                                            | `{kind: undang\|pantau\|arsipkan, note?}`                                                                                                                                                                                                                      |
| `POST /api/proposals/{id}/correction`                 | `X-AISA-Key`                                                            | `{category, reason}`; reason required; only `dinilai` proposals                                                                                                                                                                                                |
| `POST /api/proposals/bulk-response`                   | `X-AISA-Key`                                                            | `{category, kind}` → `{count}`                                                                                                                                                                                                                                 |
| `DELETE /api/proposals/{id}`                          | `X-AISA-Key`                                                            | body `{reason}` (required, non-empty, else 422); any status; 404 if missing → 200 `{deleted: true, assistantScrub}`. See "Deleting a proposal" below                                                                                                           |
| `PUT /api/rules`                                      | `X-AISA-Key`                                                            | `{rules, reason}`; weights must cover all five criteria and sum to 1 ± 0.001, else 422. Version is bumped by the server                                                                                                                                        |
| `POST /api/runtime/stop` / `POST /api/runtime/resume` | `X-AISA-Key`                                                            | pause / resume; resume assesses `antre` and `dihentikan` proposals                                                                                                                                                                                             |
| `GET /api/proposals/{id}/deck-url`                    | `X-AISA-Key`                                                            | uploads: V4 signed GCS URL, 15 min. Form decks stay in Drive, so this returns the Drive view link                                                                                                                                                              |
| `POST /api/assistant/ask`                             | `X-AISA-Key`                                                            | `{session: "dashboard-<id>", text}` → `{answer}`. The Asisten for the dashboard's "Tanya AISA": same agent, STOP check and `asisten` job as a WhatsApp question, no GOWA traffic, commands not parsed. Paused → a fixed reply without calling the agent        |

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
clears sessions again. The manager's WhatsApp chat itself is not ours to edit: answers
already sent there keep the name.

### WhatsApp commands (recognised by code, case-insensitive)

`undang|pantau|arsipkan <nama>` · `undang|pantau|arsipkan semua <sangat cocok|cocok|kurang cocok|tidak cocok>`
(asks for confirmation; `YA` within 10 minutes executes) · `pindahkan <nama> ke <kategori> karena <alasan>`
· `STOP` · `LANJUT`. Names match exact → unique prefix → unique fuzzy (≥ 0.85); otherwise the
reply lists candidates and nothing changes. Any other message goes to the Asisten.

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
| `MANAGER_PHONES`         | comma-separated digits, e.g. `62812…`; the only senders served and the digest recipients  |
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
  `aisa-ringkasan-pagi` → `POST /digest/run?slot=09.00` at 09:00, `aisa-ringkasan-sore` →
  `?slot=17.00` at 17:00, `aisa-retensi` → `POST /retention/run` daily at 02:00. The digest
  runs synchronously; give the job a generous attempt deadline (several model calls).
- Image: `Containerfile` (python 3.13 slim + uv, non-root, listens on `$PORT`).

## Behaviour worth knowing

- Missing `settings/rules` makes intake and digest fail loudly; there is no runtime default.
- Intake is idempotent by `proposalId`; a proposal is only assessed while `antre` or
  `dihentikan`. An infrastructure failure puts it back to `antre` (with `statusReason`).
- Too little text (average < `minCharsPerPage`) or two failed Penilai validations →
  `perlu_dicek_manual`, no score.
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
  per proposal, at most 50, plus counts per category and unresponded), to call
  `get_proposal_detail` for at most 2 named proposals unless asked for more, and to stay
  around 4 tool calls per answer. This is an instruction to the model, not a limit enforced
  by code.
- A job that ends without any model call (e.g. a deck with too little text) has
  `model: null`.
- Every Asisten function call is its own step (`tool` = function name, `read` = its
  arguments), followed by the answer step; the steps' tokens sum to the job total.
- A criterion whose quotes were all missing from their pages is capped at 2 and stored with
  `citationsUnverified: true`.
- The digest greeting follows the WIB send time (pagi < 11, siang < 15, sore < 18, else
  malam). Sangat cocok lines carry the top criterion's reason; "Berkualitas, di luar fokus"
  lines carry the failed fit-check reasons. The insight used is stored in `digests.insight`.
- The digest's model-written text is used only if every number in it appears in the data,
  every listed proposal name is present, the insight (when there is one) is still introduced
  by "Yang menarik:", and it contains no follow-up advice; otherwise the deterministic
  template is sent. Messages are split under 3500 characters.
- The Penilai is not deterministic: the same deck scored 62.5 and 70.0 on two runs.
