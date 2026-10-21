import { type Metadata } from 'next'
import Link from 'next/link'

import { Page } from '@/components/shell/page-container'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { requireCapability } from '@/lib/auth/guards'
import { ASSETS_COLLECTION } from '@/features/asset/asset.path'

import { RealtimeBoard, RealtimeCount } from './_components/realtime-board'

export const metadata: Metadata = {
  title: 'Realtime',
}

/**
 * The realtime example — the one route in this repo that reads
 * Firestore from the BROWSER.
 *
 * Everything else here is RSC-by-default and that stays the rule. This page
 * is not an argument against that default; it is the escape hatch, kept
 * imaginable and deletable so the day a project meets data that PUSHES (a
 * queue, a status board, another operator editing the row you are reading) the
 * shape is on the shelf with its argument attached — and the day it does not,
 * `trash "app/(app)/(examples)/realtime"` removes it without a trace.
 *
 * Three things are true here that are true nowhere else in this repo, and each
 * one costs something:
 *
 *  1. This read does NOT go through the Admin SDK, so it is SUBJECT to
 *     firestore.rules — which is why the setup carves `assets` out of a
 *     deny-all file. That carve-out is the security surface this page bought.
 *  2. The data arrives without a request. No revalidate, no refetch, no server
 *     round trip after the stream opens.
 *  3. The client bundle carries the Firestore Web SDK on THIS route only — the
 *     board and the count badge are the repo's only client-side Firestore reads.
 *
 * Gated with `requireCapability` at the top. That is UX only — it
 * keeps a user who cannot read assets from being shown an empty board. The real
 * boundary for this page is firestore.rules, because the listener talks to
 * Firestore directly and this Server Component is not in its path.
 */
export default async function RealtimeExamplePage() {
  await requireCapability('asset:read')

  return (
    <Page.Root>
      <Page.Header
        eyebrow="Contoh"
        title="Realtime"
        description="Papan aset langsung pada satu listener onSnapshot bersama — tanpa reload, tanpa refetch."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-4">
            <span>Aset aktif</span>
            {/* Subscriber #2. Same key as the board below, so ONE listener
                feeds both — the invariant the shared store exists to buy. */}
            <RealtimeCount collectionPath={ASSETS_COLLECTION} />
          </CardTitle>
          <CardDescription>
            Ubah aset di{' '}
            <Link href="/assets" className="underline underline-offset-4">
              /assets
            </Link>{' '}
            di tab lain, atau dari antarmuka emulator. Daftar ini diperbarui
            tanpa reload dan tanpa refetch.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* The feature-owned path crosses from this Server Component; the client
              island never hard-codes `assets`. */}
          <RealtimeBoard collectionPath={ASSETS_COLLECTION} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Bagaimana ini tetap langsung tanpa pustaka pengambilan data
          </CardTitle>
          <CardDescription>
            Versi jujurnya, dengan gaya bahasa yang dipakai /state tentang
            zustand.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Semua yang dijual pustaka pengambilan data (TanStack Query, SWR)
            tidak berguna terhadap sebuah stream. <code>onSnapshot</code>{' '}
            mendorong data, jadi tidak ada fetch untuk dijalankan ulang, tidak
            ada yang perlu di-poll, dan datanya tidak pernah basi — sehingga{' '}
            <code>staleTime</code>, <code>refetchOnWindowFocus</code> dan{' '}
            <code>refetchInterval</code> tidak punya tugas apa pun. Firestore
            Web SDK sudah menyimpan cache lokalnya sendiri dan sudah menyambung
            ulang dengan backoff-nya sendiri, jadi retry sebuah pustaka hanya
            akan menjadi salinan kedua yang lebih bodoh dari mekanisme yang
            sudah dimiliki SDK. Maka halaman ini tidak memakai satu pun —
            konfigurasinya nyaris hanya berisi daftar hal yang dimatikan.
          </p>
          <p>
            Yang memang dibutuhkan adalah satu invarian, dan halaman ini
            dibangun untuk menunjukkannya, bukan sekadar mengklaimnya: papan dan
            lencana hitungan di samping judul adalah dua island terpisah yang
            membaca key yang sama, dan keduanya berbagi <strong>satu</strong>{' '}
            listener Firestore. Buka konsol — dua baris <code>RETAIN</code>,
            satu <code>onSnapshot SUBSCRIBE</code>.{' '}
            <code>useSyncExternalStore</code> bawaan React di atas sebuah module
            store kecil ber-refcount memberi tepat itu, tanpa dependensi: store
            membuka listener saat island pertama dipasang dan menutupnya saat
            yang terakhir dilepas. Tanpanya, island kedua entah membuka
            stream-nya sendiri (dua stream, dua tagihan, dua salinan kebenaran
            yang bisa saling bertentangan di tengah jalan) atau harus diangkat
            ke island pertama dan di-prop-drill, yang berhenti bekerja begitu
            keduanya berada di subtree yang benar-benar berjauhan.
          </p>
          <p>
            Jadi kapan Anda SEBAIKNYA menambahkan TanStack Query? Pada titik
            ketika aplikasi <em>juga</em> mengambil data non-realtime di klien
            dan satu permukaan baca yang seragam (caching, dedup, retry) mulai
            sepadan dengan biayanya — atau ketika banyak komponen berjauhan
            mengambil data yang tumpang tindih. Di bawah garis itu, sebuah
            stream ditambah <code>useSyncExternalStore</code> sudah seluruh
            pekerjaannya, dan meraih pustaka cache hanyalah mesin yang
            mencari-cari masalah.
          </p>
        </CardContent>
      </Card>
    </Page.Root>
  )
}
