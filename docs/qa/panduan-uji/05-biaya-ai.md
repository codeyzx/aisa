# Panduan uji: Biaya AI

## Cakupan

Panduan ini untuk Anda yang menguji halaman **Biaya AI** (`/biaya`) di produksi
(https://aisa-dashboard-lk5jbo3eza-et.a.run.app). Halaman ini menjawab tiga pertanyaan: berapa
biaya AI AISA sejauh ini, berapa biaya untuk satu proposal, satu pertanyaan, dan satu ringkasan,
dan berapa yang dihemat dibanding analis yang menyaring setiap proposal sendiri. Semua use case di
sini hanya membaca. Kalkulator hanya mengubah alamat halaman, tidak menyimpan apa pun.

Semua angka di halaman ini **perkiraan**, bukan angka tagihan: jumlah token yang dicatat AISA
dikalikan harga resmi Vertex AI, lalu dikonversi ke rupiah dengan kurs acuan. Angka contoh di
panduan ini dihitung dari rumus di kode, bukan dari layar produksi. Angka di layar Anda bergantung
pada pemakaian yang tercatat.

Akun uji: `manager@aisa.local` dengan sandi admin dari tim.

## Angka acuan untuk mengecek hitungan

Pakai angka ini untuk menghitung ulang dengan kalkulator biasa. Semuanya juga tertulis di bagian
**Cara menghitung dan sumber** di bawah halaman (UC-BYA-09).

| Hal                                          | Nilai                                                 |
| -------------------------------------------- | ----------------------------------------------------- |
| Harga `gemini-3.8-flash` s.d. 31 Des 2026    | $0,75 per 1 juta token masuk, $3,75 per 1 juta keluar |
| Harga `gemini-3.8-flash` mulai 1 Jan 2027    | $1,50 per 1 juta token masuk, $7,50 per 1 juta keluar |
| Kurs acuan                                   | Rp 17.917 per USD (Bank Indonesia JISDOR, 6 Okt 2026) |
| Kredit uji coba Google Cloud                 | $300                                                  |
| Bawaan kalkulator: gaji analis per bulan     | Rp 14.500.000                                         |
| Bawaan kalkulator: jam kerja per bulan       | 173 jam                                               |
| Bawaan kalkulator: menit analis per proposal | 15 menit                                              |
| Bawaan kalkulator: menit membaca hasil AISA  | 2 menit                                               |
| Ringkasan WhatsApp yang dihitung kalkulator  | 36 per bulan (09.00 setiap hari, 17.00 setiap Jumat)  |

Rumus dasarnya:

- **Biaya token (USD)** = (token masuk × harga masuk + token keluar × harga keluar) ÷ 1.000.000.
- **Rupiah** = USD × 17.917. Biaya di bawah Rp 1 ditulis **< Rp 1**, bukan Rp 0.
- Semua token masuk dihargai penuh. AISA tidak mencatat token yang dilayani dari cache, jadi
  angkanya batas atas.

Contoh: penilaian satu proposal yang memakai 2.767 token masuk dan 1.608 token keluar pada
Oktober 2026 berbiaya (2.767 × 0,75 + 1.608 × 3,75) ÷ 1.000.000 = $0,0081, atau sekitar
Rp 145.

## Daftar use case

- [UC-BYA-01 · Membuka halaman Biaya AI](#uc-bya-01--membuka-halaman-biaya-ai)
- [UC-BYA-02 · Owner ingin tahu total biaya AI sejauh ini](#uc-bya-02--owner-ingin-tahu-total-biaya-ai-sejauh-ini)
- [UC-BYA-03 · Berapa biaya per proposal, per pertanyaan, dan per ringkasan](#uc-bya-03--berapa-biaya-per-proposal-per-pertanyaan-dan-per-ringkasan)
- [UC-BYA-04 · Membandingkan dengan analis yang cek manual](#uc-bya-04--membandingkan-dengan-analis-yang-cek-manual)
- [UC-BYA-05 · Mengubah setiap asumsi kalkulator satu per satu](#uc-bya-05--mengubah-setiap-asumsi-kalkulator-satu-per-satu)
- [UC-BYA-06 · Memakai tarif 2027 dan membagikan perhitungan lewat tautan](#uc-bya-06--memakai-tarif-2027-dan-membagikan-perhitungan-lewat-tautan)
- [UC-BYA-07 · Ke mana biayanya](#uc-bya-07--ke-mana-biayanya)
- [UC-BYA-08 · Biaya per hari dan Lihat sebagai tabel](#uc-bya-08--biaya-per-hari-dan-lihat-sebagai-tabel)
- [UC-BYA-09 · Cara menghitung dan sumber](#uc-bya-09--cara-menghitung-dan-sumber)
- [UC-BYA-10 · Membuka Biaya AI dari ponsel](#uc-bya-10--membuka-biaya-ai-dari-ponsel)

## Membuka halaman

### UC-BYA-01 · Membuka halaman Biaya AI

**Situasi:** Anda ingin melihat biaya AI AISA.

**Sebelum mulai:** sudah masuk.

**Langkah:**

1. Di sidebar kiri, grup **Ruang kerja**, klik **Biaya AI** (di bawah **Aktivitas AI**, ikon
   dompet).
2. Kembali ke **Dashboard**, tekan ⌘K (Ctrl+K di Windows), ketik `biaya`, pilih **Biaya AI**.

**Yang seharusnya terlihat:** alamat menjadi `/biaya`. Judul header **Biaya AI** dengan
keterangan **Berapa biaya AI dan berapa yang dihemat dibanding cek manual**. Di bawahnya judul
bagian **Biaya pemakaian AI** dengan catatan **Perkiraan dari token × harga resmi Vertex AI, bukan
angka tagihan**. Urutan isi halaman: lima kotak angka, kotak **AISA vs cek manual**, lalu
berdampingan **Ke mana biayanya** dan **Biaya per hari**, dan paling bawah **Cara menghitung dan
sumber** yang masih tertutup.

**Kalau berbeda:** kalau menu **Biaya AI** tidak ada di sidebar, catat akun yang Anda pakai.

## Biaya sejauh ini

### UC-BYA-02 · Owner ingin tahu total biaya AI sejauh ini

**Situasi:** Owner bertanya, "Sudah habis berapa untuk AI sejak AISA dipakai?"

**Sebelum mulai:** di halaman **Biaya AI**.

**Langkah:**

1. Lihat kotak pertama yang paling lebar, **Total biaya AI**.
2. Arahkan kursor ke angka rupiahnya, lalu ke tulisan "… token" di bawahnya.
3. Lihat kotak terakhir, **Kredit uji coba $300**.
4. Lihat apakah ada catatan kecil di bawah deretan kotak yang diawali angka dan berbunyi "token
   belum dihitung biayanya".

**Yang seharusnya terlihat:**

- **Total biaya AI** menampilkan rupiah besar, mis. `Rp 12.345`. Di bawahnya: harga dalam dolar,
  jumlah token, dan sejak kapan, mis. `$0,6890 untuk 1,3 jt token, sejak 6 Okt 2026`. Dolar di
  bawah $1 ditulis sampai empat angka di belakang koma.
- Kursor di angka rupiah memunculkan harga dolarnya. Kursor di "… token" memunculkan jumlah token
  persis, mis. `1.312.408`.
- Kalau AI belum pernah dipakai, tulisannya `belum ada pemakaian tercatat`. Kalau catatan harian
  sudah lebih dari 400 hari, tulisannya `dalam 400 hari tercatat terakhir`.
- **Kredit uji coba $300** menampilkan persentase total biaya terhadap $300 (mis. `0,23%`,
  bagian yang sangat kecil ditulis `< 0,01%`), batang tipis, dan keterangan **Bila pemakaian ini
  ditagihkan ke kredit uji coba Google Cloud**.
- Catatan "… token belum dihitung biayanya: tarif belum tersedia untuk model atau jenis
  pekerjaannya." hanya muncul kalau ada token yang modelnya tidak ada di daftar harga. Token itu
  ikut dihitung di jumlah token, tapi tidak diberi harga.

**Cara mengecek angkanya:**

- Rupiah = dolar × 17.917. Contoh: $0,6890 × 17.917 ≈ Rp 12.345.
- Persentase kredit = dolar ÷ 300 × 100. Contoh: $0,6890 ÷ 300 = 0,23%.
- Total ini dihitung dari catatan harian pemakaian, yang tetap ada walaupun proposalnya dihapus.
  Jadi menghapus proposal uji tidak menurunkan total.
- Untuk mengecek total dari token, pakai rincian per agent di UC-BYA-07.

**Kalau berbeda:** catat angka rupiah, dolar, dan jumlah token persisnya. Kalau rupiah ÷ 17.917
jauh dari dolarnya, itu bug.

### UC-BYA-03 · Berapa biaya per proposal, per pertanyaan, dan per ringkasan

**Situasi:** Anda ingin tahu biaya AI untuk menilai satu proposal, menjawab satu pertanyaan, dan
menulis satu ringkasan WhatsApp.

**Sebelum mulai:** di halaman **Biaya AI**. Ada proposal yang sudah dinilai AI.

**Langkah:**

1. Lihat kotak **Per proposal dinilai**, **Per pertanyaan Asisten**, dan **Per ringkasan WA**.
2. Buka satu proposal yang sudah dinilai di tab baru. Di kartu Ringkasan AI, catat tulisan kecil
   "Dibuat dari proposal · … token". Klik **Lihat log penilaian**, lalu **Semua aktivitas AI**,
   dan arahkan kursor ke angka token kartunya untuk melihat "… masuk / … keluar" (sama seperti
   UC-AKT-07 di panduan Aktivitas).
3. Hitung biaya proposal itu dengan rumus di atas.

**Yang seharusnya terlihat:**

- Setiap kotak menampilkan rupiah rata-rata, lalu dolarnya dan jumlah yang dirata-rata, mis.
  `Rp 145` dan `$0,0081 · rata-rata 9 proposal`. Biaya di bawah Rp 1 ditulis **< Rp 1**.
- Kalau belum ada datanya, kotak menampilkan `—` dengan keterangan **Belum ada proposal yang
  dinilai model**, **Belum ada pertanyaan ke Asisten**, atau **Belum ada ringkasan yang ditulis
  model**.
- Biaya proposal yang Anda hitung di langkah 3 seharusnya sekelas dengan rata-rata di kotak
  (rata-rata bisa lebih tinggi atau lebih rendah karena proposal berbeda panjangnya).

**Yang perlu diketahui:**

- Rata-rata ini dari log pekerjaan AI (paling banyak 500 pekerjaan terbaru), setiap pekerjaan
  dengan model dan tanggalnya sendiri. Proposal yang dinilai lebih dari sekali (mis. dinilai ulang
  setelah STOP) dihitung sekali dengan semua biaya penilaiannya dijumlahkan.
- Pekerjaan penilaian ikut terhapus bersama proposalnya. Jadi rata-rata per proposal hanya dari
  proposal yang masih ada, sedangkan **Total biaya AI** tetap memuat proposal yang sudah dihapus.
- Pekerjaan yang tidak memakai token tidak ikut dirata-rata.

**Kalau berbeda:** catat angka kotak, token proposal yang Anda pakai, dan hasil hitungan Anda.

## Kalkulator AISA vs cek manual

Kalkulator membandingkan biaya **penyaringan awal** per bulan. Keputusan Setuju atau Tolak
tetap di tangan manajer di kedua sisi, jadi tidak dihitung. Kalau belum ada proposal yang
dinilai model, kotak ini hanya menampilkan **Perbandingan muncul setelah ada proposal yang dinilai
model dengan tarif yang tersedia.**

Rumus kalkulator (n = **Proposal per bulan**):

- Biaya per menit orang = **Gaji analis per bulan** ÷ **Jam kerja per bulan** ÷ 60.
- **Cek manual per bulan** = n × **Menit analis per proposal** × biaya per menit.
- **AISA per bulan** = n × (biaya AI per proposal + **Menit membaca hasil AISA** × biaya per
  menit) + 36 × biaya AI per ringkasan.
- **Hemat per bulan** = cek manual − AISA. "× lebih murah" = cek manual ÷ AISA. "% lebih hemat" =
  hemat ÷ cek manual × 100. "per tahun" = hemat × 12.
- **Jam analis kembali** = n × (menit analis − menit membaca) ÷ 60, tidak pernah di bawah 0.
- **Biaya AI per bulan** = n × biaya AI per proposal + 36 × biaya AI per ringkasan.
- Pertanyaan ke Asisten tidak ikut dihitung karena dipakai sesuai kebutuhan, bukan per proposal.

Dengan bawaan (Rp 14.500.000, 173 jam): biaya per menit = Rp 1.396,92. Cek manual 15 menit =
**Rp 20.954** per proposal. Membaca hasil AISA 2 menit = **Rp 2.794** per proposal.

### UC-BYA-04 · Membandingkan dengan analis yang cek manual

**Situasi:** Owner bertanya, "Lebih murah mana: AISA atau analis yang membaca setiap proposal?"

**Sebelum mulai:** di halaman **Biaya AI**, alamat masih `/biaya` tanpa tanda tanya.

**Langkah:**

1. Di kotak **AISA vs cek manual**, baca keterangan di bawah judulnya.
2. Lihat kolom kiri (form **Asumsi perbandingan**): **Proposal per bulan**, **Menit analis per
   proposal**, **Menit membaca hasil AISA**, **Gaji analis per bulan**, **Jam kerja per bulan**, dan
   **Tarif AI**. Baca keterangan kecil di bawah setiap kolom.
3. Lihat kolom kanan: angka besar, dua batang, dua kotak kecil, dan tabel **Per proposal**.
4. Ganti **Proposal per bulan** menjadi `100`.

**Yang seharusnya terlihat:**

- Keterangan di bawah **Proposal per bulan** berbunyi `Bawaan: laju 30 hari tercatat terakhir
  (…/bulan)`. Angka bawaannya adalah proposal masuk dalam 30 hari terakhir, disetarakan ke 30 hari
  (kalau catatan baru ada kurang dari 30 hari, dipakai sebanyak hari yang ada).
- Keterangan **Menit analis per proposal** menyebut pembanding DocSend × HBS 2015 (3 menit 44
  detik hanya untuk membuka-baca proposal), keterangan **Gaji analis per bulan** menyebut GrabJobs
  2026, dan keterangan **Jam kerja per bulan** berbunyi `40 jam × 52 minggu ÷ 12`. Kedua sumber adalah
  tautan yang terbuka di tab baru.
- **Tarif AI** punya dua tombol: **s.d. 31 Des 2026** (aktif, karena sekarang masih 2026) dan
  **Mulai 1 Jan 2027**.
- Setelah langkah 4: angka besar **Hemat per bulan** beserta baris hijau "… × lebih murah · …%
  lebih hemat · Rp … per tahun". Batang **Cek manual per bulan** di atas batang **AISA per bulan**,
  yang lebih kecil diberi panjang sebanding. Dengan bawaan, **Cek manual per bulan** = 100 ×
  Rp 20.954 = **Rp 2.095.376**.
- **Jam analis kembali**: `21,7 jam` (100 × 13 menit ÷ 60), keterangan **per bulan, untuk kerja
  selain menyaring**. **Biaya AI per bulan**: keterangan **penilaian + hingga 36 ringkasan WA**.
- Tabel **Per proposal** (kolom **Cek manual** dan **AISA**):

  | Baris             | Cek manual | AISA                             |
  | ----------------- | ---------- | -------------------------------- |
  | Waktu orang       | 15 menit   | 2 menit                          |
  | Biaya waktu orang | Rp 20.954  | Rp 2.794                         |
  | Biaya AI          | —          | biaya AI per proposal            |
  | Total             | Rp 20.954  | Rp 2.794 + biaya AI per proposal |

- Di bawah tabel ada catatan bahwa biaya AI per proposal adalah rata-rata dari sejumlah proposal
  yang sudah dinilai, dihitung ulang dengan tarif terpilih, dan bahwa ringkasan dihitung 36 kali
  sebulan (09.00 setiap hari dan 17.00 setiap Jumat) dengan rata-rata Rp … per ringkasan. Kalau belum ada ringkasan yang ditulis model,
  catatannya berbunyi **Ringkasan belum ikut dihitung karena belum ada ringkasan yang ditulis
  model.**
- Biaya AI per proposal di tabel sama dengan angka di kotak **Per proposal dinilai** selama tarif
  terpilih adalah tarif yang berlaku sekarang.

**Cara mengecek angkanya:** AISA per bulan = 100 × (Rp 2.794 + biaya AI per proposal) + 36 ×
biaya per ringkasan. Hemat = Rp 2.095.376 − AISA per bulan. Hasilnya bisa berbeda Rp 1 karena
pembulatan.

**Kalau berbeda:** catat isi kelima kolom dan semua angka di kanan.

### UC-BYA-05 · Mengubah setiap asumsi kalkulator satu per satu

**Situasi:** Tim Anda punya angka sendiri dan ingin melihat apakah AISA tetap lebih murah.

**Sebelum mulai:** UC-BYA-04 sudah dijalankan: **Proposal per bulan** = `100`, kolom lain bawaan.
Kembalikan setiap kolom ke bawaan sebelum langkah berikutnya.

**Langkah dan yang seharusnya terlihat:**

1. **Menit analis per proposal** = `30`. Biaya waktu orang cek manual menjadi **Rp 41.908**, cek
   manual per bulan **Rp 4.190.751**, **Jam analis kembali** `46,7 jam`. Kembalikan ke `15`.
2. **Menit membaca hasil AISA** = `5`. Biaya waktu orang AISA menjadi **Rp 6.985**, **Jam analis
   kembali** `16,7 jam`, dan hemat per bulan turun. Kembalikan ke `2`.
3. **Gaji analis per bulan** = `29000000` (boleh diketik dengan atau tanpa titik). Kedua biaya
   waktu orang naik dua kali: Rp 41.908 dan Rp 5.588. Biaya AI per proposal tidak berubah.
   Setelah Anda klik di luar kolom, angkanya ditulis `29.000.000`. Kembalikan ke `14500000`.
4. **Jam kerja per bulan** = `346`. Kedua biaya waktu orang turun setengah: Rp 10.477 dan
   Rp 1.397. Kembalikan ke `173`.
5. **Menit analis per proposal** = `2` (sama dengan menit membaca). Judul angka besar berganti
   menjadi **Selisih per bulan** dan barisnya berbunyi **Dengan asumsi ini AISA tidak lebih murah dari cek
   manual.** **Jam analis kembali** `0 jam`. Ini benar: kalau analis sama cepatnya dengan membaca
   hasil AISA, AISA hanya menambah biaya AI. Kembalikan ke `15`.
6. Klik **Menit analis per proposal**, hapus semua isinya, lalu klik di luar kolom. Selama kolom
   kosong, angka di kanan tidak berubah. Setelah keluar dari kolom, kolom kembali berisi angka
   terakhir yang sah.
7. Ketik huruf, mis. `abc`, di kolom mana saja. Huruf tidak masuk; hanya angka yang diterima.
8. Ketik angka di atas batas: **Menit analis per proposal** `999`. Hasil di kanan langsung dihitung
   dengan `600`, dan setelah Anda klik di luar kolom, isinya menjadi `600`. Batas lainnya:
   **Proposal per bulan** 100.000, **Menit membaca hasil AISA** 600, **Gaji analis per bulan**
   1.000.000.000, **Jam kerja per bulan** 744.

**Kalau berbeda:** catat kolom, isi yang Anda ketik, dan angka yang muncul.

### UC-BYA-06 · Memakai tarif 2027 dan membagikan perhitungan lewat tautan

**Situasi:** Harga perkenalan model berakhir 31 Des 2026. Anda ingin melihat perbandingan dengan
harga standar, lalu mengirim hasilnya ke owner.

**Sebelum mulai:** di kotak **AISA vs cek manual**, **Proposal per bulan** = `100`, kolom lain
bawaan.

**Langkah:**

1. Catat **Biaya AI** di tabel **Per proposal** dan **Biaya AI per bulan**.
2. Klik tombol **Mulai 1 Jan 2027**. Arahkan kursor ke tombol untuk melihat nama lengkapnya.
3. Lihat alamat di browser.
4. Ganti **Menit analis per proposal** menjadi `20`, lalu salin alamat dari browser.
5. Buka alamat itu di tab baru.
6. Klik **s.d. 31 Des 2026** dan ganti **Menit analis per proposal** kembali ke `15`.

**Yang seharusnya terlihat:**

- Di langkah 2, tombol **Mulai 1 Jan 2027** menjadi aktif. Nama lengkapnya **Harga standar mulai
  1 Jan 2027**. **Biaya AI** per proposal dan **Biaya AI per bulan** kira-kira dua kali angka
  langkah 1, karena harga masuk dan keluar sama-sama dua kali lipat ($1,50 dan $7,50). Biaya waktu
  orang tidak berubah. Kotak **Per proposal dinilai** di atas tidak ikut berubah: tarif hanya
  mengubah kalkulator.
- Di langkah 3, alamat menjadi `/biaya?proposal=100&tarif=1` (urutan bagian alamat bisa berbeda).
- Di langkah 5, tab baru menampilkan isian dan hasil yang sama: 100 proposal, 20 menit, tarif 2027.
- Di langkah 6, `tarif` dan `menit` hilang dari alamat. Nilai yang sama dengan bawaan tidak
  ditulis di alamat. Mengganti isian tidak menambah riwayat browser: tombol **Back** tidak
  menelusuri setiap angka yang Anda ketik.

**Yang perlu diketahui:** kalau alamat tidak memuat `proposal`, bawaannya laju 30 hari terakhir,
jadi tautan tanpa `proposal` bisa menunjukkan angka berbeda di hari lain.

**Kalau berbeda:** catat alamat lengkap dan angka sebelum dan sesudah.

## Rincian biaya

### UC-BYA-07 · Ke mana biayanya

**Situasi:** Owner bertanya, "Biaya AI paling banyak untuk apa?"

**Sebelum mulai:** di halaman **Biaya AI**.

**Langkah:**

1. Di kartu **Ke mana biayanya** (keterangan **Per agent, dari semua token yang tercatat**), baca
   ketiga baris agent.
2. Arahkan kursor ke tulisan "… token" di setiap baris.
3. Baca bagian **Token masuk vs keluar** di bawahnya.

**Yang seharusnya terlihat:**

- Tiga baris, diurutkan dari yang paling mahal: **Penilai** (Membaca dan menilai proposal),
  **Pembuat ringkasan** (Ringkasan WhatsApp harian 09.00 dan mingguan Jumat 17.00, termasuk insight-nya), dan
  **Asisten** (Menjawab pertanyaan manajer). Setiap baris: rupiah, persentase dari total, batang
  berwarna agent, jumlah token, dan dolarnya.
- Kursor di "… token" memunculkan "… masuk / … keluar".
- Kalau model agent tidak punya harga, barisnya berbunyi **tarif belum tersedia**.
- **Token masuk vs keluar**: satu batang dua warna dengan catatan **lebar batang = bagian biaya**,
  lalu `Masuk: …% token, …% biaya (Rp …)` dan `Keluar: …% token, …% biaya (Rp …)`. Bagian keluar
  di biaya jauh lebih besar daripada di jumlah token.
- Paragraf penjelasan token menyebut bahwa tarif token keluar `5×` token masuk ($3,75 ÷ $0,75).

**Cara mengecek angkanya:**

- Persentase ketiga agent dijumlahkan ≈ 100%, dan rupiahnya dijumlahkan ≈ **Total biaya AI**.
- Rp Masuk + Rp Keluar ≈ **Total biaya AI**.
- Untuk satu agent (pemakaian sebelum 2027): (token masuk × 0,75 + token keluar × 3,75) ÷
  1.000.000 = dolar di baris itu. Contoh: 1.000.000 masuk dan 100.000 keluar = $0,75 + $0,375 =
  $1,125, atau sekitar Rp 20.157.

**Kalau berbeda:** catat ketiga baris (rupiah, persen, token persis) dan total di atas.

### UC-BYA-08 · Biaya per hari dan Lihat sebagai tabel

**Situasi:** Anda ingin melihat hari mana biaya AI paling tinggi.

**Sebelum mulai:** di halaman **Biaya AI**.

**Langkah:**

1. Di kartu **Biaya per hari**, baca keterangannya.
2. Arahkan kursor ke batang tertinggi.
3. Klik **Lihat sebagai tabel** di bawah grafik.

**Yang seharusnya terlihat:**

- Keterangan `… hari terakhir, per agent`: sebanyak hari sejak hari pertama yang ada biayanya
  sampai hari ini, paling banyak 60 hari; grafik mulai dari hari itu. Legenda tiga warna: **Penilai**, **Pembuat ringkasan**,
  **Asisten**. Setiap hari satu batang bertumpuk per agent, sumbu kiri dalam rupiah ringkas (mis.
  `Rp 1,2 rb`).
- Kursor di batang memunculkan tanggal lengkap dan rupiah setiap agent.
- Tabel berkolom **Tanggal**, **Penilai**, **Pembuat ringkasan**, **Asisten**, **Total**. Hari
  tanpa pemakaian sesudah hari pertama itu tetap ada dengan `Rp 0`. Kursor di sel **Total** memunculkan dolarnya.
- Kalau AI belum pernah dipakai: **Belum ada hari yang tercatat** dan **Grafik muncul setelah AI
  dipakai untuk pertama kali.**

**Cara mengecek angkanya:** setiap baris, Penilai + Pembuat ringkasan + Asisten = **Total**
(selisih Rp 1 karena pembulatan wajar). Kalau pemakaian pertama kurang dari 60 hari lalu, jumlah
kolom **Total** ≈ **Total biaya AI** di atas. Hari ditentukan menurut jam WIB.

**Kalau berbeda:** catat tanggal, isi baris tabel, dan isi tooltip-nya.

### UC-BYA-09 · Cara menghitung dan sumber

**Situasi:** Owner bertanya, "Angka ini dari mana? Bisa dipercaya?"

**Sebelum mulai:** di halaman **Biaya AI**, gulir ke paling bawah.

**Langkah:**

1. Klik **Cara menghitung dan sumber** (tulisan **Buka** di kanan).
2. Baca kolom **Harga yang dipakai**, lalu **Yang dihitung** dan **Yang tidak dihitung**.
3. Klik tautan **halaman harga Vertex AI** dan **tabel resmi**.
4. Klik judulnya lagi (tulisan **Tutup**).

**Yang seharusnya terlihat:**

- Tabel harga berkolom **Model · periode**, **Masuk**, **Masuk (cache)**, **Keluar**, dua baris
  `gemini-3.8-flash`: **Harga perkenalan s.d. 31 Des 2026** ($0,75, $0,075, $3,75) dan **Harga
  standar mulai 1 Jan 2027** ($1,50, $0,15, $7,50). Catatan di bawahnya: USD per 1 juta token,
  Vertex AI tier Standard, endpoint global, diambil 22 Okt 2026, dan setiap hari dihitung dengan
  tarif yang berlaku pada tanggal pemakaiannya.
- Catatan bahwa tagihan bisa menampilkan harga daftar $1,50 / $7,50 lalu potongan kredit 50%.
- **Kurs acuan: Rp 17.917 per USD** (Bank Indonesia JISDOR, 6 Okt 2026), dengan peringatan bahwa
  kurs di tagihan atau kartu bisa berbeda.
- Daftar model per agent: **Penilai**, **Pembuat ringkasan**, **Insight (bagian ringkasan)**,
  **Asisten**, masing-masing dengan nama modelnya.
- **Yang dihitung**: total, rincian, dan grafik dari catatan harian (tetap ada saat proposal
  dihapus, dihargai dengan model yang sekarang diatur untuk agent itu); rata-rata dari log
  pekerjaan AI (jumlah pekerjaan yang dibaca, paling banyak 500); token masuk dihargai penuh.
- **Yang tidak dihitung**: memori Asisten (Memory Bank), komputasi dan penyimpanan Agent Runtime,
  panggilan model di luar aplikasi (pengembangan dan uji coba), serta Cloud Run, Firestore, dan
  penyimpanan berkas proposal.
- Kedua tautan terbuka di tab baru.

**Kalau berbeda:** kalau nama model di daftar agent bukan `gemini-3.8-flash` padahal tabel harga
hanya memuat model itu, biaya agent tersebut akan tertulis **tarif belum tersedia** (UC-BYA-07).
Catat namanya.

## Ponsel

### UC-BYA-10 · Membuka Biaya AI dari ponsel

**Situasi:** Owner membuka halaman biaya dari ponsel.

**Sebelum mulai:** sudah masuk di ponsel (atau browser laptop yang dipersempit sampai kurang dari
kira-kira 860 piksel).

**Langkah:**

1. Di deretan ikon paling atas, ketuk ikon dompet (**Biaya AI**).
2. Gulir dari atas ke bawah.
3. Di kalkulator, ketuk **Proposal per bulan** dan ketik `50`.
4. Ketuk **Lihat sebagai tabel** dan **Cara menghitung dan sumber**.

**Yang seharusnya terlihat:** **Total biaya AI** memenuhi satu baris, empat kotak lainnya dua per
baris. **Ke mana biayanya** dan **Biaya
per hari** satu kolom. Di layar selebar ponsel (di bawah kira-kira 768 piksel), kalkulator
tersusun ke bawah: isian dulu, lalu hasilnya. Di langkah 3 muncul papan angka (bukan papan huruf) dan hasilnya langsung
berubah. Tabel yang lebih lebar dari layar bisa digeser di dalam kotaknya sendiri; halaman
sendiri tidak perlu digeser ke samping.

**Kalau berbeda:** catat ukuran layar dan bagian yang terpotong atau menumpuk, dengan tangkapan
layar.
