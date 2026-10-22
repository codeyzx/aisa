# Panduan uji: Aktivitas AI, Riwayat, Aturan penilaian, Pengaturan

## Cakupan

Panduan ini untuk Anda, pemilik produk, yang ingin mencoba sendiri empat halaman "di balik layar"
AISA: **Aktivitas AI** (apa yang dikerjakan AI, berapa token, berapa lama), **Riwayat** (jejak
audit siapa melakukan apa), **Aturan penilaian** (cara AISA menghitung skor dan grade), dan
**Pengaturan** (akun, tema, ringkasan WhatsApp, integrasi, privasi). Sebagian besar langkah hanya
membaca. Langkah yang mengubah data ditandai ⚠️. Untuk langkah itu, selalu kembalikan nilai semula
setelah selesai. Nama proposal di sini (mis. Kopi Teras Senja, Kelas Kode Rakyat) hanya contoh dari
data produksi saat panduan ditulis. Data bisa berubah, jadi pakai proposal yang ada di layar Anda.

Semua use case memakai produksi di https://aisa-dashboard-lk5jbo3eza-et.a.run.app. Masuk dengan
email `manager@aisa.local` dan sandi admin dari tim, kecuali disebut lain.

## Daftar isi

Aktivitas AI

- UC-AKT-01 · Berapa token yang dipakai AI 30 hari terakhir
- UC-AKT-02 · Hari mana pemakaian token paling tinggi
- UC-AKT-03 · Melihat pekerjaan satu agent saja
- UC-AKT-04 · Melihat langkah-langkah satu pekerjaan
- UC-AKT-05 · Memastikan langkah "(kode)" tidak memakai token
- UC-AKT-06 · Memuat pekerjaan yang lebih lama
- UC-AKT-07 · Berapa token yang dipakai untuk menilai satu proposal
- UC-AKT-08 · Menemukan pekerjaan AI yang gagal

Riwayat

- UC-RWY-01 · Ringkasan 7 hari terakhir dan menyaring lewat kartu
- UC-RWY-02 · Menyaring per jenis kejadian
- UC-RWY-03 · Siapa yang mengarsipkan proposal minggu ini
- UC-RWY-04 · Hanya kejadian lewat WhatsApp dalam 30 hari
- UC-RWY-05 · Membaca isi ringkasan WhatsApp yang sudah terkirim
- UC-RWY-06 · Memuat kejadian yang lebih lama
- UC-RWY-07 · Mengekspor riwayat ke CSV
- UC-RWY-08 · Melihat jejak proposal yang sudah dihapus
- UC-RWY-09 · Pencarian tanpa hasil

Aturan penilaian

- UC-ATR-01 · Memahami tiga langkah cara AISA menilai
- UC-ATR-02 · Kriteria mana yang paling berpengaruh
- UC-ATR-03 · Kenapa satu proposal dapat skor sekian
- UC-ATR-04 · Berapa proposal di tiap grade
- UC-ATR-05 · Sektor, tahap, dan dana yang menjadi fokus
- UC-ATR-06 · Seberapa sering Anda tidak setuju dengan AI
- UC-ATR-07 · Melihat dampak perubahan aturan tanpa menyimpan
- UC-ATR-08 · Isian aturan yang salah ditolak
- UC-ATR-09 · ⚠️ Menyimpan aturan versi baru lalu mengembalikannya
- UC-ATR-10 · Akun baca-saja tidak bisa mengubah aturan

Pengaturan

- UC-SET-01 · Melihat akun dan hak akses Anda
- UC-SET-02 · Mengganti tema tampilan
- UC-SET-03 · Melihat seperti apa ringkasan WhatsApp berikutnya
- UC-SET-04 · Memastikan layanan AISA terhubung
- UC-SET-05 · ⚠️ Menjeda AI sementara lalu menjalankannya lagi
- UC-SET-06 · Mencoba ganti masa simpan arsip tanpa menyimpan
- UC-SET-07 · Alasan wajib saat mengganti masa simpan arsip
- UC-SET-08 · ⚠️ Menyimpan masa simpan arsip lalu mengembalikannya
- UC-SET-09 · Akun baca-saja di Pengaturan

---

## Aktivitas AI

Halaman ini ada di sidebar kiri, grup **Ruang kerja**, menu **Aktivitas AI**. Judul halaman
**Aktivitas AI** dengan subjudul "Apa saja yang dikerjakan AI, berapa token, dan berapa lama".

### UC-AKT-01 · Berapa token yang dipakai AI 30 hari terakhir

**Situasi:** Anda ingin tahu total pemakaian AI sebulan terakhir dan rata-rata biayanya per proposal.

**Sebelum mulai:** sudah masuk sebagai admin.

**Langkah:**

1. Di sidebar kiri, grup **Ruang kerja**, klik **Aktivitas AI**.
2. Lihat bagian **PEMAKAIAN AI** di atas, yang berisi empat kartu.
3. Arahkan kursor ke angka besar di kartu **Token 30 hari**.

**Yang seharusnya terlihat:**

- Empat kartu: **Token 30 hari**, **Rata-rata per proposal**, **Rata-rata per ringkasan**,
  **Panggilan model**.
- **Token 30 hari** memakai angka ringkas, mis. `652,2 rb`. Di bawahnya tertulis
  "… masuk · … keluar", mis. `548 rb masuk · 104,3 rb keluar`. Saat kursor di atas angka, muncul
  angka lengkap dengan titik ribuan.
- **Rata-rata per proposal** punya catatan "N proposal dinilai model". Proposal yang masuk
  **Perlu dicek manual** tidak ikut dihitung, karena deck-nya tidak sampai ke model.
- **Rata-rata per ringkasan** punya catatan "N ringkasan terkirim".
- **Panggilan model** punya catatan "Tidak ada yang gagal di N pekerjaan terbaru" atau
  "N gagal di N pekerjaan terbaru".
- Cek kewajaran: angka masuk ditambah angka keluar kira-kira sama dengan angka besar.

**Kalau berbeda:** catat angka di keempat kartu dan jamnya. Kalau kartu kosong atau `—`, berarti
belum ada statistik harian di 30 hari itu.

### UC-AKT-02 · Hari mana pemakaian token paling tinggi

**Situasi:** Anda ingin tahu apakah ada hari dengan lonjakan pemakaian AI.

**Sebelum mulai:** berada di **Aktivitas AI**.

**Langkah:**

1. Gulir ke kartu **Token per hari**. Subjudulnya "14 hari terakhir, semua agent", atau "Sejak
   21 Okt, semua agent" kalau hari pertama yang ada tokennya lebih baru dari 14 hari lalu
   (grafik mulai dari hari itu).
2. Arahkan kursor ke titik-titik di garis grafik.

**Yang seharusnya terlihat:** grafik area dengan tanggal di sumbu bawah (mis. `9 Okt`, `11 Okt`, …,
`21 Okt`, satu label tiap dua hari) dan angka ringkas di sumbu kiri (mis. `150 rb`, `300 rb`). Saat
kursor di satu titik, muncul kotak kecil "Pemakaian" dengan nilai "… token". Grafik hanya 14 hari,
sedangkan kartu **Token 30 hari** menghitung 30 hari. Jadi jumlah di grafik boleh lebih kecil dari
angka kartu.

**Kalau berbeda:** kalau grafik kosong padahal kartu token menunjukkan angka, catat dan kirim
tangkapan layar.

### UC-AKT-03 · Melihat pekerjaan satu agent saja

**Situasi:** Anda hanya ingin melihat pekerjaan **Penilai**, tanpa percakapan Asisten.

**Sebelum mulai:** berada di **Aktivitas AI**.

**Langkah:**

1. Gulir ke bagian **LOG AKTIVITAS**.
2. Di deretan tombol di bawah judul, klik **Penilai**.
3. Klik **Orchestrator**, lalu **Semua agent**.

**Yang seharusnya terlihat:**

- Tombol yang tersedia: **Semua agent**, lalu hanya agent yang pernah bekerja, urut **Penilai**,
  **Pembuat ringkasan**, **Asisten**, **Orchestrator**, **Retensi**. Setiap tombol punya titik warna
  agent.
- Setelah klik **Penilai**, semua kartu menampilkan label agent **Penilai** dengan judul seperti
  "Menilai proposal Kopi Teras Senja".
- **Orchestrator** menampilkan pekerjaan seperti "Perintah: STOP" dan "Perintah: LANJUT" dengan label
  **kode · tanpa model**.
- **Semua agent** menampilkan semua pekerjaan lagi.

**Kalau berbeda:** kalau ada kartu dengan agent lain di dalam filter, catat judul kartunya.

### UC-AKT-04 · Melihat langkah-langkah satu pekerjaan

**Situasi:** Anda ingin tahu apa saja yang dilakukan AI dalam satu pekerjaan, langkah demi langkah.

**Sebelum mulai:** berada di **Aktivitas AI**, bagian **LOG AKTIVITAS**.

**Langkah:**

1. Lihat dua kartu teratas. Keduanya langsung terbuka.
2. Klik baris judul kartu ketiga untuk membukanya. Klik lagi untuk menutupnya.

**Yang seharusnya terlihat:**

- Baris judul kartu berisi judul pekerjaan, label agent, nama model (mis. `gemini-3.8-flash`) atau
  **kode · tanpa model**, waktu mulai (mis. `22 Okt 01.09.17`), "N langkah", lalu di kanan
  "Token masuk / keluar", "Durasi … dtk", dan status (**Selesai**, **Berjalan**, **Gagal**, atau
  **Dihentikan**).
- Saat terbuka, muncul tabel dengan kolom **Waktu**, **Aksi**, **Tool**, **Data dibaca / ditulis**,
  **Token masuk / keluar**, **Durasi**, **Status**. Di kolom data, `↳` berarti dibaca dan `↦` berarti
  ditulis.
- Status langkah: **OK**, **Gagal**, atau **Dihentikan**. Langkah gagal menampilkan pesan error merah
  di bawah statusnya.

**Kalau berbeda:** kalau kartu terbuka berisi "Belum ada langkah." untuk pekerjaan yang sudah
**Selesai**, catat judul dan waktunya.

### UC-AKT-05 · Memastikan langkah "(kode)" tidak memakai token

**Situasi:** Anda ingin memastikan bagian yang dihitung sistem, bukan AI, memang tidak memakan biaya
token.

**Sebelum mulai:** berada di **Aktivitas AI**. Klik **Penilai** di deretan agent.

**Langkah:**

1. Buka salah satu kartu "Menilai proposal …".
2. Lihat baris dengan tulisan **(kode)** di kolom **Aksi**, mis. "Hitung skor (kode)", "Cek kecocokan
   (kode)", "Tentukan grade (kode)".
3. Gulir ke bawah daftar dan baca catatan kecil di bagian paling bawah.

**Yang seharusnya terlihat:** setiap baris **(kode)** menampilkan `0` di kolom **Token masuk /
keluar**. Hanya baris "Menilai 5 kriteria · gemini-3.8-flash" yang punya token. Catatan di bawah
berbunyi: "↳ dibaca · ↦ ditulis. Langkah bertanda “kode” tidak memakai model dan tidak memakai
token.".

**Kalau berbeda:** baris **(kode)** dengan token selain 0 adalah temuan. Catat judul kartu dan nama
langkahnya.

### UC-AKT-06 · Memuat pekerjaan yang lebih lama

**Situasi:** Anda mencari pekerjaan kemarin yang tidak terlihat di daftar.

**Sebelum mulai:** berada di **Aktivitas AI**, filter **Semua agent**.

**Langkah:**

1. Gulir ke bawah **LOG AKTIVITAS**.
2. Klik **Tampilkan 12 lagi**.

**Yang seharusnya terlihat:** awalnya ada 12 kartu. Setelah diklik, bertambah 12 (jadi 24), dan
tombol muncul lagi selama masih ada sisa. Saat sisa kurang dari 12, tombol menyebut sisanya
(mis. **Tampilkan 5 lagi**). Mengganti filter agent membuat daftar kembali ke 12 kartu. Kalau log
penuh, catatan di bawah ditambah "Log ini memuat 60 pekerjaan terbaru.". Artinya pekerjaan yang
lebih tua dari 60 terbaru tidak dimuat di halaman ini.

**Kalau berbeda:** kalau tombol tidak menambah kartu, catat jumlah kartu sebelum dan sesudah klik.

### UC-AKT-07 · Berapa token yang dipakai untuk menilai satu proposal

**Situasi:** Anda ingin tahu berapa token yang dipakai untuk menilai proposal A, mis. Kopi Teras
Senja.

**Sebelum mulai:** ada proposal yang sudah dinilai AI.

**Langkah:**

1. Di sidebar kiri, grup **Ruang kerja**, klik **Proposal**.
2. Klik nama proposal, mis. **Kopi Teras Senja**.
3. Di kartu Ringkasan AI, catat teks kecil "Dibuat dari pitch deck · … token" (mis. `4,4 rb token`).
4. Di kartu skor di atas, klik **Lihat log penilaian**.
5. Di panel kanan **Log penilaian**, lihat angka **Token AI**, lalu gulir ke bawah dan klik **Semua
   aktivitas AI**.

**Yang seharusnya terlihat:**

- Panel **Log penilaian** menampilkan tiga angka: **Lama penilaian** (mis. `12 dtk`), **Token AI**
  (mis. `4,4 rb`), dan **Langkah oleh AI** (mis. `1/9`). Di bawahnya ada urutan langkah. Setiap
  langkah diberi badge **AI**, **Sistem**, atau **Manajer**. Koreksi grade oleh manajer juga ikut
  muncul.
- Setelah klik **Semua aktivitas AI**, URL berubah ke
  `/aktivitas?job=penilaian-…#job-penilaian-…`. Halaman langsung bergulir ke kartu "Menilai proposal
  Kopi Teras Senja". Hanya kartu itu yang terbuka, dan kartu itu diberi bingkai biru tipis. Ini
  berlaku juga kalau kartunya biasanya berada di luar 12 kartu pertama.
- Token di kartu itu, mis. `Token 2,8 rb / 1,6 rb`, kalau dijumlahkan sama dengan **Token AI** di
  panel dan angka "… token" di kartu Ringkasan AI. Arahkan kursor ke angka token kartu untuk
  melihat angka persisnya, mis. "2.767 masuk / 1.608 keluar".

**Kalau berbeda:** kalau jumlahnya tidak sama, catat ketiga angka. Kalau halaman tidak bergulir ke
kartu, catat URL-nya. Kalau tombol **Lihat log penilaian** tidak ada, berarti proposal belum punya
pekerjaan penilaian.

### UC-AKT-08 · Menemukan pekerjaan AI yang gagal

**Situasi:** kartu **Panggilan model** berbunyi "1 gagal di 60 pekerjaan terbaru", dan Anda ingin
tahu pekerjaan mana yang gagal.

**Sebelum mulai:** berada di **Aktivitas AI**.

**Langkah:**

1. Di deretan agent, klik **Penilai**.
2. Cari kartu dengan status merah **Gagal**, mis. "Menilai proposal Saku Hukum".
3. Buka kartunya.

**Yang seharusnya terlihat:** status kartu **Gagal**. Di tabel langkah, langkah yang gagal berstatus
**Gagal** dengan pesan error merah di bawahnya. Jumlah kartu **Gagal** di semua agent sama dengan
angka di kartu **Panggilan model**.

**Kalau berbeda:** kalau angka di kartu tidak sama dengan jumlah kartu **Gagal**, catat keduanya.

---

## Riwayat

Halaman ini ada di sidebar kiri, grup **Ruang kerja**, menu **Riwayat**. Subjudulnya "Jejak audit:
siapa melakukan apa, dan kapan".

### UC-RWY-01 · Ringkasan 7 hari terakhir dan menyaring lewat kartu

**Situasi:** Anda ingin melihat seberapa sibuk minggu ini dan langsung membuka daftar keputusannya.

**Sebelum mulai:** sudah masuk sebagai admin.

**Langkah:**

1. Di sidebar kiri, grup **Ruang kerja**, klik **Riwayat**.
2. Lihat bagian **7 hari terakhir** dan empat kartunya.
3. Klik kartu **Keputusan dibuat**.
4. Klik kartu yang sama sekali lagi.

**Yang seharusnya terlihat:**

- Di kanan judul tertulis "Dibanding 7 hari sebelumnya · klik kartu untuk menyaring".
- Ada empat kartu: **Keputusan dibuat**, **Dinilai AI**, **Ringkasan terkirim**, **Koreksi
  grade**. Masing-masing berisi angka, selisih dengan minggu sebelumnya (`+13`, `−2`, atau
  `sama`), batang kecil per hari, dan catatan. Contoh catatan: "1 diundang · 1 dipantau · 1
  diarsip · 10 tanpa rincian", "Rata-rata skor 74,5", "9 keputusan dibalas lewat WhatsApp", "75%
  dari penilaian minggu ini".
- Setelah klik pertama, kartu diberi bingkai berwarna. Tab **Keputusan** aktif, dan periode berubah
  ke **7 hari terakhir**. Teks di bawah daftar berbunyi "Menampilkan N dari N kejadian", dan N sama
  dengan angka kartu.
- Setelah klik kedua, filter kembali ke tab **Semua** dan **Semua waktu**.

**Kalau berbeda:** kalau jumlah daftar tidak sama dengan angka kartu, catat keduanya. "tanpa rincian"
adalah keputusan untuk proposal yang sudah dihapus, karena jenis keputusannya ikut dihapus.

### UC-RWY-02 · Menyaring per jenis kejadian

**Situasi:** Anda hanya ingin melihat satu jenis kejadian, mis. perubahan aturan.

**Sebelum mulai:** berada di **Riwayat**.

**Langkah:**

1. Di deretan tab di bawah kartu, klik **Aturan**.
2. Klik tab lain satu per satu, lalu kembali ke **Semua**.

**Yang seharusnya terlihat:** tab yang tersedia: **Semua**, **Keputusan**, **Penilaian AI**,
**Dinilai ulang** (hanya bila ada proposal yang dinilai ulang dengan skala baru), **Proposal
masuk**, **Ringkasan WA**, **Koreksi**, **Aturan**, **STOP/LANJUT**, **Dihapus**. Setiap tab punya
angka jumlah. Angka tab **Semua** sama dengan jumlah angka tab lainnya. Di tab **Aturan**,
setiap baris berjudul "Aturan penilaian diperbarui ke versi N", dengan catatan "Berlaku untuk
proposal berikutnya. Skor lama tidak berubah." dan alasan dalam tanda kutip. Kejadian dikelompokkan
per hari dengan judul **Hari ini**, **Kemarin**, atau nama hari dan tanggal, plus "N kejadian".
Di tab **Proposal masuk**, catatan baris berbunyi seperti "Proposal <nama> masuk: skor 70,0,
Perlu penyesuaian": skor memakai koma desimal dan grade-nya kata tampilan. Baris lama yang tersimpan
dengan kategori skala lama (mis. `63.1, tidak_cocok`) tetap tampil tanpa error sebagai "skor 63,1,
Tidak cocok (skala lama)" dan tidak terbaca sebagai grade baru. Di tab **Dinilai ulang**, setiap
proposal yang dinilai ulang dengan skala baru punya baris via Sistem berjudul "<nama> dinilai ulang
dengan skala baru", dengan badge redup skala lama (mis. **Sangat cocok (skala lama)**) → badge grade
baru, lalu catatan seperti "<nama> dinilai ulang dengan skala baru: skor 70,0, Perlu penyesuaian".
Di tab **Koreksi**, baris berjudul "Grade <nama> dikoreksi" dengan badge grade lama → grade baru dan
alasannya; koreksi dari sebelum skala baru tampil dengan label "(skala lama)". Di tab **Penilaian AI**, sektor ditulis berhuruf besar
seperti di daftar proposal (mis. **F&B**, bukan `f&b`).

**Kalau berbeda:** kalau angka tab tidak cocok dengan jumlah baris, catat tabnya.

### UC-RWY-03 · Siapa yang mengarsipkan proposal minggu ini

**Situasi:** Anda ingin melihat siapa yang mengarsipkan proposal minggu ini, dan lewat kanal apa.

**Sebelum mulai:** berada di **Riwayat**.

**Langkah:**

1. Klik tab **Keputusan**.
2. Klik kotak pilihan periode (awalnya **Semua waktu**), lalu pilih **7 hari terakhir**.
3. Ketik `arsip` di kolom **Cari startup atau kejadian…**.

**Yang seharusnya terlihat:** yang tersisa adalah baris arsip, mis. "Tanggapan massal: diarsipkan"
dengan catatan "Arsipkan semua tidak layak: 1 proposal (<nama>)", atau "<nama proposal>
diarsipkan". Di bawah setiap baris ada pelaku **Manajer** (lingkaran "M") dan kanal **via WhatsApp**
atau **via Dashboard**. Muncul juga tombol **Reset filter**.

Catatan: Riwayat hanya mencatat peran **Manajer**, bukan email akun yang menekan tombol. Kalau Anda
perlu tahu siapa persisnya, halaman ini tidak bisa menjawabnya. Keputusan untuk proposal yang sudah
dihapus tampil sebagai "(dihapus) ditanggapi" tanpa jenis keputusannya, jadi tidak muncul di
pencarian `arsip`.

**Kalau berbeda:** kalau proposal yang Anda tahu diarsipkan minggu ini tidak muncul, cek dulu apakah
proposalnya sudah dihapus (tab **Dihapus**).

### UC-RWY-04 · Hanya kejadian lewat WhatsApp dalam 30 hari

**Situasi:** Anda ingin tahu apa saja yang dilakukan lewat WhatsApp sebulan terakhir.

**Sebelum mulai:** berada di **Riwayat**, tab **Semua**.

**Langkah:**

1. Klik kotak periode, lalu pilih **30 hari terakhir**. Pilihan lainnya **7 hari terakhir** dan
   **Semua waktu**.
2. Klik kotak kanal (awalnya **Semua kanal**), lalu pilih **Lewat WhatsApp**. Pilihan lainnya
   **Lewat Dashboard**.
3. Pada layar lebar, lihat panel kanan **Kanal keputusan**.

**Yang seharusnya terlihat:** semua baris bertanda **via WhatsApp**. Ringkasan terkirim dan penilaian
AI, yang dilakukan sistem, tidak ikut tampil. Angka di setiap tab ikut berubah. Panel **Kanal
keputusan** menunjukkan WhatsApp 100% kalau ada keputusan. Pada layar lebar, panel **Siapa yang
terlibat** menunjukkan jumlah per pelaku (**Manajer**, **AISA**, **Sistem**) dari baris yang tampil.
Klik **Reset filter** untuk kembali.

**Kalau berbeda:** catat baris yang tidak bertanda **via WhatsApp** padahal filternya **Lewat
WhatsApp**.

### UC-RWY-05 · Membaca isi ringkasan WhatsApp yang sudah terkirim

**Situasi:** Anda ingin membaca ulang ringkasan yang dikirim AISA ke WhatsApp kemarin.

**Sebelum mulai:** berada di **Riwayat**. Sudah ada ringkasan yang terkirim.

**Langkah:**

1. Klik tab **Ringkasan WA**.
2. Di baris "Ringkasan pagi terkirim" atau "Ringkasan sore terkirim", klik **Lihat isi**.
3. Klik **Tutup isi**.

**Yang seharusnya terlihat:** di bawah judul ada catatan "Ke WhatsApp · N proposal menunggu
keputusan" (ditambah "· template" kalau teks tidak dirapikan AI). Setelah **Lihat isi** diklik,
muncul jumlah per grade (**Sangat layak**, **Layak bersyarat**, **Perlu penyesuaian**, **Risiko
tinggi**, **Tidak layak**, jumlah **Di luar fokus**, dan **Perlu dicek manual** kalau ada), lalu
teks pesan persis seperti yang dikirim. Penanda tebal WhatsApp tetap terlihat sebagai `*…*`.
Pelakunya **AISA**. Ringkasan yang terkirim sebelum skala baru memakai label skala lama (mis. **Sangat
cocok (skala lama)**); isinya tetap tampil tanpa error.

**Kalau berbeda:** kalau baris ringkasan hanya berisi teks satu baris tanpa **Lihat isi**, catatan
isi ringkasan itu tidak ditemukan. Lihat juga temuan di laporan: ringkasan yang dikirim ulang untuk
jadwal yang sama hanya menyimpan isi yang terakhir.

### UC-RWY-06 · Memuat kejadian yang lebih lama

**Situasi:** Anda ingin melihat kejadian minggu lalu yang ada di bawah daftar.

**Sebelum mulai:** berada di **Riwayat**, tab **Semua**, **Semua waktu**.

**Langkah:**

1. Gulir ke bawah daftar.
2. Klik **Tampilkan 40 lagi**.

**Yang seharusnya terlihat:** teks "Menampilkan 40 dari N kejadian" berubah menjadi "Menampilkan 80
dari N kejadian" (atau N kalau sisanya kurang). Saat sisa kurang dari 40, tombol menyebut sisanya.
Saat semua sudah tampil, tombol hilang. Kalau riwayat lebih dari 500 kejadian, teks ditambah "·
hanya 500 kejadian terbaru yang dimuat".

**Kalau berbeda:** catat teks "Menampilkan …" sebelum dan sesudah klik.

### UC-RWY-07 · Mengekspor riwayat ke CSV

**Situasi:** Anda ingin menyimpan daftar keputusan untuk dibuka di Excel.

**Sebelum mulai:** berada di **Riwayat**.

**Langkah:**

1. Klik tab **Keputusan**.
2. Klik **Ekspor CSV** di kanan baris filter. Di ponsel, tombol ini hanya berupa ikon unduh.
3. Buka berkas yang terunduh.

**Yang seharusnya terlihat:** berkas bernama `riwayat-aisa.csv` dengan kolom **Waktu**, **Jenis**,
**Kejadian**, **Proposal**, **Pelaku**, **Kanal**, **Alasan**. Isinya semua baris yang cocok dengan
filter saat itu, bukan hanya 40 baris yang tampil. Jumlah barisnya sama dengan angka tab
**Keputusan**. Huruf seperti "“" tetap terbaca benar di Excel. Kalau tidak ada baris yang cocok,
tombol **Ekspor CSV** nonaktif.

**Kalau berbeda:** catat jumlah baris CSV dan angka tabnya.

### UC-RWY-08 · Melihat jejak proposal yang sudah dihapus

**Situasi:** sebuah proposal dihapus atas permintaan founder, dan Anda ingin memastikan jejaknya
tetap ada tanpa data founder.

**Sebelum mulai:** berada di **Riwayat**. Pernah ada proposal yang dihapus.

**Langkah:**

1. Klik tab **Dihapus**.
2. Klik tab **Semua**, lalu cari baris berjudul "(dihapus) mengirim proposal" atau "Grade
   (dihapus) dikoreksi".

**Yang seharusnya terlihat:** di tab **Dihapus**, setiap baris berjudul "Sebuah proposal dihapus"
dengan catatan "Proposal dihapus" dan alasan penghapusan dalam tanda kutip (mis. “uji QA”). Pelakunya
**Manajer** dan kanalnya tertulis. Baris lain dari proposal itu tetap ada, tetapi nama proposalnya
diganti "(dihapus)", catatannya "Rincian dihapus bersama proposal", dan tidak ada tombol panah untuk
membuka proposal. Nama startup asli tidak muncul di mana pun.

**Kalau berbeda:** nama startup yang masih muncul di baris proposal yang dihapus adalah temuan
privasi. Catat barisnya.

### UC-RWY-09 · Pencarian tanpa hasil

**Situasi:** Anda salah ketik nama startup.

**Sebelum mulai:** berada di **Riwayat**.

**Langkah:**

1. Ketik `zzzz` di kolom **Cari startup atau kejadian…**.
2. Klik **Reset filter** di tengah kotak kosong.

**Yang seharusnya terlihat:** kotak kosong dengan judul **Tidak ada kejadian yang cocok** dan teks
"Coba kata kunci lain, perpanjang periode, atau pilih jenis “Semua”.". Setelah **Reset filter**
diklik, kolom pencarian kosong lagi dan semua kejadian muncul. Ada cara lain: klik ikon silang kecil
di ujung kolom pencarian (**Hapus pencarian**).

**Kalau berbeda:** catat kalau daftar tetap kosong setelah reset.

---

## Aturan penilaian

Halaman ini ada di sidebar kiri, grup **Lainnya**, menu **Aturan penilaian**. Subjudulnya "Cara AISA
menilai proposal dan aturan yang bisa Anda ubah".

### UC-ATR-01 · Memahami tiga langkah cara AISA menilai

**Situasi:** Anda ingin menjelaskan ke rekan bagian mana yang dikerjakan AI dan bagian mana yang
dihitung sistem.

**Sebelum mulai:** sudah masuk.

**Langkah:**

1. Di sidebar kiri, grup **Lainnya**, klik **Aturan penilaian**.
2. Baca kartu paling atas, lalu bagian **Cara AISA menilai proposal**.

**Yang seharusnya terlihat:**

- Kartu atas: "Aturan versi N" dengan badge **Sedang dipakai**, lalu "Disimpan di Firestore ·
  diperbarui <tanggal>, <jam> · <alasan>". Ada tombol **Riwayat perubahan** dan **Ubah aturan**.
  Di bawahnya ada catatan "Perubahan hanya berlaku untuk proposal yang masuk setelah disimpan. Skor
  dan grade proposal lama tidak dihitung ulang.".
- Tiga kartu: **Langkah 1** (badge **AI**) "AI membaca pitch deck", hasil "5 nilai, skala 1–5".
  **Langkah 2** (badge **Sistem**) "Sistem menghitung skor", hasil "Skor 0–100", dengan contoh
  nilai satu kriteria × bobotnya (mis. nilai Tim manajemen 4 × bobot 25% = 18,8 poin). **Langkah 3**
  (badge **Sistem**) "Sistem menentukan grade", hasil "1 dari 5 grade, plus tanda fokus": grade dari
  skor saja, dan proposal di luar fokus tetap mendapat grade-nya dengan tanda “Di luar fokus”.
- Kotak hijau yang menegaskan AI tidak menentukan grade dan tidak mengambil keputusan.
- Klik **Riwayat perubahan** membuka halaman **Riwayat**.

**Kalau berbeda:** angka contoh di Langkah 2 harus sama dengan 3/4 bobot kriteria
itu saat ini. Catat kalau
tidak.

### UC-ATR-02 · Kriteria mana yang paling berpengaruh

**Situasi:** Anda ingin tahu bobot setiap kriteria.

**Sebelum mulai:** berada di **Aturan penilaian**.

**Langkah:**

1. Lihat kartu **Bobot kriteria**.

**Yang seharusnya terlihat:** lima baris berurutan A–E: **Tim manajemen**, **Kinerja bisnis saat
ini**, **Risiko bisnis & tren makro**, **Rencana bisnis & potensi imbal hasil**, **Potensi dampak**.
Setiap baris punya persen dan "maks. N poin" (bawaan: 25%, 20%, 20%, 25%, 10%). Total kelima persen
100%. Di bawahnya ada kalimat yang menyebut kriteria paling berpengaruh dan berapa poin yang
disumbang nilai sempurna di kriteria itu. Di bawah halaman ada kartu **Bobot dari panduan** yang menjelaskan asal angka
bobot itu.

**Kalau berbeda:** catat kalau total persen tidak 100%.

### UC-ATR-03 · Kenapa satu proposal dapat skor sekian

**Situasi:** Anda ingin tahu kenapa Kopi Teras Senja dapat skor 100.

**Sebelum mulai:** berada di **Aturan penilaian**.

**Langkah:**

1. Di kartu **Contoh perhitungan**, klik kotak pilihan proposal, lalu pilih **Kopi Teras Senja**.
2. Baca tabelnya, lalu klik **Buka proposal**.

**Yang seharusnya terlihat:** tabel dengan kolom **Kriteria**, **Nilai AI** (mis. `5/5`), **Bobot**
(mis. `× 25%`), dan **Poin**. Baris akhirnya **Skor (1 desimal)**, mis. `100,0`. Kalau proposal dinilai
dengan aturan versi lama, ada catatan "Proposal ini dinilai dengan aturan versi 1 (skor tersimpan
100,0). Angka di atas memakai aturan versi 3.". Di bawahnya ada **Cek fokus** dengan tiga lencana
**Sektor**, **Tahap**, **Dana** (hijau kalau lolos, merah kalau gagal), dan **Hasil** dengan badge
grade. **Buka proposal** membuka detail proposal itu.

Proposal yang gagal cek fokus (mis. sektor f&b) tetap mendapat grade dari skornya; kegagalan itu
hanya membuatnya berlabel **Di luar fokus**. Kotak ini selalu menghitung dari nilai AI dan aturan
saat ini, tanpa memperhitungkan koreksi manajer.

**Kalau berbeda:** jumlah kolom **Poin** harus sama dengan skor. Catat kalau selisihnya lebih dari
0,1.

### UC-ATR-04 · Berapa proposal di tiap grade

**Situasi:** Anda ingin tahu batas skor tiap grade dan sebaran proposal saat ini.

**Sebelum mulai:** berada di **Aturan penilaian**.

**Langkah:**

1. Lihat kartu **Batas grade**.
2. Klik **Lihat** di kotak **Layak bersyarat**.

**Yang seharusnya terlihat:** skala sebaran skor proposal yang sudah dinilai dengan batas `50`,
`65`, `75`, `85` (bawaan). Ada lima kotak: **Sangat layak** 85–100, **Layak bersyarat** 75–84,
**Perlu penyesuaian** 65–74, **Risiko tinggi** 50–64, **Tidak layak** < 50, masing-masing dengan
aksinya (Lanjutkan investasi, Investasi dengan syarat, Sesuaikan dulu sebelum lanjut,
Pertimbangkan menolak, Tolak) dan "N proposal · N%". Batas yang tampil mengikuti aturan aktif,
bukan angka tetap. **Lihat** membuka **Proposal** dengan URL `/proposal?kategori=layak_bersyarat`,
dan jumlah barisnya sama dengan angka kotak.

**Kalau berbeda:** catat kalau jumlah di kotak tidak sama dengan jumlah baris di daftar Proposal yang
terbuka.

### UC-ATR-05 · Sektor, tahap, dan dana yang menjadi fokus

**Situasi:** Anda ingin memastikan fokus investasi yang dipakai AISA sudah benar.

**Sebelum mulai:** berada di **Aturan penilaian**.

**Langkah:**

1. Lihat kartu **Fokus investasi**.

**Yang seharusnya terlihat:** tiga kotak: **Cek 1 Sektor** ("5 sektor fokus"), **Cek 2 Tahap
pendanaan** ("3 tahap fokus"), **Cek 3 Dana** ("Batas bawah dan atas ikut"). Sektor fokus tampil
sebagai lencana biru dengan centang (saat ini agritech, fintech, edtech, healthtech, climate). Sektor
yang pernah masuk tetapi bukan fokus tampil dicoret (mis. fashion, f&b). Dana tertulis "Rp1 miliar –
Rp20 miliar". Setiap kotak punya "Proposal saat ini yang lolos N/M". Di bawah ada kalimat "N dari M
proposal saat ini lolos ketiga cek fokus.".

**Kalau berbeda:** catat sektor yang tampil aktif padahal bukan fokus Anda.

### UC-ATR-06 · Seberapa sering Anda tidak setuju dengan AI

**Situasi:** Anda ingin tahu apakah grade dari AI sering Anda koreksi, sebagai bahan untuk
menyesuaikan aturan.

**Sebelum mulai:** berada di **Aturan penilaian**.

**Langkah:**

1. Gulir ke kartu **Kalibrasi**.

**Yang seharusnya terlihat:** bagian **Koreksi manajer** dengan tiga angka: **Ditinjau manajer**,
**Dikoreksi**, dan **Arah koreksi** ("Naik grade N · Turun grade N"). Di bawahnya ada kalimat
"AI sepakat dengan manajer pada N dari M proposal yang ditinjau (…%)." dan tabel koreksi dengan kolom
**Proposal**, **Grade AI**, **Koreksi manajer**, **Alasan**, **Tanggal**, **Skor kualitas**
(mis. <nama>, Perlu penyesuaian → Layak bersyarat (naik)). Koreksi yang dibuat dengan skala lama
dihapus oleh migrasi grade, jadi tabel ini hanya memuat koreksi sesudahnya. Bagian **Kalibrasi analis** berlabel
**belum ada data**. Kalau belum ada yang ditinjau, muncul teks "Belum ada proposal yang ditinjau
manajer. …".

**Kalau berbeda:** jumlah baris tabel harus sama dengan angka **Dikoreksi**.

### UC-ATR-07 · Melihat dampak perubahan aturan tanpa menyimpan

**Situasi:** Anda ingin tahu berapa proposal yang akan pindah grade kalau batas Sangat layak
dinaikkan, tanpa benar-benar mengubah aturan.

**Sebelum mulai:** masuk sebagai admin. Langkah ini tidak menyimpan apa pun, asal Anda mengakhirinya
dengan **Batal**.

**Langkah:**

1. Di **Aturan penilaian**, klik **Ubah aturan**.
2. Di dialog **Ubah aturan penilaian**, lihat panel kanan **Dampak perubahan**. Di layar sempit,
   panel ini berupa satu baris di atas kolom alasan.
3. Klik tab **Batas grade**. Di kotak **Sangat layak**, ganti **Skor minimal** dari `85` menjadi `90`.
4. Klik tab **Bobot kriteria**. Ganti bobot **Tim manajemen** menjadi `40` dan perhatikan baris
   **Total**.
5. Klik **Batal**.
6. Klik **Ubah aturan** lagi.

**Yang seharusnya terlihat:**

- Dialog berjudul **Ubah aturan penilaian** dengan keterangan "Disimpan sebagai versi N+1. Berlaku
  untuk proposal yang masuk setelah ini.". Ada tab **Bobot kriteria**, **Batas grade**, **Fokus
  investasi**, **Patokan nilai**, **Model**.
- Sebelum ada perubahan, panel berbunyi "Belum ada perubahan. Geser bobot atau ubah batas, hasilnya
  langsung terlihat di sini." dan tombol **Simpan versi N+1** nonaktif.
- Di bawah judul panel tertulis bahwa ini simulasi pada proposal yang sudah dinilai, hanya
  pratinjau, dan skor lama tidak diubah.
- Setelah batas Sangat layak `90`, panel menunjukkan berapa proposal yang akan pindah grade AI,
  berapa naik dan turun. Tabel per grade dengan kolom **AI sekarang** dan **Aturan baru**
  menunjukkan proposal skor 85–89,9 berpindah dari **Sangat layak** ke **Layak bersyarat**, dan
  bagian contoh menyebut proposalnya. Bila tidak ada proposal dengan skor 85–89,9, tidak ada yang
  pindah.
- Kalau proposal yang pindah pernah dikoreksi manajer, contohnya diberi catatan bahwa ia tetap pada
  grade koreksi manajer.
- Setelah Tim manajemen `40`, baris **Total** menjadi `115%` dengan keterangan lebih 15%, pesan
  "Total bobot lima kriteria harus tepat 100%." muncul, dan panel berbunyi "Ada isian yang belum
  benar, misalnya total bobot belum 100%. Perbaiki dulu untuk melihat dampaknya." dan teks di bawah
  judul panel menjadi "Simulasi menunggu semua isian benar.".
- Setelah **Batal** lalu **Ubah aturan** lagi, semua isian kembali ke nilai tersimpan (Tim
  manajemen `25`, Sangat layak `85`). Kartu atas halaman tetap "Aturan versi N" yang sama.

Catatan: kedua kolom menghitung ulang grade dari nilai AI, dengan aturan saat ini dan aturan baru.
Koreksi manajer tidak ikut, jadi angka **AI sekarang** bisa berbeda dari kartu **Batas grade** di
halaman bila ada proposal yang dikoreksi manajer. Itu bukan temuan.

**Kalau berbeda:** kalau versi aturan berubah atau ada toast "Aturan penilaian tersimpan sebagai
versi baru." padahal Anda menekan **Batal**, itu temuan serius. Laporkan segera.

### UC-ATR-08 · Isian aturan yang salah ditolak

**Situasi:** Anda ingin memastikan AISA menolak aturan yang tidak masuk akal dan aturan tanpa alasan.

**Sebelum mulai:** masuk sebagai admin. Tidak ada yang tersimpan, asal diakhiri dengan **Batal**.

**Langkah:**

1. Klik **Ubah aturan**. Di tab **Batas grade**, ganti **Skor minimal** **Layak bersyarat** menjadi
   `90` (lebih tinggi dari Sangat layak `85`).
2. Kembalikan ke `75`. Di tab **Bobot kriteria**, ubah Tim manajemen menjadi `27.5` dan Rencana
   bisnis & potensi imbal hasil menjadi `22.5` (desimal pakai titik) supaya **Total** tetap `100%` · "sudah pas".
3. Biarkan **Alasan perubahan (wajib)** kosong, lalu klik **Simpan versi N+1**.
4. Klik **Batal**.

**Yang seharusnya terlihat:** pada langkah 1 muncul pesan "Batas Sangat layak harus lebih tinggi
dari batas Layak bersyarat (90).". Pada langkah 3 muncul kotak merah "Alasan perubahan wajib diisi.", dialog
tetap terbuka, dan tidak ada toast. Setelah **Batal**, versi aturan di kartu atas tidak berubah.
Pesan lain yang bisa Anda coba, yang muncul setelah klik **Simpan versi N+1**: "Pilih minimal satu
sektor." (hapus semua sektor di tab **Fokus investasi**) dan "Dana minimum melebihi maksimum.". Saat
ada isian salah, dialog pindah ke tab yang bermasalah, dan tab itu diberi titik merah.

**Kalau berbeda:** kalau aturan tersimpan tanpa alasan, laporkan segera.

### UC-ATR-09 · ⚠️ Menyimpan aturan versi baru lalu mengembalikannya

**Situasi:** Anda ingin membuktikan bahwa menyimpan aturan benar-benar membuat versi baru dan
tercatat di Riwayat.

**Sebelum mulai:** ⚠️ langkah ini mengubah aturan produksi, dan aturan baru dipakai untuk setiap
proposal yang masuk setelahnya. Lakukan hanya bila disepakati tim, saat tidak ada proposal sungguhan
yang sedang masuk. Catat dulu nilai semula: bobot kelima kriteria dan nomor versi di kartu atas.

**Langkah:**

1. Klik **Ubah aturan**. Di tab **Bobot kriteria**, ubah Tim manajemen `25` → `27.5` dan Rencana
   bisnis & potensi imbal hasil `25` → `22.5` (desimal pakai titik). Pastikan **Total** `100%` · "sudah pas".
2. Isi **Alasan perubahan (wajib)**: `UJI panduan: ubah bobot sementara`. Klik **Simpan versi N+1**.
3. Klik **Ubah aturan** lagi. Kembalikan Tim manajemen `25` dan Rencana bisnis & potensi imbal
   hasil `25`. Isi alasan
   `UJI panduan: kembalikan bobot`, lalu klik **Simpan versi N+2**.
4. Buka **Riwayat**, tab **Aturan**.

**Yang seharusnya terlihat:** setelah setiap simpan, dialog tertutup, muncul toast "Aturan penilaian
tersimpan sebagai versi baru.", dan kartu atas menjadi "Aturan versi N+1", lalu "N+2", dengan alasan
yang Anda tulis. Di **Riwayat**, tab **Aturan**, ada dua baris baru "Aturan penilaian diperbarui ke
versi …" dengan alasan dalam kutip, pelaku **Manajer**, dan kanal **via Dashboard**. Bobot di kartu
**Bobot kriteria** kembali seperti semula. Skor proposal lama tidak berubah.

**Kalau berbeda:** kalau langkah 3 gagal, segera kembalikan bobot lewat dialog yang sama dan beri
tahu tim nomor versinya.

### UC-ATR-10 · Akun baca-saja tidak bisa mengubah aturan

**Situasi:** Anda ingin memastikan rekan dengan akses lihat saja tidak bisa mengubah aturan.

**Sebelum mulai:** masuk dengan akun berperan **Pengguna**, kalau tim menyediakannya.

**Langkah:**

1. Di sidebar kiri, grup **Lainnya**, klik **Aturan penilaian**.

**Yang seharusnya terlihat:** semua kartu dan angka tetap tampil, tetapi tidak ada tombol **Ubah
aturan** dan tidak ada tombol **Ubah** di kartu mana pun. Tombol **Riwayat perubahan** tetap ada.

**Kalau berbeda:** tombol **Ubah** yang tampil untuk akun **Pengguna** adalah temuan.

---

## Pengaturan

Halaman ini ada di sidebar kiri, grup **Lainnya**, menu **Pengaturan**. Di atasnya ada deretan tab:
grup Akun (**Profil**, **Tampilan**) dan grup Ruang kerja (**Ringkasan WhatsApp**, **Integrasi**,
**Privasi & data**). Tab yang dipilih tercatat di URL `?tab=…`.

### UC-SET-01 · Melihat akun dan hak akses Anda

**Situasi:** Anda ingin tahu akun apa yang sedang dipakai dan apa saja yang boleh dilakukannya.

**Sebelum mulai:** sudah masuk.

**Langkah:**

1. Di sidebar kiri, grup **Lainnya**, klik **Pengaturan**. Tab **Profil** terbuka.
2. Di panel **WhatsApp**, klik **Lihat jadwal ringkasan**.

**Yang seharusnya terlihat:** email `manager@aisa.local` dengan peran **Administrator**, catatan
"Akun dan peran diatur pemilik akun", dan "Email sudah terverifikasi.". Di baris **Peran** ada tiga
hak akses dengan centang hijau: **Melihat semua halaman**, **Menanggapi proposal**, **Mengatur
AISA**. Untuk akun **Pengguna**, dua hak terakhir bertanda silang. Baris **Nomor WhatsApp** berbunyi
"Diatur di server aisa-api (MANAGER_PHONES), bukan dari dashboard.". **Lihat jadwal ringkasan**
membuka tab **Ringkasan WhatsApp** (URL `?tab=ringkasan`).

**Kalau berbeda:** catat kalau peran tidak sesuai dengan akun yang Anda pakai.

### UC-SET-02 · Mengganti tema tampilan

**Situasi:** layar terlalu terang di ruangan redup.

**Sebelum mulai:** berada di **Pengaturan**.

**Langkah:**

1. Klik tab **Tampilan**.
2. Klik **Gelap**, lalu **Terang**, lalu **Ikuti sistem**.

**Yang seharusnya terlihat:** tiga pilihan bergambar: **Terang** ("Cocok untuk siang hari"),
**Gelap** ("Nyaman di ruangan redup"), **Ikuti sistem** ("Sesuai pengaturan perangkat"). Pilihan
yang aktif berbingkai biru. Tema langsung berubah tanpa tombol simpan. Ikon bulan/matahari di kanan
atas header melakukan hal yang sama. Pilihan disimpan di peramban ini saja.

**Kalau berbeda:** catat kalau tema kembali sendiri setelah halaman dimuat ulang.

### UC-SET-03 · Melihat seperti apa ringkasan WhatsApp berikutnya

**Situasi:** Anda ingin tahu kapan ringkasan berikutnya dikirim dan seperti apa isinya.

**Sebelum mulai:** berada di **Pengaturan**.

**Langkah:**

1. Klik tab **Ringkasan WhatsApp**.
2. Di panel **Pratinjau pesan**, klik **Pagi**, lalu **Sore**.

**Yang seharusnya terlihat:**

- Panel **Jadwal kirim** berisi **Ringkasan pagi** `09.00 WIB` dan **Ringkasan sore** `17.00 WIB`,
  plus catatan "Berikutnya hari ini pukul … WIB" atau "Berikutnya besok pukul 09.00 WIB" setelah
  pukul 17.00. Jadwalnya tetap, tidak bisa diubah dari sini.
- Panel **Isi pesan** menjelaskan isi per baris: **Sangat layak**, **Layak bersyarat, Perlu
  penyesuaian**, **Risiko tinggi, Tidak layak** ("Jumlahnya saja."), **Di luar fokus** (tetap di
  grade-nya, diberi tanda “(di luar fokus)”), dan **Perlu dicek manual**.
- **Pratinjau pesan** berbentuk gelembung chat dari **AISA** "lewat GOWA". Sapaannya berganti antara
  "Selamat pagi, Pak." dan "Selamat sore, Pak." sesuai tombol. Isinya "Ada N proposal yang belum Pak
  tanggapi.", lalu daftar per grade dari proposal yang belum ditanggapi (mis. "Sangat layak (2)",
  1. <nama> …), dengan proposal di luar fokus ditandai "(di luar fokus)".
- Di bawahnya: "Isi mengikuti N proposal yang belum ditanggapi saat ini. …" dan "Ringkasan … terakhir
  terkirim …".
- Cek kewajaran: N sama dengan angka "N proposal menunggu keputusan" di sidebar.

**Kalau berbeda:** catat kalau proposal yang sudah Anda tanggapi masih muncul di pratinjau.

### UC-SET-04 · Memastikan layanan AISA terhubung

**Situasi:** ringkasan terasa telat, dan Anda ingin memastikan layanan di belakang AISA hidup.

**Sebelum mulai:** berada di **Pengaturan**.

**Langkah:**

1. Klik tab **Integrasi**.
2. Lihat bagian **Layanan terhubung**.
3. Di kartu **aisa-api**, klik **Detail**, lalu klik **Cek koneksi**.
4. Klik **Tutup**. Coba juga **Detail** di kartu **GOWA (WhatsApp)**.

**Yang seharusnya terlihat:**

- Panel **Cara proposal mengalir** menampilkan lima tahap: Google Form → Google Drive → aisa-api →
  Firestore → GOWA.
- Teks "2 dari 2 layanan yang bisa dicek dari dashboard terhubung". Kartu **aisa-api** dan
  **Firestore** berlabel hijau **Terhubung**. **GOWA (WhatsApp)** dan **Formulir founder** tidak
  punya label status karena dashboard tidak bisa mengeceknya. Kartu itu hanya menampilkan fakta
  terakhir (mis. "Ringkasan terakhir terkirim …", "Proposal terakhir masuk …").
- Dialog **aisa-api** berisi **Dicek lewat** "GET /health dari server dashboard", **Dicek pukul**,
  dan kotak hijau "Koneksi baik · merespons dalam N ms (jam)". Saat **Cek koneksi** diklik, tombol
  berputar sebentar, lalu angka ms dan jam diperbarui.
- Tautan di kartu: **Aktivitas AI**, **Buka aturan**, **Riwayat ringkasan**, **Lihat proposal**.

**Kalau berbeda:** label merah **Terputus** atau kotak merah berisi pesan error berarti dashboard
tidak bisa menghubungi aisa-api. Catat pesan dan jamnya, lalu hubungi tim.

### UC-SET-05 · ⚠️ Menjeda AI sementara lalu menjalankannya lagi

**Situasi:** Anda ingin menjeda AI sementara, mis. saat aturan sedang dibahas.

**Sebelum mulai:** ⚠️ langkah ini menghentikan pekerjaan AI di produksi. Proposal yang masuk selama
jeda menunggu sebagai **Antre**, dan Asisten hanya membalas "AISA sedang dijeda (STOP). …".
Lakukan saat tidak ada proposal sungguhan yang ditunggu, dan langsung lanjutkan setelah selesai.
Masuk sebagai admin.

**Langkah:**

1. Klik tab **Integrasi**. Di panel **Status AI**, pastikan labelnya **Berjalan**.
2. Klik tombol merah **STOP**. Di dialog yang muncul, klik **Batal** dulu.
3. Klik **STOP** lagi, lalu klik **Ya, jeda AI**.
4. Di sidebar, klik **Dashboard**, lalu baca pita di atas.
5. Kembali ke **Pengaturan** → **Integrasi**, lalu klik **LANJUT**.
6. Buka **Riwayat**, tab **STOP/LANJUT**.

**Yang seharusnya terlihat:**

- **STOP** membuka dialog **Jeda semua pekerjaan AI?** dengan teks "Selama dijeda, proposal baru
  menunggu sebagai Antre, Asisten menjawab “AISA sedang dijeda”, dan pekerjaan yang sedang berjalan
  dihentikan di antara langkah. Tekan LANJUT untuk menjalankannya lagi." serta tombol **Batal** dan
  **Ya, jeda AI**. Setelah **Batal**, dialog tertutup dan label tetap **Berjalan**.
- Setelah **Ya, jeda AI**, dialog tertutup dan muncul toast "AI dijeda (STOP).". Label berubah
  menjadi merah **Dijeda (STOP)** dengan teks "Pekerjaan AI berhenti sejak <tanggal>, <jam> (lewat
  Dashboard). Proposal baru menunggu sebagai Antre sampai LANJUT.". Tombol berubah menjadi
  **LANJUT**.
- Dashboard menampilkan pita "AI sedang dijeda (STOP). Proposal baru menunggu sebagai Antre sampai
  LANJUT di Pengaturan." dengan tautan ke **Pengaturan**.
- **LANJUT** langsung bekerja tanpa dialog. Muncul toast "AI dilanjutkan (LANJUT)." dan label
  kembali **Berjalan**.
- Di **Riwayat**, ada baris "Pekerjaan AI dijeda (STOP)" dan "Pekerjaan AI dilanjutkan (LANJUT)"
  dengan pelaku **Manajer** dan kanal **via Dashboard**.

Catatan: STOP dan LANJUT dari dashboard tidak memunculkan kartu baru di **Aktivitas AI**. Kartu
"Perintah: STOP" dan "Perintah: LANJUT" milik **Orchestrator** hanya muncul untuk perintah dari
WhatsApp.

**Kalau berbeda:** kalau label tetap **Dijeda (STOP)** setelah **LANJUT**, muat ulang halaman. Kalau
masih dijeda, segera beri tahu tim, karena proposal baru tidak akan dinilai.

### UC-SET-06 · Mencoba ganti masa simpan arsip tanpa menyimpan

**Situasi:** Anda ingin melihat efek retensi 180 hari, lalu berubah pikiran.

**Sebelum mulai:** masuk sebagai admin. Tidak ada yang tersimpan.

**Langkah:**

1. Klik tab **Privasi & data**.
2. Di panel **Berapa lama arsip disimpan**, klik kotak **Hapus arsip setelah** (awalnya `90 hari`),
   lalu pilih **180 hari**.
3. Perhatikan bilah yang muncul di bawah layar.
4. Klik tab **Profil**.
5. Di dialog, klik **Batal**.
6. Di bilah bawah, klik **Batal**.

**Yang seharusnya terlihat:**

- Kotak fakta di atas: jumlah "proposal tersimpan saat ini", "90 hari arsip lalu dihapus", "Wajib
  persetujuan founder di formulir".
- Pilihan retensi: **30 hari** · Paling hemat data, **90 hari** · Bawaan, **180 hari** · Untuk
  ditinjau ulang nanti.
- Setelah memilih 180 hari, teks penjelasan berubah menjadi "Proposal yang diarsipkan dihapus
  otomatis setelah 180 hari (setiap hari 02.00 WIB). Contoh: proposal yang diarsipkan hari ini
  dihapus sekitar <tanggal 180 hari lagi>.". Muncul kolom **Alasan perubahan** ("Wajib. Tercatat di
  Riwayat."). Bilah bawah berbunyi "Ada perubahan yang belum disimpan" dengan tombol **Batal** dan
  **Simpan**.
- Klik tab **Profil** memunculkan dialog **Buang perubahan?** dengan teks "Perubahan di bagian ini
  belum disimpan. Kalau pindah sekarang, perubahan itu akan hilang." dan tombol **Batal** serta
  **Buang dan pindah**. Setelah **Batal** di dialog, Anda tetap di **Privasi & data** dan pilihan
  180 hari masih ada.
- Setelah **Batal** di bilah bawah, pilihan kembali ke `90 hari` dan bilah hilang.
- Bila Anda menutup tab peramban saat bilah masih tampil, peramban menanyakan konfirmasi keluar.

**Kalau berbeda:** pindah tab tanpa dialog saat bilah tampil adalah temuan, karena perubahan bisa
hilang diam-diam.

### UC-SET-07 · Alasan wajib saat mengganti masa simpan arsip

**Situasi:** Anda ingin memastikan perubahan retensi tidak bisa disimpan tanpa alasan.

**Sebelum mulai:** masuk sebagai admin, di tab **Privasi & data**.

**Langkah:**

1. Pilih **180 hari** di **Hapus arsip setelah**.
2. Biarkan **Alasan perubahan** kosong, lalu klik **Simpan** di bilah bawah.
3. Klik **Batal** di bilah bawah.

**Yang seharusnya terlihat:** kotak merah "Alasan perubahan wajib diisi." muncul di bawah kolom
alasan dan tidak ada toast. Setelah **Batal**, nilai kembali ke `90 hari`, dan Riwayat tidak punya
baris aturan baru.

**Kalau berbeda:** kalau muncul toast "Retensi … tersimpan …" tanpa alasan, laporkan segera dan
kembalikan nilainya (lihat UC-SET-08).

### UC-SET-08 · ⚠️ Menyimpan masa simpan arsip lalu mengembalikannya

**Situasi:** Anda ingin membuktikan perubahan retensi tersimpan sebagai versi aturan baru.

**Sebelum mulai:** ⚠️ langkah ini mengubah aturan produksi. Retensi berjalan setiap hari pukul 02.00
WIB, jadi selesaikan pengembalian jauh sebelum jam itu. Jangan pilih **30 hari**, karena arsip yang
lebih tua dari 30 hari bisa terhapus permanen pada pukul 02.00 berikutnya. Catat nilai semula
(saat ini `90 hari`).

**Langkah:**

1. Pilih **180 hari**, isi **Alasan perubahan** `UJI panduan: retensi sementara`, lalu klik
   **Simpan**.
2. Pilih **90 hari** lagi, isi alasan `UJI panduan: kembalikan retensi`, lalu klik **Simpan**.
3. Buka **Aturan penilaian** dan **Riwayat**, tab **Aturan**.

**Yang seharusnya terlihat:** setiap simpan memunculkan toast "Retensi 180 hari tersimpan sebagai
aturan versi N." lalu "Retensi 90 hari tersimpan sebagai aturan versi N+1.", dan bilah bawah
hilang. Kotak fakta di atas mengikuti nilai baru. Kartu atas **Aturan penilaian** naik dua versi.
**Riwayat** mencatat dua baris "Aturan penilaian diperbarui ke versi …" dengan alasan Anda. Bobot
dan batas grade tidak berubah.

**Kalau berbeda:** kalau pengembalian gagal, ulangi langkah 2 sampai berhasil, lalu beri tahu tim.

### UC-SET-09 · Akun baca-saja di Pengaturan

**Situasi:** Anda ingin memastikan akun lihat saja tidak bisa menjeda AI atau mengubah retensi.

**Sebelum mulai:** masuk dengan akun berperan **Pengguna**, kalau tim menyediakannya.

**Langkah:**

1. Buka **Pengaturan** → **Integrasi**.
2. Buka **Pengaturan** → **Privasi & data**.

**Yang seharusnya terlihat:** di **Integrasi**, panel **Status AI** hanya menampilkan label dan
teks, tanpa tombol **STOP** atau **LANJUT**. **Detail** dan **Cek koneksi** tetap bisa dipakai. Di
**Privasi & data**, **Hapus arsip setelah** hanya berupa teks (mis. `90 hari`) tanpa kotak pilihan,
sehingga bilah simpan tidak pernah muncul. Di **Profil**, hak **Menanggapi proposal** dan
**Mengatur AISA** bertanda silang.

**Kalau berbeda:** tombol **STOP**/**LANJUT** atau kotak retensi yang tampil untuk akun **Pengguna**
adalah temuan.
