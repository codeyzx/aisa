'use client'

/**
 * Numeric input with locale-derived grouping/decimal separators (`.` thousands,
 * `,` decimals for `id-ID`), applied on every keystroke. Built on
 * `react-number-format` for proven cursor-position handling — mirrored from the
 * Aixel MBG system so amount fields behave identically across our apps.
 *
 * Stores a plain `number` in form state; DISPLAYS the grouped/prefixed string.
 * Currency is expressed by passing `prefix="Rp "` at the call site — the
 * component hardcodes no unit, so the same control serves money, weight, counts.
 * The clear / clamp / blank rules and the locale-derived separators live in
 * lib/format/numeric.ts so they stay testable; the visual class string is shared
 * with the plain `<Input>` so the two never drift.
 *
 * A cleared field is BLANK, never `0`: it renders empty and its hidden raw-POST
 * input submits nothing (both read `isNumericBlank`), so a cleared value is
 * rejected by the schema rather than silently saved as a real `0`, and the
 * hidden FormData can never disagree with what the field shows.
 */

import * as React from 'react'
import { NumericFormat } from 'react-number-format'

import { cn } from '@/lib/utils'
import {
  isNumericBlank,
  numericSeparators,
  resolveNumericChange,
} from '@/lib/format/numeric'
import { inputClassName } from '@/components/ui/input'

// Derived once from the central LOCALE (a build constant) — not per render.
const { group: groupSeparator, decimal: decimalSeparator } = numericSeparators()

interface NumericInputProps {
  /** Numeric model value. `null` / `undefined` renders an empty field. */
  value: number | null | undefined
  /**
   * Receives the parsed `number` (never the formatted string). Not called while
   * the field sits empty mid-edit — a cleared field stays blank (it is not
   * normalized to `0`), so the schema rejects it instead of the input inventing
   * a value.
   */
  onChange: (value: number) => void
  /** Forwarded on blur; blur does not mutate or normalize the value. */
  onBlur?: React.FocusEventHandler<HTMLInputElement>
  /** Allow decimal entry. Default false (integer-only). */
  allowDecimal?: boolean
  /** Decimal places when `allowDecimal` is true. Default 3. */
  decimalScale?: number
  /** In-field prefix, e.g. `"Rp "`. */
  prefix?: string
  /** In-field suffix, e.g. `" g"`. */
  suffix?: string
  /** Clamps on change; a negative `min` also enables negative entry. */
  min?: number
  /** Clamps on change. */
  max?: number
  id?: string
  name?: string
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  'aria-invalid'?: React.ComponentProps<'input'>['aria-invalid']
  'aria-describedby'?: string
  className?: string
}

export function NumericInput({
  value,
  onChange,
  onBlur,
  allowDecimal = false,
  decimalScale = 3,
  prefix,
  suffix,
  min,
  max,
  name,
  className,
  ...rest
}: NumericInputProps) {
  // The field may sit empty while the user is mid-edit. Emitting `0` on every
  // clear would re-render "0" under the caret, so clearing then typing "1" would
  // produce "10". `cleared` tracks that transient blank.
  const [cleared, setCleared] = React.useState(false)

  // An external write (form reset, programmatic set) ends the transient state.
  const [seenValue, setSeenValue] = React.useState(value)
  if (value !== seenValue) {
    setSeenValue(value)
    setCleared(false)
  }

  // The ONE gate both the visible field and the hidden POST input read, with the
  // same non-blank expression — so a cleared field submits nothing (never the
  // stale previous number) and the two can never disagree.
  const blank = isNumericBlank(value, cleared)

  return (
    <>
      {/* In a native-POST form the RAW number — not the formatted "Rp …" display
          — is what must POST, so a hidden input carries it and the NumericFormat
          field below stays name-less. Omit `name` (RHF / JS-state forms that read
          `value` directly) and no hidden input renders. */}
      {name != null ? (
        <input type="hidden" name={name} value={blank ? '' : (value ?? '')} />
      ) : null}
      <NumericFormat
        {...rest}
        data-slot="input"
        value={blank ? '' : (value ?? '')}
        thousandSeparator={groupSeparator}
        decimalSeparator={decimalSeparator}
        allowNegative={typeof min === 'number' ? min < 0 : false}
        allowedDecimalSeparators={['.', ',']}
        decimalScale={allowDecimal ? decimalScale : 0}
        fixedDecimalScale={false}
        prefix={prefix}
        suffix={suffix}
        inputMode={allowDecimal ? 'decimal' : 'numeric'}
        onValueChange={(values) => {
          const transition = resolveNumericChange(values.floatValue, {
            min,
            max,
          })
          setCleared(transition.kind === 'hold')
          if (transition.kind === 'emit') onChange(transition.value)
        }}
        onBlur={onBlur}
        className={cn(inputClassName, className)}
      />
    </>
  )
}
