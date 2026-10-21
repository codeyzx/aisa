# AISA: Asisten AI untuk Manajer Investasi

## Ringkasan

AISA membantu manajer investasi memilah proposal startup yang masuk setiap hari. Setiap proposal dinilai **satu kali saat masuk**: kualitasnya diberi skor 0–100 dengan bukti halaman, lalu dicek kecocokannya dengan fokus investasi. Pukul **09.00 dan 17.00**, manajer menerima ringkasan di WhatsApp yang mengelompokkan proposal per kategori. Detail, tren, insight, dan log aktivitas AI ada di dashboard, dan manajer bisa bertanya ke asisten kapan saja.

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

Teks diambil di server **per halaman** dengan penanda `[hal. n]`. Hanya teks yang dikirim ke model; gambar dan PDF tidak. Deck dengan teks terlalu sedikit (scan atau gambar) berstatus **Perlu dicek manual**, tanpa OCR dan tanpa skor.

### 3. Penilaian: kualitas dulu, baru kecocokan

**Tahap 1 — Skor kualitas (AI).** Penilai memberi nilai 1–5 untuk lima kriteria, masing-masing dengan kutipan halaman:

| Kriteria                | Bobot baseline |
| ----------------------- | -------------- |
| Tim                     | 27,5%          |
| Pasar & masalah         | 30%            |
| Produk & keunggulan     | 20%            |
| Traksi                  | 12,5%          |
| Model bisnis & keuangan | 10%            |

| Nilai | Arti                                                   |
| ----- | ------------------------------------------------------ |
| 1     | Tidak ada bukti, atau bukti bertentangan               |
| 3     | Ada bukti sebagian                                     |
| 5     | Bukti kuat: data, perilaku pelanggan, atau rekam jejak |

Informasi yang tidak ada diberi nilai 1 dan ditandai **"tidak disebut"**. Skor dihitung dengan kode: `skor = Σ bobot × (nilai − 1) / 4`. Bila tidak ada satu pun kutipan sebuah kriteria yang bisa ditemukan di halaman yang disebut, nilainya dibatasi paling tinggi 2 dan dashboard menampilkan tanda **kutipan tidak terverifikasi**.

**Tahap 2 — Cek kecocokan (kode, tanpa AI dan tanpa token).** Sektor, tahap pendanaan, dan besar dana dicocokkan dengan aturan yang diatur manajer di halaman **Pengaturan** dashboard (disimpan di Firestore). Keputusan: butir yang **tidak disebut** di deck dianggap **gagal** cek, karena kecocokan yang tidak bisa dibuktikan tidak boleh dianggap cocok.

**Kategori:**

| Kondisi                                                          | Kategori                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Lulus cek, skor ≥ 80, dan tidak ada kriteria bernilai 1          | **Sangat cocok**                                                                  |
| Lulus cek, skor 65–79 (atau ≥ 80 tetapi ada kriteria bernilai 1) | **Cocok**                                                                         |
| Lulus cek, skor 45–64                                            | **Kurang cocok**                                                                  |
| Lulus cek, skor < 45                                             | **Tidak cocok**                                                                   |
| Gagal cek kecocokan                                              | **Tidak cocok**, dan bila skor ≥ 65 diberi tanda **"Berkualitas, di luar fokus"** |

**Perlu dicek manual** adalah status, bukan kategori.

### 4. Ringkasan pukul 09.00 dan 17.00

Ringkasan berisi proposal **yang belum ditanggapi**, dikelompokkan per kategori, **tanpa saran tindak lanjut**:

Salam pembuka mengikuti jam kirim (Selamat pagi/siang/sore/malam), dengan nama manajer bila diatur. Insight ditulis 1–2 kalimat dan selalu diawali label "Yang menarik:".

> _Selamat pagi, Bu Rina. Sejak Senin pukul 17.00 masuk 100 proposal baru. Ada 100 proposal yang belum Ibu tanggapi._
>
> _**Sangat cocok (4)**_
> _1. Tani Maju (agritech, Rp5 M) · 93. Pendapatannya tumbuh tiap kuartal dan timnya berpengalaman._
> _…_
> _**Cocok (8):** SawahKu (66), …_
> _**Kurang cocok (41)**_
> _**Tidak cocok (45)**_
> _**Berkualitas, di luar fokus (2):** Kopi Rakyat (79) · F&B di luar sektor fokus …_
> _**Perlu dicek manual (2):** Bengkel Online, Rumah Belajar_
>
> _Yang menarik: proposal agritech naik 76% dibanding minggu lalu._

### 5. Menanggapi proposal

Manajer menandai proposal lewat WhatsApp atau dashboard:

| Perintah                                              | Hasil                                     |
| ----------------------------------------------------- | ----------------------------------------- |
| `undang <nama>` · `pantau <nama>` · `arsipkan <nama>` | Status proposal berubah                   |
| `arsipkan semua tidak cocok`                          | Tanggapan massal per kategori             |
| `pindahkan <nama> ke cocok karena …`                  | Koreksi kategori; skor AI tetap tersimpan |
| `STOP` · `LANJUT`                                     | Menjeda dan melanjutkan pekerjaan AI      |

**STOP** berhenti di antara langkah: panggilan model yang sedang berjalan diselesaikan, lalu hasilnya dibuang. Proposal baru menunggu sampai `LANJUT`, dan selama dijeda Asisten tidak menjawab; pesan selain perintah dibalas "AISA sedang dijeda".

### 6. Asisten

Contoh: "Fintech yang sangat cocok", "Yang berkualitas tapi di luar fokus", "Kenapa skor Panen Kita segitu?", "Bandingkan Tani Maju dan SawahKu", "Buatkan pertanyaan untuk founder Tani Maju". Jawaban data hanya dari data AISA, saran berbasis pengetahuan umum ditandai jelas, dan AISA tidak mengirim pesan ke founder.

### 7. Dashboard

**Hari ini** · **Proposal** (filter, detail Tahap 1 dan Tahap 2, kutipan halaman, token per proposal) · **Tren** · **Aktivitas AI** · **Riwayat** · **Pengaturan** (lihat dan ubah aturan penilaian: bobot, dasar baseline, patokan nilai, cek kecocokan, kategori, model, retensi, kalibrasi). Tombol **Unggah pitch deck** (PDF) memasukkan proposal lewat alur penilaian yang sama dengan Form. Tombol **Hapus data** di detail proposal menghapusnya atas permintaan founder, dengan alasan wajib.

---

## Aktivitas AI

Setiap pekerjaan agent (misalnya "Menilai proposal Tani Maju" atau "Ringkasan 09.00") tampil sebagai satu kartu:

- **Kepala kartu:** nama agent, **nama model** (mis. `gemini-3.8-flash`), waktu, jumlah langkah, total token masuk/keluar, durasi, dan status.
- **Isi kartu:** tabel langkah dengan format seragam **waktu · aksi · tool · data dibaca/ditulis · token masuk/keluar · durasi · status**.
- Langkah yang dikerjakan kode (hitung skor, cek kecocokan) diberi label "(kode)" dengan token 0, sehingga terlihat jelas bagian mana yang memakai AI.

Di bagian atas ada ringkasan pemakaian: total token, rata-rata token per proposal dan per ringkasan, jumlah panggilan model, serta grafik token per hari. Token diambil dari `usage_metadata` setiap respons model. Dari detail proposal, tombol "Lihat log penilaian" langsung membuka kartu penilaiannya.

## Model

**Prioritas pertama: sistem berjalan lancar.** Untuk tahap awal, semua agent AI memakai model stabil yang sama, **`gemini-3.8-flash`**. Model ini tercantum sebagai rilis stabil di daftar model Gemini saat ini. Bila kualitas penilaian kurang, Penilai bisa dinaikkan ke `gemini-3.1-pro-preview`, tetapi model itu masih berstatus preview. Optimasi efisiensi, misalnya memindahkan agent ringan ke `gemini-3.5-flash-lite`, dilakukan setelah sistem stabil. Gemini 3.x dipanggil di lokasi `global`, satu-satunya lokasi yang melayaninya untuk project ini. Model Penilai, Pembuat ringkasan, dan Insight diatur di Pengaturan; model Asisten ditetapkan saat deploy ke Agent Runtime.

Prinsip yang tetap berlaku sejak awal: setiap deck dinilai sekali, dan semua angka dihitung dengan kode.

| Agent             | Tugas                                                        | Model awal       |
| ----------------- | ------------------------------------------------------------ | ---------------- |
| Penilai           | Menilai 5 kriteria kualitas dengan kutipan halaman           | gemini-3.8-flash |
| Pembuat ringkasan | Menyusun teks ringkasan per kategori                         | gemini-3.8-flash |
| Insight           | Menulis insight 1–2 kalimat dari angka yang dihitung kode    | gemini-3.8-flash |
| Asisten           | Menjawab pertanyaan dan memberi saran dengan tools baca data | gemini-3.8-flash |
| Orchestrator      | Perintah dikenali kode, tanpa model; pesan lain ke Asisten   | (kode)           |

---

## Dasar bobot (baseline)

Bobot berasal dari **rata-rata dua benchmark**, dengan rujukan tambahan dari survei Gompers dkk. (885 VC, 47% menyebut tim sebagai faktor terpenting):

| Kriteria                | Scorecard Method               | Hustle Fund (pre-seed)                        | Baseline  |
| ----------------------- | ------------------------------ | --------------------------------------------- | --------- |
| Tim                     | Tim 30                         | Tim 25                                        | **27,5%** |
| Pasar & masalah         | Peluang 25                     | Pasar 25 + insight 10                         | **30%**   |
| Produk & keunggulan     | Produk 15 + persaingan 10      | Produk 10 + keunggulan 5                      | **20%**   |
| Traksi                  | Kanal penjualan & kemitraan 10 | Traksi 10 + go-to-market 5                    | **12,5%** |
| Model bisnis & keuangan | Kebutuhan dana 5 + lainnya 5   | Unit economics 5 + kesiapan dana 3 + risiko 2 | **10%**   |

- **Penyesuaian:** manajer bisa mengubah bobot di halaman **Pengaturan** dashboard sesuai tesis dananya; setiap perubahan dicatat dengan alasan dan versinya di Riwayat.
- **Kalibrasi:** 10–20 deck lama dinilai 2–3 analis dengan matriks yang sama, lalu dashboard menampilkan tingkat kesepakatan AI dengan analis. Di prototype, bagian ini masih berupa tempat kosong karena datanya belum ada.
- **Keterbatasan:** kedua sumber adalah metode angel dan investor tahap awal, bukan standar resmi VC, dan pemetaan ke 5 kriteria AISA adalah interpretasi tim.

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
| Sebagian         | e     | Hanya teks yang dikirim ke model sudah berjalan; masking dan pembatasan akses berikutnya                                                                                                                                                                                                                                     |
| Rencana lanjutan | f     | Pemberitahuan privasi dan notifikasi kebocoran maksimal 3×24 jam (Pasal 46)                                                                                                                                                                                                                                                  |

## Teknologi

Google Forms dan Drive (dipicu Apps Script) · ekstraksi teks di Cloud Run · Google ADK + Gemini · Agent Runtime, Sessions, dan Memory Bank untuk asisten · Cloud Scheduler 09.00 dan 17.00 WIB serta retensi 02.00 WIB · Firestore · aturan penilaian di Firestore (diatur lewat halaman Pengaturan) · Secret Manager · GOWA di VPS · dashboard di Cloud Run.

## Batasan hackathon

**Tidak termasuk:** saran tindak lanjut otomatis, analisis mendalam dan memo, due diligence, banyak pengguna, audio, OCR, masking dokumen (dikerjakan terpisah), pencarian internet, pengiriman pesan ke founder, serta butir PDP c, e (sebagian), dan f.
