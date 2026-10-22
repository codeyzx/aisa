# AISA: Asisten AI untuk Manajer Investasi

## Ringkasan

AISA membantu manajer investasi memilah proposal startup yang masuk setiap hari. Setiap proposal dinilai **satu kali saat masuk**: kualitasnya diberi skor 0–100 dengan bukti halaman, lalu dicek kecocokannya dengan fokus investasi. Pukul **09.00 dan 17.00**, manajer menerima ringkasan di WhatsApp yang mengelompokkan proposal per grade. Detail, tren, insight, dan log aktivitas AI ada di dashboard, dan manajer bisa bertanya ke asisten kapan saja.

AI hanya menilai dan mengelompokkan. Keputusan mengundang, memantau, atau mengarsipkan proposal sepenuhnya di tangan manajer.

## Masalah

Perusahaan investasi bisa menerima puluhan sampai ratusan proposal per hari. Proposal bagus bisa terlewat, waktu habis untuk proposal yang tidak sesuai fokus, gambaran besar sulit dilihat, dan riwayat tanggapan sulit dicari.

## Tujuan

1. Memilah proposal otomatis dengan skor, alasan, dan bukti halaman.
2. Memberi gambaran harian yang cepat dipahami lewat WhatsApp.
3. Menyajikan tren dan insight untuk membantu keputusan.
4. Menjadi asisten yang bisa ditanya tentang data proposal dan dimintai saran.
5. Menjaga keputusan di tangan manusia dan patuh pada pelindungan data pribadi.

---

## Cara kerja

### 1. Proposal masuk

Founder mengisi Google Form yang hanya meminta data yang diperlukan, membaca pemberitahuan tujuan, memberi persetujuan, dan mengunggah pitch deck ke Google Drive.

### 2. Ekstraksi teks

Teks diambil di server **per halaman** dengan penanda `[hal. n]`. Biasanya hanya teks yang dikirim ke model. Deck dengan teks terlalu sedikit (scan atau gambar) dibaca AI sebagai gambar: PDF-nya dikirim ke model untuk menyalin teks yang terlihat di tiap halaman, lalu dinilai seperti biasa. Deck yang tetap tidak terbaca, atau lebih dari 15 MB atau 50 halaman, berstatus **Perlu dicek manual** tanpa skor.

### 3. Penilaian: kualitas dulu, baru kecocokan

**Tahap 1 — Skor kualitas (AI).** Penilai memberi nilai 1–5 untuk lima kriteria, masing-masing dengan kutipan halaman:

| Kriteria                                    | Yang dinilai                                                                                                                       | Bobot baseline |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **A.** Tim manajemen                        | Rekam jejak, pengalaman, dan kelengkapan tim pendiri dan manajemen                                                                 | 25%            |
| **B.** Kinerja bisnis saat ini              | Bukti bisnis sudah berjalan: pendapatan, pengguna, pertumbuhan, pelanggan yang disebut namanya                                     | 20%            |
| **C.** Risiko bisnis & tren makro           | Seberapa terkendali risikonya (persaingan, regulasi, ketergantungan) dan apakah tren pasar mendukung; nilai tinggi = risiko rendah | 20%            |
| **D.** Rencana bisnis & potensi imbal hasil | Penggunaan dana, proyeksi berdasar data, unit ekonomi, potensi imbal hasil bagi investor                                           | 25%            |
| **E.** Potensi dampak                       | Dampak sosial atau lingkungan yang terukur (mis. lapangan kerja, inklusi, emisi)                                                   | 10%            |

| Nilai | Arti                                                   |
| ----- | ------------------------------------------------------ |
| 1     | Tidak ada bukti, atau bukti bertentangan               |
| 3     | Ada bukti sebagian                                     |
| 5     | Bukti kuat: data, perilaku pelanggan, atau rekam jejak |

Informasi yang tidak ada diberi nilai 1 dan ditandai **"tidak disebut"**. Skor dihitung dengan kode: `skor = Σ bobot × (nilai − 1) / 4 × 100`, satu desimal. Bila tidak ada satu pun kutipan sebuah kriteria yang bisa ditemukan di halaman yang disebut, nilainya dibatasi paling tinggi 2 dan dashboard menampilkan tanda **kutipan tidak terverifikasi**.

**Grade (kode), dari skor saja.** Batasnya diatur di halaman **Aturan penilaian**; nilai bawaannya:

| Skor   | Grade                 | Aksi                          |
| ------ | --------------------- | ----------------------------- |
| 85–100 | **Sangat layak**      | Lanjutkan investasi           |
| 75–84  | **Layak bersyarat**   | Investasi dengan syarat       |
| 65–74  | **Perlu penyesuaian** | Sesuaikan dulu sebelum lanjut |
| 50–64  | **Risiko tinggi**     | Pertimbangkan menolak         |
| < 50   | **Tidak layak**       | Tolak                         |

**Tahap 2 — Cek kecocokan (kode, tanpa AI dan tanpa token).** Sektor, tahap pendanaan, dan besar dana dicocokkan dengan aturan yang diatur manajer di halaman **Aturan penilaian** dashboard (disimpan di Firestore). Keputusan: butir yang **tidak disebut** di deck dianggap **gagal** cek, karena kecocokan yang tidak bisa dibuktikan tidak boleh dianggap cocok.

Proposal yang gagal cek kecocokan diberi label **Di luar fokus**: prioritas rendah karena tidak sesuai fokus investasi (sektor, tahap, atau dana), jadi risikonya lebih tinggi untuk portofolio. Label ini tidak mengubah grade, dan dashboard menyebut butir mana yang gagal (mis. "Sektor f&b di luar fokus"). Di daftar proposal, ringkasan, dan Asisten, urutannya: grade, lalu yang sesuai fokus lebih dulu, lalu skor.

**Perlu dicek manual** adalah status, bukan grade.

### 4. Ringkasan pukul 09.00 dan 17.00

Ringkasan berisi proposal **yang belum ditanggapi**, dikelompokkan per grade (proposal di luar fokus ditandai "(di luar fokus)"), **tanpa saran tindak lanjut**:

Salam pembuka mengikuti jam kirim (Selamat pagi/siang/sore/malam), dengan nama manajer bila diatur. Setiap ringkasan memuat tepat satu insight, 1–2 kalimat, diawali label "Yang menarik:". Faktanya dipilih dan dihitung kode: tren sektor minggu ini dibanding minggu lalu bila ada sektor dengan minimal 3 proposal; bila tidak, fakta pertama yang berlaku dari urutan tetap: berapa proposal baru yang masuk grade teratas, rata-rata skor kualitas minggu ini dibanding minggu lalu, jumlah proposal yang perlu perhatian (mis. Perlu dicek manual) yang belum ditanggapi, proposal belum ditanggapi dengan skor tertinggi, lalu berapa proposal yang sudah ditanggapi. Insight hanya kosong bila belum ada proposal sama sekali.

> _Selamat pagi, Pak Budi. Sejak Senin pukul 17.00 masuk 100 proposal baru. Ada 100 proposal yang belum Pak tanggapi._
>
> _**Sangat layak (4)**_
> _1. Tani Maju (agritech, Rp5 M) · 93. Pendapatannya tumbuh tiap kuartal dan timnya berpengalaman._
> _…_
> _**Layak bersyarat (8):** SawahKu (78), Kopi Rakyat (79) (di luar fokus), …_
> _**Perlu penyesuaian (20)**_
> _**Risiko tinggi (21)**_
> _**Tidak layak (45)**_
> _**Perlu dicek manual (2):** Bengkel Online, Rumah Belajar_
>
> _Yang menarik: proposal agritech naik 76% dibanding minggu lalu._

### 5. Menanggapi proposal

Manajer menandai proposal lewat WhatsApp atau dashboard:

| Perintah                                              | Hasil                                  |
| ----------------------------------------------------- | -------------------------------------- |
| `undang <nama>` · `pantau <nama>` · `arsipkan <nama>` | Status proposal berubah                |
| `arsipkan semua tidak layak`                          | Tanggapan massal per grade             |
| `pindahkan <nama> ke layak bersyarat karena …`        | Koreksi grade; skor AI tetap tersimpan |
| `STOP` · `LANJUT`                                     | Menjeda dan melanjutkan pekerjaan AI   |

**STOP** berhenti di antara langkah: panggilan model yang sedang berjalan diselesaikan, lalu hasilnya dibuang. Proposal baru menunggu sampai `LANJUT`, dan selama dijeda Asisten tidak menjawab; pesan selain perintah dibalas "AISA sedang dijeda".

### 6. Asisten

Contoh: "Fintech yang sangat layak", "Yang skornya tinggi tapi di luar fokus", "Kenapa skor Panen Kita segitu?", "Bandingkan Tani Maju dan SawahKu", "Buatkan pertanyaan untuk founder Tani Maju", "Berapa yang minta di bawah Rp3 M?". Jawaban data hanya dari data AISA: setiap angka, nama, dan kutipan disalin dari hasil tool pada giliran itu, tanpa menaksir atau menghitung angka baru. Prioritas, penilaian risiko, rekomendasi, dan draft pesan adalah saran, dan seluruh bagian itu berada di bawah label "💡 Saran AI". AISA tidak mengirim pesan ke founder.

### 7. Dashboard

**Dashboard** · **Proposal** (filter, detail Tahap 1 dan Tahap 2, kutipan halaman, token per proposal) · **Tren** · **Aktivitas AI** · **Biaya AI** · **Riwayat** · **Aturan penilaian** (lihat dan ubah bobot, patokan nilai, cek kecocokan, batas skor grade, dan model, dengan pratinjau dampak sebelum disimpan; dasar baseline; kalibrasi) · **Pengaturan** (profil, tampilan, ringkasan WhatsApp, integrasi dengan STOP/LANJUT, privasi dan retensi). Panel **Tanya AISA** di setiap halaman bertanya ke Asisten yang sama dengan WhatsApp, dengan tools baca saja. Tombol **Unggah pitch deck** (PDF) memasukkan proposal lewat alur penilaian yang sama dengan Form. Tombol **Hapus data** di detail proposal menghapusnya atas permintaan founder, dengan alasan wajib.

---

## Aktivitas AI

Setiap pekerjaan agent (misalnya "Menilai proposal Tani Maju" atau "Ringkasan 09.00") tampil sebagai satu kartu:

- **Kepala kartu:** nama agent, **nama model** (mis. `gemini-3.8-flash`), waktu, jumlah langkah, total token masuk/keluar, durasi, dan status.
- **Isi kartu:** tabel langkah dengan format seragam **waktu · aksi · tool · data dibaca/ditulis · token masuk/keluar · durasi · status**.
- Langkah yang dikerjakan kode (hitung skor, cek kecocokan) diberi label "(kode)" dengan token 0, sehingga terlihat jelas bagian mana yang memakai AI.

Di bagian atas ada ringkasan pemakaian: total token, rata-rata token per proposal dan per ringkasan, jumlah panggilan model, serta grafik token per hari. Token diambil dari `usage_metadata` setiap respons model. Dari detail proposal, tombol "Lihat log penilaian" langsung membuka kartu penilaiannya.

Halaman **Biaya AI** mengubah token itu menjadi perkiraan biaya: token × harga resmi Vertex AI pada tanggal pemakaiannya (`features/aisa/aisa.pricing.ts`, dengan sumber dan tanggal pengambilan), ditampilkan dalam USD dan rupiah dengan kurs acuan JISDOR. Isinya total biaya sejak pencatatan mulai, rata-rata biaya per proposal dinilai, per pertanyaan Asisten, dan per ringkasan WhatsApp, bagian kredit uji coba $300 yang setara, rincian per agent dan token masuk vs keluar, grafik biaya per hari, serta kalkulator **AISA vs cek manual** yang asumsinya (proposal per bulan, menit per deck, menit membaca hasil AISA, gaji analis, jam kerja) bisa diubah dan tersimpan di URL. Total dan grafik dari `dailyStats`, rata-rata dari `jobs`. Halaman ini tidak menghitung Memory Bank, komputasi Agent Runtime, atau panggilan model di luar aplikasi, dan angkanya perkiraan, bukan tagihan.

## Model

**Prioritas pertama: sistem berjalan lancar.** Untuk tahap awal, semua agent AI memakai model stabil yang sama, **`gemini-3.8-flash`**. Model ini tercantum sebagai rilis stabil di daftar model Gemini saat ini. Bila kualitas penilaian kurang, Penilai bisa dinaikkan ke `gemini-3.1-pro-preview`, tetapi model itu masih berstatus preview. Optimasi efisiensi, misalnya memindahkan agent ringan ke `gemini-3.5-flash-lite`, dilakukan setelah sistem stabil. Gemini 3.x dipanggil di lokasi `global`, satu-satunya lokasi yang melayaninya untuk project ini. Model Penilai, Pembuat ringkasan, dan Insight diatur di Pengaturan; model Asisten ditetapkan saat deploy ke Agent Runtime.

Prinsip yang tetap berlaku sejak awal: setiap deck dinilai sekali, dan semua angka dihitung dengan kode.

| Agent             | Tugas                                                        | Model awal       |
| ----------------- | ------------------------------------------------------------ | ---------------- |
| Penilai           | Menilai 5 kriteria kualitas dengan kutipan halaman           | gemini-3.8-flash |
| Pembuat ringkasan | Menyusun teks ringkasan per grade                            | gemini-3.8-flash |
| Insight           | Menulis insight 1–2 kalimat dari angka yang dihitung kode    | gemini-3.8-flash |
| Asisten           | Menjawab pertanyaan dan memberi saran dengan tools baca data | gemini-3.8-flash |
| Orchestrator      | Perintah dikenali kode, tanpa model; pesan lain ke Asisten   | (kode)           |

---

## Dasar bobot (baseline)

Lima kriteria A–E dan bobot bawaannya mengikuti **panduan scorecard bergaya Arunami** yang diadopsi tim: A Tim manajemen 25, B Kinerja bisnis saat ini 20, C Risiko bisnis & tren makro 20, D Rencana bisnis & potensi imbal hasil 25, E Potensi dampak 10. Pembagian lima grade menurut rentang skor juga mengikuti panduan yang sama.

- **Penyesuaian:** manajer bisa mengubah bobot di halaman **Aturan penilaian** dashboard sesuai tesis dananya; setiap perubahan dicatat dengan alasan dan versinya di Riwayat.
- **Kalibrasi dari koreksi manajer:** proposal dihitung "ditinjau manajer" setelah diberi tanggapan atau koreksi grade. AI "sepakat" bila manajer membiarkan grade AI. Halaman Aturan penilaian menampilkan tingkat kesepakatan ("AI sepakat dengan manajer pada X dari Y proposal yang ditinjau") dan daftar koreksi beserta arahnya (naik/turun) dan alasannya, sebagai bahan untuk menyesuaikan bobot dan patokan. Koreksi tidak pernah mengubah grade atau skor AI yang tersimpan.
- **Kalibrasi analis:** 10–20 deck lama dinilai 2–3 analis dengan matriks yang sama, lalu dashboard menampilkan tingkat kesepakatan AI dengan analis. Bagian ini masih kosong karena datanya belum ada.
- **Keterbatasan:** panduan scorecard ini bukan standar resmi VC, dan cara Penilai menerapkan tiap kriteria pada isi deck adalah interpretasi tim.

---

## Pelindungan data pribadi (UU 27/2022 Pasal 16 ayat 2)

| Status           | Butir | Penerapan                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sudah dirancang  | a     | Form minimal, pemberitahuan tujuan, dan persetujuan                                                                                                                                                                                                                                                                          |
| Sudah dirancang  | b     | Data hanya untuk menyaring proposal, tidak untuk melatih model                                                                                                                                                                                                                                                               |
| Sudah dirancang  | d     | Setiap nilai ada kutipan halaman; informasi yang tidak ada ditandai                                                                                                                                                                                                                                                          |
| Sudah dirancang  | g     | Hapus atas permintaan founder (dashboard atau CLI, alasan wajib) dan retensi harian: proposal yang diarsipkan lebih lama dari periode retensi (default 90 hari) dihapus otomatis. Yang dihapus: proposal, teks deck, file deck, log pekerjaannya, dan konfirmasi tertunda; baris Riwayat disamarkan dan penghapusan tercatat |
| Sudah dirancang  | h     | Log Aktivitas AI dan Riwayat sebagai jejak audit                                                                                                                                                                                                                                                                             |
| Rencana lanjutan | c     | Hak akses, perbaikan, dan penghapusan data; keputusan akhir tetap manusia (Pasal 10)                                                                                                                                                                                                                                         |
| Sebagian         | e     | Hanya teks yang dikirim ke model (kecuali deck hasil pindai, yang PDF-nya dibaca sebagai gambar) sudah berjalan; masking dan pembatasan akses berikutnya                                                                                                                                                                     |
| Rencana lanjutan | f     | Pemberitahuan privasi dan notifikasi kebocoran maksimal 3×24 jam (Pasal 46)                                                                                                                                                                                                                                                  |

## Teknologi

Google Forms dan Drive (dipicu Apps Script) · ekstraksi teks di Cloud Run · Google ADK + Gemini · Agent Runtime, Sessions, dan Memory Bank untuk asisten · Cloud Scheduler 09.00 dan 17.00 WIB serta retensi 02.00 WIB · Firestore · aturan penilaian di Firestore (diatur lewat halaman Aturan penilaian) · Secret Manager · GOWA di VPS · dashboard di Cloud Run.

## Batasan hackathon

**Tidak termasuk:** saran tindak lanjut otomatis, analisis mendalam dan memo, due diligence, banyak pengguna, audio, masking dokumen (dikerjakan terpisah), pencarian internet, pengiriman pesan ke founder, serta butir PDP c, e (sebagian), dan f.
