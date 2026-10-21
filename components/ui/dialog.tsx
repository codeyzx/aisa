'use client'

import * as React from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { XIcon } from 'lucide-react'

// DS2 modal size system. `compact` (default) is the small centred dialog — byte-identical to the
// pre-DS2 classes, so every existing consumer is unchanged. `content` is the near-full-page recipe
// for content-heavy forms (the A4 new-application intake, MeetingScheduler): a capped-height flex
// column whose header/footer are pinned bands and whose DialogBody is the sole scroll region. The
// size is provided via context (CLAUDE.md UI conv. #9 — self-gating compound slots, no child
// scanning): DialogHeader/DialogBody/DialogFooter read it and pick their own band classes. Width is
// an orthogonal className knob (compact widens to `sm:max-w-md/lg`; content picks `sm:max-w-*`/`w-[95vw]`).
type DialogSize = 'compact' | 'content'
const DialogSizeContext = React.createContext<DialogSize>('compact')

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  size = 'compact',
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  size?: DialogSize
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        data-size={size}
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          size === 'content'
            ? 'flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0'
            : 'grid gap-4 p-4 sm:max-w-sm',
          className,
        )}
        {...props}
      >
        <DialogSizeContext.Provider value={size}>
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              render={
                <Button
                  variant="ghost"
                  className="absolute top-2 right-2"
                  size="icon-sm"
                />
              }
            >
              <XIcon />
              <span className="sr-only">Tutup</span>
            </DialogPrimitive.Close>
          )}
        </DialogSizeContext.Provider>
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  const size = React.use(DialogSizeContext)
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        'flex flex-col',
        size === 'content' ? 'shrink-0 gap-1 border-b px-5 py-4' : 'gap-2',
        className,
      )}
      {...props}
    />
  )
}

// The sole scroll region in `content` mode (header/footer stay pinned). In `compact` mode it is a
// plain vertical stack, so a compact dialog can adopt it without behaviour change.
function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  const size = React.use(DialogSizeContext)
  return (
    <div
      data-slot="dialog-body"
      className={cn(
        size === 'content'
          ? 'min-h-0 flex-1 overflow-y-auto px-5 py-4'
          : 'flex flex-col gap-4',
        className,
      )}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean
}) {
  const size = React.use(DialogSizeContext)
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 border-t bg-muted/50 sm:flex-row sm:justify-end',
        // compact bleeds the band to the p-4 content edges via negative margins; content has a p-0
        // container so it must NOT use them (they would pull the band outside the box).
        size === 'content'
          ? 'shrink-0 px-5 py-4'
          : '-mx-4 -mb-4 rounded-b-xl p-4',
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Tutup
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        'font-heading text-base leading-none font-medium',
        className,
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        'text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className,
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
