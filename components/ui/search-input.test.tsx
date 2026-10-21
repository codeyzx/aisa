// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { SearchInput } from './search-input'

afterEach(cleanup)

describe('SearchInput', () => {
  it('labels the input and reports typing through onValueChange', () => {
    const onValueChange = vi.fn()
    render(
      <SearchInput
        id="s"
        label="Cari"
        value=""
        onValueChange={onValueChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Cari'), {
      target: { value: 'ab' },
    })
    expect(onValueChange).toHaveBeenCalledWith('ab')
  })

  it('shows a clear button only with a value AND onClear, and calls it', () => {
    const onClear = vi.fn()
    const { rerender } = render(
      <SearchInput
        id="s"
        label="Cari"
        value=""
        onValueChange={() => {}}
        onClear={onClear}
        clearLabel="Bersihkan"
      />,
    )
    // Empty value → no clear button yet.
    expect(screen.queryByRole('button', { name: 'Bersihkan' })).toBeNull()
    rerender(
      <SearchInput
        id="s"
        label="Cari"
        value="x"
        onValueChange={() => {}}
        onClear={onClear}
        clearLabel="Bersihkan"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Bersihkan' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('renders no clear button without onClear, even with a value', () => {
    render(
      <SearchInput id="s" label="Cari" value="x" onValueChange={() => {}} />,
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('associates the hint via aria-describedby only while it is present', () => {
    const { rerender } = render(
      <SearchInput id="s" label="Cari" value="a" onValueChange={() => {}} />,
    )
    expect(
      screen.getByLabelText('Cari').getAttribute('aria-describedby'),
    ).toBeNull()
    rerender(
      <SearchInput
        id="s"
        label="Cari"
        value="a"
        onValueChange={() => {}}
        hint="Min. 2 karakter"
      />,
    )
    expect(screen.getByLabelText('Cari').getAttribute('aria-describedby')).toBe(
      's-hint',
    )
    expect(screen.getByText('Min. 2 karakter').id).toBe('s-hint')
  })

  it('forwards keydown so a caller can flush on Enter', () => {
    const onKeyDown = vi.fn()
    render(
      <SearchInput
        id="s"
        label="Cari"
        value="a"
        onValueChange={() => {}}
        onKeyDown={onKeyDown}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('Cari'), { key: 'Enter' })
    expect(onKeyDown).toHaveBeenCalled()
  })
})
