# syntax=docker/dockerfile:1

# Debian (glibc) base, deliberately not Alpine: native deps resolve prebuilt glibc binaries,
# so no C++ toolchain is needed. musl would risk source rebuilds for no benefit here.
# The EXACT patch, not the `24` floating tag, and not because a patch bump is
# expected to break the app — because a floating tag makes two builds of the same
# commit run different runtimes, which is the thing that turns "it passed on my
# machine" into an unfalsifiable claim. `.node-version` is the source and
# `pnpm node:check` proves this line still agrees with it.
ARG NODE_VERSION=24.18.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
# corepack pins pnpm to the `packageManager` field in package.json — no version to drift here.
RUN corepack enable
WORKDIR /app

# Deps resolve from the lockfile alone, so this layer is cached until a manifest changes.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# `prepare` is a lifecycle script, so `pnpm install` RUNS it — and a script it cannot
# find is not skipped, it is a MODULE_NOT_FOUND that fails the whole install. This one
# file is therefore a build input even though nothing in the image ever uses its effect:
# it installs git hooks, sees no `.git` here, and no-ops. Copied rather than skipped with
# `--ignore-scripts`, which is far broader — it would also skip the dependency builds
# `pnpm-workspace.yaml` explicitly allows.
COPY scripts/install-hooks.ts ./scripts/
# `strictDepBuilds=false` demotes pnpm 11's ignored-build error back to a warning. The only
# ignored build is `re2` — an OPTIONAL dep of a `firebase-tools` transitive that local installs
# skip too. It is emulator tooling: never imported by app code, never in the standalone trace.
# This is narrower than `--ignore-scripts`, which would also silently skip the builds that
# `pnpm-workspace.yaml` explicitly allows.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --config.strictDepBuilds=false

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `next build` INLINES NEXT_PUBLIC_* into the client bundle, so they must be present at BUILD
# time — supplying them only at run time ships a browser wired to `undefined`. The image is
# therefore environment-specific: a prod image cannot be reused for staging. That is the
# accepted trade (the alternative, reading config on the server per request, was weighed and
# declined).
#
# These are NOT secrets. Firebase's web config is public by design and ships in every client
# bundle; pass them as CI `vars`, not `secrets`. Server credentials (FIREBASE_PRIVATE_KEY,
# S3_*) are never build inputs and are never baked — they arrive at run time.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
# OPTIONAL — omit it and the image simply ships with error monitoring off, which is the
# capability's whole contract. It has to be a BUILD arg all the same: the browser half is
# initialized from the inlined value, so supplying the DSN only at run time would give you
# a server that reports and a browser that silently does not.
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

# ⚠️ TEST-ONLY, AND LEAVE THEM EMPTY FOR ANYTHING YOU DEPLOY.
#
# These point the BROWSER half at local Firebase emulators. They exist because
# `pnpm test:e2e:ci` has to drive a real browser through a real sign-in against
# the emulator, and the browser only ever learns about an emulator from an
# inlined `NEXT_PUBLIC_*` (lib/firebase/client-auth.ts calls
# `connectAuthEmulator` exactly when `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`
# is set). Inlined means BUILD time — there is no way to supply this at run time
# and no way to add it to an image that was built without it.
#
# The consequence is unavoidable rather than chosen, and it is the same trade the
# six public vars above already carry: an image that can talk to an emulator is a
# DIFFERENT IMAGE from a production one. The E2E image is a test artifact. Build
# a deployable image without these (the default: empty, so
# `getClientEmulatorConfig()` returns undefined and nothing connects) and the
# browser talks to real Firebase.
#
# THE FAILURE THIS WOULD CAUSE IF MISUSED: an image built with these set, shipped
# to production, sends every user's sign-in to a host that is not there — and it
# fails in the BROWSER, so the server looks healthy the whole time.
ARG NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST
ARG NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST
ENV NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=$NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST \
    NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST=$NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST
# The build stamp, needed HERE as well as in the runner — and for a different reason.
# The runner's copy is read from process.env at run time by /api/health; this one becomes
# the `release` tag on every error-monitoring event, and a release has to be INLINED into
# the client bundle, which only a NEXT_PUBLIC_* is. One `--build-arg BUILD_SHA` still
# drives both, so there is no second value for a deployer to remember.
ARG BUILD_SHA=unknown
ENV NEXT_PUBLIC_BUILD_SHA=$BUILD_SHA
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID

# `next.config.ts` calls `validateClientEnv()`, so a forgotten build-arg FAILS THIS BUILD
# instead of shipping an app that boots fine and only breaks in a browser — the failure mode
# where localhost ends up in a production config. There is no bypass flag to reach for: the
# check cannot be switched off, only satisfied. Server env is NOT validated here (nothing
# forces it during build, verified), so no secret is required to build.
#
# `pnpm build`, NOT `pnpm build:ci`: this image must inline the REAL public values passed as
# build args. `build:ci` fills gaps with non-secret dummies, which is right for a compile-only
# gate and would be a silently broken production image here.
RUN pnpm build

# NOT `FROM base`, and that is the point: `base` exists to carry corepack/pnpm for the
# BUILD, and the runtime needs neither — CMD is `node server.js` and the healthcheck is
# `node -e`. Deriving the runner from the raw image keeps package-manager tooling out of
# the artifact that actually ships.
#
# Removing the bundled npm is a SECURITY fix with a CI receipt, not tidying. The Trivy
# gate failed on 2026-07-22 with 4 findings (1 CRITICAL, 3 HIGH) and every one of them
# was inside /usr/local/lib/node_modules/npm/node_modules — npm's own vendored
# brace-expansion, tar and undici. NOT ONE was an application dependency, so no lockfile
# change could have cleared them. Nothing at run time invokes npm, so the honest fix is
# to stop shipping it rather than to .trivyignore a vulnerability that is really there.
#
# This is the same rule the HEALTHCHECK below already follows — no curl, no wget, because
# the shipped image should contain what it runs and nothing else.
#
# corepack is deliberately left alone: it was not implicated in any finding, and this
# stage never runs `corepack enable`, so it ships inert.
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# NEXT_TELEMETRY_DISABLED was inherited from `base` before this stage stopped deriving
# from it; it is restated here so dropping that inheritance changes nothing observable.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN useradd --system --uid 1001 --create-home nextjs

# Next's standalone output bundles server.js plus only the traced deps, but NOT public/ or
# .next/static — those are copied by hand. Miss them and the app boots but serves no assets.
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static

# Build stamp ("commit + builtAt"), reported by GET /api/health. Both default to
# `unknown`, which is also what `pnpm dev` reports — there is no build to stamp there, and
# `unknown` is the honest answer rather than a placeholder that looks like a version.
#
# In the RUNNER, not the builder, and that is not a style choice: these are read from
# process.env at RUN time by `getBuildInfo()` (they are not NEXT_PUBLIC_*, so nothing
# inlines them into a bundle). Set in the builder they would simply not exist here.
#
# LAST, for the same kind of reason: an ENV invalidates every layer below it, and the SHA
# changes on every single commit — put this above the COPYs and each build re-does them all.
# Nothing below it but metadata, so a new SHA rebuilds nothing.
ARG BUILD_SHA=unknown
ARG BUILT_AT=unknown
ENV BUILD_SHA=$BUILD_SHA \
    BUILT_AT=$BUILT_AT

USER nextjs
EXPOSE 3000

# Liveness, owned by the IMAGE rather than by each orchestrator that runs it — compose
# inherits this automatically, and a k8s probe can point at the same path. One definition,
# so "is it up" cannot mean two different things in two files.
#
# `node -e` with the builtin global `fetch`, NOT curl or wget: this is a `-slim` base and
# neither is installed. Adding one to the runtime image for a healthcheck would grow the
# attack surface of the shipped artifact to answer a question node can already answer.
#
# `process.env.PORT`, not a literal 3000 — the runner sets PORT and a deployer may override
# it, and a healthcheck hard-wired to the default would report a healthy container as dead.
# Dockerfile variable substitution does NOT apply to HEALTHCHECK, so `${...}` here reaches
# node verbatim, which is exactly what is wanted.
#
# `--start-period` covers boot: instrumentation.ts validates env and EXITS on failure, so
# the first seconds are legitimately not-yet-listening rather than unhealthy.
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# `node server.js` and NOT an npm/pnpm wrapper, so the Next server is PID 1 and receives
# SIGTERM directly. Next's App Router server installs its own SIGTERM/SIGINT handler and
# drains in-flight requests (verified in node_modules/next/dist/docs/01-app/02-guides/
# self-hosting.md, "Manual Graceful Shutdowns"); a shell wrapper in between would swallow
# the signal and turn every deploy into a hard kill. Do NOT set NEXT_MANUAL_SIG_HANDLE —
# that is the Pages-router escape hatch and it REPLACES the drain with your handler.
CMD ["node", "server.js"]
