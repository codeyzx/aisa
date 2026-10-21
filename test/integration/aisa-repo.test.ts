import { beforeAll, describe, expect, it } from 'vitest'

import { adminDb } from '@/lib/firebase/admin-db'
import { requireEmulatorOrSkip } from '@/test/emulator'
import { seedAisa } from '@/scripts/_seed-aisa'

import {
  getLatestDigest,
  getLatestInsightDigest,
  getProposal,
  getRules,
  getRuntime,
  listDailyStats,
  listHistory,
  listJobsWithSteps,
  listProposalHistory,
  listRecentProposals,
  listUnrespondedProposals,
} from '@/features/aisa/aisa.repo'

/**
 * The dashboard's read model against a real Firestore: the seed writes
 * contract-shaped documents, and every repo read must PARSE them through the zod
 * mirrors (a drifted schema throws here, not in a page). It also runs the one
 * `where + orderBy` query (per-proposal history) so `pnpm indexes:check`, which
 * follows this suite, sees its composite-index shape.
 */
const reachable = await requireEmulatorOrSkip('aisa repo integration')

describe.skipIf(!reachable)('aisa repo', () => {
  beforeAll(async () => {
    await seedAisa(adminDb())
  })

  it('parses every seeded proposal and computes categories per the rules', async () => {
    const proposals = await listRecentProposals()
    expect(proposals.length).toBeGreaterThanOrEqual(14)
    const byName = new Map(proposals.map((p) => [p.name, p]))
    expect(byName.get('Tani Maju')?.category).toBe('sangat_cocok')
    // A criterion at 1 caps a ≥ 80 score at Cocok.
    expect(byName.get('Dana UMKM')?.category).toBe('cocok')
    const kopi = byName.get('Kopi Rakyat')
    expect(kopi?.category).toBe('tidak_cocok')
    expect(kopi?.qualityOutsideFocus).toBe(true)
    const manual = byName.get('Bengkel Online')
    expect(manual?.status).toBe('perlu_dicek_manual')
    expect(manual?.assessment ?? null).toBeNull()
    const fashion = byName.get('Fashionista')
    expect(fashion?.assessment?.criteria.produk?.citationsUnverified).toBe(true)
    expect(fashion?.assessment?.criteria.tim?.citationsUnverified).toBe(false)
  })

  it('keeps the AI category when a correction changes the effective one', async () => {
    const pasar = (await listRecentProposals()).find(
      (p) => p.name === 'Pasar Ikan',
    )
    expect(pasar?.category).toBe('kurang_cocok')
    expect(pasar?.effectiveCategory).toBe('cocok')
    expect(await getProposal(pasar?.id ?? '')).toMatchObject({
      correction: { category: 'cocok' },
    })
  })

  it('lists only unresponded proposals for the digest population', async () => {
    const open = await listUnrespondedProposals()
    expect(open.every((p) => !p.responded)).toBe(true)
    expect(open.some((p) => p.name === 'Panen Kita')).toBe(false)
  })

  it('reads rules, runtime, digest, stats, jobs and history', async () => {
    const rules = await getRules()
    expect(rules?.version).toBeGreaterThanOrEqual(1)
    expect(rules?.retentionDays).toBe(90)
    expect(rules?.models).not.toHaveProperty('orchestrator')
    expect((await getLatestInsightDigest())?.insight).toBeTruthy()
    expect((await getRuntime())?.paused).toBe(false)
    expect((await getLatestDigest())?.slot).toBe('09.00')
    const stats = await listDailyStats(14)
    expect(stats).toHaveLength(14)
    expect(stats[0]!.date < stats[13]!.date).toBe(true)
    const jobs = await listJobsWithSteps(30, 'job-penilaian-tanimaju')
    const tani = jobs.find((job) => job.id === 'job-penilaian-tanimaju')
    // The seed writes the seven steps a production assessment records.
    expect(tani?.steps.map((step) => step.seq)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(
      tani?.steps
        .filter((s) => s.actor === 'kode')
        .every((s) => s.tokensIn === 0),
    ).toBe(true)
    const retensi = jobs.find((job) => job.kind === 'retensi')
    expect(retensi?.model ?? null).toBeNull()
    expect(retensi?.steps).toHaveLength(1)
    const history = await listHistory(200)
    expect(history.some((row) => row.action === 'proposal_dihapus')).toBe(true)
  })

  it('reads one proposal’s history newest first', async () => {
    const rows = await listProposalHistory('form-seedpasarikan')
    expect(rows.map((row) => row.action)).toEqual(['koreksi', 'proposal_masuk'])
  })
})
