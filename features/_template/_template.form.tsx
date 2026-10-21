'use client'

// TEMPLATE — copy-me starter for a new entity's create/edit form. See
// `_template.schema.ts` for the token legend. Copy to
// `features/<entity>/<entity>.form.tsx` — only if the entity has a form; it
// needs the `<entity>.form-opts.ts` sibling. (`features/asset/` keeps its form
// in the route folder instead, at
// `app/(app)/(examples)/assets/_components/asset-form.tsx`. If you put yours
// there too, repoint the two `./__entity__.*` imports at `@/features/<entity>/…`
// — they are relative here so the copy compiles beside its generated siblings.)
//
// ONE form serves BOTH create and edit. The page passes the FORM action
// (`create__Entity__FormAction`, or `update__Entity__FormAction.bind(null, id)`)
// and, for edit, the stored values as `defaultValues`. The page is also what
// gates on the capability — this component takes an action it cannot inspect,
// so it is not a boundary and must not pretend to be one.
//
// `useServerForm` owns the `useActionState` + server-answer merge that is
// identical in every form and expensive to get wrong; re-deriving it here is
// the mistake this file exists to prevent. What stays here is what is about
// YOUR entity: its fields, its labels, and where Cancel goes.
//
// Every input sets `name`, because `name` is what lands in the POSTed FormData
// — and that POST is what lets a submit work BEFORE the bundle hydrates.
//
// EXCLUDED from typecheck by the `_template.*` name.

// Only the placeholder needs this: `rules-of-hooks` reads a hook call inside
// `__Entity__Form` as a call from a plain function, because a component name
// must begin with an uppercase letter and `__` does not. Replacing the token
// with your PascalCase name puts the rule back in force — do not carry this
// line into the copy.
// oxlint-disable react-hooks/rules-of-hooks

import Link from 'next/link'
import { useForm } from '@tanstack/react-form-nextjs'
import { LoaderCircle } from 'lucide-react'

import { useServerForm, type ServerFormAction } from '@/hooks/use-server-form'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { ChoiceSelect } from '@/components/ui/choice-select'
import { formErrorText } from '@/lib/data/form-validation'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import { __entity__FormOpts } from './__entity__.form-opts'
import {
  __ENTITY___STATUS_LABEL,
  __Entity__CreateSchema,
  __Entity__StatusSchema,
  type __Entity__FormValues,
} from './__entity__.schema'

/**
 * Per-field validators, DERIVED from the entity schema — no rule and no message
 * is re-declared here, so client feedback and the server's re-validation cannot
 * drift apart. `description` is `.optional()` in the schema; `.unwrap()` yields
 * the inner string validator, which is what an always-present controlled input
 * actually holds.
 *
 * A field whose schema COERCES (`z.coerce.number()`, a `z.union([...]).transform`)
 * gets no entry here: its input type is not what the client field holds. Leave
 * it to the server re-validation rather than inventing a second rule.
 */
const clientValidators = {
  name: __Entity__CreateSchema.shape.name,
  description: __Entity__CreateSchema.shape.description.unwrap(),
}

interface __Entity__FormProps {
  /** `create__Entity__FormAction`, or a bound `update__Entity__FormAction`. */
  action: ServerFormAction
  /** Stored values for edit — `__entity__FormValues(entity)`. Omit for create. */
  defaultValues?: __Entity__FormValues
  /** Submit button label. */
  submitLabel?: string
  /**
   * Where Cancel goes. Required, and deliberately not defaulted to the list:
   * create and edit are reached from different places, and a default would
   * silently send a reader somewhere they never came from — the kind of wrong
   * that never errors.
   */
  cancelHref: string
  /**
   * The list URL to return to after a successful save. POSTed as a hidden field
   * so it survives a pre-hydration submit, then re-validated server-side and
   * used as the redirect target. Pass the same safe value as `cancelHref` and
   * Cancel and a save land in the same place.
   */
  returnTo: string
}

export function __Entity__Form({
  action,
  defaultValues,
  submitLabel = 'Simpan',
  cancelHref,
  returnTo,
}: __Entity__FormProps) {
  const { formAction, transform } = useServerForm(action)

  // `transform` merges a server rejection back into these fields. It is not
  // spelled out here on purpose — see `useServerForm` for why merging the
  // unanswered state silently uncontrols every input.
  const form = useForm({
    ...__entity__FormOpts,
    ...(defaultValues && { defaultValues }),
    transform,
  })

  return (
    <form action={formAction} onSubmit={() => form.handleSubmit()}>
      {/* A hidden input, so the return URL POSTs with the form on the
          pre-hydration path too; the server re-validates it before redirecting. */}
      <input type="hidden" name="returnTo" value={returnTo} />
      <FieldGroup>
        <form.Field name="name" validators={{ onBlur: clientValidators.name }}>
          {(field) => {
            const invalid = field.state.meta.errors.length > 0
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor={field.name}>Nama</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={invalid}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )
          }}
        </form.Field>

        <form.Field
          name="description"
          validators={{ onBlur: clientValidators.description }}
        >
          {(field) => {
            const invalid = field.state.meta.errors.length > 0
            return (
              <Field data-invalid={invalid || undefined}>
                {/* Keep the inversion: REQUIRED is the unmarked default, and
                    OPTIONAL is what carries a marker. Asterisking most of a form
                    to say "normal" leaves the exception silent; this marks the
                    exception and says nothing about the rule. Mark exactly the
                    fields that are `.optional()` in the schema. */}
                <FieldLabel htmlFor={field.name}>
                  Deskripsi{' '}
                  <span className="font-normal text-muted-foreground">
                    (opsional)
                  </span>
                </FieldLabel>
                <Textarea
                  id={field.name}
                  name={field.name}
                  rows={3}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={invalid}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="status">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>Status</FieldLabel>
              {/* Base UI's Select is not a native <select>, so a hidden input is
                  what carries the value into the POSTed FormData. */}
              <input
                type="hidden"
                name={field.name}
                value={field.state.value}
              />
              {/* ChoiceSelect owns the closed-value label, the option order and
                  the null-clear guard. Options come from the schema enum, named
                  by the same label map every other surface reads — add a member
                  to `__Entity__StatusSchema` and it appears here, while the
                  POSTed VALUE stays the raw member. `default` size to match the
                  other form fields rather than the compact toolbar one. */}
              <ChoiceSelect
                id={field.name}
                size="default"
                value={field.state.value}
                values={__Entity__StatusSchema.options}
                labels={__ENTITY___STATUS_LABEL}
                onValueChange={field.handleChange}
              />
            </Field>
          )}
        </form.Field>

        {/* FORM-LEVEL errors only. `formState.errors` is not a list of messages:
            each entry is whatever a validator returned — a string (form-wide), or
            an object (the per-field map merged in from the server). Rendering
            entry zero blindly puts a literal "undefined" alert on screen, right
            under the real field error, which is the moment a reader can least
            afford a second meaningless alert. Nothing is dropped: per-field
            issues render at their own input through `<FieldError>` above. */}
        <form.Subscribe selector={(formState) => formState.errors}>
          {(errors) => {
            const message = formErrorText(errors)
            return message ? (
              <Alert variant="destructive">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            ) : null
          }}
        </form.Subscribe>

        {/* The actions are a ROW, not a last field: a bare submit sitting in the
            field flow reads as one more field, and leaves a reader who opened the
            form by mistake with the back button or nothing. Cancel first, the
            same order as the destructive dialogs — the escape is passed over on
            the way to the commit, never the other way round.
            Cancel is a styled <Link>, not <Button render={<Link/>}>: Base UI's
            Button stamps role="button" over the anchor's link role.
            `replace`, so Cancel does not leave the form's URL in history — Back
            then returns to wherever the reader came from rather than to the form
            they just abandoned. */}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-5">
          <Link
            href={cancelHref}
            replace
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Batal
          </Link>
          <form.Subscribe
            selector={(formState) => [
              formState.canSubmit,
              formState.isSubmitting,
            ]}
          >
            {([canSubmit, isSubmitting]) => (
              <Button type="submit" disabled={!canSubmit}>
                {isSubmitting ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Menyimpan…
                  </>
                ) : (
                  submitLabel
                )}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </FieldGroup>
    </form>
  )
}
