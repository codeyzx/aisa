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

## Routes

| Route                                                 | Auth                                                                    | Purpose                                                                                                                                                                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                         | none                                                                    | liveness                                                                                                                                                                                                            |
| `POST /intake/form`                                   | `X-AISA-Signature: sha256=<hex HMAC-SHA256(raw body, INTAKE_SECRET)>`   | Apps Script trigger. Body `{driveFileId, fileName, startupName, founderName?, founderEmail?, consent, submittedAt}`; `consent: false` → 422. Returns 202 `{proposalId, created}`; assessment runs in the background |
| `POST /intake/upload`                                 | `X-AISA-Key`                                                            | multipart `file` (PDF ≤ 20 MB) + optional `name`; stored at `gs://$DECKS_BUCKET/decks/<proposalId>.pdf`; 202                                                                                                        |
| `POST /digest/run?slot=09.00\|17.00[&dryRun=true]`    | `X-AISA-Key`                                                            | Cloud Scheduler target. One digest per slot per WIB day (a retry returns `skipped`). `dryRun` returns the template text and writes/sends nothing                                                                    |
| `POST /webhook/gowa`                                  | `X-Hub-Signature-256: sha256=<hex HMAC(raw body, GOWA_WEBHOOK_SECRET)>` | GOWA events. Only `event: message`, not from me, not a group, sender in `MANAGER_PHONES`; deduped by `webhookEvents/{payload.id}`; processed in the background, reply sent via GOWA                                 |
| `POST /api/proposals/{id}/response`                   | `X-AISA-Key`                                                            | `{kind: undang\|pantau\|arsipkan, note?}`                                                                                                                                                                           |
| `POST /api/proposals/{id}/correction`                 | `X-AISA-Key`                                                            | `{category, reason}`; reason required; only `dinilai` proposals                                                                                                                                                     |
| `POST /api/proposals/bulk-response`                   | `X-AISA-Key`                                                            | `{category, kind}` → `{count}`                                                                                                                                                                                      |
| `PUT /api/rules`                                      | `X-AISA-Key`                                                            | `{rules, reason}`; weights must cover all five criteria and sum to 1 ± 0.001, else 422. Version is bumped by the server                                                                                             |
| `POST /api/runtime/stop` / `POST /api/runtime/resume` | `X-AISA-Key`                                                            | pause / resume; resume assesses `antre` and `dihentikan` proposals                                                                                                                                                  |
| `GET /api/proposals/{id}/deck-url`                    | `X-AISA-Key`                                                            | uploads: V4 signed GCS URL, 15 min. Form decks stay in Drive, so this returns the Drive view link                                                                                                                   |

Domain errors come back as `{"detail": "..."}` with 404 / 409 / 422.

### WhatsApp commands (recognised by code, case-insensitive)

`undang|pantau|arsipkan <nama>` · `undang|pantau|arsipkan semua <sangat cocok|cocok|kurang cocok|tidak cocok>`
(asks for confirmation; `YA` within 10 minutes executes) · `pindahkan <nama> ke <kategori> karena <alasan>`
· `STOP` · `LANJUT`. Names match exact → unique prefix → unique fuzzy (≥ 0.85); otherwise the
reply lists candidates and nothing changes. Any other message goes to the Asisten.

## Environment

| Var                      | Notes                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `GOOGLE_CLOUD_PROJECT`   | default `hackathon-primestep-09`                                                         |
| `GENAI_LOCATION`         | default `global` — Gemini 3.x is only served there for this project                      |
| `FIRESTORE_DATABASE`     | default `(default)`                                                                      |
| `DECKS_BUCKET`           | GCS bucket for uploaded decks                                                            |
| `INTERNAL_API_KEY`       | secret; `X-AISA-Key` for dashboard + scheduler. Unset → those routes return 503          |
| `INTAKE_SECRET`          | secret; HMAC key shared with Apps Script. Unset → `/intake/form` rejects everything      |
| `GOWA_BASE_URL`          | default `https://gowa.aixel.id`                                                          |
| `GOWA_BASIC_AUTH`        | secret, `user:pass`                                                                      |
| `GOWA_DEVICE_ID`         | sent as `X-Device-Id`                                                                    |
| `GOWA_WEBHOOK_SECRET`    | secret; unset → every webhook is rejected                                                |
| `MANAGER_PHONES`         | comma-separated digits, e.g. `62812…`; the only senders served and the digest recipients |
| `MANAGER_SALUTATION`     | default `Ibu`                                                                            |
| `ASSISTANT_ENGINE_ID`    | full `projects/…/locations/…/reasoningEngines/…`; unset → Asisten runs in-process        |
| `SIGNER_SERVICE_ACCOUNT` | optional; service account used to sign deck URLs (defaults to the runtime SA)            |

## Cloud Run notes

- Deploy with **CPU always allocated** (`--no-cpu-throttling`): intake and webhook replies
  run as background tasks after the response is returned, and would stall otherwise.
- Runtime service account needs: Firestore user, Vertex AI user, Storage object admin on
  `DECKS_BUCKET`, `roles/iam.serviceAccountTokenCreator` on itself (signed URLs use IAM
  signBlob), and read access to the Drive folder (share the folder with the SA email;
  the Drive download requests the `drive.readonly` scope). With `ASSISTANT_ENGINE_ID`, also
  permission to query that Agent Runtime engine.
- Secrets: inject from Secret Manager as env vars (`--set-secrets`).
- Scheduler: `POST /digest/run?slot=09.00` and `?slot=17.00`, time zone `Asia/Jakarta`,
  header `X-AISA-Key`. The digest runs synchronously; give the job a generous attempt
  deadline (several model calls).
- Image: `Containerfile` (python 3.13 slim + uv, non-root, listens on `$PORT`).

## Behaviour worth knowing

- Missing `settings/rules` makes intake and digest fail loudly; there is no runtime default.
- Intake is idempotent by `proposalId`; a proposal is only assessed while `antre` or
  `dihentikan`. An infrastructure failure puts it back to `antre` (with `statusReason`).
- Too little text (average < `minCharsPerPage`) or two failed Penilai validations →
  `perlu_dicek_manual`, no score.
- STOP is checked between intake steps (→ `dihentikan`) and before new intake (→ stays
  `antre`). While paused the digest is sent from the template, without model calls.
- The digest's model-written text is used only if every number in it appears in the data,
  every listed proposal name is present, and it contains no follow-up advice; otherwise
  the deterministic template is sent. Messages are split under 3500 characters.
- The Penilai is not deterministic: the same deck scored 62.5 and 70.0 on two runs.
