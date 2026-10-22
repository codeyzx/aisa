# Penerimaan di produksi lewat API dan webhook — matriks penerimaan

> **Skala penilaian lama.** Putaran uji di dokumen ini yang dijalankan sebelum 22 Oktober 2026
> memakai skala lama: empat kategori (Sangat cocok, Cocok, Kurang cocok, Tidak cocok; proposal di
> luar fokus selalu Tidak cocok, dengan tanda "Berkualitas, di luar fokus") dan kriteria lama
> (Tim, Pasar & masalah, Produk & keunggulan, Traksi, Model bisnis & keuangan). Hasilnya dibiarkan
> apa adanya sebagai catatan. Skala yang berlaku sekarang (kriteria A–E, lima grade, label Di luar
> fokus) ada di [`overview-project.md`](../../overview-project.md) §3.
>
> Putaran itu juga memakai tanggapan lama Undang, Pantau, dan Arsipkan (perintah WhatsApp
> `undang`, `pantau`, `arsipkan`; retensi menghapus proposal yang diarsipkan) dan ringkasan
> harian kedua pukul 17.00. Sekarang tanggapan hanya Setuju atau Tolak, retensi menghapus
> proposal yang ditolak, dan pukul 17.00 hanya ada ringkasan mingguan setiap Jumat
> ([`overview-project.md`](../../overview-project.md) §4–§5).

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

## Putaran setelah porting UI

| Hal                  | Nilai                                                                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lingkungan           | produksi, `aisa-api` revisi `aisa-api-00011-q82` (image `aisa-api:20261022-003155`), sama di awal dan akhir putaran                                                                                                     |
| Waktu                | Kamis 22 Oktober 2026, 00.39–00.44 WIB (17.39–17.44 UTC Rabu)                                                                                                                                                           |
| Aturan penilaian     | versi 3, tidak diubah                                                                                                                                                                                                   |
| `MANAGER_PHONES`     | satu nomor, berakhiran …2356                                                                                                                                                                                            |
| Jalur                | `POST /api/assistant/ask` (`X-AISA-Key`, session `dashboard-qa-wa-0040`); WhatsApp lewat `POST /webhook/gowa` bertanda tangan sah, `payload.id` unik `QA-…`; balasan dibaca dari chat GOWA (header `X-Device-Id`)       |
| Anggaran pesan WA    | 12 balasan. **Terpakai 9**: 8 webhook, 8 jawaban/balasan perintah + 1 pesan "⏳". Log Cloud Run: tepat 9 `send/message`, tidak ada dari `/api/assistant/ask` maupun pratinjau ringkasan                                 |
| Ringkasan            | hanya `dryRun=true`; `digests/2026-10-22-0900` tidak ada sesudahnya, jadi kiriman terjadwal 09.00 tidak terlewati                                                                                                       |
| Data uji             | satu deck sintetis "QA WA 0041" (fiktif, climate, pre-seed); proposal "QA Dash 0040" milik penguji dashboard yang berjalan bersamaan ikut terbaca dan tidak disentuh                                                    |
| Skrip dan log mentah | `/tmp/claude-1000/-home-codeyzx-work-hackathon-aisa/ec154574-91df-4732-b765-ec83050b58f6/scratchpad/prod-wa/` (`qa.py`, `dash.py`, `ask.py`, `fsread.py`, `state.py`, `cascade.py`, `log.jsonl`); rahasia tidak dicetak |

Jam balasan WhatsApp adalah stempel waktu GOWA (UTC).

| ID     | Hasil | Bukti                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ASK-01 | Lulus | `/api/assistant/ask` "Berapa proposal yang belum ditanggapi, dan mana saja yang kategorinya Sangat cocok?" → 200 dalam 14,2 d: 7 belum ditanggapi; Sangat cocok Sawah Pintar Nusantara (sudah: undang), Kopi Teras Senja, Kelas Kode Rakyat. Sama dengan Firestore saat itu (9 proposal, 7 `responded` false). Job `asisten-20261021173930-ea416b`: `get_overview` + jawaban, 3483+4061 = 7544 masuk, 198+967 = 1165 keluar = total job                                                                                             |
| ASK-02 | Lulus | Lanjutan di session yang sama "Untuk yang nomor 3 tadi, berapa nilai kriteria Tim dan Traksi-nya?" → Kelas Kode Rakyat Tim 4 (hal. 7), Traksi 5 (hal. 5), sama dengan `criteria` di `proposals/upload-ffca58ee99d0b8a3`. Job `asisten-20261021173950-943f3a`: `get_proposal_detail {"name_or_id": "Kelas Kode Rakyat"}`, langkah 11050/1113 = job. `assistantSessions/dashboard-qa-wa-0040` terpisah dari session nomor manajer; tidak ada lalu lintas GOWA                                                                         |
| ASK-03 | Lulus | Saat dijeda (setelah STOP WA): 200 dalam 0,7 d "AISA sedang dijeda (STOP). Pertanyaan bisa dikirim lagi setelah LANJUT di dashboard atau lewat WhatsApp."; jumlah job `asisten` tetap 25 (agen tidak dipanggil)                                                                                                                                                                                                                                                                                                                     |
| WAA-01 | Lulus | `QA-FD4C5A0E97AF40D7` "Berapa proposal yang belum saya tanggapi?" → 17.41.00 `3EB0BD2CE8A70A90B539FF` "Ada _8 proposal_ yang belum ditanggapi (dari total 10 proposal)" + daftar 8 nama dengan skor dan kategori, termasuk QA WA 0041 61,3 Kurang cocok yang baru dinilai. Sama dengan Firestore (10 proposal, 8 belum). Job `asisten-20261021174042-f8d77f` (`get_overview`)                                                                                                                                                       |
| WAA-02 | Lulus | `QA-87832CA21A2543B8` "Yang nomor 3 tadi, kriteria apa yang nilainya paling rendah?" → 17.41.26 `3EB0EB874C07EFC486F90E`: Klinik Desa Sehat (nomor 3 di WAA-01), empat kriteria bernilai 4, Traksi 5 — sama dengan `proposals/upload-7436553c442b73cb`. Job `asisten-20261021174110-0535b6`                                                                                                                                                                                                                                         |
| WAA-03 | Lulus | `QA-E5F9B1F1A0D3405B` "Buatkan 3 pertanyaan yang sebaiknya saya ajukan ke founder Klinik Desa Sehat" → 17.41.56 `3EB07BB5B0207EA918614B` "⏳ Sedang mengambil data, mohon tunggu…", 17.41.59 `3EB0D5E5731E06AEA19ACD`: bagian fakta tanpa label, lalu `💡 *Saran AI (bukan dari data proposal):*` dengan tiga pertanyaan (susunan dua bagian sesuai prompt). Semua angka (38 puskesmas, 21.400 konsultasi, Rp1,1 miliar, Rp2,4 juta, Rp8.000, 25.000) ada di `proposalTexts`. Job `asisten-20261021174136-120618`                   |
| WAA-04 | Lulus | Log Cloud Run: `send/chat-presence` 200 tak lama setelah tiap webhook Asisten dan diulang ±8 d; tidak ada log WARNING atau ERROR selama putaran                                                                                                                                                                                                                                                                                                                                                                                     |
| UNG-WA | Lulus | `POST /intake/upload` → 202 `upload-084d89232523e9d6` `created: true`; `dinilai` 61,3 Kurang cocok dalam ±12 d, `rulesVersion` 3, job `penilaian-20261021174034-d17328` (7 langkah, 2614/1459 token = token proposal); `history` `proposal_masuk` "Proposal QA WA 0041 masuk: skor 61,3, Kurang cocok"                                                                                                                                                                                                                              |
| PWA-P  | Lulus | `QA-E9CBD70E5E704B94` `pantau QA WA 0041` → 17.42.22 `3EB013C6E29732E4AF7B89` "Tercatat: QA WA 0041 → pantau."; `response` {pantau, wa}; `history` `tanggapan` "Pantau QA WA 0041"; job `perintah-20261021174222-0e74e0` "Perintah: pantau QA WA 0041" dengan `proposalId`                                                                                                                                                                                                                                                          |
| PWA-U  | Lulus | `QA-70EC440397E34D7C` `undang QA WA 0041` → 17.42.33 `3EB055753485F7907469CF` "Tercatat: QA WA 0041 → undang."; `response` {undang, wa}; `history` `tanggapan` before pantau → after undang; job `perintah-20261021174233-9e4a03`                                                                                                                                                                                                                                                                                                   |
| PWA-K  | Lulus | `QA-EDB39E924B7E4F71` `pindahkan QA WA 0041 ke cocok karena uji QA` → 17.42.38 `3EB0C2700E36098BF2ADF3` "Kategori QA WA 0041 dipindahkan ke Cocok. Skor kualitas tetap 61,3."; `category` tetap `kurang_cocok`, `effectiveCategory` `cocok`, `correction` {cocok, "uji QA", wa}; `history` `koreksi` kurang_cocok → cocok; job `perintah-20261021174238-d32c89` berjudul "Perintah: pindahkan QA WA 0041" (alasan tidak di judul)                                                                                                   |
| PWA-S  | Lulus | `QA-F9EA49DBB74249C6` `STOP` → 17.42.52 `3EB0AF3DE09584C40CE03C` "AISA dijeda (STOP). Proposal baru akan antre. Kirim LANJUT untuk melanjutkan."; `settings/runtime` `paused` true, `pausedVia` wa, `lastStopAt` 17.42.52 UTC; job `perintah-20261021174252-2a37b1`                                                                                                                                                                                                                                                                 |
| PWA-L  | Lulus | `QA-AE4E69820C294BEC` `LANJUT` → 17.43.06 `3EB0A65898D71B71389FC5` "Pekerjaan AI dilanjutkan."; `settings/runtime` dibaca ulang di akhir putaran: `paused` false, `pausedAt` null; job `perintah-20261021174306-7d2b44`                                                                                                                                                                                                                                                                                                             |
| RKS-P  | Lulus | `POST /digest/run?slot=09.00&dryRun=true` → 200 `digestId` `2026-10-22-0900`, `wouldSkip` false. Teks diawali "Selamat pagi, Pak."; hitungan {sangat_cocok 3, cocok 2, kurang_cocok 0, tidak_cocok 2, perluDicekManual 1, belumDitanggapi 8, baruMasuk 4} sama dengan Firestore (QA WA 0041 sudah ditanggapi, jadi tidak terhitung; 4 proposal dibuat setelah `sentAt` ringkasan terakhir 13.40 UTC). Insight: "Yang menarik: minggu ini ada 3 proposal f&b, minggu lalu belum ada." (Kopi Teras Senja, Saku Hukum, Balkan Gourmet) |
| DSB-WA | Lulus | `DELETE /api/proposals/upload-084d89232523e9d6 {"reason":"uji QA"}` → 200 `{"deleted":true}`. Sebelumnya: proposal, teks, deck GCS, 4 job (1+1+1 langkah perintah, 7 penilaian), 4 riwayat. Sesudahnya: proposal, `proposalTexts` dan `gs://…/decks/upload-084d89232523e9d6.pdf` tidak ada; 0 job dan 0 langkah tersisa; 4 riwayat lama "(dihapus)" / "Rincian dihapus bersama proposal"; riwayat baru `proposal_dihapus` (dashboard, alasan "uji QA"). Nama tidak tersisa di `history`, `jobs`, `steps`, `digests`                 |

Temuan putaran ini:

- **Nama proposal yang dihapus tetap ada di session Agent Runtime.** Session manajer hari ini
  (`1899337789304995840`) memuat 2 event yang menyebut "QA WA 0041" (hasil `get_overview` dan
  jawaban WAA-01) setelah DSB-WA. Penghapusan hanya mencakup Firestore dan GCS, sesuai
  "Deleting a proposal" di `services/api/README.md`; session (dan chat WhatsApp) di luar
  cakupannya. Ringan; pertanyaan lanjutan di session yang sama masih bisa menyebut nama itu.
- **Job `asisten` tidak membedakan kanal.** Job dari dashboard dan dari WhatsApp sama-sama
  berjudul "Menjawab pertanyaan manajer" tanpa kolom kanal; README memang menyebutnya "same
  `asisten` job", jadi ini catatan, bukan cacat.

### Uji ulang hapus proposal dan state Asisten (`aisa-api-00012-nzb`, 01.05–01.10 WIB)

Image `aisa-api:20261022-010315` (`sha256:ea878e72…3cba5`); hanya image yang berubah, env,
secret, service account, `cpu-throttling` false dan timeout 600 d sama dengan `00011-q82`.
Tanpa pesan WhatsApp. Data uji: deck sintetis "QA Hapus 0105" (fiktif).

| ID     | Hasil | Bukti                                                                                                                                                                                                                                                                              |
| ------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SMK    | Lulus | `GET /health` 200; `POST /api/assistant/ask` tanpa kunci 401, dengan kunci 200 dalam 20,6 d (7 belum ditanggapi)                                                                                                                                                                   |
| DSB-AS | Lulus | `upload-5efa4689154d6188` `dinilai` 63,1 Kurang cocok. Session `dashboard-qascrub-1` "Ceritakan proposal QA Hapus 0105" → jawaban menyebut namanya (session engine `7600156045742178304`). Sebelum hapus: 5 `assistantSessions`, 33 session engine, 1 memory (tidak menyebut nama) |
| DSB-AS | Lulus | `DELETE … {"reason":"uji QA"}` → 200 `{"deleted":true,"assistantScrub":{"sessions":33,"memories":0}}`, tanpa `error`. Cascade Firestore/GCS sama dengan DSB-WA, nama tidak tersisa di `history`, `jobs`, `steps`, `digests`                                                        |
| DSB-AS | Lulus | 20 d kemudian: 0 `assistantSessions`, 0 session engine (tak satu pun dari 33 id lama tercantum), 1 memory tetap ada dan tidak menyebut nama                                                                                                                                        |
| DSB-AS | Lulus | Session key yang sama "Proposal apa yang tadi kita bahas?" → "belum ada proposal yang kita bahas sebelumnya (ini pesan pertama)", tanpa nama; session engine baru `1505659850003054592`                                                                                            |

Belum teruji: jalur penghapusan memory yang menyebut proposal. Memory Bank tidak membuat
memory tentang "QA Hapus 0105", jadi `memories` 0 dan hanya terbukti bahwa memory lain tidak
ikut terhapus. Semua session engine terhapus, termasuk session WhatsApp manajer; pertanyaan
berikutnya mulai dari session baru, sesuai README.

### Deck hasil pindai dibaca sebagai gambar (`aisa-api-00015-bbp`, 22 Oktober 2026)

Image `aisa-api:20261022-083626`; hanya image yang berubah, env, secret, service account,
`cpu-throttling` false dan timeout 600 d sama dengan `00014-vcf`. Tanpa pesan WhatsApp. Data
uji: `fixtures/decks/pitch-deck.pdf` (22 halaman) dirender ulang menjadi JPEG per halaman dan
digabung lagi menjadi PDF 4,7 MB tanpa teks (pypdf membaca 0 karakter), diunggah dengan nama
"UJI Scan Gambar". Baris EKS-01 di matriks atas mencatat perilaku sebelum jalur ini ada.

| ID     | Hasil | Bukti                                                                                                                                                                                                                                                                                                                                                        |
| ------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| EKS-08 | Lulus | `upload-0945533208aa6017` `dinilai`, skor 70,0. Langkah: Ekstrak teks (kode) → Cek jumlah teks (kode) → **Baca teks dari gambar** (model, 11.822 masuk / 3.011 keluar, 19,6 d) → Menilai 5 kriteria (model, 4.894 / 2.706, 17,0 d) → Hitung skor → Cek kecocokan → Tentukan kategori → Simpan. `proposalTexts` 6.548 karakter; token proposal 16.716 / 5.717 |
| EKS-08 | Lulus | Sebelum deploy, transkrip dan penilaian yang sama dijalankan langsung ke Gemini dari mesin lokal: nilai kelima kriteria dari transkrip (3, 4, 3, 4, 4) sama dengan nilai dari PDF berteks aslinya; angka grafik halaman 13 (1468, 4689, 219%) tersalin                                                                                                       |
| HPS    | Lulus | `DELETE … {"reason":"uji QA baca gambar"}` → 200 `{"deleted":true,"assistantScrub":{"sessions":0,"memories":0}}`; `proposals` dan `proposalTexts` tidak ada lagi, deck di GCS terhapus                                                                                                                                                                       |
