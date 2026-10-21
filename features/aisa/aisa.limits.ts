// Client-safe constants shared by the upload form and the server action, so the
// browser check and the server check read ONE number.

/** Largest pitch deck the dashboard forwards to `aisa-api`. */
export const MAX_DECK_BYTES = 20 * 1024 * 1024

/** Characters allowed in a free-text reason or note. */
export const MAX_REASON_LENGTH = 500

const MAX_DECK_MB = MAX_DECK_BYTES / 1024 / 1024

/**
 * Why a deck is refused before it reaches `aisa-api`, in the same words the API
 * uses for its own refusals ("berkas bukan PDF", "PDF lebih dari 20 MB") written
 * as sentences, so the form reads the same whichever side said no.
 */
export const DECK_REFUSAL = {
  missing: 'Pilih berkas PDF.',
  notPdf: 'Berkas bukan PDF.',
  tooLarge: `PDF lebih dari ${MAX_DECK_MB} MB.`,
} as const

/** The refusal for a picked deck, or `null` when it may be sent. */
export function deckRefusal(file: FormDataEntryValue | null): string | null {
  if (!(file instanceof File) || file.size === 0) return DECK_REFUSAL.missing
  if (
    file.type !== 'application/pdf' &&
    !file.name.toLowerCase().endsWith('.pdf')
  )
    return DECK_REFUSAL.notPdf
  if (file.size > MAX_DECK_BYTES) return DECK_REFUSAL.tooLarge
  return null
}
