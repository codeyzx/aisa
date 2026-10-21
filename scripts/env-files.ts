/**
 * How every CLI in this repo resolves `.env` files — one owner, one precedence.
 *
 * Node does not read `.env` on its own, and these scripts run as plain
 * `node scripts/*.ts` with no bundler in front of them. So each one that needs
 * configuration has to load it, and the ONLY thing that matters is that they all
 * load it the SAME way: a snapshot CLI that resolved `FIREBASE_PROJECT_ID`
 * differently from the migration runner would connect to a different project
 * than the runner whose output the operator just read.
 *
 * PRECEDENCE — exported environment, then `.env.local`, then `.env`. It is
 * Next.js's own order, so a developer's expectation from running the app carries
 * over to the CLIs. Both halves come free from `process.loadEnvFile`, which never
 * overwrites a variable that is already set: exported values survive, and among
 * the files the first one loaded wins. Driven on Node v24.18.0 — an exported
 * value beat both files, and `.env.local` beat `.env`.
 *
 * A missing file is normal, not an error: `.env.local` is a personal override
 * most checkouts do not have, and `process.loadEnvFile` throws on an absent path.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** In load order, so the earlier file wins. */
const ENV_FILES = ['.env.local', '.env']

/**
 * Load this project's env files into `process.env` without disturbing anything
 * already exported.
 *
 * Loads EVERY key, never just the one the caller wanted. Resolving a project id
 * from `.env` while leaving `FIRESTORE_EMULATOR_HOST` unread would aim a run
 * whose banner names an emulator project at PRODUCTION for that same project —
 * the banner and the SDK have to see one world.
 */
export function loadEnvFiles(cwd: string = process.cwd()): void {
  for (const file of ENV_FILES) {
    const path = join(cwd, file)
    if (existsSync(path)) process.loadEnvFile(path)
  }
}
