import { formOptions } from '@tanstack/react-form-nextjs'

import { type Asset, type AssetFormValues } from './asset.schema'

/**
 * Shared form options — the single source of truth for the asset form's SHAPE +
 * create defaults, imported by BOTH the client form (`useForm`) and the server
 * form actions (`createServerValidate`, in `asset.action.ts`). The edit form
 * reuses this and overrides `defaultValues` with the loaded asset.
 *
 * `defaultValues` is typed `AssetFormValues` (= `Required<AssetCreate>`) so every
 * field type (notably `status`'s enum) is DERIVED from the entity schema — no
 * field type is re-typed here, and a new schema field forces a default.
 *
 * PLAIN module, deliberately NOT `'use server'`: a `'use server'` file may only
 * export async functions, so this value cannot live in `asset.action.ts`. Keeping
 * it separate also keeps it client-importable without any server-only code.
 */
const defaultValues: AssetFormValues = {
  name: '',
  description: '',
  // A new asset starts at zero rupiah; the form's number input overwrites it.
  // `Required<AssetCreate>` forces this key the moment the schema gains `value`.
  value: 0,
  status: 'active',
  // '' when no file is attached — a controlled input needs a present value, and
  // `Required<AssetCreate>` forces this key the moment the schema gains it. The
  // action maps '' back to `undefined` on write ('' is not a key), the same idiom
  // `description` already uses. See asset.schema.ts's `attachmentKey` note.
  attachmentKey: '',
}

export const assetFormOpts = formOptions({ defaultValues })

/**
 * Project a stored asset into the complete controlled form shape. Both edit
 * routes use this so optional persisted fields normalize exactly once.
 */
export function assetFormValues(asset: Asset): AssetFormValues {
  return {
    name: asset.name,
    description: asset.description ?? '',
    value: asset.value,
    status: asset.status,
    attachmentKey: asset.attachmentKey ?? '',
  }
}
