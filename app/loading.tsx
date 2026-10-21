// Root Suspense fallback, shown while a route segment streams in. Server
// Component, takes no props, DEFAULT export per Next's file convention.
//
// Deliberately a neutral spinner rather than a skeleton: this boundary sits at
// the app root and backs every route, so it cannot know the shape of the page
// arriving. Segments with a predictable layout should add their own
// `loading.tsx` with a matching skeleton — that one wins, being nearer.

import { Spinner } from '@/components/ui/spinner'

export default function Loading() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  )
}
