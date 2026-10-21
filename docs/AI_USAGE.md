# Penggunaan AI dalam Pembuatan dan Produk AISA

Dokumen ini menjelaskan dua hal secara terpisah: (1) bagaimana asisten AI untuk menulis kode
dipakai saat membangun AISA, dan (2) AI yang menjadi bagian dari produk AISA. Keduanya
dibedakan karena tanggung jawabnya berbeda. Asisten koding hanya membantu membangun, dan
keputusan tetap di tangan tim. AI di dalam produk hanya menilai dan merangkum, sedangkan
keputusan atas proposal tetap di tangan manajer.

## 1. AI sebagai asisten pembuatan

### Alat

**Claude Code** (CLI agen koding dari Anthropic) dipakai di repo ini. Pekerjaan besar dipecah
dan dijalankan beberapa **agen paralel**. Setiap agen mendapat tugas tertulis dengan batas
berkas yang boleh diubah dan kriteria selesai yang bisa diperiksa.

### Pembagian kerja

| Area                                 | Peran AI                                                                                                                                                           | Keluaran di repo                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Penggalian kebutuhan                 | Mencecar rancangan (`overview-project.md`, `tech.md`) dengan pertanyaan sampai istilah, alur, dan batasannya tegas                                                 | Keputusan yang tercatat di dokumen; daftar butir **[VERIFIKASI]** di `tech.md`                                                  |
| Glosarium dan kontrak data           | Menyusun istilah tunggal untuk setiap konsep beserta istilah yang dihindari, lalu kontrak koleksi Firestore                                                        | `GLOSSARY.md`, `docs/reference/contracts/aisa-firestore.md`, `services/api/aisa/models.py` sebagai sumber kebenaran bentuk data |
| Penyediaan infrastruktur             | Menjalankan `gcloud` untuk Firestore, Artifact Registry, bucket GCS, Secret Manager, Cloud Run, Cloud Scheduler; mencatat yang terblokir izin                      | Layanan `aisa-api` dan `aisa-dashboard` di Cloud Run `asia-southeast2`, job `aisa-ringkasan-pagi`/`-sore`                       |
| Layanan `aisa-api` (Python, FastAPI) | Menulis intake, Penilai, skor dan kategori, ringkasan, webhook GOWA, Orchestrator, API dashboard, beserta unit test                                                | `services/api/aisa/*.py`, `services/api/tests/`                                                                                 |
| Asisten (Google ADK)                 | Menulis agent, tools baca Firestore, dan skrip deploy ke Agent Runtime                                                                                             | `services/api/aisa/assistant/`, `services/api/deploy_assistant.py`                                                              |
| Adaptasi dashboard                   | Mengubah starter Next.js internal Aixel menjadi halaman AISA: Dashboard, Proposal, Tren, Aktivitas AI, Riwayat, Aturan penilaian, Pengaturan, dan panel Tanya AISA | `app/(app)/*`, `features/aisa/*`, `lib/aisa-api/*`                                                                              |
| Pengujian                            | Membuat deck sintetis untuk startup fiktif, menjalankan T01–T11 di produksi, mencatat hasil dari Firestore dan log                                                 | `docs/TESTING.md`                                                                                                               |

### Yang diputuskan manusia

AI mengusulkan dan menulis, tetapi aturan produk berikut adalah keputusan tim. Semuanya
tertulis di `GLOSSARY.md`, `tech.md`, dan kontrak Firestore, lalu ditegakkan oleh kode:

- **Aturan penilaian disimpan di Firestore dan diubah lewat halaman Aturan penilaian**, bukan
  Google Sheets. Aturan berversi: setiap perubahan wajib beralasan, menyimpan salinan di
  `rulesVersions/{v}`, dan tercatat di Riwayat. Bobot harus mencakup kelima kriteria dan
  berjumlah 1.
- **Firestore menolak semua akses langsung dari browser** (`firestore.rules` deny-all).
  Dashboard membaca lewat server, dan semua penulisan lewat `aisa-api`.
- **Satu perangkat WhatsApp** (sesi GOWA `aisa-hackathon`) untuk ringkasan dan percakapan.
  Hanya nomor manajer di `MANAGER_PHONES` yang dilayani, dan webhook wajib bertanda tangan
  HMAC.
- **Setiap deck dinilai satu kali.** Semua angka (skor, cek kecocokan, kategori, hitungan
  ringkasan) dihitung kode, bukan model. Rumus skor `Σ bobot × (nilai − 1) / 4` dan bobot
  baseline berasal dari rata-rata Scorecard Method dan Hustle Fund.
- **Kategori dan status adalah dua sumbu berbeda.** _Perlu dicek manual_ adalah status tanpa
  skor dan tanpa kategori, bukan kategori kelima. _Berkualitas, di luar fokus_ adalah tanda
  pada proposal Tidak cocok dengan skor ≥ 65, bukan kategori tersendiri.
- **Makna "ditanggapi".** Tanggapan hanya undang, pantau, atau arsipkan. Koreksi kategori
  **bukan** tanggapan: proposal yang dikoreksi tetap _belum ditanggapi_ dan tetap muncul di
  ringkasan dengan **kategori efektifnya**. Kategori asli dan skor kualitas tidak pernah
  ditimpa, dan koreksi wajib beralasan.
- **STOP/LANJUT.** STOP membuat sistem _dijeda_: penilaian yang sedang berjalan berhenti di
  langkah berikutnya (`dihentikan`), proposal baru menunggu sebagai `antre`, dan ringkasan
  dikirim dari template tanpa model. Hanya LANJUT yang membuka jeda dan menilai antrean.
- **Perintah dikenali kode, bukan model.** Pola `undang|pantau|arsipkan <nama>`, `… semua
  <kategori>` (wajib konfirmasi `YA` dalam 10 menit), `pindahkan <nama> ke <kategori> karena
  <alasan>`, `STOP`, dan `LANJUT` dicocokkan dengan regex. Nama dicocokkan secara persis →
  awalan unik → fuzzy unik ≥ 0,85, dan bila ambigu tidak ada yang diubah.
- **Ringkasan tanpa saran tindak lanjut.** Teks model hanya dipakai bila setiap angka dan
  nama ada di data dan tidak ada kata saran; bila tidak, template kode yang dikirim.
- **Asisten hanya punya tools baca.** Tidak ada tool tulis, dan data yang tidak ada dijawab
  "tidak tersedia".
- **Pelindungan data.** Hanya teks deck yang dikirim ke model (bukan gambar atau PDF). Kontak
  founder tidak masuk prompt dan tidak dikirim ke WhatsApp. Memory Bank hanya menyimpan
  preferensi manajer, bukan data proposal.
- **Model stabil dulu.** Semua agent memakai `gemini-3.8-flash`. Nama model disimpan di
  aturan penilaian, bukan ditulis di kode Penilai.

### Cara keluaran AI diverifikasi

Keluaran asisten koding tidak diterima hanya karena terlihat benar:

- **Unit test** untuk logika murni yang wajib menurut `tech.md` §12: skor, semua cabang
  kategori, cek kecocokan, pengenalan perintah, dan pengecekan angka di ringkasan. Hasilnya
  `uv run pytest` 62 lulus. `pnpm test` untuk dashboard: 465 lulus dan 1 gagal pada pemeriksa
  dokumen (rinciannya di `docs/TESTING.md`).
- **Dijalankan di lingkungan nyata, bukan hanya lolos pemeriksaan statis.** Skenario T01–T11
  dijalankan terhadap layanan produksi. Hasilnya diambil dari dokumen Firestore, log
  pekerjaan dan langkahnya, log Cloud Run, serta riwayat chat GOWA, lalu dicatat beserta ID
  buktinya di `docs/TESTING.md`. Hasil yang tidak lolos penuh ditandai _Sebagian_, dan
  masalah yang ditemukan dicatat apa adanya.
- **Kontrak sebagai acuan.** Bentuk data diperiksa terhadap `models.py` dan kontrak
  Firestore, bukan disimpulkan dari kode yang kebetulan dibaca.
- **Rahasia tidak masuk repo.** Kunci dan kata sandi ada di Secret Manager dan diambil saat
  dijalankan. Agen tidak menulis nilainya ke berkas.

## 2. AI di dalam produk AISA

### Model dan platform

| Komponen                            | Teknologi                                                                                                                                                                      | Lokasi                                                                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model untuk semua agent             | Gemini `gemini-3.8-flash` lewat Vertex AI (`google-genai`, `vertexai=True`)                                                                                                    | Endpoint `global`, karena Gemini 3.x hanya tersedia di sana untuk project ini (`GENAI_LOCATION`)                                                                                                           |
| Penilai, Insight, Pembuat ringkasan | Panggilan langsung `generate_content` dari `aisa-api`. Penilai memakai output terstruktur (`response_schema` JSON) yang divalidasi kode                                        | Cloud Run `asia-southeast2`                                                                                                                                                                                |
| Asisten                             | Agent **Google ADK** dengan tools baca Firestore (`search_proposals`, `count_proposals`, `get_proposal_detail`, `compare_proposals`, `get_history`, `get_trends`, `get_rules`) | **Vertex AI Agent Runtime** (Agent Engine) `us-central1`, dengan **Sessions** (satu session per nomor manajer per hari WIB) dan **Memory Bank** (hanya preferensi manajer). Modelnya dipanggil di `global` |
| Orchestrator                        | Kode: perintah dikenali dengan regex, pesan lain diteruskan ke Asisten                                                                                                         | `aisa-api`                                                                                                                                                                                                 |

### Batas peran AI

- **Penilai** memberi nilai 1–5 per kriteria dengan kutipan halaman atau tanda "tidak
  disebut", serta mengekstrak profil (sektor, tahap, dana). Bila validasi gagal, Penilai
  dicoba sekali lagi. Bila masih gagal, atau teks deck terlalu sedikit, proposal menjadi
  _Perlu dicek manual_ tanpa skor.
- **Kode** menghitung skor, cek kecocokan, kategori, dan semua angka ringkasan. **Insight**
  dan **Pembuat ringkasan** hanya menuliskan kalimat dari angka yang sudah dihitung, dan
  teksnya ditolak bila memuat angka atau saran yang tidak berasal dari data.
- **Asisten** menjawab dari data AISA lewat tools baca. Saran yang tidak berasal dari data
  diberi label sebagai saran AI, dan data yang tidak ada dijawab "tidak tersedia" (lihat
  T08 di `docs/TESTING.md`).
- **Keputusan** undang, pantau, arsipkan, koreksi kategori, dan STOP selalu datang dari
  manajer, dan setiap keputusan tercatat di Riwayat beserta jalurnya (WA atau dashboard).

### Transparansi pemakaian AI

Setiap pekerjaan agent tercatat di `jobs/{id}` dengan langkah-langkahnya: waktu, aksi, tool,
data dibaca/ditulis, model, token masuk/keluar dari `usage_metadata`, durasi, dan status.
Langkah kode diberi label `kode` dengan token 0. Total token per proposal, per ringkasan,
dan per hari ditampilkan di halaman Aktivitas AI. Sebagai contoh, pada hari pengujian
`dailyStats/2026-10-21` mencatat 12 panggilan model, 35.012 token masuk, dan 15.789 token
keluar.

### Keterbatasan yang diketahui

- Penilai tidak deterministik: deck yang sama pernah mendapat 62,5 dan 70,0. Karena itu setiap
  deck dinilai sekali dan hasil aslinya disimpan.
- Deck sintetis yang rapi cenderung mendapat 5/5 di semua kriteria. Kalibrasi terhadap
  penilaian analis manusia belum dilakukan, karena data deck lama berlabel belum tersedia.
- Tidak ada OCR: deck hasil scan selalu menjadi _Perlu dicek manual_.
