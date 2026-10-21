// @vitest-environment jsdom
import * as React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { formOptions, useForm } from '@tanstack/react-form-nextjs'

import { useServerForm, type ServerFormAction } from './use-server-form'

/**
 * The client half of the server-action form bridge, driven through a real form.
 *
 * Only the SECOND test below is falsifiable, and that is recorded here rather
 * than left for the next reader to discover: deleting the merge fails it, but
 * deleting the `state.values ?` guard fails NEITHER. On react-form 1.33.2 the
 * early merge is unreachable — `useForm` skips the transform on the first render
 * and `useTransform` is `useCallback` keyed on `[state]`. So the first test pins
 * the OBSERVABLE contract (defaults survive until the server answers) without
 * pretending to prove the guard that would matter if that ever changed.
 */

const formOpts = formOptions({
  defaultValues: { name: 'from-defaults', note: 'also-from-defaults' },
})

/** A form reduced to the bridge and one field, so nothing else can explain a result. */
function Fixture({ action }: { action: ServerFormAction }) {
  const { formAction, transform } = useServerForm(action)
  const form = useForm({ ...formOpts, transform })

  return (
    <form action={formAction}>
      <form.Field name="name">
        {(field) => (
          <>
            <input
              aria-label="name"
              name={field.name}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <span data-testid="name-error">
              {field.state.meta.errors.map((error) => String(error))}
            </span>
          </>
        )}
      </form.Field>
      <button type="submit">save</button>
    </form>
  )
}

/** An action that never answers — stands in for "the server has not replied yet". */
const neverAnswers: ServerFormAction = () => new Promise(() => {})

/**
 * The shape `createServerValidate` throws on failure: the submitted values plus
 * `errorMap.onServer` carrying the classified field errors `toFormErrors`
 * produces.
 */
const rejected: ServerFormAction = () =>
  Promise.resolve({
    errorMap: {
      onServer: { form: undefined, fields: { name: 'Nama wajib diisi' } },
    },
    values: { name: 'what-the-user-typed', note: 'also-from-defaults' },
    errors: [],
  } as never)

afterEach(cleanup)

describe('useServerForm', () => {
  it('leaves the defaults alone until the server has actually answered', () => {
    // The contract a form depends on: an un-answered action leaves the fields
    // showing what they were seeded with. Whatever version of TanStack is
    // installed, THIS is what must stay true.
    render(<Fixture action={neverAnswers} />)

    const name = screen.getByLabelText('name') as HTMLInputElement
    expect(name.value).toBe('from-defaults')
  })

  it('merges a rejection back into the field that caused it', async () => {
    render(<Fixture action={rejected} />)
    fireEvent.submit(
      screen.getByRole('button', { name: 'save' }).closest('form')!,
    )

    // The value the user actually sent survives the round trip — a rejected form
    // that re-renders its defaults has thrown away the user's typing.
    expect(await screen.findByDisplayValue('what-the-user-typed')).toBeTruthy()
    expect(screen.getByTestId('name-error').textContent).toBe(
      'Nama wajib diisi',
    )
  })
})
