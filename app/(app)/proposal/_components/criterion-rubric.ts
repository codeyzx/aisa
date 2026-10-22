/** A rubric level of one criterion: its value on the 1–5 scale and its text. */
export interface RubricLevel {
  level: number
  text: string
}

/**
 * The rubric anchors of one criterion, keyed by level as a string ("1".."5").
 * Older rules carry only some levels, and a level may be stored empty.
 */
export type RubricAnchors = Partial<Record<string, string>>

function levelOf(anchors: RubricAnchors, level: number): RubricLevel | null {
  const text = anchors[String(level)]?.trim()
  return text ? { level, text } : null
}

/**
 * What the rubric says about a criterion's value: the anchor written for that
 * exact value, and the nearest higher anchor — what it would take to score
 * more. Either is `null` when the rules hold no text for it; nothing is
 * borrowed from a neighbouring level to fill the gap.
 */
export function rubricFor(
  anchors: RubricAnchors | null | undefined,
  value: number,
): { current: RubricLevel | null; next: RubricLevel | null } {
  if (!anchors) return { current: null, next: null }
  let next: RubricLevel | null = null
  for (let level = value + 1; level <= 5 && !next; level++)
    next = levelOf(anchors, level)
  return { current: levelOf(anchors, value), next }
}
