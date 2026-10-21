// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { ChoiceSelect } from './choice-select'

afterEach(cleanup)

const LABELS = { active: 'Aktif', retired: 'Nonaktif' } as const
const VALUES = ['active', 'retired'] as const

describe('ChoiceSelect', () => {
  it('shows the LABEL of the current value on the closed trigger, not the raw member', () => {
    render(
      <ChoiceSelect
        aria-label="Status"
        value="active"
        values={VALUES}
        labels={LABELS}
        onValueChange={() => {}}
      />,
    )
    const trigger = screen.getByLabelText('Status')
    expect(trigger.textContent).toContain('Aktif')
    expect(trigger.textContent).not.toContain('active')
  })

  it('reflects a changed value on the trigger', () => {
    const { rerender } = render(
      <ChoiceSelect
        aria-label="Status"
        value="active"
        values={VALUES}
        labels={LABELS}
        onValueChange={() => {}}
      />,
    )
    rerender(
      <ChoiceSelect
        aria-label="Status"
        value="retired"
        values={VALUES}
        labels={LABELS}
        onValueChange={() => {}}
      />,
    )
    expect(screen.getByLabelText('Status').textContent).toContain('Nonaktif')
  })
})
