import { describe, expect, it } from 'vitest'

import {
  classifyFormValidationIssues,
  formErrorText,
  toFormErrors,
} from './form-validation'

describe('classifyFormValidationIssues', () => {
  it('keeps the first issue for each field', () => {
    const errors = classifyFormValidationIssues<'name' | 'value'>([
      { path: ['name'], message: 'Name is required' },
      { path: ['name'], message: 'Name is too short' },
      { path: ['value'], message: 'Value is required' },
    ])

    expect(errors).toEqual({
      form: undefined,
      fields: {
        name: 'Name is required',
        value: 'Value is required',
      },
    })
  })

  it('keeps pathless and non-field-path issues at form level', () => {
    const errors = classifyFormValidationIssues<'name'>([
      { path: [], message: 'The submitted fields conflict' },
      { path: [0], message: 'The first row is invalid' },
      { path: ['name'], message: 'Name is required' },
    ])

    expect(errors).toEqual({
      form: 'The submitted fields conflict',
      fields: { name: 'Name is required' },
    })
  })
})

/**
 * The success/failure protocol every entity's server validator repeated
 * verbatim. Extracted so a fix reaches every form at once; the schema and the
 * field projection stay at the call site, so WHAT is validated is still the
 * feature's business.
 */
describe('toFormErrors', () => {
  it('returns undefined when the parse passed', () => {
    // TanStack reads undefined as "no server errors". Returning an empty object
    // instead would mark the form as having been validated-and-failed with
    // nothing to show.
    expect(toFormErrors({ success: true })).toBeUndefined()
  })

  it('classifies issues when the parse failed', () => {
    expect(
      toFormErrors<'name'>({
        success: false,
        error: {
          issues: [
            { message: 'Nama wajib diisi', path: ['name'] },
            { message: 'Tidak konsisten', path: [] },
          ],
        },
      }),
    ).toStrictEqual({
      form: 'Tidak konsisten',
      fields: { name: 'Nama wajib diisi' },
    })
  })
})

/**
 * The reading half, driven against the shapes TanStack actually leaves in
 * `formState.errors`.
 *
 * This exists because the naive read shipped: `String(errors[0])` typechecks —
 * form-core infers the array as `never[]` — and rendered a literal "undefined"
 * alert beside the real field error. `e2e/unhydrated.spec.ts` holds that line in
 * a browser; this holds it where it is cheap to keep.
 */
describe('formErrorText', () => {
  it('returns the form-level message', () => {
    expect(formErrorText(['Tidak dapat menyimpan'])).toBe(
      'Tidak dapat menyimpan',
    )
  })

  it('skips the entries that are not messages', () => {
    // The entry that produced the shipped "undefined": a rejection leaves the
    // per-field map in this array alongside any form-wide string.
    expect(
      formErrorText([undefined, { fields: { name: 'wajib' } }, 'Gagal']),
    ).toBe('Gagal')
  })

  it('treats an empty string as no message', () => {
    // An empty alert is a box with nothing in it — worse than no alert, since it
    // reads as a failure the reader cannot act on.
    expect(formErrorText([''])).toBeUndefined()
  })

  it('returns undefined when there is nothing to say', () => {
    expect(formErrorText([])).toBeUndefined()
    expect(formErrorText([undefined])).toBeUndefined()
    expect(formErrorText([{ fields: {} }])).toBeUndefined()
  })

  it('accepts the never[] the form hands it, without a cast', () => {
    // Call sites pass `formState.errors`, which form-core declares `never[]`. If
    // this stops compiling, every form gets its widening cast back — and that
    // cast is what made the unsound narrowing look deliberate last time.
    const fromForm: never[] = []
    expect(formErrorText(fromForm)).toBeUndefined()
  })
})
