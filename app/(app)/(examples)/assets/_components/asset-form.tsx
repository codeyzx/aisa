'use client'

/**
 * Canonical form example — TanStack Form (v1) + the Next.js server-action SSR
 * integration (`@tanstack/react-form-nextjs`) + the shadcn `Field` primitives.
 * Reused for BOTH create and edit: the page passes the FORM action (create, or
 * `updateAssetFormAction.bind(null, id)`) and, for edit, the asset's current
 * values as `defaultValues`.
 *
 *  - The form POSTs FormData to `action` (progressive enhancement — a submit
 *    works before the bundle hydrates). `useServerForm` binds that action and
 *    merges the server's validation answer back into these fields; it owns that
 *    wiring so no form re-derives it, and this file keeps every decision that is
 *    about ASSETS.
 *  - Per-field validators are DERIVED from `AssetCreateSchema` (never redefined),
 *    so client feedback and the server re-validation share one source of truth.
 *  - Every input sets `name` so it lands in the POSTed FormData.
 */
import { useCallback, useId, useState } from 'react'
import Link from 'next/link'
import { useForm } from '@tanstack/react-form-nextjs'
import { LoaderCircle } from 'lucide-react'

import { useServerForm, type ServerFormAction } from '@/hooks/use-server-form'

import { assetFormOpts } from '@/features/asset/asset.form-opts'
import { ASSET_FIELD_LABEL } from '@/features/asset/asset.display'
import {
  ASSET_STATUS_LABEL,
  AssetCreateSchema,
  AssetStatusSchema,
  type AssetFormValues,
} from '@/features/asset/asset.schema'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { formErrorText } from '@/lib/data/form-validation'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { ChoiceSelect } from '@/components/ui/choice-select'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Textarea } from '@/components/ui/textarea'

import { AttachmentField } from './attachment-field'

/**
 * Per-field validators, derived straight from the entity schema — no rules or
 * messages are re-declared here. `description` is `.optional()` in the schema;
 * `.unwrap()` yields the inner string validator for the always-present field.
 */
const clientValidators = {
  name: AssetCreateSchema.shape.name,
  description: AssetCreateSchema.shape.description.unwrap(),
}

interface AssetFormProps {
  /** The form action — `createAssetFormAction`, or a bound `updateAssetFormAction`. */
  action: ServerFormAction
  /** Initial field values; the edit page passes the loaded asset. Omit for create. */
  defaultValues?: AssetFormValues
  /** Submit button label. */
  submitLabel?: string
  /**
   * Where Cancel goes. Required, not optional with a `/assets` default: the two
   * pages that render this form arrive from different places, and a default
   * would silently send the edit page's reader somewhere they did not come from
   * — the kind of wrong that never errors.
   */
  cancelHref: string
  /**
   * The list URL to return to after a successful save — POSTed as a hidden field
   * so it survives a no-JS submit, then re-validated server-side and used as the
   * redirect target. The pages pass the SAME safe value here as `cancelHref`, so
   * Cancel and a successful save land in the same place; the server validates it
   * a second time (`safeInternalPath`) before ever redirecting to it.
   */
  returnTo: string
  /**
   * The asset's id — EDIT only. The attachment field downloads by this id
   * (never by a key), so create (no persisted asset) omits it and shows no
   * download control.
   */
  assetId?: string
}

export function AssetForm({
  action,
  defaultValues,
  submitLabel = 'Buat aset',
  cancelHref,
  returnTo,
  assetId,
}: AssetFormProps) {
  const { formAction, transform } = useServerForm(action)

  /**
   * Whether the attachment control has an upload in flight.
   *
   * The form owns this, not `AttachmentField`, because the form owns the submit
   * button — and the submit button is the only thing that can refuse. See the
   * `onUploadingChange` prop for why the window is a real hazard: the field
   * still holds the OLD key until the PUT resolves, so a submit in that window
   * persists the old key and strands the new object under `uploads/`.
   *
   * `useCallback` so the identity is stable: the child mirrors this flag from an
   * effect keyed on it, and a fresh function every render would re-run that
   * effect on every keystroke elsewhere in the form.
   */
  const [isUploading, setIsUploading] = useState(false)
  const onUploadingChange = useCallback(
    (uploading: boolean) => setIsUploading(uploading),
    [],
  )
  const uploadingHintId = useId()

  // `transform` is what merges a server rejection back into these fields, and it
  // is deliberately not spelled here — see `useServerForm` for why merging the
  // initial state instead of the answered one silently uncontrols every input.
  const form = useForm({
    ...assetFormOpts,
    ...(defaultValues && { defaultValues }),
    transform,
  })

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        // The REAL guard; the disabled button below is the affordance that
        // explains it. Both are needed: a disabled default button blocks the
        // click and blocks implicit submission from Enter in a text field, but
        // it cannot block a programmatic `requestSubmit()`, and "the button was
        // disabled" is not a thing the submit path itself knows.
        if (isUploading) {
          event.preventDefault()
          return
        }
        form.handleSubmit()
      }}
    >
      {/* The list URL to return to after a save. A hidden input so it POSTs with
          the form (works with JS off, exactly like the Status field's hidden
          input) — the server reads it as `redirectTo` after re-validating it. */}
      <input type="hidden" name="returnTo" value={returnTo} />
      <FieldGroup>
        <form.Field name="name" validators={{ onBlur: clientValidators.name }}>
          {(field) => {
            const invalid = field.state.meta.errors.length > 0
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor={field.name}>
                  {ASSET_FIELD_LABEL.name}
                </FieldLabel>
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
                {/* An inversion worth keeping: REQUIRED is the unmarked
                    default and OPTIONAL is what carries a marker. The usual way
                    round asterisks most of the form to say "normal" and leaves
                    the exception silent — this marks the exception and says
                    nothing about the rule. It also cannot drift: `description`
                    is the only `.optional()` field in the schema. */}
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

        {/* No client onBlur validator: the coerced number schema's INPUT type is
            `unknown` (it accepts the FormData string), which does not fit a
            client field already holding a number. The number input's min=0 and
            the server's AssetCreateSchema re-validation cover it — the same
            division the Status field uses. */}
        <form.Field name="value">
          {(field) => {
            const invalid = field.state.meta.errors.length > 0
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor={field.name}>Nilai (Rp)</FieldLabel>
                {/* NumericInput owns its hidden raw-value input, so `name` POSTs
                    the number, not the formatted "Rp …" display — `z.coerce.number`
                    turns it back into a number on the server (`AssetCreateSchema`),
                    the same progressive-enhancement path the Status Select uses. */}
                <NumericInput
                  id={field.name}
                  name={field.name}
                  prefix="Rp "
                  min={0}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
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
              {/* Base UI Select is not a native <select>; a hidden input carries
                  the value into the POSTed FormData for progressive enhancement. */}
              <input
                type="hidden"
                name={field.name}
                value={field.state.value}
              />
              {/* The shared ChoiceSelect owns the closed-value label, ordered
                  options, and the null-clear guard. Options derive from the schema
                  enum — add a status to `AssetStatusSchema` and it appears here,
                  named by the same `ASSET_STATUS_LABEL` the list reads; the VALUE
                  stays the raw member (what gets POSTed and parsed). `default`
                  size to match the other form fields, not the compact toolbar. */}
              <ChoiceSelect
                id={field.name}
                size="default"
                value={field.state.value}
                values={AssetStatusSchema.options}
                labels={ASSET_STATUS_LABEL}
                onValueChange={field.handleChange}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="attachmentKey">
          {(field) => (
            <Field>
              {/* Optional, so it carries the marker (the same inversion the
                  description field uses) — attachmentKey is `.optional()` in the
                  schema. */}
              <FieldLabel htmlFor={`${field.name}-file`}>
                Lampiran{' '}
                <span className="font-normal text-muted-foreground">
                  (opsional)
                </span>
              </FieldLabel>
              {/* The control owns the presigned upload, the hidden input that
                  posts the key, and the JS floor — see attachment-field.tsx.
                  Decoupled from the TanStack field generics on purpose: it takes
                  value + onChange, not the field object. */}
              <AttachmentField
                name={field.name}
                value={field.state.value}
                onChange={(key) => field.handleChange(key)}
                assetId={assetId}
                // The key the form loaded with — download is offered only while
                // the field still holds it (an id-keyed download reads the doc).
                persistedKey={defaultValues?.attachmentKey}
                onUploadingChange={onUploadingChange}
              />
            </Field>
          )}
        </form.Field>

        {/* FORM-LEVEL errors only. `formState.errors` is not a list of messages:
            form-core reduces the error map by pushing whatever each validator
            returned, so an entry can be a string (a form-wide message), an
            object (a per-field map merged in from the server), or a shape that
            stringifies to nothing useful. `String(errors[0])` therefore rendered
            a literal "undefined" alert — observed 2026-07-22 on the no-JS path,
            sitting directly under the real "Nama wajib diisi" field error, which
            is exactly the moment a reader is least able to absorb a second,
            meaningless alert.

            Only a string is a message meant for this alert. Nothing is silently
            dropped: per-field errors are rendered at their own input by the
            `<FieldError>` above, which is where a reader can act on them. */}
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

        {/* The actions are a ROW, not the last field. A bare submit button
            sitting in the field flow reads as a fourth field, and leaves the
            form with no way out: without a Cancel, a reader who opened the form
            by mistake has the back button or nothing.
            `justify-end`, Cancel first — the same order ConfirmDialog uses for
            destructive dialogs: the escape is passed over on the
            way to the commit, never the other way round.
            Cancel is a styled <Link>, not <Button render={<Link/>}> — Base UI's
            Button stamps role="button" over the anchor's link role.
            `replace`, so Cancel does not leave the form's URL in history: it swaps
            `/assets/new` for the list, so Back after Cancel returns to wherever
            the reader came from rather than to the form they just abandoned — the
            same no-reopen intent the action's `RedirectType.replace` gives a
            successful submit. */}
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
              <Button
                type="submit"
                disabled={!canSubmit || isUploading}
                // Named only while it exists, so a reader who tabs onto a
                // disabled button hears WHY it is disabled instead of hitting a
                // dead control with no explanation.
                aria-describedby={isUploading ? uploadingHintId : undefined}
              >
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
        {/* `<output>`, not a `<p role="status">`: it carries the same implicit
            live region and is the element the platform already models for "a
            result the form is reporting" — the same reason this repo prefers a
            real <a> over role="link". It announces when it appears, so the
            reason is heard rather than only discoverable by tabbing onto the
            disabled button. Rendered only while the upload runs; an
            always-present empty live region would be one more thing between the
            last field and the buttons. */}
        {isUploading && (
          <output
            id={uploadingHintId}
            className="text-right text-sm text-muted-foreground"
          >
            Menunggu unggahan lampiran selesai sebelum menyimpan…
          </output>
        )}
      </FieldGroup>
    </form>
  )
}
