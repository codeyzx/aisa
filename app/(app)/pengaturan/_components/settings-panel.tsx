import { cn } from '@/lib/utils'

/** One settings group: a title and a short explanation, then rows inside a card. */
export function SettingsPanel({
  title,
  description,
  action,
  footer,
  children,
  className,
}: {
  title?: string
  description?: React.ReactNode
  action?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        '@container overflow-hidden rounded-xl border bg-card',
        className,
      )}
    >
      {title && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b px-5 py-4">
          <div className="min-w-0 space-y-0.5">
            <h3 className="text-[15px] font-semibold tracking-tight">
              {title}
            </h3>
            {description && (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {action}
        </header>
      )}
      {children}
      {footer && (
        <footer className="flex flex-wrap items-center gap-2 border-t bg-muted/40 px-5 py-3 text-[13px] text-muted-foreground">
          {footer}
        </footer>
      )}
    </section>
  )
}

/** One row: label and explanation on the left, the control (or value) on the right. */
export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
  className,
}: {
  label: string
  description?: React.ReactNode
  htmlFor?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid gap-3 border-b px-5 py-4 last:border-0 @xl:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] @xl:gap-6',
        className,
      )}
    >
      <div className="space-y-1 @xl:pt-1.5">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="block text-sm font-medium">
            {label}
          </label>
        ) : (
          <p className="text-sm font-medium">{label}</p>
        )}
        {description && (
          <div className="text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
