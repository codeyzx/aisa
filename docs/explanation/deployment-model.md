# Why the deployment is shaped this way

Rationale only. The runbook is [deploy](../how-to/deploy.md); the properties the shipped artifact
guarantees are [the operations contract](../reference/contracts/operations.md).

## A container, not a platform

The app ships as a Next.js standalone server in one image. That is a decision: the image is
the artifact, and where it runs is a separate choice. This fork runs it on Cloud Run, which
supplies TLS and the port; off a managed runner you operate a host, a proxy and TLS yourself.

What it buys is that **nothing about the app is a property of a vendor**. The image runs on a VM
with Docker or Podman, a Kubernetes pod, a managed container runner, or a bare host — the same
artifact, with the same behaviour, and every operational question above has an answer that is
written down in this repo rather than in a dashboard. A starter that assumed a platform would
hand every fork a migration it never asked for.

## Three surfaces, split on who owns state

- **The app** is one stateless container. It holds no data — the session cookie is signed,
  not stored — so scaling it is replication and redeploying it is replacement.
- **The database** is hosted Firestore, read with an Admin credential at run time (a
  service-account key pair, or Application Default Credentials such as the Cloud Run runtime
  service account). It is never in the image and never in a compose file — there is no
  "bring up the database" step, because the database is not yours to bring up.
- **Writes** go to the Python `aisa-api`, a separate service the container reaches by URL and
  shared key. The dashboard does not write AISA data itself.

The split is what makes the container genuinely stateless. Every durable thing lives behind a
credential the container reads at boot, which is also why a misconfigured container fails at boot
rather than on the first request that needed the missing piece.

## Two compose files, deliberately not interchangeable

The local file BUILDS from the working tree, reads the developer's own environment file, and
publishes its ports on loopback. Every one of those is disqualifying on a server.

They are separate files rather than one file with overrides because the failure mode of the
overridable version is silent: a single file that _can_ be pointed at production is one flag away
from being pointed at production with the fixture credential still in it. Two files make the
mistake visible as an edit — adding a build key to the production file is merging two things
that were separated on purpose.

## The build-time inlining trade-off

`next build` **inlines** every public configuration value into the browser bundle. That is a fact
about the framework, and the design here follows from accepting it rather than working around it.

Little is public. The browser uses the Firebase web SDK only to sign in (every Firestore read is
server-side), so the public inputs are the six Firebase web-config values, the optional
error-monitoring DSN and the build stamp. Consequences, all deliberate:

- **A public value must be present at image build**, supplied as a build argument. Supplying the
  DSN only at run time gives you a server that reports errors and a browser that silently does
  not. An image built with a DSN is specific to where that DSN points.
- **Server credentials are never build inputs.** They are read at run time only, so the build runs
  with zero secrets — which is what makes it safe to build the image anywhere.

The asymmetry between the two halves is the load-bearing part. Public config is checked at build,
because it gets inlined and cannot be fixed afterwards, so a missing or malformed value **fails
the build**. Server config is validated at
**boot**, so a missing value makes the server log every missing group at once and exit before it
serves a request. There is no flag that switches either check off: the predecessor allowed
validation to be disabled for secret-less builds, which meant a green build proved nothing. The
CI build passes explicit non-secret dummy public values instead, so the validator
always runs.

That is also why the image build and the CI verification build are different commands. The CI
build fills the public gap with the shared dummy fixture — useful for proving the tree compiles
without credentials, wrong inside an image, because any placeholder it carried would be inlined
into the shipped bundle.

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
