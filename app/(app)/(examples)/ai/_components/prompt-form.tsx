'use client'

/**
 * The AI demo's surface: type a prompt, get a completion.
 *
 * Deliberately NOT a chat. There is no message history, no streaming, and no
 * `@ai-sdk/react` — a chat UI demonstrates the SDK's streaming UX, which is a
 * different product from "call an LLM, gated and deletable". Streaming would
 * also cost an extra dependency this example does not take.
 *
 * This component MUST NOT import `lib/ai/provider` — that module is
 * `server-only` because it reads the API key, so a client import fails the
 * BUILD. It reaches inference only through the action, which is the boundary.
 * `lib/ai/model.ts` is the one AI module it may import: plain constants, no
 * `server-only`, no credential — which is exactly what lets the label below
 * print the REAL model and the REAL cap instead of a second copy that drifts.
 */
import * as React from 'react'
import { Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { DEFAULT_MODEL, INFERENCE_RATE_LIMIT } from '@/lib/ai/model'
import { settleAction } from '@/lib/data/action.contract'

import { generateAction } from '../_actions'

/**
 * The honest label, DERIVED from the constants the server actually enforces.
 *
 * Three facts the reader is owed before they spend a slot: that a model answers
 * (not a search index, not a canned reply), WHICH model, and what the cap is.
 * Built at module scope from `DEFAULT_MODEL` and `INFERENCE_RATE_LIMIT` so it
 * cannot say 10/min while `_actions.ts` enforces 5 — a label that lies about a
 * limit is worse than no label, because the reader plans around it.
 *
 * The window is printed in SECONDS straight from `windowMs`. Rendering "per
 * menit" would need the constant to stay a whole number of minutes, and the
 * label would quietly round the day someone sets 90_000.
 */
const MODEL_LABEL = `Jawaban dihasilkan oleh model ${DEFAULT_MODEL}. Batas ${INFERENCE_RATE_LIMIT.limit} permintaan per ${INFERENCE_RATE_LIMIT.windowMs / 1000} detik untuk setiap pengguna.`

export function PromptForm() {
  const [prompt, setPrompt] = React.useState('')
  const [completion, setCompletion] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const resultRef = React.useRef<HTMLElement>(null)

  /**
   * Move focus to the answer the moment it exists.
   *
   * This is how the output becomes reachable WITHOUT a pointer, and it is the
   * reason the result region carries `tabIndex={-1}` rather than `0`: at `0` the
   * region joins the tab order but a reader still has to guess it is there and
   * go looking, and `jsx-a11y/no-noninteractive-tabindex` rejects it for exactly
   * that reason — a non-interactive element in the tab sequence is a stop that
   * does nothing. `-1` makes it focusable only on purpose, and taking focus here
   * both delivers the reader to the answer and gets the region's name and
   * content read out.
   *
   * It also means the result region does NOT need to be a live region. A live
   * region would recite an entire generated paragraph over whatever the reader
   * was doing; moving focus hands them the same text and lets them read it at
   * their own pace.
   */
  React.useEffect(() => {
    if (completion !== null) resultRef.current?.focus()
  }, [completion])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setCompletion(null)
    setError(null)

    try {
      // `runAction` never throws its own failures across the RSC boundary — it
      // resolves to the ActionResult envelope, so a REJECTED action is a
      // failure of the TRANSPORT, not of the work. The live one: when the
      // session cookie is gone, `proxy.ts` redirects this POST to /login, the
      // action never runs, and the call rejects with "An unexpected response was
      // received from the server."
      //
      // Hence try/finally rather than a bare await. Observed, not theorised:
      // without it the promise rejects, `setPending(false)` never runs, and the
      // form sits on "Generating…" with the button disabled forever — no error,
      // no recovery, reload the only way out. It passes typecheck, lint and
      // build; only a session expiry in a browser shows it.
      const result = await settleAction(() => generateAction(prompt))

      if (!result.ok) {
        // INLINE, not a toast. docs/reference/contracts/ui.md splits feedback by
        // where the reader's attention is: the failure surface here is still on
        // screen and the reader is looking at it, and a refusal they can act on
        // (`resource_exhausted` — wait, then resend the same prompt) must not be
        // allowed to time out before it is read. `result.error` is the canonical
        // per-code message from `action.contract.ts`, so the rate-limited answer
        // reads as a rate limit rather than a generic failure.
        setError(result.error)
        return
      }
      setCompletion(result.data)
    } finally {
      setPending(false)
    }
  }

  /**
   * The busy announcement, and the only thing that speaks progress.
   *
   * The button's label does flip to "Menghasilkan…", but the button is
   * `disabled` while pending and a disabled control is dropped from focus and
   * from many screen readers' change notifications — so an animated `Spinner`
   * plus a label nobody is told about is precisely the "conveyed by animation
   * alone" failure. This announces politely instead, without stealing the
   * reader's place.
   */
  const status = pending ? 'Sedang menghasilkan jawaban…' : ''

  return (
    <div className="space-y-4">
      {/* `aria-busy` on the form marks the whole control group as working, which
          is the machine-readable half of the same fact the status line speaks. */}
      <form onSubmit={onSubmit} className="space-y-3" aria-busy={pending}>
        <div className="space-y-2">
          {/* A real label, not a placeholder. A placeholder is only a fallback
              accessible name and it disappears on the first keystroke, so a
              reader who tabs back has nothing left naming the field. */}
          <Label htmlFor="ai-prompt">Perintah</Label>
          <Textarea
            id="ai-prompt"
            // The label is wired as the field's DESCRIPTION, so the model and
            // the cap are read out when focus lands on the box — before the
            // reader spends a slot, not after.
            aria-describedby="ai-prompt-limit"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Tanyakan sesuatu pada model…"
            rows={4}
            disabled={pending}
          />
          <p id="ai-prompt-limit" className="text-xs text-muted-foreground">
            {MODEL_LABEL}
          </p>
        </div>

        <Button type="submit" disabled={pending || prompt.trim().length === 0}>
          {/* Both icons are hidden from assistive tech on purpose. `Spinner`
              ships its own `role="status" aria-label="Memuat"`, and leaving that
              live would give this surface TWO progress announcers saying
              different words — inside a disabled button, at that. The status
              line below is the one that speaks. */}
          {pending ? (
            <Spinner aria-hidden="true" />
          ) : (
            <Sparkles aria-hidden="true" />
          )}
          {pending ? 'Menghasilkan…' : 'Hasilkan'}
        </Button>
      </form>

      {/* `<output>` rather than `<div role="status">`: it carries that role and
          `aria-live="polite"` natively, so the live region is the ELEMENT and
          cannot be lost by someone tidying a role attribute away. */}
      <output className="block text-sm text-muted-foreground empty:hidden">
        {status}
      </output>

      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {completion !== null && (
        // A NAMED region, so it is a landmark a screen reader can list and jump
        // back to rather than loose text trailing a form — and the name is the
        // visible "Hasil" heading, not an invented `aria-label`, so sighted and
        // screen-reader readers are told the same word. `tabIndex={-1}` is what
        // the effect above focuses; see its comment for why -1 and not 0.
        <section
          ref={resultRef}
          aria-labelledby="ai-result-heading"
          tabIndex={-1}
          className="space-y-2 rounded-md border p-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <h2 id="ai-result-heading" className="text-sm font-medium">
            Hasil
          </h2>
          <div className="text-sm whitespace-pre-wrap">{completion}</div>
        </section>
      )}
    </div>
  )
}
