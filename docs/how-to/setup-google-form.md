# Menyiapkan Google Form intake founder

Alur: founder mengisi Google Form dan mengunggah pitch deck ke Drive → trigger
`onFormSubmit` (Apps Script) mengirim data ke `POST /intake/form` di aisa-api dengan
tanda tangan HMAC → aisa-api mengunduh deck dari Drive dengan service account runtime
dan menilainya.

Kode: [`integrations/apps-script/Code.gs`](../../integrations/apps-script/Code.gs) dan
[`appsscript.json`](../../integrations/apps-script/appsscript.json). Kontrak endpoint:
[`services/api/README.md`](../../services/api/README.md).

Semua langkah di bawah dikerjakan manusia di UI Google; tidak ada yang otomatis.

## 1. Buat form dan tempel script

1. Buat Google Form **kosong** dengan akun pemilik (forms.google.com → Blank).
2. Di form: **⋮ → Apps Script**. Ini membuat script yang terikat ke form tersebut.
3. **Project Settings** → centang _Show "appsscript.json" manifest file in editor_.
4. Ganti isi `Code.gs` dan `appsscript.json` di editor dengan isi file di repo.
5. Di `Code.gs`, isi tiga konstanta yang muncul di pemberitahuan tujuan: `ORG_NAME`,
   `RETENTION`, `CONTACT`. `setupForm()` menolak jalan selama masih berisi `[ISI …]`.
   Catatan: aisa-api belum punya penghapusan otomatis; janji retensi di pemberitahuan
   dipenuhi secara manual sampai mekanisme itu ada.
6. Pilih fungsi `setupForm` → **Run** → izinkan akses. Form kini berisi judul,
   pemberitahuan tujuan (UU 27/2022), _Nama startup_, _Nama founder_, _Email founder_,
   dan kotak persetujuan wajib.

## 2. Tambahkan pertanyaan unggah pitch deck (manual)

FormApp tidak bisa membuat pertanyaan unggah file, jadi tambahkan di UI form:

- Tipe **File upload**, judul bebas (mis. _Pitch deck (PDF)_), **Required**.
- _Allow only specific file types_ → **PDF**; _Maximum number of files_ → **1**;
  _Maximum file size_ → **10 MB** (aisa-api menolak deck > 20 MB).
- Pertanyaan unggah file mewajibkan responden login dengan akun Google.
- Script mengenali pertanyaan ini dari tipenya, bukan judulnya. Form hanya boleh punya
  **satu** pertanyaan unggah file. Jangan ganti judul empat pertanyaan lain tanpa
  mengganti `TITLES` di `Code.gs` juga.

## 3. Isi script properties

**Project Settings → Script properties**:

| Properti        | Nilai                                                                      |
| --------------- | -------------------------------------------------------------------------- |
| `AISA_API_URL`  | `https://aisa-api-441293875661.asia-southeast2.run.app`                    |
| `INTAKE_SECRET` | keluaran perintah di bawah (tempel langsung, jangan simpan di tempat lain) |

```bash
gcloud secrets versions access latest --secret=intake-secret --project hackathon-primestep-09
```

Cek: jalankan `testSignedPing`. Fungsi ini mengirim body bertanda tangan dengan
`consent: false`, sehingga tidak ada proposal yang dibuat. Log harus menunjukkan
**422** (`OK: tanda tangan diterima`). **401** berarti `INTAKE_SECRET` tidak cocok.

## 4. Pasang trigger

Jalankan `installTrigger` sekali. Ini memasang trigger _installable_ `onFormSubmit`
(menghapus trigger lama dengan handler yang sama lebih dulu). Cek di **Triggers**:
satu baris `onFormSubmit` / _From form_ / _On form submit_.

Bila aisa-api tidak membalas 202, eksekusi ditandai **Failed** di **Executions** dan
Google mengirim email kegagalan trigger ke pemilik script (sesuai pengaturan trigger).

## 5. Bagikan folder unggahan ke service account

aisa-api mengunduh deck dengan service account runtime, jadi folder unggahan form
harus bisa dibaca akun itu. Script **tidak** membagikan file satu per satu: itu butuh
scope `drive` penuh, sedangkan script ini hanya meminta `drive.readonly` (untuk membaca
nama file).

1. Di Drive pemilik form, cari folder **`<judul form> (File responses)`**. Folder ini
   dibuat Google untuk pertanyaan unggah; bila belum ada, kirim satu respons uji dulu.
2. **Share** folder itu ke
   `hackathon-runtime@hackathon-primestep-09.iam.gserviceaccount.com` sebagai
   **Viewer**. Abaikan peringatan notifikasi; email ke service account tidak berdampak.
3. File di dalamnya (termasuk subfolder per pertanyaan) mewarisi akses folder.

Bila langkah ini terlewat, proposal tetap tercatat tetapi tertahan di status `antre`
dengan `statusReason` berisi `404 Not Found` dari Drive.

## 6. Uji ujung ke ujung

1. Buka form (tombol **Send** / link responden), isi semua pertanyaan, unggah PDF
   pitch deck yang berteks, centang persetujuan, kirim.
2. Apps Script → **Executions**: `onFormSubmit` berstatus _Completed_, log berisi
   `intake/form 202 … {"proposalId":"form-<driveFileId>","created":true}`.
3. Dashboard → **Proposal**: proposal baru muncul dan berpindah dari _Antre_ ke
   _Dinilai_ (atau _Perlu dicek manual_ bila teksnya terlalu sedikit). Bila tetap
   _Antre_ dengan alasan `404 Not Found`, ulangi langkah 5.

Mengirim ulang trigger untuk file yang sama tidak menilai ulang: proposal idempoten
berdasarkan ID file Drive (`created: false`).
