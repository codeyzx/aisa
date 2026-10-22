/**
 * The serializable facts the server layout hands the client shell. Plain data
 * only (strings, numbers) — it crosses the RSC boundary, so no `Date`, no
 * component references.
 */

/** One entry in the ⌘K proposal search. */
export interface ShellProposal {
  id: string
  name: string
  founder: string | null
  sector: string | null
  /** The effective grade label, or null while it is not yet scored. */
  categoryLabel: string | null
}

/** One audit row, as the bell menu shows it. */
export interface ShellNotification {
  id: string
  title: string
  description: string
  /** ISO instant. */
  at: string
  href: string
}

export interface ShellData {
  /** Unresponded proposals the ringkasan lists for a decision (scored, or needing a manual check). */
  pending: number
  proposals: ShellProposal[]
  notifications: ShellNotification[]
  /**
   * ISO instant of the newest ringkasan, or null before the first. A viewer who
   * has never opened the bell reads everything after it as unread.
   */
  latestDigestAt: string | null
}
