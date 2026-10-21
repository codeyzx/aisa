import { type Metadata } from 'next'
import Link from 'next/link'

import { Page } from '@/components/shell/page-container'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { requireCapability } from '@/lib/auth/guards'
import { listAssets } from '@/features/asset/asset.repo'
import { cn } from '@/lib/utils'

import {
  datasetHref,
  exportHref,
  EXPORT_STATUS_LABEL,
  EXPORT_STATUS_VALUES,
  loadExportSearchParams,
} from './search-params'

export const metadata: Metadata = {
  title: 'Ekspor',
}

/**
 * Export example (canonical-per-capability). The example home
 * for the export seam — the assets page never grows a download button; the
 * export UI lives here on its own route.
 *
 * Gated with `requireCapability('export:read')` at the top, exactly as
 * app/(app)/(examples)/storage/page.tsx does with `storage:write`. That is UX only —
 * it stops a user who cannot export from being shown download links that would
 * 403. The real boundary is server-side, in each route, because a route is a
 * public HTTP endpoint.
 *
 * ⚠️ THE ACCEPTED PRICE, SO IT DOES NOT READ AS A BUG: a fresh cloner signed in
 * as `user` gets a 403 here, because `export:read` is admin-only. That
 * is a worse first-run demo and the correct one — bulk export must not ride
 * `asset:read`, which every signed-in user holds. A project that wants bulk
 * egress for everyone adds `export:read` to `user` in lib/auth/rbac.ts,
 * deliberately, in a file it must open anyway.
 *
 * ── THE FILTER IS LINKS, NOT A SELECT, AND THAT IS THE POINT ─────────────────
 * This page used to have no filter control at all, on the argument that
 * `?status=` could be typed into the address bar and that a Select here would
 * duplicate the assets toolbar's private `UrlSelect`. The first half was the
 * error: a control you operate by hand-editing the URL is not a control, and it
 * left the routes' most important behaviour — a NARROW export — reachable only
 * by someone who had read the source.
 *
 * The answer is a radio group of plain `<a>`s rather than a lifted Select, and
 * that is not a shortcut. Every other control on this page is a bare anchor
 * because the browser already models "fetch this URL and save it"; a filter
 * that needs JavaScript to change a download link would be the one part of an
 * otherwise zero-JS page that stops working with JS off. So no `UrlSelect` gets
 * lifted, nothing is duplicated, and the filter degrades exactly as well as the
 * downloads it filters.
 *
 * The links themselves come from `./search-params.ts`, which also owns the one
 * translation that matters: this page says `all`, the export routes answer 400
 * to `?status=all`, and nothing else is allowed to build those URLs.
 */
interface ExportExamplePageProps {
  // Next 16: `searchParams` is a Promise. nuqs's loader takes the Promise
  // itself, so it is awaited inside the loader rather than here.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ExportExamplePage({
  searchParams,
}: ExportExamplePageProps) {
  await requireCapability('export:read')

  const { status } = await loadExportSearchParams(searchParams)

  // A handful of real rows, so the PDF links point at ids that exist. The PDF
  // strand is addressed by id (the CSV takes a query, the PDF takes an id),
  // so the example needs something to address.
  const { items } = await listAssets({ limit: 5 })

  return (
    <Page.Root>
      <Page.Header
        eyebrow="Contoh"
        title="Ekspor"
        description="Berikan sebuah berkas kepada seseorang: dokumen cetak, atau lembar untuk tabel pivot."
      />

      <Card>
        <CardHeader>
          <CardTitle>Dataset (CSV · Excel)</CardTitle>
          <CardDescription>
            Set yang difilter, dialirkan dari query yang sama seperti yang
            dijalankan <code>/assets</code> — bukan halaman yang bisa Anda
            lihat. Pilih filter di bawah; kedua tautan unduhan mengikutinya.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/*
            LINKS, and left as links. The tempting markup here is a radio group
            — three mutually exclusive states of one setting is exactly what
            radios mean — but a `role="radio"` on an anchor is a lie about the
            element (it is not focusable-as-a-group, has no arrow-key roving,
            and does not answer the space bar), and a REAL `<input type=radio>`
            cannot navigate without either JavaScript or a submit button. This
            page's whole argument is that it needs neither. So the honest
            markup is what it actually is: a labelled group of links, one of
            which is current.

            `aria-current="true"` and not `"page"`: the reader is not on a
            different page, they are on THIS one, filtered. `"true"` is the
            value ARIA defines for "the current item within a set", which is
            precisely the claim being made.

            A real `<fieldset>`/`<legend>`, not a `<div role="group">`: the
            grouping is a fact about the markup, so the element that means it
            should carry it — the same reason this page uses real anchors rather
            than buttons wearing a link role. The legend is VISIBLE because
            "Semua · Aktif · Pensiun" on its own says nothing about what is being
            filtered, to anyone, sighted or not.
          */}
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Filter status</legend>
            <div className="flex flex-wrap items-center gap-2">
              {EXPORT_STATUS_VALUES.map((value) => {
                const selected = value === status
                return (
                  <Link
                    key={value}
                    href={exportHref(value)}
                    // `replace`, so cycling filters does not fill the back stack
                    // with states of one screen — Back should leave the page,
                    // not walk the reader back through their own filtering.
                    replace
                    aria-current={selected ? 'true' : undefined}
                    className={cn(
                      buttonVariants({
                        variant: selected ? 'default' : 'outline',
                        size: 'sm',
                      }),
                    )}
                  >
                    {EXPORT_STATUS_LABEL[value]}
                  </Link>
                )
              })}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            {/*
              Same plain <a download> as the PDF links below, for the same reason.
              These are the two routes gated on `export:read` — a `user` who
              reaches this page at all is an admin, because the page guard above
              already required it.

              The accessible name carries the FILTER, not just the format: two
              buttons both called "Unduh CSV" that hand back different files
              depending on invisible page state is precisely the case a name is
              for. The visible label stays short; `aria-label` says the whole
              thing.
            */}
            <a
              href={datasetHref('csv', status)}
              download
              aria-label={`Unduh CSV — ${EXPORT_STATUS_LABEL[status]}`}
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'justify-start',
              )}
            >
              Unduh CSV
            </a>
            <a
              href={datasetHref('xlsx', status)}
              download
              aria-label={`Unduh Excel — ${EXPORT_STATUS_LABEL[status]}`}
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'justify-start',
              )}
            >
              Unduh Excel
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dokumen (PDF)</CardTitle>
          <CardDescription>
            Satu aset, dialamatkan berdasarkan id-nya, dirender melalui tema
            bersama. PDF untuk dokumen; CSV dan Excel untuk dataset.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {items.map((item) => (
            /*
              A plain <a download>: the standard downloader, and zero JS. The
              browser already models "fetch this URL and save it"; a download
              hook would be a local variant of that.

              buttonVariants on a REAL anchor — never
              <Button nativeButton={false} render={<Link/>}>. That prop stamps
              role="button" on links, passes every static gate, and
              removes the links from the screen-reader rotor.

              <a>, not <Link>: this navigates to a route handler that answers
              bytes, not to a page. Link would prefetch an RSC payload that does
              not exist and try to client-navigate to a file.
            */
            <a
              key={item.id}
              href={`/api/export/assets/${item.id}/pdf`}
              download
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'justify-start',
              )}
            >
              {item.name}
            </a>
          ))}
        </CardContent>
      </Card>
    </Page.Root>
  )
}
