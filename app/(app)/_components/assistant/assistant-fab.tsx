'use client'

import { SparklesIcon, XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * The small round launcher, bottom right. Its label lives only in the tooltip,
 * and it dims while the page scrolls so it never covers what is being read.
 */
export function AssistantFab({
  open,
  onToggle,
}: {
  open: boolean
  onToggle: () => void
}) {
  const [scrolling, setScrolling] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onScroll = () => {
      setScrolling(true)
      clearTimeout(timer)
      timer = setTimeout(() => setScrolling(false), 500)
    }
    // Capture, so a scroll inside the content pane counts as well as the window's.
    document.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    })
    return () => {
      clearTimeout(timer)
      document.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [])

  const dimmed = scrolling && !open

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="aisa-assistant"
        data-tour="assistant"
        aria-label={open ? 'Tutup Tanya AISA' : 'Buka Tanya AISA'}
        className={cn(
          'fixed right-4 bottom-4 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-[transform,opacity,box-shadow] duration-200 outline-none hover:scale-105 hover:shadow-lg focus-visible:ring-4 focus-visible:ring-primary/30 active:scale-95 sm:right-5 sm:bottom-5',
          dimmed && 'scale-90 opacity-40 hover:scale-100 hover:opacity-100',
        )}
      >
        {open ? (
          <XIcon className="size-5" />
        ) : (
          <SparklesIcon className="size-5" />
        )}
      </TooltipTrigger>
      {!open && (
        <TooltipContent side="left" sideOffset={8}>
          Tanya AISA
        </TooltipContent>
      )}
    </Tooltip>
  )
}
