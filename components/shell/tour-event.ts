/**
 * The one channel into the onboarding tour: a `window` event with no payload.
 * It lives with the shell because the shell's menu offers "Panduan" while the
 * tour itself is mounted by the app layout — shared code cannot import it.
 */
export const TOUR_START_EVENT = 'aisa:tur-mulai'

/** Start the onboarding tour from its first step. */
export function startTour(): void {
  window.dispatchEvent(new Event(TOUR_START_EVENT))
}
