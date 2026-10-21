import { cn } from '@/lib/utils'

export interface TimelineItem {
  key: string
  title: string
  description?: string
  /** Already formatted for display. */
  time: string
}

/**
 * A vertical activity list; the first item is marked as the newest. `clamp`
 * cuts a long description to two lines and keeps the full text in `title`.
 */
export function Timeline({
  items,
  clamp = false,
}: {
  items: TimelineItem[]
  clamp?: boolean
}) {
  return (
    <ol className="ml-1.5 space-y-6 border-l pl-6">
      {items.map((item, index) => (
        <li key={item.key} className="relative">
          <span
            aria-hidden
            className={cn(
              'absolute top-1 -left-[calc(1.5rem+5.5px)] size-2.5 rounded-full ring-4 ring-card',
              index === 0 ? 'bg-primary' : 'bg-muted-foreground/40',
            )}
          />
          <p className="text-sm font-medium">{item.title}</p>
          {item.description ? (
            <p
              className={cn(
                'text-sm text-muted-foreground',
                clamp && 'line-clamp-2',
              )}
              title={clamp ? item.description : undefined}
            >
              {item.description}
            </p>
          ) : null}
          <time className="text-xs text-muted-foreground">{item.time}</time>
        </li>
      ))}
    </ol>
  )
}
