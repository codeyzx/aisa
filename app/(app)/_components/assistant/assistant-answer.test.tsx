// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'

import { AssistantAnswer } from './assistant-answer'

afterEach(cleanup)

describe('AssistantAnswer', () => {
  it('renders WhatsApp bold and italic, leaving snake_case and arithmetic alone', () => {
    const { container } = render(
      <AssistantAnswer
        text={'*Tani Maju* (agritech) · _seed_ · sangat_cocok_x 2*3*4'}
      />,
    )
    expect(
      [...container.querySelectorAll('strong')].map((n) => n.textContent),
    ).toEqual(['Tani Maju'])
    expect(
      [...container.querySelectorAll('em')].map((n) => n.textContent),
    ).toEqual(['seed'])
    expect(container.textContent).toContain('sangat_cocok_x 2*3*4')
  })

  it('sets the Saran AI section apart from the facts above it', () => {
    const { container } = render(
      <AssistantAnswer
        text={
          'Ada 2 proposal.\n\n💡 *Saran AI (bukan dari data proposal):*\nCek Tani Maju dulu.'
        }
      />,
    )
    const blocks = container.querySelectorAll('p')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].textContent).toBe('Ada 2 proposal.')
    expect(blocks[1].textContent).toContain(
      'Saran AI (bukan dari data proposal):',
    )
    expect(blocks[1].textContent).toContain('Cek Tani Maju dulu.')
  })
})
