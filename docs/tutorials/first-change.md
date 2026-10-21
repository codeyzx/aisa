# Your first change

One small edit, seen in the browser, then verified the way this repo means
"verified". It takes a few minutes and teaches the loop you will use for every
change after it.

Start from [Get the app running locally](local-development.md) — `pnpm dev` serving
http://localhost:3000.

## The change: name the product

Product identity lives in exactly one module, `lib/app-config.ts`, which exports two
strings. It is a plain module rather than environment config, so the client sidebar
and the server-rendered root layout read the same value.

Edit it:

```ts
export const APP_NAME = 'Inventaris'
export const ORG_NAME = 'Contoh Corp'
```

## See it

With `pnpm dev` running, the change hot-reloads. Look at three surfaces, because they
are reached by three different paths and this is what proves there is no second place
holding the old name:

1. **The browser tab title** — server-rendered metadata from the root layout.
2. **The sidebar lockup** — a client island; `ORG_NAME` is the small line above
   `APP_NAME`.
3. **The sign-in page** at `/login`, signed out.

If any of the three still says `AISA`, you found a hard-coded copy — fix it at
the source rather than adding a second constant.

## Verify it

Seeing it work in one browser is the _driven_ half. The other half is the chain.
Static green is necessary and never sufficient here — this repo's worst bug class
passes typecheck, lint and build — so both halves are required:

```bash
pnpm check:static
pnpm test:unit
```

Then format only what you touched, never the whole tree:

```bash
pnpm exec oxfmt lib/app-config.ts
```

That is the whole loop for a change this size. The full chain, the driven matrix, and
the checks that only bite on bigger changes are in
[verify a change](../how-to/verify-change.md) — read it before you commit anything
that touches data, auth, or a query.

## What you just learned about the shape of the repo

- **One fact, one owner.** `APP_NAME` had one home and every surface read it. When
  you are about to hand-write a lookup, a set, or a special case, find the module that
  already owns that concept first.
- **Green is a gate, not proof.** Report the behaviour you observed, not the command
  that exited zero.

## Next

- [Add a Firestore-backed feature](../how-to/add-feature.md) — the real work, from the
  `_template` files.
- [Adapt the starter](../how-to/adapt-starter.md) — rename, delete, configure.
- [Verify a change](../how-to/verify-change.md) — the full chain plus the driven steps.
