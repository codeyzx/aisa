# Brief: Server-Action Form Bridge

For the PostgreSQL lead. This repository does not edit that workspace; paths below are
destinations for that repository's own commits.

Status: `OPEN — gap confirmed, and smaller than it first looked`. Effort: S.
Severity: maintainability.

## Correcting The Premise

Two things that were assumed when this topic was raised turned out to be wrong, and both
shrink the job:

- The fork's `hooks/` directory is **not** empty. It already holds `use-debounced-callback.ts`
  and its test, `use-mobile.ts`, and `use-upload.ts`. It simply lacks `use-server-form.ts`.
- There is exactly **one** production copy of the bridge, in
  `app/(app)/(examples)/assets/_components/asset-form.tsx` — `useActionState` at line 105 and
  the transform/merge at lines 145-148, carrying roughly twenty lines of comment explaining
  the defaulting guard.

`impersonate-row.tsx:68` uses bare `useActionState` with no form and no merge, so it is not a
consumer — this repository deliberately left its own impersonate row inline for the same
reason. The other forms (login, create account, account profile) are client-only forms with an
`onSubmit`; they never bind a form server action and must not adopt the hook.

**Re-verified 2026.07.25.** The Better Auth migration added a fifth client-only form,
`app/password/change/change-password-form.tsx`, which reaches its action through `settleAction`
rather than `useActionState`. It is correctly a non-consumer, which is a small piece of evidence
that the rule below holds rather than merely sounding tidy: a whole auth rewrite added a form
and did not add a second bridge. The consumer count is still exactly one.

So this is not de-duplication. It is what the original commit said it was: putting the piece
behind one name before a second consumer copies it, plus a falsifiable test the fork currently
has no equivalent of. The fork also has no template form file, so unlike here there is no
second, template-born copy waiting to drift.

## Why It Ports Cleanly

The hook is fully persistence-agnostic. Its only imports are React's `useActionState` and the
TanStack Next adapter's `initialFormState`, `mergeForm` and `useTransform`. No Firestore
surface, no repo or database import, no `server-only`.

The fork pins the same TanStack Next adapter and the same testing-library and jsdom versions,
and uses the same node-default vitest environment with per-file jsdom opt-in. Both the hook and
its test port byte-for-byte.

## The Change

Copy `hooks/use-server-form.ts` and `hooks/use-server-form.test.tsx` verbatim. No adaptation for
the persistence model is needed or wanted.

Then adopt in the single consumer, the asset form:

- drop `useActionState` from the React import
- drop `initialFormState`, `mergeForm` and `useTransform` from the adapter import, keeping `useForm`
- delete the local form-action type alias in favour of the hook's exported one
- replace the `useActionState` call with `const { formAction, transform } = useServerForm(action)`
- pass `transform` into `useForm` instead of the inline transform

Move the long guard rationale out of the component — the hook's docblock owns it — and leave a
two-line pointer, as was done here.

## Do Not

- **Do not touch the impersonate row or the four client-only forms.** Each conversion would be a
  behaviour change, not a refactor: the impersonate row reads the server error map directly and
  has no client form to merge into, so it needs the raw state the hook deliberately withholds.
  Before touching any file, grep for `useForm` and `action={formAction}` appearing _together_.
- **Do not also pull in the form-error helpers** from this repository's `lib/data/form-validation.ts`.
  The fork lacks both, and that is a separate and larger form-protocol topic. Keep the existing
  error read as-is in this slice. (The template brief lists those helpers as its own prerequisite;
  if that work lands first, this slice simply benefits.)
- **Do not create a template form file** in the fork to give the hook a second consumer. That
  template has no form or page files by design, and adding them is a different decision — see the
  template brief.
- **Do not "improve" the hook** by wrapping `useForm` or by additionally returning the raw action
  state. Both are explicitly refused in its docblock: wrapping would mean accepting every form
  option through the hook and would swallow generic inference, and returning the raw state
  introduces a stale second read.

## An Honesty Requirement That Must Survive The Copy

The hook's docblock and its test carry a paragraph stating what is _not_ claimed: deleting the
defaulting guard fails no test on the pinned adapter version. The guard is kept because it states
the correct rule, not because it is currently load-bearing.

Do not port these files with that caveat stripped. A guard whose justification has been deleted is
a guard the next reader removes.

## Risks

Low blast radius — one component, one new hook, one new test, no server or data-layer file
touched. In order:

1. **Overreach into non-consumers**, as above. The tempting-but-wrong move is to "finish the job".
2. **Silent uncontrolled-input regression.** If the defaulting guard is dropped during the copy,
   the merge writes `undefined` over every default on first render (it merges on key presence, not
   definedness) and each input flips controlled to uncontrolled on its second render. No test
   catches this on the pinned version and `pnpm verify` stays green — which is exactly why the
   browser drive is the gate.
3. **The defaults spread order.** The fork's asset form spreads its default values between the
   form options and the transform. Keep `transform` last and keep that spread intact, or the edit
   page silently renders create defaults.

## Checkable Finish

`pnpm verify` green is necessary and not sufficient here, because risk 2 is invisible to it.

Drive it: open the asset **create** form in a browser, type into each field, and confirm no
controlled-to-uncontrolled warning appears in the console and no value resets on re-render. Then
open the **edit** form for an existing asset and confirm every field renders that asset's stored
values rather than create defaults. Submit both and confirm a server-side validation failure still
renders its message against the right field.

Then prove the new test is load-bearing by reverting the guard and watching it — or the browser
behaviour, if the test cannot see it — fail. Report which of the two caught it; if only the browser
did, say so plainly rather than claiming test coverage.

## Files (in the fork)

- `hooks/use-server-form.ts`, `hooks/use-server-form.test.tsx` (both new)
- `app/(app)/(examples)/assets/_components/asset-form.tsx`
- `docs/reference/contracts/ui.md`

## Sequencing

Independent. If the template brief is taken, this lands first — it is one of that brief's
prerequisites, and doing it there instead would duplicate the work.
