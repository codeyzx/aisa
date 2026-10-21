# Penerimaan di produksi lewat API dan webhook — matriks penerimaan

Penguji: agent penguji (bukan penulis kodenya). Matriks ditulis dari `services/api/README.md`
(tabel rute, "Deleting a proposal", perintah WhatsApp), `GLOSSARY.md`, `tech.md` §E, dan
celah di [`inventaris-fitur.md`](inventaris-fitur.md). `aisa/orchestrator.py` dan
`aisa/commands.py` dibaca sebelum drive hanya untuk memilih nama uji yang tidak bentrok dengan
pencocokan nama; hasil di bawah adalah respons, dokumen Firestore, dan chat GOWA yang terbaca
ulang.

## Setup

| Hal                  | Nilai                                                                                                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lingkungan           | produksi, `aisa-api` revisi `aisa-api-00007-54h` (image `aisa-api:20261021-133058`, `asia-southeast2`), sama di awal dan akhir putaran                                                                                                                    |
| Asisten              | engine `projects/441293875661/locations/us-central1/reasoningEngines/7155459220723204096` (tidak dipanggil di putaran ini)                                                                                                                                |
| Aturan penilaian     | versi 1 (`settings/rules`), tidak diubah                                                                                                                                                                                                                  |
| Waktu                | Rabu 21 Oktober 2026, 21.40–21.51 WIB (14.40–14.51 UTC)                                                                                                                                                                                                   |
| `MANAGER_PHONES`     | satu nomor, berakhiran …2356 (secret `manager-phones`)                                                                                                                                                                                                    |
| Jalur WhatsApp       | `POST /webhook/gowa` bertanda tangan `X-Hub-Signature-256` sah, `payload.id` unik `QA-…`; balasan dibaca dari `GET /chat/<manajer>/messages` di GOWA                                                                                                      |
| Anggaran pesan WA    | 20 balasan. **Terpakai 12** (16 webhook dikirim: 12 berbalas, 4 sengaja tanpa balasan — duplikat, bukan manajer, grup, tanda tangan salah)                                                                                                                |
| Ringkasan            | hanya pratinjau `dryRun=true`; tidak ada slot yang terpakai                                                                                                                                                                                               |
| Data uji             | deck sintetis startup fiktif berawalan "QA " (fpdf2), dibuat ulang setiap putaran; tidak ada deck, nama, atau kontak sungguhan                                                                                                                            |
| Skrip dan log mentah | `/tmp/claude-1000/-home-codeyzx-work-hackathon-aisa/59e19ace-403c-486b-b5ce-fe6136dd8397/scratchpad/qa-prod/` (`qa.py`, `wa.py`, `fsread.py`, `cascade.py`, `log.jsonl`); rahasia diambil dari Secret Manager saat jalan, tidak dicetak dan tidak ditulis |

## Matriks

| ID     | Aksi (lewat)                                                                         | Diharapkan                                                                    | Cek Firestore / efek keluar                                                      |
| ------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| UNG-01 | Unggah deck QA (`POST /intake/upload`)                                               | 202, lalu `dinilai` dengan skor, kategori, token                              | `proposals`, `jobs` + `steps`, `history` `proposal_masuk`, deck di GCS           |
| UNG-02 | Unggah PDF yang sama lagi dengan nama lain                                           | `created: false`, tidak dinilai ulang                                         | satu pekerjaan, nama dan skor tetap                                              |
| UNG-03 | Unggah tanpa `X-AISA-Key`                                                            | 401                                                                           | tidak ada proposal                                                               |
| UNG-04 | Unggah berkas bukan PDF                                                              | 422                                                                           | tidak ada proposal                                                               |
| UNG-05 | Unggah > 20 MB                                                                       | 413                                                                           | tidak ada proposal                                                               |
| FRM-01 | Isi Google Form sungguhan (bukti yang sudah ada, tidak dikirim ulang)                | proposal `form-…` dinilai dari Drive                                          | `proposals/form-…`, pekerjaan penilaian                                          |
| FRM-02 | `/intake/form` bertanda tangan sah, `consent: false`                                 | 422                                                                           | tidak ada `form-QA-fake-drive-id-0001`                                           |
| FRM-03 | `/intake/form` tanda tangan salah / tanpa tanda tangan                               | 401                                                                           | tidak ada proposal                                                               |
| FRM-04 | `/intake/form` bertanda tangan, body tanpa `driveFileId`                             | 422                                                                           | tidak ada proposal                                                               |
| EKS-01 | Unggah deck scan (gambar saja)                                                       | `perlu_dicek_manual`, tanpa skor, 0 token, `job.model` null                   | `statusReason`, `tokens`, pekerjaan tanpa langkah model                          |
| PWA-01 | WA `undang QA Tambak Cerdas`                                                         | "Tercatat: … → undang."                                                       | `response` {undang, wa}, riwayat `tanggapan`; 1 balasan                          |
| PWA-02 | WA `pantau QA Roti Lembah`                                                           | "Tercatat: … → pantau."                                                       | idem; 1 balasan                                                                  |
| PWA-03 | WA `arsipkan QA Arsip Pindaian` (proposal Perlu dicek manual)                        | "Tercatat: … → arsipkan."                                                     | idem; 1 balasan                                                                  |
| PWA-04 | WA `undang Xqzpt Vlombr` (nama tidak ada)                                            | balasan "tidak ditemukan", tidak ada yang berubah                             | 1 balasan                                                                        |
| PWA-05 | WA `pindahkan … ke sangat cocok` tanpa `karena`                                      | balasan minta alasan, tidak ada koreksi                                       | `correction` tetap null; 1 balasan                                               |
| PWA-06 | WA `pindahkan … ke sangat cocok karena …`                                            | skor tetap, `effectiveCategory` berubah, `category` tetap                     | `correction`, riwayat `koreksi`; 1 balasan                                       |
| PWA-07 | WA `pantau semua kurang cocok` (kategori yang hanya berisi proposal QA)              | daftar konfirmasi hanya nama QA                                               | `pendingConfirmations/<manajer>`; 1 balasan                                      |
| PWA-08 | WA `YA`                                                                              | "Selesai: 2 proposal ditandai pantau."                                        | konfirmasi terhapus, riwayat `tanggapan_massal`; 1 balasan                       |
| PWA-09 | WA `YA` tanpa perintah tertunda                                                      | "Tidak ada perintah yang menunggu konfirmasi."                                | 1 balasan                                                                        |
| PWA-10 | Webhook yang sama dua kali (`payload.id` sama)                                       | kedua `{"ignored": "duplikat"}`, satu balasan                                 | satu `webhookEvents`, satu pekerjaan                                             |
| PWA-11 | WA `STOP`                                                                            | balasan jeda                                                                  | `settings/runtime.paused` true via wa; 1 balasan                                 |
| PWA-12 | Unggah deck QA saat dijeda                                                           | tetap `antre`, tanpa pekerjaan                                                | `jobId` null                                                                     |
| PWA-13 | WA pertanyaan biasa saat dijeda                                                      | "AISA sedang dijeda (STOP). Kirim LANJUT untuk melanjutkan."                  | tidak ada pekerjaan `asisten` baru; 1 balasan                                    |
| PWA-14 | WA `LANJUT`                                                                          | balasan lanjut, antrean dinilai                                               | `paused` false; proposal antre → `dinilai`; 1 balasan                            |
| PWA-15 | Webhook bertanda tangan dari nomor bukan manajer                                     | `{"ignored": …}`, tanpa balasan                                               | tanpa `webhookEvents`, tanpa pekerjaan, chat nomor itu kosong                    |
| PWA-16 | Webhook bertanda tangan dari manajer di grup (`…@g.us`)                              | `{"ignored": "grup"}`, tanpa balasan                                          | tanpa `webhookEvents`, tanpa pekerjaan                                           |
| RKS-01 | `POST /digest/run?slot=09.00&dryRun=true` dengan kunci                               | teks + `counts` sama dengan hitungan Firestore; tidak menulis, tidak mengirim | `digests` dan pekerjaan `ringkasan` tidak bertambah; tidak ada pesan GOWA baru   |
| RET-01 | `POST /retention/run` dengan kunci                                                   | `deleted: 0` (tidak ada arsip > 90 hari)                                      | pekerjaan `perintah` "Retensi otomatis 90 hari"                                  |
| DSB-01 | `DELETE /api/proposals/{id}` pada proposal QA yang punya tanggapan, koreksi, riwayat | semua turunan terhapus, riwayat disamarkan, satu baris `proposal_dihapus`     | `proposals`, `proposalTexts`, GCS, `jobs` + `steps`, `history`, nama di mana pun |
| KAM-01 | Rute dashboard tanpa kunci / kunci salah                                             | 401                                                                           | —                                                                                |
| KAM-02 | `/digest/run`, `/retention/run` tanpa kunci, kunci salah, bearer palsu               | 401                                                                           | —                                                                                |
| KAM-03 | `/webhook/gowa` tanda tangan salah                                                   | 401, tanpa balasan                                                            | tanpa `webhookEvents`                                                            |

Tes otomatis: semua baris di atas hanya bisa dibuktikan live (Gemini, GOWA, Firestore produksi);
tidak ada tes otomatis yang lahir dari putaran ini.

## Hasil drive

Waktu balasan adalah stempel waktu GOWA (UTC). ID pesan GOWA adalah balasan yang terbaca di chat
manajer.

| ID     | Hasil    | Teks persis / nilai Firestore / ID bukti                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UNG-01 | Lulus    | Empat unggahan 202 `created: true`, semua `dinilai`: `upload-8522089c3a7c87e7` QA Tambak Cerdas **68,1 Cocok** (fit lulus ketiganya, 2.829/6.778 token, `penilaian-20261021144220-b43af5`: 7 langkah, 1 model `gemini-3.8-flash`, 6 kode bertoken 0, 48,9 dtk); `upload-e33a0262c018d998` QA Bengkel Surya 63,1 Kurang cocok (2.756/2.730); `upload-9421dfea055e1253` QA Pasar Desa Digital 63,1 Kurang cocok (2.783/1.723); `upload-e6c90420af01a4ac` QA Roti Lembah 56,2 Tidak cocok (2.786/9.625, 71 dtk). Token proposal = token pekerjaannya. Deck ada di `gs://hackathon-primestep-09-aisa-decks/decks/<id>.pdf`. Riwayat `proposal_masuk` via sistem |
| UNG-02 | Lulus    | Deck Tambak Cerdas diunggah ulang dengan nama "QA Tambak Cerdas Ulang": 202 `{"proposalId": "upload-8522089c3a7c87e7", "created": false}`. Nama tetap "QA Tambak Cerdas", skor 68,1, tetap satu pekerjaan                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| UNG-03 | Lulus    | 401 `{"detail": "kunci tidak valid"}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| UNG-04 | Lulus    | 422 `{"detail": "berkas bukan PDF"}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| UNG-05 | Lulus    | 413 `{"detail": "PDF lebih dari 20 MB"}` (berkas `%PDF` 20 MB + 19 byte)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FRM-01 | Lulus    | Bukti yang ada, tidak dikirim ulang: `form-1rWuWabfjDz8ytPCVRvuokSWsfbu_BIVf` "Saku Hukum", `dinilai` 63,1 Tidak cocok, 4.809/3.600 token. Pekerjaan pertama `penilaian-20261021141253-9fb403` **gagal** di langkah "Ambil pitch deck" (1 langkah, 0 token); pekerjaan kedua `penilaian-20261021141442-a69d76` selesai, 8 langkah dimulai "Ambil pitch deck" dari Drive                                                                                                                                                                                                                                                                                     |
| FRM-02 | Lulus    | 422 `{"detail": "proposal tanpa persetujuan tidak diproses"}`; tidak ada proposal `form-QA-fake-drive-id-0001`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FRM-03 | Lulus    | Tanda tangan salah dan tanpa header: keduanya 401 `{"detail": "tanda tangan tidak valid"}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| FRM-04 | Lulus    | 422 `"body tidak valid: 2 validation errors for FormIntake …"` (detail pydantic mentah dikembalikan ke pemanggil)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| EKS-01 | Lulus    | `upload-06e131460a238173` QA Arsip Pindaian: `perlu_dicek_manual`, `statusReason` "teks terlalu sedikit (0 karakter di 4 halaman)", `assessment`/`category`/`fit` null, `tokens` 0/0. Pekerjaan `penilaian-20261021144035-83af32`: `model` **null**, 2 langkah kode, 165 ms — label model pada pekerjaan tanpa panggilan model (catatan 8 di `TESTING.md`) sudah tidak terjadi                                                                                                                                                                                                                                                                              |
| PWA-01 | Lulus    | 14.44.56 `3EB0ECF19576561075425B` "Tercatat: QA Tambak Cerdas → undang." `response` {undang, via wa}, `responded` true, riwayat `SkJRP6Gc8IgXiu9L0Bb7`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| PWA-02 | Lulus    | 14.45.07 `3EB0A464F175AF193DEDE7` "Tercatat: QA Roti Lembah → pantau." Riwayat `2MIgVY8FTVzVJPiuAlf6`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| PWA-03 | Lulus    | 14.45.18 `3EB066E44E5D97E622973A` "Tercatat: QA Arsip Pindaian → arsipkan." Tanggapan diterima untuk proposal Perlu dicek manual. Riwayat `NKIwedNfDYrSpF1L8ZeY`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| PWA-04 | Lulus    | 14.45.38 `3EB062B5AC7D3C51E82D16` "Proposal \"Xqzpt Vlombr\" tidak ditemukan. Tidak ada yang diubah." Pekerjaan `perintah-20261021144538-74425d` selesai                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| PWA-05 | Lulus    | 14.46.04 `3EB01489E6867F529F6CF4` "Koreksi kategori perlu alasan. Contoh: pindahkan QA Tambak Cerdas ke sangat cocok karena <alasan>". `correction` tetap null, `effectiveCategory` tetap cocok                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| PWA-06 | Lulus    | 14.46.16 `3EB0EC1B8FB2E2F935D11D` "Kategori QA Tambak Cerdas dipindahkan ke Sangat cocok. Skor kualitas tetap 68,1." Skor 68,1 dan `category` cocok tetap; `effectiveCategory` sangat_cocok; `correction` {sangat_cocok, "uji QA traksi petambak terukur", wa}. Riwayat `LUZvvZ87B5QdyU00NUIU` cocok → sangat_cocok. Istilah "Skor kualitas" dan koma desimal (catatan 6 di `TESTING.md`) kini terbukti lewat WA                                                                                                                                                                                                                                            |
| PWA-07 | Lulus    | 14.46.33 `3EB0F6691A934D22A53608` "Ada 2 proposal Kurang cocok yang belum ditanggapi: QA Pasar Desa Digital, QA Bengkel Surya / Balas YA dalam 10 menit untuk pantau semuanya." `pendingConfirmations` berisi tepat `upload-9421dfea055e1253`, `upload-e33a0262c018d998` — hanya QA, jadi YA aman                                                                                                                                                                                                                                                                                                                                                           |
| PWA-08 | Lulus    | 14.46.52 `3EB015F009F2016AEA1E42` "Selesai: 2 proposal ditandai pantau." Keduanya `response` {pantau, wa}; konfirmasi terhapus; riwayat `tanggapan_massal` `UDpG8FnRjDVMwkdKPG0T`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| PWA-09 | Lulus    | 14.47.10 `3EB0A8FFB84988248822C3` "Tidak ada perintah yang menunggu konfirmasi."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| PWA-10 | Lulus    | ID `QA-DUP-7F3A91C2` (teks PWA-04) dikirim dua kali: pertama `{"accepted": true}`, kedua `{"ignored": "duplikat"}`. Satu `webhookEvents/QA-DUP-7F3A91C2`, satu pekerjaan, satu balasan (tidak ada pesan baru 10 dtk setelah kiriman kedua)                                                                                                                                                                                                                                                                                                                                                                                                                  |
| PWA-11 | Lulus    | 14.47.21 `3EB095FF66380458715BD3` "AISA dijeda (STOP). Proposal baru akan antre. Kirim LANJUT untuk melanjutkan." `settings/runtime` paused true, `pausedVia` wa, `lastStopAt` 14.47.21. Riwayat `stop` `TvZ2w7c6pztlcURLjo8r`                                                                                                                                                                                                                                                                                                                                                                                                                              |
| PWA-12 | Lulus    | `upload-01b3e5d419dfd7c2` QA Kebun Atap: 202 `created: true`, 15 dtk kemudian masih `antre`, `jobId` null, tanpa `proposalTexts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| PWA-13 | Lulus    | 14.47.57 `3EB00F75CAB341F6C6619E` "AISA sedang dijeda (STOP). Kirim LANJUT untuk melanjutkan." Jumlah pekerjaan `asisten` 8 sebelum dan sesudah (terakhir 13.38 UTC): Asisten tidak dipanggil                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| PWA-14 | Lulus    | 14.48.20 `3EB0293B3CC659D3D55ED1` "Pekerjaan AI dilanjutkan." `paused` false. QA Kebun Atap dinilai 63,1 Kurang cocok, `penilaian-20261021144820-df27fc` 8 langkah (dimulai "Ambil pitch deck" dari GCS), 2.776/2.417 token. Riwayat `lanjut` `YfEBc087KFLsrk203p7t`                                                                                                                                                                                                                                                                                                                                                                                        |
| PWA-15 | Lulus    | Pengirim `620000000000` (fiktif): `{"ignored": "pengirim atau isi tidak dilayani"}`. Chat GOWA nomor itu `total: 0`, chat manajer tanpa pesan baru, tanpa `webhookEvents/QA-A4EA65065C4D4BB5`, jumlah `jobs` 53 → 53, QA Kebun Atap tetap tanpa tanggapan                                                                                                                                                                                                                                                                                                                                                                                                   |
| PWA-16 | Lulus    | `chat_id` `…@g.us`, pengirim manajer: `{"ignored": "grup"}`. Tanpa balasan, tanpa `webhookEvents/QA-AE6B26C96FD24EC0`, tanpa pekerjaan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| RKS-01 | Lulus    | 200, `usedTemplate` true, teks dibuka "Selamat malam, Pak. Sejak ringkasan Rabu pukul 20.40 masuk 6 proposal baru. Ada 11 proposal yang belum Pak tanggapi." `counts` {sangat_cocok 2, cocok 3, kurang_cocok 2, tidak_cocok 2, kualitasLuarFokus 0, perluDicekManual 2, belumDitanggapi 11, baruMasuk 6} **identik** dengan hitungan ulang langsung dari Firestore. Insight "minggu ini ada 4 proposal f&b" cocok (Saku Hukum, Balkan Gourmet, Kopi Teras Senja, QA Roti Lembah). `digests` tetap 2 dokumen, pekerjaan `ringkasan` tetap 3, tidak ada pesan GOWA baru                                                                                       |
| RET-01 | Lulus    | 200 `{"retentionDays": 90, "deleted": 0, "proposalIds": []}`; jumlah proposal 13 → 13. Pekerjaan `perintah-20261021144427-fa1daf` "Retensi otomatis 90 hari", selesai, `model` null, 1 langkah "Cari proposal diarsipkan lebih dari 90 hari"                                                                                                                                                                                                                                                                                                                                                                                                                |
| DSB-01 | Sebagian | `DELETE upload-8522089c3a7c87e7` → 200 `{"deleted": true}`. Hilang: proposal, `proposalTexts`, deck GCS, `penilaian-20261021144220-b43af5` beserta 7 langkahnya. Tiga riwayat (`proposal_masuk`, `koreksi`, `tanggapan`) disamarkan: nama "(dihapus)", before/after/reason null, detail "Rincian dihapus bersama proposal". Baris `proposal_dihapus` `3Iil6wcM65pRYnBWZmzT` via dashboard, reason "QA cleanup", tanpa nama. Detail `tanggapan_massal` menjadi "Pantau semua kurang cocok: 2 proposal ((dihapus), (dihapus))". **Tetapi** nama dan alasan koreksi tetap ada di judul pekerjaan perintah — lihat Temuan 1                                     |
| KAM-01 | Lulus    | Tanpa kunci: upload, response, delete, bulk-response, runtime/stop, PUT rules, deck-url → semua 401 `{"detail": "kunci tidak valid"}`; response dengan kunci salah → 401 yang sama                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| KAM-02 | Lulus    | `/digest/run?dryRun=true` tanpa kredensial, `X-AISA-Key` salah, `Authorization: Bearer` palsu; `/retention/run` tanpa kredensial → semua 401 `{"detail": "kredensial tidak valid"}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| KAM-03 | Lulus    | 401 `{"detail": "tanda tangan tidak valid"}`, tanpa `webhookEvents/QA-2718E37BF3C74F82`, tanpa balasan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

**Ringkasan:** 32 baris — 31 Lulus, 1 Sebagian (DSB-01), 0 Gagal.

## Temuan

1. **Sedang — penghapusan meninggalkan nama proposal dan alasan koreksi di Aktivitas AI.**
   Perintah WA dicatat sebagai pekerjaan berjudul `Perintah: <teks pesan, 60 karakter>`
   (`orchestrator.handle`) tanpa `proposalId`, sedangkan `domain.delete_proposal` hanya
   menghapus pekerjaan dengan `proposalId == id`. Setelah semua proposal QA dihapus, pekerjaan
   ini masih ada: `perintah-20261021144456-15ead7` "Perintah: undang QA Tambak Cerdas",
   `perintah-20261021144604-cade86` "Perintah: pindahkan QA Tambak Cerdas ke sangat cocok",
   `perintah-20261021144616-4f4a50` "Perintah: pindahkan QA Tambak Cerdas ke sangat cocok karena
   uji QA tra" (potongan alasan koreksi yang di `history` justru dibuang),
   `perintah-20261021144507-00e893` "Perintah: pantau QA Roti Lembah",
   `perintah-20261021144517-1c856a` "Perintah: arsipkan QA Arsip Pindaian". Ini bertentangan
   dengan `GLOSSARY.md` ("Riwayat tetap ada tetapi tanpa nama dan isi proposal") dan
   `overview-project.md` (yang dihapus termasuk "log pekerjaannya"). Kelima pekerjaan itu tetap
   di produksi sebagai sisa uji, karena tidak ada rute untuk menghapus pekerjaan. Belum diuji:
   apakah langkah pekerjaan `asisten` (argumen tool, jawaban) juga menyimpan nama proposal.
2. **Rendah — istilah di `history.detail` saat proposal masuk.** Teksnya "Proposal QA Tambak
   Cerdas masuk: skor 68.1, cocok": titik desimal dan nilai enum mentah, sedangkan balasan WA
   memakai "68,1" dan "Sangat cocok". Apakah halaman Riwayat menampilkan `detail` apa adanya
   tidak terverifikasi di putaran ini (tanpa browser).
3. **Info — pratinjau slot yang sudah terkirim tidak memberi tanda.** `dryRun` untuk slot 09.00
   pukul 21.44 WIB mengembalikan `digestId` `2026-10-21-0900` (sudah terkirim hari itu) beserta
   teks lengkap, tanpa menyebut bahwa pengiriman sungguhan akan `skipped: "sudah terkirim"`.
4. **Info — FRM-04 mengembalikan pesan validasi pydantic mentah** (nama kelas `FormIntake`, URL
   errors.pydantic.dev) ke pemanggil Apps Script. Tidak bocor rahasia, tetapi bukan teks yang
   menyebut apa yang harus dilakukan.
5. **Kesalahan data uji, bukan produk.** Putaran pertama deck teks QA terpecah menjadi 12
   halaman (footer memicu page break), rata-rata 170–184 karakter per halaman di bawah
   `minCharsPerPage` 200, sehingga keempatnya benar masuk `perlu_dicek_manual` ("teks terlalu
   sedikit (2208 karakter di 12 halaman)", 0 token, `model` null). Mereka langsung dihapus
   (lihat Data uji) dan deck dibuat ulang 6 halaman.

## Data uji dan penutupan

Sepuluh proposal QA dibuat lewat `POST /intake/upload`, semuanya dihapus lewat
`DELETE /api/proposals/{id}` dengan alasan "QA cleanup":

| ID                        | Nama                  | Keadaan terakhir sebelum dihapus             | Dihapus (UTC) |
| ------------------------- | --------------------- | -------------------------------------------- | ------------- |
| `upload-315beccd4b4b51ac` | QA Tambak Cerdas      | perlu_dicek_manual (deck salah susun)        | 14.42.10      |
| `upload-c899449ecfb63c79` | QA Roti Lembah        | perlu_dicek_manual (deck salah susun)        | 14.42.11      |
| `upload-a8e7f7f7331060ee` | QA Bengkel Surya      | perlu_dicek_manual (deck salah susun)        | 14.42.11      |
| `upload-915ddd5a950c3750` | QA Pasar Desa Digital | perlu_dicek_manual (deck salah susun)        | 14.42.11      |
| `upload-8522089c3a7c87e7` | QA Tambak Cerdas      | dinilai 68,1, undang, koreksi → Sangat cocok | 14.50.02      |
| `upload-e6c90420af01a4ac` | QA Roti Lembah        | dinilai 56,2, pantau                         | 14.50.28      |
| `upload-e33a0262c018d998` | QA Bengkel Surya      | dinilai 63,1, pantau (massal)                | 14.50.29      |
| `upload-9421dfea055e1253` | QA Pasar Desa Digital | dinilai 63,1, pantau (massal)                | 14.50.29      |
| `upload-06e131460a238173` | QA Arsip Pindaian     | perlu_dicek_manual, arsipkan                 | 14.50.30      |
| `upload-01b3e5d419dfd7c2` | QA Kebun Atap         | dinilai 63,1 setelah LANJUT                  | 14.50.30      |

Bukti pembersihan, dibaca ulang untuk setiap ID: proposal, `proposalTexts`, dan deck GCS tidak
ada; pekerjaan penilaiannya dan langkahnya tidak ada; tidak ada `pendingConfirmations` yang
menyebutnya; setiap baris riwayatnya bernama "(dihapus)" dan ada satu `proposal_dihapus` tanpa
nama; tidak ada nama QA di `history` maupun `digests`. Bucket deck kembali berisi 7 objek (tujuh
proposal unggahan demo).

Keadaan akhir:

- `settings/runtime`: `paused` false, `pausedVia` null, `lastStopAt` 14.47.21 UTC (dari PWA-11;
  LANJUT memang tidak menghapusnya).
- Delapan proposal demo identik dengan keadaan sebelum putaran (status, kategori efektif,
  tanggapan); tidak ada yang ditanggapi, dikoreksi, atau dihapus oleh putaran ini.
- Aturan penilaian tetap versi 1; tidak ada pengaturan yang diubah. Revisi `aisa-api` tetap
  `aisa-api-00007-54h`.
- Tidak ada ringkasan yang dikirim; slot 09.00 tanggal 22 Oktober belum terpakai untuk bukti
  Scheduler.
- Sisa yang tidak bisa dibersihkan lewat API: lima pekerjaan perintah di Temuan 1, pekerjaan
  perintah tanpa nama proposal (`pantau semua kurang cocok`, `YA`, `STOP`, `LANJUT`, nama tidak
  ditemukan, retensi), dan `dailyStats/2026-10-21`, yang sesuai desain tidak dikurangi saat
  penghapusan: ia ikut menghitung 10 proposal QA, 6 di antaranya Perlu dicek manual, dan token
  penilaiannya. Tren hari itu memuat angka uji ini.

## Gate

Tidak ada kode yang diubah di putaran ini, jadi `pnpm verify` dan `uv run pytest -q` tidak
dijalankan. Berkas ini belum didaftarkan di `scripts/docs/manifest.ts` dan `docs/README.md`.

## Uji ulang

Perbaikan di tingkat kode untuk Temuan 1–3, **belum di-deploy**: `aisa-api` di produksi masih
revisi `aisa-api-00007-54h`, jadi baris DSB-01 tetap Sebagian sampai revisi baru di-deploy dan
diuji ulang lewat API. Temuan 4 tidak disentuh.

- **Temuan 1.** Pekerjaan perintah WA kini diberi `proposalId` begitu nama cocok dengan satu
  proposal (juga untuk koreksi tanpa alasan), dan `proposalIds` untuk daftar
  `<perintah> semua <kategori>` serta `YA`. Judulnya disusun dari perintah yang dikenali, bukan
  teks pesan: "Perintah: undang QA Tambak Cerdas", "Perintah: pindahkan QA Tambak Cerdas",
  "Perintah: pantau semua kurang cocok", "Perintah: YA"; alasan koreksi tidak pernah masuk
  judul. `delete_proposal` tetap menghapus pekerjaan dengan `proposalId` sama beserta
  langkahnya, mengeluarkan id dari `proposalIds` pekerjaan massal (pekerjaan itu tetap untuk
  proposal lain), dan sebagai jaring pengaman mengganti nama utuh proposal di judul pekerjaan
  dan teks langkah (`action`, `read`, `wrote`, `error`) dengan "(dihapus)", kecuali di pekerjaan
  milik proposal lain yang kebetulan senama. Jaring pengaman ini juga berlaku untuk langkah `asisten` bila argumen tool memuat nama utuh proposal; nama sebagian tidak tertangkap. Kontrak: `aisa-firestore.md` (`jobs`,
  "Deleting a proposal").
- **Temuan 2.** Detail `proposal_masuk` kini "Proposal <nama> masuk: skor 68,1, Cocok" (koma
  desimal dan label kategori).
- **Temuan 3.** `dryRun` kini mengembalikan `wouldSkip` (true bila slot itu sudah terkirim)
  dan, bila true, `note` "slot ini sudah terkirim; pengiriman sungguhan akan dilewati".

Bukti kode: `cd services/api && uv run pytest -q` → 265 passed (sebelumnya 255). Tes baru di
`tests/test_deletion_scrub.py` (judul tanpa alasan, tautan `proposalId`/`proposalIds`,
penghapusan pekerjaan satu sasaran beserta langkahnya, pekerjaan massal disisakan untuk proposal
lain, nama disamarkan di judul lama dan langkah Asisten, pekerjaan proposal senama tidak
disentuh), `test_pnl_04` di `tests/test_intake.py`, dan `test_rks_07b` di
`tests/test_digest_run.py`. Mematikan jaring pengaman membuat dua tes penghapusan gagal.

Pembersihan produksi (sekali jalan, langsung ke Firestore dengan kredensial operator): dibaca
dulu, semua pekerjaan yang judul atau teks langkahnya memuat salah satu nama QA. Hasilnya tepat
lima pekerjaan Temuan 1, masing-masing satu langkah, langkahnya tidak menyebut nama, dan tidak
ada lagi proposal bernama QA. Kelimanya dihapus beserta langkahnya karena proposalnya sudah
tidak ada: `perintah-20261021144456-15ead7`, `perintah-20261021144507-00e893`,
`perintah-20261021144517-1c856a`, `perintah-20261021144604-cade86`,
`perintah-20261021144616-4f4a50`. Dibaca ulang setelahnya: 0 pekerjaan memuat nama QA.

### Uji ulang DSB-01 setelah deploy (`aisa-api-00008-xnp`, 22.11 WIB)

1. Unggah `QA Uji Hapus Ulang` → `upload-242f71ebc6bcf0a4` (deck scan, berakhir _perlu dicek
   manual_).
2. WA `pantau QA Uji Hapus Ulang` (1 balasan WA). Job perintah
   `perintah-20261021151123-5ca3a5` berjudul "Perintah: pantau QA Uji Hapus Ulang" kini membawa
   `proposalId = upload-242f71ebc6bcf0a4`.
3. `DELETE /api/proposals/upload-242f71ebc6bcf0a4 {"reason":"QA cleanup"}` → 200
   `{"deleted":true}`.
4. Pindai semua `jobs` dan `steps`: tidak ada yang menyebut nama itu atau ID-nya. `history` untuk
   ID itu: "Proposal dihapus" dan dua baris "Rincian dihapus bersama proposal". Proposal dan
   teksnya tidak ada lagi.

**DSB-01: Lulus.**
