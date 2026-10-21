/**
 * Dummy PUBLIC Firebase values for runs that have no real environment: the unit
 * test suite (vitest.config.ts) and the secret-less CI build (scripts/build-ci.ts).
 *
 * THESE ARE PLACEHOLDERS AND MUST NEVER BE REAL CREDENTIALS. Everything here is
 * `NEXT_PUBLIC_*` — inlined into the client bundle by `next build` and therefore
 * public by construction — but that is not licence to paste a real project's
 * values in: this file is committed, and a build that accidentally shipped them
 * would point a downstream fork at someone else's Firebase project. Real values
 * come from `.env` (local) or the deploy environment.
 *
 * WHY IT EXISTS AT ALL: so validation ALWAYS RUNS. The predecessor was a bypass
 * flag that turned the check off (see `lib/env/validate.ts`) — which meant a
 * build that passed with no env had proven nothing, and the one guard against a
 * bad boot could itself be switched off. Supplying explicit dummy values instead
 * keeps the validator live in every run: a forgotten or renamed
 * `NEXT_PUBLIC_*` still fails, because the fixture would no longer satisfy the
 * schema.
 *
 * ONE source, two consumers, deliberately — a second copy in vitest.config.ts or
 * the CI workflow would be a set of literals to keep in sync, and the copy that
 * drifted would be the one that let a real gap through.
 */
export const PUBLIC_ENV_FIXTURE = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-aisa.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-aisa',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo-aisa.appspot.com',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000000000',
} as const
