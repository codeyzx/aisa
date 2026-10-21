'use client'

import * as React from 'react'

interface FilePickerProps {
  /** Accessible name for the trigger and visually hidden file input. */
  label: string
  /** The caller owns visual treatment; this component owns picker activation. */
  trigger: React.ReactElement<React.ComponentProps<'button'>>
  /** Receives the selected file; upload and persistence policy stay with the caller. */
  onPick: (file: File) => void | Promise<void>
  /** Browser picker hint; file-type policy remains explicit at the call site. */
  accept?: string
  /** Disable selection while caller-managed work is in flight. */
  busy?: boolean
  /** Disable selection for caller-managed availability rules. */
  disabled?: boolean
}

export function FilePicker({
  label,
  trigger,
  onPick,
  accept,
  busy = false,
  disabled = false,
}: FilePickerProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const unavailable = busy || disabled

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    // Reset before async caller work so choosing this file again always fires change.
    event.currentTarget.value = ''
    if (file) void onPick(file)
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        aria-label={label}
        accept={accept}
        disabled={unavailable}
        onChange={onChange}
      />
      {React.cloneElement(trigger, {
        'aria-label': label,
        disabled: unavailable,
        onClick: (event) => {
          trigger.props.onClick?.(event)
          if (!event.defaultPrevented) inputRef.current?.click()
        },
      })}
    </>
  )
}
