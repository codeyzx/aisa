interface BrandMarkProps {
  /** Size it at the call site, e.g. `size-8`. */
  className?: string
}

/**
 * The Aixel mark. One drawing, sized by the caller.
 *
 * It is redrawn here rather than rendered from `app/icon.svg` because the two
 * answer to different theme systems: the favicon flips on
 * `prefers-color-scheme` — correct, since it lives in browser chrome and never
 * sees our toggle — while the app themes on a `.dark` class. `currentColor` is
 * what bridges them; the corners inherit whatever the caller's text colour is
 * and follow the toggle. The accent stays literal: it is the brand constant,
 * not a themeable token.
 *
 * So `app/icon.svg` and this file ARE two copies of one shape, and that is the
 * cost of the two theme systems. Two is the floor. There were three — the
 * sidebar and the sign-in page had each inlined their own, silently free to
 * drift apart.
 */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 1080 1080" aria-hidden className={className}>
      <g fill="currentColor">
        <rect x="110" y="110" width="258" height="258" rx="34" />
        <rect x="712" y="110" width="258" height="258" rx="34" />
        <rect x="110" y="712" width="258" height="258" rx="34" />
        <rect x="712" y="712" width="258" height="258" rx="34" />
      </g>
      <rect x="411" y="411" width="258" height="258" rx="34" fill="#ff4a1c" />
    </svg>
  )
}
