import { describe, expect, it } from 'vitest'

import type {
  AssessmentProgress,
  ProgressStep,
} from '@/features/aisa/aisa.repo'

import { deriveProgress } from './assessment-progress-state'

const T0 = new Date('2026-10-22T03:00:00Z')
const at = (ms: number) => new Date(T0.getTime() + ms)

const step = (
  seq: number,
  action: string,
  fields: Partial<ProgressStep> = {},
): ProgressStep => ({
  seq,
  action,
  tool: 'kode',
  actor: 'kode',
  at: at(seq * 100),
  durationMs: 50,
  status: 'ok',
  error: null,
  ...fields,
})

const progress = (
  fields: Partial<AssessmentProgress> = {},
  job: Partial<NonNullable<AssessmentProgress['job']>> | null = {},
): AssessmentProgress => ({
  status: 'dinilai_proses',
  statusReason: null,
  paused: false,
  serverNow: at(5000),
  job:
    job === null
      ? null
      : {
          id: 'penilaian-1',
          status: 'berjalan',
          startedAt: T0,
          endedAt: null,
          durationMs: null,
          currentStep: null,
          steps: [],
          ...job,
        },
  ...fields,
})

const states = (p: AssessmentProgress) =>
  deriveProgress(p).rows.map((row) => [row.key, row.state])

describe('deriveProgress', () => {
  it('marks the step named by currentStep as running, and the rest as waiting', () => {
    const view = deriveProgress(
      progress(
        {},
        {
          steps: [
            step(1, 'Ekstrak teks per halaman', { tool: 'pypdf' }),
            step(2, 'Cek jumlah teks'),
          ],
          currentStep: {
            action: 'Menilai 5 kriteria',
            tool: 'gemini.generate_content',
            actor: 'model',
            startedAt: at(300),
          },
        },
      ),
    )
    expect(view.phase).toBe('berjalan')
    expect(view.settled).toBe(false)
    expect(view.rows.map((r) => [r.key, r.state])).toEqual([
      ['ekstrak', 'selesai'],
      ['cek_teks', 'selesai'],
      ['nilai', 'berjalan'],
      ['skor', 'menunggu'],
      ['cocok', 'menunggu'],
      ['kategori', 'menunggu'],
      ['simpan', 'menunggu'],
    ])
    const running = view.rows[2]!
    expect(running.by).toBe('ai')
    expect(running.startedAt).toEqual(at(300))
    expect(running.typical).toBe('biasanya 15–25 detik')
    expect(view.rows[0]!.durationMs).toBe(50)
  })

  it('without currentStep (an older job) names the next step berikutnya, never berjalan', () => {
    const rows = deriveProgress(
      progress({}, { steps: [step(1, 'Ekstrak teks per halaman')] }),
    ).rows
    expect(rows.some((r) => r.state === 'berjalan')).toBe(false)
    expect(rows[1]).toMatchObject({ key: 'cek_teks', state: 'berikutnya' })
    expect(rows[2]).toMatchObject({ key: 'nilai', state: 'menunggu' })
  })

  it('keeps a failed model attempt and shows the retry as its own running row', () => {
    const rows = deriveProgress(
      progress(
        {},
        {
          steps: [
            step(1, 'Ekstrak teks per halaman'),
            step(2, 'Cek jumlah teks'),
            step(3, 'Menilai 5 kriteria', {
              actor: 'model',
              tool: 'gemini.generate_content',
              status: 'gagal',
              error: 'format tidak valid',
            }),
          ],
          currentStep: {
            action: 'Menilai 5 kriteria (ulang)',
            tool: 'gemini.generate_content',
            actor: 'model',
            startedAt: at(900),
          },
        },
      ),
    ).rows
    expect(rows[2]).toMatchObject({
      key: 'nilai',
      state: 'gagal',
      error: 'format tidak valid',
    })
    expect(rows[3]).toMatchObject({
      key: 'nilai',
      state: 'berjalan',
      retry: true,
      title: 'AI menilai 5 kriteria (ulang)',
    })
    expect(rows[4]).toMatchObject({ key: 'skor', state: 'menunggu' })
  })

  it('lists the optional deck fetch only once it runs', () => {
    const before = deriveProgress(progress({}, { steps: [] })).rows
    expect(before.some((r) => r.key === 'ambil')).toBe(false)
    const fetching = deriveProgress(
      progress(
        {},
        {
          currentStep: {
            action: 'Ambil pitch deck',
            tool: 'storage',
            actor: 'kode',
            startedAt: at(10),
          },
        },
      ),
    ).rows
    expect(fetching[0]).toMatchObject({ key: 'ambil', state: 'berjalan' })
  })

  it('reads a queued proposal as antre, or dijeda while STOP is on, without an old job', () => {
    expect(deriveProgress(progress({ status: 'antre' }, null)).phase).toBe(
      'antre',
    )
    const paused = deriveProgress(
      progress({ status: 'antre', paused: true }, null),
    )
    expect(paused.phase).toBe('dijeda')
    expect(paused.settled).toBe(false)
    expect(paused.jobStartedAt).toBeNull()
  })

  it('reads a run that went back to the queue after failing as gagal, with its reason', () => {
    const view = deriveProgress(
      progress(
        { status: 'antre', statusReason: 'gagal diproses: timeout' },
        {
          status: 'gagal',
          endedAt: at(4000),
          steps: [
            step(1, 'Ekstrak teks per halaman', {
              status: 'gagal',
              error: 'PDF rusak',
            }),
          ],
        },
      ),
    )
    expect(view.phase).toBe('gagal')
    expect(view.settled).toBe(true)
    expect(view.statusReason).toBe('gagal diproses: timeout')
    expect(view.totalMs).toBe(4000)
    expect(view.rows[0]).toMatchObject({ key: 'ekstrak', state: 'gagal' })
    expect(view.rows.slice(1).every((r) => r.state === 'dilewati')).toBe(true)
  })

  it('ends a too-little-text deck at perlu dicek manual with the rest skipped', () => {
    const p = progress(
      {
        status: 'perlu_dicek_manual',
        statusReason: 'teks terlalu sedikit (34 karakter di 12 halaman)',
      },
      {
        status: 'selesai',
        endedAt: at(2000),
        steps: [
          step(1, 'Ekstrak teks per halaman'),
          step(2, 'Cek jumlah teks'),
        ],
      },
    )
    expect(deriveProgress(p).phase).toBe('perlu_dicek_manual')
    expect(states(p).slice(2)).toEqual([
      ['nilai', 'dilewati'],
      ['skor', 'dilewati'],
      ['cocok', 'dilewati'],
      ['kategori', 'dilewati'],
      ['simpan', 'dilewati'],
    ])
  })

  it('shows the image read of a scanned deck as an AI step before the criteria', () => {
    const rows = deriveProgress(
      progress(
        {},
        {
          steps: [
            step(1, 'Ekstrak teks per halaman'),
            step(2, 'Cek jumlah teks'),
          ],
          currentStep: {
            action: 'Baca teks dari gambar',
            tool: 'gemini.generate_content',
            actor: 'model',
            startedAt: at(300),
          },
        },
      ),
    ).rows
    expect(rows.map((r) => [r.key, r.state])).toEqual([
      ['ekstrak', 'selesai'],
      ['cek_teks', 'selesai'],
      ['baca_gambar', 'berjalan'],
      ['nilai', 'menunggu'],
      ['skor', 'menunggu'],
      ['cocok', 'menunggu'],
      ['kategori', 'menunggu'],
      ['simpan', 'menunggu'],
    ])
    expect(rows[2]).toMatchObject({
      by: 'ai',
      title: 'AI membaca deck sebagai gambar',
    })
  })

  it('does not list the image read for a deck with enough text', () => {
    const rows = deriveProgress(
      progress({}, { steps: [step(1, 'Ekstrak teks per halaman')] }),
    ).rows
    expect(rows.some((r) => r.key === 'baca_gambar')).toBe(false)
  })

  it('ends a deck still unreadable after the image read at perlu dicek manual', () => {
    const p = progress(
      {
        status: 'perlu_dicek_manual',
        statusReason:
          'teks terlalu sedikit, juga setelah dibaca sebagai gambar (12 karakter di 4 halaman)',
      },
      {
        status: 'selesai',
        endedAt: at(9000),
        steps: [
          step(1, 'Ekstrak teks per halaman'),
          step(2, 'Cek jumlah teks'),
          step(3, 'Baca teks dari gambar', {
            actor: 'model',
            tool: 'gemini.generate_content',
          }),
        ],
      },
    )
    expect(deriveProgress(p).phase).toBe('perlu_dicek_manual')
    expect(states(p)).toEqual([
      ['ekstrak', 'selesai'],
      ['cek_teks', 'selesai'],
      ['baca_gambar', 'selesai'],
      ['nilai', 'dilewati'],
      ['skor', 'dilewati'],
      ['cocok', 'dilewati'],
      ['kategori', 'dilewati'],
      ['simpan', 'dilewati'],
    ])
  })

  it('shows a STOP mid-run as dihentikan', () => {
    const p = progress(
      { status: 'dihentikan', statusReason: 'dihentikan oleh STOP' },
      {
        status: 'dihentikan',
        endedAt: at(3000),
        steps: [
          step(1, 'Ekstrak teks per halaman'),
          step(2, 'Cek jumlah teks'),
          step(3, 'Dihentikan oleh STOP', { status: 'dihentikan' }),
        ],
      },
    )
    expect(deriveProgress(p).phase).toBe('dihentikan')
    expect(states(p)[2]).toEqual(['stop', 'dihentikan'])
  })

  it('on success shows only what ran, never a running row', () => {
    const p = progress(
      { status: 'dinilai' },
      {
        status: 'berjalan',
        steps: [step(1, 'Ekstrak teks per halaman')],
        currentStep: {
          action: 'Simpan hasil penilaian',
          tool: 'firestore',
          actor: 'kode',
          startedAt: at(100),
        },
      },
    )
    const view = deriveProgress(p)
    expect(view.phase).toBe('selesai')
    expect(view.rows.map((r) => r.state)).toEqual(['selesai'])
  })

  it('ignores the previous job while a freshly claimed run has not linked its own', () => {
    const view = deriveProgress(
      progress(
        {},
        { status: 'gagal', steps: [step(1, 'Ekstrak teks per halaman')] },
      ),
    )
    expect(view.phase).toBe('berjalan')
    expect(view.jobStartedAt).toBeNull()
    expect(view.rows[0]).toMatchObject({ key: 'ekstrak', state: 'berikutnya' })
  })

  it('shows an action this build does not know as recorded', () => {
    const rows = deriveProgress(
      progress({}, { steps: [step(1, 'Langkah baru', { actor: 'model' })] }),
    ).rows
    expect(rows[0]).toMatchObject({
      key: null,
      title: 'Langkah baru',
      by: 'ai',
    })
  })
})
