# Deploy

The runbook: build the image, deploy the Firestore artifacts, run the container, and
prove what is running. Exercise it end to end — it is not a description to read.

This app ships as a **self-hosted container**, not on Vercel. The image is a Next.js
standalone server. Auth and Firestore stay hosted services and are never in the image.
Object storage is any S3-compatible backend.

The rules this procedure obeys — the environment matrix, shutdown signals, reverse-proxy
requirements, body limits, and what the logs are and are not — live in the
[`operations` contract](../reference/contracts/operations.md). Read it before you change
how the container is run.

## Before you start

- A container engine — Docker or Podman. `docker build` and `podman build` are
  interchangeable here; the `Containerfile` uses only portable syntax.
- A Firebase project with Auth and Firestore enabled, and a **service-account key**.
- An S3-compatible bucket you operate (SeaweedFS, MinIO) or rent (R2). The SeaweedFS
  bundled in `compose.yaml` is the **local development substitute**, never a deployment
  target: its credential is committed to this repo in plaintext and its volume is backed
  up by nothing.

## 1. Build the image

```bash
docker build -f Containerfile -t aixel-app .
```

**The public Firebase configuration is a build input, and that is not optional.**
`next build` inlines every `NEXT_PUBLIC_*` value into the browser bundle. Pass them as
build args:

```bash
docker build -f Containerfile -t aixel-app \
  --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=... \
  --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=... \
  --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=... \
  --build-arg NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=... \
  --build-arg NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=... \
  --build-arg NEXT_PUBLIC_FIREBASE_APP_ID=... \
  --build-arg NEXT_PUBLIC_SENTRY_DSN=... \
  --build-arg BUILD_SHA="$(git rev-parse --short HEAD)" \
  --build-arg BUILT_AT="$(date -u +%FT%TZ)" \
  .
```

Rebuild per environment, pass these as CI variables rather than secrets, and never pass
a server credential as a build argument. Why each of those follows from the inline — and
why a build that fails on a missing public variable is the design working rather than
something `pnpm build:ci` should be used to paper over — is
[the deployment model](../explanation/deployment-model.md).

Smoke the artifact before you ship it — `pnpm smoke:image` proves things about the
assembled image that no build or test can see. See
[verify a change](verify-change.md).

## 2. Deploy the Firestore artifacts

The container ships app code, not Firestore configuration. `firestore.rules` and
`firestore.indexes.json` deploy separately, out of band:

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

**The index deploy is load-bearing and nothing at build time catches a missing one** —
[the data contract](../reference/contracts/data.md) owns that rule. Before deploying, run
the drift guard against an emulator you have actually exercised:

```bash
pnpm emulators       # then drive the app, seed, or run the tests
pnpm indexes:check   # diffs observed index demand against firestore.indexes.json
```

## 3. Set the object-storage lifecycle rule

Uploads land under an `uploads/` prefix and are promoted to `assets/` only on submit. A
file the reader picked but never submitted stays under `uploads/` forever — an orphan
billing you — unless the backend expires it. Bucket configuration is not in the image,
so this is a one-time out-of-band rule:

> Expire objects under the `uploads/` prefix after **N days** (1 is plenty — a submit
> promotes within the request). The rule **must** scope to the `uploads/` prefix only:
> `assets/` holds referenced files and must never be touched.

The promote-on-submit code and this rule are two halves of one design. Ship one without
the other and you either leak staging objects (no rule) or delete referenced files (rule
not scoped).

- **Cloudflare R2** — dashboard: _R2 → your bucket → Settings → Object lifecycle rules →
  Add rule_, prefix `uploads/`, delete after 1 day. Or via the S3 API with
  `aws s3api put-bucket-lifecycle-configuration`.
- **SeaweedFS** — the S3 gateway honors a bucket lifecycle-expiration configuration with
  a `uploads/` prefix; the filer additionally supports a directory TTL
  (`fs.configure -locationPrefix=/buckets/<bucket>/uploads/ -ttl=1d`). Either expires the
  staging prefix; neither touches `assets/`.

## 4. Run it

### With compose

`compose.prod.yaml` is the production example: a **published image you name**, no
`build:` key, no bundled storage, and the container's environment from `.env.production`
only. It refuses to start until you supply both.

```bash
# .env.production holds the server environment. It is untracked — .gitignore covers .env*
export APP_IMAGE=ghcr.io/you/aixel-app@sha256:<digest>
pnpm image:check                                  # refuses a tag; see below
docker compose -f compose.prod.yaml up -d
```

- **`APP_IMAGE` is required and has no default.** A placeholder like
  `ghcr.io/your-org/app` is a name a stranger can register, and compose would pull it
  happily — so unset must fail.
- **Pin by digest, not a tag.** `pnpm image:check` refuses anything that is not
  `<name>@sha256:<64 hex>`, resolving `APP_IMAGE` the way compose does — exported
  environment, then the project directory's `.env`. Run it in the job that cuts the
  deploy: compose can only check that the value is PRESENT, so nothing stops a deploy
  that skips this step. It is shape validation and contacts no registry — it cannot tell
  you the digest names an image that exists. See
  [operations](../reference/contracts/operations.md).
- **`APP_IMAGE` can also come from a `.env` sitting next to the compose file** — compose
  loads the project directory's `.env` for interpolation regardless of `-f`. Only the
  _container's_ environment is `.env.production`-only. Keep stray `.env` files off the
  server.
- **A missing `.env.production` halts the run** rather than starting a container with no
  Firebase credential.

The port binds `127.0.0.1`, because the container serves plain HTTP: a proxy on the same
host reaches loopback, and a proxy in a container joins the compose network and needs no
published port at all.

**`compose.yaml` is not a deploy file.** It builds from the working tree, bundles a
SeaweedFS whose credential is in this repo, reads the developer's own `.env`, and
publishes on loopback. Every one of those is disqualifying on a server. If you find
yourself adding a `build:` key to the production file, or a real bucket to the local one,
you are merging two things that were separated on purpose.

### Or as a bare container against managed storage

```bash
docker run --rm -p 127.0.0.1:3000:3000 \
  -e FIREBASE_PROJECT_ID=... -e FIREBASE_CLIENT_EMAIL=... -e FIREBASE_PRIVATE_KEY="..." \
  -e S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com \
  -e S3_REGION=auto \
  -e S3_BUCKET=... -e S3_ACCESS_KEY_ID=... -e S3_SECRET_ACCESS_KEY=... \
  aixel-app
```

R2 mandates `S3_REGION=auto`; SeaweedFS accepts any region, and SigV4 requires one, so it
defaults to `us-east-1`. Requests are always path-style. Nothing else in the image
changes — the S3 client is backend-generic, and swapping backends is an env change only.

## 5. Prove what is running

`/api/health` is public and reports the build stamp:

```bash
curl -s http://localhost:3000/api/health
# {"ok":true,...,"data":{"status":"ok","sha":"<git-sha>","builtAt":"<iso>"}}
```

A deployed image reports the commit it was cut from; `pnpm dev` reports `unknown`. The
route is **liveness only** and does not touch Firestore — the semantics, and what that
means for your probe configuration, are in
[operations](../reference/contracts/operations.md).

Then sign in through the deployed origin. If sign-in returns 403 while everything else
looks healthy, your reverse proxy is not preserving the public hostname — the first thing
the [`operations` contract](../reference/contracts/operations.md) tells you to check.

## Backups

[Snapshot export and restore](backup-and-restore.md) covers dumping Firestore to
diffable JSON and loading it back.
