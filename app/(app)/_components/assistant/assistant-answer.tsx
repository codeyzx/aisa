import { Fragment, type ReactNode } from 'react'

/**
 * An Asisten answer as written for WhatsApp: `*bold*`, `_italic_`, `~strike~`
 * and line breaks. Everything from the "💡 Saran AI" label on is the Asisten's
 * own judgement, not AISA data, so it is set apart from the facts above it.
 */
const INLINE =
  /(?<![\p{L}\p{N}])(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)(?![\p{L}\p{N}])/gu
const SARAN = /^\s*💡/m

const MARKS: Record<string, (inner: string, key: string) => ReactNode> = {
  '*': (inner, key) => (
    <strong key={key} className="font-semibold">
      {inner}
    </strong>
  ),
  _: (inner, key) => <em key={key}>{inner}</em>,
  '~': (inner, key) => <s key={key}>{inner}</s>,
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let at = 0
  for (const part of text.split(INLINE)) {
    const key = `o${at}`
    const mark =
      part.length > 2 && part.at(-1) === part[0] ? MARKS[part[0]] : undefined
    out.push(
      mark ? (
        mark(part.slice(1, -1), key)
      ) : (
        <Fragment key={key}>{part}</Fragment>
      ),
    )
    at += part.length
  }
  return out
}

export function AssistantAnswer({ text }: { text: string }) {
  const match = SARAN.exec(text)
  const facts = match ? text.slice(0, match.index).trimEnd() : text
  const saran = match ? text.slice(match.index).trim() : null
  return (
    <div className="space-y-3 text-sm leading-relaxed break-words">
      {facts && <p className="whitespace-pre-wrap">{inline(facts)}</p>}
      {saran && (
        <div className="rounded-xl border border-dashed bg-muted/40 px-3 py-2.5">
          <p className="whitespace-pre-wrap">{inline(saran)}</p>
        </div>
      )}
    </div>
  )
}
