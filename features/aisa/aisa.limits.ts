// Client-safe constants shared by the upload form and the server action, so the
// browser check and the server check read ONE number.

/** Largest pitch deck the dashboard forwards to `aisa-api`. */
export const MAX_DECK_BYTES = 20 * 1024 * 1024

/** Characters allowed in a free-text reason or note. */
export const MAX_REASON_LENGTH = 500
