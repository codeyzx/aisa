# Menyiapkan Google Form intake founder

Hasil akhir: founder mengisi Google Form dan mengunggah pitch deck (PDF) → Apps Script
mengirim data ke `POST /intake/form` di aisa-api (bertanda tangan HMAC) → aisa-api
mengunduh deck dari Drive dan menilainya → proposal muncul di dashboard.

Semua langkah dikerjakan di browser dengan akun Google pemilik form. Kerjakan berurutan;
setiap langkah punya tanda **✅ Berhasil bila** untuk mengecek sebelum lanjut. Waktu
total sekitar 15 menit.

Yang perlu disiapkan: nilai `INTAKE_SECRET`, diambil dengan perintah berikut:

```bash
gcloud secrets versions access latest --secret=intake-secret --project hackathon-primestep-09
```

## Langkah 1 — Buat form kosong

1. Buka <https://forms.google.com>.
2. Klik **Blank form** (Formulir kosong). Jangan isi apa pun di form.
3. Klik judul "Untitled form" di kiri atas dan ganti menjadi `Pengajuan proposal startup`,
   lalu klik di luar kotak judul.

✅ Berhasil bila: form kosong berjudul _Pengajuan proposal startup_ terbuka di editor.

## Langkah 2 — Buka editor Apps Script

1. Di editor form, klik ikon **⋮** (More / Lainnya) di kanan atas, sebelah tombol
   **Send**.
2. Pilih **Apps Script**. Tab baru terbuka berisi editor dengan file `Code.gs`.
3. Klik judul proyek "Untitled project" di kiri atas, ganti menjadi `AISA intake`, klik
   **Rename**.

✅ Berhasil bila: tab Apps Script terbuka dengan file `Code.gs` berisi
`function myFunction() {}`.

## Langkah 3 — Tampilkan file manifest

1. Di sidebar kiri Apps Script, klik ikon roda gigi **Project Settings**.
2. Centang **Show "appsscript.json" manifest file in editor**.
3. Klik ikon **< >** (**Editor**) di sidebar kiri untuk kembali ke editor.

✅ Berhasil bila: daftar file di kiri sekarang berisi `appsscript.json` dan `Code.gs`.

## Langkah 4 — Tempel `appsscript.json`

1. Klik `appsscript.json` di daftar file.
2. Pilih semua isinya (Ctrl+A) dan hapus.
3. Salin seluruh isi file
   [`integrations/apps-script/appsscript.json`](../../integrations/apps-script/appsscript.json)
   dan tempel.
4. Simpan dengan **Ctrl+S**.

## Langkah 5 — Tempel `Code.gs`

1. Klik `Code.gs` di daftar file.
2. Pilih semua isinya (Ctrl+A) dan hapus.
3. Salin seluruh isi file
   [`integrations/apps-script/Code.gs`](../../integrations/apps-script/Code.gs) dan
   tempel. Tidak ada yang perlu diubah: nama organisasi, periode retensi (90 hari) dan
   email kontak sudah terisi.
4. Simpan dengan **Ctrl+S**.

✅ Berhasil bila: menyimpan tidak memunculkan error merah, dan dropdown fungsi di
toolbar atas berisi `setupForm`, `installTrigger`, `onFormSubmit`, `testSignedPing`.

## Langkah 6 — Isi script properties

1. Klik **Project Settings** (roda gigi) di sidebar kiri.
2. Gulir ke bawah ke **Script Properties**, klik **Add script property**.
3. Tambahkan dua properti berikut. Klik **Add script property** lagi untuk properti
   kedua, lalu **Save script properties**.

| Property        | Value                                                   |
| --------------- | ------------------------------------------------------- |
| `AISA_API_URL`  | `https://aisa-api-441293875661.asia-southeast2.run.app` |
| `INTAKE_SECRET` | nilai `INTAKE_SECRET` yang disiapkan di awal            |

Salin persis, tanpa spasi tambahan dan tanpa garis miring di akhir URL.

✅ Berhasil bila: kedua properti tampil di bagian Script Properties.

## Langkah 7 — Jalankan `setupForm` (mengisi pertanyaan form)

1. Kembali ke **Editor** (< >).
2. Di toolbar atas, pilih fungsi **`setupForm`** di dropdown, lalu klik **Run**.
3. Muncul _Authorization required_ → **Review permissions** → pilih akun Anda.
4. Muncul _Google hasn't verified this app_ → klik **Advanced** →
   **Go to AISA intake (unsafe)**. Peringatan ini muncul karena script dibuat sendiri,
   bukan karena berbahaya.
5. Klik **Allow**.

✅ Berhasil bila: _Execution log_ di bawah menampilkan **Execution completed**, dan di
tab form (refresh) sekarang ada pemberitahuan tujuan beserta empat pertanyaan:
_Nama startup_, _Nama founder_, _Email founder_, _Persetujuan_.

Pertanyaan unggah pitch deck yang sudah dibuat lebih dulu (langkah 8) tidak masalah:
`setupForm` membiarkannya dan memindahkannya ke urutan terakhir. Bila muncul error
"Form sudah berisi pertanyaan selain unggah file", form sudah pernah disiapkan; hapus
pertanyaan lain itu dulu, lalu jalankan `setupForm` lagi.

## Langkah 8 — Tambahkan pertanyaan unggah pitch deck (manual)

Apps Script tidak bisa membuat pertanyaan unggah file, jadi yang ini dibuat di form:

1. Di tab form, klik **⊕ Add question** (ikon tambah di panel kanan).
2. Ketik judul: `Pitch deck (PDF)`.
3. Ubah tipe pertanyaan (dropdown di kanan, default _Multiple choice_) menjadi
   **File upload**. Bila muncul dialog tentang penyimpanan di Drive, klik **Continue**.
4. Atur:
   - **Allow only specific file types** → aktifkan, centang **PDF**.
   - **Maximum number of files** → `1`.
   - **Maximum file size** → `10 MB`.
5. Aktifkan **Required** di kanan bawah pertanyaan.

Form hanya boleh punya **satu** pertanyaan unggah file. Jangan ganti judul empat
pertanyaan dari langkah 7, karena script membacanya berdasarkan judul.

✅ Berhasil bila: form berisi lima pertanyaan, yang terakhir _Pitch deck (PDF)_ bertipe
File upload dan wajib.

## Langkah 9 — Uji koneksi ke aisa-api

1. Di Apps Script, pilih fungsi **`testSignedPing`**, klik **Run**.
2. Lihat _Execution log_.

✅ Berhasil bila: log berisi **422** dan `OK: tanda tangan diterima`. Uji ini mengirim
data tanpa persetujuan, jadi tidak ada proposal yang dibuat.

Bila log berisi **401**, `INTAKE_SECRET` salah: ulangi langkah 6 dan pastikan tidak ada
spasi. Bila berisi error URL, periksa `AISA_API_URL`.

## Langkah 10 — Pasang trigger

1. Pilih fungsi **`installTrigger`**, klik **Run**. Bila diminta izin lagi, ulangi
   langkah 7 butir 3–5.
2. Klik ikon jam **Triggers** di sidebar kiri untuk mengecek.

✅ Berhasil bila: ada tepat satu baris trigger `onFormSubmit` dengan event
_From form – On form submit_.

## Langkah 10b — Publikasikan form

Google Forms baru tidak bisa diisi sebelum dipublikasikan; link responden menampilkan
"Dokumen ini tidak diterbitkan".

1. Di editor form, klik tombol **Publish** (Publikasikan) di kanan atas.
2. Dialog _Publikasikan formulir_: pastikan **Responden** = _Siapa saja yang memiliki
   link_, lalu klik **Publish**.

✅ Berhasil bila: link responden (ikon tautan di kanan atas) membuka form dan bisa diisi.

## Langkah 11 — Kirim satu respons uji

1. Di tab form, klik **Send** → ikon tautan → **Copy**, buka tautannya di tab baru.
2. Isi semua pertanyaan, unggah PDF pitch deck berteks (boleh
   `fixtures/decks/pitch-deck.pdf`), centang persetujuan, klik **Submit**.

Pengiriman pertama ini membuat Google membuat folder unggahan di Drive, yang dibutuhkan
langkah berikutnya.

## Langkah 12 — Bagikan folder unggahan ke service account

aisa-api mengunduh deck dengan service account-nya sendiri, jadi folder unggahan harus
bisa dibacanya.

1. Buka <https://drive.google.com> dengan akun pemilik form.
2. Cari folder **`Pengajuan proposal startup (File responses)`**.
3. Klik kanan folder → **Share** → **Share**.
4. Tempel email berikut, pilih peran **Viewer**, hilangkan centang **Notify people**,
   klik **Share** (atau **Share anyway** bila ada peringatan):

```text
hackathon-runtime@hackathon-primestep-09.iam.gserviceaccount.com
```

Semua file di dalam folder, termasuk subfolder per pertanyaan, ikut bisa dibaca.

✅ Berhasil bila: email service account tampil sebagai Viewer di dialog Share folder.

## Langkah 13 — Cek proposal uji di dashboard

1. Apps Script → ikon **Executions** di sidebar kiri. Baris `onFormSubmit` terbaru
   berstatus **Completed**, dan log-nya berisi `intake/form 202`.
2. Buka dashboard → **Proposal**. Proposal dari langkah 11 muncul, mula-mula _Antre_,
   lalu _Dinilai_ dalam sekitar satu menit (atau _Perlu dicek manual_ bila teks PDF-nya
   terlalu sedikit).

Respons uji di langkah 11 dikirim sebelum folder dibagikan, jadi proposal itu bisa
tertahan di _Antre_ dengan alasan `404 Not Found`. Itu wajar: kirim satu respons uji
lagi (PDF yang sama pun boleh, tetapi itu menjadi proposal kedua), atau kirim `LANJUT` ke bot WhatsApp:
LANJUT memproses ulang semua proposal yang berstatus _Antre_. Respons kedua ini harus
sampai ke _Dinilai_. Proposal uji yang tertahan bisa dihapus dengan tombol
**Hapus data** di halaman detailnya.

## Bila ada masalah

| Gejala                                             | Penyebab                                   | Perbaikan                                    |
| -------------------------------------------------- | ------------------------------------------ | -------------------------------------------- |
| `testSignedPing` → 401                             | `INTAKE_SECRET` salah atau berspasi        | Ulangi langkah 6                             |
| Executions → `onFormSubmit` **Failed**             | aisa-api tidak membalas 202; lihat log-nya | Baca pesan di log; cek properti di langkah 6 |
| Proposal tertahan _Antre_ dengan `404 Not Found`   | Folder unggahan belum dibagikan            | Ulangi langkah 12, lalu kirim respons baru   |
| Tidak ada baris di Executions setelah Submit       | Trigger belum terpasang                    | Ulangi langkah 10                            |
| Error "Pertanyaan … tidak ditemukan" di Executions | Judul pertanyaan diubah                    | Kembalikan judul seperti di langkah 7        |

Proposal dari form diidentifikasi dengan ID file Drive-nya, bukan dengan isi PDF-nya.
Setiap respons form menyimpan file baru di Drive, jadi mengirim PDF yang sama lewat form
dua kali membuat dua proposal. Yang tidak membuat proposal baru hanyalah permintaan
`intake/form` yang dikirim ulang dengan ID file Drive yang sama. Unggahan dari dashboard berbeda: proposal-nya diidentifikasi dengan hash isi PDF,
jadi PDF yang sama tidak membuat proposal kedua.
