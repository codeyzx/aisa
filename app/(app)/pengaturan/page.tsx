import { type Metadata } from 'next'

import { AISA_CONFIGURE, AISA_READ } from '@/features/aisa/aisa.capability'
import { VIA_LABEL } from '@/features/aisa/aisa.labels'
import {
  countProposalsSince,
  getLatestDigest,
  getRules,
  getRuntime,
  listRecentProposals,
  listUnrespondedProposals,
} from '@/features/aisa/aisa.repo'
import type { EditableRules, Rules, Runtime } from '@/features/aisa/aisa.schema'
import { callAisaApi } from '@/lib/aisa-api/client'
import { requireCapability } from '@/lib/auth/guards'
import { can } from '@/lib/auth/rbac'
import { formatDate, formatTime } from '@/lib/format/date'

import { AppearanceTab } from './_components/appearance-tab'
import { DigestTab } from './_components/digest-tab'
import type { Integration } from './_components/integration-card'
import { IntegrationsTab } from './_components/integrations-tab'
import { PrivacyTab } from './_components/privacy-tab'
import { ProfileTab } from './_components/profile-tab'
import { settingsTabOf } from './_components/sections'
import { SettingsView } from './_components/settings-view'

export const metadata: Metadata = { title: 'Pengaturan' }

const when = (date: Date) => `${formatDate(date)}, ${formatTime(date)}`

function editable(rules: Rules): EditableRules {
  return {
    weights: rules.weights,
    anchors: rules.anchors,
    fit: rules.fit,
    thresholds: rules.thresholds,
    models: {
      penilai: rules.models.penilai,
      ringkasan: rules.models.ringkasan,
      insight: rules.models.insight,
    },
    minCharsPerPage: rules.minCharsPerPage,
    retentionDays: rules.retentionDays,
  }
}

function runtimeDetail(runtime: Runtime | null): string {
  if (!runtime?.paused)
    return 'AI menilai proposal yang masuk. STOP menghentikan pekerjaan yang sedang berjalan.'
  const since = runtime.pausedAt ? ` sejak ${when(runtime.pausedAt)}` : ''
  const via = runtime.pausedVia
    ? ` (lewat ${VIA_LABEL[runtime.pausedVia]})`
    : ''
  return `Pekerjaan AI berhenti${since}${via}. Proposal baru menunggu sebagai Antre sampai LANJUT.`
}

/** `GET /health` on aisa-api, timed. A refusal or no answer is "terputus". */
async function checkAisaApi() {
  const started = performance.now()
  const outcome = await callAisaApi<{ ok?: boolean }>('GET', '/health')
  const ok = outcome.ok && outcome.data?.ok === true
  return {
    ok,
    latencyMs: Math.round(performance.now() - started),
    at: formatTime(new Date()),
    error: outcome.ok
      ? ok
        ? null
        : 'Jawaban /health tidak dikenali'
      : outcome.error,
  }
}

async function integrations(rules: Rules | null): Promise<Integration[]> {
  const [check, latest, recent] = await Promise.all([
    checkAisaApi(),
    getLatestDigest(),
    listRecentProposals(),
  ])
  const lastForm = recent.find((p) => p.source.kind === 'form')
  const lastUpload = recent.find((p) => p.source.kind === 'upload')
  return [
    {
      id: 'aisa-api',
      name: 'aisa-api',
      role: 'Menerima deck, membaca teksnya, menjalankan penilaian, ringkasan, dan perintah WhatsApp.',
      status: check.ok ? 'terhubung' : 'terputus',
      fact: check.ok
        ? `Merespons dalam ${check.latencyMs} ms saat halaman dimuat`
        : 'Tidak merespons saat halaman dimuat',
      details: [
        { label: 'Dicek lewat', value: 'GET /health dari server dashboard' },
        { label: 'Dicek pukul', value: check.at },
      ],
      checkable: true,
      check,
    },
    {
      id: 'firestore',
      name: 'Firestore',
      role: 'Menyimpan proposal, aturan penilaian, aktivitas AI, dan riwayat.',
      status: rules ? 'terhubung' : null,
      fact: rules
        ? `Aturan versi ${rules.version} terbaca saat halaman dimuat`
        : 'Aturan penilaian belum ada (settings/rules)',
      details: rules
        ? [
            { label: 'Aturan aktif', value: `Versi ${rules.version}` },
            { label: 'Diubah', value: when(rules.changedAt) },
          ]
        : [],
    },
    {
      id: 'gowa',
      name: 'GOWA (WhatsApp)',
      role: 'Mengirim ringkasan ke WhatsApp manajer dan menerima balasannya.',
      status: null,
      fact: latest
        ? `Ringkasan terakhir terkirim ${when(latest.sentAt)}`
        : 'Belum ada ringkasan yang terkirim',
      details: latest
        ? [
            {
              label: 'Ringkasan terakhir',
              value: `${latest.slot} · ${when(latest.sentAt)}`,
            },
            {
              label: 'Pesan terkirim',
              value: String(latest.gowaMessageIds.length),
            },
            {
              label: 'Teks',
              value: latest.usedTemplate
                ? 'Template (tanpa AI)'
                : 'Dirapikan AI',
            },
          ]
        : [],
    },
    {
      id: 'form',
      name: 'Formulir founder',
      role: 'Google Form mengirim proposal dan pitch deck dari Google Drive ke aisa-api.',
      status: null,
      fact: lastForm
        ? `Proposal terakhir masuk ${when(lastForm.createdAt)}`
        : 'Belum ada proposal dari formulir',
      details: [
        {
          label: 'Lewat formulir',
          value: lastForm
            ? `${lastForm.name} · ${when(lastForm.createdAt)}`
            : '—',
        },
        {
          label: 'Unggah dashboard',
          value: lastUpload
            ? `${lastUpload.name} · ${when(lastUpload.createdAt)}`
            : '—',
        },
      ],
    },
  ]
}

export default async function PengaturanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability(AISA_READ)
  const canConfigure = can(session, AISA_CONFIGURE)
  const tab = settingsTabOf((await searchParams).tab)

  let content: React.ReactNode
  switch (tab) {
    case 'profil':
      content = <ProfileTab session={session} />
      break
    case 'tampilan':
      content = <AppearanceTab />
      break
    case 'ringkasan': {
      const latest = await getLatestDigest()
      const [unresponded, newCount] = await Promise.all([
        listUnrespondedProposals(),
        countProposalsSince(latest?.sentAt ?? new Date(0)),
      ])
      content = (
        <DigestTab
          unresponded={unresponded}
          latest={latest}
          newCount={newCount}
          now={new Date()}
        />
      )
      break
    }
    case 'integrasi': {
      const [rules, runtime] = await Promise.all([getRules(), getRuntime()])
      content = (
        <IntegrationsTab
          integrations={await integrations(rules)}
          runtime={{
            paused: runtime?.paused ?? false,
            detail: runtimeDetail(runtime),
            canConfigure,
          }}
        />
      )
      break
    }
    case 'privasi': {
      const [rules, proposalCount] = await Promise.all([
        getRules(),
        countProposalsSince(new Date(0)),
      ])
      content = rules ? (
        <PrivacyTab
          rules={editable(rules)}
          version={rules.version}
          proposalCount={proposalCount}
          canConfigure={canConfigure}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Aturan penilaian belum ada di Firestore (settings/rules).
        </p>
      )
      break
    }
  }

  return <SettingsView tab={tab}>{content}</SettingsView>
}
