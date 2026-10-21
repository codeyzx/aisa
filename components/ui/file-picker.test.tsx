// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { FilePicker } from './file-picker'

afterEach(cleanup)

function picker(
  onPick = vi.fn(),
  props?: Partial<React.ComponentProps<typeof FilePicker>>,
) {
  return (
    <FilePicker
      label="Pilih berkas"
      onPick={onPick}
      trigger={<button type="button">Pemicu</button>}
      {...props}
    />
  )
}

describe('FilePicker', () => {
  it('names and activates its trigger, and forwards accept to the input', () => {
    const { container } = render(picker(vi.fn(), { accept: 'image/*' }))
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null
    if (!input) throw new Error('Expected file input')
    const click = vi.spyOn(input, 'click')

    expect(screen.getByRole('button', { name: 'Pilih berkas' })).not.toBeNull()
    expect(input.getAttribute('aria-label')).toBe('Pilih berkas')
    expect(input.accept).toBe('image/*')

    fireEvent.click(screen.getByRole('button', { name: 'Pilih berkas' }))
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('resets after selection so the same file can be picked again', () => {
    const onPick = vi.fn()
    const { container } = render(picker(onPick))
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null
    if (!input) throw new Error('Expected file input')
    const file = new File(['content'], 'same.txt', { type: 'text/plain' })

    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.change(input, { target: { files: [file] } })

    expect(input.value).toBe('')
    expect(onPick).toHaveBeenCalledTimes(2)
    expect(onPick).toHaveBeenNthCalledWith(1, file)
    expect(onPick).toHaveBeenNthCalledWith(2, file)
  })

  it('disables the input and trigger while busy or disabled', () => {
    const { container, rerender } = render(picker(vi.fn(), { busy: true }))
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null
    if (!input) throw new Error('Expected file input')

    expect(input.disabled).toBe(true)
    expect(
      (
        screen.getByRole('button', {
          name: 'Pilih berkas',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)

    rerender(picker(vi.fn(), { disabled: true }))
    expect(input.disabled).toBe(true)
    expect(
      (
        screen.getByRole('button', {
          name: 'Pilih berkas',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })
})
