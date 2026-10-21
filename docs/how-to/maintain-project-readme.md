# Maintain a project README

The procedure for writing, adapting and reviewing a root `README.md` — here or in
any project forked from this starter. The rules live in
[the project README contract](../reference/contracts/project-readme.md); this page
is the order you do the work in and the checks that catch you.

## 1. Decide which profile you are writing

- **A starter.** The product is the reusable foundation and the developer
  experience it buys. That is what this repository's README describes.
- **A derived application.** The product is the business application. Its README
  must not keep the starter's product copy — replace it in the same change that
  renames the project, and update
  [product context](../explanation/product-context.md) with the real domain.

If you are unsure which you are, you are a derived application: a starter is a
deliberate, maintained role, not a default.

## 2. Write the product promise before the stack

One sentence: **adopter + recurring problem + outcome**. Not a stack slogan — a
list of framework names tells a reader what you built with, never what they get.

Then answer the six product questions from the contract. Keep each to a line or
two; the depth belongs to product context, which the README summarizes.

## 3. Select only evidenced workflows

List a workflow only when it is covered by an automated test, or is a
documentation/adaptation path with a driven procedure behind it. Anything else
comes out of the summary until someone has observed it. A workflow in a README is
a promise a reader will hold you to.

## 4. Separate required, optional, example, and out of scope

Four different things get confused constantly:

- **Required foundation** — auth, the data path, deployment. A fork keeps them.
- **Optional capability** — ships on, meant to be deleted if unused. See
  [remove a capability](remove-capability.md).
- **Example** — a demo surface proving a capability works, built to be deleted in
  one cut.
- **Out of scope** — what the project will not do, stated so nobody plans around
  it.

Say which is which. A reader who mistakes an example for a product promise builds
on it.

## 5. Keep the happy path short

Three commands and one observable result. Everything longer moves to the owning
tutorial or how-to and gets a link. Specifically:

- Setup detail and test accounts → [local development](../tutorials/local-development.md).
- The verification chain and what it does not cover → [verify a change](verify-change.md).
- Deployment → [deploy](deploy.md).
- Renaming and deleting → [adapt the starter](adapt-starter.md).

Never repeat a credential across documents, even a local emulator one. The setup
script's own output is the single source.

## 6. Generate factual references, never copy them

Command, configuration, capability and layout facts are generated from source:

```bash
pnpm docs:generate
```

If you find yourself typing a list of every script or every environment
variable into the README, stop and link the generated reference instead. A copied
list is stale the day someone edits `package.json`.

## 7. Update the index, manifest, generators and checker in the same change

A new or moved document is not done until:

- `docs/README.md` links it,
- `scripts/docs/manifest.ts` declares its path, type and normative flag,
- the normative ones carry all six metadata fields, and
- the canonical-owner list in `scripts/docs/context.ts` still names one owner per
  area.

## 8. Run the checks

```bash
pnpm docs:check
pnpm format:check
```

`docs:check` proves shape and ownership: the required README areas exist, every
`pnpm <script>` the README names is real, every local link resolves, no document
is unowned, and no second document claims an area. It cannot prove the product
prose is true.

So before you call it done, run the documented path yourself from a clean
checkout — `pnpm install`, `pnpm setup:local`, `pnpm dev` — and reach the
authenticated screen the README promises. `pnpm verify` is the wider gate; see
[verify a change](verify-change.md) for what it still leaves to you.

## Review checklist

Read the result three times, as three different people:

- **A new engineer.** Can you state the problem, the adopter, the outcome, the
  workflows, the scope and the non-scope without opening another file? Can you
  get running from the first code block?
- **A product or technical lead.** Can you tell foundation behaviour from optional
  capability, example and derived-project responsibility? Is any claim made that
  nobody drove?
- **The next fork.** Which sentences are persistence-specific and would become
  false on another database? They belong in a section a fork can rewrite whole,
  not scattered through the quickstart.

Then the contract's own MUST NOT list, which this page deliberately does not
restate — read it at
[the project README contract](../reference/contracts/project-readme.md).
