# Adapt the starter to your project

This is a template, not a finished app, and not a spec to conform to. Every convention
here is opinionated so you can move on day one, and every one states its reasoning in a
code comment or a contract. Once you understand a trade-off, changing it is expected.

Your domain lives in `features/<entity>/`. `lib/` is the shared infrastructure you keep
— env, firebase, auth, the `schema → repo → action` spine, format, error — and an
import rule keeps the two apart. `features/aisa/` is this deployment's feature.
`features/_template/` holds fill-in placeholders to copy.

**Do it in this order**: rename, remove, configure, verify. Renaming after deleting
means renaming less; configuring before deleting means configuring things you are about
to throw away.

## 1. Rename

- **Product identity — one file.** `lib/app-config.ts` exports `APP_NAME` (the browser
  tab, the sidebar lockup, the sign-in page) and `ORG_NAME` (the small line above it).
  A plain module, not env, so the client sidebar island and the server root layout read
  the same value. There is no second place.

- **Package name.** `package.json#name` is `aisa`.

- **Locale, timezone, currency.** UI copy is Bahasa Indonesia by default, and the
  formatting facts are pinned in `lib/format/locale.ts`: the `<html lang>` (`id`), the
  locale (`id-ID`), the zone (`Asia/Jakarta`), the currency (`IDR`), and that
  currency's minor-unit digits (`0`). A non-Indonesian fork changes them there and
  nowhere else — nothing else hard-codes a locale, because every formatter reads that
  module — and a fork that changes the currency changes the digits with it, or the
  money formatter drops the subunit.

- **Search indexing is OFF, on three legs.** The app ships private and authenticated,
  so a noindex policy is spread across root `robots` metadata (`app/layout.tsx`),
  `app/robots.ts` (disallow all), and an `X-Robots-Tag` header (`next.config.ts`). If
  you fork this into a **public** app, relax all three together — relaxing one is a
  policy that half-applies.

- **The demo Firebase project id.** `demo-aisa` is the local-emulator default; grep
  for it to find every occurrence. The canonical set point is the `emulators` script in
  `package.json` (`--project demo-aisa`); `.env.example` presets it as
  `FIREBASE_PROJECT_ID`, and the emulator-facing scripts fall back to it when that
  variable is unset. For local emulator work you can leave it exactly as it is — your
  real project id arrives through env in step 3, not by editing these.

- **Your own entities.** Copy the placeholders in `features/_template/` into your own
  entity rather than reshaping an existing feature. See [add a feature](add-feature.md).

## 2. Remove what you do not need

Deletion is the primary adaptation move here, and a half-deleted capability is the main
risk: it leaves imports that still compile and configuration that lies. Each optional
capability has its own checklist, and an entity is **not** a one-shot delete — it has
tentacles beyond its feature folder (routes, the test layer under `test/`, e2e specs,
seed, nav, capability and index wiring). The complete list lives in the
[data contract's removal checklist](../reference/contracts/data.md#removal-checklist-deleting-an-entity)
— follow it rather than trusting a `trash` of the folder alone.

[Remove a capability](remove-capability.md) owns the per-capability workflow end to end.

Two things to grep for once you think you are finished, because nothing else catches
them:

- **The capability's name**, across the whole repo. The hits are your real checklist.
  `pnpm structure:check` covers part of it — a declared-but-unused or used-but-undeclared
  capability fails there — but it cannot see an orphaned env var or a stale doc.
- **`firestore.indexes.json`.** An index for a deleted feature is harmless to run and
  still a lie about what the app queries.

## 3. Configure

`pnpm setup:local` creates `.env` from `.env.example`, seeds the emulator accounts, and
prints them. `AISA_API_KEY` it cannot generate: set it to the key your `aisa-api`
expects. What the script does and why is in
[local development](../tutorials/local-development.md).

Apart from those, a fresh copy ships a working local-emulator configuration. **Every
preset value must be replaced for a real project**, and the emulator-host blocks
commented out — the file says so at each one.

The full variable list, which module owns each one, and whether it is validated at build
or at boot: [configuration reference](../reference/configuration.md). Public values (only
the optional error-monitoring DSN today) are inlined and validated at build, private ones
are validated at boot, and neither check can be switched off — if a variable is in your way, delete the capability that requires it. The trade-off
that split buys is [the deployment model](../explanation/deployment-model.md).

**Firestore rules and indexes deploy out of band** — they are not in the container
image. See [deploy](deploy.md).

## 4. Verify

Run [the verify chain and the driven steps](verify-change.md). Green is necessary and
never sufficient: prove the env fail-fast still bites, run `pnpm indexes:check` against
an emulator you actually exercised, and drive your renamed app in a browser.

## Keep the README true

The README is the first thing a new person reads and the first thing to go stale after
an adaptation like this. [Maintaining the project README](maintain-project-readme.md)
owns keeping it honest.

## If you want Windows as a supported target

Nothing here is known to be Windows-hostile, and the two places that would break are
already handled: `scripts/_safety.ts` reads the Windows console device rather than
`/dev/tty`, and the setup and reset scripts are Node rather than shell. It simply has
not been driven there, and this repo does not claim what it has not driven.

To make the claim real, add a CI lane that runs `pnpm check:static` and `pnpm test:unit`
on `windows-latest`. Otherwise the claim outruns the evidence.
