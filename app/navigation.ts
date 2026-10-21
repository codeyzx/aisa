import {
  ActivityIcon,
  Clock3Icon,
  InboxIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  TrendingUpIcon,
} from 'lucide-react'

import { type NavSection } from '@/components/shell/nav-config'

/**
 * Product navigation belongs to application composition, not the reusable shell.
 * Each capability matches the destination's own page guard; filtering the sidebar
 * is UX only and never authorizes a route.
 */
export const APP_NAV_SECTIONS: NavSection[] = [
  {
    title: 'Ruang kerja',
    items: [
      {
        title: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboardIcon,
        capability: 'aisa:read',
      },
      {
        title: 'Proposal',
        href: '/proposal',
        icon: InboxIcon,
        capability: 'aisa:read',
      },
      {
        title: 'Tren',
        href: '/tren',
        icon: TrendingUpIcon,
        capability: 'aisa:read',
      },
      {
        title: 'Aktivitas AI',
        href: '/aktivitas',
        icon: ActivityIcon,
        capability: 'aisa:read',
      },
      {
        title: 'Riwayat',
        href: '/riwayat',
        icon: Clock3Icon,
        capability: 'aisa:read',
      },
    ],
  },
  {
    title: 'Lainnya',
    items: [
      {
        title: 'Aturan penilaian',
        href: '/aturan',
        icon: SlidersHorizontalIcon,
        capability: 'aisa:read',
      },
      {
        title: 'Pengaturan',
        href: '/pengaturan',
        icon: SettingsIcon,
        capability: 'aisa:read',
      },
    ],
  },
]
