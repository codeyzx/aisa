/**
 * Refuse a production image reference that is not pinned by digest.
 *
 * `compose.prod.yaml` requires `APP_IMAGE` but can only check that it is
 * PRESENT: compose has no way to assert the shape of a value, so
 * `APP_IMAGE=ghcr.io/attacker/whatever:latest` is accepted and run. This is the
 * check that file's own comment says to put where the deploy is cut.
 *
 * WHY A TAG IS NOT ENOUGH. A tag is a mutable pointer. `:latest` and `:v1.4.2`
 * alike can be repointed at other bytes after you tested them, so the build stamp
 * `/api/health` reports would describe an image you are no longer running — and a
 * rollback to "the same tag" can land somewhere else entirely. `image@sha256:…`
 * cannot be repointed: the digest IS the bytes.
 *
 * HOW IT RESOLVES `APP_IMAGE`, AND WHY NOT THE SHARED LOADER. Exactly the way
 * compose does — exported environment, then the project directory's `.env`.
 * `scripts/env-files.ts` would ALSO read `.env.local`, and compose never reads
 * that file, so this would end up validating a value the deploy will not use:
 * green here, a different image running. Checking a variable somebody else
 * resolves means resolving it their way, not the way the rest of this repo does.
 *
 * WHAT IT DOES NOT PROVE: that the digest names an image that exists, that it is
 * the one you built, or that it is reachable. This is offline shape validation.
 * Nothing here contacts a registry.
 *
 * Run: `pnpm image:check`
 */
import { existsSync } from 'node:fs'

/**
 * A digest-pinned reference: `name@sha256:<64 lowercase hex>`.
 *
 * A tag MAY precede the digest (`app:v1.4.2@sha256:…`) and that is still pinned —
 * docker resolves the digest and treats the tag as a label, so the bytes are
 * fixed. The digest is anchored at the end and its length is exact: a truncated
 * one (`sha256:abc123`) is the shape a copy-paste produces, and it is not a
 * digest.
 */
const DIGEST_PINNED = /@sha256:[0-9a-f]{64}$/

/** Whether `ref` names an image by digest rather than by a movable tag. */
export function isDigestPinned(ref: string): boolean {
  return DIGEST_PINNED.test(ref.trim())
}

/** Only when run as a CLI — importing this for the predicate must check nothing. */
if (process.argv[1]?.endsWith('check-image-digest.ts')) {
  // Compose reads the project directory's `.env` for `${...}` interpolation, `-f`
  // or no `-f`. `loadEnvFile` never overwrites an exported value, so one call
  // reproduces compose's precedence.
  if (existsSync('.env')) process.loadEnvFile('.env')

  const ref = process.env.APP_IMAGE?.trim()

  if (!ref) {
    console.error(
      'image:check: APP_IMAGE is not set.\n' +
        'Checked the exported environment, then .env — the two places compose reads it.\n' +
        'There is no deploy to check without it; compose.prod.yaml refuses to start too.',
    )
    process.exitCode = 1
  } else if (!isDigestPinned(ref)) {
    console.error(
      `image:check: APP_IMAGE is not pinned by digest.\n  ${ref}\n` +
        'Expected <name>@sha256:<64 hex>. A tag can be repointed at other bytes ' +
        'after you tested them, so what you deploy is not what you reviewed.\n' +
        'Get the digest with: docker buildx imagetools inspect <name>:<tag>',
    )
    process.exitCode = 1
  } else {
    console.log(`image:check: OK — ${ref} is pinned by digest.`)
  }
}
