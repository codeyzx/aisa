/**
 * "A deck was just uploaded": the upload dialog tells the onboarding tour which
 * proposal it created, so the tour can follow the reader to that proposal's
 * live assessment instead of guessing from the URL. A `window` event, so the
 * dialog does not depend on whether a tour is running at all.
 */
export const DECK_UPLOADED_EVENT = 'aisa:proposal-diunggah'

export interface DeckUploadedDetail {
  proposalId: string
}

export function notifyDeckUploaded(proposalId: string): void {
  window.dispatchEvent(
    new CustomEvent<DeckUploadedDetail>(DECK_UPLOADED_EVENT, {
      detail: { proposalId },
    }),
  )
}
