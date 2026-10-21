import 'server-only'

import { Document, Page, Text, View } from '@react-pdf/renderer'

import { formatRupiah } from '@/lib/format/currency'
import { formatDate, formatTime } from '@/lib/format/date'
import { type Asset, ASSET_STATUS_LABEL } from './asset.schema'
import { ASSET_FIELD_LABEL } from './asset.display'

import { pdfStyles } from '@/components/pdf/theme'

/**
 * The one example printable document: a SINGLE asset, addressed by its own id.
 * A PDF takes an id and CSV/XLSX take a query — the route
 * `app/api/export/assets/[id]/pdf/route.tsx` makes that `[id]` the specification. The
 * line: PDF = document, CSV/XLSX = dataset.
 *
 * ⚠️ NOT A DOM COMPONENT, AND THIS TYPECHECKS EITHER WAY. `<Text>`/`<View>` here
 * are react-pdf primitives rendered through its own reconciler — importing them
 * into a page is a RUNTIME error that every static gate passes. This file is
 * only ever rendered by `lib/export/pdf.ts` inside a route. The hazard is
 * documented in docs/reference/contracts/export.md because the directory cannot carry
 * it.
 *
 * No `'use client'` — it renders server-side, in the route.
 */
export function AssetDocument({ item }: { item: Asset }) {
  return (
    <Document
      title={item.name}
      // Metadata the PDF reader shows in its title bar and properties panel.
      // Free to set, and its absence is what makes an exported file open as
      // "Untitled" in a tab the reader cannot then find again.
      author="Aixel"
      subject="Kartu aset"
    >
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.section}>
          <Text style={pdfStyles.title}>{item.name}</Text>
          {/* The human code (`AST-0001`), not the internal Firestore id — the
              code is what a reader quotes back, and the id is never shown. */}
          <Text style={pdfStyles.subtitle}>
            {ASSET_FIELD_LABEL.code} {item.code}
          </Text>
          <View style={pdfStyles.rule} />
        </View>

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.label}>{ASSET_FIELD_LABEL.value}</Text>
          {/* formatRupiah owns the `Rp`/thousands spelling (it pins id-ID); a
              document re-formatting the number would drift from the screen. */}
          <Text style={pdfStyles.value}>{formatRupiah(item.value)}</Text>
        </View>

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.label}>{ASSET_FIELD_LABEL.status}</Text>
          {/*
            ASSET_STATUS_LABEL, never the raw enum — it is "the ONE place a status
            is spelled for a reader", and an export IS a surface a human reads. A
            PDF printing `active` while the screen says `Active` is exactly the
            drift that map exists to prevent.
          */}
          <Text style={pdfStyles.value}>{ASSET_STATUS_LABEL[item.status]}</Text>
        </View>

        {item.description ? (
          <View style={pdfStyles.section}>
            <Text style={pdfStyles.label}>{ASSET_FIELD_LABEL.description}</Text>
            <Text style={pdfStyles.value}>{item.description}</Text>
          </View>
        ) : null}

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.label}>{ASSET_FIELD_LABEL.createdAt}</Text>
          {/*
            lib/format/* owns the spelling of a date (it pins Asia/Jakarta). A
            document re-spelling one with toLocaleString would silently print the
            server's zone.
          */}
          <Text style={pdfStyles.value}>
            {formatDate(item.createdAt)} {formatTime(item.createdAt)}
          </Text>
        </View>

        <Text
          style={pdfStyles.footer}
          render={({ pageNumber, totalPages }) =>
            `Halaman ${pageNumber} dari ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  )
}
