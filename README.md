# AISA

Asisten investasi yang menyaring proposal startup dengan AI.

<!-- readme:product -->

## Masalah dan pengguna

AISA dipakai manajer investasi dan tim investasinya untuk menyaring proposal startup yang
masuk. Setiap pekan bisa datang banyak pitch deck, dan membaca serta menilainya satu per satu
memakan waktu. Penilaian manual juga mudah tidak konsisten antarpenilai dan antarhari. AISA
menilai setiap deck dengan rubrik yang sama, menghitung skor dan grade dengan kode, lalu
menyajikan hasilnya di dashboard dan WhatsApp supaya manajer cukup memutuskan setuju atau
tolak.

## Arsitektur agent

```text
Google Form ──▶ Apps Script ───(HMAC)──────┐
Dashboard (unggah PDF) ──(X-AISA-Key)──────┤
WhatsApp ──▶ GOWA webhook ───(HMAC)────────┼──▶ aisa-api (FastAPI, Cloud Run)
Cloud Scheduler ──(OIDC)──▶ digest/retensi ┘           │ semua penulisan data AISA
                                                       ▼
aisa-dashboard (Next.js, Cloud Run) ──membaca──▶ Firestore
```

Dua layanan Cloud Run:

- **`aisa-api`** (`services/api/`, Python + FastAPI) — satu-satunya penulis data AISA ke
  Firestore. Menangani intake, penilaian, ringkasan, webhook WhatsApp, dan API tulis untuk
  dashboard.
- **`aisa-dashboard`** (root repo, Next.js) — membaca Firestore di server. Setiap perubahan
  (tanggapan, koreksi grade, hapus, aturan, unggah deck, pertanyaan ke Asisten) dikirim ke
  `aisa-api` lewat server action dengan header `X-AISA-Key`.

Alur sebuah proposal:

1. **Intake.** Founder mengisi Google Form; Apps Script (`integrations/apps-script/`)
   mengirim data form yang ditandatangani HMAC ke `POST /intake/form`, lalu `aisa-api`
   mengunduh deck dari Drive. Manajer juga bisa mengunggah PDF dari dashboard
   (`POST /intake/upload`, maksimal 20 MB, harus diawali `%PDF`).
2. **Ekstraksi teks** (`pdftext.py`, pypdf) per halaman. Jika teksnya terlalu sedikit (deck
   berupa gambar), `ocr.py` mengirim PDF ke Gemini untuk menyalin teks tiap halaman.
3. **Penilai** (`penilai.py`) menilai lima kriteria (manajemen, kinerja, risiko, rencana,
   dampak) dengan rubrik 1–5, masing-masing dengan kutipan dan halaman. Kutipan dicek
   terhadap teks halaman; dua kali gagal validasi membuat proposal berstatus
   `perlu_dicek_manual` tanpa skor.
4. **Skor** (`scoring.py`, tanpa I/O dan tanpa model): `skor = Σ bobot × (nilai − 1) / 4`,
   diskalakan 0–100. Grade ditentukan dari skor saja (Sangat layak, Layak bersyarat, Perlu
   penyesuaian, Risiko tinggi, Tidak layak). Cek kecocokan sektor, tahap, dan nilai
   pendanaan disimpan terpisah dan tidak mengubah grade.
5. **Ringkasan** (`digest.py`) — Cloud Scheduler memanggil `/digest/run` dengan token OIDC:
   ringkasan harian pukul 09.00 dan ringkasan mingguan pukul 17.00 (dijadwalkan hari Jumat)
   dikirim lewat WhatsApp ke nomor di `MANAGER_PHONES`, kadang disertai satu insight tren.
   `/retention/run` menjalankan retensi data.
6. **WhatsApp** — pesan masuk lewat webhook GOWA. `orchestrator.py` mengenali perintah
   dengan kode (`setuju <nama>`, `tolak <nama>`, `setuju semua <grade>`,
   `pindahkan <nama> ke <grade> karena <alasan>`, `STOP`, `LANJUT`); pesan lain diteruskan
   ke Asisten. Siapa pun yang chat 1:1 ke nomor bot dijawab, bukan hanya `MANAGER_PHONES`.
7. **Asisten** (`aisa/assistant/`, Google ADK) — menjawab pertanyaan dari WhatsApp dan panel
   **Tanya AISA** di dashboard. Berjalan di Vertex AI Agent Runtime bila
   `ASSISTANT_ENGINE_ID` diisi (tanpa itu berjalan di dalam proses `aisa-api`), memakai
   Memory Bank untuk mengingat preferensi manajer, dan hanya punya tool baca Firestore;
   tidak ada tool tulis.

Model untuk Penilai, ringkasan, insight, dan Asisten disimpan di `settings/rules`
(bawaannya `gemini-3.8-flash`) dan dipanggil lewat Vertex AI di location `global`
(`GENAI_LOCATION`). Bentuk data Firestore dimiliki model Pydantic di
`services/api/aisa/models.py`; kontraknya di
[aisa-firestore](docs/reference/contracts/aisa-firestore.md).

<!-- readme:quickstart -->

## Cara instalasi dan menjalankan

### Prasyarat

- **Node 24.22.1** — dari `.node-version` (juga `mise.toml`).
- **pnpm** versi 11.17.0 — dari `packageManager` di `package.json`. Jangan pakai `npm`.
- **Python 3.13** dan **uv** — dari `services/api/.python-version`.
- **Java** untuk Firebase emulator.
- Untuk `aisa-api`: akses ke project Google Cloud (Firestore, Vertex AI, Cloud Storage,
  Drive) lewat `gcloud auth application-default login`.
- Linux adalah platform yang diuji CI; macOS tidak diuji, di Windows pakai WSL2.

### Dashboard

```bash
pnpm install
pnpm dev
```

`pnpm dev` menyalakan Firebase emulator, menjalankan `pnpm setup:local` (membuat `.env` dari
`.env.example` dan menyemai data saat database kosong), lalu `next dev`.

**Berhasil kalau** <http://localhost:3000> membawa ke `/login`, kamu masuk sebagai
`manager@aisa.test` atau `viewer@aisa.test` dengan kata sandi `password123`, lalu sampai di
`/dashboard`. Akun ini hanya ada di Auth emulator.

Halaman bisa dibaca tanpa `aisa-api`, tetapi tombol yang mengubah data butuh layanan itu.
Server menolak boot jika `AISA_API_KEY` kosong, jadi isi nilainya di `.env` sama dengan
`INTERNAL_API_KEY` milik `aisa-api` lokal.

### aisa-api

```bash
cd services/api
uv sync
gcloud auth application-default login
uv run aisa seed-rules                       # menulis settings/rules v1 jika belum ada
uv run uvicorn aisa.main:app --port 8787     # sesuai AISA_API_URL di .env.example
```

Port 8080 dipakai Firestore emulator, jadi `aisa-api` lokal jalan di 8787. Perintah CLI
lain (`aisa intake-file`, `aisa digest`, `aisa seed-demo`, dan lainnya) ada di
[`services/api/README.md`](services/api/README.md).

<!-- readme:verification -->

### Pengujian

```bash
pnpm verify                     # dashboard: static + unit + integration + build
cd services/api && uv run pytest
```

`pnpm verify` tidak mencakup sign-in di browser, env fail-fast saat boot, smoke image
container, dan E2E (`pnpm test:e2e:ci`). Prosedur lengkapnya di
[verify a change](docs/how-to/verify-change.md).

<!-- readme:deployment -->

### Deploy

Kedua layanan dijalankan sebagai image container di Cloud Run. Langkahnya di
[deploy](docs/how-to/deploy.md); pemasangan Google Form di
[setup Google Form](docs/how-to/setup-google-form.md).

<!-- readme:navigation -->

### Dokumen lanjutan

[`docs/README.md`](docs/README.md) adalah indeks dokumentasi. Mulai dari
[local development](docs/tutorials/local-development.md),
[architecture](docs/explanation/architecture.md), dan kontrak per layer di
[`docs/reference/contracts/`](docs/reference/contracts/). README ini mengikuti
[kontrak project README](docs/reference/contracts/project-readme.md).

## Dependensi

Versi di bawah adalah rentang yang ditulis di `package.json` dan
`services/api/pyproject.toml`; versi pasti ada di lockfile.

| Bagian       | Dependensi utama                                                                                                                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard    | `next` ^16.3.8, `react` ^19.2.7, `firebase` ^12.19.0, `firebase-admin` ^14.5.0, `zod` ^4.4.3, `recharts` 3.8.0, `driver.js` 1.9.0, `@tanstack/react-table` 8.21.3, `@sentry/nextjs` ^10.76.2 (opsional)                                                                          |
| aisa-api     | `fastapi` >=0.141.1, `uvicorn` >=0.54.0, `google-genai` >=2.32.0, `google-adk` >=2.12.0, `google-cloud-aiplatform[agent-engines]` >=2.6.0, `google-cloud-firestore` >=2.34.1, `google-cloud-storage` >=3.17.1, `pypdf` >=6.21.1, `httpx` >=0.28.1; `pydantic` ikut lewat FastAPI |
| Layanan luar | Firestore, Firebase Auth, Vertex AI (Gemini), Vertex AI Agent Runtime + Memory Bank, Cloud Run, Cloud Storage, Cloud Scheduler, Secret Manager, Google Drive, Google Form + Apps Script, GOWA (gateway WhatsApp)                                                                 |

## Konfigurasi (contoh tanpa rahasia)

Daftar lengkap variabel dashboard ada di
[configuration reference](docs/reference/configuration.md); variabel `aisa-api` di
[`services/api/README.md`](services/api/README.md). Rahasia di Cloud Run diambil dari
Secret Manager.

Dashboard (`.env`, untuk project nyata; nilai lokal emulator sudah ada di `.env.example`):

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=<isi-sendiri>          # publik, konfigurasi web Firebase
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<project>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<project>.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<isi-sendiri>
NEXT_PUBLIC_FIREBASE_APP_ID=<isi-sendiri>
FIREBASE_PROJECT_ID=<project>
FIREBASE_CLIENT_EMAIL=                              # RAHASIA; kosongkan berdua untuk ADC
FIREBASE_PRIVATE_KEY=                               # RAHASIA
AISA_API_URL=https://<url-aisa-api>
AISA_API_KEY=<isi-sendiri>                          # RAHASIA, sama dengan INTERNAL_API_KEY
```

aisa-api:

```bash
GOOGLE_CLOUD_PROJECT=<project>
GENAI_LOCATION=global
FIRESTORE_DATABASE=(default)
DECKS_BUCKET=<bucket-deck>
INTERNAL_API_KEY=<isi-sendiri>                      # RAHASIA
INTAKE_SECRET=<isi-sendiri>                         # RAHASIA, sama dengan di Apps Script
GOWA_BASE_URL=https://<host-gowa>
GOWA_BASIC_AUTH=<user:pass>                         # RAHASIA
GOWA_DEVICE_ID=<isi-sendiri>
GOWA_WEBHOOK_SECRET=<isi-sendiri>                   # RAHASIA
MANAGER_PHONES=<62xxxx,62yyyy>                      # penerima ringkasan
MANAGER_SALUTATION=Pak
MANAGER_NAME=<isi-sendiri>
ASSISTANT_ENGINE_ID=projects/<project>/locations/<region>/reasoningEngines/<id>
ASSISTANT_MODEL=gemini-3.8-flash
SCHEDULER_SA_EMAIL=<sa-scheduler>@<project>.iam.gserviceaccount.com
SCHEDULER_AUDIENCE=https://<url-aisa-api>
SIGNER_SERVICE_ACCOUNT=                             # opsional
```

## Keterbatasan

- **Bot WhatsApp terbuka untuk semua pengirim.** Siapa pun yang chat 1:1 bisa memakai semua
  perintah (termasuk `setuju`/`tolak`) dan bertanya ke Asisten. Tidak ada rate limit.
- **Pengirim dengan nomor tersembunyi (LID, `…@lid`) diabaikan**, karena balasan dikirim ke
  `<nomor>@s.whatsapp.net`.
- **Bahasa Asisten masih mengasumsikan satu manajer investasi**, juga saat yang bertanya
  orang lain.
- **Gemini 3.x hanya tersedia di location `global`** untuk project ini, sementara Agent
  Runtime dan Memory Bank berada di region; lokasi model dipisah di kode.
- **Deck harus PDF.** Deck berupa gambar dibaca lewat OCR Gemini, tetapi deck di atas 15 MB
  atau 50 halaman, OCR yang gagal, atau hasil yang tetap terlalu sedikit teks menjadi
  `perlu_dicek_manual` tanpa skor.
- **Menghapus proposal tidak mengurangi `dailyStats`**, jadi angka agregat harian tetap
  menghitung proposal yang sudah dihapus.
- **Satu deployment untuk satu tim.** Hanya ada satu `settings/rules`; tidak multi-tenant.
- **Data demo bisa ada.** `uv run aisa seed-demo --apply` menulis data fiktif berawalan
  `demo-`; hapus dengan `uv run aisa seed-demo --remove --apply`.

## Pembagian kontribusi anggota

### Pembagian Kontribusi Tim Aixel

- **Muhammad Fadhil Abbas (Hustler, Project Manager & Solution Engineer).** Memimpin proyek. Ia menyusun ruang lingkup, alur solusi, dan rubrik penilaian, mengatur jadwal tim, serta membuka dan menutup pitch.
- **Elang Fajar Buana (Hustler, Co-Founder & COO).** Memastikan masalahnya nyata dan solusinya layak didanai, berbekal pengalamannya sebagai investment analyst. Ia menyusun model bisnis, harga, dan validasi pasar, lalu menjawab pertanyaan bisnis dari juri.
- **Muhammad Martio Alanshori (Hipster, IT Business Development).** Mewakili sudut pandang pengguna. Ia merancang pengalaman di WhatsApp dan dashboard, menyusun analisis kompetitor, dan membawakan bagian masalah pengguna.
- **Yahya Alfon Sinaga (Hacker, Software Engineer).** Membangun AISA dari ujung ke ujung, mulai dari agen AI, integrasi Gemini, Cloud Run, dan Firestore sampai webhook WhatsApp. Ia juga menjalankan pengujian serta membawakan demo dan pertanyaan teknis.
