# Panduan uji: masuk, tampilan umum, Dashboard, dan Tren

## Cakupan

Panduan ini untuk Anda yang menguji AISA sendiri di produksi
(https://aisa-dashboard-lk5jbo3eza-et.a.run.app). Isinya: masuk dan keluar, sidebar kiri, header
atas (judul, sapaan, pencarian ⌘K, lonceng, tema, menu akun), tampilan di ponsel, halaman
**Dashboard**, dan halaman **Tren**. Hampir semua use case di sini hanya membaca. Yang mengubah
sesuatu ditandai ⚠️. Detail unggah pitch deck dan isi halaman proposal ada di panduan Proposal di
folder yang sama. Nama proposal di contoh (mis. Kopi Teras Senja) diambil dari produksi saat
panduan ditulis. Datanya bisa berubah, jadi pakai nama yang ada di layar Anda.

Akun uji: `manager@aisa.local` dengan sandi admin dari tim.

## Daftar use case

- [UC-DSB-01 · Masuk ke AISA](#uc-dsb-01--masuk-ke-aisa)
- [UC-DSB-02 · Salah mengetik sandi](#uc-dsb-02--salah-mengetik-sandi)
- [UC-DSB-03 · Kolom masuk dibiarkan kosong](#uc-dsb-03--kolom-masuk-dibiarkan-kosong)
- [UC-DSB-04 · Membuka tautan AISA saat belum masuk](#uc-dsb-04--membuka-tautan-aisa-saat-belum-masuk)
- [UC-DSB-05 · Keluar dari AISA](#uc-dsb-05--keluar-dari-aisa)
- [UC-DSB-06 · Menyembunyikan dan menampilkan sidebar](#uc-dsb-06--menyembunyikan-dan-menampilkan-sidebar)
- [UC-DSB-07 · Membaca badge Proposal dan kotak Ringkasan WhatsApp](#uc-dsb-07--membaca-badge-proposal-dan-kotak-ringkasan-whatsapp)
- [UC-DSB-08 · Judul halaman dan sapaan](#uc-dsb-08--judul-halaman-dan-sapaan)
- [UC-DSB-09 · Pagi hari: berapa yang menunggu, mana yang paling layak](#uc-dsb-09--pagi-hari-berapa-yang-menunggu-mana-yang-paling-layak)
- [UC-DSB-10 · Langsung membuka proposal tertentu tanpa lewat menu](#uc-dsb-10--langsung-membuka-proposal-tertentu-tanpa-lewat-menu)
- [UC-DSB-11 · Lompat ke halaman lain lewat pencarian](#uc-dsb-11--lompat-ke-halaman-lain-lewat-pencarian)
- [UC-DSB-12 · Pencarian tanpa hasil](#uc-dsb-12--pencarian-tanpa-hasil)
- [UC-DSB-13 · Melihat notifikasi terbaru](#uc-dsb-13--melihat-notifikasi-terbaru)
- [UC-DSB-14 · Menandai semua notifikasi sudah dibaca](#uc-dsb-14--menandai-semua-notifikasi-sudah-dibaca)
- [UC-DSB-15 · Ganti tema terang dan gelap](#uc-dsb-15--ganti-tema-terang-dan-gelap)
- [UC-DSB-16 · Melihat profil dari menu akun](#uc-dsb-16--melihat-profil-dari-menu-akun)
- [UC-DSB-17 · Memakai AISA dari ponsel](#uc-dsb-17--memakai-aisa-dari-ponsel)
- [UC-DSB-18 · Empat kartu angka di Dashboard dan ke mana masing-masing membawa](#uc-dsb-18--empat-kartu-angka-di-dashboard-dan-ke-mana-masing-masing-membawa)
- [UC-DSB-19 · Strip insight di bawah kartu](#uc-dsb-19--strip-insight-di-bawah-kartu)
- [UC-DSB-20 · Menunggu keputusan per kategori dan hitungan tanggapan](#uc-dsb-20--menunggu-keputusan-per-kategori-dan-hitungan-tanggapan)
- [UC-DSB-21 · Kartu Tren proposal di Dashboard](#uc-dsb-21--kartu-tren-proposal-di-dashboard)
- [UC-DSB-22 · Aktivitas terakhir](#uc-dsb-22--aktivitas-terakhir)
- [UC-DSB-23 · Tombol Unggah pitch deck di Dashboard](#uc-dsb-23--tombol-unggah-pitch-deck-di-dashboard)
- [UC-DSB-24 · Banner saat AI dijeda ⚠️](#uc-dsb-24--banner-saat-ai-dijeda-️)
- [UC-DSB-25 · Tren: proposal masuk per hari dan tabelnya](#uc-dsb-25--tren-proposal-masuk-per-hari-dan-tabelnya)
- [UC-DSB-26 · Tren: proposal per sektor dan rata-rata skor](#uc-dsb-26--tren-proposal-per-sektor-dan-rata-rata-skor)
- [UC-DSB-27 · Tren: pemakaian token AI](#uc-dsb-27--tren-pemakaian-token-ai)

## Masuk dan keluar

### UC-DSB-01 · Masuk ke AISA

**Situasi:** Anda ingin mulai bekerja di AISA.

**Sebelum mulai:** belum masuk (atau sudah keluar). Siapkan sandi admin dari tim.

**Langkah:**

1. Buka https://aisa-dashboard-lk5jbo3eza-et.a.run.app.
2. Di kartu **Masuk ke AISA**, isi kolom **Email** dengan `manager@aisa.local`.
3. Isi kolom **Kata sandi**. Klik ikon mata di ujung kanan kolom untuk melihat sandi yang Anda
   ketik, klik lagi untuk menyembunyikannya.
4. Klik **Masuk**.

**Yang seharusnya terlihat:** alamat otomatis pindah ke `/login` di langkah 1. Saat tombol
**Masuk** diklik, muncul putaran kecil di tombol. Lalu halaman pindah ke `/dashboard`, judul
header **Dashboard**, dan sidebar kiri tampil dengan grup **Ruang kerja** dan **Lainnya**.

**Kalau berbeda:** catat teks yang muncul di kotak merah (kalau ada) dan jam kejadiannya.

### UC-DSB-02 · Salah mengetik sandi

**Situasi:** Anda salah mengetik sandi.

**Sebelum mulai:** di halaman **Masuk ke AISA**.

**Langkah:**

1. Isi **Email** dengan `manager@aisa.local`.
2. Isi **Kata sandi** dengan `salah-sandi-uji`.
3. Klik **Masuk**.

**Yang seharusnya terlihat:** kotak merah bertuliskan **Email atau kata sandi salah**. Anda tetap
di `/login`. Email yang salah (mis. `orang@lain.id`) memberi pesan yang sama persis, jadi
halaman tidak membocorkan email mana yang terdaftar. Kalau Anda mencoba berkali-kali dengan
cepat, pesannya bisa berganti menjadi **Terlalu banyak percobaan. Tunggu sebentar lalu coba
lagi.**

**Kalau berbeda:** pesan lain (mis. **Tidak dapat masuk saat ini. Coba lagi.**) berarti layanan
masuk sedang bermasalah, bukan sandinya. Catat.

### UC-DSB-03 · Kolom masuk dibiarkan kosong

**Situasi:** Anda menekan **Masuk** sebelum mengisi semua kolom.

**Sebelum mulai:** di halaman **Masuk ke AISA**, kedua kolom kosong.

**Langkah:**

1. Ketik `manager` (tanpa `@…`) di **Email**, lalu klik kolom **Kata sandi**.
2. Biarkan **Kata sandi** kosong, lalu klik di luar kolom.
3. Klik **Masuk**.

**Yang seharusnya terlihat:** di bawah **Email** muncul **Email tidak valid**. Di bawah **Kata
sandi** muncul **Kata sandi wajib diisi**. Klik **Masuk** tidak membawa Anda ke mana-mana.

**Kalau berbeda:** kalau form terkirim tanpa pesan, catat sebagai bug validasi.

### UC-DSB-04 · Membuka tautan AISA saat belum masuk

**Situasi:** Rekan mengirim tautan proposal, tapi Anda belum masuk di browser ini.

**Sebelum mulai:** belum masuk. Pakai jendela penyamaran (incognito) supaya pasti.

**Langkah:**

1. Buka langsung `https://aisa-dashboard-lk5jbo3eza-et.a.run.app/tren`.
2. Perhatikan alamat di browser.
3. Masuk seperti di UC-DSB-01.

**Yang seharusnya terlihat:** di langkah 1 Anda dibawa ke `/login?next=%2Ftren`, tanpa sidebar
dan tanpa data apa pun. Setelah masuk, Anda langsung tiba di halaman **Tren**, bukan Dashboard.
Hal yang sama berlaku untuk tautan proposal (mis. `/proposal/<id>`): setelah masuk, proposal itu
yang terbuka.

**Kalau berbeda:** kalau ada data yang terlihat sebelum masuk, itu masalah keamanan. Segera
laporkan dengan tangkapan layar.

### UC-DSB-05 · Keluar dari AISA

**Situasi:** Anda selesai bekerja di komputer bersama.

**Sebelum mulai:** sudah masuk.

**Langkah:**

1. Di kanan atas, klik lingkaran inisial Anda (mis. **MA**) dengan nama **Manager AISA**.
2. Klik **Keluar** (tulisan merah, paling bawah).
3. Setelah tiba di halaman masuk, tekan tombol **Back** browser, atau ketik lagi alamat
   `/dashboard`.

**Yang seharusnya terlihat:** di langkah 2 Anda pindah ke `/login`. Di langkah 3 Anda tetap
dibawa ke halaman masuk (alamat menjadi `/login?next=…`), bukan ke Dashboard.

**Kalau berbeda:** kalau muncul toast **Gagal keluar — Anda masih masuk. Silakan coba lagi.**,
Anda belum keluar. Ulangi. Kalau Dashboard masih terbuka setelah keluar, catat sebagai bug.

## Sidebar

### UC-DSB-06 · Menyembunyikan dan menampilkan sidebar

**Situasi:** Anda ingin layar lebih lega untuk membaca tabel.

**Sebelum mulai:** sudah masuk, di layar laptop.

**Langkah:**

1. Di sidebar kiri, sebelah logo **AISA by Aixel**, klik ikon panel (tooltip **Sembunyikan
   sidebar**).
2. Muat ulang halaman (F5).
3. Di kiri header, klik ikon panel (tooltip **Tampilkan sidebar**).

**Yang seharusnya terlihat:** di langkah 1 sidebar hilang dan konten melebar. Di langkah 2
sidebar tetap tersembunyi, karena pilihan Anda diingat browser ini. Di langkah 3 sidebar muncul
lagi dan ikon di header hilang.

**Kalau berbeda:** kalau sidebar muncul lagi sendiri setelah muat ulang, catat. Pilihan ini
memang hanya untuk browser yang Anda pakai, bukan untuk semua perangkat.

### UC-DSB-07 · Membaca badge Proposal dan kotak Ringkasan WhatsApp

**Situasi:** Sekilas, Anda ingin tahu berapa proposal menunggu dan kapan ringkasan WhatsApp
berikutnya.

**Sebelum mulai:** sudah masuk, sidebar tampil.

**Langkah:**

1. Lihat menu **Proposal** di grup **Ruang kerja**. Ada angka kecil di kanannya.
2. Lihat kotak di bagian bawah sidebar, berjudul **Ringkasan WhatsApp**.
3. Bandingkan angkanya dengan kartu **Menunggu keputusan** di Dashboard.

**Yang seharusnya terlihat:** angka badge di **Proposal**, baris **… proposal menunggu
keputusan** di kotak bawah, dan kartu **Menunggu keputusan** di Dashboard sama persis (saat
panduan ditulis: 7). Kalau tidak ada yang menunggu, badge tidak tampil. Baris **Berikutnya**
menunjukkan **09.00** atau **17.00** (WIB): 17.00 kalau sekarang antara pukul 09.00 dan 17.00,
selain itu 09.00.

**Kalau berbeda:** angka yang tidak sama di tiga tempat itu adalah bug. Catat ketiganya.

## Header

### UC-DSB-08 · Judul halaman dan sapaan

**Situasi:** Anda ingin memastikan header selalu menyebut halaman yang sedang dibuka.

**Sebelum mulai:** sudah masuk.

**Langkah:**

1. Buka **Dashboard** dari sidebar. Baca judul dan baris kecil di bawahnya.
2. Klik **Proposal**, lalu **Tren**, lalu **Riwayat**. Baca judulnya setiap kali.
3. Buka salah satu proposal dari daftar.

**Yang seharusnya terlihat:**

- Dashboard: judul **Dashboard**, baris bawah berupa sapaan seperti **Selamat pagi, Pak · Kamis,
  22 Oktober**. Kata sapaan mengikuti jam WIB: **pagi** sebelum 12.00, **siang** sebelum 15.00,
  **sore** sesudahnya (termasuk malam).
- Proposal: **Proposal** dengan **7 menunggu keputusan Anda** (angkanya sama dengan badge).
- Tren: **Tren** dengan **14 hari terakhir**.
- Riwayat: **Riwayat** dengan **Jejak audit: siapa melakukan apa, dan kapan**.
- Detail proposal: **Proposal** dengan **Detail proposal**.
- Menu yang sedang dibuka di sidebar tampak tersorot.

**Kalau berbeda:** catat halaman dan teks yang muncul.

### UC-DSB-09 · Pagi hari: berapa yang menunggu, mana yang paling layak

**Situasi:** Pagi hari Anda ingin tahu berapa proposal yang menunggu dan yang paling layak
dilihat dulu.

**Sebelum mulai:** sudah masuk.

**Langkah:**

1. Di sidebar, grup **Ruang kerja**, klik **Dashboard**.
2. Baca angka di kartu biru pertama, **Menunggu keputusan**.
3. Baca kartu **Disarankan untuk Anda**.
4. Turun ke kartu **Paling cocok untuk Anda**. Baca urutan nomor 1 dan seterusnya.
5. Klik nama di urutan nomor 1 (mis. **Kopi Teras Senja**).

**Yang seharusnya terlihat:**

- **Menunggu keputusan** berisi jumlah proposal yang sudah dinilai atau perlu dicek manual dan
  belum Anda tanggapi (saat ditulis: 7).
- **Disarankan untuk Anda** berisi jumlah yang kategorinya **Sangat cocok** atau **Cocok** (saat
  ditulis: 4).
- **Paling cocok untuk Anda** berisi paling banyak 5 proposal dari kelompok itu, diurutkan dari
  skor tertinggi. Setiap baris: inisial, nama, badge kategori, satu kalimat ringkasan · sektor ·
  tahap, batang skor, dan angka skor (mis. Kopi Teras Senja 100,0, Kelas Kode Rakyat 85,6,
  Klinik Desa Sehat 78,1, Rantai Dingin Bahari 68,1). Jumlah barisnya sama dengan kartu
  **Disarankan untuk Anda** kalau angka itu 5 atau kurang.
- Langkah 5 membuka halaman proposal itu (`/proposal/<id>`), header **Detail proposal**.
- Kalau tidak ada yang sangat cocok atau cocok, kartu berisi **Belum ada proposal yang sangat
  cocok atau cocok.** dan tombol **Buka semua proposal**. Kalau semua sudah ditanggapi:
  **Semua proposal sudah ditanggapi.**

**Kalau berbeda:** urutan yang tidak menurun menurut skor, atau proposal yang sudah ditanggapi
ikut muncul, adalah bug.

### UC-DSB-10 · Langsung membuka proposal tertentu tanpa lewat menu

**Situasi:** Anda ingin langsung membuka proposal Kopi Teras Senja tanpa lewat menu.

**Sebelum mulai:** sudah masuk, di halaman mana saja.

**Langkah:**

1. Klik kolom **Cari proposal** di header (atau tekan **⌘K** di Mac / **Ctrl+K** di Windows).
2. Di jendela pencarian, ketik `Kopi Teras` di kolom **Ketik untuk mencari…**.
3. Tekan **Enter**, atau klik **Kopi Teras Senja** di grup **Proposal**.

**Yang seharusnya terlihat:** sebelum mengetik, jendela hanya berisi grup **Halaman** dan
**Perintah**. Begitu Anda mengetik, grup **Proposal** muncul. Tiap baris menampilkan nama dan,
di kanan, sektor · kategori (mis. **f&b · Sangat cocok**). Setelah Enter, jendela menutup dan
halaman Kopi Teras Senja terbuka (alamat `/proposal/<id>`, header **Detail proposal**). Anda juga
bisa mencari dengan nama founder, sektor (mis. `agritech` menampilkan **Sawah Pintar
Nusantara**), atau kategori.

**Kalau berbeda:** pencarian memakai pencocokan longgar. Mengetik `kopi` saja juga menampilkan
proposal lain yang hurufnya kebetulan cocok (saat diuji: **Saku Hukum** muncul di atas Kopi Teras
Senja), jadi ketik nama lebih lengkap. Kalau proposal yang Anda tahu ada tidak muncul sama
sekali, catat namanya.

### UC-DSB-11 · Lompat ke halaman lain lewat pencarian

**Situasi:** Anda ingin pindah ke halaman Riwayat tanpa menggeser mouse ke sidebar.

**Sebelum mulai:** sudah masuk.

**Langkah:**

1. Tekan **⌘K** / **Ctrl+K**.
2. Ketik `riwayat`.
3. Tekan **Enter**.
4. Buka lagi dengan **⌘K**, lihat grup **Perintah**.

**Yang seharusnya terlihat:** di langkah 2 grup **Halaman** menyisakan **Riwayat**. Enter membawa
ke `/riwayat`. Grup **Perintah** berisi **Atur aturan penilaian** (ke halaman **Aturan
penilaian**), **Tanya asisten** (membuka panel Tanya AISA dengan pertanyaan **Ringkas peluang
minggu ini**), dan **Pakai tema gelap** atau **Pakai tema terang**. Daftar **Halaman** sama
dengan menu sidebar.

**Kalau berbeda:** catat kata yang diketik dan hasil yang muncul.

### UC-DSB-12 · Pencarian tanpa hasil

**Situasi:** Anda mencari nama yang tidak ada.

**Sebelum mulai:** sudah masuk.

**Langkah:**

1. Tekan **⌘K** / **Ctrl+K**, ketik `zzzzqq`.
2. Tekan **Esc** untuk menutup.
3. Tekan **⌘K** / **Ctrl+K** lagi.

**Yang seharusnya terlihat:** di langkah 1 muncul **Tidak ada hasil.** Di langkah 3 kolom
pencarian masih berisi `zzzzqq` dari tadi (perilaku saat ini). Hapus dulu teksnya sebelum
mencari hal lain. Kalau Anda mengetik langsung, teks baru tersambung ke teks lama dan hasilnya
kosong.

**Kalau berbeda:** kalau kolom sudah kosong saat dibuka lagi, perilaku ini sudah diubah. Catat
saja agar panduan diperbarui.

### UC-DSB-13 · Melihat notifikasi terbaru

**Situasi:** Anda ingin tahu apa saja yang terjadi sejak terakhir membuka AISA.

**Sebelum mulai:** sudah masuk. Ada kejadian baru (proposal masuk, tanggapan, ringkasan, STOP,
dan sebagainya).

**Langkah:**

1. Lihat ikon lonceng di header. Perhatikan titik merah di pojoknya.
2. Klik lonceng.
3. Klik salah satu baris notifikasi yang menyebut nama proposal.

**Yang seharusnya terlihat:** panel **Notifikasi** berisi paling banyak 10 kejadian terbaru,
masing-masing dengan judul (mis. **Proposal masuk · Kopi Teras Senja**, **STOP**, **LANJUT**),
keterangan, dan waktu (mis. **22 Okt, 00.51**). Baris yang belum dibaca bertitik biru di kiri
dan judulnya tebal. Mengklik baris proposal membuka halaman proposal itu. Kalau proposalnya
sudah dihapus, klik membawa ke **Riwayat**. Baris yang diklik tidak lagi bertitik. Kalau belum
ada kejadian sama sekali: **Belum ada notifikasi**.

**Kalau berbeda:** catat judul baris dan tujuan kliknya. Catatan: untuk proposal yang sudah
dihapus, lonceng menulis judul seperti **Proposal masuk · (dihapus)**, sedangkan kartu
**Aktivitas terakhir** di Dashboard menulis **Proposal masuk** saja (lihat UC-DSB-22).

### UC-DSB-14 · Menandai semua notifikasi sudah dibaca

**Situasi:** Anda sudah membaca semuanya dan ingin titik merahnya hilang.

**Sebelum mulai:** lonceng bertitik merah.

**Langkah:**

1. Klik lonceng.
2. Klik **Tandai semua dibaca** di kanan atas panel.
3. Tutup panel, lalu muat ulang halaman.

**Yang seharusnya terlihat:** titik merah di lonceng hilang, titik biru di semua baris hilang,
dan tombol **Tandai semua dibaca** tidak tampil lagi. Setelah muat ulang tetap tidak bertitik.
Status "sudah dibaca" ini hanya tersimpan di browser yang Anda pakai. Di browser atau perangkat
lain, notifikasi yang sama bisa tampil sebagai baru lagi. Di browser yang belum pernah membuka
lonceng, yang dianggap baru adalah kejadian setelah ringkasan WhatsApp terakhir.

**Kalau berbeda:** kalau titik muncul lagi setelah muat ulang tanpa kejadian baru, catat.

### UC-DSB-15 · Ganti tema terang dan gelap

**Situasi:** Anda bekerja malam hari dan ingin layar gelap.

**Sebelum mulai:** sudah masuk.

**Langkah:**

1. Di header, sebelah kiri lingkaran inisial, klik ikon bulan (tooltip **Gunakan mode gelap**).
2. Klik lagi ikon yang sekarang berupa matahari (tooltip **Gunakan mode terang**).

**Yang seharusnya terlihat:** di langkah 1 seluruh aplikasi berubah gelap dan ikon menjadi
matahari. Di langkah 2 kembali terang. Pilihan yang sama ada di jendela ⌘K sebagai **Pakai tema
gelap** / **Pakai tema terang**.

**Kalau berbeda:** catat bagian yang tetap terang atau tulisan yang sulit dibaca di mode gelap,
dengan tangkapan layar.

### UC-DSB-16 · Melihat profil dari menu akun

**Situasi:** Anda ingin memastikan sedang masuk dengan akun dan peran yang benar.

**Sebelum mulai:** sudah masuk.

**Langkah:**

1. Klik lingkaran inisial di kanan atas.
2. Baca bagian atas menu.
3. Klik **Lihat profil**.

**Yang seharusnya terlihat:** bagian atas menu berisi nama (mis. **Manager AISA**) dan baris
**manager@aisa.local · Administrator**. Pilihan di bawahnya hanya **Lihat profil** dan
**Keluar**. **Lihat profil** membuka `/pengaturan?tab=profil`, halaman **Pengaturan** di tab
**Profil**.

**Kalau berbeda:** peran yang bukan **Administrator** untuk akun ini berarti akun salah
dikonfigurasi. Catat.

## Tampilan ponsel

### UC-DSB-17 · Memakai AISA dari ponsel

**Situasi:** Anda di jalan dan ingin mengecek AISA dari ponsel.

**Sebelum mulai:** sudah masuk di ponsel (atau browser laptop yang dipersempit sampai kurang
dari kira-kira 860 piksel).

**Langkah:**

1. Buka **Dashboard**.
2. Lihat baris ikon di paling atas. Tekan lama atau arahkan ke ikon untuk melihat namanya.
3. Ketuk kolom **Cari proposal**, ketik nama proposal, ketuk hasilnya.
4. Gulir Dashboard sampai bawah.

**Yang seharusnya terlihat:** sidebar berubah menjadi baris di atas: logo AISA, lalu deretan
ikon tanpa tulisan (Dashboard, Proposal dengan badge angka, Tren, Aktivitas AI, Riwayat, Aturan
penilaian, Pengaturan), lalu kotak **Ringkasan WhatsApp**. Di bawahnya judul **Dashboard** dan
sapaan, ikon lonceng, tema, dan inisial. Kolom **Cari proposal** memenuhi lebar layar, tanpa
tanda ⌘K. Kartu-kartu tersusun satu kolom. Tombol bulat **Tanya AISA** tetap di kanan bawah.
Tidak ada bagian yang harus digeser ke samping, kecuali deretan ikon kalau layar sangat sempit.

**Kalau berbeda:** catat ukuran layar dan bagian yang terpotong atau menumpuk, dengan tangkapan
layar.

## Dashboard

### UC-DSB-18 · Empat kartu angka di Dashboard dan ke mana masing-masing membawa

**Situasi:** Anda ingin tahu apakah setiap kartu angka membawa ke daftar yang benar.

**Sebelum mulai:** sudah masuk, di **Dashboard**. Catat keempat angkanya dulu.

**Langkah:**

1. Klik kartu **Menunggu keputusan**. Lihat alamat dan tab aktif di halaman Proposal. Kembali.
2. Klik kartu **Disarankan untuk Anda**. Kembali.
3. Klik kartu **Sudah ditanggapi**. Kembali.
4. Klik kartu **Total proposal**.

**Yang seharusnya terlihat:**

| Kartu                 | Keterangan kecil                    | Membuka                                   |
| --------------------- | ----------------------------------- | ----------------------------------------- |
| Menunggu keputusan    | Belum Anda tanggapi                 | `/proposal?tanggapan=belum`               |
| Disarankan untuk Anda | Kategori sangat cocok dan cocok     | `/proposal?kategori=atas&tanggapan=belum` |
| Sudah ditanggapi      | Diundang, dipantau, atau diarsipkan | `/proposal?tanggapan=sudah`               |
| Total proposal        | Semua yang tersimpan                | `/proposal`                               |

Cara mengecek angkanya: **Total proposal** = angka tab **Semua** di halaman Proposal. **Sudah
ditanggapi** = angka tab **Sudah ditanggapi**. **Disarankan untuk Anda** = jumlah baris dengan
filter kategori **Sangat cocok + cocok**. **Menunggu keputusan** biasanya sama dengan tab
**Belum ditanggapi**, tapi bisa lebih kecil: kartu tidak menghitung proposal yang masih
**Antre** atau sedang dinilai, sedangkan tab menghitungnya.

**Kalau berbeda:** selisih di luar penjelasan di atas adalah bug. Catat kedua angkanya.

### UC-DSB-19 · Strip insight di bawah kartu

**Situasi:** Anda ingin membaca keadaan pipeline dalam satu baris.

**Sebelum mulai:** di **Dashboard**.

**Langkah:**

1. Baca empat kotak di strip tepat di bawah kartu angka.
2. Klik setiap kotak satu per satu, lalu kembali.
3. Kalau ada baris yang diawali **Yang menarik:** di bawah strip, baca juga.

**Yang seharusnya terlihat:**

- **Rata-rata skor**: mis. **74,5 dari 100**. Klik ke **Tren**. Rata-rata ini dari semua
  proposal yang sudah dinilai, sudah ditanggapi atau belum.
- **Sejak ringkasan 09.00 · 21 Okt 2026** (slot dan tanggal ringkasan WhatsApp terakhir):
  **… proposal baru masuk** sejak itu. Klik ke daftar **Proposal** lengkap. Kalau belum ada
  ringkasan: judul **Ringkasan WhatsApp** dengan **Belum ada ringkasan terkirim**.
- **Berkualitas, di luar fokus**: **… proposal patut dilihat lagi**. Klik ke Proposal dengan
  filter itu dan tab **Belum ditanggapi**.
- **Perlu dicek manual**: **… proposal tidak bisa dinilai otomatis**. Klik ke Proposal dengan
  filter status **Perlu dicek manual** dan tab **Belum ditanggapi**.
- Baris **Yang menarik: …** berasal dari ringkasan WhatsApp terakhir yang punya insight, dengan
  keterangan **Ringkasan 09.00 · <tanggal>** di kanan. Baris ini tidak muncul kalau belum ada
  insight.

**Kalau berbeda:** angka di kotak yang tidak sama dengan jumlah baris di daftar tujuannya adalah
bug.

### UC-DSB-20 · Menunggu keputusan per kategori dan hitungan tanggapan

**Situasi:** Anda ingin tahu dari proposal yang menunggu, berapa yang sangat cocok dan berapa
yang tidak cocok.

**Sebelum mulai:** di **Dashboard**.

**Langkah:**

1. Lihat kartu **Menunggu keputusan** di kanan (bukan kartu biru di atas).
2. Baca batang berwarna dan daftar kategori di bawahnya.
3. Klik baris **Sangat cocok**. Kembali.
4. Di bagian bawah kartu, klik angka **Diundang**, lalu **Dipantau**, lalu **Diarsipkan**.

**Yang seharusnya terlihat:**

- Keterangan kartu: **7 proposal, dikelompokkan per kategori** (sama dengan kartu biru).
- Baris **Sangat cocok**, **Cocok**, **Kurang cocok**, **Tidak cocok**, masing-masing dengan
  jumlah dan persentase. Baris abu-abu **Perlu dicek manual** muncul hanya kalau ada, dan baris
  ini tidak bisa diklik. Jumlah semua baris = angka di keterangan kartu. Persentase dibulatkan,
  jadi totalnya bisa 99% atau 101%.
- Klik baris kategori membuka `/proposal?kategori=<kategori>&tanggapan=belum`.
- **Diundang**, **Dipantau**, **Diarsipkan** membuka tab masing-masing di halaman Proposal.
  Jumlah ketiganya = kartu **Sudah ditanggapi** (saat ditulis: 1 + 0 + 1 = 2).

**Kalau berbeda:** jumlah yang tidak cocok antara kartu ini, kartu biru, dan tab di halaman
Proposal adalah bug.

### UC-DSB-21 · Kartu Tren proposal di Dashboard

**Situasi:** Anda ingin tahu apakah arus proposal minggu-minggu ini naik atau turun.

**Sebelum mulai:** di **Dashboard**.

**Langkah:**

1. Turun ke kartu **Tren proposal**.
2. Baca keterangan di bawah judul dan tiga angka di atas grafik.
3. Arahkan mouse ke titik di grafik.

**Yang seharusnya terlihat:** tiga angka: **Proposal masuk**, **Sangat cocok**, dan **Rata-rata
per minggu**. Grafik berisi dua area, **Proposal masuk** dan **Sangat cocok**, per minggu (label
sumbu bawah = tanggal awal minggu). Kalau catatan harian sudah 24 minggu, keterangan berbunyi
**12 minggu terakhir, dibanding 12 minggu sebelumnya** dan dua angka pertama diberi badge
persen naik/turun. Kalau catatannya masih muda, keterangan berbunyi seperti **1 minggu terakhir ·
pencatatan harian sejak 21 Okt** dan tanpa badge persen. Kalau belum ada catatan sama sekali:
**Belum ada data harian yang tercatat.**

**Kalau berbeda:** angka di sini dihitung dari rekap harian, yang tetap menghitung proposal yang
kemudian dihapus. Karena itu **Proposal masuk** bisa lebih besar dari kartu **Total proposal**
(saat ditulis: 25 lawan 9). Itu bukan bug. Yang patut dicatat adalah grafik yang kosong padahal
ada proposal masuk minggu ini.

### UC-DSB-22 · Aktivitas terakhir

**Situasi:** Anda ingin melihat lima kejadian terakhir tanpa membuka Riwayat.

**Sebelum mulai:** di **Dashboard**.

**Langkah:**

1. Lihat kartu **Aktivitas terakhir** di sebelah Tren proposal.
2. Bandingkan dengan lima baris teratas di lonceng notifikasi.
3. Klik **Semua** di kanan atas kartu.

**Yang seharusnya terlihat:** keterangan **Proposal masuk, keputusan, dan ringkasan WhatsApp**,
lalu paling banyak 5 kejadian terbaru. Masing-masing berisi judul (mis. **Proposal masuk · Kopi
Teras Senja**, **STOP**, **LANJUT**), keterangan, dan waktu (mis. **22 Okt, 01.06**). Urutannya
sama dengan lima teratas di lonceng. Untuk proposal yang sudah dihapus, judulnya hanya nama
kejadian (mis. **Proposal masuk**) dengan keterangan **Rincian dihapus bersama proposal**.
**Semua** membuka `/riwayat`. Kalau kosong: **Belum ada aktivitas.**

**Kalau berbeda:** baris di sini tidak bisa diklik, itu memang begitu. Catat kalau urutannya
beda dengan lonceng.

### UC-DSB-23 · Tombol Unggah pitch deck di Dashboard

**Situasi:** Anda menerima pitch deck lewat email, bukan lewat Form, dan ingin AISA menilainya.

**Sebelum mulai:** masuk sebagai admin.

**Langkah:**

1. Di **Dashboard**, kartu **Paling cocok untuk Anda**, lihat bagian paling bawah.
2. Klik **Unggah pitch deck**.
3. Tutup jendelanya tanpa mengunggah (klik di luar jendela atau tekan **Esc**).

**Yang seharusnya terlihat:** baris **Pitch deck tidak lewat Form? Unggah agar ikut dinilai.**
dengan tombol **Unggah pitch deck**. Tombol membuka jendela **Unggah pitch deck** dengan
keterangan **PDF dinilai lewat alur yang sama dengan Form. Hanya teks yang dikirim ke model.**
Untuk benar-benar mengunggah (⚠️ menambah proposal), ikuti panduan Proposal di folder ini dan
pakai deck uji bernama "UJI …". Akun dengan peran **Pengguna** (baca saja) tidak melihat baris
dan tombol ini sama sekali.

**Kalau berbeda:** kalau akun **Pengguna** masih melihat tombol ini, catat sebagai bug hak akses.

### UC-DSB-24 · Banner saat AI dijeda ⚠️

**Situasi:** Seseorang mengirim STOP lewat WhatsApp, dan Anda ingin Dashboard memberi tahu
bahwa AI sedang dijeda.

**Sebelum mulai:** masuk sebagai admin. Use case ini mengubah keadaan produksi: selama dijeda,
proposal baru tidak dinilai. Lakukan hanya kalau tim setuju, sesingkat mungkin, dan pastikan
Anda menekan **LANJUT** di akhir.

**Langkah:**

1. Di sidebar, grup **Lainnya**, klik **Pengaturan**, lalu tab **Integrasi**.
2. Di kartu dengan status **Berjalan**, klik tombol merah **STOP**. Tunggu toast **AI dijeda
   (STOP).**
3. Klik **Dashboard** di sidebar.
4. Klik tautan **Pengaturan** di dalam banner merah.
5. Klik **LANJUT**. Tunggu toast **AI dilanjutkan (LANJUT).**
6. Buka **Dashboard** lagi.

**Yang seharusnya terlihat:** di langkah 3, di paling atas Dashboard ada banner merah: **AI
sedang dijeda (STOP). Proposal baru menunggu sebagai Antre sampai LANJUT di Pengaturan.**
Langkah 4 membuka `/pengaturan?tab=integrasi`, status **Dijeda (STOP)**. Di langkah 6 banner
sudah hilang. Di lonceng dan **Aktivitas terakhir** muncul baris **STOP** lalu **LANJUT**.

**Kalau berbeda:** kalau banner tidak hilang setelah LANJUT, muat ulang sekali. Kalau masih ada,
segera beri tahu tim karena AI mungkin masih dijeda.

## Tren

### UC-DSB-25 · Tren: proposal masuk per hari dan tabelnya

**Situasi:** Anda ingin tahu berapa proposal masuk setiap hari dalam dua minggu terakhir, dan
angka persisnya.

**Sebelum mulai:** sudah masuk.

**Langkah:**

1. Di sidebar, grup **Ruang kerja**, klik **Tren**.
2. Baca tiga sampai empat poin di bawah judul **Tren 14 hari terakhir**.
3. Di kartu **Proposal masuk per hari**, arahkan mouse ke salah satu batang.
4. Klik **Lihat sebagai tabel** di bawah grafik.

**Yang seharusnya terlihat:**

- Poin pertama, mis. **Hari ini 3 proposal · rata-rata 14 hari 1,8 per hari.** Kalau hari ini
  terbanyak dalam dua minggu, bunyinya **Hari ini … proposal, terbanyak dalam dua minggu.**
- Poin kedua: **… proposal sangat cocok dari … proposal masuk · …% dari 14 hari terakhir.**
- Poin ketiga: **… proposal perlu dicek manual. …**
- Poin **Yang menarik: …** muncul kalau ringkasan WhatsApp terakhir membawa insight.
- Grafik batang bertumpuk per hari selama 14 hari, warna per kategori (**Sangat cocok**,
  **Cocok**, **Kurang cocok**, **Tidak cocok**, **Perlu dicek manual**). Arahkan mouse untuk
  melihat tanggal lengkap dan jumlah per kategori.
- Tabel berkolom **Tanggal**, **Total**, empat kategori, **Perlu dicek manual**, **Rata-rata
  skor** (tanda **–** kalau hari itu tidak ada yang dinilai). Di bawahnya: **Kategori dari kode
  saat dinilai, sebelum koreksi manajer. Total juga menghitung proposal yang masih antre.**
- Cara mengecek: jumlah kolom **Total** = angka "dari … proposal masuk" di poin kedua.

**Kalau berbeda:** angka di sini dari rekap harian, yang tetap menghitung proposal yang sudah
dihapus, dan memakai kategori sebelum koreksi. Jadi angkanya boleh beda dengan Dashboard (saat
ditulis: Tren menyebut 7 perlu dicek manual, Dashboard 1). Yang patut dicatat adalah total tabel
yang berbeda dengan poin kedua.

### UC-DSB-26 · Tren: proposal per sektor dan rata-rata skor

**Situasi:** Anda ingin tahu sektor mana yang paling banyak mengirim proposal minggu ini, dan
apakah kualitasnya membaik.

**Sebelum mulai:** di halaman **Tren**.

**Langkah:**

1. Lihat kartu **Proposal per sektor**.
2. Lihat kartu **Rata-rata skor kualitas per hari**. Arahkan mouse ke titik di grafik.

**Yang seharusnya terlihat:** **Proposal per sektor** berketerangan **Minggu ini, dengan selisih
dari minggu lalu** dan menampilkan paling banyak 7 sektor, masing-masing dengan batang, jumlah
minggu ini, dan selisih dalam kurung (mis. **agritech 5 (+5)**). Kalau kosong: **Belum ada
data.** **Rata-rata skor kualitas per hari** berskala 0 sampai 100, dengan keterangan seperti
**7 hari terakhir 74,5**, atau **7 hari terakhir …, naik dari …** / **turun dari …** kalau
minggu sebelumnya juga ada nilainya. Hari tanpa proposal yang dinilai tidak diberi titik.

**Kalau berbeda:** catat sektor yang Anda tahu masuk minggu ini tetapi tidak muncul.

### UC-DSB-27 · Tren: pemakaian token AI

**Situasi:** Anda ingin tahu seberapa banyak AI dipakai dua minggu terakhir.

**Sebelum mulai:** di halaman **Tren**.

**Langkah:**

1. Turun ke kartu **Pemakaian token AI**.
2. Arahkan mouse ke batang hari yang paling tinggi.

**Yang seharusnya terlihat:** keterangan seperti **652.238 token dalam 14 hari · masuk 548 rb
· keluar 104,3 rb**. Batang bertumpuk per hari dengan legenda **Token masuk** dan **Token
keluar**. Arahkan mouse untuk melihat tanggal dan jumlah token persis, mis. **… token**.
Rincian per pekerjaan AI ada di halaman **Aktivitas AI**.

**Kalau berbeda:** kalau ada hari dengan proposal masuk (lihat UC-DSB-25) tapi token 0, catat
tanggalnya.
