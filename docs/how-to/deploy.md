# Deploy

The runbook: build the image, deploy the Firestore artifacts, run the container, and
prove what is running. Exercise it end to end — it is not a description to read.

The dashboard ships as a **container**: a Next.js standalone server. The intended host
is Cloud Run; the same image also runs under compose or a bare container engine.
Firestore stays a hosted service and is never in the image. The dashboard only READS
Firestore; every write goes to the Python `aisa-api`, which this image calls but does
not contain.

The rules this procedure obeys — the environment matrix, shutdown signals, reverse-proxy
requirements, body limits, and what the logs are and are not — live in the
[`operations` contract](../reference/contracts/operations.md). Read it before you change
how the container is run.

## Before you start

- A container engine — Docker or Podman. `docker build` and `podman build` are
  interchangeable here; the `Containerfile` uses only portable syntax.
- A Firebase project with Firestore enabled, Firebase Authentication initialised with
  the Email/Password provider on, a Firebase **web app** (its config is the six
  `NEXT_PUBLIC_FIREBASE_*` build args), and the deployed hostname(s) in Auth's
  authorized domains.
- At least one account with a `role` custom claim — see "Accounts" below.
- A running `aisa-api` the container can reach, and the shared key it expects.

## 1. Build the image

```bash
docker build -f Containerfile -t aisa-dashboard \
  --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=... \
  --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com \
  --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=<project> \
  --build-arg NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=... \
  --build-arg NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=... \
  --build-arg NEXT_PUBLIC_FIREBASE_APP_ID=... \
  --build-arg BUILD_SHA="$(git rev-parse --short HEAD)" \
  --build-arg BUILT_AT="$(date -u +%FT%TZ)" \
  .
```

The six `NEXT_PUBLIC_FIREBASE_*` values are the web app's config (Firebase console, or
the Management API's `webApps/<id>/config`). They are public by design but INLINED into
the browser bundle, so they must be build args and the image is project-specific; the
build fails without them. Never set `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` for a
deployable image. `NEXT_PUBLIC_SENTRY_DSN` is the one optional public build arg. Never
pass a server credential as a build argument. With Cloud Build, pass the same
`--build-arg`s in the build step and set `DOCKER_BUILDKIT=1` (the `Containerfile` uses
cache mounts). The reasoning is in
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

The rules are deny-all: the dashboard reads through the Admin SDK and `aisa-api` writes
through its own server credential, so no browser touches Firestore directly.

**The index deploy is load-bearing and nothing at build time catches a missing one** —
[the data contract](../reference/contracts/data.md) owns that rule. Before deploying, run
the drift guard against an emulator you have actually exercised:

```bash
pnpm emulators       # then drive the app, seed, or run the tests
pnpm indexes:check   # diffs observed index demand against firestore.indexes.json
```

## 3. Run it

The server validates its environment at **boot** and refuses to serve (logs every
missing group, then exits 1) unless all of these are set:

| Variable                                         | What it is                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `FIREBASE_PROJECT_ID`                            | The Firebase project the dashboard reads.                                                             |
| `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Optional, as a PAIR. Both unset uses Application Default Credentials; setting exactly one is refused. |
| `AISA_API_URL`                                   | Absolute http(s) URL of `aisa-api`.                                                                   |
| `AISA_API_KEY`                                   | The shared key sent as `X-AISA-Key`. Secret.                                                          |

The full list, including optional variables, is
[configuration](../reference/configuration.md).

### On Cloud Run

Cloud Run injects `PORT` at run time; the image listens on `process.env.PORT` with
`HOSTNAME=0.0.0.0`, so nothing needs to be set for the port. Leave the
`FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` pair unset: the Admin SDK then uses
Application Default Credentials, which on Cloud Run is the service's runtime service
account. That account needs read access to Firestore and access to the secret below.

Sign-in also needs Firebase Auth permissions (`createSessionCookie`, and the lookup
behind the per-request revocation check). If the runtime account holds a Firebase Auth
admin role, nothing more is needed. If it does not, and no key may be minted, set
`FIREBASE_AUTH_SERVICE_ACCOUNT` to the project's Firebase Admin SDK service account
(`firebase-adminsdk-…@<project>.iam.gserviceaccount.com`, created when Firebase is added
to the project) and grant the runtime account `roles/iam.serviceAccountTokenCreator` on
THAT account only:

```bash
gcloud iam service-accounts add-iam-policy-binding <firebase-adminsdk-account> \
  --member=serviceAccount:<runtime-service-account> \
  --role=roles/iam.serviceAccountTokenCreator
```

Auth calls then run as that account; Firestore still runs as the runtime account.
Without either, every sign-in fails with `INSUFFICIENT_PERMISSION` in the logs.

Keep `AISA_API_KEY` in Secret Manager. A deploy looks like:

```bash
gcloud run deploy aisa-dashboard \
  --image=<registry>/aisa-dashboard@sha256:<digest> \
  --service-account=<runtime-service-account> \
  --set-env-vars=FIREBASE_PROJECT_ID=<project>,AISA_API_URL=<aisa-api-url>,FIREBASE_AUTH_SERVICE_ACCOUNT=<firebase-adminsdk-account> \
  --set-secrets=AISA_API_KEY=<aisa-api-key-secret>:latest
```

### Accounts

There is no sign-up and no in-app user admin. Create each account and its `role` claim
(`admin` or `user`) as someone with Firebase Auth admin rights — the Admin SDK
(`createUser`, then `setCustomUserClaims(uid, { role: 'admin' })`) or the Identity
Toolkit REST API (`projects/<project>/accounts`, then `accounts:update` with
`customAttributes`). An account with no claim signs in as the read-only `user`. A claim
change applies from that account's next sign-in.

Cloud Run terminates TLS, so the production `secure` cookie flag is satisfied.

### With compose

`compose.prod.yaml` is the production example: a **published image you name**, no
`build:` key, and the container's environment from `.env.production` only. It refuses to
start until you supply both.

```bash
# .env.production holds the server environment. It is untracked — .gitignore covers .env*
export APP_IMAGE=ghcr.io/you/aisa-dashboard@sha256:<digest>
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
  configuration.

The port binds `127.0.0.1`, because the container serves plain HTTP: a proxy on the same
host reaches loopback, and a proxy in a container joins the compose network and needs no
published port at all.

**`compose.yaml` is not a deploy file.** It builds from the working tree, reads the
developer's own `.env`, and publishes on loopback. If you find yourself adding a
`build:` key to the production file, you are merging two things that were separated on
purpose.

### Or as a bare container

```bash
docker run --rm -p 127.0.0.1:3000:3000 \
  -e FIREBASE_PROJECT_ID=... -e FIREBASE_CLIENT_EMAIL=... -e FIREBASE_PRIVATE_KEY="..." \
  -e AISA_API_URL=... -e AISA_API_KEY=... \
  aisa-dashboard
```

Off Google Cloud there are usually no Application Default Credentials, so set the
service-account pair.

## 4. Prove what is running

`/api/health` is public and reports the build stamp:

```bash
curl -s http://localhost:3000/api/health
# {"ok":true,...,"data":{"status":"ok","sha":"<git-sha>","builtAt":"<iso>"}}
```

A deployed image reports the commit it was cut from; `pnpm dev` reports `unknown`. The
route is **liveness only** and does not touch Firestore — the semantics, and what that
means for your probe configuration, are in
[operations](../reference/contracts/operations.md).

Then sign in through the deployed origin with a real account. If the Firebase step fails
with `auth/unauthorized-domain`, the hostname is missing from Auth's authorized domains.
If the session POST returns 403 while everything else looks healthy, your reverse proxy is not preserving the public
hostname — the first thing the
[`operations` contract](../reference/contracts/operations.md) tells you to check.

## Backups

[Snapshot export and restore](backup-and-restore.md) covers dumping Firestore to
diffable JSON and loading it back.
