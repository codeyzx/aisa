# AISA

AISA membantu satu manajer investasi memilah proposal startup: setiap proposal dinilai sekali saat masuk, lalu manajer yang memutuskan tanggapannya.

## Proposal dan penilaian

**Proposal**:
Satu pengajuan startup beserta pitch deck-nya, masuk lewat Form atau unggahan PDF di dashboard.
_Avoid_: deck (di teks dashboard), submission, lead

**Pitch deck**:
Berkas PDF yang dilampirkan founder; yang dinilai hanya teks per halamannya (untuk pitch deck hasil pindai, teks yang disalin AI dari gambarnya). Teks dashboard tidak memakai kata "deck": berkasnya disebut "proposal", atau "berkas proposal" bila yang dimaksud khusus PDF-nya (mis. **Unggah proposal**, **Pratinjau proposal**). Kata "pitch deck" tetap dipakai bot WhatsApp, pesan aisa-api, dan pertanyaan Google Form.
_Avoid_: deck (di teks dashboard), dokumen, file

**Skor kualitas**:
Angka 0–100 yang dihitung kode dari nilai 1–5 lima kriteria dan bobot aturan penilaian aktif.
_Avoid_: skor AI, rating

**Nilai kriteria**:
Angka 1–5 yang diberi Penilai untuk satu kriteria, selalu disertai kutipan halaman atau tanda "tidak disebut".
_Avoid_: skor kriteria

**Cek kecocokan**:
Pencocokan sektor, tahap pendanaan, dan besar dana proposal dengan tesis dana; butir yang tidak disebut dianggap gagal.
_Avoid_: filter, screening

**Aturan penilaian**:
Kumpulan bobot, patokan nilai, aturan kecocokan, dan batas kategori yang berlaku; berversi dan diubah manajer di halaman Aturan penilaian (`/aturan`).
_Avoid_: rubrik (untuk keseluruhan), config, Sheets

**Kategori**:
Salah satu dari Sangat cocok, Cocok, Kurang cocok, Tidak cocok — ditentukan kode dari skor kualitas dan cek kecocokan.
_Avoid_: label, tier, status

**Berkualitas, di luar fokus**:
Tanda pada proposal Tidak cocok yang gagal cek kecocokan tetapi skor kualitasnya ≥ 65.
_Avoid_: kategori tersendiri

**Perlu dicek manual**:
Status proposal yang tidak bisa dinilai (teks terlalu sedikit atau penilaian gagal validasi); tidak punya skor maupun kategori.
_Avoid_: kategori, error

## Tanggapan manajer

**Tanggapan**:
Keputusan manajer atas proposal: undang, pantau, atau arsipkan. Proposal bertanggapan tidak lagi muncul di ringkasan.
_Avoid_: aksi, keputusan AI, follow-up

**Belum ditanggapi**:
Proposal yang belum pernah diberi tanggapan, termasuk yang kategorinya sudah dikoreksi.
_Avoid_: baru, pending

**Koreksi kategori**:
Penggantian kategori oleh manajer dengan alasan; kategori asli dan skor kualitas tetap tersimpan, dan koreksi bukan tanggapan.
_Avoid_: override, ubah skor

**Kategori efektif**:
Kategori hasil koreksi bila ada, selain itu kategori dari kode; inilah yang dipakai ringkasan dan dashboard.

**Dijeda**:
Keadaan setelah perintah STOP: pekerjaan AI berhenti di antara langkah, proposal baru menunggu sebagai Antre, dan Asisten tidak menjawab sampai perintah LANJUT.
_Avoid_: dimatikan, dibatalkan

## Data pribadi

**Penghapusan data**:
Penghapusan proposal beserta teks dan berkas proposalnya atas permintaan founder, dengan alasan; Riwayat tetap ada tetapi tanpa nama dan isi proposal.
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
