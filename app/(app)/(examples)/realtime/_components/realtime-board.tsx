'use client'

import { Badge } from '@/components/ui/badge'
import { ASSET_STATUS_LABEL } from '@/features/asset/asset.schema'

import { useRealtimeAssets } from './use-realtime-assets'

interface RealtimeIslandProps {
  /**
   * The collection path, handed down from the Server Component.
   *
   * It arrives as a prop so this client island does not own an `assets` literal.
   * The dependency-free feature path crosses from its Server Component parent;
   * the Admin-SDK accessor remains server-only.
   */
  collectionPath: string
}

/**
 * Subscriber #1. Renders the live rows.
 */
export function RealtimeBoard({
  collectionPath,
}: Readonly<RealtimeIslandProps>) {
  const { data, error } = useRealtimeAssets(collectionPath)

  // An error means the stream could not OPEN. In practice that is
  // PERMISSION_DENIED, which is what this renders the day someone removes the
  // `assets` carve-out from firestore.rules — loud here rather than silent,
  // which is why the message names the cause.
  if (error) {
    return (
      <p className="text-sm text-destructive">
        Listener tidak dapat dibuka: {String(error)}. Jika ini menyebutkan
        PERMISSION_DENIED, carve-out firestore.rules untuk `assets` sudah
        hilang.
      </p>
    )
  }

  // `data` is `undefined` until the first snapshot arrives (or while the user is
  // signed out). There is no fetch here, so this state means "the stream has not
  // opened yet", and it also narrows `data` to `Asset[]` below.
  if (data === undefined) {
    return <p className="text-sm text-muted-foreground">Membuka stream…</p>
  }

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Tidak ada aset aktif.</p>
    )
  }

  return (
    <ul className="divide-y divide-border">
      {data.map((asset) => (
        <li
          key={asset.id}
          className="flex items-center justify-between gap-4 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{asset.name}</p>
            {asset.description ? (
              <p className="truncate text-xs text-muted-foreground">
                {asset.description}
              </p>
            ) : null}
          </div>
          <Badge variant="secondary">{ASSET_STATUS_LABEL[asset.status]}</Badge>
        </li>
      ))}
    </ul>
  )
}

/**
 * Subscriber #2 — a SEPARATE island, deliberately.
 *
 * It is not decoration and it is not a second query: it exists to make the
 * shared store's one invariant visible. It calls the same hook, so it hits the
 * same key, so it shares ONE Firestore listener with the board above rather than
 * opening a second stream. Watch the console: two RETAIN lines, one
 * "onSnapshot SUBSCRIBE".
 *
 * Delete the store and this component either opens its own listener (two
 * streams, two bills, two copies of the truth that can disagree mid-flight) or
 * has to be lifted into the board and prop-drilled — which stops working the
 * moment the two live in genuinely distant subtrees.
 */
export function RealtimeCount({
  collectionPath,
}: Readonly<RealtimeIslandProps>) {
  const { data } = useRealtimeAssets(collectionPath)

  // `data?.length ?? '—'` rather than a check on the pending state: `data` is
  // also undefined when the stream FAILED to open, so branching on "pending"
  // alone would claim a count this component does not have. The board says what
  // went wrong; this badge just declines to invent a number.
  return (
    <Badge variant="outline" className="tabular-nums">
      {data?.length ?? '—'} langsung
    </Badge>
  )
}
