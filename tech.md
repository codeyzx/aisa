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
7. Bagian bertanda **[VERIFIKASI]** bisa berubah (nama model, API, endpoint). Cek dokumentasi resmi terbaru sebelum implementasi.
8. Catat penggunaan AI coding assistant di `docs/AI_USAGE.md` (TOR 6.3). Jangan commit secret, nomor WA asli, atau isi pitch deck.

---

## 2. Scope

**Masuk:**

- Intake proposal lewat Google Form → Drive, atau unggah PDF di dashboard (fungsi intake yang sama)
- Ekstraksi teks per halaman dan penilaian saat masuk (kualitas → cek kecocokan → kategori)
- Ringkasan WhatsApp pukul **09.00 dan 17.00** berisi proposal yang belum ditanggapi, dikelompokkan per kategori
- Perintah manajer di WhatsApp: tanggapi proposal, koreksi kategori, STOP
- Asisten tanya data dan saran
- Dashboard: Hari ini, Proposal + detail, Tren, Aktivitas AI, Riwayat, Pengaturan (ubah aturan penilaian), unggah PDF

**Tidak masuk:** saran tindak lanjut otomatis, audio/voice note, OCR, analisis mendalam/memo, banyak pengguna (hanya 1 manajer), pengiriman pesan ke founder, masking dokumen (dikerjakan terpisah), pencarian internet.

---

## 3. Arsitektur

```
 Founder ──▶ Google Form ──▶ Google Drive (pitch deck)
                  │ onFormSubmit (Apps Script)
                  ▼
 ┌──────────────────────────────────────────────┐      ┌────────────────┐
 │ Cloud Run · aisa-worker                       │      │ Cloud Scheduler│
 │  • intake: ekstrak teks → Penilai → simpan    │◀─────│ 09.00 & 17.00  │
 │  • digest: hitung → Insight → Ringkasan → kirim│      └────────────────┘
 └──────┬──────────────────────────┬────────────┘
        │ Gemini (Agent Platform)  │ kirim pesan
        ▼                          ▼
 ┌──────────────┐           ┌──────────────┐         ┌──────────────┐
 │  Firestore   │◀──────────│ Cloud Run ·  │◀───────▶│ GOWA (VPS)   │◀──▶ WhatsApp
 │ data & log   │           │ aisa-gateway │ webhook │              │     manajer
 └──────▲───────┘           │ perintah, API│         └──────────────┘
        │                   └──────┬───────┘
        │                          │ pertanyaan
 ┌──────┴───────┐           ┌──────▼─────────────────────────────┐
 │ Cloud Run ·  │           │ Agent Runtime · Asisten             │
 │ dashboard    │           │  + Sessions + Memory Bank           │
 └──────────────┘           │  + tools baca data                  │
                            └─────────────────────────────────────┘
 Firestore: aturan penilaian (rubrik, bobot, aturan kecocokan, batas kategori), diatur di halaman Pengaturan
```

### Unit yang dibangun

| Unit             | Tempat jalan             | Tanggung jawab                                                                                             |
| ---------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **aisa-worker**  | Cloud Run                | Intake & penilaian proposal, ringkasan terjadwal                                                           |
| **aisa-gateway** | Cloud Run                | Menerima webhook GOWA, menjalankan perintah manajer, meneruskan pertanyaan ke Asisten, API untuk dashboard |
| **Asisten**      | Agent Runtime            | Agent percakapan dengan Sessions, Memory Bank, dan tools baca data                                         |
| **Dashboard**    | Cloud Run                | Web app untuk manajer                                                                                      |
| **Pemicu form**  | Google Apps Script       | Memberi tahu worker saat ada proposal baru                                                                 |
| **GOWA**         | VPS tim (sudah berjalan) | Koneksi WhatsApp                                                                                           |

---

## 4. Tools dan layanan

| Kebutuhan                | Tool / layanan                                                               | Catatan                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Form proposal            | Google Forms                                                                 | Field minimal + pemberitahuan tujuan + persetujuan                                                                  |
| Penyimpanan pitch deck   | Google Drive                                                                 | Dibagikan ke service account                                                                                        |
| Pemicu proposal baru     | Google Apps Script (`onFormSubmit`)                                          | Panggilan ke worker diamankan dengan tanda tangan rahasia                                                           |
| Ekstraksi teks PDF       | Library Python ekstraksi teks PDF (mis. pypdf / pdfplumber) **[VERIFIKASI]** | Per halaman dengan penanda `[hal. n]`; tanpa OCR                                                                    |
| Framework agent          | Google Agent Development Kit (ADK), Python                                   | Pin versi stabil terbaru **[VERIFIKASI]**                                                                           |
| Model                    | Gemini lewat Gemini Enterprise Agent Platform                                | Lihat Bagian 6                                                                                                      |
| Hosting agent percakapan | Agent Runtime (dulu Agent Engine)                                            | **[VERIFIKASI]** cara deploy dan pemanggilan                                                                        |
| Konteks percakapan       | Sessions                                                                     | Satu session per hari untuk manajer                                                                                 |
| Ingatan preferensi       | Memory Bank                                                                  | Hanya preferensi manajer, bukan data proposal                                                                       |
| Layanan HTTP             | Cloud Run + FastAPI                                                          | Worker, gateway, dashboard                                                                                          |
| Jadwal                   | Cloud Scheduler                                                              | 09.00 dan 17.00, zona `Asia/Jakarta`                                                                                |
| Database                 | Firestore                                                                    | Proposal, penilaian, tanggapan, riwayat, log aktivitas, statistik harian                                            |
| Konfigurasi penilaian    | Firestore + halaman Pengaturan di dashboard                                  | Kriteria, bobot, patokan nilai, aturan kecocokan, batas kategori; berversi, setiap perubahan tercatat dengan alasan |
| Rahasia                  | Secret Manager                                                               | Kredensial GOWA, secret webhook, password dashboard                                                                 |
| WhatsApp                 | GOWA (REST API + webhook)                                                    | **[VERIFIKASI]** endpoint kirim pesan dan format webhook                                                            |
| Dashboard                | React + Vite (atau halaman server-rendered sederhana)                        | Data lewat API gateway                                                                                              |
| Logging & tracing        | Cloud Logging + Observability Agent Platform                                 | Pelengkap log Aktivitas AI di Firestore                                                                             |
| Testing                  | pytest                                                                       | Unit test logika penilaian dan perintah                                                                             |

Region Cloud Run dan Firestore: `asia-southeast2` (Jakarta). Model dan Agent Runtime di region yang tersedia **[VERIFIKASI]**.

---

## 5. Agent

| Agent                 | Tempat jalan  | Tugas                                                                    | Input → Output                                                                        |
| --------------------- | ------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| **Penilai**           | aisa-worker   | Menilai 5 kriteria kualitas dan mengekstrak profil (sektor, tahap, dana) | Teks per halaman + rubrik → nilai 1–5, kutipan halaman, tanda "tidak disebut", profil |
| **Insight**           | aisa-worker   | Menuliskan insight dari angka yang sudah dihitung                        | Kandidat insight (angka) → 3–4 kalimat                                                |
| **Pembuat ringkasan** | aisa-worker   | Merangkai teks ringkasan WhatsApp                                        | Data ringkasan (angka, daftar per kategori, insight) → teks pesan                     |
| **Asisten**           | Agent Runtime | Menjawab pertanyaan dan memberi saran                                    | Pesan + session + memory → jawaban, memakai tools baca                                |
| **Orchestrator**      | aisa-gateway  | Membedakan perintah dan pertanyaan                                       | Pesan → aksi (kode) atau diteruskan ke Asisten                                        |

**Aturan penting:**

- Penilai memakai **output terstruktur** (schema JSON) dan divalidasi kode; gagal validasi → coba ulang sekali → bila tetap gagal, status _Perlu dicek manual_.
- Pembuat ringkasan tidak boleh mengubah angka. Kode mengecek bahwa setiap angka di teks cocok dengan data; bila tidak, pakai template tanpa AI.
- Perintah penting (undang/pantau/arsipkan, koreksi kategori, STOP) **dikenali dengan kode**, tidak bergantung pada model.
- Asisten **hanya punya tools baca**: cari proposal dengan filter, hitung, detail proposal, bandingkan, riwayat, tren. Tidak ada tool tulis.
- Saran Asisten yang tidak berasal dari data proposal diberi label sebagai saran AI.

---

## 6. Strategi model

**Tahap awal (hackathon): stabil dulu.** Semua agent memakai model stabil yang sama:

| Agent                                                      | Model awal         |
| ---------------------------------------------------------- | ------------------ |
| Penilai, Insight, Pembuat ringkasan, Asisten, Orchestrator | `gemini-3.8-flash` |

- Bila kualitas penilaian kurang, Penilai boleh dinaikkan ke `gemini-3.1-pro-preview` (status preview).
- Setelah sistem stabil, agent ringan (Orchestrator, Ringkasan, Insight, Asisten) bisa dipindah ke `gemini-3.5-flash-lite` untuk efisiensi.
- Nama model disimpan sebagai konfigurasi, bukan ditulis di kode.
- **[VERIFIKASI]** ketersediaan nama model di Agent Platform dan region yang dipakai.

---

## 7. Alur utama

### A. Proposal masuk dan dinilai

1. Founder mengirim Form → Apps Script memanggil worker.
2. Worker mencatat proposal (idempoten berdasarkan ID file Drive).
3. Teks diekstrak per halaman. Teks terlalu sedikit → _Perlu dicek manual_, selesai.
4. **Penilai** menilai 5 kriteria dengan kutipan halaman.
5. Kode menghitung skor 0–100 dengan bobot dari aturan penilaian aktif (Firestore); versi aturan disimpan bersama hasil penilaian.
6. Kode menjalankan cek kecocokan (sektor, tahap, dana) dari aturan penilaian aktif.
7. Kode menentukan kategori dan tanda "Berkualitas, di luar fokus".
8. Hasil dan log aktivitas disimpan; statistik harian diperbarui.

### B. Ringkasan 09.00 dan 17.00

1. Cloud Scheduler memanggil worker.
2. Kode mengambil proposal yang **belum ditanggapi**, menghitung jumlah per kategori, dan mengurutkan berdasarkan skor.
3. Kode menghitung kandidat insight → **Insight** menuliskannya.
4. **Pembuat ringkasan** merangkai teks per kategori (Sangat cocok, Cocok, Kurang cocok, Tidak cocok, Berkualitas di luar fokus, Perlu dicek manual) → kode mengecek angka.
5. Pesan dikirim lewat GOWA. Tidak ada saran tindak lanjut.

### C. Pesan dari manajer

1. GOWA meneruskan pesan ke gateway (webhook terverifikasi; hanya nomor manajer yang dilayani; pesan ganda diabaikan).
2. **Orchestrator** mengenali perintah:
   - `undang / pantau / arsipkan <nama>` atau `... semua <kategori>` → ubah status tanggapan
   - `pindahkan <nama> ke <kategori> karena ...` → koreksi kategori (skor AI tetap disimpan)
   - `STOP` → hentikan pekerjaan yang sedang berjalan
3. Selain perintah → diteruskan ke **Asisten** (session hari ini + Memory Bank + tools baca).
4. Balasan dikirim lewat GOWA. Semua aksi tercatat di Riwayat.

### D. Dashboard

Membaca data lewat API gateway. Tombol tanggapan dan koreksi di dashboard memanggil **fungsi yang sama** dengan perintah WhatsApp, sehingga hasil dan catatannya identik.

---

## 8. Data yang disimpan (garis besar)

| Data                                                    | Disimpan di                                           |
| ------------------------------------------------------- | ----------------------------------------------------- |
| Proposal, hasil penilaian, kategori, tanggapan, koreksi | Firestore                                             |
| Log Aktivitas AI dan Riwayat (jejak audit)              | Firestore                                             |
| Ringkasan yang terkirim                                 | Firestore                                             |
| Statistik harian untuk tren dan token                   | Firestore                                             |
| Rubrik, bobot, aturan kecocokan, batas kategori         | Firestore (berversi, diubah lewat halaman Pengaturan) |
| Pitch deck asli                                         | Google Drive (tidak disalin ke tempat lain)           |
| Konteks percakapan                                      | Sessions                                              |
| Preferensi manajer                                      | Memory Bank                                           |

Skema rinci ditentukan saat implementasi.

---

## 9. Log Aktivitas AI

Semua agent menulis log dengan format seragam:

> **waktu · agent · model · aksi · tool · data dibaca/ditulis · token masuk/keluar · durasi · status**

- Log dikelompokkan per pekerjaan (mis. "Menilai proposal Tani Maju", "Ringkasan 09.00"), masing-masing berisi langkah-langkahnya.
- **Nama model ditampilkan**. Langkah yang dikerjakan kode diberi label "kode" dengan token 0.
- Token diambil dari `usage_metadata` setiap respons model.
- Dashboard menampilkan total token **per proposal, per ringkasan, dan per hari**.

---

## 10. Keamanan dan pelindungan data

- Secret hanya di Secret Manager; tidak ada nilai rahasia di repo.
- Gateway hanya melayani nomor manajer; webhook GOWA dan panggilan dari Apps Script wajib terverifikasi; endpoint terjadwal hanya menerima panggilan dari Cloud Scheduler.
- Hanya **teks** pitch deck yang dikirim ke model; gambar dan file PDF tidak.
- Data founder (kontak) tidak dikirim ke WhatsApp dan tidak masuk prompt.
- Data tidak dipakai untuk melatih model.
- Proposal yang diarsipkan dihapus setelah periode retensi atau atas permintaan founder (mekanisme penghapusan bisa sederhana untuk hackathon).
- Dashboard dilindungi password sederhana (1 pengguna).

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
