import {
  Download,
  HardDrive,
  LayoutDashboard,
  Package,
  Radio,
  Sparkles,
  ToggleLeft,
} from 'lucide-react'

import { type NavSection } from '@/components/shell/nav-config'

/**
 * Product navigation belongs to application composition, not the reusable shell.
 * Each capability matches the destination's own page guard; filtering the sidebar
 * is UX only and never authorizes a route.
 */
export const APP_NAV_SECTIONS: NavSection[] = [
  {
    items: [
      {
        title: 'Beranda',
        href: '/dashboard',
        icon: LayoutDashboard,
        capability: null,
      },
    ],
  },
  {
    // The example features, grouped — the asset register included. A fork that
    // drops the examples deletes this whole section AND the `app/(app)/(examples)/`
    // folder (where `/assets` and every demo below already live) together.
    title: 'Contoh',
    items: [
      {
        title: 'Aset',
        href: '/assets',
        icon: Package,
        capability: 'asset:read',
      },
      { title: 'AI', href: '/ai', icon: Sparkles, capability: 'ai:invoke' },
      {
        title: 'Ekspor',
        href: '/export',
        icon: Download,
        capability: 'export:read',
      },
      {
        title: 'Realtime',
        href: '/realtime',
        icon: Radio,
        capability: 'asset:read',
      },
      {
        title: 'State',
        href: '/state',
        icon: ToggleLeft,
        capability: 'asset:read',
      },
      {
        title: 'Penyimpanan',
        href: '/storage',
        icon: HardDrive,
        capability: 'storage:write',
      },
    ],
  },
  // No Administration section: impersonation moved to the user dropdown, and the
  // `/admin` route stays reachable as a direct/no-JS fallback (it keeps its own
  // `requireCapability('admin:access')` guard) — it is simply not a sidebar link.
]
