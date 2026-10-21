import 'server-only'

import * as z from 'zod'

import { once, requiredVar, validate } from '../env/validate'

/**
 * Impersonation configuration — owned BY the capability, so removing the feature
 * takes its schema with it (see the removal checklist in
 * `docs/reference/contracts/impersonation.md`).
 *
 * A key of its OWN rather than reusing the Firebase private key: that trick would
 * buy free revocation by rotation and pay by coupling the HMAC to a credential
 * the whole app already requires — which would make impersonation un-deletable.
 * A separate key keeps the capability deletable, and that is the deliberate
 * choice. 32 chars is the floor because the secret's entire value is its entropy.
 */
const ImpersonationSchema = z.object({
  IMPERSONATION_SECRET: requiredVar('IMPERSONATION_SECRET').min(
    32,
    'IMPERSONATION_SECRET must be at least 32 characters',
  ),
})

/** The HMAC signing secret for impersonation tickets. */
export const getImpersonationConfig = once((): { secret: string } => {
  const env = validate(
    ImpersonationSchema,
    { IMPERSONATION_SECRET: process.env.IMPERSONATION_SECRET },
    'server impersonation',
  )
  return { secret: env.IMPERSONATION_SECRET }
})
