import 'server-only'

/**
 * Firebase Admin Auth. Verifies session cookies, mints them from ID tokens, and
 * resolves user records.
 *
 * WHICH IDENTITY THE CALLS RUN AS. Firestore runs as the ADC identity (on Cloud
 * Run, the runtime service account). Auth may not be able to: the Admin Auth
 * calls this app makes — `createSessionCookie`, and the `accounts:lookup` behind
 * `verifySessionCookie(…, checkRevoked=true)` — need `firebaseauth.*`
 * permissions the runtime account may not hold, and no key may be minted to
 * give them another identity. When `FIREBASE_AUTH_SERVICE_ACCOUNT` is set, Auth
 * runs on its own Admin app whose credential IMPERSONATES that account (IAM
 * Credentials `generateAccessToken`, authorized by the ADC identity holding
 * `roles/iam.serviceAccountTokenCreator` on it). Unset, or against the
 * emulator, Auth shares `adminApp()`.
 */
import {
  applicationDefault,
  getApp,
  getApps,
  initializeApp,
  type App,
  type Credential,
} from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'

import { getFirebaseAdminConfig, isEmulatorTarget } from '@/lib/env/server'
import { adminApp } from './admin-app'

const AUTH_APP_NAME = 'auth-impersonated'

/**
 * A credential that trades the ADC token for a short-lived token of `target`.
 * The Admin SDK caches what this returns and calls again only near expiry, so
 * this costs one IAM round trip an hour, not one per request.
 */
export function impersonatedCredential(
  target: string,
  source: Credential = applicationDefault(),
): Credential {
  return {
    async getAccessToken() {
      const { access_token } = await source.getAccessToken()
      const response = await fetch(
        `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(target)}:generateAccessToken`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            scope: ['https://www.googleapis.com/auth/cloud-platform'],
          }),
        },
      )
      if (!response.ok) {
        // The body names the missing permission; it carries no token.
        throw new Error(
          `Impersonating ${target} failed (${response.status}): ${await response.text()}`,
        )
      }
      const body = (await response.json()) as {
        accessToken: string
        expireTime: string
      }
      return {
        access_token: body.accessToken,
        expires_in: Math.floor(
          (Date.parse(body.expireTime) - Date.now()) / 1000,
        ),
      }
    },
  }
}

function authApp(): App {
  if (isEmulatorTarget()) return adminApp()
  const { projectId, authServiceAccount } = getFirebaseAdminConfig()
  if (!authServiceAccount) return adminApp()
  // Reuse across HMR reloads, like adminApp().
  if (getApps().some((app) => app.name === AUTH_APP_NAME)) {
    return getApp(AUTH_APP_NAME)
  }
  return initializeApp(
    { projectId, credential: impersonatedCredential(authServiceAccount) },
    AUTH_APP_NAME,
  )
}

export function adminAuth(): Auth {
  return getAuth(authApp())
}
