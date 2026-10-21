'use client'

import {
  ExternalLinkIcon,
  FileTextIcon,
  PresentationIcon,
  RotateCcwIcon,
} from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react'

import { Button, buttonVariants } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { getDeckUrlAction, type DeckLink } from '@/features/aisa/aisa.action'
import { formatNumber } from '@/lib/format/number'
import { cn } from '@/lib/utils'

import { useApiAction } from '../../_components/use-api-action'

/** Refetch this long before the API says the link expires, so it never dies mid-read. */
const EXPIRY_MARGIN_MS = 60_000

/**
 * Drive's `/preview` viewer ignores `#page=`; only a PDF served as itself (the
 * signed GCS link) opens in the browser's own viewer, which honours it.
 */
function isDrive(url: string): boolean {
  try {
    return new URL(url).hostname === 'drive.google.com'
  } catch {
    return false
  }
}

function withPage(url: string, page: number | null): string {
  return page !== null && !isDrive(url) ? `${url}#page=${page}` : url
}

export type OpenPreview = (page?: number) => void
const PreviewContext = createContext<OpenPreview | null>(null)
/** Whether the panel is open, and how to close it: see `useDeckPreviewPanel`. */
const PanelContext = createContext<{ open: boolean; close: () => void }>({
  open: false,
  close: () => {},
})

/**
 * One "Pratinjau deck" panel per page, opened from the button in the Founder
 * card or from any page citation — so the link is fetched once and shared. It
 * is fetched when the panel opens, not at render: the signed link lives 15
 * minutes, and a page left open longer would hand out a dead one. Reopening
 * after that fetches a fresh link.
 *
 * With `deck` null (no stored deck to open) the triggers render as plain text.
 */
export function DeckPreviewProvider({
  deck,
  children,
}: {
  deck: { proposalId: string; fileName: string; pageCount: number } | null
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<number | null>(null)
  const [fetched, setFetched] = useState<DeckLink | null>(null)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const { pending, error, run } = useApiAction()

  // When the held link goes stale: epoch ms, null for one that never expires,
  // undefined while there is none (never fetched, or the fetch failed).
  const staleAt = useRef<number | null | undefined>(undefined)

  function load() {
    if (!deck) return
    staleAt.current = undefined
    setFetched(null)
    run(() => getDeckUrlAction(deck.proposalId), {
      onSuccess: (link) => {
        staleAt.current =
          link.expiresIn === null
            ? null
            : Date.now() + link.expiresIn * 1000 - EXPIRY_MARGIN_MS
        setFetched(link)
      },
    })
  }
  // `openAt` is the context value, so it keeps one identity and reaches the
  // latest `load` through this ref.
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  const openAt = useCallback<OpenPreview>((target) => {
    setPage(target ?? null)
    setOpen(true)
    const until = staleAt.current
    if (until === undefined || (until !== null && Date.now() > until))
      loadRef.current()
  }, [])

  const previewUrl = fetched?.previewUrl ?? null
  const src = previewUrl ? withPage(previewUrl, page) : null
  const drive = previewUrl ? isDrive(previewUrl) : false
  const newTabUrl = fetched ? withPage(fetched.url, page) : null

  const close = useCallback(() => setOpen(false), [])
  const panel = useMemo(() => ({ open, close }), [open, close])

  return (
    <PreviewContext.Provider value={deck ? openAt : null}>
      <PanelContext.Provider value={panel}>{children}</PanelContext.Provider>
      {deck ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl data-[side=right]:lg:max-w-4xl">
            <SheetHeader className="flex-row items-center gap-3 border-b px-5 py-4 pr-14">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <SheetTitle className="flex items-center gap-2 text-base">
                    <PresentationIcon className="size-4 text-primary" />
                    Pratinjau deck
                  </SheetTitle>
                  {page !== null ? (
                    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      hal. {page}
                    </span>
                  ) : null}
                </div>
                <SheetDescription className="flex min-w-0 items-center gap-1.5">
                  <FileTextIcon className="size-3.5 shrink-0" />
                  <span className="truncate">{deck.fileName}</span>
                  <span className="shrink-0">
                    · {formatNumber(deck.pageCount)} halaman
                  </span>
                </SheetDescription>
              </div>
              {/* Without a frame the body's own "Buka deck" is the one way out. */}
              {src && newTabUrl ? (
                <a
                  href={newTabUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  <ExternalLinkIcon data-icon="inline-start" />
                  <span className="max-sm:sr-only">Buka di tab baru</span>
                </a>
              ) : null}
            </SheetHeader>
            <div className="relative min-h-0 flex-1 bg-muted/60">
              {src ? (
                <>
                  {/* No `sandbox`: Chrome refuses to run its PDF viewer in a
                      sandboxed frame (it shows a broken-page icon instead). The
                      frame is cross-origin, so it still cannot touch this page,
                      and `frame-src` limits it to GCS and Drive. */}
                  {/* oxlint-disable-next-line react/iframe-missing-sandbox */}
                  <iframe
                    // A new src (another page, a fresh link) is a new document.
                    key={src}
                    src={src}
                    title={`Pitch deck ${deck.fileName}`}
                    onLoad={() => setLoadedSrc(src)}
                    className="absolute inset-0 size-full border-0 bg-background"
                  />
                  {loadedSrc !== src ? <Loading label="Membuka deck…" /> : null}
                </>
              ) : pending || (!fetched && !error) ? (
                <Loading label="Menyiapkan tautan deck…" />
              ) : (
                <div className="grid h-full place-items-center p-6">
                  <div className="max-w-sm space-y-3 text-center">
                    <FileTextIcon className="mx-auto size-8 text-muted-foreground" />
                    {error ? (
                      <>
                        <p className="text-sm font-medium">
                          Deck tidak bisa dibuka.
                        </p>
                        <p className="text-[13px] text-destructive">{error}</p>
                        <Button variant="outline" size="sm" onClick={load}>
                          <RotateCcwIcon data-icon="inline-start" />
                          Coba lagi
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium">
                          Pratinjau tidak tersedia untuk deck ini.
                        </p>
                        <p className="text-[13px] text-muted-foreground">
                          Buka deck di tab baru untuk membacanya
                          {page !== null ? ` di hal. ${page}` : ''}.
                        </p>
                        {newTabUrl ? (
                          <a
                            href={newTabUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={buttonVariants({ size: 'sm' })}
                          >
                            <ExternalLinkIcon data-icon="inline-start" />
                            Buka deck
                          </a>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            {src ? (
              <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">
                {drive
                  ? `${page !== null ? `Pratinjau Drive selalu mulai dari halaman 1; gulir ke hal. ${page}. ` : ''}Pratinjau Drive hanya tampil bila akun Google Anda bisa membuka berkas ini. Kosong? Pakai Buka di tab baru.`
                  : `${fetched?.expiresIn ? `Tautan pratinjau berlaku ${Math.round(fetched.expiresIn / 60)} menit; buka ulang panel ini untuk tautan baru. ` : ''}Kosong? Pakai Buka di tab baru.`}
              </p>
            ) : null}
          </SheetContent>
        </Sheet>
      ) : null}
    </PreviewContext.Provider>
  )
}

function Loading({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-muted/60">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner aria-hidden />
        {label}
      </p>
    </div>
  )
}

/**
 * The page's preview opener, for a trigger this file does not ship: call it
 * with a page number to open the panel there, or with none for page 1. Null
 * outside a `DeckPreviewProvider` or when the proposal has no deck.
 */
export function useDeckPreview(): OpenPreview | null {
  return useContext(PreviewContext)
}

/**
 * The panel's open state, for a dialog that opens it from inside itself (Log
 * penilaian): the two are separate dialogs, so an Escape pressed before focus
 * has moved into the panel would reach the dialog underneath and close it
 * instead. That dialog asks here first and closes the panel.
 */
export function useDeckPreviewPanel() {
  return useContext(PanelContext)
}

/** "Pratinjau deck": opens the panel at the first page; nothing without a deck. */
export function DeckPreviewButton(
  props: Omit<ComponentProps<typeof Button>, 'onClick' | 'children'>,
) {
  const openAt = useDeckPreview()
  if (!openAt) return null
  return (
    <Button {...props} onClick={() => openAt()}>
      <PresentationIcon data-icon="inline-start" />
      Pratinjau deck
    </Button>
  )
}

/**
 * A page citation ("hal. 4") that opens the preview at that page. Without a
 * deck it is the same text, not a button: a control that cannot open anything
 * would only teach the reader to ignore it.
 */
export function DeckPageLink({
  page,
  className,
  children,
}: {
  page: number
  className?: string
  children: React.ReactNode
}) {
  const openAt = useDeckPreview()
  if (!openAt) return <span className={className}>{children}</span>
  return (
    <button
      type="button"
      aria-label={`Buka pratinjau deck di halaman ${page}`}
      onClick={() => openAt(page)}
      className={cn(
        'cursor-pointer underline-offset-2 transition-colors outline-none hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/50',
        className,
      )}
    >
      {children}
    </button>
  )
}
