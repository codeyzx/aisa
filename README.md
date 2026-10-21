# AISA

> Titik-mulai untuk aplikasi web **internal** Aixel: fondasi yang sudah dibuktikan —
> sign-in, role, jalur data typed, sampai container deploy — supaya hari pertama kamu
> sudah menulis kode domain, bukan mengulang dua minggu pertama yang sama.

<!-- readme:product -->

## Product

- **Masalah** — setiap aplikasi internal butuh jawaban yang sama di awal: sign-in yang
  otoritasnya di server, model role, jalur data yang typed, upload file, export, dan
  deploy. Menjawabnya ulang tiap project menghasilkan aplikasi yang beda-beda tipis
  persis di tempat yang mahal kalau beda.
- **Untuk** — developer Aixel yang memulai aplikasi internal baru, developer yang
  melanjutkan aplikasi hasil fork-nya, dan coding agent yang bekerja di keduanya.
- **Outcome** — kamu **menyalin** repo ini dan dia jadi milikmu. Bukan dependency,
  jadi tidak ada upstream yang bisa merusakmu dan tidak ada batas seberapa jauh kamu
  boleh menyimpang. Yang diwariskan dan tidak dipunya project kosong adalah **bukti**:
  jalur yang biasanya baru gagal di production sudah dijaga di sini.
- **Workflow utama** — semuanya jalur yang didokumentasikan, bukan janji: jalan lokal
  sampai sesi terautentikasi ([tutorial](docs/tutorials/local-development.md)),
  mengganti identitas dan membuang yang tidak dipakai
  ([adapt](docs/how-to/adapt-starter.md)), menambah entitas domain lewat kontrak
  `schema → repo → action` ([add feature](docs/how-to/add-feature.md)), memverifikasi
  perubahan ([verify](docs/how-to/verify-change.md)), lalu membangun dan menjalankan
  artefak container ([deploy](docs/how-to/deploy.md)).
- **Termasuk** — Firebase Auth dengan session cookie httpOnly dan RBAC berbasis
  capability, jalur data typed di atas Firestore, dan kapabilitas **opsional** yang
  tiap satunya punya contoh jalan dan bisa dihapus utuh: storage, AI, export,
  realtime. Yang punya env sendiri terdaftar di
  [capability reference](docs/reference/capabilities.md); yang tidak (export, realtime)
  hidup-matinya ditentukan capability RBAC dan keberadaan kodenya, dan tiap satunya
  punya kontrak sendiri di [docs/reference/contracts/](docs/reference/contracts/).
- **Tidak termasuk** — ini **bukan aplikasi jadi**: surface demo di
  `app/(app)/(examples)/` ada untuk membuktikan kapabilitasnya bekerja dan memang
  dirancang untuk dihapus sekali potong, dan entitas `assets` adalah contoh referensi,
  bukan domain bisnis kamu. Bukan multi-tenant, bukan untuk trafik publik anonim,
  bukan framework atau design system yang membungkus Next.js, dan bukan spec yang
  harus dipatuhi — menyesuaikannya memang yang diharapkan.

Alasan lengkap di balik bentuknya ada di
[product context](docs/explanation/product-context.md).

<!-- readme:quickstart -->

## Mulai Cepat

### Prasyarat

- **Node 24.18.0, persis** — `.node-version` adalah sumber yang dibaca version manager
  (fnm, nvm, asdf, nodenv, mise).
- **pnpm** — jangan `npm`; lockfile-nya punya pnpm.
- **Docker atau Podman, opsional** — hanya untuk backend S3 lokal (SeaweedFS). Tanpa
  itu app tetap boot; yang mati cuma upload/download file.
- **Tidak ada database yang perlu dipasang** — Firestore dan Auth itu hosted service,
  penggantinya di lokal adalah Firebase emulator suite yang jalan langsung di host.
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

**Berhasil kalau**: <http://localhost:3000> membawa kamu ke `/login`, kamu masuk pakai
akun test yang **dicetak sendiri oleh `pnpm setup:local`** di akhir jalannya, dan kamu
sampai di aplikasi yang sudah terautentikasi. Akun itu hanya ada di emulator dan tidak
ditulis ulang di dokumen lain.

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
harus kamu jalankan sendiri: sign-in di browser lewat emulator, env fail-fast, smoke
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

Target deploy-nya **container self-hosted** (`Containerfile` + `compose.prod.yaml`),
bukan platform serverless. Runbook-nya di [deploy](docs/how-to/deploy.md), alasannya di
[deployment model](docs/explanation/deployment-model.md).
