import { type Metadata } from 'next'
import Link from 'next/link'

import { cn } from '@/lib/utils'
import { Page } from '@/components/shell/page-container'
import { Badge } from '@/components/ui/badge'
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
import { ASSET_STATUS_LABEL } from '@/features/asset/asset.schema'

import { DensityScope, DensityToggle } from './_components/density'
import { NotesPanel, NotesRoot, NotesTrigger } from './_components/notes'
import { StatusFilter } from './_components/status-filter'
import { loadStateSearchParams } from './search-params'

export const metadata: Metadata = {
  title: 'State',
}

/**
 * The state-management decision rule, demonstrated on one page.
 *
 * This page is not four library demos. It is ONE ladder, and the exhibits are
 * rungs. The rule, in order — stop at the first rung that holds:
 *
 *   1. SERVER STATE   Is it persisted data? → Firestore is the source of truth.
 *                     RSC reads it, a server action writes it, revalidate*()
 *                     invalidates. No client cache to keep in sync.
 *   2. URL STATE      Is it a VIEW of that data someone could share, bookmark,
 *                     or reach with the back button? → the URL, typed via nuqs.
 *   3. CONTEXT        Does a subtree need something injected — session, theme,
 *                     config — or do sibling parts of one component need to
 *                     agree? → Context. Transport, not storage.
 *   4. ZUSTAND        Client-only, ephemeral, worth neither a URL nor a write,
 *                     and none of the above fits? → a store. LAST, and rarely.
 *
 * The ladder is ordered by how much you have to keep correct yourself. Rung 1
 * has one copy of the truth. Rung 4 has a copy that can silently disagree with
 * every other copy, forever, and nothing will tell you.
 *
 * Lives in the `(examples)` route group so the whole demo deletes in one shot.
 * Public URL: `/state`.
 */
interface StatePageProps {
  // Next 16: `searchParams` is a Promise. nuqs's loader takes the Promise
  // directly and hands back typed values — see search-params.ts.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function StatePage({ searchParams }: StatePageProps) {
  // Gated-RSC idiom: guard resolves BEFORE any query runs.
  await requireCapability('asset:read')

  const { status } = await loadStateSearchParams(searchParams)

  // Rung 1 + rung 2 meeting: URL state is the QUERY, server state is the ANSWER.
  // The filter island writes `?status`; that re-runs this Server Component,
  // which re-reads Firestore. No client cache sits between them, so there is
  // nothing to invalidate and nothing that can go stale.
  const { items } = await listAssets({
    limit: 5,
    status: status === 'all' ? undefined : status,
  })

  return (
    <Page.Root>
      <Page.Header
        eyebrow="Contoh"
        title="State"
        description="Empat tempat state bisa berada, dan aturan untuk memilih di antaranya."
      >
        <Link
          href="/assets"
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          Contoh aset
        </Link>
      </Page.Header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant="secondary">1</Badge>
            Server state — bawaan
          </CardTitle>
          <CardDescription>
            RSC + server action + <code>revalidatePath</code>. Firestore adalah
            sumber kebenaran.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* The rows below are rendered by this Server Component: it awaited
              the repo and mapped the result. No fetch, no effect, no store, no
              loading flag — the data was never anywhere else. */}
          <DensityScope>
            {items.length === 0 ? (
              <li className="px-3 text-muted-foreground">
                Tidak ada aset
                {status === 'all' ? '' : ` ${ASSET_STATUS_LABEL[status]}`}.{' '}
                <Link href="/assets/new" className="underline">
                  Buat satu
                </Link>
                .
              </li>
            ) : (
              items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-3"
                >
                  <span className="truncate font-medium">{item.name}</span>
                  <Badge variant="outline">
                    {ASSET_STATUS_LABEL[item.status]}
                  </Badge>
                </li>
              ))
            )}
          </DensityScope>
          <NotesRoot>
            <NotesTrigger>
              Kenapa tidak pakai client store untuk ini?
            </NotesTrigger>
            <NotesPanel>
              <p>
                Karena sebuah store akan menjadi salinan kedua dari data yang
                sudah dimiliki Firestore, dan salinan itu menyimpang. Seluruh
                paruh mutasi dari tingkat ini sudah didemonstrasikan di{' '}
                <Link href="/assets" className="underline">
                  /assets
                </Link>{' '}
                — sebuah server action menulis, <code>revalidatePath</code>{' '}
                menginvalidasi, RSC membaca ulang. Ini tidak diduplikasi di
                sini: setengah-CRUD kedua akan mengajarkan lebih sedikit
                daripada yang sudah berfungsi.
              </p>
            </NotesPanel>
          </NotesRoot>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant="secondary">2</Badge>
            URL state — nuqs
          </CardTitle>
          <CardDescription>
            Dapat dibagikan, dapat di-bookmark, ramah tombol-kembali. Filter,
            urutan, penomoran halaman, tab aktif, pencarian. Kontrol ini
            menggerakkan daftar di atas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatusFilter />
          <NotesRoot>
            <NotesTrigger>
              Apa keuntungan nuqs dibandingkan router.push?
            </NotesTrigger>
            <NotesPanel>
              <p>
                <Link href="/assets" className="underline">
                  /assets
                </Link>{' '}
                membangun filter yang sama ini secara manual dan berfungsi —
                nuqs bukan sedang memperbaiki bug. Ia memberi SATU deklarasi
                kontrak URL (search-params.ts) yang diimpor baik oleh Server
                Component maupun island klien, alih-alih sebuah parser di satu
                sisi dan template <code>{'`?status=${next}`'}</code> di sisi
                lain tanpa ada yang menghubungkannya. Ia juga meringkas tiga
                hook menjadi satu: nuqs menyimpan nilai secara optimistik
                sendiri, sehingga <code>useOptimistic</code> hilang, dan island
                membaca URL secara langsung, sehingga induknya berhenti
                mem-parse-dan-mengoper prop <code>value</code>.
              </p>
            </NotesPanel>
          </NotesRoot>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant="secondary">3</Badge>
            Context — injeksi, dan compound component
          </CardTitle>
          <CardDescription>
            Bukan wadah state. Ia mengangkut apa yang dimiliki induk ke turunan
            yang membutuhkannya, tanpa prop-drilling.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Every "Why…" reveal on this page IS the exhibit — a compound
              component whose Root owns `open` and whose Trigger/Panel find it
              through Context. See _components/notes.tsx. */}
          <p className="text-sm text-muted-foreground">
            Setiap panel ungkap di halaman ini adalah pameran itu sendiri.{' '}
            <code>NotesRoot</code> memiliki <code>open</code> dan mencetak id
            panel; <code>NotesTrigger</code> dan <code>NotesPanel</code> adalah
            saudara yang harus menyepakati keduanya.
          </p>
          <NotesRoot>
            <NotesTrigger>Kenapa Context dan bukan props?</NotesTrigger>
            <NotesPanel>
              <p>
                Bagian-bagiannya harus berbagi nilai yang tidak dimiliki oleh
                keduanya, dan pemanggil menyusunnya dalam urutan apa pun dengan
                markup apa pun di antaranya. Mengoper id secara manual berarti
                setiap call site bisa salah merangkai <code>aria-controls</code>
                ; melalui Context hal itu tidak mungkin. Perhatikan named export
                yang datar — <code>NotesRoot</code>, bukan{' '}
                <code>Notes.Root</code>: modul ini{' '}
                <code>&apos;use client&apos;</code>, dan object export sebuah
                modul klien menjadi client-reference yang <code>.Root</code>-nya
                membaca <code>undefined</code> dari sebuah Server Component.{' '}
                <code>Page.Root</code> tetap memakai titiknya hanya karena ia
                tidak punya hook.
              </p>
            </NotesPanel>
          </NotesRoot>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant="secondary">4</Badge>
            zustand — pilihan terakhir
          </CardTitle>
          <CardDescription>
            Hanya-klien, sementara, tidak pantas menerima URL maupun penulisan.
            Gunakan seperlunya.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* This toggle is in THIS card; the list it restyles is in card 1.
              Their nearest common ancestor is this page — a Server Component,
              which cannot hold useState. */}
          <DensityToggle />
          <NotesRoot>
            <NotesTrigger>
              Apakah store ini benar-benar perlu? (Tidak.)
            </NotesTrigger>
            <NotesPanel>
              <p>
                Toggle dan baris yang gayanya diubahnya adalah dua island di dua
                kartu berbeda yang satu-satunya leluhur bersamanya adalah Server
                Component ini — tidak ada induk klien untuk diangkat. Tetapi
                Context tetap bisa melakukannya: bungkus kedua kartu dalam
                sebuah provider klien dan oper children yang dirender server
                melewatinya, persis seperti yang sudah dilakukan{' '}
                <code>DensityScope</code>. Keunggulan zustand di sini tipis —
                tidak ada provider untuk dirangkai, dan langganan selector hanya
                me-render ulang yang membaca slice-nya.
              </p>
              <p className="mt-2">
                Jadi ini adalah demonstrasi, bukan kebutuhan. Raih sebuah store
                ketika provider harus membentang di subtree yang benar-benar
                berjauhan, atau ketika pembaruan cukup sering sehingga biaya
                me-render-ulang-subtree milik Context menggigit: posisi seret,
                kursor langsung, antrean optimistik. Sampai saat itu, tangga di
                atasnya belum habis.
              </p>
            </NotesPanel>
          </NotesRoot>
        </CardContent>
      </Card>
    </Page.Root>
  )
}
