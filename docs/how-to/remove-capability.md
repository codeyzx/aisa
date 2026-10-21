# Remove a capability you do not need

This starter is built to be **deleted from**, not worked around. Every optional
capability is a directory you can `trash`, plus a small, named set of one-line
references. If removing something means editing shared code in three places, that is
a design bug in the capability — not a reason to keep it.

The rule that makes this work: dependencies point **app → feature → lib**, never
back. So a capability comes out with its own directory.

## The shape of every removal

1. **Read the capability's own removal checklist** in its contract (linked below).
   Each one names the specific references only that capability has — a provider, a
   nav entry, a dependency to `pnpm remove`.
2. **`trash` its directory.** Its config schema lives next to its code, so it goes
   with it.
3. **Remove its line from `lib/env/registry.ts`** if it had one. That registry is what
   `instrumentation-node.ts` validates at boot — leaving the line behind means the app
   demands a secret for code that no longer exists.
4. **Remove its line from `lib/auth/capability-availability.ts`** if it had a
   deployment toggle.
5. **Remove its example route and its navigation entry**.
6. **Grep for the import path** and fix each caller the checklist told you to expect.
7. **Prove it**: `pnpm verify` green — it runs `pnpm structure:check`, which is what
   fails on a nav entry still pointing at a route you deleted — then boot the app and
   click through: no route that 500s.

A dead sidebar URL is caught by `structure:check`'s `public-path-match`: it reads every
literal `href` in `app/navigation.ts` and `components/shell/nav-config.ts` and demands a
matching `page.tsx`. Know its edges — it does **not** check the reverse (a surviving
route with no nav entry is not a violation), and it only sees hrefs written as string
literals, not ones built at run time.

## Where each removal checklist lives

- **Client state layers (nuqs)** — [`ui` contract](../reference/contracts/ui.md)
- **Rate limiting, the API envelope, and the security-header baseline** —
  [`http-api` contract](../reference/contracts/http-api.md)
- **An entity and its collection** — [`data` contract](../reference/contracts/data.md)

One capability is shaped differently and is described here because no checklist owns it:

- **Error monitoring** — `trash lib/observability/ instrumentation-client.ts`, drop
  both the call to it in `validateClientEnv()` **and its `import`** at the top of
  `lib/env/client.ts` (dropping only the call leaves an import of a directory you
  just deleted, and typecheck fails), and remove the
  two `Sentry` references in `instrumentation.ts` and `instrumentation-node.ts`. It is
  already optional at run time: with no DSN configured the SDK is never initialized in
  either runtime, so deleting it is about shipping less code, not about turning it off.

## What a capability costs you to keep

A capability that still ships **must** have its configuration to boot. "We never
call it" does not drop the requirement — the gate is boot, not first use. That is
deliberate: it is the reason a misconfigured deployment fails at startup, named,
instead of failing inside a server action the first time a user tries something. If
you do not want the requirement, delete the capability.
