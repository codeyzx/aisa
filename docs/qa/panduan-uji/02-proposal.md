# Panduan uji: Proposal (daftar dan detail)

## Cakupan

Panduan ini untuk Anda yang menguji halaman **Proposal** AISA sendiri di produksi
(https://aisa-dashboard-lk5jbo3eza-et.a.run.app). Isinya: daftar proposal (tab, filter, cari,
urutan, halaman, ekspor CSV, pilih banyak baris, tanggapan massal, unggah pitch deck) dan halaman
detail satu proposal (skor, log penilaian, Ringkasan AI, nilai per kriteria, cek fokus, riwayat,
keputusan Anda, Tanya AISA, founder, koreksi kategori, hapus data). Ada juga proposal yang perlu
dicek manual, proposal "Berkualitas, di luar fokus", dan akun yang hanya bisa membaca. Use case
yang mengubah data ditandai ⚠️. Untuk itu, pakai proposal uji yang Anda unggah sendiri dengan nama
berawalan "UJI", lalu hapus di akhir (UC-PRP-25). Tanggapan tidak bisa dikembalikan ke "Belum
ditanggapi", jadi jangan mencobanya pada proposal sungguhan. Nama proposal di contoh (mis. Klinik
Desa Sehat) diambil dari produksi saat panduan ditulis. Datanya bisa berubah, jadi pakai nama yang
ada di layar Anda.

Akun uji: `manager@aisa.local` dengan sandi admin dari tim.

## Daftar use case

- [UC-PRP-01 · Melihat semua proposal dan jumlah per tab](#uc-prp-01--melihat-semua-proposal-dan-jumlah-per-tab)
- [UC-PRP-02 · Mencari proposal dengan kata kunci](#uc-prp-02--mencari-proposal-dengan-kata-kunci)
- [UC-PRP-03 · Menyaring menurut kategori, sektor, dan status](#uc-prp-03--menyaring-menurut-kategori-sektor-dan-status)
- [UC-PRP-04 · Mengurutkan tabel](#uc-prp-04--mengurutkan-tabel)
- [UC-PRP-05 · Pindah halaman daftar](#uc-prp-05--pindah-halaman-daftar)
- [UC-PRP-06 · Ekspor CSV tanpa data pribadi founder](#uc-prp-06--ekspor-csv-tanpa-data-pribadi-founder)
- [UC-PRP-07 · Memilih beberapa baris dan bilah aksinya](#uc-prp-07--memilih-beberapa-baris-dan-bilah-aksinya) ⚠️
- [UC-PRP-08 · Menanggapi semua proposal satu kategori sekaligus](#uc-prp-08--menanggapi-semua-proposal-satu-kategori-sekaligus) ⚠️
- [UC-PRP-09 · Mengunggah pitch deck](#uc-prp-09--mengunggah-pitch-deck) ⚠️
- [UC-PRP-10 · Mengunggah berkas yang bukan PDF](#uc-prp-10--mengunggah-berkas-yang-bukan-pdf)
- [UC-PRP-11 · Mengunggah PDF lebih dari 20 MB](#uc-prp-11--mengunggah-pdf-lebih-dari-20-mb)
- [UC-PRP-12 · Owner bertanya: kenapa skor proposal A segitu](#uc-prp-12--owner-bertanya-kenapa-skor-proposal-a-segitu)
- [UC-PRP-13 · Membuka log penilaian](#uc-prp-13--membuka-log-penilaian)
- [UC-PRP-14 · Kriteria yang tidak dibahas atau kutipannya tidak terverifikasi](#uc-prp-14--kriteria-yang-tidak-dibahas-atau-kutipannya-tidak-terverifikasi)
- [UC-PRP-15 · Mengecek kesesuaian dengan fokus investasi](#uc-prp-15--mengecek-kesesuaian-dengan-fokus-investasi)
- [UC-PRP-16 · Membaca riwayat proposal](#uc-prp-16--membaca-riwayat-proposal)
- [UC-PRP-17 · Anda memutuskan mengundang founder A](#uc-prp-17--anda-memutuskan-mengundang-founder-a) ⚠️
- [UC-PRP-18 · Memantau atau mengarsipkan proposal](#uc-prp-18--memantau-atau-mengarsipkan-proposal) ⚠️
- [UC-PRP-19 · Menyiapkan pertemuan lewat kartu Tanya AISA](#uc-prp-19--menyiapkan-pertemuan-lewat-kartu-tanya-aisa)
- [UC-PRP-20 · Menghubungi founder](#uc-prp-20--menghubungi-founder)
- [UC-PRP-21 · Membuka pitch deck asli](#uc-prp-21--membuka-pitch-deck-asli)
- [UC-PRP-22 · Koreksi kategori tanpa alasan](#uc-prp-22--koreksi-kategori-tanpa-alasan)
- [UC-PRP-23 · Mengoreksi kategori](#uc-prp-23--mengoreksi-kategori) ⚠️
- [UC-PRP-24 · Hapus data tanpa alasan](#uc-prp-24--hapus-data-tanpa-alasan)
- [UC-PRP-25 · Founder minta datanya dihapus](#uc-prp-25--founder-minta-datanya-dihapus) ⚠️
- [UC-PRP-26 · Proposal yang perlu dicek manual](#uc-prp-26--proposal-yang-perlu-dicek-manual)
- [UC-PRP-27 · Proposal berkualitas di luar fokus](#uc-prp-27--proposal-berkualitas-di-luar-fokus)
- [UC-PRP-28 · Akun yang hanya bisa membaca](#uc-prp-28--akun-yang-hanya-bisa-membaca) ⚠️
- [UC-PRP-29 · Membuka alamat proposal yang tidak ada](#uc-prp-29--membuka-alamat-proposal-yang-tidak-ada)

## Daftar proposal

### UC-PRP-01 · Melihat semua proposal dan jumlah per tab

**Situasi:** Anda ingin melihat semua proposal dan tahu berapa yang belum ditanggapi.

**Sebelum mulai:** sudah masuk sebagai admin.

**Langkah:**

1. Di sidebar kiri, bagian **Ruang kerja**, klik **Proposal**.
2. Lihat baris tab di atas tabel: **Semua**, **Belum ditanggapi**, **Sudah ditanggapi**,
   **Diundang**, **Dipantau**, **Diarsipkan**. Tiap tab membawa angka di sebelahnya.
3. Klik tab **Belum ditanggapi**, lalu tab **Diundang**.
4. Klik nama satu proposal di tabel (mis. **Klinik Desa Sehat**). Klik di mana saja pada barisnya
   juga membuka detail.

**Yang seharusnya terlihat:**

- Judul tab browser **Proposal · AISA**.
- Tabel berkolom **Startup**, **Sektor**, **Kategori**, **Status**, **Dana dicari**, **Masuk**,
  **Skor**. Tanpa filter, urutan default adalah skor tertinggi di atas.
- Di bawah nama startup ada nama founder (kalau ada) dan satu kalimat tentang startupnya.
- Kolom **Status** berisi badge tanggapan: **Belum ditanggapi**, **Diundang**, **Dipantau**, atau
  **Diarsipkan**. Kolom **Kategori** menampilkan badge kategori; proposal yang belum punya
  kategori menampilkan statusnya, mis. **Perlu dicek manual**. Teks kecil **dikoreksi** muncul
  di bawah badge bila kategorinya pernah dikoreksi.
- Angka tab **Semua** = **Belum ditanggapi** + **Sudah ditanggapi**, dan **Sudah ditanggapi** =
  **Diundang** + **Dipantau** + **Diarsipkan**. Saat panduan ini ditulis: Semua 9, Belum
  ditanggapi 7, Sudah ditanggapi 2, Diundang 1, Dipantau 0, Diarsipkan 1.
- Klik tab mengubah isi tabel dan tab itu ditandai garis bawah. URL bertambah `?tanggapan=belum`
  atau `?tanggapan=undang`.
- Di bawah tabel: "Menampilkan 1–9 dari 9 proposal" dan "Halaman 1 dari 1".
- Klik nama membuka halaman detail dengan URL `/proposal/<id>` dan judul tab **Detail proposal ·
  AISA**.

**Kalau berbeda:** catat tab dan angka yang tidak saling cocok, beserta URL-nya.

### UC-PRP-02 · Mencari proposal dengan kata kunci

**Situasi:** Anda ingat sebagian nama startup atau nama founder, mis. "kopi" untuk Kopi Teras
Senja.

**Sebelum mulai:** di halaman **Proposal**.

**Langkah:**

1. Ketik `kopi` di kolom **Cari startup, founder, sektor…**.
2. Hapus isinya dengan tombol silang kecil di ujung kanan kolom.
3. Ketik nama founder yang terlihat di bawah nama startup, mis. `Martio`.
4. Ketik sektor, mis. `healthtech`.
5. Ketik kata yang tidak ada, mis. `zzzz`.

**Yang seharusnya terlihat:**

- Tabel langsung menyaring tanpa menekan Enter. Untuk `kopi` tinggal Kopi Teras Senja, dan semua
  angka tab ikut menghitung ulang (Semua 1).
- URL berubah menjadi `/proposal?q=kopi`.
- Tombol **Reset filter** muncul di baris filter selama kolom cari terisi.
- Pencarian juga mencocokkan nama founder, kalimat ringkas startup, dan sektor, tanpa
  membedakan huruf besar-kecil.
- Untuk `zzzz`: tabel kosong bertuliskan **Tidak ada proposal yang cocok** dan "Coba ubah kata
  kunci atau filter.", dengan tombol **Reset filter** di bawahnya.

**Kalau berbeda:** catat kata kunci dan nama proposal yang seharusnya muncul.

### UC-PRP-03 · Menyaring menurut kategori, sektor, dan status

**Situasi:** Anda hanya ingin melihat proposal Cocok di sektor climate.

**Sebelum mulai:** di halaman **Proposal**, tanpa filter.

**Langkah:**

1. Klik kotak pilihan **Semua kategori**. Pilihannya: **Semua kategori**, **Sangat cocok**,
   **Cocok**, **Kurang cocok**, **Tidak cocok**, lalu (setelah garis pemisah) **Sangat cocok +
   cocok** dan **Berkualitas, di luar fokus**. Pilih **Cocok**.
2. Klik kotak **Semua sektor**. Pilihannya diambil dari sektor proposal yang ada, ditulis dengan
   huruf besar seperti di kolom **Sektor** (mis. **Agritech**, **Climate**, **Edtech**, **F&B**,
   **Fashion**, **Healthtech**). Sektor yang tersimpan dengan huruf berbeda (mis. `f&b` dan
   `F&B`) hanya muncul sekali. Pilih **Climate**.
3. Klik kotak **Semua status**. Pilihannya: **Semua status**, **Antre**, **Sedang dinilai**,
   **Dinilai**, **Perlu dicek manual**, **Dihentikan**. Pilih **Dinilai**.
4. Salin URL di browser, buka di tab baru.
5. Klik tab **Belum ditanggapi**, lalu klik **Reset filter**.

**Yang seharusnya terlihat:**

- Setiap pilihan langsung menyaring tabel dan tab menghitung ulang. Contoh saat panduan ditulis:
  **Cocok** saja = 2 proposal (Klinik Desa Sehat, Rantai Dingin Bahari); ditambah **Climate** = 1
  (Rantai Dingin Bahari).
- URL menyimpan pilihan, mis. `?kategori=cocok&sektor=Climate&status=dinilai`. Tab baru dari URL
  yang sama menampilkan hasil yang sama. Tautan lama yang menulis sektornya dengan huruf kecil
  (mis. `sektor=climate`) tetap menyaring sektor yang sama.
- **Sangat cocok + cocok** menampilkan gabungan dua kategori itu.
- **Reset filter** mengosongkan kategori, sektor, status, dan kata kunci. Tab yang aktif dan
  urutan kolom **tidak** ikut direset (tab **Belum ditanggapi** tetap terpilih).
- Kategori yang dipakai filter adalah kategori yang berlaku sekarang, termasuk hasil koreksi
  manajer. Kopi Teras Senja yang dikoreksi ke Sangat cocok muncul di **Sangat cocok**, bukan di
  **Tidak cocok**.

**Kalau berbeda:** catat kombinasi filter, URL, dan proposal yang salah tampil atau hilang.

### UC-PRP-04 · Mengurutkan tabel

**Situasi:** Anda ingin melihat proposal dengan dana terbesar atau yang paling baru masuk.

**Sebelum mulai:** di halaman **Proposal**.

**Langkah:**

1. Klik judul kolom **Startup**. Klik lagi.
2. Klik judul kolom **Dana dicari**. Klik lagi.
3. Klik judul kolom **Masuk**.
4. Klik judul kolom **Skor**.

**Yang seharusnya terlihat:**

- Klik pertama **Startup** mengurutkan A→Z, URL `?urut=nama`. Klik kedua Z→A, URL
  `?urut=nama&arah=turun`. Ikon panah di samping judul menunjukkan arahnya.
- Klik pertama **Dana dicari**, **Masuk**, atau **Skor** mengurutkan dari terbesar/terbaru;
  klik kedua membalik.
- Proposal tanpa angka (mis. Lumbung Ikan Pesisir yang tanpa skor dan dana) selalu di bawah,
  ke arah mana pun urutannya.
- Kembali ke **Skor** tertinggi menghapus `urut` dari URL (itu urutan default).

**Kalau berbeda:** catat kolom, arah, dan dua baris yang urutannya salah.

### UC-PRP-05 · Pindah halaman daftar

**Situasi:** proposal sudah banyak dan tidak muat satu halaman.

**Sebelum mulai:** di halaman **Proposal**. Satu halaman memuat 12 proposal. Saat panduan ditulis
baru ada 9, jadi langkah 2–3 baru bisa diuji setelah proposal lebih dari 12.

**Langkah:**

1. Lihat baris paling bawah tabel: "Menampilkan …", "Pilih semua … proposal di halaman ini", dan
   "Halaman … dari …" dengan tombol panah kiri dan kanan.
2. Klik panah kanan (**Halaman berikutnya**).
3. Klik panah kiri (**Halaman sebelumnya**). Lalu pilih satu filter.

**Yang seharusnya terlihat:**

- Dengan 9 proposal: "Menampilkan 1–9 dari 9 proposal" dan "Halaman 1 dari 1". Kedua panah
  tidak bisa diklik.
- Dengan lebih dari 12: panah kanan membuka "Menampilkan 13–… dari …" dan URL bertambah `?hal=2`.
  Panah kiri kembali ke halaman 1 dan `hal` hilang dari URL.
- Mengubah filter, kata kunci, tab, atau urutan selalu kembali ke halaman 1.

**Kalau berbeda:** catat jumlah proposal, nomor halaman, dan baris yang hilang atau berulang.

### UC-PRP-06 · Ekspor CSV tanpa data pribadi founder

**Situasi:** Anda ingin mengirim daftar proposal ke rekan dalam bentuk spreadsheet, tanpa
membocorkan data pribadi founder.

**Sebelum mulai:** di halaman **Proposal**. Pastikan ada proposal yang menampilkan nama founder di
bawah nama startupnya (mis. Saku Hukum, founder Martio).

**Langkah:**

1. Klik **Ekspor CSV** (kanan baris filter).
2. Buka berkas `proposal-aisa.csv` yang terunduh di Excel atau Google Sheets.
3. Pilih filter **Cocok**, lalu klik **Ekspor CSV** lagi.

**Yang seharusnya terlihat:**

- Kolom berkas: Startup, Sektor, Tahap, Skor, Kategori, Status, Tanggapan, Dana dicari, Masuk.
- **Tidak ada** nama founder dan **tidak ada** email founder di mana pun dalam berkas. Cari
  "Martio" atau "@" di berkas: tidak ditemukan.
- Satu baris per proposal yang sedang tampil di tabel (semua halaman, bukan hanya halaman yang
  terlihat). Dengan filter **Cocok**, berkas hanya berisi proposal Cocok.
- Angka ditulis polos: skor `85.6` (titik), dana `3000000000`, tanggal `2026-10-21`. Kolom
  Tanggapan memakai kata yang sama dengan badge di tabel: **Diundang**, **Dipantau**,
  **Diarsipkan**, atau **Belum ditanggapi**. Kolom Sektor juga sama dengan tabel (mis. **F&B**).
- Huruf Indonesia dan simbol (mis. "F&B") terbaca benar di Excel.

**Kalau berbeda:** nama atau email founder yang muncul di CSV adalah masalah data pribadi: catat
dan laporkan segera.

### UC-PRP-07 · Memilih beberapa baris dan bilah aksinya

**Situasi:** Anda ingin memantau beberapa proposal sekaligus.

⚠️ Langkah 5 mengubah data. Pakai dua proposal uji "UJI …" (lihat UC-PRP-09).

**Sebelum mulai:** di halaman **Proposal**.

**Langkah:**

1. Centang kotak di kiri dua baris.
2. Lihat bilah gelap yang muncul di bawah tabel, dan tombol ekspor.
3. Klik **Arsipkan** di bilah itu. Di dialog, klik **Batal**.
4. Klik ikon silang (**Batalkan pilihan**) di ujung bilah. Lalu centang kotak di judul tabel.
5. Hapus centang semua, centang hanya dua proposal UJI, klik **Pantau** di bilah.

**Yang seharusnya terlihat:**

- Baris yang dicentang diberi warna latar. Bilah bertuliskan "2 dipilih" dengan tombol **Undang**,
  **Pantau**, **Arsipkan**, dan ikon silang.
- Tombol ekspor berubah menjadi **Ekspor 2** dan hanya mengekspor dua baris itu.
- Dialog arsip: judul "Arsipkan 2 proposal?" dan teks "Proposal yang dipilih tidak akan muncul
  sebagai perlu ditanggapi, tetapi riwayatnya tetap tersimpan." dengan **Batal** dan
  **Arsipkan**. **Batal** tidak mengubah apa pun.
- Kotak di judul tabel mencentang semua proposal **di halaman ini saja** (namanya "Pilih semua …
  proposal di halaman ini" di baris bawah tabel).
- Setelah **Pantau**: toast "Pantau: 2 proposal.", centang hilang, kolom **Status** kedua proposal
  menjadi **Dipantau**, dan angka tab **Dipantau** bertambah 2. Riwayat di detail masing-masing
  proposal mendapat baris **Tanggapan**.
- Kalau sebagian gagal, muncul toast "… dari … proposal gagal: <alasan>" dan yang gagal tetap
  tercentang.

**Kalau berbeda:** catat jumlah yang dipilih, tombol yang diklik, dan toast yang muncul.

### UC-PRP-08 · Menanggapi semua proposal satu kategori sekaligus

**Situasi:** Anda ingin mengundang semua proposal Cocok yang belum ditanggapi dalam satu klik.

⚠️ Ini mengubah **semua** proposal di kategori itu yang belum ditanggapi, termasuk yang tidak
terlihat karena filter lain. Di produksi, cukup uji sampai langkah 3 lalu **Batal**. Uji sampai
selesai hanya bila semua proposal di kategori itu adalah proposal UJI.

**Sebelum mulai:** di halaman **Proposal**.

**Langkah:**

1. Di kotak kategori pilih **Cocok**.
2. Lihat kotak di atas tabel: "Tanggapi semua 2 proposal **Cocok** yang belum ditanggapi:" dengan
   tombol **Undang semua**, **Pantau semua**, **Arsipkan semua**.
3. Klik **Undang semua**. Teks berganti menjadi "Undang 2 proposal?" dengan **Ya, lanjutkan** dan
   **Batal**. Klik **Batal**.
4. (Hanya untuk kategori berisi proposal UJI) Ulangi langkah 3, lalu klik **Ya, lanjutkan**.

**Yang seharusnya terlihat:**

- Kotak ini hanya muncul bila Anda memilih satu kategori (bukan **Semua kategori**, **Sangat
  cocok + cocok**, atau **Berkualitas, di luar fokus**), kategori itu satu-satunya penyaring, dan
  masih ada proposal di kategori itu yang belum ditanggapi. Begitu Anda menambah sektor, status,
  atau kata kunci (mis. buka `/proposal?kategori=cocok&sektor=agritech`), kotak hilang. Sebabnya,
  tanggapan massal selalu berlaku untuk seluruh kategori, termasuk proposal yang disembunyikan
  penyaring lain. Pindah tab (mis. **Belum ditanggapi**) tidak menghilangkan kotak.
- Setelah **Ya, lanjutkan**: toast "Undang: 2 proposal Cocok.", kotak hilang, semua proposal itu
  menjadi **Diundang**. Halaman **Riwayat** mendapat satu baris **Tanggapan massal**, dan kartu
  **Riwayat** di detail tiap proposal itu juga menampilkan baris **Tanggapan massal** (lihat
  UC-PRP-16).
- Angka di toast adalah hitungan dari server; bisa lebih kecil dari angka di kotak bila sebagian
  sudah ditanggapi lewat WhatsApp sejak halaman dibuka.

**Kalau berbeda:** catat kategori, angka di kotak, dan angka di toast.

### UC-PRP-09 · Mengunggah pitch deck

**Situasi:** founder mengirim pitch deck lewat email, dan Anda ingin AISA menilainya.

⚠️ Membuat proposal baru. Pakai deck uji, hapus di akhir (UC-PRP-25).

**Sebelum mulai:** di halaman **Proposal**. Siapkan PDF berteks (bukan hasil pindai) di bawah 20
MB, mis. deck rekaan startup "UJI Tani Cabai". AISA sedang tidak dijeda.

**Langkah:**

1. Klik **Unggah pitch deck** (kanan baris filter).
2. Di dialog **Unggah pitch deck**, klik kolom **Berkas PDF** dan pilih berkasnya.
3. Isi **Nama startup (opsional)** dengan `UJI Tani Cabai`.
4. Klik **Unggah**.
5. Tetap di halaman detail yang terbuka dan tunggu sekitar setengah menit, tanpa memuat ulang.

**Yang seharusnya terlihat:**

- Dialog bertuliskan "PDF dinilai lewat alur yang sama dengan Form. Hanya teksnya yang dikirim
  ke model, kecuali deck hasil pindai: PDF-nya dibaca AI sebagai gambar."
- Saat mengirim, tombol berubah menjadi **Mengunggah…**.
- Lalu toast "Pitch deck diterima dan sedang diproses.", dialog tertutup, dan Anda dibawa ke detail
  proposal baru itu dengan badge **Antre** atau **Sedang dinilai** dan skor "—".
- Di bawah kartu nama muncul kartu **AISA sedang menilai proposal ini** (atau **Menunggu giliran
  dinilai** selama masih antre) dengan pengukur **Sudah berjalan** (menit:detik). Di dalamnya
  daftar langkah: **Membaca teks tiap halaman**, **Memeriksa deck bisa dibaca**, **AI menilai 5
  kriteria** (bertanda **AI**), **Menghitung skor**, **Mencocokkan dengan fokus investasi**,
  **Menentukan kategori**, **Menyimpan hasil**, masing-masing dengan satu kalimat penjelasan.
  Langkah yang selesai bertanda centang hijau dan lamanya (mis. "1,6 dtk"); langkah yang sedang
  dikerjakan berputar dengan pengukur detiknya sendiri; sisanya abu-abu bertulisan "menunggu".
  Saat AI menilai tertulis "Langkah terlama, biasanya 15–25 detik."; lewat 25 detik berubah
  menjadi "Lebih lama dari biasanya; masih menunggu jawaban AI." Di sela dua langkah, langkah
  berikutnya bertulisan "berikutnya" (bukan berputar).
- Kartu itu diperbarui sendiri tiap sekitar 1,5 detik, tanpa memuat ulang. Begitu selesai,
  halaman menampilkan skor, badge kategori, Ringkasan AI, dan nilai per kriteria, dengan bilah
  hijau "Penilaian selesai dalam <n> dtk. Hasilnya ada di bawah." dan tombol **Lihat langkahnya**
  (membuka Log penilaian). Riwayat berisi **Proposal masuk**.
- Bila berakhir **Perlu dicek manual**, kartu tetap tampil dengan alasannya dan langkah yang tidak
  dijalankan bertulisan "dilewati". Bila gagal diproses, kartu **Penilaian gagal** menyebut
  alasannya dan bahwa proposal kembali ke antrean dan dinilai lagi setelah perintah LANJUT.
- Pemeriksaan otomatis berhenti setelah sekitar 5 menit; kartu lalu bertulisan "Masih berjalan
  lebih lama dari biasanya, jadi halaman berhenti memeriksa otomatis." dengan tombol **Periksa
  lagi**.
- Kartu **Founder** bertuliskan "Data founder tidak disebut." karena unggahan tidak membawa data
  founder, dan baris sumbernya "Unggahan · <nama berkas> · <n> halaman".
- Proposal baru juga muncul di daftar dan angka tab **Belum ditanggapi** bertambah 1.

Mengunggah PDF yang persis sama untuk kedua kalinya tidak membuat proposal kedua: toast berbunyi
"Pitch deck ini sudah pernah diunggah. Membuka proposalnya." dan Anda dibawa ke proposal yang sudah
ada.

**Kalau berbeda:** bila status tetap **Antre** lebih dari beberapa menit, cek apakah AISA dijeda
(banner di atas halaman; kartunya lalu berjudul **Penilaian dijeda** dan bertulisan "AI sedang
dijeda (STOP). Proposal ini akan dinilai setelah LANJUT.") dan halaman **Aktivitas AI**.

### UC-PRP-10 · Mengunggah berkas yang bukan PDF

**Situasi:** Anda tidak sengaja memilih berkas Word atau gambar.

**Sebelum mulai:** dialog **Unggah pitch deck** terbuka. Siapkan berkas `.txt` atau `.docx`, dan
satu berkas teks yang namanya diganti menjadi `palsu.pdf`.

**Langkah:**

1. Di jendela pilih berkas, ubah jenis berkas menjadi "Semua berkas", pilih berkas `.txt`, lalu
   klik **Unggah**.
2. Ganti berkasnya dengan `palsu.pdf`, lalu klik **Unggah**.

**Yang seharusnya terlihat:**

- Jendela pilih berkas secara bawaan hanya menampilkan PDF.
- Langkah 1: kotak merah di dialog dan toast bertuliskan "Berkas bukan PDF." Pemeriksaan ini di
  browser, jadi berkas tidak dikirim.
- Langkah 2: kotak merah dan toast dengan kalimat yang sama, "Berkas bukan PDF." Kali ini yang
  menolak adalah server AISA setelah memeriksa isinya, karena namanya berakhiran `.pdf`.
- Dialog tetap terbuka, tidak ada proposal baru di daftar.

**Kalau berbeda:** bila berkas bukan PDF ikut masuk ke daftar, catat nama dan jenis berkasnya.

### UC-PRP-11 · Mengunggah PDF lebih dari 20 MB

**Situasi:** deck founder sangat besar karena penuh gambar.

**Sebelum mulai:** dialog **Unggah pitch deck** terbuka. Siapkan PDF di atas 20 MB.

**Langkah:**

1. Pilih berkas besar itu di **Berkas PDF**.
2. Klik **Unggah**.

**Yang seharusnya terlihat:**

- Langsung muncul kotak merah di dialog dan toast: "PDF lebih dari 20 MB." Pemeriksaan ini di
  browser, jadi berkas tidak dikirim.
- Tidak ada proposal baru.

**Kalau berbeda:** bila unggahan berjalan lama lalu gagal dengan pesan lain, catat pesannya.

## Detail proposal

### UC-PRP-12 · Owner bertanya: kenapa skor proposal A segitu

**Situasi:** owner bertanya kenapa Klinik Desa Sehat dapat skor 78,1, dan Anda ingin menjawab
dengan bukti dari deck.

**Sebelum mulai:** di halaman **Proposal**.

**Langkah:**

1. Klik **Klinik Desa Sehat** di tabel (atau cari lewat **Cari proposal** ⌘K di header).
2. Baca kotak **Skor kualitas** di kanan kartu atas.
3. Baca kartu **Ringkasan AI**: kotak **Kelebihan** dan **Perlu dicek**.
4. Gulir ke kartu **Nilai per kriteria**. Untuk tiap kriteria baca nilai /5, **Bobot**, kutipan,
   label halamannya, dan alasannya.
5. Klik **Cara AI menilai** di pojok kartu Ringkasan AI.

**Yang seharusnya terlihat:**

- Kartu atas: nama, kalimat ringkas, sektor, tahap, "Cari Rp 3.000.000.000", "Masuk 21 Okt 2026,
  18.45", badge **Cocok** dan **Belum ditanggapi**.
- **Skor kualitas** 78,1 /100 dengan bar berwarna dan teks "3 dari 3 syarat fokus terpenuhi".
  Angka ini sama dengan kolom **Skor** di daftar.
- **Ringkasan AI** bertuliskan "Dibuat dari pitch deck · <n> rb token". **Kelebihan** memuat
  kriteria bernilai 4–5. **Perlu dicek** memuat kriteria bernilai 1–2, yang tidak dibahas, atau
  yang kutipannya tidak terverifikasi; bila tidak ada, tertulis "Tidak ada kriteria bernilai 1–2
  atau tanpa bukti." Di bawahnya: "AI bisa salah. Cocokkan dengan kutipan di bawah, atau buka log
  penilaian untuk melihat alasannya."
- **Nilai per kriteria**: lima baris (Tim, Pasar & masalah, Produk & keunggulan, Traksi, Model
  bisnis & keuangan). Tiap kutipan diberi label "Hal. <n>". Klik label itu untuk membuka
  pratinjau deck di halaman tersebut (UC-PRP-21) dan cocokkan: kalimat itu ada di halaman yang
  disebut.
- Keterangan kartu menyebut versi aturan dan model, mis. "Aturan v1 · model gemini-3.8-flash."
  Bila aturan sudah diubah sejak dinilai, ada kalimat "Bobot yang tampil dari aturan v3 yang
  berlaku sekarang." Artinya bobot di layar adalah bobot sekarang, bukan bobot saat dinilai.
- **Cara AI menilai** membuka jendela **Log penilaian** (UC-PRP-13). Langkah **Menghitung skor** di
  jendela itu menunjukkan tabel Nilai × Bobot = Poin dan **Skor akhir** yang sama dengan skor di
  atas.

**Kalau berbeda:** catat kriteria, kutipan, dan nomor halaman yang tidak cocok dengan deck.

### UC-PRP-13 · Membuka log penilaian

**Situasi:** Anda ingin tahu apa saja yang dikerjakan AISA, kapan, berapa lama, dan bagian mana
yang oleh AI.

**Sebelum mulai:** di detail proposal yang sudah dinilai dan pernah ditanggapi, mis. Panen Kita.

**Langkah:**

1. Klik **Lihat log penilaian** di bawah kotak **Skor kualitas**.
2. Baca ringkasan di atas jendela, lalu gulir linimasanya dari atas ke bawah. Klik **Lihat
   rincian** di langkah **Menghitung skor** dan **Menentukan kategori**.
3. Di langkah **AI menilai 5 kriteria**, klik label **hal. <n>** pada salah satu bukti.
4. Tutup pratinjau dengan Esc, lalu klik **Semua aktivitas AI** di bagian bawah.
5. Kembali, lalu tutup jendela dengan tombol silang atau tombol Esc.

**Yang seharusnya terlihat:**

- Jendela di tengah layar (di ponsel memenuhi layar) berjudul **Log penilaian**: "Apa saja yang
  dikerjakan AISA saat menilai proposal ini, berurutan dari awal sampai selesai. Semua jam dalam
  WIB." Bagian atasnya tetap terlihat saat digulir.
- Empat angka: **Lama penilaian** (mis. 23,4 dtk), tanggal dengan jam mulai → selesai (mis.
  "21.29.22 → 21.29.46"), **Token AI** (mis. 11,7 rb), dan **Model**. Di bawahnya jumlah langkah
  per pelaku, mis. "1 langkah AI", "6 langkah Sistem", "2 langkah Manajer".
- Kotak "AI hanya memberi nilai dan menulis alasannya. Skor, cek fokus, dan kategori dihitung
  sistem dengan aturan yang sama untuk semua proposal."
- Linimasa berurutan: **Membaca teks tiap halaman**, **Memeriksa deck bisa dibaca**, **AI menilai 5
  kriteria** (satu-satunya bertanda **AI**), **Menghitung skor**, **Mencocokkan dengan fokus
  investasi**, **Menentukan kategori**, **Menyimpan hasil**. Proposal Form yang dinilai ulang
  diawali **Mengambil pitch deck**. Tiap langkah menyebut jam mulai (jj.mm.dd), lamanya, pelakunya
  (**AI** atau **Sistem**), satu kalimat penjelasan, **Hasil:** (mis. "Skor 81,9", "3 dari 3
  syarat terpenuhi", "Sangat cocok"), dan nama aksi serta tool yang tercatat (mis. "Menilai 5
  kriteria · gemini.generate_content"). Garis tipis di bawah judul menunjukkan porsi langkah itu
  dari seluruh waktu; langkah AI hampir memenuhi garisnya.
- Rincian **AI menilai 5 kriteria** terbuka sejak awal: nilai, bukti dengan label **hal. <n>**, dan
  alasan AI tiap kriteria. **hal. <n>** membuka pratinjau deck di halaman itu, dan Esc kembali ke
  log.
- Rincian **Menghitung skor** berupa tabel Nilai × Bobot = Poin dan **Skor akhir**; rincian
  **Menentukan kategori** menjelaskan aturannya (mis. "Lolos cek fokus, skor 81,9 mencapai 80,0,
  dan tidak ada kriteria bernilai 1.") beserta ambang tiap kategori, yang terpakai disorot.
- Setelah pemisah **Setelah penilaian**: koreksi dan tanggapan manajer dengan jam dan alasannya.
- **Semua aktivitas AI** membuka halaman **Aktivitas AI** di pekerjaan penilaian ini.
- Tombol **Cara AI menilai** dan **Log penilaian** (di kartu **Riwayat**) membuka jendela yang sama.

**Kalau berbeda:** bila tombol log tidak ada sama sekali, proposal itu belum punya pekerjaan
penilaian; catat statusnya.

### UC-PRP-14 · Kriteria yang tidak dibahas atau kutipannya tidak terverifikasi

**Situasi:** deck founder tidak membahas timnya, dan Anda ingin memastikan AISA tidak mengarang.

**Sebelum mulai:** saat panduan ditulis, belum ada proposal produksi dengan tanda ini. Untuk
mengujinya, unggah deck UJI tanpa halaman tim (lihat UC-PRP-09). ⚠️ Itu membuat proposal baru.

**Langkah:**

1. Buka detail proposal UJI tersebut setelah dinilai.
2. Lihat kriteria **Tim** di **Nilai per kriteria**.
3. Lihat kotak **Perlu dicek** di **Ringkasan AI**.

**Yang seharusnya terlihat:**

- Kriteria **Tim** bernilai 1/5 dengan baris berwarna kuning "Tidak dibahas di pitch deck" dan
  tanpa kutipan.
- Kriteria itu tercantum di **Perlu dicek**.
- Badge **kutipan tidak terverifikasi** muncul hanya bila AI mengutip kalimat yang tidak
  ditemukan di halaman yang disebutnya. Arahkan mouse ke badge: "Tidak ada kutipan yang ditemukan
  di halamannya, jadi nilai dibatasi 2". Tanda ini tidak bisa dipicu dengan sengaja; bila Anda
  menemukannya, nilai kriteria itu paling tinggi 2 dan alasannya menyebut berapa kutipan yang
  dibuang.

**Kalau berbeda:** kriteria yang tidak ada di deck tetapi bernilai di atas 1, atau kutipan yang
tidak ada di halaman yang disebut, adalah temuan penting: catat kriteria dan halamannya.

### UC-PRP-15 · Mengecek kesesuaian dengan fokus investasi

**Situasi:** Anda ingin tahu kenapa Saku Hukum masuk **Tidak cocok** padahal skornya 63,1.

**Sebelum mulai:** di detail Saku Hukum.

**Langkah:**

1. Gulir ke kartu **Sesuai fokus investasi?**.
2. Baca tiga kotak **Sektor**, **Tahap**, **Dana**.
3. Klik **Lihat aturan**.

**Yang seharusnya terlihat:**

- Keterangan "Dicek otomatis dari aturan penilaian, tanpa AI."
- Kotak hijau bertanda centang untuk syarat yang lulus, merah bertanda silang untuk yang gagal.
  Untuk Saku Hukum: Sektor "f&b di luar sektor fokus", Tahap "tidak disebut", Dana "Rp24 M di luar
  rentang Rp1 M–Rp20 M".
- Jumlah yang lulus sama dengan teks di kotak skor, mis. "0 dari 3 syarat fokus terpenuhi".
- Proposal yang gagal satu syarat saja langsung berkategori **Tidak cocok**, berapa pun skornya.
- **Lihat aturan** membuka halaman **Aturan penilaian**. Sektor, tahap, dan rentang dana di sana
  sama dengan alasan di kotak.

**Kalau berbeda:** catat syarat yang hasilnya bertentangan dengan aturan di halaman **Aturan
penilaian**.

### UC-PRP-16 · Membaca riwayat proposal

**Situasi:** Anda ingin tahu apa saja yang sudah terjadi pada Kopi Teras Senja.

**Sebelum mulai:** di detail Kopi Teras Senja.

**Langkah:**

1. Gulir ke kartu **Riwayat** ("Dari proposal masuk sampai keputusan terakhir").
2. Baca baris dari atas ke bawah.

**Yang seharusnya terlihat:**

- Baris terbaru di atas, ditandai titik berwarna. Contoh saat panduan ditulis: dua baris
  **Koreksi kategori** (satu via Dashboard, satu via WhatsApp, masing-masing dengan alasannya)
  lalu **Proposal masuk** via Sistem.
- Tiap baris: judul tindakan, keterangan, alasan atau catatan setelah tanda "—", "via
  Dashboard/WhatsApp/Sistem", dan tanggal-jam.
- Tanggapan dari WhatsApp juga tercatat di sini dengan "via WhatsApp".
- Keputusan yang datang dari tanggapan massal per kategori (UC-PRP-08, atau "arsipkan semua …"
  lewat WhatsApp) tampil sebagai baris **Tanggapan massal** dengan keterangan seperti
  "Diarsipkan lewat tanggapan massal", catatannya (kalau ada), salurannya, dan waktunya. Hanya
  keputusan terakhir proposal yang dibuat begini; tanggapan massal yang sudah ditimpa keputusan
  lain tidak tampil di kartu ini, tetapi tetap ada di halaman **Riwayat**.
- Keterangan lama yang tersimpan dengan skor dan kategori mentah (mis. "skor 63.1, tidak_cocok")
  ditampilkan dengan kata yang sama seperti di layar lain: "skor 63,1, Tidak cocok".

**Kalau berbeda:** catat tindakan yang Anda tahu terjadi tetapi tidak tercantum.

### UC-PRP-17 · Anda memutuskan mengundang founder A

**Situasi:** Anda yakin dengan proposal A dan ingin mengundang foundernya berdiskusi.

⚠️ Mengubah data dan tidak bisa dikembalikan ke "Belum ditanggapi". Pakai proposal UJI.

**Sebelum mulai:** di detail proposal UJI yang belum ditanggapi.

**Langkah:**

1. Di kartu **Keputusan Anda** (kanan), baca "Sekarang: Belum ditanggapi".
2. Ketik catatan di kolom **Catatan untuk tanggapan (opsional)**, mis. `jadwalkan minggu depan`.
3. Klik **Undang** ("Ajak founder diskusi").

**Yang seharusnya terlihat:**

- Toast "Tanggapan tersimpan: Undang." dan kolom catatan kosong lagi.
- "Sekarang: Diundang · <tanggal, jam> via Dashboard", catatan tampil dalam tanda kutip di atas
  tombol.
- Tombol **Undang** diberi bingkai, ikon centang, dan tidak bisa diklik lagi.
- Badge di kartu atas menjadi **Diundang**. Riwayat mendapat baris **Tanggapan**: "Undang <nama>
  — jadwalkan minggu depan · via Dashboard".
- Di daftar, proposal pindah ke tab **Diundang**. Angka badge **Proposal** di sidebar berkurang 1.
- Di bawah kartu tertulis "Bisa juga lewat WhatsApp: ketik “undang <nama>”."

**Kalau berbeda:** bila muncul kotak merah, catat pesannya; tanggapan belum tersimpan.

### UC-PRP-18 · Memantau atau mengarsipkan proposal

**Situasi:** Anda belum yakin dengan satu proposal, atau sudah yakin tidak melanjutkannya.

⚠️ Mengubah data. Pakai proposal UJI.

**Sebelum mulai:** di detail proposal UJI.

**Langkah:**

1. Klik **Pantau** ("Lihat lagi nanti").
2. Klik **Arsipkan** ("Tidak dilanjutkan"). Di dialog, klik **Batal**.
3. Klik **Arsipkan** lagi, lalu **Arsipkan** di dialog.

**Yang seharusnya terlihat:**

- Langkah 1: toast "Tanggapan tersimpan: Pantau.", "Sekarang: Dipantau".
- Langkah 2: dialog "Arsipkan <nama>?" dengan teks "Proposal ini tidak lagi muncul di daftar yang
  perlu ditanggapi. Riwayatnya tetap tersimpan." **Batal** tidak mengubah apa pun.
- Langkah 3: toast "Tanggapan tersimpan: Arsipkan.", "Sekarang: Diarsipkan". Riwayat sekarang
  punya dua baris **Tanggapan**.
- Tanggapan bisa diganti kapan saja ke pilihan lain, tetapi tidak bisa kembali ke "Belum
  ditanggapi".

**Kalau berbeda:** catat tombol yang diklik dan apa yang tampil di "Sekarang:".

### UC-PRP-19 · Menyiapkan pertemuan lewat kartu Tanya AISA

**Situasi:** Anda akan bertemu founder Klinik Desa Sehat dan ingin daftar pertanyaan.

**Sebelum mulai:** di detail proposal. AISA tidak sedang dijeda.

**Langkah:**

1. Di kartu **Tanya AISA** ("Siapkan diri sebelum bertemu founder."), klik **Pertanyaan untuk
   founder**.
2. Tunggu jawabannya. Lalu klik **Risiko yang perlu dicek**.

**Yang seharusnya terlihat:**

- Panel Tanya AISA terbuka di kanan dan langsung mengirim pertanyaan "Buatkan pertanyaan untuk
  founder Klinik Desa Sehat" tanpa Anda mengetik.
- Jawaban menyebut hal dari deck Klinik Desa Sehat, bukan proposal lain.
- Tombol kedua mengirim "Apa risiko Klinik Desa Sehat?". Bila jawaban pertama masih berjalan,
  pertanyaan kedua menunggu lalu terkirim.

**Kalau berbeda:** catat pertanyaan dan jawaban yang membahas proposal yang salah. Isi panel Tanya
AISA dibahas di panduan Asisten.

### UC-PRP-20 · Menghubungi founder

**Situasi:** Anda ingin mengirim email ke founder Saku Hukum.

**Sebelum mulai:** di detail proposal yang masuk lewat Form (mis. Saku Hukum).

**Langkah:**

1. Lihat kartu **Founder** di kanan.
2. Klik **Email**.
3. Bandingkan dengan detail proposal unggahan (mis. Klinik Desa Sehat).

**Yang seharusnya terlihat:**

- Proposal Form: inisial, nama founder, dan alamat email, lalu tombol **Pratinjau deck** dan
  tombol **Email**, keduanya selebar kartu. Baris sumber "Form · <nama berkas> · <n> halaman".
- **Email** membuka aplikasi email Anda dengan alamat founder sudah terisi.
- Proposal unggahan: "Data founder tidak disebut.", tanpa tombol **Email**, dengan tombol
  **Pratinjau deck** dan **Buka deck**, dan baris sumber "Unggahan · …".

**Kalau berbeda:** catat proposal yang alamat emailnya kosong atau salah.

### UC-PRP-21 · Membuka pitch deck asli

**Situasi:** Anda ingin membaca deck asli untuk mencocokkan kutipan AI.

**Sebelum mulai:** di detail proposal **unggahan** (mis. Klinik Desa Sehat). Untuk langkah 5,
detail proposal yang masuk lewat Form (mis. Saku Hukum), masuk dengan akun Google yang bisa
membuka berkas Drive-nya. Use case ini tidak mengubah data.

**Langkah:**

1. Di kartu **Founder**, klik **Pratinjau deck**.
2. Tekan Esc, lalu di **Nilai per kriteria** klik label "Hal. <n>" di samping sebuah kutipan.
3. Tekan Esc, klik **Cara AI menilai**, lalu di panel **Log penilaian** klik "hal. <n>" di
   samping "Bukti dari".
4. Tutup semua panel, lalu di kartu **Founder** klik **Buka deck**.
5. Di detail proposal Form, klik label "Hal. <n>" mana pun.

**Yang seharusnya terlihat:**

- Langkah 1: panel **Pratinjau deck** terbuka di kanan (di ponsel: selayar penuh) dengan nama
  berkas, "· <n> halaman", PDF deck di dalam panel, dan tombol **Buka di tab baru**. Selama PDF
  dimuat tertulis "Membuka deck…". Di bawah: "Tautan pratinjau berlaku 15 menit; …".
- Langkah 2: panel yang sama terbuka dengan label "hal. <n>" di samping judul, dan PDF langsung
  menampilkan halaman itu. Kalimat kutipan ada di halaman tersebut.
- Langkah 3: pratinjau terbuka di halaman itu di atas Log penilaian; Esc menutup pratinjau dan
  Log penilaian tampil lagi.
- Langkah 4: tab baru terbuka dan menampilkan PDF deck itu. Di bawah tombol muncul tautan
  cadangan **Tautan deck (sementara)**. Pakai tautan itu bila browser memblokir tab baru.
  Tautannya hanya berlaku sebentar; klik **Buka deck** lagi untuk tautan baru.
- Langkah 5: pratinjau Google Drive tampil di panel, mulai dari halaman 1, dengan label
  "hal. <n>" dan catatan "Pratinjau Drive selalu mulai dari halaman 1; gulir ke hal. <n>."
  Proposal Form tidak punya tombol **Buka deck**; pakai **Buka di tab baru** di panel.

**Kalau berbeda:** bila panel bertuliskan "Deck tidak bisa dibuka." atau muncul toast, catat
pesannya. Bila panel kosong atau browser menampilkan halaman terblokir, catat browsernya dan
pakai **Buka di tab baru**. Tab kosong yang langsung tertutup setelah **Buka deck** juga berarti
tautan gagal dibuat.

### UC-PRP-22 · Koreksi kategori tanpa alasan

**Situasi:** Anda mencoba mengoreksi kategori tanpa menulis alasan.

**Sebelum mulai:** di detail proposal yang sudah dinilai, mis. Klinik Desa Sehat. Use case ini
tidak mengubah data.

**Langkah:**

1. Di kartu **Kategori kurang pas?** ("Ubah kategorinya. Skor dari AI tetap disimpan."), klik
   **Pilih kategori baru**.
2. Perhatikan pilihannya, lalu pilih **Kurang cocok**.
3. Biarkan kolom alasan kosong, klik **Simpan koreksi**.

**Yang seharusnya terlihat:**

- Pilihan: **Sangat cocok**, **Cocok**, **Kurang cocok**, **Tidak cocok**. Kategori yang sedang
  berlaku (Cocok) tampil redup dan tidak bisa dipilih.
- **Simpan koreksi** tidak bisa diklik sebelum kategori dipilih.
- Setelah diklik tanpa alasan: kotak merah "Alasan koreksi wajib diisi." Kategori tidak berubah.

**Kalau berbeda:** bila kategori berubah tanpa alasan, itu bug: catat proposalnya.

### UC-PRP-23 · Mengoreksi kategori

**Situasi:** Anda kenal timnya dan menilai proposal UJI layak naik kategori.

⚠️ Mengubah data. Pakai proposal UJI.

**Sebelum mulai:** di detail proposal UJI yang sudah dinilai.

**Langkah:**

1. Klik **Pilih kategori baru**, pilih kategori lain.
2. Isi kolom **Alasannya, mis. timnya sudah saya kenal**, mis. `tim sudah saya kenal`.
3. Klik **Simpan koreksi**.

**Yang seharusnya terlihat:**

- Toast "Kategori dikoreksi ke <kategori>."
- Badge kategori di kartu atas berganti, dan badge **dikoreksi** muncul.
- Keterangan kartu berubah: "AI menilai <kategori lama>, lalu dikoreksi ke <kategori baru>
  (<tanggal, jam>, Dashboard): “tim sudah saya kenal”."
- **Skor kualitas** tidak berubah.
- Riwayat mendapat baris **Koreksi kategori**. Di daftar, proposal pindah ke filter kategori baru
  dan menampilkan teks **dikoreksi**.

**Kalau berbeda:** bila skornya ikut berubah, catat skor sebelum dan sesudah.

### UC-PRP-24 · Hapus data tanpa alasan

**Situasi:** Anda membuka dialog hapus tetapi belum menulis alasan.

**Sebelum mulai:** di detail proposal mana pun. Use case ini tidak mengubah data.

**Langkah:**

1. Klik **Hapus data** (tombol merah kanan atas).
2. Baca dialognya, biarkan **Alasan (wajib)** kosong, klik **Hapus permanen**.
3. Klik **Batal**.

**Yang seharusnya terlihat:**

- Dialog "Hapus data <nama>?" dengan teks "Proposal, teks, pitch deck, dan log penilaiannya
  dihapus permanen. Riwayat tetap ada tanpa nama proposal." Kolom alasan berisi contoh "mis.
  permintaan founder".
- Setelah **Hapus permanen**: kotak merah "Alasan penghapusan wajib diisi." Dialog tetap terbuka.
- **Batal** menutup dialog; proposal tetap ada.

**Kalau berbeda:** bila proposal terhapus tanpa alasan, itu bug serius: catat proposalnya.

### UC-PRP-25 · Founder minta datanya dihapus

**Situasi:** founder UJI Tani Cabai meminta semua datanya dihapus. Ini juga cara membersihkan
proposal uji di akhir pengujian.

⚠️ Permanen dan tidak bisa dibatalkan. Hanya untuk proposal UJI.

**Sebelum mulai:** di detail proposal UJI. Catat namanya.

**Langkah:**

1. Klik **Hapus data**.
2. Isi **Alasan (wajib)** dengan `permintaan founder`.
3. Klik **Hapus permanen**.
4. Cari nama proposal itu di daftar dan di **Cari proposal** ⌘K.
5. Buka **Riwayat** di sidebar.

**Yang seharusnya terlihat:**

- Toast "Data proposal <nama> dihapus." dan Anda dibawa ke daftar **Proposal**.
- Proposal tidak ada di daftar, tidak bisa dicari, dan angka tab berkurang 1.
- Membuka alamat lama proposal itu menampilkan halaman 404 (UC-PRP-29).
- Halaman **Riwayat** punya baris **Proposal dihapus** dengan alasan "permintaan founder". Baris
  riwayat lama proposal itu tetap ada tetapi tanpa nama proposal.
- Bila Anda pernah bertanya tentang proposal ini di Tanya AISA, sesi dan ingatan Asisten yang
  menyebut namanya ikut dihapus. Tanyakan lagi tentang proposal itu: Asisten tidak menemukannya.

**Kalau berbeda:** bila nama proposal masih muncul di halaman **Riwayat** atau pencarian setelah
dihapus, catat di mana tepatnya.

## Kasus khusus

### UC-PRP-26 · Proposal yang perlu dicek manual

**Situasi:** AISA tidak bisa membaca deck Lumbung Ikan Pesisir dan Anda ingin tahu kenapa.

**Sebelum mulai:** di halaman **Proposal**.

**Langkah:**

1. Pilih **Perlu dicek manual** di kotak status.
2. Klik **Lumbung Ikan Pesisir**.
3. Klik **Buka deck** untuk melihat deck aslinya.

**Yang seharusnya terlihat:**

- Di daftar: badge kuning **Perlu dicek manual** di kolom Kategori, Dana "—", Skor "—". Baris ini
  ada di bawah saat diurutkan menurut skor.
- Di detail: sektor, tahap, dana tertulis "… tidak disebut". Badge **Perlu dicek manual** dengan
  alasan di bawahnya, mis. "teks terlalu sedikit (0 karakter di 10 halaman)". Lumbung Ikan
  Pesisir adalah deck hasil pindai yang dinilai sebelum AISA bisa membaca deck sebagai gambar;
  deck hasil pindai yang masuk sekarang biasanya tetap dinilai (lihat UC-FRM-05).
- **Skor kualitas** "—" dan "Tidak dinilai: deck perlu dicek manual, tanpa skor dan kategori."
  Kalimat yang sama ada di **Nilai per kriteria**. Kartu **Ringkasan AI** tidak ada.
  **Sesuai fokus investasi?** bertuliskan "Belum ada cek kecocokan."
- Kartu **Kategori kurang pas?** tidak ada, karena proposal tanpa kategori tidak bisa dikoreksi.
- **Keputusan Anda** tetap bisa dipakai: Anda boleh menanggapi setelah membaca deck sendiri.

**Kalau berbeda:** bila deck berteks jelas berakhir di sini, catat alasannya dan nama berkasnya.

### UC-PRP-27 · Proposal berkualitas di luar fokus

**Situasi:** Anda tidak ingin melewatkan proposal bagus yang ditolak hanya karena di luar fokus.

**Sebelum mulai:** di halaman **Proposal**. Tanda ini muncul pada proposal yang gagal cek fokus
tetapi skornya mencapai ambang "Berkualitas, di luar fokus" di **Aturan penilaian** (saat panduan
ditulis 65), selama kategorinya masih **Tidak cocok**. Saat panduan ditulis, filternya kosong:
Kopi Teras Senja awalnya bertanda ini (lihat Riwayatnya) tetapi sudah dikoreksi ke Sangat cocok,
jadi tandanya tidak tampil lagi. Untuk mengujinya, unggah deck UJI yang kuat di sektor di luar
fokus (mis. f&b). ⚠️ Itu membuat proposal baru.

**Langkah:**

1. Pilih **Berkualitas, di luar fokus** di kotak kategori.
2. Klik proposal yang muncul.

**Yang seharusnya terlihat:**

- URL `?luarFokus=1`. Tanpa proposal yang cocok: **Tidak ada proposal yang cocok** dan angka tab
  semua 0.
- Di daftar, proposal itu berbadge **Tidak cocok** dengan teks kuning **Berkualitas, di luar
  fokus** di bawahnya.
- Di detail: badge kuning **Berkualitas, di luar fokus** di kartu atas, skor 65 atau lebih, dan
  minimal satu syarat merah di **Sesuai fokus investasi?**.
- Setelah dikoreksi ke kategori lain (UC-PRP-23), tanda itu hilang dari daftar dan detail.

**Kalau berbeda:** catat proposal yang bertanda padahal skornya di bawah ambang, atau yang tidak
bertanda padahal memenuhi syaratnya.

### UC-PRP-28 · Akun yang hanya bisa membaca

**Situasi:** rekan Anda perlu melihat proposal tanpa bisa menanggapi atau menghapus.

⚠️ Membuat akun login baru. Hapus akun itu setelah selesai.

**Sebelum mulai:** AISA tidak punya halaman pendaftaran. Minta tim yang memegang Firebase
membuat akun di Firebase Console (Authentication, tambah pengguna) **tanpa** custom claim
`role`, atau dengan `role` = `user`. Akun tanpa claim otomatis masuk sebagai akun baca-saja. Di
lingkungan lokal (emulator) akun ini sudah tersedia: `viewer@aisa.test`.

**Langkah:**

1. Masuk dengan akun baca-saja itu.
2. Buka **Proposal**.
3. Centang satu baris.
4. Buka detail satu proposal yang sudah dinilai.

**Yang seharusnya terlihat:**

- Di daftar: tidak ada tombol **Unggah pitch deck**. **Ekspor CSV**, cari, filter, dan urut tetap
  bisa dipakai. Memilih satu kategori tidak memunculkan kotak "Tanggapi semua …".
- Bilah pilihan hanya berisi "1 dipilih" dan ikon silang, tanpa **Undang**/**Pantau**/
  **Arsipkan**.
- Di detail: tidak ada tombol **Hapus data**. Kartu bernama **Keputusan** (bukan "Keputusan
  Anda"), menampilkan "Sekarang: …" dan teks "Akun Anda hanya bisa membaca; tanggapan diberikan
  manajer investasi." tanpa tombol tanggapan.
- Kartu **Kategori kurang pas?** tidak ada, kecuali proposal itu pernah dikoreksi: maka hanya
  keterangan koreksinya yang tampil, tanpa formulir.
- **Lihat log penilaian**, **Tanya AISA**, **Email**, **Pratinjau deck** (juga dari label
  "Hal. <n>"), dan **Buka deck** tetap bisa dipakai.

**Kalau berbeda:** tombol tulis apa pun yang tampil di akun baca-saja adalah temuan: catat tombol
dan halamannya.

### UC-PRP-29 · Membuka alamat proposal yang tidak ada

**Situasi:** Anda membuka tautan proposal lama yang sudah dihapus.

**Sebelum mulai:** sudah masuk.

**Langkah:**

1. Buka https://aisa-dashboard-lk5jbo3eza-et.a.run.app/proposal/tidak-ada.
2. Klik **Kembali ke dasbor**.

**Yang seharusnya terlihat:**

- Halaman "404 — Halaman tidak ditemukan" dengan teks "Halaman yang Anda cari tidak ada atau
  mungkin telah dipindahkan." Sidebar dan header tetap tampil.
- **Kembali ke dasbor** membuka **Dashboard**.

**Kalau berbeda:** bila muncul halaman error lain, catat URL dan teksnya.
