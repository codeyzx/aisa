# Asisten — matriks penerimaan

Penguji: agent penguji (bukan penulis kodenya). Matriks ditulis dari `overview-project.md` §6,
`GLOSSARY.md`, dan baris `AST` di [`inventaris-fitur.md`](inventaris-fitur.md).
`services/api/aisa/assistant/**` dan `aisa/assistant_client.py` dibaca setelah matriks ditulis,
untuk menulis tes tools dan memilih bukti (langkah job, sesi, Memory Bank). Hasil di bawah
adalah chat GOWA, dokumen Firestore, sesi Agent Runtime, Memory Bank, dan log Cloud Run yang
terbaca ulang.

## Setup

| Hal                  | Nilai                                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lingkungan           | produksi, `aisa-api` revisi `aisa-api-00007-54h` (image `aisa-api:20261021-133058`), sama di awal dan akhir putaran                                                                                             |
| Asisten              | engine `projects/441293875661/locations/us-central1/reasoningEngines/7155459220723204096` (`aisa-asisten`, diperbarui 2026-10-21 13.33 UTC), `ASSISTANT_MODEL` `gemini-3.8-flash`                               |
| Aturan penilaian     | versi 1, tidak diubah                                                                                                                                                                                           |
| Waktu                | Rabu 21 Oktober 2026, 21.57–22.03 WIB (14.57–15.03 UTC)                                                                                                                                                         |
| `MANAGER_PHONES`     | satu nomor, berakhiran …2356                                                                                                                                                                                    |
| Jalur WhatsApp       | `POST /webhook/gowa` bertanda tangan sah, `payload.id` unik `QA-…`; balasan dibaca dari riwayat chat GOWA                                                                                                       |
| Anggaran pesan WA    | 12 balasan (disetujui pemilik nomor). **Terpakai 9**: 8 webhook, 7 jawaban/balasan perintah + 1 pesan tunggu "⏳" + 0 jawaban untuk pertanyaan yang di-STOP                                                     |
| Data                 | proposal yang sudah ada di produksi (tidak ada proposal uji dibuat). Satu proposal Form `form-103-R4Ft98dieFDetQ5iMFJDkhMEeHsXr` (PT Hanum Fashion) masuk 14.57.11 UTC dari luar putaran ini dan ikut terbaca   |
| Skrip dan log mentah | `/tmp/claude-1000/-home-codeyzx-work-hackathon-aisa/59e19ace-403c-486b-b5ce-fe6136dd8397/scratchpad/qa-asisten/` (`ask.py`, `stop.py`, `state.py`, `sess.py`, `del_mem.py`, `log.jsonl`); rahasia tidak dicetak |

## Matriks

| ID     | Aksi (lewat)                                                               | Diharapkan di balasan                                                                                    | Cek Firestore / Agent Runtime                                                                    | Efek keluar             | Tes otomatis                            |
| ------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------- | --------------------------------------- |
| AST-01 | WA "Berapa proposal yang belum ditanggapi dan apa saja yang sangat cocok?" | jumlah belum ditanggapi dan daftar Sangat cocok sama dengan Firestore (`responded`, `effectiveCategory`) | job `asisten` + langkah tool; hitungan dari `proposals`                                          | 1 balasan               | AST-11 (tools)                          |
| AST-02 | WA "Berapa valuasi Kopi Teras Senja?"                                      | "tidak tersedia di data AISA", tanpa angka karangan                                                      | job `asisten`                                                                                    | 1 balasan (+ ⏳ > 20 d) | —                                       |
| AST-03 | WA "Kalau yang nomor 2 tadi, timnya bagaimana?" (session hari yang sama)   | merujuk nomor 2 dari jawaban sebelumnya; nilai Tim sama dengan Firestore                                 | `assistantSessions/{manajer}` sama; event sesi                                                   | 1 balasan               | —                                       |
| AST-04 | WA "Buatkan 3 pertanyaan untuk founder Kelas Kode Rakyat"                  | diawali `💡 *Saran AI (bukan dari data proposal):*`                                                      | job `asisten`                                                                                    | 1 balasan               | —                                       |
| AST-05 | Pertanyaan data tanpa minta saran (AST-01)                                 | tanpa label saran, tanpa saran tanggapan, tanpa contoh perintah                                          | —                                                                                                | —                       | —                                       |
| AST-06 | Setiap jawaban                                                             | —                                                                                                        | satu langkah per pemanggilan tool + satu langkah jawaban; jumlah token langkah = token job       | —                       | `test_api_v2.py` (`StepRecorder`)       |
| AST-07 | WA "Mulai sekarang jawab singkat maksimal 3 baris", lalu session baru      | preferensi diingat; jawaban session baru ≤ 3 baris                                                       | Memory Bank: memori baru tanpa data proposal; `assistantSessions` berisi session baru            | 2 balasan               | —                                       |
| AST-08 | WA pertanyaan luas, STOP ±4 d kemudian, lalu LANJUT                        | STOP menyebut pembatalan; LANJUT menyebut kirim ulang; jawaban tidak pernah terkirim                     | job `dihentikan` dengan langkah "Dihentikan oleh STOP"; `settings/runtime.paused` akhirnya false | 2 balasan, 0 jawaban    | `test_stop_cancel.py`                   |
| AST-09 | Selama jawaban disiapkan                                                   | "mengetik…" di WA; "⏳ Sedang mengambil data, mohon tunggu…" sekali bila > 20 d                          | log Cloud Run `send/chat-presence`                                                               | ⏳ ≤ 1 per jawaban      | `test_stop_cancel.py` (heartbeat)       |
| AST-10 | Pertanyaan saat AISA dijeda                                                | "AISA sedang dijeda (STOP). Kirim LANJUT untuk melanjutkan."; Asisten tidak dipanggil                    | tidak ada job `asisten` baru                                                                     | 1 balasan               | —                                       |
| AST-11 | Tools baca: filter, hitung, banding, riwayat, tren, aturan, gambaran       | —                                                                                                        | —                                                                                                | —                       | `test_assistant_tools.py::test_ast11_*` |
| AST-12 | Detail proposal: kontak founder, nama tidak dikenal/ambigu                 | kontak founder tidak pernah ada di hasil tool; nama tak dikenal → "tidak ditemukan di data AISA"         | —                                                                                                | —                       | `test_assistant_tools.py::test_ast12_*` |

## Hasil

Firestore saat AST-01 dijawab (dibaca ulang setelahnya, `state.py props`): 9 proposal, 7 dengan
`responded` false; `effectiveCategory` `sangat_cocok`: Sawah Pintar Nusantara (undang), Kopi
Teras Senja (belum; `category` `tidak_cocok`, dikoreksi lewat dashboard), Kelas Kode Rakyat
(belum). Jawaban lokal `tools.get_overview()` terhadap Firestore yang sama: `total` 9,
`belumDitanggapi` 7. Jam balasan WhatsApp ditulis dalam WIB; jam job, log Cloud Run, dan Memory
Bank dalam UTC.

| ID     | Hasil           | Teks persis / nilai Firestore / ID bukti                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AST-01 | Lulus           | 21.57.28 `3EB033AC22839D365D880C`: `Saat ini terdapat *7 proposal yang belum ditanggapi*. Untuk kategori *Sangat cocok*, terdapat *3 proposal* (2 belum ditanggapi dan 1 sudah diundang): 1. *Sawah Pintar Nusantara* (agritech) · skor kualitas 100 … 2. *Kopi Teras Senja* (f&b) · skor kualitas 100 … 3. *Kelas Kode Rakyat* (edtech) · skor kualitas 85,6 …`. Sama dengan Firestore. Job `asisten-20261021145709-f8d869`: `get_overview` lalu jawaban. Angka 7 sudah termasuk PT Hanum Fashion yang masuk 2 detik setelah webhook                                                                                                                                     |
| AST-02 | Lulus           | 21.59.10 `3EB097B632E8D052802441` "⏳ Sedang mengambil data, mohon tunggu…", lalu 21.59.22 `3EB0AE3F58AFBB7A564C0C`: `Informasi mengenai valuasi *Kopi Teras Senja* *tidak tersedia di data AISA*. Data pendanaan yang tercatat pada pitch deck mereka hanya mencantumkan target dana yang diminta sebesar *Rp15 miliar* (Rp15.000.000.000) pada tahap *Seri A*.` Firestore: `fundingAskIdr` 15000000000, `stage` `seri-a`. Tanpa angka valuasi. Job `asisten-20261021145850-251e0e` tanpa pemanggilan tool (lihat Temuan 1)                                                                                                                                              |
| AST-03 | Lulus           | 21.58.17 `3EB075D77595257F7E3CA5`: `Untuk kriteria *Tim* pada proposal *Kopi Teras Senja*, nilainya adalah *5/5*. … (hal. 7).` Nomor 2 di AST-01 memang Kopi Teras Senja; Firestore `criteria.tim.value` 5, kutipan hal. 7 "Andreas Wijaya, CEO: 11 tahun di jaringan ritel makanan nasional, membuka 300+ gerai…". Session `7315699193496993792` sama dengan AST-01. Job `asisten-20261021145801-74ca79` tanpa pemanggilan tool (Temuan 1)                                                                                                                                                                                                                               |
| AST-04 | Lulus           | 21.59.56 `3EB085509B1CB90A7FE8E7` diawali `💡 *Saran AI (bukan dari data proposal):*`, tiga pertanyaan mengacu ke data (ISA batas 10% gaji hal. 3 & 6; 51 lulus dari 64 peserta hal. 5; MoU dua perusahaan hal. 5) — cocok dengan kutipan di `proposals/upload-ffca58ee99d0b8a3`. Job `asisten-20261021145937-d1f76f`: `get_proposal_detail {"name_or_id": "Kelas Kode Rakyat"}`                                                                                                                                                                                                                                                                                          |
| AST-05 | Lulus           | Jawaban AST-01 dan AST-03 tanpa label saran, tanpa saran tanggapan, tanpa contoh perintah                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| AST-06 | Lulus           | Semua 7 job putaran ini: satu langkah "Memanggil <tool>" per pemanggilan, satu langkah "Menjawab pertanyaan" (atau "Dihentikan oleh STOP"), dan jumlah token langkah = `tokensIn`/`tokensOut` job (mis. `…145709-f8d869`: 14417+14922 = 29339 masuk, 243+1410 = 1653 keluar). Kartu Asisten di Aktivitas AI tidak di-drive di sini                                                                                                                                                                                                                                                                                                                                        |
| AST-07 | Lulus           | 22.00.19 `3EB03D5E67454BD6E19DFA` "Baik, dimengerti. Saya akan menyajikan jawaban secara ringkas maksimal 3 baris ke depannya." Memory Bank 15.00.32 UTC: memori `5336927942557564928` "Saya ingin asisten memberikan jawaban yang singkat, dengan panjang maksimal 3 baris." (topik `preferensi_manajer`, tanpa data proposal). `assistantSessions/{manajer}` (`7315699193496993792`) dihapus; "Ringkas semua proposal yang ada" membuat session `8336433012166098944` dan dijawab 3 baris (22.01.05 `3EB0FCF6C083B9039FA819`: "Ada 9 proposal (7 belum ditanggapi): 3 Sangat cocok, 2 Cocok, 3 Tidak cocok, dan 1 Perlu dicek manual. …") — angka sama dengan Firestore |
| AST-08 | Lulus           | Pertanyaan 15.01.28 UTC, STOP 15.01.32. 22.01.32 `3EB0C16012222DA1CA19D1` "AISA dijeda (STOP). Jawaban yang sedang diproses dibatalkan. Proposal baru akan antre. Kirim LANJUT untuk melanjutkan."; 22.01.34 `3EB073E49EECE27E086A25` "Pekerjaan AI dilanjutkan. Pertanyaan yang dibatalkan perlu dikirim ulang." Chat diamati 90 d berikutnya: tidak ada pesan lain; log Cloud Run tanpa `send/message` setelah 15.01.34.9. Job `asisten-20261021150128-8e2a35` `dihentikan`: `compare_proposals`, `get_proposal_detail`, "Dihentikan oleh STOP". `settings/runtime` akhir: `paused` false, `lastStopAt` 15.01.32 UTC. Riwayat `stop` dan `lanjut` via `wa`              |
| AST-09 | Sebagian        | Tampilan "mengetik…" di ponsel tidak teramati. Log Cloud Run: `POST /send/chat-presence` 200 tak lama setelah tiap webhook, diulang ±8 d, dan sekali lagi tepat sebelum `send/message` (mis. AST-01: 14.57.09.7, 14.57.17.8, 14.57.25.9, 14.57.28.2, lalu kirim 14.57.28.6). Pesan tunggu terkirim sekali di AST-02 (`send/message` 14.59.11, ±20,5 d setelah job mulai) dan tidak di jawaban < 20 d. Pada AST-08 presence terakhir 15.01.36.5 setelah STOP                                                                                                                                                                                                               |
| AST-10 | Lulus (dikutip) | Diuji di [`penerimaan-produksi.md`](penerimaan-produksi.md) PWA-13 dan di putaran uji perintah WA: jumlah job `asisten` sama sebelum dan sesudah. Tidak diulang di sini                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| AST-11 | Lulus           | `test_assistant_tools.py`, 33 tes (lihat Tes otomatis)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| AST-12 | Lulus           | Idem; data founder disimpan di dokumen palsu dan tidak muncul di hasil `get_proposal_detail`, `search_proposals`, `get_overview`, `compare_proposals`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Temuan

1. **Asisten menjawab data dari hasil tool lama di session tanpa memanggil tool lagi**
   (sedang). AST-03 dan AST-02 tidak memanggil tool sama sekali (job `…145801-74ca79` dan
   `…145850-251e0e` hanya punya langkah "Menjawab pertanyaan"). Event session
   `7315699193496993792` (`sess.py`) menunjukkan datanya berasal dari
   `get_proposal_detail {"name_or_id": "Kopi Teras Senja"}` pukul 11.42 UTC, lebih dari tiga jam
   sebelumnya. Instruksi agen (`assistant/agent.py`) berbunyi "Selalu panggil tool dulu sebelum
   menjawab pertanyaan tentang data". Kali ini nilainya kebetulan masih sama dengan Firestore,
   tetapi tanggapan, koreksi, atau penilaian ulang di hari yang sama akan dijawab dengan data
   lama.
2. **Langkah "Menjawab pertanyaan" selalu mencatat `read` "data AISA (tools baca)"** (rendah),
   juga ketika tidak ada tool yang dipanggil (job `…150014-d26ecf` untuk "Mulai sekarang jawab
   singkat…", `…145801-74ca79`, `…145850-251e0e`). `StepRecorder.answer` di
   `assistant_client.py` mengisinya tanpa melihat apakah ada pemanggilan; Aktivitas AI jadi
   menyebut bacaan yang tidak terjadi.
3. **Memory Bank tidak kosong sebelum putaran ini** (observasi). Memori
   `4628261912130355200` (13.26.40 UTC) "Saya ingin asisten menyajikan informasi mengenai proposal
   investasi dalam bentuk daftar (list) yang disertai dengan skor dan alasan penjelasannya."
   berasal dari pesan session 13.25 UTC "jadi ada berapa proposal? berikan list dan skor nya serta
   alasan". Ia memengaruhi gaya AST-01 (baris "Alasan" per proposal). Tidak dihapus oleh penguji
   karena bukan buatan putaran ini; pemilik memutuskan.
4. **Di luar cakupan Asisten:** riwayat `proposal_masuk` menulis "skor 38.8" (titik desimal),
   sedangkan istilah baku jawaban dan ringkasan memakai koma.

## Data uji

- Tidak ada proposal yang dibuat atau dihapus. Pengaturan tidak diubah.
- `assistantSessions/{manajer}` diganti: session `7315699193496993792` (berisi pesan "Mulai
  sekarang jawab singkat…") tidak lagi dipakai; session aktif sekarang `8336433012166098944`.
- Memory Bank: memori uji `5336927942557564928` dihapus (`del_mem.py`, operasi `done: True`,
  tanpa error); daftar sesudahnya `total 1`, hanya `4628261912130355200` (Temuan 3).
- `settings/runtime` akhir `paused: false`.

## Tes otomatis

`services/api/tests/test_assistant_tools.py` (33 tes, palsu Firestore dalam memori, tanpa
jaringan): filter `search_proposals` (kategori efektif termasuk koreksi, sektor/tahap sebagian
tanpa beda huruf, `responded`, `status`, `min_score` tanpa skor tidak lolos, batas 25, urutan
skor dengan proposal tanpa skor di akhir, kategori/status tak dikenal ditolak); semua
`group_by` di `count_proposals`; `get_proposal_detail` lewat ID, nama tepat, awalan unik, nama
ambigu dengan kandidat, nama tidak dikenal, nama kosong, kontak founder tidak pernah muncul;
`compare_proposals` (minimal dua, maksimal empat, yang tidak ditemukan dilaporkan);
`get_history` (terbaru dulu, batas 25, per proposal); `get_trends` (periode, perubahan persen,
tanpa periode sebelumnya, tanpa statistik); `get_rules`; `get_overview`; tanda "Berkualitas, di
luar fokus" dengan tabel kebenaran yang sama dengan `showsQualityOutsideFocus` di
`features/aisa/aisa.schema.ts`; kegagalan baca Firestore jadi hasil tool, bukan exception.

## Gate

- `cd services/api && uv run pytest -q tests/test_assistant_tools.py`: exit 0, 33 lolos, 0 gagal.
- `cd services/api && uv run pytest -q`: exit 0, 265 lolos, 0 gagal. Pada jalan pertama satu tes
  gagal (`test_stop_cancel.py::test_execute_stop_and_resume`, `_execute() missing 1 required
positional argument: 'job'`) karena perubahan `orchestrator.py` yang sedang dikerjakan paralel
  di working tree; pada jalan berikutnya lolos setelah perubahan itu lengkap. Bukan dari berkas
  tes ini.
- `uvx ruff check tests/test_assistant_tools.py`: lolos.

## Penutupan

Baris yang hanya bisa dibuktikan live (jawaban model, Memory Bank, pengiriman WA) sudah
di-drive di produksi kecuali tampilan "mengetik…" di ponsel (AST-09, sebagian). Temuan 1 dan 2
belum diperbaiki; Temuan 3 menunggu keputusan pemilik.
