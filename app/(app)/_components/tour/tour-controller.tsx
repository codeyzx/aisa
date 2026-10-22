'use client'

import 'driver.js/dist/driver.css'
import './tour.css'

import { driver, type AllowedButtons, type Driver } from 'driver.js'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { TOUR_START_EVENT } from '@/components/shell/tour-event'

import { DECK_UPLOADED_EVENT, type DeckUploadedDetail } from './tour-events'
import {
  applies,
  bodyFor,
  FIRST_STEP,
  isAssessmentSettled,
  isOnRoute,
  onMissingTarget,
  parsePosition,
  POSITION_KEY,
  progressOf,
  proposalIdFromHref,
  routeFor,
  seenKey,
  serializePosition,
  shouldAutostart,
  stepAfter,
  stepById,
  type TourContext,
  type TourDirection,
  type TourPosition,
} from './tour-plan'
import { type TourStep, type TourStepId } from './tour-steps'

/**
 * How long a step waits for its target before treating it as missing: long
 * while the page is still arriving (a cold route compiles on demand in dev),
 * short once the page has drawn its own tour anchors, since a target missing
 * then is missing for good (a manual-check proposal has no grade card).
 */
const TARGET_WAIT_MS = 10_000
const RENDERED_WAIT_MS = 1200
const POLL_MS = 250
/** How long a click on a wait target may take to open its surface. */
const OPEN_GRACE_MS = 3000

/** The surface the tour steps aside for while the reader uses it. */
type Pause = 'upload' | 'assistant'

const PAUSE_SURFACE: Record<Pause, string> = {
  upload: '[data-tour="upload-dialog"]',
  assistant: '#aisa-assistant',
}

const START: TourPosition = {
  step: FIRST_STEP,
  proposalId: null,
  uploaded: false,
}

type Store = 'localStorage' | 'sessionStorage'

/** A stored value; `undefined` when the storage itself cannot be read. */
function readStore(store: Store, key: string): string | null | undefined {
  try {
    return window[store].getItem(key)
  } catch {
    return undefined
  }
}

function writeStore(store: Store, key: string, value: string | null): void {
  try {
    if (value === null) window[store].removeItem(key)
    else window[store].setItem(key, value)
  } catch {
    // Unavailable: the tour still runs, it just cannot resume after a reload.
  }
}

const tourSelector = (value: string) => `[data-tour="${CSS.escape(value)}"]`

/** The element, when it is in the document AND laid out (not display:none). */
function visible(selector: string): HTMLElement | null {
  const element = document.querySelector<HTMLElement>(selector)
  return element && element.getClientRects().length > 0 ? element : null
}

/** Wait for the step's target; null when it does not come (or will not). */
function waitForTarget(
  step: TourStep,
  cancelled: () => boolean,
): Promise<HTMLElement | null> {
  const target = tourSelector(step.target!)
  const empty = step.emptyTarget ? tourSelector(step.emptyTarget) : null
  const started = Date.now()
  return new Promise((resolve) => {
    const check = () => {
      if (cancelled()) return resolve(null)
      const element = visible(target)
      if (element) return resolve(element)
      if (empty && document.querySelector(empty)) return resolve(null)
      const rendered = document.querySelector('main [data-tour]') !== null
      const waited = Date.now() - started
      if (waited > (rendered ? RENDERED_WAIT_MS : TARGET_WAIT_MS))
        return resolve(null)
      setTimeout(check, POLL_MS)
    }
    check()
  })
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

/**
 * The guided tour across pages. driver.js highlights one element on one page;
 * this component owns everything around it: the current step (kept in
 * sessionStorage so it survives navigation and reloads), routing to the page a
 * step lives on, waiting for its target to render, skipping a step whose
 * target never comes (a read-only seat has no upload button), and stepping
 * aside while the reader uploads a deck or talks to Tanya AISA.
 *
 * Starts by itself once per user (a flag in localStorage keyed by uid), and
 * again whenever the shell's "Panduan" menu item asks.
 */
export function TourController({
  uid,
  canRespond,
}: {
  uid: string
  canRespond: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [position, setPosition] = useState<TourPosition | null>(null)
  const [direction, setDirection] = useState<TourDirection>(1)
  const [paused, setPaused] = useState<Pause | null>(null)
  // Bumped to show the current step again, e.g. after its target re-rendered.
  const [epoch, setEpoch] = useState(0)
  const returnFocus = useRef<Element | null>(null)

  const move = useCallback(
    (next: TourPosition | null, dir: TourDirection = 1) => {
      writeStore(
        'sessionStorage',
        POSITION_KEY,
        next ? serializePosition(uid, next) : null,
      )
      setDirection(dir)
      setPosition(next)
    },
    [uid],
  )

  const start = useCallback(() => {
    writeStore('localStorage', seenKey(uid), '1')
    returnFocus.current = document.activeElement
    setPaused(null)
    move(START)
  }, [move, uid])

  const end = useCallback(
    (early: boolean) => {
      setPaused(null)
      move(null)
      const back = returnFocus.current
      returnFocus.current = null
      if (back instanceof HTMLElement && back.isConnected) back.focus()
      else document.querySelector<HTMLElement>('main')?.focus()
      if (early)
        toast('Tur ditutup. Ulangi kapan saja dari menu akun → Panduan.')
    },
    [move],
  )

  // Resume this tab's tour, or start it on the user's first visit.
  useEffect(() => {
    const saved = parsePosition(
      readStore('sessionStorage', POSITION_KEY) ?? null,
      uid,
    )
    if (saved) {
      setPosition(saved)
      return
    }
    const seen = readStore('localStorage', seenKey(uid))
    if (shouldAutostart({ seen, automated: navigator.webdriver === true }))
      start()
  }, [uid, start])

  useEffect(() => {
    window.addEventListener(TOUR_START_EVENT, start)
    return () => window.removeEventListener(TOUR_START_EVENT, start)
  }, [start])

  // A deck uploaded from the upload step: follow it to its assessment.
  useEffect(() => {
    if (position?.step !== 'intake-upload') return
    const onUploaded = (event: Event) => {
      const { proposalId } = (event as CustomEvent<DeckUploadedDetail>).detail
      setPaused(null)
      move({ step: 'progress', proposalId, uploaded: true })
    }
    window.addEventListener(DECK_UPLOADED_EVENT, onUploaded)
    return () => window.removeEventListener(DECK_UPLOADED_EVENT, onUploaded)
  }, [position?.step, move])

  // Stepped aside: resume once the surface the reader opened is closed again.
  useEffect(() => {
    if (!paused || !position) return
    const surface = PAUSE_SURFACE[paused]
    const since = Date.now()
    let opened = false
    const timer = setInterval(() => {
      if (document.querySelector(surface)) {
        opened = true
        return
      }
      if (!opened && Date.now() - since < OPEN_GRACE_MS) return
      setPaused(null)
      // Cancelled upload: show the upload step again. Assistant: carry on.
      if (paused === 'assistant') {
        const ctx = { canRespond, ...position }
        const next = stepAfter(position.step, ctx)
        move(next ? { ...position, step: next } : null)
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [paused, position, canRespond, move])

  // Show the current step.
  useEffect(() => {
    if (!position || paused) return
    const ctx: TourContext = { canRespond, ...position }
    const step = stepById(position.step)

    const goTo = (id: TourStepId | null, dir: TourDirection, patch = {}) => {
      if (id === null) end(false)
      else move({ ...position, ...patch, step: id }, dir)
    }
    const next = () => goTo(stepAfter(step.id, ctx, 1), 1)
    const previous = () => goTo(stepAfter(step.id, ctx, -1), -1)

    // A saved position that no longer applies (e.g. the role changed).
    if (!applies(step, ctx)) {
      const id = stepAfter(step.id, ctx, direction)
      if (id === null) end(false)
      else move({ ...position, step: id }, direction)
      return
    }
    const route = routeFor(step, ctx)
    if (route !== null && !isOnRoute(pathname, route)) {
      router.push(route)
      return
    }

    let cancelled = false
    let tour: Driver | null = null
    const cleanups: (() => void)[] = []

    const show = (element: HTMLElement | null) => {
      const reduced = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches
      const { current, total } = progressOf(step.id, ctx)
      const first = stepAfter(step.id, ctx, -1) === null
      const last = stepAfter(step.id, ctx, 1) === null
      const skippable = step.wait === 'upload' || step.wait === 'assessment'
      const interactive = element !== null && step.wait !== undefined
      const buttons: AllowedButtons[] = first
        ? ['next', 'close']
        : ['next', 'previous', 'close']

      const onNext = () => {
        if (step.id !== 'list-first') return next()
        const href = element?.querySelector('a[href]')?.getAttribute('href')
        const proposalId = proposalIdFromHref(href ?? null)
        if (proposalId === null) return goTo('list-empty', 1)
        goTo(stepAfter(step.id, { ...ctx, proposalId }, 1), 1, { proposalId })
      }

      tour = driver({
        animate: !reduced,
        smoothScroll: !reduced,
        allowClose: true,
        allowKeyboardControl: true,
        // A stray click on the dimmed page must not throw the tour away.
        overlayClickBehavior: 'none',
        overlayOpacity: 0.55,
        stagePadding: 6,
        stageRadius: 12,
        popoverClass: 'aisa-tour',
        // Only a step that waits for the reader lets them use its target.
        disableActiveInteraction: !interactive,
        // Esc (and the close button) end the tour.
        onDestroyStarted: () => end(true),
      })
      tour.highlight({
        element: element ?? undefined,
        popover: {
          title: escapeHtml(step.title),
          description: bodyFor(step, ctx)
            .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
            .join(''),
          side: step.side,
          align: 'start',
          showButtons: buttons,
          showProgress: true,
          progressText: `${current} dari ${total}`,
          nextBtnText: last ? 'Selesai' : skippable ? 'Lewati' : 'Lanjut',
          prevBtnText: 'Kembali',
          closeBtnLabel: 'Tutup tur',
          onNextClick: onNext,
          onPrevClick: previous,
          onCloseClick: () => end(true),
          onPopoverRender: (popover) => {
            // driver.js focuses the first button, the close ×, where Enter
            // would end the tour; the reader's next move is forward.
            setTimeout(() => popover.nextButton.focus(), 0)
          },
        },
      })

      // Arrow keys move through the tour; Esc is driver.js's own.
      const onKey = (event: KeyboardEvent) => {
        if (isTyping(event.target)) return
        if (event.key === 'ArrowRight') onNext()
        else if (event.key === 'ArrowLeft' && !first) previous()
      }
      window.addEventListener('keydown', onKey)
      cleanups.push(() => window.removeEventListener('keydown', onKey))

      // driver.js follows window scrolls only; the work area scrolls itself.
      const onScroll = () => tour?.refresh()
      document.addEventListener('scroll', onScroll, {
        capture: true,
        passive: true,
      })
      cleanups.push(() =>
        document.removeEventListener('scroll', onScroll, { capture: true }),
      )

      if (interactive) {
        // Capture, so the tour steps aside before the target's own handler
        // opens its dialog or panel underneath the overlay.
        const onClick = (event: MouseEvent) => {
          if (
            !(event.target instanceof Node) ||
            !element.contains(event.target) ||
            (step.wait !== 'upload' && step.wait !== 'assistant')
          )
            return
          // Now, not after React re-renders: driver.js makes everything but
          // its target inert, and the dialog is about to open on top.
          tour?.destroy()
          setPaused(step.wait)
        }
        document.addEventListener('click', onClick, { capture: true })
        cleanups.push(() =>
          document.removeEventListener('click', onClick, { capture: true }),
        )
      }

      const timer = setInterval(() => {
        // The page re-rendered under the tour: point at the new element.
        if (element && !element.isConnected) {
          setEpoch((n) => n + 1)
          return
        }
        if (step.wait === 'assessment') {
          const card = document.querySelector(tourSelector(step.target!))
          if (isAssessmentSettled(card?.getAttribute('data-phase') ?? null))
            next()
        }
      }, POLL_MS * 2)
      cleanups.push(() => clearInterval(timer))
    }

    void (async () => {
      const element = step.target
        ? await waitForTarget(step, () => cancelled)
        : null
      if (cancelled) return
      if (step.target && element === null) {
        const outcome = onMissingTarget(step, direction)
        if (outcome.kind === 'skip')
          return goTo(stepAfter(step.id, ctx, direction), direction)
        if (outcome.kind === 'goto') return goTo(outcome.step, direction)
      }
      show(element)
    })()

    return () => {
      cancelled = true
      for (const cleanup of cleanups) cleanup()
      tour?.destroy()
    }
  }, [
    position,
    paused,
    pathname,
    direction,
    canRespond,
    epoch,
    end,
    move,
    router,
  ])

  return null
}
