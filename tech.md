# AISA — Dokumen Teknis

> Untuk Claude Code dan tim developer. Dibaca setelah **dokumen overview project** (masalah, pengguna, aturan penilaian, use case).
> Dokumen ini menjelaskan **komponen, tools, dan alur sistem** secara garis besar. Detail kode, skema data, dan prompt diputuskan saat implementasi.
>
> Versi: draft 2 · 21 Oktober 2026 · Agentic AI Hackathon ITB 2026 (hacking 24 jam, freeze Kamis 22 Okt 13.00 WIB)

---

## 1. Prinsip implementasi

1. **Jalan dulu, efisien kemudian.** Prioritas pertama adalah alur utama berjalan stabil ujung ke ujung. Optimasi biaya dan model dilakukan setelahnya.
2. **AI menilai, kode menghitung.** Model hanya memberi nilai 1–5 per kriteria, alasan, dan teks. Skor, kategori, cek kecocokan, jumlah, dan tren dihitung dengan kode.
3. **Setiap proposal dinilai sekali.** Ringkasan, dashboard, dan asisten membaca hasil yang tersimpan, bukan menilai ulang.
4. **Tidak mengarang.** Informasi yang tidak ada ditandai "tidak disebut"; deck yang tidak terbaca menjadi "Perlu dicek manual".
5. **Keputusan di tangan manusia.** AI tidak mengundang, mengarsipkan, atau mengirim pesan ke founder. Semua tanggapan berasal dari perintah manajer.
6. **Semua langkah tercatat** dalam log Aktivitas AI dengan format seragam.
7. Nama model, API, dan endpoint di dokumen ini mengikuti kode di `services/api`; bila berbeda, kode yang benar.
8. Catat penggunaan AI coding assistant di `docs/AI_USAGE.md` (TOR 6.3). Jangan commit secret, nomor WA asli, atau isi pitch deck.

---

## 2. Scope

**Masuk:**

- Intake proposal lewat Google Form → Drive, atau unggah PDF di dashboard (fungsi intake yang sama)
- Ekstraksi teks per halaman dan penilaian saat masuk (kualitas → cek kecocokan → kategori)
- Ringkasan WhatsApp pukul **09.00 dan 17.00** berisi proposal yang belum ditanggapi, dikelompokkan per kategori
- Perintah manajer di WhatsApp: tanggapi proposal, koreksi kategori, STOP/LANJUT
- Asisten tanya data dan saran
- Dashboard: Dashboard (beranda), Proposal + detail, Tren, Aktivitas AI, Riwayat, Aturan penilaian (lihat, ubah dengan pratinjau dampak, kalibrasi), Pengaturan (profil, tampilan, ringkasan, integrasi dan STOP/LANJUT, privasi dan retensi), panel Tanya AISA ke Asisten, unggah PDF, hapus data atas permintaan founder
- Retensi harian: proposal yang diarsipkan lebih lama dari periode retensi dihapus

**Tidak masuk:** saran tindak lanjut otomatis, audio/voice note, OCR, analisis mendalam/memo, banyak pengguna (hanya 1 manajer), pengiriman pesan ke founder, masking dokumen (dikerjakan terpisah), pencarian internet.

---

## 3. Arsitektur

```
 Founder ──▶ Google Form ──▶ Google Drive (pitch deck)
                  │ onFormSubmit (Apps Script, HMAC)
                  ▼
 ┌─────────────────────────────────────────────┐     ┌──────────────────┐
 │ Cloud Run · aisa-api (asia-southeast2)      │◀────│ Cloud Scheduler  │
 │  • intake: ekstrak teks → Penilai → simpan  │OIDC │ 09.00 & 17.00    │
 │  • digest: hitung → Insight → Ringkasan     │     │ retensi 02.00    │
 │  • webhook GOWA: perintah (kode) / Asisten  │     └──────────────────┘
 │  • API tulis dashboard, hapus data, retensi │◀───────▶ GOWA (VPS) ◀──▶ WhatsApp
 └───┬──────────────┬───────────────┬──────────┘ webhook            manajer
     │ Gemini       │ tulis         │ pertanyaan
     │ (global)     ▼               ▼
     │       ┌──────────────┐  ┌─────────────────────────────────┐
     │       │ Firestore    │  │ Agent Runtime · Asisten         │
     │       │ data, aturan,│  │ (us-central1) Sessions,         │
     │       │ log          │  │ Memory Bank, tools baca data    │
     │       └──────▲───────┘  └─────────────────────────────────┘
     │              │ baca (Admin SDK)
     │       ┌──────┴───────────────────┐
     │       │ Cloud Run · dashboard    │── tulis lewat aisa-api
     │       │ (Next.js, Firebase Auth) │
     │       └──────────────────────────┘
     ▼
 GCS: deck unggahan
```

### Unit yang dibangun

| Unit            | Tempat jalan             | Tanggung jawab                                                                                                                     |
| --------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **aisa-api**    | Cloud Run                | Intake & penilaian, ringkasan terjadwal, webhook GOWA (perintah + meneruskan ke Asisten), API tulis dashboard, hapus data, retensi |
| **Asisten**     | Agent Runtime            | Agent percakapan dengan Sessions, Memory Bank, dan tools baca data                                                                 |
| **Dashboard**   | Cloud Run (Next.js)      | Web app manajer; membaca Firestore langsung lewat Admin SDK, semua penulisan lewat aisa-api                                        |
| **Pemicu form** | Google Apps Script       | Memberi tahu aisa-api saat ada proposal baru                                                                                       |
| **GOWA**        | VPS tim (sudah berjalan) | Koneksi WhatsApp                                                                                                                   |

---

## 4. Tools dan layanan

| Kebutuhan                | Tool / layanan                                | Catatan                                                                                                              |
| ------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Form proposal            | Google Forms                                  | Field minimal + pemberitahuan tujuan + persetujuan                                                                   |
| Penyimpanan pitch deck   | Google Drive                                  | Dibagikan ke service account                                                                                         |
| Pemicu proposal baru     | Google Apps Script (`onFormSubmit`)           | Panggilan ke aisa-api ditandatangani HMAC (`X-AISA-Signature`)                                                       |
| Ekstraksi teks PDF       | pypdf                                         | Per halaman dengan penanda `[hal. n]`; tanpa OCR                                                                     |
| Framework agent          | Google Agent Development Kit (ADK), Python    | `google-adk>=2.12.0`                                                                                                 |
| Model                    | Gemini lewat Gemini Enterprise Agent Platform | Lokasi `global`; lihat Bagian 6                                                                                      |
| Hosting agent percakapan | Agent Runtime (dulu Agent Engine)             | Deploy dengan `deploy_assistant.py` lewat `vertexai` Client `agent_engines` (create/update); dipanggil dari aisa-api |
| Konteks percakapan       | Sessions                                      | Satu session per hari per nomor manajer, dan per percakapan Tanya AISA di dashboard                                  |
| Ingatan preferensi       | Memory Bank                                   | Hanya preferensi manajer, bukan data proposal                                                                        |
| Layanan HTTP             | Cloud Run + FastAPI                           | Satu layanan `aisa-api`                                                                                              |
| Jadwal                   | Cloud Scheduler                               | Ringkasan 09.00 dan 17.00, retensi `aisa-retensi` 02.00; zona `Asia/Jakarta`; token OIDC                             |
| Database                 | Firestore                                     | Proposal, penilaian, tanggapan, riwayat, log aktivitas, statistik harian                                             |
| Konfigurasi penilaian    | Firestore + halaman Aturan penilaian          | Kriteria, bobot, patokan nilai, aturan kecocokan, batas kategori; berversi, setiap perubahan tercatat dengan alasan  |
| Rahasia                  | Secret Manager                                | Kredensial GOWA, secret webhook, secret intake, kunci API internal                                                   |
| WhatsApp                 | GOWA v9.3.1 (REST API + webhook)              | Kirim: `POST /send/message` dengan `X-Device-Id`; webhook bertanda `X-Hub-Signature-256` (HMAC-SHA256)               |
| Dashboard                | Next.js di Cloud Run                          | Baca Firestore lewat Admin SDK; tulis lewat aisa-api; login Firebase Auth email/password (1 akun)                    |
| Logging & tracing        | Cloud Logging + Observability Agent Platform  | Pelengkap log Aktivitas AI di Firestore                                                                              |
| Testing                  | pytest                                        | Unit test logika penilaian dan perintah                                                                              |

Region: Cloud Run dan Firestore `asia-southeast2` (Jakarta); Agent Runtime `us-central1`; Gemini di lokasi `global`, satu-satunya lokasi yang melayani Gemini 3.x untuk project ini.

---

## 5. Agent

| Agent                 | Tempat jalan  | Tugas                                                                    | Input → Output                                                                        |
| --------------------- | ------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| **Penilai**           | aisa-api      | Menilai 5 kriteria kualitas dan mengekstrak profil (sektor, tahap, dana) | Teks per halaman + rubrik → nilai 1–5, kutipan halaman, tanda "tidak disebut", profil |
| **Insight**           | aisa-api      | Menuliskan insight dari angka yang sudah dihitung                        | Kandidat insight (angka) → 1–2 kalimat berlabel "Yang menarik:"                       |
| **Pembuat ringkasan** | aisa-api      | Merangkai teks ringkasan WhatsApp                                        | Data ringkasan (angka, daftar per kategori, insight) → teks pesan                     |
| **Asisten**           | Agent Runtime | Menjawab pertanyaan dan memberi saran                                    | Pesan + session + memory → jawaban, memakai tools baca                                |
| **Orchestrator**      | aisa-api      | Kode, tanpa model: mengenali perintah                                    | Pesan → aksi (kode) atau diteruskan ke Asisten                                        |

**Aturan penting:**

- Penilai memakai **output terstruktur** (schema JSON) dan divalidasi kode; gagal validasi → coba ulang sekali → bila tetap gagal, status _Perlu dicek manual_.
- Pembuat ringkasan tidak boleh mengubah angka. Kode mengecek bahwa setiap angka di teks cocok dengan data; bila tidak, pakai template tanpa AI.
- Perintah (undang/pantau/arsipkan, koreksi kategori, STOP, LANJUT) **dikenali dengan kode**; tidak ada model Orchestrator. Pesan lain diteruskan ke Asisten, kecuali saat dijeda: dibalas "AISA sedang dijeda".
- Kode memeriksa setiap kutipan Penilai di halaman yang disebut; bila tidak ada kutipan sebuah kriteria yang terverifikasi, nilainya dibatasi 2 dan kriteria ditandai `citationsUnverified`.
- Insight dibatasi 1–2 kalimat dan label "Yang menarik:" dipastikan oleh kode. Kode selalu memilih satu fakta (tren sektor dulu, lalu urutan cadangan di overview §4), sehingga setiap ringkasan memuat insight selama ada proposal.
- Asisten **hanya punya tools baca**: gambaran semua proposal, cari proposal dengan filter (termasuk dana minimum/maksimum), hitung, detail proposal, bandingkan, riwayat, tren, aturan. Tidak ada tool tulis.
- Setiap angka dalam jawaban disalin dari hasil tool pada giliran itu. Prioritas, risiko, rekomendasi, dan draft pesan seluruhnya berada di bawah label "💡 Saran AI".

---

## 6. Strategi model

**Tahap awal (hackathon): stabil dulu.** Semua agent memakai model stabil yang sama:

| Agent                                        | Model awal          |
| -------------------------------------------- | ------------------- |
| Penilai, Insight, Pembuat ringkasan, Asisten | `gemini-3.8-flash`  |
| Orchestrator                                 | (kode), tanpa model |

- Bila kualitas penilaian kurang, Penilai boleh dinaikkan ke `gemini-3.1-pro-preview` (status preview).
- Setelah sistem stabil, agent ringan (Ringkasan, Insight, Asisten) bisa dipindah ke `gemini-3.5-flash-lite` untuk efisiensi.
- Nama model disimpan di aturan penilaian (`rules.models`) dan diubah di halaman Aturan penilaian. `rules.models.asisten` hanya informasi: model Asisten ditetapkan saat deploy ke Agent Runtime.
- Gemini dipanggil di lokasi `global`.

---

## 7. Alur utama

### A. Proposal masuk dan dinilai

1. Founder mengirim Form → Apps Script memanggil aisa-api (atau manajer mengunggah PDF di dashboard; deck disimpan di GCS).
2. aisa-api mencatat proposal (idempoten berdasarkan ID file Drive).
3. Teks diekstrak per halaman. Teks terlalu sedikit → _Perlu dicek manual_, selesai.
4. **Penilai** menilai 5 kriteria dengan kutipan halaman; kode memverifikasi kutipan.
5. Kode menghitung skor 0–100 dengan bobot dari aturan penilaian aktif (Firestore); versi aturan disimpan bersama hasil penilaian.
6. Kode menjalankan cek kecocokan (sektor, tahap, dana) dari aturan penilaian aktif; butir yang tidak disebut gagal.
7. Kode menentukan kategori dan tanda "Berkualitas, di luar fokus".
8. Hasil dan log aktivitas disimpan; statistik harian diperbarui.

### B. Ringkasan 09.00 dan 17.00

1. Cloud Scheduler memanggil aisa-api (token OIDC).
2. Kode mengambil proposal yang **belum ditanggapi**, menghitung jumlah per kategori, dan mengurutkan berdasarkan skor.
3. Kode menghitung kandidat insight → **Insight** menuliskannya.
4. **Pembuat ringkasan** merangkai teks per kategori (Sangat cocok, Cocok, Kurang cocok, Tidak cocok, Berkualitas di luar fokus, Perlu dicek manual) → kode mengecek angka.
5. Pesan dikirim lewat GOWA, dibuka dengan salam sesuai jam kirim (Selamat pagi/siang/sore/malam) dan nama manajer bila `MANAGER_NAME` diatur. Tidak ada saran tindak lanjut.

### C. Pesan dari manajer

1. GOWA meneruskan pesan ke aisa-api (webhook terverifikasi; hanya nomor manajer yang dilayani; pesan ganda diabaikan).
2. Kode mengenali perintah:
   - `undang / pantau / arsipkan <nama>` atau `... semua <kategori>` → ubah status tanggapan
   - `pindahkan <nama> ke <kategori> karena ...` → koreksi kategori (skor AI tetap disimpan)
   - `STOP` → jeda: berhenti di antara langkah; panggilan model yang sedang berjalan diselesaikan lalu hasilnya dibuang. `LANJUT` → lanjutkan
3. Selain perintah → diteruskan ke **Asisten** (session hari ini + Memory Bank + tools baca). Saat dijeda, Asisten tidak dipanggil; balasannya "AISA sedang dijeda".
4. Balasan dikirim lewat GOWA. Semua aksi tercatat di Riwayat.

### D. Dashboard

Membaca Firestore langsung lewat Admin SDK; semua penulisan lewat aisa-api. Tombol tanggapan dan koreksi di dashboard memanggil **fungsi yang sama** dengan perintah WhatsApp, sehingga hasil dan catatannya identik. Panel **Tanya AISA** mengirim pertanyaan ke Asisten yang sama lewat `POST /api/assistant/ask` (cek STOP dan job `asisten` sama dengan WhatsApp, tanpa pesan GOWA, perintah tidak diproses di sana).

### E. Penghapusan data dan retensi

1. **Atas permintaan founder:** tombol "Hapus data" di dashboard (`DELETE /api/proposals/{id}`, alasan wajib) atau CLI `aisa delete-proposal`.
2. **Retensi:** Cloud Scheduler `aisa-retensi` setiap hari pukul 02.00 WIB memanggil `POST /retention/run`, yang menghapus proposal bertanggapan arsipkan lebih lama dari `rules.retentionDays` (default 90).
3. Yang dihapus: dokumen proposal, `proposalTexts`, deck di GCS, pekerjaan penilaiannya beserta langkahnya, dan konfirmasi tertunda yang menyebutnya. Baris Riwayat dipertahankan tetapi disamarkan (nama menjadi "(dihapus)", sebelum/sesudah dibuang), dan satu baris `proposal_dihapus` dicatat.

---

## 8. Data yang disimpan (garis besar)

| Data                                                    | Disimpan di                                             |
| ------------------------------------------------------- | ------------------------------------------------------- |
| Proposal, hasil penilaian, kategori, tanggapan, koreksi | Firestore                                               |
| Log Aktivitas AI dan Riwayat (jejak audit)              | Firestore                                               |
| Ringkasan yang terkirim                                 | Firestore                                               |
| Statistik harian untuk tren dan token                   | Firestore                                               |
| Rubrik, bobot, aturan kecocokan, batas kategori         | Firestore (berversi, diubah lewat Aturan penilaian)     |
| Teks deck per halaman (`proposalTexts`)                 | Firestore (ikut dihapus saat penghapusan/retensi)       |
| Pitch deck dari Form                                    | Google Drive (tidak disalin ke tempat lain)             |
| Pitch deck unggahan dashboard                           | Bucket GCS deck (ikut dihapus saat penghapusan/retensi) |
| Konteks percakapan                                      | Sessions                                                |
| Preferensi manajer                                      | Memory Bank                                             |

Skema rinci: `docs/reference/contracts/aisa-firestore.md`.

---

## 9. Log Aktivitas AI

Semua agent menulis log dengan format seragam:

> **waktu · agent · model · aksi · tool · data dibaca/ditulis · token masuk/keluar · durasi · status**

- Log dikelompokkan per pekerjaan (mis. "Menilai proposal Tani Maju", "Ringkasan 09.00"), masing-masing berisi langkah-langkahnya.
- **Nama model ditampilkan**. Langkah yang dikerjakan kode diberi label "kode" dengan token 0.
- Token diambil dari `usage_metadata` setiap respons model.
- Dashboard menampilkan total token **per proposal, per ringkasan, dan per hari**.
- Pekerjaan Asisten mencatat satu langkah untuk setiap pemanggilan tool.

---

## 10. Keamanan dan pelindungan data

- Secret hanya di Secret Manager; tidak ada nilai rahasia di repo.
- aisa-api hanya melayani nomor manajer; webhook GOWA dan panggilan dari Apps Script wajib terverifikasi (HMAC).
- Endpoint terjadwal (ringkasan, retensi) menerima token OIDC dari service account runtime, diverifikasi email dan audience-nya; tidak ada kunci yang disimpan di Cloud Scheduler. `X-AISA-Key` tetap diterima untuk panggilan manual dan dashboard.
- Hanya **teks** pitch deck yang dikirim ke model; gambar dan file PDF tidak.
- Data founder (kontak) tidak dikirim ke WhatsApp dan tidak masuk prompt.
- Data tidak dipakai untuk melatih model.
- Proposal yang diarsipkan dihapus setelah periode retensi atau atas permintaan founder (Bagian 7E).
- Dashboard dilindungi login Firebase Auth email/password (1 akun).
- **Keterbatasan:** Asisten di Agent Runtime berjalan sebagai service account runtime (`hackathon-runtime`), yang punya IAM baca-tulis Firestore. Jaminan baca-saja Asisten ada di kode (tidak ada tool tulis), bukan di IAM. Service account khusus `aisa-assistant@hackathon-primestep-09.iam.gserviceaccount.com` sudah dibuat tetapi belum dipakai: pemberian `roles/datastore.viewer` (dan `roles/aiplatform.user`) membutuhkan admin IAM project, lalu Asisten dideploy ulang dengan `ASSISTANT_SERVICE_ACCOUNT` diisi akun itu.

Pemetaan ke UU 27/2022 Pasal 16 ayat 2 ada di dokumen overview.

---

## 12. Pengujian

**Unit test wajib:** perhitungan skor, penentuan kategori (semua cabang termasuk "berkualitas di luar fokus"), cek kecocokan, pengenalan perintah, pengecekan angka di ringkasan.

**Skenario uji** (dicatat di `docs/TESTING.md` dengan hasil aktual dari log, bukan karangan):

| ID  | Skenario                                                                        |
| --- | ------------------------------------------------------------------------------- |
| T01 | Proposal sesuai fokus masuk → dinilai → kategori benar                          |
| T02 | Proposal di luar fokus dengan kualitas tinggi → Tidak cocok + tanda berkualitas |
| T03 | Deck hasil scan → Perlu dicek manual tanpa skor                                 |
| T04 | Ringkasan 09.00 terkirim otomatis, angka cocok dengan data                      |
| T05 | `undang <nama>` dan `arsipkan semua tidak cocok` → status berubah               |
| T06 | Koreksi kategori lewat WA dan dashboard → skor AI tetap, tercatat               |
| T07 | Pertanyaan data → jawaban cocok dengan data tersimpan                           |
| T08 | Pertanyaan di luar data → dijawab "tidak tersedia"                              |
| T09 | Pertanyaan lanjutan dalam satu session                                          |
| T10 | STOP saat penilaian berjalan                                                    |
| T11 | Webhook ganda → diproses sekali                                                 |
