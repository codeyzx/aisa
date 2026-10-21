'use client'

/**
 * A controlled, single-choice `<Select>` over a CLOSED set — the presentation
 * every "pick exactly one of these" control in the app shares (the Assets status
 * filter, page size, and card sort; the asset form's status; the /state filter).
 *
 * It owns three things that are easy to get subtly wrong and pointless to repeat:
 *
 * - CLOSED-VALUE LABEL. Base UI needs `items` or `<SelectValue/>` prints the raw
 *   member — the closed trigger would read `active` while the open list reads
 *   `Aktif`. The one `labels` map feeds the trigger AND the options, so they
 *   cannot disagree.
 * - ORDERED options. `values` is an explicit ordered list, never `Object.keys`:
 *   integer-like keys (`'25'`) enumerate numerically regardless of insertion
 *   order, so key order is a silent trap the day a set is not already sorted.
 * - NON-NULL selection. Base UI hands `null` when a single select is "cleared";
 *   a closed choice has no null member, so that is swallowed here rather than
 *   pushed to `onValueChange` — every consumer would otherwise re-implement the
 *   same guard.
 *
 * It owns NO policy: no navigation, no optimistic state, no URL. A caller wires
 * those around it (the Assets toolbar controller, a form field, a query hook).
 */

import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ChoiceSelectProps<Value extends string> {
  /** The currently selected member. */
  value: Value
  /** Members in the ORDER they should appear — the source of truth for order. */
  values: readonly Value[]
  /** member → label, feeding the trigger and the options from ONE map. */
  labels: Record<Value, string>
  /** Called with the picked member. A `null` "clear" from Base UI is swallowed. */
  onValueChange: (value: Value) => void
  /**
   * Names the control for assistive tech when there is NO visible `<label>`. Omit
   * it when a real `<label htmlFor={id}>` is present (Base UI puts `id` on the
   * trigger, so the label already names it, and an aria-label would only override
   * the words on screen).
   */
  'aria-label'?: string
  id?: string
  size?: 'sm' | 'default'
  disabled?: boolean
  /** Dim the trigger while a value change it drove is still settling. */
  pending?: boolean
  className?: string
}

export function ChoiceSelect<Value extends string>({
  value,
  values,
  labels,
  onValueChange,
  id,
  size = 'sm',
  disabled,
  pending,
  className,
  ...props
}: ChoiceSelectProps<Value>) {
  return (
    <Select
      items={labels}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next === null) return
        onValueChange(next)
      }}
    >
      <SelectTrigger
        id={id}
        size={size}
        aria-label={props['aria-label']}
        className={cn(pending && 'opacity-70', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {values.map((option) => (
          <SelectItem key={option} value={option}>
            {labels[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
