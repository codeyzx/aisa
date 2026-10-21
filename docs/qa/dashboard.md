# Dashboard (layar baca dan tombol tulis) — matriks penerimaan

Penguji: agent penguji E2E dashboard (bukan penulis kodenya). Matriks ditulis dari
`overview-project.md` (§3 Penilaian, §5 Menanggapi proposal, §7 Dashboard, Aktivitas AI,
pelindungan data butir g), `GLOSSARY.md`, dan celah baris **DSB** di
[`inventaris-fitur.md`](inventaris-fitur.md). Angka yang diharapkan dihitung dari seed
(`scripts/_seed-aisa.ts`) dengan rumus dan aturan di overview, atau dijumlahkan dari dokumen
emulator, bukan disalin dari layar. Teks layar disalin dari layar yang di-drive.

Lingkungan: lokal, image produksi `aisa:e2e` dari commit dasar `85539f6` + perubahan kerja,
emulator Auth + Firestore per shard yang di-seed, aturan versi 1, 2026-10-21 WIB. Tanpa
`aisa-api` sungguhan: tombol tulis memanggil tiruan `aisa-api` (di bawah). Anggaran pesan WA: 0.

Layar sudah dipindah sejak hasil di bawah dicatat: Hari ini kini **Dashboard** (`/dashboard`;
`/hari-ini` dialihkan ke sana), aturan penilaian dan Kalibrasi pindah ke **Aturan penilaian**
(`/aturan`, ubah lewat dialog "Ubah aturan"), dan Pengaturan menjadi tab
(`/pengaturan?tab=profil|tampilan|ringkasan|integrasi|privasi`) dengan STOP/LANJUT di Integrasi
dan retensi di Privasi. Baris matriks memakai nama layar sekarang; bagian Hasil dan catatan
putaran di bawah tetap mencatat layar dan path saat diuji.

Batas lapis ini: tiruan `aisa-api` tidak menulis Firestore. Untuk aksi tulis, E2E membuktikan
**separuh dashboard** — permintaan yang dikirim (rute, `X-AISA-Key`, body persis), validasi
yang menolak sebelum mengirim, dan pesan penolakan API yang tampil apa adanya. Keadaan akhir
(dokumen berubah, baris `history`, pembaca lain) adalah tugas pytest `aisa-api`
([`api.md`](api.md)) dan penerimaan di produksi; kolom "Cek Firestore" untuk baris tulis di
bawah menulis "tidak terverifikasi di lapis ini".

## Tiruan `aisa-api`

`e2e/acceptance/mock-aisa-api.ts`, dijalankan sebagai fixture worker Playwright
(`e2e/acceptance/fixtures.ts`). Ia mendengarkan di `AISA_API_URL`, alamat yang sama yang
diberikan ke kontainer; `scripts/e2e-fast.ts` memberi tiap shard alamatnya sendiri
(`127.0.0.1:8791`, `:8792`, … — `E2E_FAST_AISA_API_BASE_PORT` + nomor shard), jadi spec tulis
berjalan dengan `--shards 2`. Kontainer memakai `--network host`, sehingga loopback host adalah
loopback kontainer. Tiruan mencatat metode, path, nilai `X-AISA-Key`, dan body (JSON, atau
field multipart dengan nama/tipe/ukuran/5 byte awal berkas), menjawab seperti rute di
`services/api/aisa/main.py`, menolak kunci yang salah dengan 401 `kunci tidak valid`, dan per
tes bisa diminta menolak (`refuseNext`), menjawab lain (`answerNext`), memutus koneksi
(`dropNext`), atau menunda (`delayAnswers`).

## Matriks

| ID     | Aksi (lewat)                                      | Diharapkan di layar                                                                                                                              | Cek Firestore / permintaan                                                                                       | Tes otomatis                      |
| ------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| DSB-01 | Buka Dashboard (manajer)                          | 12 belum ditanggapi; per kategori efektif 1/4/1/3; berkualitas di luar fokus 1; perlu dicek manual 2; "baru sejak ringkasan" = hitungan emulator | `proposals.createdAt > digests.sentAt` terbaru dihitung dari emulator                                            | `hari-ini.spec.ts` DSB-01         |
| DSB-02 | Dashboard saat berjalan, lalu saat dijeda         | tanpa spanduk; setelah `settings/runtime.paused = true` spanduk STOP dengan tautan Pengaturan → Integrasi                                        | `settings/runtime` ditulis ke emulator lalu dikembalikan                                                         | DSB-02                            |
| DSB-03 | Klik tiap ubin Dashboard                          | daftar Proposal terfilter dengan jumlah yang sama                                                                                                | —                                                                                                                | DSB-03                            |
| DSB-04 | Buka `/hari-ini` (alamat lama)                    | dialihkan ke `/dashboard`                                                                                                                        | —                                                                                                                | DSB-04                            |
| DSB-10 | Daftar tanpa filter                               | 14 proposal, terbaru di atas                                                                                                                     | —                                                                                                                | `proposal-list.spec.ts` DSB-10    |
| DSB-11 | Filter kategori (efektif)                         | Pasar Ikan (dikoreksi Kurang cocok → Cocok) masuk Cocok, tidak masuk Kurang cocok                                                                | —                                                                                                                | DSB-11                            |
| DSB-12 | Filter status                                     | perlu dicek manual 2 (skor "—"), antre 1, dinilai 11                                                                                             | —                                                                                                                | DSB-12                            |
| DSB-13 | Filter sektor                                     | pilihan = sektor yang ada; agritech 5, F&B 1                                                                                                     | —                                                                                                                | DSB-13                            |
| DSB-14 | Filter tanggapan                                  | sudah 2 (Undang, Arsipkan), belum 12                                                                                                             | —                                                                                                                | DSB-14                            |
| DSB-15 | Filter berkualitas, di luar fokus                 | hanya Kopi Rakyat                                                                                                                                | —                                                                                                                | DSB-15                            |
| DSB-16 | Cari nama                                         | sebagian nama, tanpa peduli huruf besar dan spasi luar; tidak ada hasil → pesan kosong                                                           | —                                                                                                                | DSB-16                            |
| DSB-17 | Nilai URL tidak dikenal                           | jatuh ke "tanpa filter", bukan halaman galat; parameter ganda memakai yang pertama                                                               | —                                                                                                                | DSB-17                            |
| DSB-18 | Filter digabung + Reset filter                    | URL bisa dibagikan, muat ulang menghasilkan tampilan sama                                                                                        | —                                                                                                                | DSB-18                            |
| DSB-20 | Detail proposal dinilai dan cocok                 | Tahap 1 skor + nilai + kutipan halaman, Tahap 2 lulus, kategori, token                                                                           | —                                                                                                                | `proposal-detail.spec.ts` DSB-20  |
| DSB-21 | Detail berkualitas, di luar fokus                 | Tidak cocok + tanda Berkualitas, di luar fokus, sektor gagal                                                                                     | —                                                                                                                | DSB-21                            |
| DSB-22 | Detail perlu dicek manual                         | tanpa skor, tanpa kategori, tanpa form koreksi, alasan status tampil                                                                             | —                                                                                                                | DSB-22                            |
| DSB-23 | Detail dengan kutipan tak ditemukan               | nilai dibatasi 2 dan tanda kutipan                                                                                                               | —                                                                                                                | DSB-23                            |
| DSB-24 | Detail yang dikoreksi                             | kategori dari kode dan skor tetap, kategori efektif = koreksi, alasan, riwayat                                                                   | —                                                                                                                | DSB-24                            |
| DSB-25 | Lihat log penilaian                               | Aktivitas AI dengan kartu penilaian proposal itu terbuka, satu-satunya                                                                           | —                                                                                                                | DSB-25                            |
| DSB-26 | Detail dengan butir "tidak disebut"               | kriteria nilai 1 bertanda tidak disebut; butir kecocokan yang tidak disebut gagal                                                                | —                                                                                                                | DSB-26                            |
| DSB-27 | Detail unggahan antre                             | Antre, belum ada penilaian, tanpa log, ada Buka deck                                                                                             | —                                                                                                                | DSB-27                            |
| DSB-28 | Detail yang sudah ditanggapi                      | tanggapan, waktu, lewat, catatan; tanggapan yang sama tidak bisa dikirim ulang                                                                   | —                                                                                                                | DSB-28                            |
| DSB-30 | Tren                                              | kartu insight dengan label "Yang menarik:"; per hari, per kategori, per sektor = jumlah `dailyStats`                                             | 14 dokumen `dailyStats` dijumlahkan dari emulator                                                                | `tren-aktivitas-riwayat.spec.ts`  |
| DSB-40 | Aktivitas AI                                      | total token dan panggilan model = `dailyStats`; tiap langkah kode "(kode)" bertoken 0; pekerjaan tanpa model berlabel (kode)                     | `dailyStats` dari emulator                                                                                       | DSB-40                            |
| DSB-50 | Riwayat                                           | semua baris audit terbaru di atas; baris yang disamarkan "(dihapus)" tanpa tautan                                                                | —                                                                                                                | DSB-50                            |
| DSB-60 | Aturan penilaian sebagai kursi baca-saja          | semua aturan terbaca, tanpa input, tanpa STOP/LANJUT, tanpa Orchestrator                                                                         | —                                                                                                                | `kursi-baca.spec.ts` DSB-60       |
| DSB-61 | Detail sebagai kursi baca-saja                    | tanpa tombol tanggapan, koreksi, Hapus data                                                                                                      | —                                                                                                                | DSB-61                            |
| DSB-62 | Daftar terfilter kategori sebagai kursi baca-saja | tanpa tanggapan massal                                                                                                                           | —                                                                                                                | DSB-62 (`test.fail`, defect)      |
| DSB-63 | Dashboard / Proposal sebagai kursi baca-saja      | tanpa Unggah pitch deck                                                                                                                          | —                                                                                                                | DSB-63 (`test.fail`, defect)      |
| DSB-70 | Undang dengan catatan                             | toast sukses, catatan dikosongkan                                                                                                                | `POST /api/proposals/{id}/response` `{kind, note}` (catatan di-trim), kunci benar; Firestore tidak terverifikasi | `tanggapan.spec.ts` DSB-70        |
| DSB-71 | Pantau tanpa catatan (spasi saja)                 | toast sukses                                                                                                                                     | body `{kind: "pantau"}` tanpa `note`                                                                             | DSB-71                            |
| DSB-72 | Tanggapan ditolak API                             | pesan API apa adanya, tanpa toast sukses                                                                                                         | 1 permintaan                                                                                                     | DSB-72                            |
| DSB-73 | `aisa-api` tidak terjangkau                       | pesan "tidak dapat dihubungi", bukan diam                                                                                                        | 1 permintaan, koneksi diputus                                                                                    | DSB-73                            |
| DSB-74 | Klik ganda tombol tanggapan                       | satu toast                                                                                                                                       | tepat 1 permintaan (jawaban ditunda 1,5 dtk)                                                                     | DSB-74                            |
| DSB-75 | Koreksi tanpa alasan / alasan spasi               | pesan alasan wajib                                                                                                                               | 0 permintaan                                                                                                     | DSB-75                            |
| DSB-76 | Koreksi dengan alasan                             | kategori efektif saat ini tidak bisa dipilih; toast sukses                                                                                       | `POST …/correction` `{category, reason}`, tanpa skor                                                             | DSB-76                            |
| DSB-77 | Koreksi ditolak API                               | pesan API apa adanya, alasan tetap di kolom                                                                                                      | 1 permintaan                                                                                                     | DSB-77                            |
| DSB-78 | Tanggapi semua (konfirmasi, Batal, Ya)            | Batal tidak mengirim; Ya mengirim; toast sukses                                                                                                  | `POST /api/proposals/bulk-response` `{category, kind}`                                                           | DSB-78                            |
| DSB-79 | Tanggapi semua ditolak API                        | pesan API apa adanya                                                                                                                             | 1 permintaan                                                                                                     | DSB-79                            |
| DSB-80 | Tanggapi semua saat API mengubah jumlah lain      | toast menyebut jumlah yang dijawab API                                                                                                           | jawaban `{count: 3}`                                                                                             | DSB-80 (`test.fail`, defect)      |
| DSB-81 | Hapus data dengan alasan spasi                    | pesan alasan wajib                                                                                                                               | 0 permintaan                                                                                                     | `hapus-unggah.spec.ts` DSB-81     |
| DSB-82 | Hapus data dengan alasan                          | pindah ke /proposal, toast, dialog tertutup                                                                                                      | `DELETE /api/proposals/{id}` `{reason}`; penghapusan sungguhan tidak terverifikasi di lapis ini                  | DSB-82                            |
| DSB-83 | Hapus data ditolak API                            | dialog tetap terbuka dengan pesan API, tetap di halaman detail                                                                                   | 1 permintaan                                                                                                     | DSB-83                            |
| DSB-84 | Unggah pitch deck dengan nama                     | toast, buka proposal baru dari `proposalId` jawaban                                                                                              | `POST /intake/upload` multipart: `file` (nama, `application/pdf`, ukuran, `%PDF-`) + `name` di-trim              | DSB-84                            |
| DSB-85 | Unggah tanpa nama                                 | toast sukses                                                                                                                                     | multipart hanya berisi `file`                                                                                    | DSB-85                            |
| DSB-86 | Unggah berkas bukan PDF                           | ditolak sebelum dikirim                                                                                                                          | 0 permintaan                                                                                                     | DSB-86                            |
| DSB-87 | Unggah > 20 MB                                    | ditolak sebelum dikirim                                                                                                                          | 0 permintaan                                                                                                     | DSB-87                            |
| DSB-88 | Unggah ditolak API                                | pesan API apa adanya, dialog tetap                                                                                                               | 1 permintaan                                                                                                     | DSB-88                            |
| DSB-90 | Simpan aturan, bobot ≠ 100%                       | total merah dan pesan                                                                                                                            | 0 permintaan                                                                                                     | `pengaturan-tulis.spec.ts` DSB-90 |
| DSB-91 | Simpan aturan tanpa alasan                        | pesan alasan wajib                                                                                                                               | 0 permintaan                                                                                                     | DSB-91                            |
| DSB-92 | Retensi 0 atau 1,5 hari                           | pesan retensi minimal                                                                                                                            | 0 permintaan                                                                                                     | DSB-92                            |
| DSB-93 | Batas kategori tidak menurun                      | pesan batas kategori                                                                                                                             | 0 permintaan                                                                                                     | DSB-93                            |
| DSB-94 | Simpan aturan yang sah (bobot diubah, retensi 60) | toast, alasan dikosongkan                                                                                                                        | `PUT /api/rules` = `settings/rules` emulator + suntingan, `models.asisten` tetap, tanpa `orchestrator`, `reason` | DSB-94                            |
| DSB-95 | Simpan aturan ditolak API                         | pesan API apa adanya, alasan tetap                                                                                                               | 1 permintaan                                                                                                     | DSB-95                            |
| DSB-96 | STOP                                              | toast                                                                                                                                            | `POST /api/runtime/stop` tanpa body                                                                              | DSB-96                            |
| DSB-97 | LANJUT saat dijeda                                | status "Dijeda (STOP)" dengan waktu dan lewat; toast                                                                                             | `settings/runtime` dijeda di emulator; `POST /api/runtime/resume`                                                | DSB-97                            |
| DSB-98 | STOP ditolak API                                  | pesan API apa adanya, tanpa toast sukses                                                                                                         | 1 permintaan                                                                                                     | DSB-98                            |

## Hasil

Semua baris dijalankan dengan `pnpm test:e2e:fast --shards 2 e2e/acceptance/` (lihat
[Gate](#gate)). "Lulus" berarti tes otomatisnya lolos; tiga baris defect lolos sebagai
`test.fail` yang gagal sesuai dugaan.

| ID             | Hasil | Teks persis / nilai                                                                                                                                                                                                                                                                                                                   |
| -------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DSB-01         | Lulus | "12 proposal belum ditanggapi."; ubin Sangat cocok 1, Cocok 4, Kurang cocok 1, Tidak cocok 3, Berkualitas, di luar fokus 1, Perlu dicek manual 2; "Sejak dd Okt 2026 09.00"; kartu "Ringkasan 09.00 · …" berisi "Yang menarik: proposal agritech naik dibanding minggu lalu."                                                         |
| DSB-02         | Lulus | "AI sedang dijeda (STOP). Proposal baru menunggu sebagai Antre sampai LANJUT di Pengaturan." → tautan ke /pengaturan yang menampilkan "Dijeda (STOP)"                                                                                                                                                                                 |
| DSB-03         | Lulus | tiap ubin → "Menampilkan N dari 14 proposal." dengan N sama dengan angka ubin                                                                                                                                                                                                                                                         |
| DSB-10..DSB-18 | Lulus | urutan 14 nama sesuai `createdAt`; "Tidak ada proposal yang cocok dengan filter ini."; "Menampilkan 0 dari 14 proposal."; `?kategori=hebat&status=selesai&tanggapan=mungkin&luarFokus=ya` → 14 baris dan pilihan "Semua"; `q` 121 karakter → 14 baris                                                                                 |
| DSB-20         | Lulus | "Tahap 1 — Skor kualitas 92.5"; "Aturan v1 · model gemini-3.8-flash · skor = Σ bobot × (nilai − 1) / 4, dihitung kode"; "“Tani Maju: pendiri pernah membangun dan keluar dari startup serupa.”"; "Tahap 2 — Cek kecocokan Lulus"; "Rp5 M dalam rentang Rp1 M–Rp20 M"; token "10.100 / 1.284"                                          |
| DSB-21         | Lulus | "Tahap 1 — Skor kualitas 82.5", "Tahap 2 — Cek kecocokan Gagal", "F&B di luar sektor fokus", Dari kode/Efektif "Tidak cocok", "Berkualitas, di luar fokus"                                                                                                                                                                            |
| DSB-22         | Lulus | "Perlu dicek manual", "teks terlalu sedikit (34 karakter di 12 halaman)", "Tidak dinilai: deck perlu dicek manual, tanpa skor dan kategori.", "Belum ada cek kecocokan.", Dari kode/Efektif "—", token "0 / 0"                                                                                                                        |
| DSB-23         | Lulus | Produk & keunggulan "2/5" dengan "kutipan tidak terverifikasi" (title "Tidak ada kutipan yang ditemukan di halamannya, jadi nilai dibatasi 2"), tanpa kutipan; hanya satu tanda di halaman                                                                                                                                            |
| DSB-24         | Lulus | "Tahap 1 — Skor kualitas 50.0"; Dari kode "Kurang cocok", Efektif "Cocok"; "Dikoreksi ke Cocok (…, Dashboard): Traksi di Muncar lebih kuat dari yang terbaca di deck"; riwayat "Koreksi kategori"                                                                                                                                     |
| DSB-25         | Lulus | `/aktivitas?job=job-penilaian-tanimaju#job-job-penilaian-tanimaju`, satu `details[open]`, "Menilai proposal Tani Maju"                                                                                                                                                                                                                |
| DSB-26..DSB-28 | Lulus | "1/5" + "tidak disebut"; "tahap pendanaan tidak disebut" dan "besar dana tidak disebut" bertanda Gagal; "Antre", "Belum ada penilaian."; "Undang dd Okt 2026 hh.mm via WhatsApp — Jadwalkan pitching minggu depan", tombol Undang nonaktif                                                                                            |
| DSB-30         | Lulus | "Insight terbaru", "Dari ringkasan 09.00 · …"; tabel per hari, per kategori, per sektor sama dengan jumlah 14 dokumen `dailyStats`; "Kategori dari kode saat dinilai. Ditambah N proposal perlu dicek manual (tanpa kategori)."                                                                                                       |
| DSB-40         | Lulus | semua langkah "(kode)" bertoken "0 / 0", langkah model berakhiran "· gemini-3.8-flash"; kepala kartu "Menilai proposal Bengkel Online" dan "Retensi harian" berlabel "(kode)" dan "0 / 0 token"                                                                                                                                       |
| DSB-50         | Lulus | 22 baris; baris "Proposal dihapus · (dihapus) · Data proposal dihapus (diarsipkan lebih dari 90 hari) · retensi · Sistem" tanpa tautan; "Panen Kita" bertaut ke `/proposal/form-seedpanenkita`                                                                                                                                        |
| DSB-60, DSB-61 | Lulus | "Berjalan", "versi 1", "Tim 27,5% · Pasar & masalah 30% · …", "90 hari — Proposal yang diarsipkan dihapus otomatis setelah 90 hari (setiap hari 02.00 WIB).", tanpa "Orchestrator", tanpa tombol tulis                                                                                                                                |
| DSB-62         | Gagal | kursi baca-saja melihat "Tanggapi semua 4 proposal Cocok yang belum ditanggapi:"; Arsipkan semua → Ya, lanjutkan → "Anda tidak memiliki izin"; 0 permintaan ke `aisa-api`. Bukti: `/tmp/claude-1000/-home-codeyzx-work-hackathon-aisa/59e19ace-403c-486b-b5ce-fe6136dd8397/scratchpad/qa-dashboard/viewer-bulk.png`                   |
| DSB-63         | Gagal | kursi baca-saja melihat "Unggah pitch deck"; memilih PDF lalu Unggah → "Anda tidak memiliki izin"; 0 permintaan. Bukti: `/tmp/claude-1000/-home-codeyzx-work-hackathon-aisa/59e19ace-403c-486b-b5ce-fe6136dd8397/scratchpad/qa-dashboard/viewer-upload.png`                                                                           |
| DSB-70..DSB-74 | Lulus | "Tanggapan tersimpan: Undang." / "Tanggapan tersimpan: Pantau."; body `{"kind":"undang","note":"Ajak pitching Kamis"}`, `{"kind":"pantau"}`; "proposal tidak ditemukan"; "aisa-api tidak dapat dihubungi. Coba lagi sebentar lagi."; klik ganda → 1 permintaan                                                                        |
| DSB-75..DSB-79 | Lulus | "Alasan koreksi wajib diisi."; "Kategori dikoreksi ke Kurang cocok." dengan `{"category":"kurang_cocok","reason":"Tim belum lengkap"}`; "hanya proposal yang sudah dinilai yang punya kategori"; "Tanggapi semua 4 proposal Cocok yang belum ditanggapi:", "Arsipkan 4 proposal?", "Arsipkan: 4 proposal Cocok."                      |
| DSB-80         | Gagal | API menjawab `{"count": 3}`, toast tetap "Arsipkan: 4 proposal Cocok.". Bukti: `/tmp/claude-1000/-home-codeyzx-work-hackathon-aisa/59e19ace-403c-486b-b5ce-fe6136dd8397/scratchpad/qa-dashboard/DSB-80-toast-count.png`                                                                                                               |
| DSB-81..DSB-83 | Lulus | "Hapus data Klinik Desa?"; "Alasan penghapusan wajib diisi."; `DELETE /api/proposals/upload-seedklinikdesa` `{"reason":"Permintaan founder lewat email (uji E2E)"}` → /proposal + "Data proposal Klinik Desa dihapus."; penolakan "proposal tidak ditemukan" di dalam dialog                                                          |
| DSB-84..DSB-88 | Lulus | "Pitch deck diterima dan sedang diproses." lalu `/proposal/upload-seedlogistiknusa`; multipart `file` + `name: "Sawit Digital (fiktif)"`; "Berkas harus PDF."; "Berkas terlalu besar (maksimal 20 MB)."; "berkas bukan PDF"                                                                                                           |
| DSB-90..DSB-95 | Lulus | "Total: 102.5% — harus 100%", "Total bobot harus 100% (sekarang 102.5%)."; "Alasan perubahan wajib diisi."; "Retensi minimal 1 hari (bilangan bulat)."; "Batas kategori harus menurun: sangat cocok > cocok > kurang cocok"; "Aturan penilaian tersimpan sebagai versi baru."; "bobot harus berisi kelima kriteria dan berjumlah 1,0" |
| DSB-96..DSB-98 | Lulus | "AI dijeda (STOP)." dengan `POST /api/runtime/stop` tanpa body; "Dijeda (STOP)", "Pekerjaan AI berhenti sejak … (lewat WhatsApp). Proposal baru menunggu sebagai Antre sampai LANJUT.", "AI dilanjutkan (LANJUT)."; "INTERNAL_API_KEY belum diatur"                                                                                   |

## Temuan

**Defect 1 — tanggapan massal ditawarkan ke kursi baca-saja** (DSB-62).
`app/(app)/proposal/page.tsx:172` merender `<BulkRespond>` hanya dengan syarat
`bulkCandidates > 0`, tanpa cek `aisa:respond`, sedangkan tombol tanggapan di detail dan Hapus
data disembunyikan untuk kursi itu. Tidak ada data yang berubah (server action menolak dengan
"Anda tidak memiliki izin"), tetapi kursi baca-saja ditawari tombol yang pasti gagal.

**Defect 2 — Unggah pitch deck ditawarkan ke kursi baca-saja** (DSB-63).
`app/(app)/hari-ini/page.tsx:87` dan `app/(app)/proposal/page.tsx:79` merender
`<UploadDeckButton />` untuk semua kursi. Penolakan baru muncul setelah memilih berkas dan
menekan Unggah.

**Defect 3 — toast tanggapan massal menyebut jumlah dari layar, bukan dari API** (DSB-80).
`app/(app)/proposal/_components/bulk-respond.tsx:51` menyusun "…: N proposal …" dari `count`
yang dihitung saat halaman dirender, bukan dari `{"count": …}` yang dijawab `aisa-api`. Bila
proposal ditanggapi lewat WhatsApp di antara memuat daftar dan menekan "Ya, lanjutkan", toast
melaporkan jumlah yang tidak terjadi.

**Istilah.** Overview §3 menulis tanda **"kutipan belum terverifikasi"**; layar menulis
**"kutipan tidak terverifikasi"** (DSB-23). Sudah tercatat di inventaris; tes mengikuti layar
sampai istilahnya diputuskan.

**Format angka.** Skor ditulis dengan titik desimal ("92.5", "50.0") dan total bobot di form
juga ("Total: 102.5%"), sedangkan bobot di ringkasan Pengaturan memakai koma ("27,5%") seperti
overview. Bukan defect fungsi; dicatat sebagai ketidakseragaman.

**Infra, bukan produk.** Tiap tes semula masuk lewat form login. Rute `POST /api/auth/session`
membatasi 10 sesi per uid per menit (`SESSION_MINT_BUDGET`), sehingga shard dengan lebih dari
10 tes manajer per menit menampilkan "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi."
di halaman login. Spec penerimaan kini masuk sekali per worker per peran lalu memakai ulang
cookie sesinya (`signInAs` di `e2e/acceptance/fixtures.ts`); pembuktian login tetap milik
`auth.spec.ts`.

## Data uji

Tidak ada proposal yang dibuat atau dihapus: tiruan `aisa-api` tidak menulis. Satu-satunya
tulisan ke emulator adalah `settings/runtime` (dijeda untuk DSB-02 dan DSB-97), yang
dikembalikan persis seperti semula di blok `finally` (`withRuntime` di `scripts/_e2e-firestore.ts`). Emulator dibuang setelah
setiap putaran. Deck uji: `Sawit_Digital_Fiktif_deck.pdf` (beberapa byte header PDF, startup
fiktif), dibuat di memori tes.

## Gate

| Perintah                                                                                                             | Exit | Hasil                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:e2e:fast --shards 2 e2e/acceptance/`                                                                      | 0    | 56/56 berjalan: 56 sesuai harapan (termasuk 3 `test.fail` defect), 0 tak terduga, 0 flaky, 0 dilewati, 80 dtk                                                                                                                 |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm structure:check`, `pnpm test:integration`, `pnpm build:ci` | 0    | —                                                                                                                                                                                                                             |
| `pnpm docs:check`                                                                                                    | 1    | hanya `index-membership` dan `manifest-membership` untuk `docs/qa/api.md`, `docs/qa/dashboard.md`, `docs/qa/penerimaan-produksi.md`: pendaftaran berkas QA di `docs/README.md` dan `scripts/docs/manifest.ts` belum dilakukan |
| `pnpm test:unit`                                                                                                     | 1    | 510 lolos, 1 gagal: `scripts/docs/check.test.ts` "real docs tree" — pelanggaran `docs:check` yang sama                                                                                                                        |

Putaran sebelumnya yang merah, semuanya kesalahan di sisi tes yang sudah diperbaiki dan dijalankan
ulang hingga hijau: locator `<dt>`/`<dd>` yang salah cakupan, pemilih langkah yang ikut membaca
tabel grafik, ID Klinik Desa yang salah (`form-` alih-alih `upload-`), dan batas sesi login di atas.
Tidak ada tes yang lolos ulang tanpa perubahan.

## Uji ulang

```bash
pnpm test:e2e:fast --shards 2 e2e/acceptance/
pnpm test:e2e:fast --shards 2 e2e/acceptance/tanggapan.spec.ts   # satu berkas
```

Saat defect diperbaiki, `test.fail()` pada DSB-62, DSB-63, atau DSB-80 membuat tes itu merah
("expected to fail, but passed"); hapus penandanya di perubahan yang sama dengan perbaikannya.

## Uji ulang — setelah perbaikan

Tiga defect dan format angka diperbaiki; penanda `test.fail()` pada DSB-62, DSB-63 dan DSB-80
sudah dihapus, jadi ketiganya kini tes biasa yang harus hijau.

| Kasus        | Hasil | Perbaikan                                                                                                                                                                        |
| ------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DSB-62       | Lulus | `app/(app)/proposal/page.tsx` merender `<BulkRespond>` hanya bila `can(session, AISA_RESPOND)`; kursi baca-saja tidak melihat "Tanggapi semua …" maupun tombol "… semua"         |
| DSB-63       | Lulus | "Unggah pitch deck" di Hari ini dan Proposal hanya untuk kursi dengan `aisa:respond` — kapabilitas yang sama yang diminta `uploadDeckAction`                                     |
| DSB-80       | Lulus | `bulkRespondAction` bertipe `{ count: number }`; toast memakai `count` jawaban `aisa-api` ("Arsipkan: 3 proposal Cocok."), bukan hitungan halaman                                |
| Format angka | Lulus | satu helper di `lib/format/number.ts`: `formatScore` ("92,5", "50,0") dan `formatPercent` ("27,5%", "Total: 102,5%") dipakai daftar, detail, ringkasan Pengaturan dan form bobot |

**Perubahan spec karena keputusan desimal.** Harapan teks bertitik desimal diganti koma, karena
yang berubah adalah keputusan format, bukan defect: `proposal-detail.spec.ts` ("Skor kualitas
92,5", "82,5", "50,0") dan `pengaturan-tulis.spec.ts` ("Total: 102,5% — harus 100%", "(sekarang
102,5%)"). Masukan `fill('27.5')` di DSB-94 tetap bertitik: itu nilai `<input type="number">`, bukan
teks tampilan.

| Perintah                                                                                                               | Exit | Hasil                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:e2e:fast --shards 2` atas kursi-baca, tanggapan, proposal-list, proposal-detail, pengaturan-tulis, hari-ini | 0    | 45/45 berjalan: 45 sesuai harapan, 0 tak terduga, 0 flaky, 0 dilewati, 45 dtk                                                                                    |
| putaran pertama perintah yang sama                                                                                     | 1    | 44/45: DSB-03 (Hari ini) — klik ubin pertama tidak berpindah ke `/proposal`; `hari-ini.spec.ts` sendirian dua kali 3/3 hijau, dan putaran penuh berikutnya hijau |
| `pnpm typecheck`, `pnpm lint`                                                                                          | 0    | lint hanya peringatan lama, tidak ada di berkas yang diubah                                                                                                      |
| `pnpm test:unit`                                                                                                       | 1    | 512 lolos, 1 gagal: `scripts/docs/check.test.ts` "real docs tree" — pendaftaran `docs/qa/*.md` dan pelanggaran di `docs/qa/api.md`, bukan berkas yang diubah     |

Kegagalan DSB-03 di putaran pertama belum dijelaskan; ia tidak menyentuh kode yang diubah (kursi
manajer, tombol unggah tetap tampil) dan tidak muncul lagi dalam tiga putaran berikutnya. Bila muncul
lagi, perlakukan sebagai flaky yang perlu diselidiki, bukan sebagai lulus.

## Uji UC7 — koreksi manajer sebagai bahan kalibrasi

Pengaturan → Kalibrasi kini membaca `proposals` langsung (read-only, tanpa `aisa-api`). Aturannya,
juga tertulis di layar: proposal **ditinjau manajer** bila punya `response` atau `correction`;
**AI sepakat** bila yang ditinjau tidak dikoreksi ke kategori lain (koreksi kembali ke kategori AI
dihitung sepakat, sama dengan aturan lencana "dikoreksi" di daftar). Arah koreksi dibaca pada skala
Sangat cocok → Tidak cocok: **naik** ke arah Sangat cocok, **turun** ke arah Tidak cocok. Subbagian
"Kalibrasi analis" (10–20 deck lama dinilai analis) tetap bertanda "belum ada data".

Kueri: `responded == true` dan `correction != null`, digabung per ID — dua filter satu field, tanpa
indeks komposit dan tanpa jendela 500 proposal. Dijalankan di emulator yang di-seed lalu
`pnpm indexes:check`: "No query requiring a composite index ran" (exit 1 menurut desain skrip saat
tidak ada indeks komposit yang dibutuhkan); `firestore.indexes.json` tidak diubah.

**Seed berubah.** Panen Kita (sudah diundang) kini juga dikoreksi Sangat cocok → Cocok, jadi seed
punya 3 ditinjau (Panen Kita, AplikasiX, Pasar Ikan), 2 koreksi (1 naik, 1 turun), sepakat 1 dari 3
(33,3%). Karena itu harapan dua spec ikut berubah: `proposal-list.spec.ts` DSB-11 (Panen Kita pindah
dari filter Sangat cocok ke Cocok) dan `tren-aktivitas-riwayat.spec.ts` DSB-50 (Riwayat 22 → 23
baris). Keduanya belum dijalankan ulang di putaran ini. Hari ini tidak berubah: Panen Kita sudah
ditanggapi.

| Kasus                | Hasil | Bukti                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DSB-99 (E2E, seed)   | Lulus | angka dihitung ulang dari emulator shard: ditinjau 3, dikoreksi 2, "Naik kategori 1 · Turun kategori 1", "… 1 dari 3 … (33,3%)", 2 baris tabel bertaut ke detail, keadaan kosong tidak tampil                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Unit `calibrate`     | Lulus | `features/aisa/aisa.calibration.test.ts`: tanpa tinjauan → tanpa persentase (bukan 0%); koreksi ke kategori AI = sepakat; urutan terbaru dulu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Produksi (baca saja) | Lulus | revisi `aisa-dashboard-00007-g4f`, image `aisa-dashboard:20261021-223716`, 21 Okt 2026 22.41 WIB. Layar: ditinjau 3, dikoreksi 1, naik 1 · turun 0, "AI sepakat dengan manajer pada 2 dari 3 proposal yang ditinjau (66,7%)", satu baris Kopi Teras Senja Tidak cocok → Sangat cocok (naik), skor 100,0, taut `/proposal/upload-9c721028b7267b5f`. Hitung ulang Firestore produksi (`google-cloud-firestore`): reviewed 3, corrected 1, agreed 2, 66,7%, naik 1, turun 0 — sama. Tidak ada tombol tulis yang diklik. Screenshot: `/tmp/claude-1000/-home-codeyzx-work-hackathon-aisa/59e19ace-403c-486b-b5ce-fe6136dd8397/scratchpad/kalibrasi-prod.png` |

| Perintah                                                                                                      | Exit | Hasil                                                                 |
| ------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------- |
| `pnpm test:e2e:fast --shards 2 e2e/acceptance/kalibrasi.spec.ts e2e/acceptance/pengaturan-tulis.spec.ts`      | 0    | 10/10: 10 sesuai harapan, 0 tak terduga, 0 flaky, 0 dilewati, 51 dtk  |
| `pnpm verify`                                                                                                 | 0    | unit 517/517, integrasi 16/16, build lolos                            |
| `gcloud builds submit` (build `45e79b40-6a60-4113-9685-f4b6134a5079`) lalu `gcloud run deploy aisa-dashboard` | 0    | SUCCESS 1m29s; revisi `aisa-dashboard-00007-g4f` melayani 100% trafik |

## Produksi setelah porting UI

Dashboard hasil porting UI prototipe diuji di produksi terhadap `aisa-api`, Firestore, dan
Asisten sungguhan: revisi `aisa-dashboard-00008-r69` (commit `0ed2c92`), `aisa-api-00011-q82`,
proyek `hackathon-primestep-09`, 22 Okt 2026 00.40–00.53 WIB. Masuk sebagai satu-satunya akun
Firebase Auth produksi (`manager@aisa.local`, peran admin); kata sandi dibaca dari Secret Manager
saat jalan, tidak dicetak dan tidak ditulis. Browser: Playwright Chromium dari `node_modules`,
1440×900 terang, satu putaran gelap, dan 390×844. Angka Firestore dihitung ulang dengan kueri
baca-saja (`google-cloud-firestore`) pada saat yang sama, bukan disalin dari layar.

Tulis hanya pada data sintetis: deck fiktif "QA Dash 0040" (fpdf2, 6 halaman teks, startup
agritech rekaan) yang diunggah lewat dashboard lalu dihapus di akhir. Aturan penilaian tidak
disimpan (dialog dibatalkan). Agent lain menguji WhatsApp bersamaan dengan proposal "QA WA …";
proposal itu tidak disentuh, tetapi kejadiannya ikut tampil di Riwayat dan notifikasi, jadi
hitungan di layar bergeser di antara putaran.

Skrip, log, dan screenshot: `/tmp/claude-1000/-home-codeyzx-work-hackathon-aisa/ec154574-91df-4732-b765-ec83050b58f6/scratchpad/prod-dash/`
(`read.mjs`, `read2.mjs`, `upload.mjs`, `write.mjs`, `ask.mjs`, `stoplanjut.mjs`,
`final.mjs`, `counts.py`, `fsprop.py`, `cascade.py`; screenshot di `shots/`).

| ID     | Aksi (lewat)                                                             | Hasil | Bukti                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD-01 | Dashboard, ubin dicocokkan dengan Firestore                              | Lulus | Sebelum unggah: Menunggu keputusan 7, Disarankan 4, Sudah ditanggapi 2, Total 9, Rata-rata skor 74,5, Perlu dicek manual 1. Hitung ulang: 9 proposal, 7 `responded != true`, 4 efektif Sangat cocok/Cocok belum ditanggapi, rata-rata 8 skor `dinilai` = 596,2 / 8 = 74,5, 1 `perlu_dicek_manual` — sama. "Berkualitas, di luar fokus 0" benar: satu-satunya `qualityOutsideFocus` (Kopi Teras Senja) dikoreksi ke Sangat cocok, dan ubin hanya menghitung yang efektif Tidak cocok. shots/baca-01-dashboard.png` |
| PRD-02 | Proposal: tab tanggapan, filter Kategori/Sektor/Status, Reset filter     | Lulus | 11 baris (termasuk QA Dash 0040 dan QA WA 0041): Belum 8, Sudah 3, Diundang 2, Diarsipkan 1; Kategori Cocok → 3 (`?kategori=cocok`); Sektor f&b → Kopi Teras Senja, Saku Hukum, Balkan Gourmet; Status Perlu dicek manual → Lumbung Ikan Pesisir. shots/baca-02-proposal.png`, baca-03-proposal-filter-status.png`                                                                                                                                                                                                |
| PRD-03 | Proposal: urut Skor (dua arah), Startup, Dana; paginasi                  | Lulus | Skor turun (bawaan) dan `?arah=naik` naik, proposal tanpa skor tetap di bawah di kedua arah; `?urut=nama` alfabetis; `?urut=dana` Rp24 M di atas. 11 baris < 12 per halaman: "Halaman 1 dari 1", kedua tombol halaman nonaktif                                                                                                                                                                                                                                                                                    |
| PRD-04 | Proposal: cari, CSV                                                      | Lulus | "klinik" dan " KLINIK " → 1 (Klinik Desa Sehat), `?q=klinik`; "zzz-tidak-ada" → "Tidak ada proposal yang cocok". `aisa.csv` header `Startup,Sektor,Tahap,Skor,Kategori,Status,Tanggapan,Dana dicari,Masuk`, 10 baris = daftar saat itu (QA WA 0041 sudah dihapus agent lain). shots/baca-03b-proposal-search-empty.png`                                                                                                                                                                                           |
| PRD-05 | Detail + panel Log penilaian → Aktivitas `?job=`                         | Lulus | Panel: "22 dtk · 5,9 rb token · 1/7 langkah oleh AI", 7 langkah (pypdf, kode, `gemini.generate_content` gemini-3.8-flash 21,3 dtk, "settings/rules v3", firestore). Tautan "Semua aktivitas AI" → `/aktivitas?job=penilaian-20261021174101-aac829#job-…`, tepat satu `details[open]` "Menilai proposal QA Dash 0040 … Token 2,9 rb / 3 rb" = job Firestore 2.933/2.976. shots/baca-05-detail-log-panel.png`, baca-06-aktivitas-job.png`                                                                           |
| PRD-06 | Tren                                                                     | Lulus | Tabel "Lihat sebagai tabel": 21 Okt 22 masuk (2/4/4/5/7, rata-rata 74,5), 22 Okt 2 — sama dengan `dailyStats/2026-10-21` `proposalsIn` 22, `byCategory`, `perluDicekManual` 7. Catatan: `dailyStats` mencatat saat masuk dan tidak berkurang saat proposal dihapus, jadi "7 perlu dicek manual" di Tren berbeda dari 1 di Dashboard menurut desain. shots/baca-07-tren.png`                                                                                                                                       |
| PRD-07 | Aktivitas AI: filter agent, "Tampilkan 12 lagi"                          | Lulus | Penilai 10, Asisten 12, Orchestrator 12, Pembuat ringkasan 2, Retensi 2 kartu; "Tampilkan 12 lagi" 12 → 24. Langkah kode bertoken 0. shots/baca-08-aktivitas.png`                                                                                                                                                                                                                                                                                                                                                 |
| PRD-08 | Riwayat: tab, cari, buka isi ringkasan, CSV                              | Lulus | Tab Keputusan 10, Penilaian AI 9–10, Proposal masuk 14–15, Ringkasan WA 3, Koreksi 5, Aturan 3, STOP/LANJUT 17, Dihapus 13–14 (bergeser karena agent WA). "Lihat isi" ada di tab Ringkasan WA (di tab Semua, ringkasan 20.40 berada di luar 40 baris pertama): kartu 2/2/0/0/1 + teks "Selamat malam, Pak. …". Cari "QA Dash" → 1 kejadian; CSV `Waktu,Jenis,Kejadian,Proposal,Pelaku,Kanal,Alasan` + 1 baris. shots/baca-10-riwayat-digest.png`                                                                  |
| PRD-09 | Aturan penilaian: "Ubah aturan", ubah nilai, lihat dampak, Batal         | Lulus | Tim 35 / Pasar 22,5 → "· sudah pas", "Tidak ada proposal yang pindah kategori"; Batas Sangat cocok 90 → "2 proposal akan pindah kategori · 0 naik · 2 turun", Sangat cocok 3→1, Cocok 2→4, contoh QA Dash 0040 dan Kelas Kode Rakyat (keduanya 85,6, benar). Batal menutup dialog; `settings/rules.version` tetap 3. shots/baca-12-aturan-dialog-impact.png`, baca-12b-aturan-dialog-threshold.png`                                                                                                               |
| PRD-10 | Pengaturan, kelima tab                                                   | Lulus | Profil (Administrator, tiga kemampuan), Tampilan (Terang/Gelap/Ikuti sistem), Ringkasan WhatsApp (pratinjau Pagi/Sore sesuai 7–8 belum ditanggapi), Integrasi (aisa-api "Terhubung", Firestore "Aturan versi 3"), Privasi (9 tersimpan, 90 hari). shots/baca-13-pengaturan-*.png`. Lihat temuan label ringkasan di bawah                                                                                                                                                                                          |
| PRD-11 | ⌘K, notifikasi, tema, menu pengguna, keluar                              | Lulus | Ctrl+K membuka palet; "Klinik" → "Klinik Desa Sehat healthtech · Cocok", Enter → `/proposal/upload-7436553c442b73cb`. Lonceng "Notifikasi, 10 belum dibaca" → daftar kejadian terbaru; "Tandai semua dibaca" → label "Notifikasi". Tombol bulan → `html.dark` (shots/baca-16-dashboard-dark.png`), kembali `light`. Menu: "Manager AISA · manager@aisa.local · Administrator · Lihat profil · Keluar"; Keluar → `/login`, lalu `/dashboard`→`/login?next=%2Fdashboard`                                            |
| PRD-12 | Layar 390 px                                                             | Lulus | `scrollWidth` 390 di Dashboard, Proposal, detail, Riwayat, Aturan, Pengaturan; navigasi menjadi baris ikon. `shots/M01-dashboard-390.png`, `M-*.png`                                                                                                                                                                                                                                                                                                                                                              |
| PRD-20 | Unggah pitch deck (Dashboard) deck QA Dash 0040                          | Lulus | "Pitch deck diterima dan sedang diproses." → `/proposal/upload-aca2b856f3ffa814`; ~22 dtk kemudian `dinilai` 85,6 Sangat cocok, token 2.933/2.976 = job `penilaian-20261021174101-aac829` (7 langkah), riwayat `proposal_masuk` via sistem. `shots/W01-upload-dialog.png`                                                                                                                                                                                                                                         |
| PRD-21 | Pantau di detail                                                         | Lulus | "Tanggapan tersimpan: Pantau." → "Sekarang: Dipantau · … via Dashboard"; `response` {pantau, via dashboard}, riwayat `tanggapan` after pantau                                                                                                                                                                                                                                                                                                                                                                     |
| PRD-22 | Undang dengan catatan                                                    | Lulus | "Tanggapan tersimpan: Undang."; `response.note` "QA: ajak diskusi, uji dashboard"; riwayat `tanggapan` before pantau → after undang, catatan di `reason`; layar menampilkan catatan                                                                                                                                                                                                                                                                                                                               |
| PRD-23 | Tanggapan massal pada pilihan: centang hanya QA Dash 0040, Pantau        | Lulus | Bilah "1 dipilih · Undang · Pantau · Arsipkan" → "Pantau: 1 proposal."; satu riwayat `tanggapan` undang → pantau, tidak ada proposal lain yang berubah. Tanggapan massal per kategori tidak dijalankan: kategorinya berisi proposal sungguhan. `shots/W-bulk-selected.png`                                                                                                                                                                                                                                        |
| PRD-24 | Koreksi kategori dengan alasan                                           | Lulus | "Kategori dikoreksi ke Cocok."; `category` tetap sangat_cocok, `effectiveCategory` cocok, skor tetap 85,6; riwayat `koreksi` sangat_cocok → cocok dengan alasan; Riwayat menampilkan kelima kejadian. `shots/W-koreksi.png`, `W-riwayat-before-delete.png`                                                                                                                                                                                                                                                        |
| PRD-25 | Hapus data, alasan "uji QA"                                              | Lulus | "Hapus data QA Dash 0040?" → "Data proposal QA Dash 0040 dihapus." → `/proposal`; detail lama 404. Firestore: proposal, `proposalTexts`, deck GCS, job + 7 langkah hilang; 5 riwayat disamarkan "(dihapus)"; satu `proposal_dihapus` via dashboard alasan "uji QA"; nama tidak tersisa di history/jobs/digests. Cari "QA Dash" di Riwayat dan Proposal kosong. `shots/W-hapus-after.png`                                                                                                                          |
| PRD-30 | Tanya AISA: "Berapa proposal yang belum saya tanggapi?"                  | Lulus | "Saat ini ada 7 proposal yang belum Anda tanggapi (dari total 10 proposal): Sangat cocok 2, Cocok 2, Tidak cocok 2, Perlu dicek manual 1" — Firestore saat itu: 10 proposal, 7 belum (Kopi Teras Senja, Kelas Kode Rakyat / Klinik Desa Sehat, Rantai Dingin Bahari / Saku Hukum, PT Hanum Fashion / Lumbung Ikan Pesisir). Job `asisten-20261021174806-9edcaa` (get_overview, 7.505/503) tampil di Aktivitas AI "7,5 rb / 503"                                                                                   |
| PRD-31 | Tanya AISA dari kartu detail Klinik Desa Sehat "Risiko yang perlu dicek" | Lulus | Pertanyaan "Apa risiko Klinik Desa Sehat?"; jawaban 78,1 · Cocok · Rp3 M seed, fakta Rp2,4 juta (hal. 6), 38 puskesmas pembantu / Rp1,1 miliar (hal. 5), tablet (hal. 3) — cocok dengan `proposalTexts` halaman 6 dan kutipan detail; saran AI diberi label terpisah. Job `asisten-20261021174820-b28314` (get_proposal_detail, 9.797/2.118). `shots/A03-q2-answer.png`                                                                                                                                           |
| PRD-40 | STOP lalu LANJUT di Pengaturan › Integrasi                               | Lulus | "AI dijeda (STOP)." → `settings/runtime` paused true, pausedVia dashboard, pausedAt 17:51:06Z; layar "Dijeda (STOP) … (lewat Dashboard)". "AI dilanjutkan (LANJUT)." 3 dtk kemudian → paused false, pausedAt/pausedVia null. Akhir: **tidak dijeda**. Riwayat STOP/LANJUT dua baris "via Dashboard" 00.51. `shots/S01-stopped.png`, `S02-resumed.png`                                                                                                                                                             |
| PRD-50 | Kursi baca-saja                                                          | Lewat | Firebase Auth produksi hanya punya satu akun (admin); tidak ada kursi baca-saja dan tidak dibuat                                                                                                                                                                                                                                                                                                                                                                                                                  |

Tidak ada `pageerror`, galat konsol, atau respons 5xx di semua putaran. Satu kali `page.goto` ke
detail melewati batas 30 dtk tanpa jejak di log Cloud Run (WARNING ke atas, 10 menit); ulangan
langsung berhasil.

### Temuan produksi

**Label waktu ringkasan terakhir memakai slot, bukan waktu kirim** (rendah).
`app/(app)/pengaturan/_components/digest-tab.tsx` menulis "Terakhir terkirim {tanggal} pukul
{slot}". Ringkasan terbaru di Firestore (`digests/2026-10-21-0900`, slot 09.00) terkirim
13:40:09Z = 20.40 WIB; layar Ringkasan WhatsApp berkata "Terakhir terkirim 21 Okt 2026 pukul
09.00", sedangkan Integrasi ("21 Okt 2026, 20.40"), Riwayat ("Ringkasan pagi terkirim 20.40"),
dan pratinjau ("Sejak ringkasan Rabu pukul 20.40") menulis 20.40.

**Rincian kartu "Keputusan dibuat" tidak menjumlah ke angkanya** (rendah). Riwayat: "Keputusan
dibuat 10 · 1 diundang · 1 dipantau · 1 diarsip". `app/(app)/riwayat/_components/metrics.ts`
menghitung rincian dari jenis tanggapan di baris riwayat, dan penghapusan proposal mengosongkan
`after` baris tanggapannya ("Rincian dihapus bersama proposal"): 7 dari 10 keputusan minggu ini
milik proposal yang sudah dihapus. Rincian diam-diam menghilangkan 7 itu, tanpa "7 lainnya".

**Saran Tanya AISA menyebut proposal yang tidak ada di produksi** (rendah).
`app/(app)/_components/assistant/assistant-drawer.tsx` mengodekan saran "Kenapa skor Panen
Kita segitu?"; Panen Kita hanya ada di seed emulator, tidak ada di Firestore produksi.

Sisa data: tidak ada dokumen, deck GCS, job, atau nama "QA Dash" yang tersisa; `settings/rules`
tetap versi 3; `settings/runtime.paused` false.
