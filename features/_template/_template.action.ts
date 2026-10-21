// TEMPLATE — copy-me starter for a new entity's server actions. See
// `_template.schema.ts` for the token legend. Copy to
// `features/<entity>/<entity>.action.ts`.
//
// ONE entry per operation (docs/reference/contracts/data.md), all grouped here.
// Two entry KINDS, distinguished by naming:
//   - `<verb><Entity>FormAction` — FORM entry: FormData in, redirect / form
//     state out. Wraps `runFormAction`. For form-triggered mutations. Needs the
//     shared `<entity>.form-opts.ts` sibling.
//   - `<verb><Entity>Action` — PROGRAMMATIC entry: typed args in, an
//     `ActionResult<T>` out. Wraps `runAction`. For button / imperative
//     mutations.
//
// Both wrappers do auth-gate -> validate -> repo write -> audit -> revalidate.
// NEVER expose the same operation through both kinds. This template shows create
// + edit (form) and delete (programmatic); a status toggle would be
// `archive__Entity__Action` (same shape as delete). The capability comes from
// `__entity__.capability.ts`, which will not compile until you declare it.
//
// EXCLUDED from typecheck by the `_template.*` name.

'use server'

import 'server-only'

import { revalidatePath } from 'next/cache'
import { createServerValidate } from '@tanstack/react-form-nextjs'

import { runAction, type ActionResult } from '@/lib/data/action-result'
import { toFormErrors } from '@/lib/data/form-validation'
import { runFormAction } from '@/lib/data/form-action'
import { audit } from '@/lib/data/audit'
import { __ENTITY___WRITE } from './__entity__.capability'
import {
  create__Entity__,
  delete__Entity__,
  update__Entity__,
} from './__entity__.repo'
import {
  __Entity__CreateSchema,
  type __Entity__Create,
  type __Entity__FormValues,
} from './__entity__.schema'

import { __entity__FormOpts } from './__entity__.form-opts'

// --- FORM entry (create) ---

/**
 * The ONE form-values → create-input projection, shared by the validator and
 * BOTH mutations, so a new field is added in ONE place (not three that desync).
 * Reshape for your fields; map '' → undefined for OPTIONAL ones — a controlled
 * input posts '' for "empty", and an empty string on the doc is not the same as
 * an absent field. See `features/asset/asset.action.ts` for a fuller version
 * (numeric coercion + an attachment key).
 */
function __entity__FormInput(values: __Entity__FormValues) {
  return {
    name: values.name,
    description: values.description || undefined,
    status: values.status,
  }
}

/**
 * Parse the form values into a validated create-input for the write. Called in a
 * mutation `run`, where `runFormAction` has ALREADY validated, so `.parse` will
 * not throw — it applies the schema's coercions so the repo persists real types,
 * never the raw FormData strings.
 */
function to__Entity__Input(values: __Entity__FormValues): __Entity__Create {
  return __Entity__CreateSchema.parse(__entity__FormInput(values))
}

const validate__Entity__Form = createServerValidate({
  ...__entity__FormOpts,
  // `toFormErrors` is the shared success/failure protocol: undefined when the
  // parse passed, classified errors when it did not. A `fields` key keeps field
  // issues out of the form alert; pathless issues remain form-level, and the
  // first issue per field wins. The SCHEMA and the projection stay here, so what
  // is validated is still this entity's business.
  onServerValidate: ({ value }) =>
    toFormErrors<keyof typeof value & string>(
      __Entity__CreateSchema.safeParse(__entity__FormInput(value)),
    ),
})

/** FORM entry (create). See `runFormAction` for the auth/validate/redirect flow. */
export async function create__Entity__FormAction(
  _prev: unknown,
  formData: FormData,
) {
  return runFormAction({
    capability: __ENTITY___WRITE,
    formData,
    validate: validate__Entity__Form,
    redirectTo: '/__entities__',
    run: async (session, values) => {
      const __entity__ = await create__Entity__(to__Entity__Input(values))
      audit(session, '__entity__.create', __entity__.id)
      revalidatePath('/__entities__')
    },
  })
}

// --- FORM entry (edit) --- id bound by the edit page: `.bind(null, id)`.

/** FORM entry (edit). Same shape as create; writes via `update__Entity__`. */
export async function update__Entity__FormAction(
  id: string,
  _prev: unknown,
  formData: FormData,
) {
  return runFormAction({
    capability: __ENTITY___WRITE,
    formData,
    validate: validate__Entity__Form,
    redirectTo: '/__entities__',
    run: async (session, values) => {
      const __entity__ = await update__Entity__(id, to__Entity__Input(values))
      audit(session, '__entity__.update', __entity__.id)
      revalidatePath('/__entities__')
    },
  })
}

// --- PROGRAMMATIC entry (delete) ---

/** PROGRAMMATIC entry (delete). Requires the write capability. Revalidates `/__entities__`. */
export async function delete__Entity__Action(
  id: string,
): Promise<ActionResult<void>> {
  return runAction(__ENTITY___WRITE, async (session) => {
    await delete__Entity__(id)
    audit(session, '__entity__.delete', id)
    revalidatePath('/__entities__')
  })
}
