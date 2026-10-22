# AISA

AISA membantu satu manajer investasi memilah proposal startup: setiap proposal dinilai sekali saat masuk, lalu manajer yang memutuskan tanggapannya.

## Proposal dan penilaian

**Proposal**:
Satu pengajuan startup beserta pitch deck-nya, masuk lewat Form atau unggahan PDF di dashboard.
_Avoid_: deck (untuk proposal), submission, lead

**Pitch deck**:
Berkas PDF yang dilampirkan founder; yang dinilai hanya teks per halamannya (untuk deck hasil pindai, teks yang disalin AI dari gambarnya).
_Avoid_: dokumen, file

**Skor kualitas**:
Angka 0–100 yang dihitung kode dari nilai 1–5 lima kriteria (A–E) dan bobot aturan penilaian aktif.
_Avoid_: skor AI, rating

**Kriteria**:
Lima hal yang dinilai Penilai, berurutan A–E: Tim manajemen, Kinerja bisnis saat ini, Risiko bisnis & tren makro (nilai tinggi = risiko rendah dan tren mendukung), Rencana bisnis & potensi imbal hasil, Potensi dampak.
_Avoid_: tim, pasar, produk, traksi, model bisnis (kriteria skala lama)

**Nilai kriteria**:
Angka 1–5 yang diberi Penilai untuk satu kriteria, selalu disertai kutipan halaman atau tanda "tidak disebut".
_Avoid_: skor kriteria

**Cek kecocokan**:
Pencocokan sektor, tahap pendanaan, dan besar dana proposal dengan tesis dana; butir yang tidak disebut dianggap gagal.
_Avoid_: filter, screening

**Aturan penilaian**:
Kumpulan bobot, patokan nilai, aturan kecocokan, dan batas skor grade yang berlaku; berversi dan diubah manajer di halaman Aturan penilaian (`/aturan`).
_Avoid_: rubrik (untuk keseluruhan), config, Sheets

**Grade**:
Salah satu dari Sangat layak (skor 85–100), Layak bersyarat (75–84), Perlu penyesuaian (65–74), Risiko tinggi (50–64), Tidak layak (< 50) — ditentukan kode dari skor kualitas saja, dengan batas dari aturan penilaian. Disebut juga kategori (field `category`).
_Avoid_: tier, status, Sangat cocok/Cocok/Kurang cocok/Tidak cocok (skala lama)

**Di luar fokus**:
Label prioritas rendah pada proposal yang gagal cek kecocokan; grade-nya tidak berubah, tetapi dalam urutan ia ditaruh setelah proposal se-grade yang sesuai fokus.
_Avoid_: grade tersendiri, Berkualitas di luar fokus

**Perlu dicek manual**:
Status proposal yang tidak bisa dinilai (teks terlalu sedikit atau penilaian gagal validasi); tidak punya skor maupun kategori.
_Avoid_: kategori, error

## Tanggapan manajer

**Tanggapan**:
Keputusan manajer atas proposal: undang, pantau, atau arsipkan. Proposal bertanggapan tidak lagi muncul di ringkasan.
_Avoid_: aksi, keputusan AI, follow-up

**Belum ditanggapi**:
Proposal yang belum pernah diberi tanggapan, termasuk yang grade-nya sudah dikoreksi.
_Avoid_: baru, pending

**Koreksi grade**:
Penggantian grade oleh manajer dengan alasan; grade asli dari kode dan skor kualitas tetap tersimpan, dan koreksi bukan tanggapan.
_Avoid_: koreksi kategori, override, ubah skor

**Kategori efektif**:
Kategori hasil koreksi bila ada, selain itu kategori dari kode; inilah yang dipakai ringkasan dan dashboard.

**Dijeda**:
Keadaan setelah perintah STOP: pekerjaan AI berhenti di antara langkah, proposal baru menunggu sebagai Antre, dan Asisten tidak menjawab sampai perintah LANJUT.
_Avoid_: dimatikan, dibatalkan

## Data pribadi

**Penghapusan data**:
Penghapusan proposal beserta teks dan deck-nya atas permintaan founder, dengan alasan; Riwayat tetap ada tetapi tanpa nama dan isi proposal.
_Avoid_: arsipkan (arsip adalah tanggapan, bukan penghapusan)

**Retensi**:
Periode berapa lama proposal yang diarsipkan disimpan sebelum dihapus otomatis; diatur di Pengaturan, tab Privasi.
_Avoid_: kedaluwarsa, pembersihan

## Keluaran

**Ringkasan**:
Pesan WhatsApp pukul 09.00 dan 17.00 berisi proposal belum ditanggapi per kategori efektif, tanpa saran tindak lanjut.
_Avoid_: digest, laporan, notifikasi

**Pekerjaan**:
Satu unit kerja agent (mis. "Menilai proposal Tani Maju", "Ringkasan 09.00") yang tercatat sebagai satu kartu di Aktivitas AI, terdiri dari langkah-langkah.
_Avoid_: job, task, run

**Langkah**:
Satu baris dalam pekerjaan — dikerjakan model (dengan token) atau kode (token 0).
_Avoid_: step log, event
