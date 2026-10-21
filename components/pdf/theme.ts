import { StyleSheet } from '@react-pdf/renderer'

/**
 * The shared PDF theme — the ONE place a printed document's
 * type scale, colour, and spacing are spelled. Every `*.document.tsx` reads from
 * here; none re-declares a size or a hex.
 *
 * ⚠️ THESE ARE NOT DOM STYLES, AND THIS IS NOT TAILWIND. react-pdf ships its own
 * layout engine (a Yoga/flexbox subset) and its own `StyleSheet`. A className
 * does nothing here, `rem` does not exist, and the values below are POINTS —
 * the unit a printer thinks in. The repo's Tailwind tokens deliberately do not
 * reach this file: there is no build step that could translate them, and a theme
 * that half-matched the screen would be worse than one that honestly does not.
 *
 * The palette is greyscale on purpose. A boilerplate's example document should
 * print legibly on the office laser printer every Aixel client actually owns,
 * and a fork replaces these values with its own brand in one file.
 */

/** Point sizes, colours, and spacing — the raw tokens the styles below compose. */
export const pdfTheme = {
  color: {
    text: '#18181b',
    muted: '#71717a',
    rule: '#e4e4e7',
  },
  size: {
    title: 20,
    heading: 12,
    body: 10,
    caption: 8,
  },
  space: {
    page: 40,
    section: 16,
    row: 6,
  },
} as const

/**
 * The composed styles a document renders with.
 *
 * `StyleSheet.create` is react-pdf's own, not React Native's and not the DOM's —
 * it validates the subset of properties the layout engine understands, so a
 * typo'd property fails here rather than rendering an invisible element.
 */
export const pdfStyles = StyleSheet.create({
  page: {
    paddingVertical: pdfTheme.space.page,
    paddingHorizontal: pdfTheme.space.page,
    fontSize: pdfTheme.size.body,
    color: pdfTheme.color.text,
    // Helvetica is one of the 14 PDF standard fonts, so it needs no `Font.register`
    // and no font file on disk. Registering a webfont here would make every route
    // that renders a document depend on a network fetch at request time.
    fontFamily: 'Helvetica',
  },
  title: {
    fontSize: pdfTheme.size.title,
    fontFamily: 'Helvetica-Bold',
    marginBottom: pdfTheme.space.row,
  },
  subtitle: {
    fontSize: pdfTheme.size.caption,
    color: pdfTheme.color.muted,
    marginBottom: pdfTheme.space.section,
  },
  section: {
    marginBottom: pdfTheme.space.section,
  },
  label: {
    fontSize: pdfTheme.size.caption,
    color: pdfTheme.color.muted,
    marginBottom: 2,
  },
  value: {
    fontSize: pdfTheme.size.body,
  },
  rule: {
    borderBottomWidth: 1,
    borderBottomColor: pdfTheme.color.rule,
    marginBottom: pdfTheme.space.section,
  },
  footer: {
    position: 'absolute',
    bottom: pdfTheme.space.page / 2,
    left: pdfTheme.space.page,
    right: pdfTheme.space.page,
    fontSize: pdfTheme.size.caption,
    color: pdfTheme.color.muted,
  },
})
