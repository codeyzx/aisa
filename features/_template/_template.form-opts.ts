// TEMPLATE — copy-me starter for a new entity's shared form config. See
// `_template.schema.ts` for the token legend. Copy to
// `features/<entity>/<entity>.form-opts.ts` — only if the entity has a form.
//
// PLAIN module (deliberately NOT `'use server'`): shared by BOTH the client
// form (`useForm`) and the server form action (`createServerValidate`). A
// `'use server'` file may only export async functions, so this value cannot
// live in the action file.
//
// `defaultValues` is typed `Required<__Entity__Create>` so field types derive
// from the entity schema — nothing is re-typed here, and a new schema field
// forces a default. Controlled inputs need a present default (e.g. an optional
// string field starts `''`; the action maps '' → undefined).
//
// EXCLUDED from typecheck by the `_template.*` name.

import { formOptions } from '@tanstack/react-form-nextjs'

import { type __Entity__, type __Entity__FormValues } from './__entity__.schema'

const defaultValues: __Entity__FormValues = {
  // Reshape for your entity's form fields. Every key `__Entity__CreateSchema`
  // picks needs a present default — controlled inputs require one, and
  // `Required<__Entity__Create>` makes a missing key a COMPILE error (the
  // `pnpm templates:check` gate copies this file and typechecks it).
  name: '',
  description: '',
  status: 'active',
}

export const __entity__FormOpts = formOptions({ defaultValues })

/** Project stored data into controlled inputs once, shared by every edit surface. */
export function __entity__FormValues(entity: __Entity__): __Entity__FormValues {
  return {
    name: entity.name,
    description: entity.description ?? '',
    status: entity.status,
  }
}
