/**
 * Locators the acceptance specs share, for page shapes that have no ARIA role
 * to reach them by: a card found by its title, and a `<dt>`/`<dd>` fact.
 */
import type { Locator, Page } from '@playwright/test'

/** `text` as a regex that matches the whole string and nothing else. */
export function exactly(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`, 'u')
}

/** The `<dd>` right after the `<dt>` that reads exactly `label`. */
export function fact(scope: Page | Locator, label: string): Locator {
  return scope
    .locator('dt')
    .filter({ hasText: exactly(label) })
    .locator('xpath=following-sibling::dd[1]')
}

/** The card whose title contains `title` (or matches it, as a regex). */
export function card(page: Page, title: string | RegExp): Locator {
  return page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', { hasText: title }),
  })
}

/** A sonner toast whose title reads exactly `text`. */
export function toast(page: Page, text: string): Locator {
  return page
    .locator('[data-sonner-toast] [data-title]')
    .filter({ hasText: exactly(text) })
}

/** An inline `role="alert"` under `scope` that reads exactly `text`. */
export function alertIn(scope: Page | Locator, text: string): Locator {
  return scope.getByRole('alert').filter({ hasText: exactly(text) })
}
