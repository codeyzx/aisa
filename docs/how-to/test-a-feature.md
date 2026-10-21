# Menguji fitur AISA sampai tuntas

Standar uji untuk setiap fitur AISA yang dibangun atau diubah, oleh manusia maupun agent.
Kalau diminta "ikuti guidelines testing", dokumen inilah yang dimaksud. Ia melengkapi
[`verify-change.md`](verify-change.md) (rantai gate dan langkah _drive_) dan
[`../reference/contracts/testing.md`](../reference/contracts/testing.md) (tempat tiap lapis
tes dan batasnya). Daftar fitur yang harus diuji, beserta tes yang sudah ada dan celahnya,
ada di [`../qa/inventaris-fitur.md`](../qa/inventaris-fitur.md).

Toast "berhasil", status 202, atau balasan "Tercatat" bukan bukti. Bukti adalah keadaan akhir
yang terbaca ulang: dokumen Firestore, layar setelah muat ulang, dan pesan yang benar-benar
sampai di WhatsApp.

## Lapis tes

| Lapis                  | Perintah                                                   | Menguji                                                                                        | Tidak bisa menguji                                                      |
| ---------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Unit `aisa-api`        | `cd services/api && uv run pytest -q`                      | logika murni: skor, kategori, cek kecocokan, perintah, angka ringkasan, kutipan, OIDC, retensi | Firestore, GOWA, Gemini, Agent Runtime sungguhan                        |
| Unit dashboard         | `pnpm test:unit`                                           | skema, label, util, auth — kolokasi di samping kodenya                                         | data Firestore                                                          |
| Integrasi dashboard    | `pnpm test:integration`                                    | repo AISA dan rules Firestore terhadap emulator yang di-seed (`scripts/_seed-aisa.ts`)         | penulisan (dashboard tidak menulis dokumen AISA)                        |
| E2E dashboard          | `pnpm test:e2e:fast --shards 2 e2e/<spec>.spec.ts`         | layar di image produksi + emulator, masuk sebagai akun seed                                    | aksi tulis: image E2E tidak punya `aisa-api` di belakangnya             |
| Penerimaan di produksi | `curl` / skrip ke `aisa-api` produksi, WhatsApp, Firestore | alur ujung ke ujung dengan Gemini, GOWA, Agent Runtime, Scheduler sungguhan                    | — (tapi mahal: token, pesan WA sungguhan, slot ringkasan yang terpakai) |

- **E2E: jalankan spec yang terdampak, bukan seluruh suite.** Bawaan `test:e2e:fast` adalah
  empat shard, masing-masing satu kontainer aplikasi, satu emulator Firestore, dan satu browser;
  `--shards 2` aman di mesin yang sedang menjalankan hal lain. Seluruh suite
  (`pnpm test:e2e:ci`) hanya sebelum merge, sesuai `verify-change.md`. Jalankan di latar
  belakang: Bash tool mematikan perintah latar depan setelah 120 detik.
- **E2E hanya ke loopback.** `e2e/target.ts` menolak `E2E_BASE_URL` yang bukan loopback, jadi
  penerimaan di produksi tidak memakai Playwright terhadap URL produksi; ia memakai rute
  `aisa-api` (tabel rute di `services/api/README.md`) dan browser yang dikendalikan sendiri.
- **Tombol tulis di dashboard** (tanggapan, koreksi, tanggapan massal, Hapus data, simpan
  Pengaturan, STOP/LANJUT, Unggah pitch deck) memanggil `aisa-api` lewat
  `AISA_API_URL` (`features/aisa/aisa.action.ts`). Di E2E, `scripts/e2e-fast.ts` memberi
  setiap shard alamatnya sendiri (`127.0.0.1:8791` ke atas) dan `e2e/acceptance/fixtures.ts`
  menjalankan tiruan `aisa-api` (`e2e/acceptance/mock-aisa-api.ts`) di sana. Tiruan itu
  mencatat setiap request dan bisa disuruh menolak, jadi spec menguji isi request dan pesan
  penolakan. Ia tidak menulis apa pun, jadi keadaan akhir di Firestore setelah aksi tulis
  dibuktikan oleh pytest dan uji penerimaan di produksi, bukan oleh E2E.

## Aturan

### 1. Matriks penerimaan dulu, dari spesifikasi

Sebelum menulis tes, tulis matriks dari `overview-project.md`, `tech.md`, dan kontrak di
`docs/reference/contracts/` — bukan dari implementasinya. Satu baris per aksi yang bisa
dilakukan manajer atau sistem (unggah, isi Form, perintah WA, pertanyaan ke Asisten, tombol
dashboard, jadwal Scheduler). Bentuk barisnya ada di [Templat](#templat-docsqafiturmd).

### 2. Setiap aksi dicek sampai keadaan akhirnya

Setelah aksi yang mengubah data, periksa:

1. **Firestore** — dokumen yang berubah dan nilainya persis (`status`, `category`,
   `effectiveCategory`, `response`, `correction`, `tokens`), serta yang tidak boleh ikut berubah
   (koreksi tidak menyentuh `category` maupun skor).
2. **Jejak audit** — baris `history`, pekerjaan `jobs/{id}` beserta `steps` (model, token,
   status), dan `dailyStats/{tanggal WIB}`.
3. **Setiap pembaca data itu** — Hari ini, daftar dan detail Proposal, Riwayat, Aktivitas AI,
   Tren, teks ringkasan berikutnya (pratinjau `uv run aisa digest 09.00`, tidak mengirim), dan
   jawaban Asisten. Angka yang sama harus sama di semua tempat.
4. **Layar asal setelah muat ulang**, bukan state browser.
5. **Hapus** — dokumen hilang dari semua pembaca, dan semua yang dihapus
   `domain.delete_proposal` benar-benar hilang (`proposalTexts`, deck GCS, `jobs` + `steps`,
   `pendingConfirmations`); baris `history` tersisa dengan nama "(dihapus)".

### 3. Drive cabang gagal dan catat teks persisnya

Daftar cara aksi bisa gagal lalu uji masing-masing: tanda tangan salah (401), kunci salah (401),
body tidak valid atau tanpa persetujuan (422), bukan PDF / lebih dari 20 MB, nama proposal
tidak ditemukan atau ambigu, koreksi tanpa alasan, `YA` tanpa perintah tertunda atau setelah 10
menit, AISA sedang dijeda, deck tanpa teks. Kutip teks balasan atau layar apa adanya dan pastikan
ia menyebut apa yang harus dilakukan manajer.

### 4. Istilah disalin dari layar

Sebelum menulis pesan atau assertion yang menyebut label, buka layarnya dan salin apa adanya.
Bila satu hal punya nama berbeda di dua tempat (dokumen produk, dashboard, WhatsApp), catat
sebagai temuan. Istilah baku ada di `GLOSSARY.md`.

### 5. Uji setiap cabang yang dipilih kode

Bila kode memilih di antara jalur, uji tiap jalur dan pastikan hasil menyebut jalur yang
dipakai: teks ringkasan AI vs template (`digests.usedTemplate`), OIDC vs `X-AISA-Key`
(log `scheduler route authenticated via oidc|key`), deck Form (Drive) vs unggahan (GCS),
nama tepat vs awalan unik vs mirip.

### 6. Aksi berulang tidak boleh menggandakan

Webhook yang sama dua kali diproses sekali (`webhookEvents/{id}`), unggah PDF yang sama dua
kali tetap satu proposal, Form dengan `driveFileId` yang sama tetap satu proposal, ringkasan
satu slot per hari WIB (`"skipped": "sudah terkirim"`), tombol yang diklik dua kali.

### 7. Data uji dibuat sendiri dan fiktif

Pakai pitch deck sintetis untuk startup **fiktif** (lihat contoh di `docs/TESTING.md`), dengan
nama unik per putaran uji, dibuat lewat jalur yang sama dengan pengguna (Form, tombol Unggah,
atau `POST /intake/upload`). Sengaja buat bentuk yang tidak ada di seed: deck scan tanpa teks,
deck tanpa sektor/tahap/dana, kutipan yang tidak ada di halamannya, nama yang mirip nama lain.
Jangan pernah memakai deck, nama, atau kontak founder sungguhan.

### 8. Varian data baru = audit semua pembacanya

Status, kategori, jenis job, atau field opsional baru di `services/api/aisa/models.py` harus
diuji di setiap pembaca: skema dashboard (`features/aisa/aisa.schema.ts` membaca enum terbuka),
setiap halaman, ringkasan, tools Asisten (`services/api/aisa/assistant/tools.py`), dan
`docs/reference/contracts/aisa-firestore.md`.

### 9. Penguji bukan penulis kodenya

Pada kerja multi-agent, agent penguji berbeda dari agent pembangun dan menulis matriksnya dari
spesifikasi sebelum membaca diff. Tugasnya mencari ketidaksesuaian, bukan mengonfirmasi niat
penulis.

### 10. Tes tidak diubah supaya lolos

Tes merah setelah perubahan: buktikan dulu dari spesifikasi bahwa perilaku baru yang benar, dan
tulis alasannya di pesan commit. Melonggarkan assertion, menambah `skip`, atau memperpanjang
timeout tanpa menemukan sebabnya dilarang. Tes yang gagal lalu lolos tanpa perubahan kode
dicatat di berkas QA fiturnya dengan gejala dan dugaan sebabnya, bukan diabaikan.

### 11. Efek keluar dibuktikan: terjadi tepat sekali, atau tidak terjadi

Untuk pesan WhatsApp: terkirim sekali, ke nomor yang benar, dengan isi yang benar — dan tidak
terkirim ketika tidak seharusnya (pengirim bukan manajer, pesan grup, webhook duplikat, jawaban
Asisten yang dibatalkan STOP). Sama untuk panggilan model: selama dijeda, Asisten tidak dipanggil
dan tidak ada langkah model baru di `jobs`.

### 12. Laporkan apa adanya

Sebut perintah, exit code, dan jumlah gagal — bukan hanya jumlah lolos. Merah dijalankan ulang
terpisah untuk membedakan regresi dari flake, lalu katakan yang mana.

## Bukti

| Yang dibuktikan            | Bukti yang dicatat                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proposal                   | `proposals/{id}` (`upload-…` / `form-…`) dan nilai field yang diperiksa                                                                                          |
| Pekerjaan AI               | `jobs/{id}`: model, status, token masuk/keluar, jumlah langkah                                                                                                   |
| Tanggapan, koreksi, aturan | `history/{id}` dan `via` (`wa`, `dashboard`, `sistem`)                                                                                                           |
| Ringkasan                  | `digests/{YYYY-MM-DD-0900\|1700}`: `counts`, `usedTemplate`, `insight`, `gowaMessageIds`                                                                         |
| Balasan perintah & Asisten | teks yang dibaca kembali dari riwayat chat GOWA beserta waktunya. ID pesan balasan tidak disimpan di Firestore — hanya ringkasan yang menyimpan `gowaMessageIds` |
| Webhook                    | ID pesan di `payload.id` dan `webhookEvents/{id}`; respons `{"accepted": true}` atau `{"ignored": …}`                                                            |
| Jeda                       | `settings/runtime` (`paused`, `lastStopAt`)                                                                                                                      |
| Lingkungan                 | revisi Cloud Run `aisa-api`, ID engine Agent Runtime, versi aturan (`settings/rules.version`), tanggal dan jam WIB                                               |
| Layar                      | screenshot di scratchpad sesi penguji, disebut dengan path lengkap di berkas QA; screenshot tidak di-commit. Screenshot pendukung, bukan pengganti cek Firestore |

Bukti dikutip dari respons, dokumen, dan log yang benar-benar terbaca — bukan disimpulkan. Hasil
yang tidak bisa dibaca ulang ditulis "tidak terverifikasi", bukan "Lulus".

## Uji live di WhatsApp

Setiap webhook yang diterima `aisa-api` produksi membalas ke WhatsApp sungguhan, dan ringkasan
yang dikirim (`/digest/run` tanpa `dryRun`, `uv run aisa digest … --send`) terkirim ke **semua**
nomor di `MANAGER_PHONES`.

- **Penerima hanya nomor manajer** (yang terdaftar di `MANAGER_PHONES` revisi yang diuji,
  berakhiran …2356). Sebelum mulai, pastikan `MANAGER_PHONES` revisi itu tidak berisi nomor
  lain. Nomor lengkap tidak ditulis di repo (`tech.md`, prinsip implementasi 8).
- **Umumkan dulu** ke pemilik nomor: kapan, berapa pesan, dan apa yang diuji.
- **Batasi jumlah pesan.** Tulis anggaran pesan di matriks sebelum mulai (satu webhook ≈ satu
  balasan, ditambah satu "⏳ Sedang mengambil data, mohon tunggu…" bila Asisten lebih dari 20
  detik) dan berhenti bila terlampaui.
- **Simulasikan pesan manajer** dengan `POST /webhook/gowa` bertanda tangan
  `X-Hub-Signature-256` yang sah dan `payload.id` unik per pesan; rahasia diambil dari Secret
  Manager saat dijalankan, tidak dicetak, tidak ditulis ke berkas.
- **Ringkasan:** pakai pratinjau (`dryRun=true` atau CLI tanpa `--send`) kecuali skenario
  memang menguji pengiriman. Pengiriman sungguhan memakai slot hari itu; catat slot mana yang
  terpakai.

## Kebersihan data

- Setiap proposal uji dihapus setelah putaran selesai lewat tombol **Hapus data** atau
  `DELETE /api/proposals/{id}` dengan alasan yang menyebut putaran ujinya. Kalau dibiarkan, ia
  muncul di ringkasan berikutnya.
- Catat ID setiap proposal yang dibuat dan yang dihapus di berkas QA.
- Pengaturan yang diubah untuk uji (bobot, retensi, model) dikembalikan, dan versi aturan
  sebelum dan sesudah dicatat. Bila AISA dijeda untuk uji, kirim `LANJUT` sebelum selesai.

## Mencatat hasil: `docs/qa/<fitur>.md`

Satu berkas per fitur atau putaran uji, nama kebab-case berbahasa Indonesia
(`docs/qa/perintah-wa.md`). Daftarkan di `scripts/docs/manifest.ts` dan `docs/README.md` pada
perubahan yang sama, lalu jalankan `pnpm docs:check`. Tes otomatis yang lahir dari matriks
menyebut ID barisnya di judul tes, supaya baris dan tesnya bisa saling dicari.

### Templat `docs/qa/<fitur>.md`

```markdown
# <Fitur> — matriks penerimaan

Penguji: <siapa> (bukan penulis kodenya). Ditulis dari <spesifikasi yang dikutip> sebelum
membaca implementasinya.

Lingkungan: <lokal emulator | produksi>, revisi `aisa-api-…`, engine Agent Runtime `…`, aturan
versi <n>, <tanggal> <jam> WIB. Anggaran pesan WA: <n>.

## Matriks

| ID     | Aksi (lewat)         | Diharapkan di layar / balasan | Cek Firestore | Pembaca yang dicek | Efek keluar  | Tes otomatis |
| ------ | -------------------- | ----------------------------- | ------------- | ------------------ | ------------ | ------------ |
| PWA-01 | `undang <nama>` (WA) | …                             | …             | …                  | 1 balasan WA | …            |

## Hasil

| ID     | Hasil                                  | Teks persis / nilai Firestore / ID bukti |
| ------ | -------------------------------------- | ---------------------------------------- |
| PWA-01 | Lulus · Gagal · Sebagian · Tidak diuji | …                                        |

## Temuan

<defect, istilah yang berbeda antar-layar, flake — masing-masing dengan bukti>

## Data uji

<proposal yang dibuat dan ID-nya; yang sudah dihapus; pengaturan yang diubah dan dikembalikan>

## Gate

<perintah, exit code, jumlah lolos dan gagal>
```

ID baris memakai awalan fitur dari inventaris (mis. `PWA-01`), bukan nomor fase atau tiket.
`docs/TESTING.md` tetap mencatat skenario T01–T11 dari `tech.md` §12.

## Selesai berarti

- matriks lengkap untuk setiap aksi fitur, ditulis dari spesifikasinya;
- setiap baris dicek sampai keadaan akhirnya di Firestore dan di semua pembacanya;
- cabang gagal sudah diuji dan teksnya dikutip;
- tes otomatis untuk setiap baris yang bisa diotomatiskan, lolos; baris yang hanya bisa
  dibuktikan live (jawaban model, Memory Bank, pengiriman WA) ditandai begitu;
- `pnpm verify` exit 0 dan `uv run pytest -q` exit 0;
- data uji dihapus dan berkas QA mencatat ID-nya.
