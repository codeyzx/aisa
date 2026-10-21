import {
  Activity,
  FileText,
  History,
  Settings,
  Sun,
  TrendingUp,
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
        title: 'Hari ini',
        href: '/hari-ini',
        icon: Sun,
        capability: 'aisa:read',
      },
      {
        title: 'Proposal',
        href: '/proposal',
        icon: FileText,
        capability: 'aisa:read',
      },
      {
        title: 'Tren',
        href: '/tren',
        icon: TrendingUp,
        capability: 'aisa:read',
      },
      {
        title: 'Aktivitas AI',
        href: '/aktivitas',
        icon: Activity,
        capability: 'aisa:read',
      },
      {
        title: 'Riwayat',
        href: '/riwayat',
        icon: History,
        capability: 'aisa:read',
      },
      {
        title: 'Pengaturan',
        href: '/pengaturan',
        icon: Settings,
        capability: 'aisa:read',
      },
    ],
  },
]
