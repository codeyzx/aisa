import { apiOk } from '@/lib/api/response'
import { getBuildInfo } from '@/lib/env/server'

/**
 * Liveness probe. Unauthenticated BY DESIGN — it leaks no data, and a health
 * endpoint that is not public is not a health endpoint (`lib/auth/constants.ts`
 * carries the matching PUBLIC_PREFIXES entry; without it this 307s to /login and
 * a k8s probe reads the login page as a failure).
 *
 * LIVENESS, NOT READINESS: it does not ping Firestore. A health endpoint that
 * checks the database converts a transient DB blip into a killed pod, and turns
 * every probe into billable reads. If a readiness probe is ever wanted it is a
 * SEPARATE route with its own argument — not a flag on this one.
 *
 * It answers the envelope like every other route (docs/reference/contracts/http-api.md): this
 * is our route, so the contract applies. A prober reads the 200, not the body.
 *
 * `force-dynamic` because a cached health check is not a health check — it would
 * answer 200 from a prerender long after the process stopped being able to.
 *
 * THE BUILD STAMP (commit + builtAt) answers `'unknown'` under `pnpm dev`,
 * and that is the honest answer rather than a placeholder: there is no build to
 * stamp. The Containerfile populates BUILD_SHA / BUILT_AT at image build, so a
 * deployed image reports the commit it was cut from — which is the entire point
 * of stamping, and the one question a prober's 200 cannot answer.
 */
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  const build = getBuildInfo()
  return apiOk(request, {
    status: 'ok',
    sha: build.sha,
    builtAt: build.builtAt,
  })
}
