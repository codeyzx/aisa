# Panduan uji: Tanya AISA, WhatsApp, dan Google Form

## Cakupan

Panduan ini untuk Anda yang menguji sendiri tiga pintu AISA: **Tanya AISA** di dashboard (tombol
bulat kanan bawah, kartu di detail proposal, dan ⌘K), **bot WhatsApp AISA** (pertanyaan,
perintah, STOP/LANJUT, ringkasan harian 09.00 dan mingguan Jumat 17.00), dan **Google Form founder** (proposal
masuk lalu dinilai, termasuk proposal hasil scan). Dashboard produksi:
<https://aisa-dashboard-lk5jbo3eza-et.a.run.app>, masuk sebagai `manager@aisa.local` dengan
sandi admin dari tim. Bot WhatsApp AISA bernomor **+62 877-8116-8546** (`6287781168546`); bot
hanya membalas nomor manajer yang terdaftar di AISA. Pesan dari nomor lain tidak dibalas sama
sekali. Nama proposal di contoh (mis. Kopi Teras Senja, Kelas Kode Rakyat, Lumbung Ikan Pesisir)
adalah data produksi saat panduan ditulis; data bisa berubah, jadi ganti dengan nama yang ada di
layar Anda.

Use case bertanda ⚠️ **mengubah data**. Untuk itu, pakai proposal uji: di **Dashboard** atau
**Proposal**, klik **Unggah proposal**, pilih PDF sintetis, dan isi **Nama startup (opsional)**
dengan nama berawalan `UJI` (mis. `UJI Satu`, `UJI Dua`). Setelah selesai, hapus proposal uji:
buka detailnya, klik **Hapus data**, isi **Alasan (wajib)** (mis. `proposal uji`), lalu
**Hapus permanen**. Tanggapan (setuju/tolak) tidak bisa dibatalkan menjadi "Belum
ditanggapi" lagi, jadi jangan jalankan perintah ⚠️ ke proposal sungguhan.

## Daftar use case

**Tanya AISA di dashboard**

- [UC-AST-01 · Membuka Tanya AISA dan melihat contoh pertanyaan](#uc-ast-01--membuka-tanya-aisa-dan-melihat-contoh-pertanyaan)
- [UC-AST-02 · Bertanya lewat contoh pertanyaan](#uc-ast-02--bertanya-lewat-contoh-pertanyaan)
- [UC-AST-03 · Mengetik pertanyaan sendiri](#uc-ast-03--mengetik-pertanyaan-sendiri)
- [UC-AST-04 · Meminta saran: bagian "💡 Saran AI"](#uc-ast-04--meminta-saran-bagian--saran-ai)
- [UC-AST-05 · Pertanyaan lanjutan dalam satu percakapan](#uc-ast-05--pertanyaan-lanjutan-dalam-satu-percakapan)
- [UC-AST-06 · Layar penuh dan panel samping](#uc-ast-06--layar-penuh-dan-panel-samping)
- [UC-AST-07 · Menutup dengan Esc](#uc-ast-07--menutup-dengan-esc)
- [UC-AST-08 · Percakapan baru](#uc-ast-08--percakapan-baru)
- [UC-AST-09 · Berhenti menunggu jawaban](#uc-ast-09--berhenti-menunggu-jawaban)
- [UC-AST-10 · Percakapan tetap ada saat pindah halaman](#uc-ast-10--percakapan-tetap-ada-saat-pindah-halaman)
- [UC-AST-11 · Menyalin jawaban](#uc-ast-11--menyalin-jawaban)
- [UC-AST-12 · Jawaban gagal dan Coba lagi](#uc-ast-12--jawaban-gagal-dan-coba-lagi)
- [UC-AST-13 · Bertanya saat AISA dijeda ⚠️](#uc-ast-13--bertanya-saat-aisa-dijeda-️)
- [UC-AST-14 · Kartu Tanya AISA di detail proposal](#uc-ast-14--kartu-tanya-aisa-di-detail-proposal)
- [UC-AST-15 · Tanya asisten dari ⌘K](#uc-ast-15--tanya-asisten-dari-k)
- [UC-AST-16 · Tanya AISA tidak menjalankan perintah](#uc-ast-16--tanya-aisa-tidak-menjalankan-perintah)
- [UC-AST-17 · Riwayat percakapan: membuka, mencari, mengganti nama, menghapus](#uc-ast-17--riwayat-percakapan-membuka-mencari-mengganti-nama-menghapus)

**WhatsApp**

- [UC-WA-01 · Owner bertanya lewat WA tentang proposal A](#uc-wa-01--owner-bertanya-lewat-wa-tentang-proposal-a)
- [UC-WA-02 · Pertanyaan lanjutan lewat WA](#uc-wa-02--pertanyaan-lanjutan-lewat-wa)
- [UC-WA-03 · Meminta saran lewat WA](#uc-wa-03--meminta-saran-lewat-wa)
- [UC-WA-04 · Jawaban yang lama: mengetik… dan pesan tunggu](#uc-wa-04--jawaban-yang-lama-mengetik-dan-pesan-tunggu)
- [UC-WA-05 · Owner menyuruh AISA menyetujui satu proposal ⚠️](#uc-wa-05--owner-menyuruh-aisa-menyetujui-satu-proposal-️)
- [UC-WA-06 · Mengganti keputusan menjadi Tolak, dan kata perintah lama ⚠️](#uc-wa-06--mengganti-keputusan-menjadi-tolak-dan-kata-perintah-lama-️)
- [UC-WA-07 · Owner menyuruh AISA menolak semua yang tidak layak (tanpa YA)](#uc-wa-07--owner-menyuruh-aisa-menolak-semua-yang-tidak-layak-tanpa-ya)
- [UC-WA-08 · Mengonfirmasi tanggapan massal dengan YA ⚠️](#uc-wa-08--mengonfirmasi-tanggapan-massal-dengan-ya-️)
- [UC-WA-09 · YA yang kedaluwarsa atau tanpa perintah](#uc-wa-09--ya-yang-kedaluwarsa-atau-tanpa-perintah)
- [UC-WA-10 · Tanggapan massal untuk grade kosong](#uc-wa-10--tanggapan-massal-untuk-grade-kosong)
- [UC-WA-11 · Memindahkan grade dengan alasan ⚠️](#uc-wa-11--memindahkan-grade-dengan-alasan-️)
- [UC-WA-12 · Memindahkan grade tanpa alasan](#uc-wa-12--memindahkan-grade-tanpa-alasan)
- [UC-WA-13 · Memindahkan proposal yang perlu dicek manual](#uc-wa-13--memindahkan-proposal-yang-perlu-dicek-manual)
- [UC-WA-14 · Nama proposal ambigu](#uc-wa-14--nama-proposal-ambigu)
- [UC-WA-15 · Nama proposal tidak ditemukan](#uc-wa-15--nama-proposal-tidak-ditemukan)
- [UC-WA-16 · STOP lalu bertanya ⚠️](#uc-wa-16--stop-lalu-bertanya-️)
- [UC-WA-17 · Perintah tetap jalan saat dijeda ⚠️](#uc-wa-17--perintah-tetap-jalan-saat-dijeda-️)
- [UC-WA-18 · LANJUT](#uc-wa-18--lanjut)
- [UC-WA-19 · STOP saat jawaban sedang disiapkan](#uc-wa-19--stop-saat-jawaban-sedang-disiapkan)
- [UC-WA-20 · Ringkasan harian 09.00 dan mingguan Jumat 17.00](#uc-wa-20--ringkasan-harian-0900-dan-mingguan-jumat-1700)
- [UC-WA-21 · Ringkasan tercatat di Riwayat](#uc-wa-21--ringkasan-tercatat-di-riwayat)
- [UC-WA-22 · Keputusan lewat WA terlihat di dashboard](#uc-wa-22--keputusan-lewat-wa-terlihat-di-dashboard)
- [UC-WA-23 · Nomor yang tidak terdaftar](#uc-wa-23--nomor-yang-tidak-terdaftar)

**Google Form founder**

- [UC-FRM-01 · Founder mengirim proposal lewat Google Form ⚠️](#uc-frm-01--founder-mengirim-proposal-lewat-google-form-️)
- [UC-FRM-02 · Persetujuan wajib di form](#uc-frm-02--persetujuan-wajib-di-form)
- [UC-FRM-03 · File yang sama dikirim ulang ⚠️](#uc-frm-03--file-yang-sama-dikirim-ulang-️)
- [UC-FRM-04 · Melihat proposal yang perlu dicek manual](#uc-frm-04--melihat-proposal-yang-perlu-dicek-manual)
- [UC-FRM-05 · Proposal hasil scan dibaca sebagai gambar ⚠️](#uc-frm-05--proposal-hasil-scan-dibaca-sebagai-gambar-️)
- [UC-FRM-06 · Proposal masuk saat AISA dijeda ⚠️](#uc-frm-06--proposal-masuk-saat-aisa-dijeda-️)

---

## Tanya AISA di dashboard

### UC-AST-01 · Membuka Tanya AISA dan melihat contoh pertanyaan

**Situasi:** Anda ingin tahu apa yang bisa ditanyakan ke AISA.
**Sebelum mulai:** masuk sebagai admin. Halaman apa saja.
**Langkah:**

1. Arahkan kursor ke tombol bulat ungu bergambar bintang di **kanan bawah** layar. Tooltip
   **Tanya AISA** muncul.
2. Klik tombol itu.

**Yang seharusnya terlihat:** panel kecil terbuka di atas tombol. Di kepala panel: **Tanya
AISA** dan di bawahnya titik hijau dengan teks **Asisten yang sama di WhatsApp**; di kanannya
ikon jam (**Riwayat percakapan**), pensil, layar penuh, dan ✕. Di tengah:
**Halo** dan kalimat "Ada yang mau ditanyakan soal _N_ proposal? Jawaban diambil langsung dari
data AISA." Di bawahnya tiga kartu contoh, mis. **Fintech sangat layak**, **Di luar fokus**, **Alasan skor** ("Kenapa skor Kopi Teras Senja segitu?"). Kolom ketik berplaceholder
**Tanya AISA tentang proposal Anda…**, dan catatan kecil "Jawaban diambil dari data proposal.
Keputusan tetap di tangan Anda." Tombol bulat kanan bawah berubah menjadi ✕. Cek: angka _N_
sama dengan jumlah proposal di halaman **Proposal**, dan nama di contoh **Alasan skor** adalah
proposal belum ditanggapi dengan skor tertinggi.
**Kalau berbeda:** catat teks yang muncul; bila contoh menyebut startup yang tidak ada di
daftar Proposal, itu bug.

### UC-AST-02 · Bertanya lewat contoh pertanyaan

**Situasi:** Anda ingin tahu kenapa Kopi Teras Senja dapat skor 100.
**Sebelum mulai:** panel Tanya AISA terbuka (UC-AST-01), belum ada percakapan.
**Langkah:**

1. Klik kartu **Alasan skor**.
2. Tunggu jawabannya (biasanya belasan detik sampai sekitar satu menit).

**Yang seharusnya terlihat:** pertanyaan "Kenapa skor Kopi Teras Senja segitu?" muncul sebagai
gelembung ungu di kanan. Selama menunggu, ada tiga titik yang memantul di kiri. Jawaban muncul
dengan ikon bintang di kiri: menyebut skor kualitas, nilai tiap kriteria (1–5) beserta alasan dan
halaman kutipan (mis. "hal. 4"). Teks yang diapit bintang tampil **tebal**. Cek: buka detail
proposal itu (sidebar **Ruang kerja** → **Proposal** → klik namanya) dan bandingkan skor serta
nilai kriteria; harus persis sama, tanpa pembulatan.
**Kalau berbeda:** angka yang tidak sama dengan halaman detail adalah temuan serius; catat
pertanyaan, jawaban, dan jamnya.

### UC-AST-03 · Mengetik pertanyaan sendiri

**Situasi:** Anda ingin tahu berapa proposal yang belum ditanggapi.
**Sebelum mulai:** panel Tanya AISA terbuka.
**Langkah:**

1. Klik kolom **Tanya AISA tentang proposal Anda…**.
2. Ketik `Berapa proposal yang belum saya tanggapi?`
3. Tekan **Shift+Enter**, lalu ketik `Sebutkan namanya.` (baris kedua).
4. Tekan **Enter** (atau klik tombol panah ↑ **Kirim**).

**Yang seharusnya terlihat:** Shift+Enter membuat baris baru, tidak mengirim. Enter mengirim
kedua baris sebagai satu pertanyaan, dan kolom ketik kosong lagi. Saat kolom kosong, tombol
**Kirim** abu-abu dan tidak bisa diklik. Selama menunggu, tombol kirim berubah menjadi kotak
hitam (**Berhenti menunggu jawaban**) dan tiga titik memantul. Jawaban berisi angka dan daftar
nama. Cek: angkanya sama dengan **Belum ditanggapi** di panel samping layar penuh (UC-AST-06) dan
dengan daftar di **Proposal** yang berstatus **Belum ditanggapi**.
**Kalau berbeda:** catat kedua angka.

### UC-AST-04 · Meminta saran: bagian "💡 Saran AI"

**Situasi:** Anda ingin pendapat AISA proposal mana yang sebaiknya dicek dulu.
**Sebelum mulai:** panel Tanya AISA terbuka.
**Langkah:**

1. Ketik `Mana yang sebaiknya saya cek dulu minggu ini, dan kenapa?` lalu tekan Enter.

**Yang seharusnya terlihat:** jawaban terbagi dua. Bagian atas berisi fakta dari data (nama,
skor kualitas, grade) tanpa label. Bagian bawah berada di **kotak bergaris putus-putus**
dan diawali **💡 Saran AI (bukan dari data proposal):**. Semua penilaian (urutan prioritas,
alasan, risiko) ada di dalam kotak itu, tidak di bagian atas. Cek juga kebalikannya: pertanyaan
data biasa (UC-AST-03) tidak boleh punya kotak 💡.
**Kalau berbeda:** kalimat penilaian di luar kotak, atau kotak 💡 muncul tanpa diminta, dicatat
sebagai temuan.

### UC-AST-05 · Pertanyaan lanjutan dalam satu percakapan

**Situasi:** setelah bertanya tentang satu proposal, Anda ingin bertanya lanjutan tanpa
menyebut namanya lagi.
**Sebelum mulai:** sudah ada jawaban tentang Kopi Teras Senja (UC-AST-02).
**Langkah:**

1. Ketik `Berapa dana yang dia minta?` lalu Enter.

**Yang seharusnya terlihat:** AISA paham "dia" adalah Kopi Teras Senja dan menyebut dana yang
diminta dalam bentuk singkat (mis. "Rp15 M"). Cek dengan dana di halaman detail proposal.
**Kalau berbeda:** bila AISA menanyakan proposal mana, percakapan tidak tersambung; catat.

### UC-AST-06 · Layar penuh dan panel samping

**Situasi:** Anda ingin percakapan yang lebih lega di layar laptop.
**Sebelum mulai:** panel Tanya AISA terbuka, layar lebar (laptop/desktop).
**Langkah:**

1. Di kepala panel, klik ikon panah keluar (**Layar penuh**).

**Yang seharusnya terlihat:** panel memenuhi seluruh layar, tombol bulat kanan bawah hilang.
Di kiri ada panel samping berisi tombol **Percakapan baru**, kolom **Cari percakapan**, daftar
riwayat percakapan yang dikelompokkan per tanggal (lihat UC-AST-17), dan di bawahnya kotak
**DATA SAAT INI** berisi **Total proposal**, **Belum ditanggapi**, dan **Sangat layak, menunggu**.
Bila percakapan yang terbuka masih kosong, di tengah tampil **Halo**, judul kecil **COBA
TANYAKAN**, dan enam kartu contoh (**Fintech sangat layak**, **Di luar fokus**,
**Alasan skor**, **Bandingkan proposal**, **Pertanyaan untuk founder**, **Dana di bawah Rp3 M**).
Ikon di kepala berubah menjadi **Kecilkan jendela**. Cek: **Total proposal** sama dengan jumlah
di halaman **Proposal**; angka **Sangat layak, menunggu** sama dengan jumlah Sangat layak yang
belum ditanggapi. Di layar sempit (ponsel), panel samping tidak tampil dan kartu contoh hanya empat;
riwayat dibuka lewat ikon jam di kepala panel.
**Kalau berbeda:** catat angka di kotak dan di halaman Proposal.

### UC-AST-07 · Menutup dengan Esc

**Situasi:** Anda ingin keluar cepat dengan keyboard.
**Sebelum mulai:** Tanya AISA dalam mode layar penuh (UC-AST-06).
**Langkah:**

1. Tekan **Esc** sekali.
2. Tekan **Esc** sekali lagi.

**Yang seharusnya terlihat:** Esc pertama mengecilkan kembali ke panel kecil. Esc kedua menutup
panel; tombol bulat bintang kembali di kanan bawah. Klik tombol itu lagi: percakapan tadi masih
ada.
**Kalau berbeda:** bila Esc pertama langsung menutup semuanya, catat.

### UC-AST-08 · Percakapan baru

**Situasi:** Anda ingin mulai topik baru tanpa sisa percakapan lama.
**Sebelum mulai:** ada minimal satu tanya-jawab di panel.
**Langkah:**

1. Di kepala panel, klik ikon pensil (**Percakapan baru**). Di layar penuh, bisa juga tombol
   **Percakapan baru** di panel samping.
2. Ketik `Berapa dana yang dia minta?` lalu Enter.

**Yang seharusnya terlihat:** setelah langkah 1, layar kembali ke **Halo** dan kartu contoh.
Saat belum ada pesan, ikon **Percakapan baru** abu-abu (tidak bisa diklik). Percakapan lama tidak
hilang: ia tetap ada di riwayat (UC-AST-17). Di langkah 2, AISA tidak tahu siapa "dia" dan
menanyakan proposal mana; percakapan baru memang tidak membawa konteks yang lama. Setelah langkah
2, percakapan baru muncul paling atas di riwayat di bawah **HARI INI**, berjudul pertanyaan
pertamanya.
**Kalau berbeda:** bila AISA masih menjawab tentang proposal sebelumnya, catat.

### UC-AST-09 · Berhenti menunggu jawaban

**Situasi:** Anda salah bertanya dan tidak mau menunggu jawabannya.
**Sebelum mulai:** panel Tanya AISA terbuka.
**Langkah:**

1. Ketik `Bandingkan semua proposal Sangat layak secara rinci` lalu Enter.
2. Selagi tiga titik memantul, klik tombol kotak hitam (**Berhenti menunggu jawaban**).

**Yang seharusnya terlihat:** tiga titik hilang, tombol kembali menjadi **Kirim**, dan Anda bisa
langsung bertanya lagi. Jawaban yang tadi ditunggu tidak muncul di panel, walau datang belakangan.
Catatan: ini hanya berhenti _menunggu_; AISA tetap menyelesaikan jawabannya di server, dan
pekerjaan itu tetap tercatat di sidebar **Ruang kerja** → **Aktivitas AI** sebagai pekerjaan
**Asisten** berjudul "Menjawab pertanyaan manajer".
**Kalau berbeda:** bila jawaban lama tetap muncul setelah dihentikan, catat.

### UC-AST-10 · Percakapan tetap ada saat pindah halaman

**Situasi:** Anda bertanya, lalu pindah halaman atau memuat ulang.
**Sebelum mulai:** ada minimal satu tanya-jawab di panel.
**Langkah:**

1. Di sidebar **Ruang kerja**, klik **Riwayat**. Buka lagi Tanya AISA.
2. Tekan F5 (muat ulang). Buka lagi Tanya AISA.
3. Buka dashboard di tab baru, buka Tanya AISA.

**Yang seharusnya terlihat:** langkah 1 dan 2: percakapan yang sama masih terbuka. Langkah 3:
tab baru mulai dengan percakapan kosong (**Halo**), tetapi percakapan tadi ada di riwayat dan bisa
dibuka dari sana. Riwayat disimpan di browser ini (localStorage) per akun: browser atau perangkat
lain tidak melihatnya, dan akun lain yang masuk di browser yang sama tidak melihat riwayat akun
Anda. Percakapan yang sedang terbuka diingat per tab. Saat Anda **Keluar** (menu akun kanan
atas), seluruh riwayat Tanya AISA di browser ini dihapus, jadi setelah masuk lagi riwayatnya kosong.
**Kalau berbeda:** catat langkah mana yang kehilangan percakapan.

### UC-AST-11 · Menyalin jawaban

**Situasi:** Anda ingin menempel jawaban AISA ke catatan.
**Sebelum mulai:** ada minimal satu jawaban.
**Langkah:**

1. Di bawah jawaban, klik **Salin**.
2. Tempel (Ctrl+V) di aplikasi catatan.

**Yang seharusnya terlihat:** label berubah menjadi **Disalin** sebentar. Teks yang tertempel
adalah jawaban apa adanya (tanda bintang untuk tebal ikut tersalin). Bila browser menolak akses
papan klip, muncul toast **Gagal menyalin**.
**Kalau berbeda:** catat browser yang dipakai.

### UC-AST-12 · Jawaban gagal dan Coba lagi

**Situasi:** jaringan putus, layanan AISA sedang tidak bisa dihubungi, atau Asisten gagal menjawab
saat Anda bertanya.
**Sebelum mulai:** panel Tanya AISA terbuka. Cara paling mudah memicunya: matikan Wi-Fi sesaat
setelah menekan Enter. Kondisi ini tidak selalu bisa dibuat; uji bila kebetulan terjadi.
**Langkah:**

1. Kirim pertanyaan apa saja.
2. Bila muncul pesan merah, nyalakan kembali jaringan, lalu klik **Coba lagi** di bawah pesan
   merah itu.

**Yang seharusnya terlihat:** pesan gagal tampil merah dengan ikon tanda seru, plus toast merah
berisi teks yang sama (mis. "aisa-api tidak dapat dihubungi. Coba lagi sebentar lagi." atau
"aisa-api belum menjawab dalam batas waktu. Prosesnya mungkin masih berjalan; coba lagi sebentar
lagi."). **Coba lagi** menghapus pertanyaan yang gagal beserta pesan merahnya, lalu mengirim
ulang pertanyaan yang sama. Bila Asisten sendiri gagal menjawab, hasilnya juga pesan merah dengan
tombol **Coba lagi** (dan toast merah), berisi "Maaf, asisten sedang tidak bisa dihubungi. Coba
lagi sebentar.", bukan gelembung jawaban biasa.
**Kalau berbeda:** catat teks pesan merahnya.

### UC-AST-13 · Bertanya saat AISA dijeda ⚠️

**Situasi:** AI sedang dijeda (STOP) dan Anda tetap mencoba bertanya.
**Sebelum mulai:** masuk sebagai admin. Langkah ini menjeda penilaian proposal untuk semua
orang; kembalikan dengan LANJUT di akhir, dan lakukan saat tidak ada proposal yang sedang masuk.
**Langkah:**

1. Di sidebar **Lainnya**, klik **Pengaturan**, pilih bagian **Integrasi**.
2. Di kotak **Status AI**, klik **STOP**. Toast **AI dijeda (STOP).** muncul dan label berubah
   menjadi **Dijeda (STOP)**.
3. Buka Tanya AISA (tutup dulu lalu buka lagi bila sudah terbuka).
4. Ketik `Berapa proposal Sangat layak?` lalu Enter.
5. Kembali ke **Pengaturan** → **Integrasi**, klik **LANJUT**. Toast **AI dilanjutkan
   (LANJUT).** muncul.

**Yang seharusnya terlihat:** di langkah 3, kepala panel menampilkan titik kuning dan teks
**Dijeda (STOP) · pertanyaan belum dijawab**. Di langkah 4, jawaban langsung muncul: "AISA
sedang dijeda (STOP). Pertanyaan bisa dikirim lagi setelah LANJUT di dashboard atau lewat
WhatsApp." Setelah LANJUT, buka ulang panel: titik hijau dan **Asisten yang sama di WhatsApp**
kembali, dan pertanyaan yang sama dijawab normal. Di **Riwayat** muncul **Pekerjaan AI dijeda
(STOP)** dan **Pekerjaan AI dilanjutkan (LANJUT)**, keduanya via Dashboard. Bila Anda menekan STOP
saat AISA sedang menyiapkan jawaban, jawabannya menjadi "Jawaban dibatalkan karena AISA dijeda
(STOP). Kirim ulang pertanyaannya."
**Kalau berbeda:** bila pertanyaan tetap dijawab saat dijeda, itu bug.

### UC-AST-14 · Kartu Tanya AISA di detail proposal

**Situasi:** Anda akan bertemu founder Kopi Teras Senja dan ingin menyiapkan pertanyaan.
**Sebelum mulai:** masuk sebagai admin.
**Langkah:**

1. Di sidebar **Ruang kerja**, klik **Proposal**, lalu klik **Kopi Teras Senja**.
2. Gulir ke kartu **Tanya AISA** ("Siapkan diri sebelum bertemu founder.").
3. Klik **Pertanyaan untuk founder**.
4. Setelah jawabannya muncul, klik **Risiko yang perlu dicek**.

**Yang seharusnya terlihat:** panel Tanya AISA terbuka sendiri dan langsung mengirim
"Buatkan pertanyaan untuk founder Kopi Teras Senja". Jawabannya berupa daftar pertanyaan di
dalam kotak **💡 Saran AI (bukan dari data proposal):**, berdasarkan kriteria bernilai rendah atau
yang tidak disebut di proposal. Langkah 4 mengirim "Apa risiko Kopi Teras Senja?", juga dengan
bagian 💡. Bila Anda mengklik tombol kedua saat jawaban pertama belum datang, pertanyaan kedua
menunggu dan baru terkirim setelah jawaban pertama selesai.
**Kalau berbeda:** bila panel terbuka tapi tidak mengirim apa-apa, catat.

### UC-AST-15 · Tanya asisten dari ⌘K

**Situasi:** Anda ingin ringkasan peluang minggu ini dengan keyboard.
**Sebelum mulai:** masuk sebagai admin.
**Langkah:**

1. Klik kolom **Cari proposal** di header (atau tekan ⌘K / Ctrl+K).
2. Di grup **Perintah**, klik **Tanya asisten** (atau ketik `tanya` lalu Enter).

**Yang seharusnya terlihat:** kotak pencarian tertutup, panel Tanya AISA terbuka dan langsung
mengirim "Ringkas peluang minggu ini". Jawabannya berisi daftar proposal dengan skor kualitas
dan grade.
**Kalau berbeda:** catat bila **Tanya asisten** tidak ada di grup **Perintah**.

### UC-AST-16 · Tanya AISA tidak menjalankan perintah

**Situasi:** Anda mengetik perintah WhatsApp di chat dashboard.
**Sebelum mulai:** panel Tanya AISA terbuka. Catat dulu status **Keputusan** Kopi Teras Senja di
halaman detailnya.
**Langkah:**

1. Ketik `tolak Kopi Teras Senja` lalu Enter.
2. Buka detail Kopi Teras Senja.

**Yang seharusnya terlihat:** AISA tidak menolak apa pun. Jawabannya menjelaskan bahwa ia
hanya bisa membaca data, dan boleh menyebut cara mengubahnya (tombol di dashboard atau perintah
WhatsApp `tolak <nama>`). Kartu **Keputusan Anda** di detail tidak berubah.
**Kalau berbeda:** bila status berubah, atau AISA mengaku "sudah ditolak", itu bug serius.

### UC-AST-17 · Riwayat percakapan: membuka, mencari, mengganti nama, menghapus

**Situasi:** Anda ingin kembali ke percakapan kemarin, atau merapikan riwayat.
**Sebelum mulai:** sudah ada minimal dua percakapan (pakai **Percakapan baru** di antaranya).
Laptop, Tanya AISA layar penuh.
**Langkah:**

1. Lihat daftar di panel samping kiri.
2. Klik percakapan yang bukan yang sedang terbuka.
3. Ketik sebagian kata dari salah satu pertanyaan atau jawaban di **Cari percakapan**, lalu
   hapus lagi isinya.
4. Arahkan kursor ke satu percakapan, klik **⋯**, pilih **Ganti nama**, ketik `Rapat Senin`, lalu
   Enter.
5. Klik **⋯** lagi pada percakapan itu, pilih **Hapus**, lalu **Hapus** di dialog.
6. Kecilkan jendela, klik ikon jam (**Riwayat percakapan**) di kepala panel kecil.

**Yang seharusnya terlihat:** langkah 1: percakapan dikelompokkan menurut waktu terakhir
dipakai (WIB) di bawah judul kecil **HARI INI**, **KEMARIN**, **7 HARI TERAKHIR**, **30 HARI
TERAKHIR**, lalu per bulan (mis. **SEPTEMBER 2026**); judul kelompok tetap menempel di atas saat
daftar digulir. Tiap baris berjudul pertanyaan pertama percakapan itu (satu baris, dipotong
dengan "…" bila panjang); arahkan kursor untuk melihat kapan terakhir diperbarui. Percakapan yang
terbuka diberi latar putih dan garis biru di kiri. Langkah 2: pesan percakapan itu tampil dan
pertanyaan berikutnya melanjutkannya. Bila percakapan itu dimulai sebelum hari ini, di atas kolom
ketik muncul "AISA mungkin tidak ingat konteks percakapan lama; tanyakan ulang bila perlu." —
ingatan Asisten di server berganti tiap hari (WIB) dan dikosongkan saat ada proposal dihapus, jadi
pesan lama hanya tersimpan di layar Anda. Langkah 3: daftar hanya menampilkan percakapan yang
judul atau isinya cocok; bila tidak ada, "Tidak ada percakapan yang cocok dengan …". Langkah 4:
judul berganti menjadi **Rapat Senin**; Esc membatalkan, nama kosong tidak disimpan. Langkah 5:
dialog **Hapus percakapan?** muncul; setelah dikonfirmasi baris itu hilang, dan bila itu
percakapan yang terbuka, layar kembali ke **Halo**. Langkah 6: lembar **Riwayat** meluncur dari
kiri di dalam panel dengan isi yang sama; memilih percakapan menutup lembar itu. Panah atas/bawah
berpindah antarbaris, Enter membuka. Bila belum ada percakapan sama sekali: "Belum ada
percakapan". Riwayat menyimpan paling banyak 50 percakapan; yang paling lama tidak dipakai
terhapus lebih dulu.
**Kalau berbeda:** catat langkah dan apa yang tampil; bila percakapan muncul di kelompok tanggal
yang salah, catat juga jam percakapan terakhir dipakai.

---

## WhatsApp

Semua langkah di bagian ini dilakukan di WhatsApp ponsel yang nomornya terdaftar sebagai
manajer, di chat dengan **+62 877-8116-8546**. Huruf besar-kecil di perintah tidak berpengaruh
(`STOP`, `stop`, `Stop` sama), dan titik atau tanda seru di akhir boleh. Anda tidak bisa
mengklik apa pun di sini: ketik persis seperti contoh, lalu cocokkan balasannya.

Balasan **perintah** dibuat oleh kode dan kata-katanya tetap, jadi bisa dicocokkan persis.
Balasan **pertanyaan** ditulis oleh AI, jadi kata-katanya bebas; yang dicek adalah isinya.

### UC-WA-01 · Owner bertanya lewat WA tentang proposal A

**Situasi:** Anda di jalan dan ingin tahu kenapa Kelas Kode Rakyat masuk Sangat layak (pakai proposal
Sangat layak yang ada di dashboard Anda).
**Sebelum mulai:** AISA tidak sedang dijeda.
**Langkah:**

1. Kirim: `Kenapa Kelas Kode Rakyat masuk sangat layak?`

**Yang seharusnya terlihat:** di kepala chat muncul "mengetik…" selama AISA menyiapkan jawaban.
Balasan menyebut skor kualitas (mis. 85,6, desimal pakai koma), grade, dan nilai kriteria
1–5 beserta alasannya. Tebal ditulis dengan satu bintang (`*seperti ini*`), tanpa tabel. Cek di
dashboard: angka sama persis dengan halaman detail Kelas Kode Rakyat. Pekerjaan ini juga muncul
di **Aktivitas AI** sebagai **Asisten**, "Menjawab pertanyaan manajer".
**Kalau berbeda:** angka yang tidak cocok dengan dashboard dicatat beserta jam pesannya.

### UC-WA-02 · Pertanyaan lanjutan lewat WA

**Situasi:** Anda melanjutkan pertanyaan tadi tanpa menyebut nama lagi.
**Sebelum mulai:** UC-WA-01 sudah dijawab, di hari yang sama.
**Langkah:**

1. Kirim: `Berapa dana yang dia minta?`

**Yang seharusnya terlihat:** AISA paham "dia" adalah Kelas Kode Rakyat dan menyebut dana dalam
bentuk singkat (mis. "Rp2 M"). Percakapan WA disambung selama satu hari (WIB); besok pagi AISA
mulai percakapan baru, tapi tetap ingat preferensi gaya Anda.
**Kalau berbeda:** bila AISA bertanya proposal mana, catat.

### UC-WA-03 · Meminta saran lewat WA

**Situasi:** Anda ingin pendapat AISA sebelum rapat.
**Sebelum mulai:** —
**Langkah:**

1. Kirim: `Dari yang sangat layak, mana yang sebaiknya saya setujui dulu?`

**Yang seharusnya terlihat:** balasan berisi fakta dulu (nama, skor, grade), lalu bagian yang
diawali `💡 *Saran AI (bukan dari data proposal):*` berisi urutan dan alasannya. AISA tidak
mengubah status apa pun dan tidak mengaku sudah menyetujui; di dashboard, status proposal tetap
sama.
**Kalau berbeda:** penilaian di luar bagian 💡, atau klaim "sudah saya setujui", dicatat.

### UC-WA-04 · Jawaban yang lama: mengetik… dan pesan tunggu

**Situasi:** pertanyaan Anda butuh banyak data, jadi jawabannya lama.
**Sebelum mulai:** —
**Langkah:**

1. Kirim: `Bandingkan semua proposal yang belum saya tanggapi satu per satu`

**Yang seharusnya terlihat:** "mengetik…" muncul dan terus menyala. Bila jawaban belum siap
setelah sekitar 20 detik, AISA mengirim satu pesan: "⏳ Sedang mengambil data, mohon tunggu…",
lalu jawaban lengkapnya menyusul. Pesan tunggu hanya dikirim sekali per pertanyaan. Bila AISA
gagal, balasannya "Maaf, asisten sedang tidak bisa dihubungi. Coba lagi sebentar."
**Kalau berbeda:** bila tidak ada balasan sama sekali dalam 3–4 menit, catat jamnya.

### UC-WA-05 · Owner menyuruh AISA menyetujui satu proposal ⚠️

**Situasi:** Anda memutuskan melanjutkan satu startup lewat WA, mis. untuk mengajak foundernya
berdiskusi.
**Sebelum mulai:** ada proposal uji `UJI Satu` yang sudah **Dinilai** (lihat Cakupan).
**Langkah:**

1. Kirim: `setuju UJI Satu`
2. Di dashboard, buka detail **UJI Satu**.

**Yang seharusnya terlihat:** balasan persis: `Tercatat: UJI Satu → setuju.` Di detail, kartu
**Keputusan Anda** menampilkan "Sekarang:" dengan badge **Disetujui** dan "_tanggal jam_ via
WhatsApp" di bawahnya, dan badge **Disetujui** muncul di bawah nama proposal. Perintah ini hanya mencatat status di AISA; AISA
tidak menghubungi founder.
**Kalau berbeda:** bila balasannya diawali "Tidak bisa dijalankan:", catat sisa kalimatnya.

### UC-WA-06 · Mengganti keputusan menjadi Tolak, dan kata perintah lama ⚠️

**Situasi:** Anda berubah pikiran dan tidak melanjutkan proposal itu. Anda juga masih ingat
perintah lama.
**Sebelum mulai:** UC-WA-05 sudah dijalankan pada `UJI Satu`.
**Langkah:**

1. Kirim: `tolak UJI Satu`
2. Kirim: `arsipkan UJI Satu`
3. Di dashboard, buka detail **UJI Satu**, lihat kartu **Riwayat** di halamannya.

**Yang seharusnya terlihat:** langkah 1: `Tercatat: UJI Satu → tolak.` Keputusan bisa diganti
kapan saja; yang terakhir yang berlaku. Langkah 2: balasan persis `Perintah sekarang: setuju <nama>
atau tolak <nama>.` Kata lama `undang`, `pantau`, dan `arsipkan` bukan perintah lagi: tidak ada
yang berubah, pesannya tidak diteruskan ke Asisten, dan tidak ada kartu baru di **Aktivitas AI**.
Di detail: "Sekarang:" dengan badge **Ditolak** dan "… via WhatsApp", dengan satu baris
**Tanggapan** untuk langkah 1 saja. Proposal yang ditolak dihapus otomatis setelah masa retensi (Pengaturan, tab Privasi).
**Kalau berbeda:** bila `arsipkan …` mengubah status atau dijawab Asisten, catat balasannya.

### UC-WA-07 · Owner menyuruh AISA menolak semua yang tidak layak (tanpa YA)

**Situasi:** Anda ingin tahu apa yang akan ditolak sebelum benar-benar menolaknya.
**Sebelum mulai:** di dashboard, catat proposal ber-grade **Tidak layak** yang belum
ditanggapi. Use case ini tidak mengubah apa pun selama Anda
**tidak** membalas YA.
**Langkah:**

1. Kirim: `tolak semua tidak layak`
2. Jangan balas apa-apa.

**Yang seharusnya terlihat:** balasan dua baris:

```text
Ada 2 proposal Tidak layak yang belum ditanggapi: <nama 1>, <nama 2>
Balas YA dalam 10 menit untuk menolak semuanya.
```

Jumlah dan nama harus sama dengan catatan Anda (paling banyak 15 nama ditulis, sisanya "…").
Status di dashboard belum berubah. Perintah yang sama berlaku untuk `setuju semua …` (baris kedua
"… untuk menyetujui semuanya."), dengan grade `sangat layak`, `layak bersyarat`, `perlu
penyesuaian`, `risiko tinggi`, atau `tidak layak` (huruf besar-kecil dan jumlah spasi bebas).
`layak` saja bukan nama grade.
**Kalau berbeda:** nama yang tidak cocok dengan dashboard dicatat.

### UC-WA-08 · Mengonfirmasi tanggapan massal dengan YA ⚠️

**Situasi:** Anda yakin dan ingin menolak semua proposal di satu grade.
**Sebelum mulai:** perintah massal ini mengenai **semua** proposal belum ditanggapi di grade
itu, termasuk proposal sungguhan. Jalankan hanya bila grade yang dipilih berisi proposal uji
saja (cek di **Proposal** dengan filter grade), atau bila Anda memang ingin menolak semuanya.
**Langkah:**

1. Kirim perintah massal, mis. `tolak semua risiko tinggi`.
2. Dalam 10 menit, balas: `YA` (atau `ya` / `iya`).

**Yang seharusnya terlihat:** balasan persis: `Selesai: N proposal ditolak.` (N sama dengan
jumlah di pesan sebelumnya, atau lebih kecil bila sebagian sudah ditanggapi di dashboard selama
menunggu; untuk `setuju semua …` balasannya `Selesai: N proposal disetujui.`). Di **Riwayat**
muncul baris "Tanggapan massal: ditolak" dengan keterangan "Tolak semua risiko tinggi: N proposal
(…nama…)" via WhatsApp. Setiap proposal itu kini **Ditolak**.
**Kalau berbeda:** bila N di balasan berbeda dari yang berubah di dashboard, catat.

### UC-WA-09 · YA yang kedaluwarsa atau tanpa perintah

**Situasi:** Anda membalas YA terlambat, atau tanpa perintah sebelumnya.
**Sebelum mulai:** untuk langkah 1–2 jalankan UC-WA-07 dulu, lalu tunggu lebih dari 10 menit.
Tidak ada data yang berubah di use case ini.
**Langkah:**

1. Setelah lebih dari 10 menit, kirim: `YA`
2. Kirim `YA` sekali lagi.

**Yang seharusnya terlihat:** langkah 1: `Konfirmasi sudah kedaluwarsa (lebih dari 10 menit).
Kirim ulang perintahnya.` Langkah 2: `Tidak ada perintah yang menunggu konfirmasi.` Status
proposal tidak berubah.
**Kalau berbeda:** bila YA terlambat tetap menolak, itu bug serius.

### UC-WA-10 · Tanggapan massal untuk grade kosong

**Situasi:** Anda memberi perintah massal untuk grade yang tidak punya proposal belum
ditanggapi.
**Sebelum mulai:** di dashboard, pastikan satu grade (mis. **Perlu penyesuaian**) tidak punya
proposal belum ditanggapi.
**Langkah:**

1. Kirim: `setuju semua perlu penyesuaian`

**Yang seharusnya terlihat:** `Tidak ada proposal Perlu penyesuaian yang belum ditanggapi.` Tidak
ada yang perlu dikonfirmasi.
**Kalau berbeda:** catat balasannya.

### UC-WA-11 · Memindahkan grade dengan alasan ⚠️

**Situasi:** Anda tidak setuju dengan grade dari AI dan ingin memindahkannya.
**Sebelum mulai:** proposal uji `UJI Dua` berstatus **Dinilai**. Catat skor kualitasnya.
**Langkah:**

1. Kirim: `pindahkan UJI Dua ke layak bersyarat karena timnya sudah pernah exit`
2. Di dashboard, buka detail **UJI Dua**.

**Yang seharusnya terlihat:** balasan persis: `Grade UJI Dua dipindahkan ke Layak bersyarat.
Skor kualitas tetap <skor>.` (skor ditulis dengan koma, mis. 62,5). Di detail: badge grade menjadi
**Layak bersyarat** dengan badge **dikoreksi**, dan kartu **Grade kurang pas?** berbunyi "AI
menilai <grade dari AI>, lalu dikoreksi ke Layak bersyarat (<tanggal, jam>, WhatsApp): “timnya
sudah pernah exit”." Skor tidak berubah. Di **Riwayat**, tab **Koreksi**, muncul baris "Grade UJI
Dua dikoreksi" dengan badge grade lama → **Layak bersyarat** dan alasan dalam tanda kutip, via
WhatsApp.
**Kalau berbeda:** bila skornya ikut berubah, catat.

### UC-WA-12 · Memindahkan grade tanpa alasan

**Situasi:** Anda lupa menulis alasan.
**Sebelum mulai:** — (tidak ada data yang berubah)
**Langkah:**

1. Kirim: `pindahkan UJI Dua ke sangat layak`
2. Kirim: `pindahkan UJI Dua ke sangat layak karena`

**Yang seharusnya terlihat:** kedua pesan dibalas sama: `Koreksi grade perlu alasan. Contoh:
pindahkan UJI Dua ke sangat layak karena <alasan>`. Grade di dashboard tidak berubah.
Nama dicek lebih dulu daripada alasan: `pindahkan Xyzabc ke layak bersyarat` (nama yang tidak ada, tanpa
alasan) dibalas `Proposal "Xyzabc" tidak ditemukan. Tidak ada yang diubah.`, bukan permintaan
alasan. Nama yang cocok dengan beberapa proposal dibalas daftar seperti UC-WA-14.
**Kalau berbeda:** bila grade berubah tanpa alasan, itu bug.

### UC-WA-13 · Memindahkan proposal yang perlu dicek manual

**Situasi:** Anda mencoba memindahkan grade proposal yang belum punya grade.
**Sebelum mulai:** ada proposal berstatus **Perlu dicek manual** (mis. Lumbung Ikan Pesisir).
Tidak ada data yang berubah.
**Langkah:**

1. Kirim: `pindahkan Lumbung Ikan Pesisir ke layak bersyarat karena uji`

**Yang seharusnya terlihat:** `Tidak bisa dijalankan: hanya proposal yang sudah dinilai yang
punya grade`. Proposal tetap **Perlu dicek manual**.
**Kalau berbeda:** catat balasannya.

### UC-WA-14 · Nama proposal ambigu

**Situasi:** Anda menulis nama yang cocok dengan lebih dari satu proposal.
**Sebelum mulai:** ada dua proposal uji, `UJI Satu` dan `UJI Dua`. Tidak ada data yang berubah.
**Langkah:**

1. Kirim: `setuju UJI`

**Yang seharusnya terlihat:**

```text
Ada beberapa proposal yang mirip "UJI":
1. UJI Satu
2. UJI Dua
Tidak ada yang diubah. Kirim ulang perintah dengan nama lengkap.
```

Urutan nama bisa berbeda. Kedua proposal tidak berubah status. Perhatian sebaliknya: nama yang
hanya cocok dengan **satu** proposal langsung dijalankan tanpa konfirmasi, walau hanya awalan
(mis. `setuju Kopi` langsung menyetujui Kopi Teras Senja) atau salah ketik kecil.
**Kalau berbeda:** bila salah satu ikut berubah, itu bug serius.

### UC-WA-15 · Nama proposal tidak ditemukan

**Situasi:** Anda menulis nama yang tidak ada.
**Sebelum mulai:** — (tidak ada data yang berubah)
**Langkah:**

1. Kirim: `setuju Xyzabc`

**Yang seharusnya terlihat:** `Proposal "Xyzabc" tidak ditemukan. Tidak ada yang diubah.` Bila
ada nama yang agak mirip, balasannya berupa daftar seperti UC-WA-14.
**Kalau berbeda:** catat balasannya.

### UC-WA-16 · STOP lalu bertanya ⚠️

**Situasi:** Anda ingin menghentikan semua pekerjaan AI sementara.
**Sebelum mulai:** STOP menjeda penilaian proposal baru untuk semua orang; kembalikan dengan
LANJUT (UC-WA-18) di akhir.
**Langkah:**

1. Kirim: `STOP`
2. Kirim: `Berapa proposal yang sangat layak?`
3. Di dashboard, buka **Dashboard** dan **Pengaturan** → **Integrasi**.

**Yang seharusnya terlihat:** langkah 1: `AISA dijeda (STOP). Proposal baru akan antre. Kirim
LANJUT untuk melanjutkan.` Langkah 2: `AISA sedang dijeda (STOP). Kirim LANJUT untuk
melanjutkan.` (pertanyaan tidak dijawab). Di Dashboard ada pita merah "AI sedang dijeda (STOP).
Proposal baru menunggu sebagai Antre sampai LANJUT di Pengaturan…"; di **Integrasi**, **Status
AI** menunjukkan **Dijeda (STOP)**. Di **Riwayat**: **Pekerjaan AI dijeda (STOP)** via WhatsApp.
**Kalau berbeda:** bila pertanyaan tetap dijawab saat dijeda, itu bug.

### UC-WA-17 · Perintah tetap jalan saat dijeda ⚠️

**Situasi:** AI dijeda, tetapi Anda tetap ingin mencatat keputusan.
**Sebelum mulai:** AISA dalam keadaan STOP (UC-WA-16); ada proposal uji `UJI Satu`.
**Langkah:**

1. Kirim: `setuju UJI Satu`

**Yang seharusnya terlihat:** `Tercatat: UJI Satu → setuju.` Perintah dijalankan oleh kode,
bukan AI, jadi tetap berjalan saat dijeda. Hanya pertanyaan, penilaian proposal, dan penulisan
ringkasan oleh AI yang berhenti.
**Kalau berbeda:** catat balasannya.

### UC-WA-18 · LANJUT

**Situasi:** Anda ingin AI bekerja lagi.
**Sebelum mulai:** AISA dalam keadaan STOP.
**Langkah:**

1. Kirim: `LANJUT`
2. Kirim lagi pertanyaan dari UC-WA-16 langkah 2.

**Yang seharusnya terlihat:** `Pekerjaan AI dilanjutkan.` Pertanyaan berikutnya dijawab normal.
Proposal yang menumpuk sebagai **Antre** selama jeda mulai dinilai. Pita merah di Dashboard
hilang (muat ulang halaman), dan **Riwayat** mencatat **Pekerjaan AI dilanjutkan (LANJUT)** via
WhatsApp.
**Kalau berbeda:** bila proposal Antre tidak bergerak setelah beberapa menit, catat namanya.

### UC-WA-19 · STOP saat jawaban sedang disiapkan

**Situasi:** Anda bertanya, lalu langsung berubah pikiran.
**Sebelum mulai:** AISA tidak dijeda. Kembalikan dengan LANJUT di akhir.
**Langkah:**

1. Kirim pertanyaan panjang, mis. `Bandingkan semua proposal yang belum saya tanggapi satu per
   satu`.
2. Selagi "mengetik…" masih tampil, kirim: `STOP`
3. Kirim: `LANJUT`

**Yang seharusnya terlihat:** langkah 2: `AISA dijeda (STOP). Jawaban yang sedang diproses
dibatalkan. Proposal baru akan antre. Kirim LANJUT untuk melanjutkan.` Jawaban pertanyaan tadi
tidak pernah dikirim. Langkah 3: `Pekerjaan AI dilanjutkan. Pertanyaan yang dibatalkan perlu
dikirim ulang.` Di **Aktivitas AI**, pekerjaan **Asisten** itu berstatus dihentikan, dengan
langkah "Dihentikan oleh STOP".
**Kalau berbeda:** bila jawaban lama tetap datang setelah STOP, itu bug.

### UC-WA-20 · Ringkasan harian 09.00 dan mingguan Jumat 17.00

**Situasi:** Anda menerima ringkasan harian di WA setiap pagi dan ringkasan mingguan setiap Jumat
sore.
**Sebelum mulai:** tunggu sampai pukul 09.00 WIB (hari apa saja) atau 17.00 WIB hari Jumat. Pada
hari lain tidak ada ringkasan pukul 17.00. Buka dashboard di saat yang sama untuk mencocokkan
angka.
**Langkah:**

1. Buka pesan ringkasan dari bot.
2. Untuk ringkasan harian, bandingkan dengan halaman **Proposal** (filter yang belum ditanggapi
   per grade). Untuk ringkasan mingguan, bandingkan dengan proposal yang masuk sejak Senin.

**Yang seharusnya terlihat (harian, 09.00):** pesan diawali salam sesuai jam kirim ("Selamat
pagi" / "Selamat siang" / "Selamat sore" / "Selamat malam") dan sapaan (mis. "Pak"), lalu "Sejak
ringkasan _hari_ pukul _jam_ masuk _N_ proposal baru. Ada _M_ proposal yang belum Pak tanggapi."
_Hari_ dan _jam_ adalah waktu kirim ringkasan 09.00 sebelumnya: jendela "baru masuk" dihitung
dari sana, jadi ringkasan mingguan Jumat
tidak memotongnya. Ringkasan pagi yang pertama kali dikirim menulis "Ini ringkasan pagi pertama
dari AISA. Dalam 24 jam terakhir masuk _N_ proposal baru." Isinya per grade dengan judul tebal:

- **Sangat layak (n)**, **Layak bersyarat (n)**, **Perlu penyesuaian (n)**, **Risiko tinggi
  (n)**, **Tidak layak (n)**, berurutan dari grade tertinggi.
- Dalam satu grade, proposal yang sesuai fokus disebut lebih dulu; proposal di luar fokus ditandai
  "(di luar fokus)". **Risiko tinggi** dan **Tidak layak** hanya berisi jumlah, tanpa nama.
- Bila ada proposal di luar fokus, ada baris "_N_ di antaranya di luar fokus (sektor, tahap, atau
  dana): prioritas rendah."
- **Perlu dicek manual (n)**: hanya muncul bila ada, berisi nama (mis. Lumbung Ikan Pesisir).
- Baris terakhir diawali **Yang menarik:**, satu fakta dari data (mis. tren sektor atau jumlah
  proposal baru dengan grade teratas).

Hanya proposal **belum ditanggapi** yang dihitung.

**Yang seharusnya terlihat (mingguan, Jumat 17.00):** "Selamat sore, Pak. Ini ringkasan mingguan
AISA, _Senin_–_hari ini_ _bulan_ _tahun_." lalu bagian-bagian berjudul tebal (`*…*` di WhatsApp):

- **Proposal masuk**: jumlah minggu ini (Senin 00.00 WIB sampai saat kirim), dengan jumlah minggu
  lalu (Senin–Minggu penuh) dan naik/turun/sama.
- **Sektor**: paling banyak tiga sektor dengan persen dan jumlah, mis. "F&B 40% (4 dari 10)", plus
  jumlah tanpa sektor bila ada.
- **Grade** (_n_ dinilai): jumlah per grade dari proposal minggu ini yang sudah dinilai, lalu
  "Sangat layak + Layak bersyarat: _n_ · di luar fokus: _p_% (_n_ dari _m_)".
- **Rata-rata skor** minggu ini dibanding minggu lalu.
- **Keputusan minggu ini**: Setuju _n_ · Tolak _n_, lalu "Menunggu keputusan: _n_ (terlama _d_
  hari)". Angka menunggu mencakup semua proposal yang belum diputuskan, bukan hanya yang masuk
  minggu ini.
- **Top 3 minggu ini**: nama · grade · skor, urut grade, yang sesuai fokus lebih dulu, lalu skor.
- **Perlu dicek manual**: jumlah minggu ini.
- Baris **Yang menarik:** berisi satu fakta yang dihitung kode, mis. sektor terbanyak minggu ini,
  perubahan jumlah masuk dibanding minggu lalu, porsi di luar fokus, atau jumlah yang masih
  menunggu keputusan.

Cocokkan: jumlah proposal masuk sama dengan proposal di halaman **Proposal** yang tanggal masuknya
sejak Senin, dan jumlah Setuju dan Tolak sama dengan keputusan minggu ini di **Riwayat**.

Untuk keduanya: ringkasan tidak berisi saran (tidak menyuruh menyetujui atau menolak). Cek: setiap
angka dan nama sama dengan dashboard; tidak ada angka yang tidak bisa Anda temukan di dashboard.
Saat AISA dijeda, ringkasan tetap dikirim, tetapi memakai teks bawaan tanpa dirapikan AI.
**Kalau berbeda:** angka atau nama yang tidak cocok dicatat beserta jam ringkasannya. Bila baris
**Yang menarik:** tidak ada, catat juga.

### UC-WA-21 · Ringkasan tercatat di Riwayat

**Situasi:** Anda ingin membaca ulang ringkasan yang sudah terkirim.
**Sebelum mulai:** minimal satu ringkasan sudah terkirim.
**Langkah:**

1. Di sidebar **Ruang kerja**, klik **Riwayat**.
2. Klik tab **Ringkasan WA**.
3. Di baris ringkasan harian (09.00) atau ringkasan mingguan (17.00 Jumat) yang terkirim, klik
   **Lihat isi**.

**Yang seharusnya terlihat:** baris berbunyi "Ke WhatsApp · _M_ proposal menunggu keputusan"
(ditambah "· template" bila teksnya teks bawaan). **Lihat isi** membuka jumlah per grade (termasuk jumlah di luar fokus),
kalimat "Yang menarik", dan teks pesan lengkap; isinya sama dengan pesan di WA. Untuk melihat
bentuk pesan sebelum jam kirim, buka **Pengaturan** → **Ringkasan WhatsApp** → **Pratinjau
pesan**.
**Kalau berbeda:** bila teks di Riwayat beda dengan pesan WA, catat.

### UC-WA-22 · Keputusan lewat WA terlihat di dashboard

**Situasi:** Anda ingin memastikan semua yang dikirim lewat WA tercatat di dashboard.
**Sebelum mulai:** sudah menjalankan minimal satu perintah ⚠️ di atas (mis. UC-WA-05, UC-WA-11).
**Langkah:**

1. Di sidebar **Ruang kerja**, klik **Riwayat**.
2. Ubah pilihan **Kanal** dari **Semua kanal** menjadi **Lewat WhatsApp**.
3. Lihat kotak **Kanal keputusan** di samping.
4. Di sidebar **Ruang kerja**, klik **Aktivitas AI**.

**Yang seharusnya terlihat:** langkah 2: hanya kejadian via WhatsApp (keputusan, koreksi,
STOP/LANJUT) yang tersisa, masing-masing dengan keterangan "via WhatsApp". Langkah 3: persentase
**WhatsApp** naik sesuai jumlah keputusan lewat WA. Langkah 4: setiap perintah tercatat sebagai
pekerjaan **Perintah** (mis. "Perintah: setuju UJI Satu"; kata lama seperti `arsipkan …` tidak membuat kartu), dan setiap pertanyaan sebagai
**Asisten**.
**Kalau berbeda:** perintah yang dibalas "Tercatat" tetapi tidak ada di Riwayat dicatat.

### UC-WA-23 · Nomor yang tidak terdaftar

**Situasi:** orang lain mengirim pesan ke bot AISA.
**Sebelum mulai:** ponsel dengan nomor yang **bukan** nomor manajer terdaftar.
**Langkah:**

1. Dari nomor itu, kirim `STOP` lalu `Berapa proposal yang ada?` ke +62 877-8116-8546.

**Yang seharusnya terlihat:** tidak ada balasan sama sekali, dan AISA tidak dijeda (cek
**Pengaturan** → **Integrasi** tetap **Berjalan**). Pesan di grup WhatsApp juga diabaikan.
**Kalau berbeda:** bila nomor asing dibalas atau bisa men-STOP, itu bug keamanan.

---

## Google Form founder

Form dipasang mengikuti [setup-google-form.md](../../how-to/setup-google-form.md). Minta link
form ke tim. Form berisi pemberitahuan tujuan dan lima pertanyaan: **Nama startup**, **Nama
founder**, **Email founder**, **Persetujuan**, dan **Pitch deck (PDF)** (satu PDF, maks 10 MB).

### UC-FRM-01 · Founder mengirim proposal lewat Google Form ⚠️

**Situasi:** seorang founder mengisi form dan Anda ingin melihat proposalnya dinilai.
**Sebelum mulai:** link form dari tim; PDF proposal berteks yang belum pernah dikirim (boleh
PDF sintetis). AISA tidak dijeda.
**Langkah:**

1. Buka link form, isi **Nama startup** `UJI Form Satu`, nama dan email founder (boleh email
   Anda), centang **Persetujuan**, unggah PDF, klik **Submit**.
2. Di dashboard, sidebar **Ruang kerja** → **Proposal**. Muat ulang setiap 20–30 detik.
3. Klik **UJI Form Satu**.

**Yang seharusnya terlihat:** proposal muncul mula-mula **Antre**, lalu **Sedang dinilai**, lalu
**Dinilai** dalam sekitar satu menit, dengan skor kualitas dan grade. Daftar **Proposal** perlu
dimuat ulang, tetapi halaman detail yang dibuka selagi **Antre** atau **Sedang dinilai** memperbarui
dirinya sendiri setiap beberapa detik (paling lama sekitar lima menit). Di detail, kartu founder
menampilkan nama dan email, tombol **Email**, dan baris "Form · _nama berkas_ · _N_ halaman".
Di **Riwayat** muncul "UJI Form Satu **mengirim proposal**" lalu "AISA selesai menilai UJI Form
Satu". Proposal ini juga ikut dihitung di ringkasan berikutnya dan bisa ditanyakan ke Tanya AISA.
Setelah selesai, hapus dengan **Hapus data**. Hapus data menghapus proposal dari AISA, tetapi
tidak menghapus respons di Google Form maupun berkasnya di Google Drive; hapus keduanya sendiri
di Google.
**Kalau berbeda:** bila proposal tidak muncul sama sekali, atau tertahan **Antre** dengan alasan
`404 Not Found`, ikuti tabel "Bila ada masalah" di panduan setup form.

### UC-FRM-02 · Persetujuan wajib di form

**Situasi:** founder mencoba mengirim tanpa mencentang persetujuan.
**Sebelum mulai:** link form. Tidak ada data yang berubah.
**Langkah:**

1. Isi semua pertanyaan kecuali **Persetujuan**, lalu klik **Submit**.

**Yang seharusnya terlihat:** Google Form menolak dan menandai **Persetujuan** sebagai wajib
("Wajib. Proposal tanpa persetujuan tidak diproses."). Tidak ada proposal baru di dashboard.
**Kalau berbeda:** bila proposal tanpa persetujuan muncul di dashboard, itu bug serius.

### UC-FRM-03 · File yang sama dikirim ulang ⚠️

**Situasi:** founder tidak sabar dan mengirim form dua kali dengan PDF yang sama.
**Sebelum mulai:** UC-FRM-01 sudah dijalankan.
**Langkah:**

1. Buka link form lagi, isi **Nama startup** `UJI Form Satu`, unggah PDF yang sama, kirim.
2. Lihat daftar **Proposal**.

**Yang seharusnya terlihat:** AISA mengenali proposal form dari ID berkasnya di Google Drive,
bukan dari isi PDF. Setiap respons form baru menyimpan berkas Drive baru, jadi kiriman kedua
muncul sebagai proposal kedua bernama sama. Itu perilaku yang diharapkan; yang dicegah hanyalah
satu respons yang terkirim dua kali. Bandingkan dengan **Unggah proposal** di dashboard: PDF
yang isinya sama persis tidak membuat proposal baru: muncul toast "Proposal ini sudah pernah
diunggah. Membuka yang sudah ada." dan Anda dibawa ke proposal yang sudah ada.
Hapus proposal kedua dengan **Hapus data**.
**Kalau berbeda:** bila satu kali **Submit** menghasilkan dua proposal, catat.

### UC-FRM-04 · Melihat proposal yang perlu dicek manual

**Situasi:** Anda ingin tahu kenapa satu proposal tidak punya skor.
**Sebelum mulai:** ada proposal **Perlu dicek manual** (mis. Lumbung Ikan Pesisir). Hanya
membaca.
**Langkah:**

1. Di sidebar **Ruang kerja** → **Proposal**, klik **Lumbung Ikan Pesisir**.

**Yang seharusnya terlihat:** badge kuning **Perlu dicek manual** di bawah nama, disertai alasan
mis. "teks terlalu sedikit (0 karakter di 10 halaman)". Kotak **Skor kualitas** berisi "—" dan
"Tidak dinilai: proposal perlu dicek manual, tanpa skor dan grade." Tidak ada grade dan tidak
ada kartu **Grade kurang pas?**. Proposal ini tetap muncul di ringkasan WA pada baris
**Perlu dicek manual**.
**Kalau berbeda:** bila proposal ini punya skor atau grade, catat.

### UC-FRM-05 · Proposal hasil scan dibaca sebagai gambar ⚠️

**Situasi:** founder mengirim proposal hasil scan (gambar saja, tanpa teks yang bisa dipilih).
**Sebelum mulai:** buat PDF berisi gambar saja, mis. foto/tangkapan layar slide yang disimpan
sebagai PDF, sehingga teksnya tidak bisa diblok di pembaca PDF. Jaga ukurannya paling besar
15 MB dan 50 halaman.
**Langkah:**

1. Kirim lewat Google Form dengan **Nama startup** `UJI Scan` (atau lewat **Unggah proposal** di
   dashboard dengan nama yang sama).
2. Di dashboard, buka **Proposal** dan tunggu sekitar satu menit, lalu klik **UJI Scan**.

**Yang seharusnya terlihat:** karena teksnya tidak bisa diambil, AI membaca proposal sebagai
gambar dan menyalin teks yang terlihat di tiap halaman. Bila slide-nya terbaca, status akhirnya
**Dinilai** dengan skor dan grade seperti proposal biasa, dan kutipannya berasal dari teks
salinan itu. Di **Log penilaian** muncul langkah **AI membaca proposal sebagai gambar** (bertanda
**AI**) di antara **Memeriksa proposal bisa dibaca** dan **AI menilai 5 kriteria**. Status
**Perlu dicek manual** (tanpa skor dan grade, seperti UC-FRM-04) hanya muncul bila proposal
tetap tidak terbaca, dengan alasan "teks terlalu sedikit, juga setelah dibaca sebagai gambar
(…)", atau bila berkasnya lebih dari 15 MB atau 50 halaman, dengan alasan "… terlalu besar untuk
dibaca sebagai gambar (maks. 15 MB dan 50 halaman)". Hapus dengan **Hapus data** setelah
selesai.
**Kalau berbeda:** bila proposal kecil yang slide-nya jelas terbaca tetap menjadi Perlu dicek
manual, atau bila kutipan di **Nilai per kriteria** tidak ada di slide, catat.

### UC-FRM-06 · Proposal masuk saat AISA dijeda ⚠️

**Situasi:** founder mengirim form saat AI sedang dijeda.
**Sebelum mulai:** kirim `STOP` ke bot WA (UC-WA-16). Kembalikan dengan `LANJUT` di akhir.
**Langkah:**

1. Kirim form dengan **Nama startup** `UJI Form Jeda` dan PDF berteks yang baru.
2. Di **Proposal**, tunggu 1–2 menit.
3. Kirim `LANJUT` ke bot WA, tunggu sekitar satu menit, muat ulang **Proposal**.

**Yang seharusnya terlihat:** langkah 2: **UJI Form Jeda** muncul dan tetap **Antre**. Langkah 3:
proposal bergerak ke **Sedang dinilai** lalu **Dinilai**. Hapus dengan **Hapus data** setelah
selesai.
**Kalau berbeda:** bila proposal dinilai selama STOP, itu bug.
