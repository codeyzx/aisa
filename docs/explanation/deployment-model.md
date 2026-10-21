# Why the deployment is shaped this way

Rationale only. The runbook is [deploy](../how-to/deploy.md); the properties the shipped artifact
guarantees are [the operations contract](../reference/contracts/operations.md).

## A container, not a platform

The app ships as a Next.js standalone server in one image. That is a decision, and its cost is
real: you operate a host, a proxy and TLS yourself.

What it buys is that **nothing about the app is a property of a vendor**. The image runs on a VM
with Docker or Podman, a Kubernetes pod, a managed container runner, or a bare host — the same
artifact, with the same behaviour, and every operational question above has an answer that is
written down in this repo rather than in a dashboard. A starter that assumed a platform would
hand every fork a migration it never asked for.

## Three surfaces, split on who owns state

- **The app** is one stateless container. It holds no data, so scaling it is replication and
  redeploying it is replacement.
- **Auth and the database** are hosted Firebase, reached with a service-account credential at run
  time. They are never in the image and never in a compose file — there is no "bring up the
  database" step, because the database is not yours to bring up.
- **Object storage** is any S3-compatible backend. Nothing in the code names one, so the choice is
  configuration rather than a port: a self-hosted SeaweedFS or MinIO is the default, a managed
  bucket is the swap.

The split is what makes the container genuinely stateless. Every durable thing lives behind a
credential the container reads at boot, which is also why a misconfigured container fails at boot
rather than on the first request that needed the missing piece.

## Two compose files, deliberately not interchangeable

The local file BUILDS from the working tree, bundles a storage backend whose credential is
committed to this repo in plaintext, reads the developer's own environment file, and publishes
its ports on loopback. Every one of those is disqualifying on a server.

They are separate files rather than one file with overrides because the failure mode of the
overridable version is silent: a single file that _can_ be pointed at production is one flag away
from being pointed at production with the fixture credential still in it. Two files make the
mistake visible as an edit — adding a build key to the production file, or a real bucket to the
local one, is merging two things that were separated on purpose.

The bundled storage backend is a **fixture**, not a small production deployment. Its credential is
public and its volume is backed up by nothing. "Self-hosted by default" means a backend you
operate properly; it never means the development sidecar promoted to a server.

## The build-time inlining trade-off

`next build` **inlines** every public configuration value into the browser bundle. That is a fact
about the framework, and the design here follows from accepting it rather than working around it.

Consequences, all deliberate:

- **The public Firebase config must be present at image build**, supplied as build arguments.
  Supplying it only at run time ships a browser wired to `undefined` — and it ships an image that
  boots fine, answers the health probe, and only fails in someone's browser.
- **The image is therefore environment-specific.** A production image cannot be reused for
  staging; its web config is baked. Rebuilding per environment is the price of the inline, and it
  is a price worth naming because it looks like a bug the first time you meet it.
- **Those values are not secrets.** Firebase web config is public by construction and already
  ships in every client bundle. Treating it as a secret in CI buys nothing and makes it harder to
  build.
- **Server credentials are never build inputs.** They are read at run time only, so the build runs
  with zero secrets — which is what makes it safe to build the image anywhere.

The asymmetry between the two halves is the load-bearing part. Public config must exist at build,
because it gets inlined and cannot be fixed afterwards, so a missing one **fails the build**.
Server config is read per request and validated at **boot**, so a missing one fails fast at
startup with every missing group named at once. There is no flag that switches either check off:
the predecessor allowed validation to be disabled for secret-less builds, which meant a green
build proved nothing. Builds now pass explicit non-secret dummy public values instead, so the
validator always runs.

That is also why the image build and the CI verification build are different commands. The CI
build fills the public gap with the shared dummy fixture — useful for proving the tree compiles
without credentials, catastrophic inside an image, because those placeholders would be inlined
and point the app at a project that is not yours. Reaching for it to "fix" a red image build
converts a loud failure into a silent one.

## Firestore rules and indexes deploy out of band

The container ships app code. Security rules and composite indexes are configuration of a hosted
service, deployed separately with the Firebase CLI.

They are not in the image because they are not the app's to install: the same rules govern every
client of that project, and an image that pushed them on boot would let a rollback of the app
silently roll back the security posture of the data.

The index half is the one that bites, and its failure mode is argued in
[the data contract](../reference/contracts/data.md). What belongs here is only the split: the
image carries app code, the indexes are a deploy of their own.

## Why CI has no deploy job

A starter has no target. A workflow holding credentials for a project that does not exist is an
attack surface in exchange for nothing, and a deploy job wired to a placeholder is a thing every
fork has to notice and rip out before it does something surprising.

So CI is a **quality gate**: it runs the same package scripts a developer runs by name, and it
exercises the artifact that actually ships — building the image, smoking it, and driving the
browser suite against the running container — because the failures that only appear in the image
are invisible to typecheck, lint, build and the unit suite. Wiring a deploy is a deliberate act
the forker performs once they have a real project, not a default they inherit.

## Two shapes people expect to be the other way round

Both are properties of the shipped artifact, so both are argued in
[the operations contract](../reference/contracts/operations.md) rather than here.

- **The health probe is liveness and does not check the database.**
- **Deploying by digest is checkable but not compulsory.** `pnpm image:check` refuses an
  `APP_IMAGE` that is not digest-pinned; running it in the job that cuts the deploy is
  still the deployer's discipline, because compose can only require the value to exist.
