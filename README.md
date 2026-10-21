# AISA

> Dashboard manajer **AISA**: membaca data proposal dari Firestore di sisi server,
> mengirim setiap perubahan ke `aisa-api` (Python), dan dimasuki manajer lewat akun
> Firebase Auth (email + kata sandi). Dibangun di atas starter Next.js + Firestore Aixel.

<!-- readme:product -->

## Product

- **Masalah** — manajer butuh satu tempat untuk melihat proposal yang dinilai AI,
  menanggapinya, dan mengatur aturan penilaian, tanpa menyentuh Firestore atau layanan
  Python secara langsung.
- **Untuk** — manajer program (akun Firebase dengan klaim `role`), developer yang
  merawat dashboard ini, dan coding agent yang bekerja di dalamnya.
- **Outcome** — halaman Dashboard, Proposal, Tren, Aktivitas AI, Biaya AI, Riwayat, Aturan
  penilaian, dan Pengaturan yang membaca Firestore di server, plus panel **Tanya AISA**
  yang bertanya ke Asisten lewat `aisa-api`; setiap tombol yang mengubah data memanggil
  `aisa-api` lewat server action dengan header `X-AISA-Key`, jadi Next tidak pernah
  menulis data AISA ke Firestore.
- **Workflow utama** — jalan lokal sampai masuk ke dashboard
  ([tutorial](docs/tutorials/local-development.md)), memverifikasi perubahan
  ([verify](docs/how-to/verify-change.md)), lalu membangun dan menjalankan artefak
  container ([deploy](docs/how-to/deploy.md)).
- **Termasuk** — sign-in Firebase email/password yang ditukar menjadi session cookie
  Firebase httpOnly (diverifikasi dengan cek pencabutan di setiap request), RBAC
  berbasis capability dari klaim `role` (`aisa:read`, `aisa:respond`,
  `aisa:configure`), pembacaan Firestore yang typed, dan error monitoring opsional.
  Yang punya env sendiri terdaftar di
  [capability reference](docs/reference/capabilities.md).
- **Tidak termasuk** — pendaftaran akun, manajemen pengguna, serta reset atau ganti
  kata sandi dari UI (akun dan klaim `role` dibuat di luar aplikasi — lihat
  [deploy](docs/how-to/deploy.md)). Bukan multi-tenant dan bukan untuk trafik publik
  anonim.

Alasan lengkap di balik bentuknya ada di
[product context](docs/explanation/product-context.md).

<!-- readme:quickstart -->

## Mulai Cepat

### Prasyarat

- **Node 24.22.1, persis** — `.node-version` adalah sumber yang dibaca version manager
  (fnm, nvm, asdf, nodenv, mise).
- **pnpm** — jangan `npm`; lockfile-nya punya pnpm.
- **Docker atau Podman, opsional** — hanya untuk pemeriksaan container
  (`pnpm smoke:image`, `pnpm test:e2e:ci`) dan stack compose.
- **Tidak ada database yang perlu dipasang** — Firestore itu hosted service,
  penggantinya di lokal adalah Firebase emulator suite yang jalan langsung di host.
- **`aisa-api` untuk menulis** — server menolak boot tanpa `AISA_API_URL` dan
  `AISA_API_KEY`. Isi `AISA_API_KEY` di `.env` dengan kunci yang dipakai `aisa-api`
  lokalmu (`services/api/`); halaman tetap bisa dibaca tanpa layanan itu, tombol yang
  mengubah data tidak.
- **Linux** adalah platform yang repo ini punya buktinya (itu yang dijalankan CI dan
  itu bentuk container-nya). macOS diperkirakan jalan tapi tidak diuji; di Windows
  pakai WSL2.

```bash
pnpm install
pnpm dev
```

`pnpm dev` menyalakan semuanya dalam satu perintah: emulator Firebase (datanya
disimpan lintas restart di `.emulator-data/`), `pnpm setup:local` yang membuat `.env`
dan menyemai data saat database masih kosong, lalu `next dev`. Ctrl+C mengekspor data
emulator dan mematikan emulator-nya.

Mau emulator tetap hidup di terminal terpisah — supaya server bisa restart tanpa
mematikan emulator? Jalankan `pnpm emulators` di satu terminal, lalu `pnpm dev:next`
(cuma `next dev`) di terminal lain.

**Berhasil kalau**: <http://localhost:3000> membawa kamu ke `/login`, kamu masuk sebagai
`manager@aisa.test` dengan kata sandi `password123` (akun emulator yang dibuat
`pnpm seed` dan dicetak oleh `pnpm setup:local`), dan kamu sampai di `/dashboard`.
Akun ini hanya ada di Auth emulator.

`pnpm setup:local` tidak menghapus apa pun, jadi aman diulang kapan saja. Rincian apa
yang dia kerjakan, cara mengosongkan ulang database lokal, dan apa yang harus dilakukan
kalau ada yang macet ada di
[tutorial local development](docs/tutorials/local-development.md).

<!-- readme:verification -->

## Verifikasi Perubahan

```bash
pnpm verify
```

Itu gerbang statis + unit + integration + build. Yang **tidak** dia cakup dan tetap
harus kamu jalankan sendiri: sign-in di browser lewat emulator, env fail-fast saat boot, smoke
artefak container produksi, dan suite E2E (`pnpm test:e2e:ci`). Hijau perlu, tapi tidak
pernah cukup — prosedur lengkapnya di
[verify a change](docs/how-to/verify-change.md).

<!-- readme:navigation -->

## Dokumentasi

[`docs/README.md`](docs/README.md) adalah indeks lengkapnya. Rute tercepat:

- **Baru pertama kali** — [local development](docs/tutorials/local-development.md),
  lalu [first change](docs/tutorials/first-change.md).
- **Mulai project nyata** — [adapt the starter](docs/how-to/adapt-starter.md) untuk
  rename dan hapus, [remove a capability](docs/how-to/remove-capability.md) untuk
  membuang yang tidak dipakai.
- **Menambah kode** — [add a feature](docs/how-to/add-feature.md), lalu kontrak layer
  yang kamu sentuh di [`docs/reference/contracts/`](docs/reference/contracts/). Baca
  kontraknya sebelum menebak konvensi dari kode pertama yang kamu buka.
- **Fakta yang di-generate dari source** —
  [commands](docs/reference/commands.md) ·
  [configuration](docs/reference/configuration.md) ·
  [capabilities](docs/reference/capabilities.md) ·
  [project layout](docs/reference/project-layout.md).
- **Kenapa bentuknya begini** — [architecture](docs/explanation/architecture.md) dan
  [product context](docs/explanation/product-context.md).

README ini sendiri tunduk pada
[kontrak project README](docs/reference/contracts/project-readme.md); cara merawatnya
ada di [maintain a project README](docs/how-to/maintain-project-readme.md).

<!-- readme:deployment -->

## Deployment

Artefaknya satu **image container** (`Containerfile`) yang dijalankan di Cloud Run;
`compose.prod.yaml` adalah contoh menjalankannya di host sendiri. Runbook-nya di [deploy](docs/how-to/deploy.md), alasannya di
[deployment model](docs/explanation/deployment-model.md).
