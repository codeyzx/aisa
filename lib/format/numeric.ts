/**
 * Pure transition + derivation rules for `<NumericInput>` — the parse / clamp /
 * blank decisions kept OUT of the component so they are unit-testable in
 * isolation.
 *
 * Mirrored from the Aixel MBG system's numeric input, whose caret-safe empty
 * handling this repo adopts wholesale. See components/ui/numeric-input.tsx.
 */

import { LOCALE } from './locale'

export interface NumericBounds {
  min?: number
  max?: number
}

/**
 * The outcome of a keystroke:
 * - `emit` — hand this number to the form.
 * - `hold` — the field is empty mid-edit; emit nothing and let it render blank.
 *   Emitting `0` here would re-render "0" under the caret, so clearing the field
 *   then typing "1" would produce "10". A held-empty field also stays empty on
 *   blur — it is NOT normalized to `0`, so a cleared value is rejected by the
 *   schema ("Nilai wajib diisi") rather than silently saved as a real `0`.
 */
export type NumericTransition =
  | { kind: 'emit'; value: number }
  | { kind: 'hold' }

/** Clamp to `[min, max]` on change; a non-finite parse (a cleared field) holds. */
export function resolveNumericChange(
  parsed: number | undefined,
  { min, max }: NumericBounds = {},
): NumericTransition {
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    return { kind: 'hold' }
  }
  if (typeof max === 'number' && parsed > max)
    return { kind: 'emit', value: max }
  if (typeof min === 'number' && parsed < min)
    return { kind: 'emit', value: min }
  return { kind: 'emit', value: parsed }
}

/**
 * Whether the field should render AND post as blank — either it is cleared
 * mid-edit, or it holds no model value. The visible `NumericFormat` value and
 * the hidden raw-POST input read this one gate with the same non-blank
 * expression, so what a native form submits can never disagree with what the
 * field shows: a cleared field posts nothing, not the stale previous number.
 * An explicit `0` is NOT blank — it submits, and the schema accepts it.
 */
export function isNumericBlank(
  value: number | null | undefined,
  cleared: boolean,
): boolean {
  return cleared || value == null
}

/**
 * Grouping + decimal separators for the editable field, DERIVED from the central
 * `LOCALE` so an in-progress "Rp 1.234,5" matches every read-only formatter
 * instead of hardcoding Indonesian punctuation. `id-ID` yields `.` grouping and
 * `,` decimal; a fork that repoints `LOCALE` (e.g. `en-US`) flips both in
 * lockstep. Group/decimal parts are stable across ICU versions (unlike a
 * currency's fraction-digit default, which locale.ts pins for that reason).
 */
export function numericSeparators(locale: string = LOCALE): {
  group: string
  decimal: string
} {
  const parts = new Intl.NumberFormat(locale).formatToParts(11111.1)
  return {
    group: parts.find((part) => part.type === 'group')?.value ?? '.',
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? ',',
  }
}
