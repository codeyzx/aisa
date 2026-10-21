# Get the app running locally

From a fresh clone to a signed-in browser in two commands — `pnpm install` then
`pnpm dev`. `pnpm dev` is the whole local stack in one command: it starts the Firebase
emulators, runs `pnpm setup:local` for you, and then starts the dev server.

Everything here writes only to the local emulator and your own `.env`. Nothing in
this tutorial can touch a real project.

## Before you start

- **Node 24.18.0, exactly.** `.node-version` is the source a version manager reads
  (fnm, nvm, asdf, nodenv, mise all understand it). `pnpm node:check` proves every
  place that pins a Node version still agrees, and warns when the interpreter you
  are actually running is a different one — a local "it worked for me" on the wrong
  runtime is not evidence about the shipped image.
- **pnpm.** Never `npm` — the lockfile is pnpm's.
- **Docker or Podman, optional.** Only the local S3 backend (SeaweedFS) needs it.
  Without a container engine the app still boots; file upload and download are the
  only things that stop working.
- **No database to install.** Firestore and Auth are hosted services; their local
  substitute is the Firebase emulator suite, which runs directly on the host and is
  deliberately absent from every compose file.

### Platform

**Linux is the platform this repo has evidence about** — it is what CI runs and what
the shipped container is. macOS is expected to work and is not exercised. On Windows,
use **WSL2**: the toolchain is POSIX-shaped, and the commands below use POSIX shell,
including the inline `VAR=value command` env prefix. In PowerShell you would set the
variable first (`$env:VAR="..."`) instead.

`trash` in these docs is the `trash-cli` recoverable-delete command. If you do not
have it, use your operating system's recycle-bin tooling rather than an irreversible
delete.

## 1. Install

```bash
pnpm install
```

This also installs the repo's git hooks (`scripts/install-hooks.ts` runs from
`prepare`).

## 2. Run

```bash
pnpm dev
```

Open **http://localhost:3000** and sign in at `/login`.

`pnpm dev` does three things in one process:

1. Starts the Firebase emulators under `demo-aisa`. Ports come from `firebase.json`:
   **Auth on 9099**, **Firestore on 8080**, and the **emulator UI on 4000**. The data
   is kept in `.emulator-data/` (git-ignored) via `--import`/`--export-on-exit`, so
   anything you make through the UI survives a restart.
2. Runs `pnpm setup:local` — creates `.env`, starts the object-storage container, and
   seeds only when the database is empty (see the next section).
3. Starts `next dev` with hot reload.

Ctrl+C exports the emulator data and tears the emulators down.

### Prefer the emulators in their own terminal?

If you would rather keep the emulators running independently — so restarting the
server does not restart them — run them yourself and use the raw dev server:

```bash
pnpm emulators   # terminal 1, stays running
pnpm setup:local # terminal 2, once
pnpm dev:next    # terminal 2, just `next dev`
```

`pnpm setup:local` waits for the emulators if you have not started them yet, so you
can run the two terminals in either order.

### What `setup:local` did

It is **non-destructive by contract** — it deletes nothing: not your `.env`, not
emulator data, not a bucket. That is what makes it safe to re-run any time you want
to check your setup. Concretely:

- **Creates `.env` from `.env.example`**, and only from there — never over an
  existing `.env`. This is _not_ the same as `cp .env.example .env`. `.env.example`
  ships `IMPERSONATION_SECRET` **empty** on purpose, and `setup:local` fills that one
  line with 32 random bytes generated on your machine. Copy the file by hand instead
  and the app refuses to boot, naming the variable.
- **Starts SeaweedFS** through compose. Without a container engine it carries on
  regardless.
- **Seeds the emulator**, choosing between three states so that nothing you made
  through the UI is ever destroyed:
  - `assets` collection empty → run the full `pnpm seed` (its collection clear then
    has nothing to clear).
  - assets present but **zero Auth accounts** → upsert the accounts only; no document
    is written.
  - both present → report the counts and touch nothing.
- **Prints the test accounts**, read back out of the emulator.

### The test accounts

- `admin@aixel.test` — role `admin`
- `user@aixel.test` — role `user`
- password `password123` for both

They exist **only in the emulator**, and the password is published in this repo on
purpose. A fresh seed also writes 30 example assets — enough that the list pages past
its first page.

## Looking around

The signed-in app is at `/` and the demos live under the `Contoh` navigation section:
the `assets` list and form (the one entity wired through every seam at once), plus one
example per optional capability — state, storage, AI, export, and realtime. Delete
that whole route group when you start a real project; see
[the adapt-starter how-to](../how-to/adapt-starter.md).

## Starting over

```bash
pnpm db:reset            # prints the plan only — deletes nothing
pnpm db:reset -- --apply # wipes every emulator Firestore document and Auth account
```

Then run `pnpm setup:local` again to reseed.

`pnpm db:reset`, `pnpm seed` and `pnpm setup:local` all stand behind one fence
(`requireEmulatorTarget` in `scripts/_safety.ts`): they refuse to run unless both
`FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST` are set, so they can only
ever reach a local emulator. `setup:local` deletes nothing and stands behind it
anyway — it is the proof that the `.env` it just created really points at the
emulators.

## If you call `pnpm seed` yourself

Two things to know. It is **destructive** — it clears the entire `assets` collection
before rewriting its fixtures — and it does **not** load `.env` (plain `node` does not
read `.env`, unlike `setup:local` and `db:reset`, which load `.env.local` and `.env`
themselves). So pass the emulator hosts inline:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  pnpm seed
```

`pnpm setup:local` exists so you do not have to take that risk.

## When something is off

- **Port 3000 busy** — a second `pnpm dev`, or the local compose stack, which
  publishes the app on `127.0.0.1:3000` too. Move the compose one with
  `APP_HOST_PORT` rather than editing `compose.yaml`.
- **The app refuses to boot and names an environment variable** — that is the boot
  fail-fast doing its job. It reports every misconfigured group at once. See
  [the configuration reference](../reference/configuration.md).
- **Uploads fail** — SeaweedFS is not up. Re-run `pnpm setup:local`, or bring the
  local stack up yourself with `docker compose up --build`.

## Next

- [Make your first change](first-change.md) — edit something, see it, verify it.
- [Adapt the starter](../how-to/adapt-starter.md) — rename it, delete what you do not
  need, configure what you keep.
