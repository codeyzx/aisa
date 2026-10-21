import { type Metadata } from 'next'
import { Geist_Mono, Inter } from 'next/font/google'
import { NuqsAdapter } from 'nuqs/adapters/next/app'

import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { APP_DESCRIPTION, APP_NAME } from '@/lib/app-config'
import { HTML_LANG } from '@/lib/format/locale'
import { cn } from '@/lib/utils'

/**
 * The title contract for the whole app: a page says only its OWN name
 * (`title: 'Assets'`) and lands as `Assets · AISA`. No page spells the
 * product — that is what `template` is for, and it is why renaming is one edit.
 *
 * `default` is REQUIRED once `template` exists (Next's docs are explicit), and
 * it is what `app/page.tsx` renders, since a template does NOT apply to a page
 * in the layout's OWN segment — only to children. So the root page is not
 * missing a title; it is using this one.
 *
 * A page that must escape the suffix passes `title: { absolute: '…' }`.
 *
 * `robots: index:false` is load-bearing, not decoration: this app is PRIVATE and
 * AUTHENTICATED, and the one direction a mistake here must never go is a search
 * engine indexing a login-gated internal tool. It sets the whole family closed —
 * no index, no follow, no archive/cache, no snippet — and it is defended in depth
 * by `app/robots.ts` (disallow all) and a global `X-Robots-Tag` header
 * (`next.config.ts`), because a `<meta>` a crawler never fetches the HTML for is
 * only one of the three places the answer has to be the same. Public SEO is an
 * opt-in downstream fork concern — a fork that ships a marketing page adds OG /
 * sitemap / a permissive robots deliberately, in the file it must open anyway.
 */
export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  applicationName: APP_NAME,
  description: APP_DESCRIPTION,
  robots: {
    index: false,
    follow: false,
    nocache: true,
    noarchive: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      'max-snippet': 0,
      'max-image-preview': 'none',
      'max-video-preview': 0,
    },
  },
}

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

const fontMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

interface RootLayoutProps {
  children: React.ReactNode
}

export default function RootLayout({ children }: Readonly<RootLayoutProps>) {
  return (
    <html
      lang={HTML_LANG}
      suppressHydrationWarning
      className={cn(
        'antialiased',
        fontMono.variable,
        'font-sans',
        inter.variable,
      )}
    >
      <body>
        {/* Say the requirement once, at the root, because it is true of the
            whole app rather than of any one screen: sign-in hands the password
            to Firebase FROM THE BROWSER, so with scripting off nobody can
            authenticate and every protected surface is unreachable by
            definition.

            This is NOT what protects the unhydrated forms. `<noscript>` renders
            only when scripting is DISABLED, while the real hazard is scripting
            ENABLED and React not yet hydrated — a slow chunk, a failed chunk,
            a click in the first moments of a page. That window is covered by
            `method="dialog"` on the forms that cannot be progressively
            enhanced. Two different failures, two different mechanisms; neither
            substitutes for the other. */}
        <noscript>
          <p className="text-destructive-foreground bg-destructive p-4 text-center text-sm">
            Aplikasi ini membutuhkan JavaScript. Proses masuk mengirim
            kredensial ke Firebase Authentication langsung dari peramban, jadi
            tanpa JavaScript Anda tidak dapat masuk sama sekali. Aktifkan
            JavaScript untuk situs ini, lalu muat ulang halaman.
          </p>
        </noscript>
        <ThemeProvider>
          {/* nuqs needs its adapter above every `useQueryState` caller, and it
              belongs at the root for the same reason <Toaster /> does: any route
              may use it, and a per-route-group copy would be N copies of one
              rule. It costs nothing structurally — it is a client Context
              provider taking `children` as a prop, so the RSC tree passes
              THROUGH it and pages stay Server Components. */}
          <NuqsAdapter>{children}</NuqsAdapter>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
