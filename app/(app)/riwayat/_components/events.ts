// The Riwayat timeline's view of a `history` row. Pure, so the page builds it on
// the server and the client only filters it. Every field comes from the row or
// from a record the row points at (its proposal, the digest it announced); a
// field with nothing behind it stays undefined and the row renders without it.

import { historyDetailText, sectorLabel } from '@/features/aisa/aisa.labels'
import {
  type Category,
  CATEGORIES,
  DELETED_PROPOSAL_NAME,
  type Digest,
  type History,
  type Proposal,
  RESPONSE_KINDS,
  type ResponseKind,
  type Via,
} from '@/features/aisa/aisa.schema'

export const EVENT_KINDS = [
  'keputusan',
  'penilaian',
  'masuk',
  'whatsapp',
  'koreksi',
  'aturan',
  'jeda',
  'dihapus',
  'lainnya',
] as const
export type EventKind = (typeof EVENT_KINDS)[number]

/** Who did it: the AI pipeline, the system (CLI, retention), or the manager. */
export type ActorType = 'ai' | 'sistem' | 'manajer'

export const ACTOR_LABEL: Record<ActorType, string> = {
  ai: 'AISA',
  sistem: 'Sistem',
  manajer: 'Manajer',
}

export interface EventProposal {
  id: string
  name: string
  /** False once the proposal is deleted: the row stays, the link would 404. */
  linkable: boolean
  sector?: string
  source?: 'form' | 'upload'
  score?: number
  qualityOutsideFocus?: boolean
  statusReason?: string
}

export interface EventDigest {
  slot: Digest['slot']
  counts: Digest['counts']
  insight?: string
  text: string
  usedTemplate: boolean
}

export interface RiwayatEvent {
  id: string
  kind: EventKind
  /** The raw action, for the CSV and the "lainnya" fallback title. */
  action: string
  at: Date
  via: Via
  actor: ActorType
  /**
   * The server-written sentence describing the change, through
   * `historyDetailText` so an older raw score/category reads in display words.
   */
  detail: string
  reason?: string
  proposal?: EventProposal
  /** A tanggapan's response, or a tanggapan massal's. */
  decision?: ResponseKind
  /** The response it replaced, when the manager changed their mind. */
  previousDecision?: ResponseKind
  categoryFrom?: Category
  categoryTo?: Category
  rulesVersion?: number
  /** An intake that reached no kategori and waits for the manager. */
  manual?: boolean
  paused?: boolean
  digest?: EventDigest
  slot?: Digest['slot']
  tokens?: number
}

const isCategory = (v: unknown): v is Category =>
  typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v)
const isResponse = (v: unknown): v is ResponseKind =>
  typeof v === 'string' && (RESPONSE_KINDS as readonly string[]).includes(v)

/**
 * The digest a `ringkasan_terkirim` row announced. aisa-api writes the digest
 * and then the history row, without linking them, so the pair is the newest
 * digest sent at most `PAIR_WINDOW_MS` before the row.
 */
const PAIR_WINDOW_MS = 120_000

function pairDigest(at: Date, digests: Digest[]): Digest | undefined {
  let best: Digest | undefined
  for (const d of digests) {
    const gap = at.getTime() - d.sentAt.getTime()
    if (gap < -5_000 || gap > PAIR_WINDOW_MS) continue
    if (!best || d.sentAt > best.sentAt) best = d
  }
  return best
}

/**
 * aisa-api writes the intake's outcome into `after` (a kategori, or
 * `perlu_dicek_manual`); a row without it falls back to the proposal's state.
 * Intake writes the row only after the assessment, so a scored proposal's row
 * is its penilaian.
 */
function intakeCategory(row: History, p: Proposal | undefined) {
  if (isCategory(row.after)) return row.after
  if (row.after === undefined || row.after === null)
    return p?.category ?? undefined
  return undefined
}

/** `after` is the version number (or its digits), or `{ version }` on older rows. */
function versionOf(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  if (value && typeof value === 'object' && 'version' in value) {
    const v = (value as { version: unknown }).version
    return typeof v === 'number' ? v : undefined
  }
  return undefined
}

function kindOf(row: History, p: Proposal | undefined): EventKind {
  switch (row.action) {
    case 'tanggapan':
    case 'tanggapan_massal':
      return 'keputusan'
    case 'proposal_masuk':
      return intakeCategory(row, p) ? 'penilaian' : 'masuk'
    case 'ringkasan_terkirim':
      return 'whatsapp'
    case 'koreksi':
      return 'koreksi'
    case 'aturan_diubah':
      return 'aturan'
    case 'stop':
    case 'lanjut':
      return 'jeda'
    case 'proposal_dihapus':
      return 'dihapus'
    default:
      return 'lainnya'
  }
}

function actorOf(row: History, kind: EventKind): ActorType {
  if (row.via !== 'sistem') return 'manajer'
  return kind === 'penilaian' || kind === 'masuk' || kind === 'whatsapp'
    ? 'ai'
    : 'sistem'
}

export function toEvents(
  rows: History[],
  proposals: Proposal[],
  digests: Digest[],
): RiwayatEvent[] {
  const byId = new Map(proposals.map((p) => [p.id, p]))
  return rows.map((row) => {
    const p = row.proposalId ? byId.get(row.proposalId) : undefined
    const kind = kindOf(row, p)
    const deleted =
      kind === 'dihapus' || row.proposalName === DELETED_PROPOSAL_NAME
    const proposal: EventProposal | undefined = row.proposalId
      ? {
          id: row.proposalId,
          name: deleted
            ? DELETED_PROPOSAL_NAME
            : (row.proposalName ?? p?.name ?? row.proposalId),
          linkable: !deleted,
          sector: p?.profile?.sector
            ? sectorLabel(p.profile.sector)
            : undefined,
          source: p?.source.kind,
          score: p?.assessment?.score,
          qualityOutsideFocus: p?.qualityOutsideFocus,
          statusReason: p?.statusReason ?? undefined,
        }
      : undefined
    const digest = kind === 'whatsapp' ? pairDigest(row.at, digests) : undefined
    const slotInDetail = /\b(09\.00|17\.00)\b/.exec(row.detail)?.[1] as
      | Digest['slot']
      | undefined
    const tokens = p ? p.tokens.in + p.tokens.out : 0
    return {
      id: row.id,
      kind,
      action: row.action,
      at: row.at,
      via: row.via,
      actor: actorOf(row, kind),
      detail: historyDetailText(row.detail),
      reason: row.reason?.trim() || undefined,
      proposal,
      decision:
        kind === 'keputusan' && isResponse(row.after) ? row.after : undefined,
      previousDecision:
        row.action === 'tanggapan' && isResponse(row.before)
          ? row.before
          : undefined,
      categoryFrom:
        kind === 'koreksi' && isCategory(row.before) ? row.before : undefined,
      categoryTo:
        kind === 'penilaian'
          ? intakeCategory(row, p)
          : kind === 'koreksi' && isCategory(row.after)
            ? row.after
            : undefined,
      manual:
        kind === 'masuk'
          ? row.after === 'perlu_dicek_manual' ||
            p?.status === 'perlu_dicek_manual'
          : undefined,
      rulesVersion: kind === 'aturan' ? versionOf(row.after) : undefined,
      paused: kind === 'jeda' ? row.action === 'stop' : undefined,
      digest: digest
        ? {
            slot: digest.slot,
            counts: digest.counts,
            insight: digest.insight?.trim() || undefined,
            text: digest.text,
            usedTemplate: digest.usedTemplate,
          }
        : undefined,
      slot: digest?.slot ?? slotInDetail,
      tokens: kind === 'penilaian' && tokens > 0 ? tokens : undefined,
    }
  })
}
