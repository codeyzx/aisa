/**
 * Realistic FAKE AISA data for local driving and tests, shaped per
 * docs/reference/contracts/aisa-firestore.md: proposals in every category, a
 * "perlu dicek manual" pair, a "berkualitas, di luar fokus" one, a queued
 * upload, penilaian + ringkasan jobs with steps, history, 14 days of
 * dailyStats, the latest digest, and `settings/rules` v1 with the overview's
 * baseline weights.
 *
 * Scores and categories are COMPUTED here with the overview's formula
 * (`skor = Σ bobot × (nilai − 1) / 4`, thresholds 80/65/45/65) rather than typed
 * in, so the seed cannot contradict the rules it ships with.
 *
 * NO SAFETY GATE HERE and no top-level side effects: the only `firebase-admin`
 * import is `import type`. It writes to whatever `Firestore` the caller hands
 * it, and the caller (`seed-emulator.ts`) builds that only after
 * `requireEmulatorTarget` has proven the process can reach nothing but an
 * emulator. Every write is a `set` on a fixed id, so re-running converges.
 */
import type { Firestore } from 'firebase-admin/firestore'

import {
  DAILY_STATS_COLLECTION,
  DIGESTS_COLLECTION,
  HISTORY_COLLECTION,
  JOB_STEPS_SUBCOLLECTION,
  JOBS_COLLECTION,
  PROPOSALS_COLLECTION,
  RULES_DOC_ID,
  RULES_VERSIONS_COLLECTION,
  RUNTIME_DOC_ID,
  SETTINGS_COLLECTION,
} from '../features/aisa/aisa.path.ts'

const PROPOSAL_TEXTS_COLLECTION = 'proposalTexts'
const MODEL = 'gemini-3.8-flash'
const CRITERIA = ['tim', 'pasar', 'produk', 'traksi', 'bisnis'] as const
type Criterion = (typeof CRITERIA)[number]
type Category = 'sangat_cocok' | 'cocok' | 'kurang_cocok' | 'tidak_cocok'

const WEIGHTS: Record<Criterion, number> = {
  tim: 0.275,
  pasar: 0.3,
  produk: 0.2,
  traksi: 0.125,
  bisnis: 0.1,
}
const THRESHOLDS = {
  sangatCocok: 80,
  cocok: 65,
  kurangCocok: 45,
  qualityOutsideFocus: 65,
}
// Same values as `default_rules()` in services/api/aisa/models.py, so a seeded
// emulator and a freshly provisioned project score the same way.
const FIT = {
  sectors: ['agritech', 'fintech', 'edtech', 'healthtech', 'climate'],
  stages: ['pre-seed', 'seed', 'seri-a'],
  fundingMinIdr: 1_000_000_000,
  fundingMaxIdr: 20_000_000_000,
}
const ANCHOR = {
  '1': 'Tidak ada bukti, atau bukti bertentangan',
  '3': 'Ada bukti sebagian',
  '5': 'Bukti kuat: data, perilaku pelanggan, atau rekam jejak',
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

const wibDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

interface Seed {
  key: string
  name: string
  sector: string | null
  stage: string | null
  funding: number | null
  oneLiner: string
  values: Record<Criterion, number> | null
  hoursAgo: number
  source: 'form' | 'upload'
  manualReason?: string
  queued?: boolean
  response?: { kind: 'undang' | 'pantau' | 'arsipkan'; note?: string }
  correction?: { category: Category; reason: string }
  /** Criteria whose value the API capped at 2 because no quote verified. */
  unverified?: Criterion[]
}

const SEEDS: Seed[] = [
  {
    key: 'tanimaju',
    name: 'Tani Maju',
    sector: 'agritech',
    stage: 'seed',
    funding: 5_000_000_000,
    oneLiner: 'Platform pembiayaan dan input pertanian untuk petani padi.',
    values: { tim: 5, pasar: 5, produk: 4, traksi: 5, bisnis: 4 },
    hoursAgo: 5,
    source: 'form',
  },
  {
    key: 'panenkita',
    name: 'Panen Kita',
    sector: 'agritech',
    stage: 'seed',
    funding: 3_000_000_000,
    oneLiner: 'Pasar daring hasil panen langsung dari petani ke restoran.',
    values: { tim: 5, pasar: 4, produk: 4, traksi: 4, bisnis: 4 },
    hoursAgo: 30,
    source: 'form',
    response: { kind: 'undang', note: 'Jadwalkan pitching minggu depan' },
    correction: {
      category: 'cocok',
      reason: 'Restoran yang dilayani baru di satu kota',
    },
  },
  {
    key: 'sawahku',
    name: 'SawahKu',
    sector: 'agritech',
    stage: 'pre-seed',
    funding: 1_500_000_000,
    oneLiner: 'Sensor kelembapan tanah murah untuk sawah tadah hujan.',
    values: { tim: 4, pasar: 4, produk: 4, traksi: 3, bisnis: 3 },
    hoursAgo: 8,
    source: 'form',
  },
  {
    key: 'klinikdesa',
    name: 'Klinik Desa',
    sector: 'healthtech',
    stage: 'seed',
    funding: 4_000_000_000,
    oneLiner: 'Telemedisin untuk puskesmas pembantu di desa.',
    values: { tim: 4, pasar: 5, produk: 4, traksi: 3, bisnis: 3 },
    hoursAgo: 12,
    source: 'upload',
  },
  {
    key: 'danaumkm',
    name: 'Dana UMKM',
    sector: 'fintech',
    stage: 'seed',
    funding: 6_000_000_000,
    oneLiner: 'Kredit modal kerja berbasis data transaksi QRIS.',
    values: { tim: 5, pasar: 5, produk: 5, traksi: 5, bisnis: 1 },
    hoursAgo: 20,
    source: 'form',
  },
  {
    key: 'belajaryuk',
    name: 'BelajarYuk',
    sector: 'edtech',
    stage: 'pre-seed',
    funding: 1_200_000_000,
    oneLiner: 'Kelas persiapan UTBK lewat WhatsApp.',
    values: { tim: 3, pasar: 4, produk: 3, traksi: 3, bisnis: 3 },
    hoursAgo: 26,
    source: 'form',
  },
  {
    key: 'pasarikan',
    name: 'Pasar Ikan',
    sector: 'agritech',
    stage: 'seed',
    funding: 2_000_000_000,
    oneLiner: 'Lelang ikan daring untuk nelayan kecil.',
    values: { tim: 3, pasar: 3, produk: 3, traksi: 3, bisnis: 3 },
    hoursAgo: 50,
    source: 'form',
    correction: {
      category: 'cocok',
      reason: 'Traksi di Muncar lebih kuat dari yang terbaca di proposal',
    },
  },
  {
    key: 'aplikasix',
    name: 'AplikasiX',
    sector: 'fintech',
    stage: 'seed',
    funding: 2_500_000_000,
    oneLiner: 'Aplikasi dompet digital umum.',
    values: { tim: 2, pasar: 2, produk: 2, traksi: 1, bisnis: 2 },
    hoursAgo: 70,
    source: 'form',
    response: { kind: 'arsipkan' },
  },
  {
    key: 'kopirakyat',
    name: 'Kopi Rakyat',
    sector: 'F&B',
    stage: 'seed',
    funding: 3_000_000_000,
    oneLiner: 'Jaringan kedai kopi susu di kota tier-2.',
    values: { tim: 5, pasar: 4, produk: 4, traksi: 5, bisnis: 3 },
    hoursAgo: 16,
    source: 'form',
  },
  {
    key: 'fashionista',
    name: 'Fashionista',
    sector: 'fashion',
    stage: 'seri-b',
    funding: 25_000_000_000,
    oneLiner: 'Merek busana muslim daring.',
    values: { tim: 2, pasar: 3, produk: 2, traksi: 3, bisnis: 2 },
    unverified: ['produk'],
    hoursAgo: 40,
    source: 'form',
  },
  {
    key: 'ternakpintar',
    name: 'Ternak Pintar',
    sector: 'agritech',
    stage: null,
    funding: null,
    oneLiner: 'Aplikasi pencatatan ternak sapi perah.',
    values: { tim: 3, pasar: 4, produk: 3, traksi: 1, bisnis: 1 },
    hoursAgo: 3,
    source: 'form',
  },
  {
    key: 'bengkelonline',
    name: 'Bengkel Online',
    sector: null,
    stage: null,
    funding: null,
    oneLiner: '',
    values: null,
    hoursAgo: 6,
    source: 'form',
    manualReason: 'teks terlalu sedikit (34 karakter di 12 halaman)',
  },
  {
    key: 'rumahbelajar',
    name: 'Rumah Belajar',
    sector: null,
    stage: null,
    funding: null,
    oneLiner: '',
    values: null,
    hoursAgo: 22,
    source: 'upload',
    manualReason: 'teks terlalu sedikit (0 karakter di 9 halaman)',
  },
  {
    key: 'logistiknusantara',
    name: 'Logistik Nusantara',
    sector: null,
    stage: null,
    funding: null,
    oneLiner: '',
    values: null,
    hoursAgo: 0.2,
    source: 'upload',
    queued: true,
  },
]

function scoreOf(values: Record<Criterion, number>): number {
  const raw = CRITERIA.reduce(
    (sum, c) => sum + WEIGHTS[c] * ((values[c] - 1) / 4),
    0,
  )
  return Math.round(raw * 1000) / 10
}

function categoryOf(
  score: number,
  fitPassed: boolean,
  values: Record<Criterion, number>,
) {
  if (!fitPassed)
    return {
      category: 'tidak_cocok' as Category,
      outside: score >= THRESHOLDS.qualityOutsideFocus,
    }
  const anyOne = CRITERIA.some((c) => values[c] === 1)
  if (score >= THRESHOLDS.sangatCocok && !anyOne)
    return { category: 'sangat_cocok' as Category, outside: false }
  if (score >= THRESHOLDS.cocok)
    return { category: 'cocok' as Category, outside: false }
  if (score >= THRESHOLDS.kurangCocok)
    return { category: 'kurang_cocok' as Category, outside: false }
  return { category: 'tidak_cocok' as Category, outside: false }
}

function rp(n: number) {
  return `Rp${(n / 1_000_000_000).toLocaleString('id-ID')} M`
}

/** One `kode` (non-model) assessment step, finished `ok`. */
function code(
  action: string,
  tool: string,
  durationMs: number,
  io: { read?: string; wrote?: string } = {},
) {
  return {
    action,
    tool,
    actor: 'kode',
    read: io.read ?? null,
    wrote: io.wrote ?? null,
    tokensIn: 0,
    tokensOut: 0,
    durationMs,
    status: 'ok',
  }
}

function fitOf(seed: Seed) {
  const sectorOk = seed.sector !== null && FIT.sectors.includes(seed.sector)
  const stageOk = seed.stage !== null && FIT.stages.includes(seed.stage)
  const fundingOk =
    seed.funding !== null &&
    seed.funding >= FIT.fundingMinIdr &&
    seed.funding <= FIT.fundingMaxIdr
  return {
    passed: sectorOk && stageOk && fundingOk,
    checks: {
      sector: {
        passed: sectorOk,
        reason:
          seed.sector === null
            ? 'sektor tidak disebut'
            : sectorOk
              ? `${seed.sector} termasuk sektor fokus`
              : `${seed.sector} di luar sektor fokus`,
      },
      stage: {
        passed: stageOk,
        reason:
          seed.stage === null
            ? 'tahap pendanaan tidak disebut'
            : stageOk
              ? `${seed.stage} sesuai`
              : `${seed.stage} di luar tahap fokus`,
      },
      funding: {
        passed: fundingOk,
        reason:
          seed.funding === null
            ? 'besar dana tidak disebut'
            : fundingOk
              ? `${rp(seed.funding)} dalam rentang ${rp(FIT.fundingMinIdr)}–${rp(FIT.fundingMaxIdr)}`
              : `${rp(seed.funding)} di luar rentang ${rp(FIT.fundingMinIdr)}–${rp(FIT.fundingMaxIdr)}`,
      },
    },
  }
}

const REASONS: Record<Criterion, Record<number, string>> = {
  tim: {
    1: 'Proposal tidak menyebut susunan tim.',
    2: 'Tim baru, belum ada rekam jejak di bidang ini.',
    3: 'Pendiri punya pengalaman sebagian di industri.',
    4: 'Tim inti berpengalaman dan lengkap.',
    5: 'Pendiri pernah membangun dan keluar dari startup serupa.',
  },
  pasar: {
    1: 'Ukuran pasar tidak disebut.',
    2: 'Masalah kurang tajam, pasar sangat umum.',
    3: 'Masalah jelas, ukuran pasar perkiraan kasar.',
    4: 'Masalah tajam dengan data pasar sekunder.',
    5: 'Masalah tervalidasi dengan riset lapangan dan data pasar.',
  },
  produk: {
    1: 'Produk belum dijelaskan.',
    2: 'Produk mirip banyak pesaing.',
    3: 'Prototipe berjalan, keunggulan belum jelas.',
    4: 'Produk berjalan dengan keunggulan yang jelas.',
    5: 'Produk berjalan dengan teknologi yang sulit ditiru.',
  },
  traksi: {
    1: 'Tidak ada data pengguna atau pendapatan.',
    2: 'Baru uji coba kecil.',
    3: 'Ada pengguna awal, pertumbuhan belum konsisten.',
    4: 'Pendapatan tumbuh beberapa bulan berturut-turut.',
    5: 'Pendapatan tumbuh tiap kuartal dengan retensi tinggi.',
  },
  bisnis: {
    1: 'Model bisnis dan kebutuhan dana tidak disebut.',
    2: 'Model pendapatan belum jelas.',
    3: 'Model pendapatan jelas, unit economics belum ada.',
    4: 'Unit economics positif di satu wilayah.',
    5: 'Unit economics positif dan rencana dana rinci.',
  },
}

export interface AisaSeedSummary {
  proposals: number
  jobs: number
  history: number
  dailyStats: number
}

export async function seedAisa(
  db: Firestore,
  now = new Date(),
): Promise<AisaSeedSummary> {
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * HOUR)
  const batch = db.batch()
  let historyCount = 0
  const history = (id: string, row: Record<string, unknown>) => {
    historyCount += 1
    batch.set(db.collection(HISTORY_COLLECTION).doc(id), row)
  }

  // --- rules + runtime ---
  const rulesChangedAt = new Date(now.getTime() - 15 * DAY)
  const rules = {
    version: 1,
    weights: WEIGHTS,
    anchors: {
      tim: ANCHOR,
      pasar: ANCHOR,
      produk: ANCHOR,
      traksi: ANCHOR,
      bisnis: ANCHOR,
    },
    fit: FIT,
    thresholds: THRESHOLDS,
    models: {
      penilai: MODEL,
      ringkasan: MODEL,
      insight: MODEL,
      asisten: MODEL,
    },
    minCharsPerPage: 200,
    retentionDays: 90,
    changedAt: rulesChangedAt,
    reason:
      'Aturan awal dari baseline (rata-rata Scorecard Method dan Hustle Fund)',
  }
  batch.set(db.collection(SETTINGS_COLLECTION).doc(RULES_DOC_ID), rules)
  batch.set(db.collection(RULES_VERSIONS_COLLECTION).doc('1'), rules)
  batch.set(db.collection(SETTINGS_COLLECTION).doc(RUNTIME_DOC_ID), {
    paused: false,
    pausedAt: at(30),
    pausedVia: 'wa',
  })
  history('seed-aturan-v1', {
    at: rulesChangedAt,
    via: 'dashboard',
    action: 'aturan_diubah',
    after: { version: 1 },
    reason: rules.reason,
    detail: 'Aturan penilaian versi 1 dibuat',
  })
  history('seed-stop', {
    at: at(31),
    via: 'wa',
    action: 'stop',
    detail: 'Pekerjaan AI dijeda',
  })
  history('seed-lanjut', {
    at: at(30),
    via: 'wa',
    action: 'lanjut',
    detail: 'Pekerjaan AI dilanjutkan',
  })

  // --- proposals + their penilaian jobs ---
  let jobCount = 0
  for (const seed of SEEDS) {
    const id =
      seed.source === 'form'
        ? `form-seed${seed.key}`
        : `upload-seed${seed.key.slice(0, 12)}`
    const createdAt = at(seed.hoursAgo)
    const pageCount = 10 + (seed.key.length % 8)
    const jobId = `job-penilaian-${seed.key}`
    const fileName = `${seed.name.replace(/\s+/g, '_')}_pitchdeck.pdf`
    const scored = seed.values !== null
    const tokensIn = scored ? 7000 + pageCount * 310 : 0
    const tokensOut = scored ? 1100 + seed.key.length * 23 : 0

    let assessment = null
    let fit = null
    let category: Category | null = null
    let outside = false
    if (seed.values) {
      const score = scoreOf(seed.values)
      fit = fitOf(seed)
      const result = categoryOf(score, fit.passed, seed.values)
      category = result.category
      outside = result.outside
      const values = seed.values
      assessment = {
        criteria: Object.fromEntries(
          CRITERIA.map((c) => [
            c,
            {
              value: values[c],
              reason: REASONS[c][values[c]],
              notMentioned: values[c] === 1,
              citationsUnverified: seed.unverified?.includes(c) ?? false,
              citations:
                values[c] === 1 || seed.unverified?.includes(c)
                  ? []
                  : [
                      {
                        page: 2 + CRITERIA.indexOf(c),
                        quote: `${seed.name}: ${REASONS[c][values[c]].toLowerCase()}`,
                      },
                    ],
            },
          ]),
        ),
        score,
        rulesVersion: 1,
        model: MODEL,
      }
    }
    const assessedAt = scored ? new Date(createdAt.getTime() + 95_000) : null
    const correction = seed.correction
      ? { ...seed.correction, at: at(seed.hoursAgo - 4), via: 'dashboard' }
      : null
    const response = seed.response
      ? {
          ...seed.response,
          at: at(seed.hoursAgo - 6),
          via: seed.response.kind === 'undang' ? 'wa' : 'dashboard',
        }
      : null
    const status = seed.queued
      ? 'antre'
      : seed.manualReason
        ? 'perlu_dicek_manual'
        : 'dinilai'

    batch.set(db.collection(PROPOSALS_COLLECTION).doc(id), {
      name: seed.name,
      nameLower: seed.name.toLowerCase(),
      source:
        seed.source === 'form'
          ? { kind: 'form', driveFileId: `drive-${seed.key}`, fileName }
          : { kind: 'upload', gcsPath: `decks/${id}.pdf`, fileName },
      founder: {
        name: `Pendiri ${seed.name}`,
        email: `founder@${seed.key}.example`,
      },
      consent: true,
      status,
      statusReason: seed.manualReason ?? null,
      pageCount,
      profile: scored
        ? {
            sector: seed.sector,
            stage: seed.stage,
            fundingAskIdr: seed.funding,
            oneLiner: seed.oneLiner,
          }
        : null,
      assessment,
      fit,
      category,
      qualityOutsideFocus: outside,
      correction,
      effectiveCategory: correction?.category ?? category,
      response,
      responded: response !== null,
      tokens: { in: tokensIn, out: tokensOut },
      jobId: seed.queued ? null : jobId,
      createdAt,
      updatedAt: response?.at ?? correction?.at ?? assessedAt ?? createdAt,
      assessedAt,
    })
    batch.set(db.collection(PROPOSAL_TEXTS_COLLECTION).doc(id), {
      pages: scored
        ? Array.from(
            { length: pageCount },
            (_, i) => `[hal. ${i + 1}] ${seed.name} — ${seed.oneLiner}`,
          )
        : [],
      charCount: scored ? pageCount * 120 : 34,
    })
    history(`seed-masuk-${seed.key}`, {
      at: createdAt,
      via: 'sistem',
      action: 'proposal_masuk',
      proposalId: id,
      proposalName: seed.name,
      detail: `${seed.name} masuk lewat ${seed.source === 'form' ? 'Form' : 'unggahan dashboard'}`,
    })
    if (correction)
      history(`seed-koreksi-${seed.key}`, {
        at: correction.at,
        via: correction.via,
        action: 'koreksi',
        proposalId: id,
        proposalName: seed.name,
        before: category,
        after: correction.category,
        reason: correction.reason,
        detail: `Kategori ${seed.name} dikoreksi`,
      })
    if (response)
      history(`seed-tanggapan-${seed.key}`, {
        at: response.at,
        via: response.via,
        action: 'tanggapan',
        proposalId: id,
        proposalName: seed.name,
        after: response.kind,
        reason: response.note ?? null,
        detail: `${seed.name}: ${response.kind}`,
      })

    if (seed.queued) continue
    jobCount += 1
    const t0 = createdAt.getTime() + 2_000
    // The steps and names `run_intake` (services/api/aisa/intake.py) records
    // for an uploaded or Form deck, so the dashboard reads the seed exactly as
    // it reads production.
    const steps = [
      code('Ekstrak teks per halaman', 'pypdf', 1800, {
        read: 'pitch deck',
        wrote: `proposalTexts/${id}`,
      }),
      code('Cek jumlah teks', 'kode', 4, { read: `proposalTexts/${id}` }),
      ...(scored
        ? [
            {
              action: 'Menilai 5 kriteria',
              tool: 'gemini.generate_content',
              actor: 'model',
              model: MODEL,
              read: `proposalTexts/${id}`,
              wrote: null,
              tokensIn,
              tokensOut,
              durationMs: 21_400,
              status: 'ok',
            },
            code('Hitung skor', 'kode', 3, { read: 'settings/rules v1' }),
            code('Cek kecocokan', 'kode', 2, { read: 'settings/rules v1' }),
            code('Tentukan kategori', 'kode', 1),
            code('Simpan hasil penilaian', 'firestore', 140, {
              wrote: `proposals/${id}`,
            }),
          ]
        : []),
    ]
    let elapsed = 0
    steps.forEach((step, index) => {
      batch.set(
        db
          .collection(JOBS_COLLECTION)
          .doc(jobId)
          .collection(JOB_STEPS_SUBCOLLECTION)
          .doc(String(index + 1).padStart(3, '0')),
        {
          seq: index + 1,
          // A step is recorded when it ends, so `at` is its end time.
          at: new Date(t0 + elapsed + step.durationMs),
          model: null,
          ...step,
        },
      )
      elapsed += step.durationMs
    })
    batch.set(db.collection(JOBS_COLLECTION).doc(jobId), {
      kind: 'penilaian',
      agent: 'Penilai',
      title: `Menilai proposal ${seed.name}`,
      model: scored ? MODEL : null,
      proposalId: id,
      status: 'selesai',
      startedAt: new Date(t0),
      endedAt: new Date(t0 + elapsed),
      durationMs: elapsed,
      stepCount: steps.length,
      tokensIn,
      tokensOut,
    })
  }

  // --- the latest digest and its ringkasan job ---
  const today = wibDate.format(now)
  const sentAt = new Date(`${today}T09:00:00+07:00`)
  const digestAt =
    sentAt.getTime() <= now.getTime()
      ? sentAt
      : new Date(sentAt.getTime() - DAY)
  const digestId = `seed-${wibDate.format(digestAt)}-0900`
  const digestJobId = `job-ringkasan-${digestId}`
  const digestInsight = 'proposal agritech naik dibanding minggu lalu.'
  const digestText = [
    'Selamat pagi, Bu Rina. Sejak kemarin pukul 17.00 masuk 6 proposal baru. Ada 11 proposal yang belum Ibu tanggapi.',
    '',
    '*Sangat cocok (1)*',
    '1. Tani Maju (agritech, Rp5 M) · 93. Pendapatannya tumbuh tiap kuartal dan timnya berpengalaman.',
    '*Cocok (3):* Dana UMKM (90), Klinik Desa (77), Pasar Ikan (dikoreksi)',
    '*Kurang cocok (2):* SawahKu, BelajarYuk',
    '*Tidak cocok (3)*',
    '*Berkualitas, di luar fokus (1):* Kopi Rakyat (83) · F&B di luar sektor fokus',
    '*Perlu dicek manual (2):* Bengkel Online, Rumah Belajar',
    '',
    `Yang menarik: ${digestInsight}`,
  ].join('\n')
  batch.set(db.collection(DIGESTS_COLLECTION).doc(digestId), {
    slot: '09.00',
    windowStart: new Date(digestAt.getTime() - 16 * HOUR),
    sentAt: digestAt,
    text: digestText,
    counts: {
      sangat_cocok: 1,
      cocok: 3,
      kurang_cocok: 2,
      tidak_cocok: 3,
      kualitasLuarFokus: 1,
      perluDicekManual: 2,
      belumDitanggapi: 11,
      baruMasuk: 6,
    },
    proposalIds: [],
    usedTemplate: false,
    insight: digestInsight,
    jobId: digestJobId,
    gowaMessageIds: ['seed-gowa-1'],
  })
  const digestSteps = [
    {
      action: 'Ambil proposal belum ditanggapi',
      tool: 'firestore.query',
      actor: 'kode',
      read: 'proposals (responded = false)',
      wrote: null,
      tokensIn: 0,
      tokensOut: 0,
      durationMs: 210,
      status: 'ok',
    },
    {
      action: 'Hitung kandidat insight',
      tool: 'compute_insights',
      actor: 'kode',
      read: 'dailyStats 14 hari',
      wrote: null,
      tokensIn: 0,
      tokensOut: 0,
      durationMs: 15,
      status: 'ok',
    },
    {
      action: 'Tulis insight',
      tool: 'insight.write',
      actor: 'model',
      model: MODEL,
      read: 'kandidat insight (angka)',
      wrote: '3 kalimat insight',
      tokensIn: 1200,
      tokensOut: 180,
      durationMs: 3100,
      status: 'ok',
    },
    {
      action: 'Susun teks ringkasan',
      tool: 'ringkasan.compose',
      actor: 'model',
      model: MODEL,
      read: 'data ringkasan per kategori',
      wrote: 'teks ringkasan',
      tokensIn: 2600,
      tokensOut: 540,
      durationMs: 5200,
      status: 'ok',
    },
    {
      action: 'Cek angka di teks',
      tool: 'verify_numbers',
      actor: 'kode',
      read: 'teks ringkasan + data',
      wrote: 'cocok',
      tokensIn: 0,
      tokensOut: 0,
      durationMs: 4,
      status: 'ok',
    },
    {
      action: 'Kirim WhatsApp',
      tool: 'gowa.send',
      actor: 'kode',
      read: null,
      wrote: `digests/${digestId}`,
      tokensIn: 0,
      tokensOut: 0,
      durationMs: 640,
      status: 'ok',
    },
  ]
  let elapsed = 0
  digestSteps.forEach((step, index) => {
    batch.set(
      db
        .collection(JOBS_COLLECTION)
        .doc(digestJobId)
        .collection(JOB_STEPS_SUBCOLLECTION)
        .doc(String(index + 1).padStart(3, '0')),
      {
        seq: index + 1,
        at: new Date(digestAt.getTime() - 9_000 + elapsed),
        model: null,
        ...step,
      },
    )
    elapsed += step.durationMs
  })
  batch.set(db.collection(JOBS_COLLECTION).doc(digestJobId), {
    kind: 'ringkasan',
    agent: 'Pembuat ringkasan',
    title: 'Ringkasan 09.00',
    model: MODEL,
    digestId,
    status: 'selesai',
    startedAt: new Date(digestAt.getTime() - 9_000),
    endedAt: new Date(digestAt.getTime() - 9_000 + elapsed),
    durationMs: elapsed,
    stepCount: digestSteps.length,
    tokensIn: 3800,
    tokensOut: 720,
  })
  jobCount += 1
  history(`seed-ringkasan-${digestId}`, {
    at: digestAt,
    via: 'sistem',
    action: 'ringkasan_terkirim',
    detail: 'Ringkasan 09.00 terkirim (11 belum ditanggapi)',
  })

  // --- a nightly retensi run that deleted one long-archived proposal ---
  // Code-only (no model, no tokens); its history row keeps the proposal id but
  // carries the scrubbed name, as `aisa-api` writes it after a deletion.
  const retensiAt = new Date(`${today}T02:00:00+07:00`)
  const retensiStart =
    retensiAt.getTime() <= now.getTime()
      ? retensiAt
      : new Date(retensiAt.getTime() - DAY)
  const retensiJobId = `job-retensi-${wibDate.format(retensiStart)}`
  batch.set(
    db
      .collection(JOBS_COLLECTION)
      .doc(retensiJobId)
      .collection(JOB_STEPS_SUBCOLLECTION)
      .doc('001'),
    {
      seq: 1,
      at: retensiStart,
      action: 'Hapus proposal diarsipkan lebih dari 90 hari',
      tool: 'firestore.delete',
      actor: 'kode',
      model: null,
      read: 'proposals (diarsipkan)',
      wrote: '1 proposal dihapus',
      tokensIn: 0,
      tokensOut: 0,
      durationMs: 310,
      status: 'ok',
    },
  )
  batch.set(db.collection(JOBS_COLLECTION).doc(retensiJobId), {
    kind: 'retensi',
    agent: 'Retensi',
    title: 'Retensi harian',
    model: null,
    status: 'selesai',
    startedAt: retensiStart,
    endedAt: new Date(retensiStart.getTime() + 310),
    durationMs: 310,
    stepCount: 1,
    tokensIn: 0,
    tokensOut: 0,
  })
  jobCount += 1
  history('seed-retensi-dihapus', {
    at: new Date(retensiStart.getTime() + 310),
    via: 'sistem',
    action: 'proposal_dihapus',
    proposalId: 'form-seedlamaarsip',
    proposalName: '(dihapus)',
    reason: 'retensi',
    detail: 'Data proposal dihapus (diarsipkan lebih dari 90 hari)',
  })

  // --- 14 days of dailyStats (deterministic, WIB dates) ---
  const sectors = [
    'agritech',
    'fintech',
    'healthtech',
    'edtech',
    'F&B',
    'fashion',
  ]
  for (let d = 13; d >= 0; d -= 1) {
    const date = wibDate.format(new Date(now.getTime() - d * DAY))
    const proposalsIn = 4 + ((d * 7 + 3) % 9) + (d < 5 ? 3 : 0)
    const manual = d % 4 === 0 ? 1 : 0
    const scored = proposalsIn - manual
    const sangat = Math.floor(scored * 0.1)
    const cocok = Math.floor(scored * 0.2)
    const kurang = Math.floor(scored * 0.35)
    const bySector: Record<string, number> = {}
    for (let i = 0; i < scored; i += 1) {
      const sector =
        sectors[(i * 3 + d) % (i % 3 === 0 ? 2 : sectors.length)] ?? 'lainnya'
      bySector[sector] = (bySector[sector] ?? 0) + 1
    }
    const penilaianIn = scored * 10_200
    const penilaianOut = scored * 1_350
    const ringkasanIn = 2 * 3_800
    const ringkasanOut = 2 * 720
    const asistenIn = (d % 3) * 4_100
    const asistenOut = (d % 3) * 650
    batch.set(db.collection(DAILY_STATS_COLLECTION).doc(date), {
      date,
      proposalsIn,
      byCategory: {
        sangat_cocok: sangat,
        cocok,
        kurang_cocok: kurang,
        tidak_cocok: scored - sangat - cocok - kurang,
      },
      bySector,
      perluDicekManual: manual,
      tokensIn: penilaianIn + ringkasanIn + asistenIn,
      tokensOut: penilaianOut + ringkasanOut + asistenOut,
      modelCalls: scored + 4 + (d % 3),
      tokensByKind: {
        penilaian: { in: penilaianIn, out: penilaianOut },
        ringkasan: { in: ringkasanIn, out: ringkasanOut },
        asisten: { in: asistenIn, out: asistenOut },
      },
    })
  }

  await batch.commit()
  return {
    proposals: SEEDS.length,
    jobs: jobCount,
    history: historyCount,
    dailyStats: 14,
  }
}
