# Panduan uji manual AISA

Panduan ini untuk Anda yang ingin menguji sendiri setiap fitur AISA, langkah demi langkah, persis
seperti yang terlihat di layar. Setiap use case berisi situasi, prasyarat, langkah klik demi klik,
apa yang seharusnya terlihat, dan apa artinya bila hasilnya berbeda.

## Sebelum mulai

- Buka dashboard produksi: https://aisa-dashboard-lk5jbo3eza-et.a.run.app dan masuk dengan akun
  admin dari tim (sandi tidak ditulis di sini).
- Use case bertanda ⚠️ mengubah data. Lakukan pada proposal uji yang Anda unggah sendiri dengan
  nama berawalan **UJI**, lalu hapus di akhir lewat **Hapus data**. Tanggapan tidak bisa
  dikembalikan ke "Belum ditanggapi".
- Jangan menyimpan perubahan aturan penilaian di produksi tanpa mengembalikannya ke nilai semula.
- Nama proposal di contoh diambil dari produksi saat panduan ditulis; datanya bisa berubah, jadi
  pakai nama yang ada di layar Anda.

## Urutan yang disarankan

| Berkas                                                                                   | Isi                                                                                                         | Kode use case                  |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------ |
| [`01-masuk-dashboard-tren.md`](01-masuk-dashboard-tren.md)                               | Masuk dan keluar, sidebar, header (cari ⌘K, notifikasi, tema, menu akun), Dashboard, Tren                   | UC-DSB                         |
| [`02-proposal.md`](02-proposal.md)                                                       | Daftar proposal, filter, CSV, aksi massal, unggah deck, detail, keputusan, koreksi, hapus data              | UC-PRP                         |
| [`03-aktivitas-riwayat-aturan-pengaturan.md`](03-aktivitas-riwayat-aturan-pengaturan.md) | Aktivitas AI, Riwayat, Aturan penilaian, Pengaturan (termasuk STOP/LANJUT)                                  | UC-AKT, UC-RWY, UC-ATR, UC-SET |
| [`04-tanya-aisa-whatsapp-form.md`](04-tanya-aisa-whatsapp-form.md)                       | Tanya AISA di dashboard, perintah dan pertanyaan lewat WhatsApp, ringkasan 09.00/17.00, Google Form founder | UC-AST, UC-WA, UC-FRM          |

## Mencatat hasil

Untuk setiap use case, catat **Lulus** atau **Gagal**, tanggal, dan bila gagal: apa yang terlihat
(tangkapan layar, teks persis, URL). Hasil uji produksi yang pernah dijalankan tim ada di
[`../dashboard.md`](../dashboard.md) dan [`../penerimaan-produksi.md`](../penerimaan-produksi.md).
