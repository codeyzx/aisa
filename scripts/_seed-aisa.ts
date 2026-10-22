/**
 * Realistic FAKE AISA data for local driving and tests, shaped per
 * docs/reference/contracts/aisa-firestore.md: proposals in every grade, a
 * "perlu dicek manual" pair, three "di luar fokus" ones, a queued
 * upload, penilaian + ringkasan jobs with steps, history, 14 days of
 * dailyStats, the latest daily digest and a weekly one, and `settings/rules`
 * v1 with the guide's weights.
 *
 * Scores and grades are COMPUTED here with the overview's formula
 * (`skor = Σ bobot × (nilai − 1) / 4`, grade bands 85/75/65/50) rather than typed
 * in, so the seed cannot contradict the rules it ships with. History also keeps
 * rows from before the grade scale changed (old kategori values and a
 * `dinilai_ulang` row) and decisions of the earlier Undang/Pantau/Arsipkan
 * scale with the system rows that moved them onto Setuju/Tolak, so the
 * dashboard's legacy rendering is exercised.
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
const CRITERIA = [
  'manajemen',
  'kinerja',
  'risiko',
  'rencana',
  'dampak',
] as const
type Criterion = (typeof CRITERIA)[number]
type Category =
  | 'sangat_layak'
  | 'layak_bersyarat'
  | 'perlu_penyesuaian'
  | 'risiko_tinggi'
  | 'tidak_layak'

const capitalize = (word: string) =>
  word.charAt(0).toUpperCase() + word.slice(1)
/** The reason `aisa migrate-responses` writes on every row it moves. */
const RESPONSE_MIGRATION_REASON = 'Skala tanggapan baru: Setuju / Tolak'

const GRADE_LABEL: Record<Category, string> = {
  sangat_layak: 'Sangat layak',
  layak_bersyarat: 'Layak bersyarat',
  perlu_penyesuaian: 'Perlu penyesuaian',
  risiko_tinggi: 'Risiko tinggi',
  tidak_layak: 'Tidak layak',
}

const WEIGHTS: Record<Criterion, number> = {
  manajemen: 0.25,
  kinerja: 0.2,
  risiko: 0.2,
  rencana: 0.25,
  dampak: 0.1,
}
const THRESHOLDS = {
  sangatLayak: 85,
  layakBersyarat: 75,
  perluPenyesuaian: 65,
  risikoTinggi: 50,
}
// Same values as `default_rules()` in services/api/aisa/models.py, so a seeded
// emulator and a freshly provisioned project score the same way.
const FIT = {
  sectors: ['agritech', 'fintech', 'edtech', 'healthtech', 'climate'],
  stages: ['pre-seed', 'seed', 'seri-a'],
  fundingMinIdr: 1_000_000_000,
  fundingMaxIdr: 20_000_000_000,
}
// Same text as `DEFAULT_ANCHORS` in services/api/aisa/models.py.
const ANCHORS: Record<
  Criterion,
  Record<'1' | '2' | '3' | '4' | '5', string>
> = {
  manajemen: {
    '1': 'Tim tidak dikenalkan, atau hanya disebut tanpa latar belakang',
    '2': "Tim hanya digambarkan dengan klaim umum (mis. 'berpengalaman', 'tim solid') tanpa peran atau latar belakang yang jelas",
    '3': 'Tim disebut dengan peran dan pengalaman umum, tanpa rekam jejak yang bisa dicek',
    '4': 'Rekam jejak yang bisa dicek (tempat kerja atau jabatan sebelumnya disebut), tetapi belum lengkap: tanpa capaian berangka (mis. lama pengalaman, pendanaan yang pernah diraih) atau ada peran kunci yang belum terisi',
    '5': 'Rekam jejak spesifik dan relevan (tempat kerja, jabatan, capaian berangka) dan peran kunci lengkap',
  },
  kinerja: {
    '1': 'Belum ada bukti bisnis berjalan, atau angkanya saling bertentangan',
    '2': "Traksi hanya diklaim secara umum (mis. 'banyak pengguna', 'tumbuh pesat') tanpa angka",
    '3': 'Ada pengguna atau pendapatan awal, tetapi angkanya tanpa periode atau tanpa nama pelanggan',
    '4': 'Angka pendapatan atau pengguna berperiode dan pelanggan atau mitra disebut namanya, tetapi pertumbuhan belum ditunjukkan atau baru satu-dua angka',
    '5': 'Pendapatan, pengguna, dan pertumbuhan berperiode, dengan pelanggan atau mitra yang disebut namanya',
  },
  risiko: {
    '1': 'Ada risiko besar yang tidak dibahas, informasinya bertentangan, atau risiko tidak dibahas sama sekali',
    '2': "Risiko dan tren pasar hanya disinggung secara umum (mis. 'persaingan ketat', 'pasar besar') tanpa mitigasi",
    '3': 'Sebagian risiko disebut, tetapi mitigasinya umum atau tren pasar tidak didukung data',
    '4': 'Risiko utama disebut dengan mitigasi yang konkret dan tren pasar didukung data, tetapi belum lengkap: ada risiko utama yang belum dibahas, atau datanya tanpa sumber atau periode',
    '5': 'Risiko utama (persaingan, regulasi, ketergantungan) disebut beserta mitigasinya, dan tren makro/pasar yang mendukung dibuktikan data bersumber',
  },
  rencana: {
    '1': 'Tidak ada rencana penggunaan dana atau proyeksi keuangan',
    '2': "Rencana hanya klaim umum (mis. 'dana untuk ekspansi') tanpa rincian atau angka",
    '3': 'Ada rencana penggunaan dana atau proyeksi, tetapi tanpa dasar data atau unit ekonomi',
    '4': 'Penggunaan dana dirinci dan proyeksi berpijak pada data aktual, tetapi unit ekonomi atau potensi imbal hasil bagi investor belum dijelaskan',
    '5': 'Penggunaan dana rinci, proyeksi berdasar data aktual, unit ekonomi, dan potensi imbal hasil bagi investor dijelaskan',
  },
  dampak: {
    '1': 'Dampak sosial atau lingkungan tidak disebut',
    '2': "Dampak hanya diklaim secara umum (mis. 'berdampak sosial') tanpa siapa atau apa yang terdampak",
    '3': "Dampak disebut tetapi belum diukur (mis. 'membantu petani')",
    '4': 'Ada angka dampak aktual (mis. jumlah penerima manfaat), tetapi cara mengukurnya belum dijelaskan atau angkanya tanpa sumber atau periode',
    '5': 'Dampak terukur dengan angka (mis. lapangan kerja, inklusi, emisi) dan cara mengukurnya',
  },
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

const wibDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const wibWeekday = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Jakarta',
  weekday: 'short',
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
  response?: { kind: 'setuju' | 'tolak'; note?: string }
  /**
   * The earlier-scale word the manager originally answered with; its history
   * row keeps that word, and a system row records the move to `response.kind`.
   */
  legacyResponse?: 'undang' | 'arsipkan'
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
    values: { manajemen: 5, kinerja: 5, risiko: 4, rencana: 5, dampak: 4 },
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
    values: { manajemen: 5, kinerja: 4, risiko: 4, rencana: 4, dampak: 4 },
    hoursAgo: 30,
    source: 'form',
    response: { kind: 'setuju', note: 'Jadwalkan pitching minggu depan' },
    legacyResponse: 'undang',
    correction: {
      category: 'perlu_penyesuaian',
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
    values: { manajemen: 4, kinerja: 4, risiko: 4, rencana: 3, dampak: 3 },
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
    values: { manajemen: 4, kinerja: 5, risiko: 4, rencana: 4, dampak: 3 },
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
    values: { manajemen: 5, kinerja: 5, risiko: 5, rencana: 5, dampak: 1 },
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
    values: { manajemen: 3, kinerja: 4, risiko: 3, rencana: 3, dampak: 3 },
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
    values: { manajemen: 3, kinerja: 3, risiko: 3, rencana: 3, dampak: 3 },
    hoursAgo: 50,
    source: 'form',
    correction: {
      category: 'perlu_penyesuaian',
      reason: 'Penjualan di Muncar lebih kuat dari yang terbaca di proposal',
    },
  },
  {
    key: 'aplikasix',
    name: 'AplikasiX',
    sector: 'fintech',
    stage: 'seed',
    funding: 2_500_000_000,
    oneLiner: 'Aplikasi dompet digital umum.',
    values: { manajemen: 2, kinerja: 2, risiko: 2, rencana: 1, dampak: 2 },
    hoursAgo: 70,
    source: 'form',
    response: { kind: 'tolak' },
  },
  {
    key: 'kopirakyat',
    name: 'Kopi Rakyat',
    sector: 'F&B',
    stage: 'seed',
    funding: 3_000_000_000,
    oneLiner: 'Jaringan kedai kopi susu di kota tier-2.',
    values: { manajemen: 5, kinerja: 4, risiko: 4, rencana: 5, dampak: 3 },
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
    values: { manajemen: 2, kinerja: 3, risiko: 2, rencana: 3, dampak: 2 },
    unverified: ['risiko'],
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
    values: { manajemen: 3, kinerja: 4, risiko: 3, rencana: 1, dampak: 1 },
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

/** The grade from the score alone, as `categorize` in services/api/aisa/scoring.py. */
function categoryOf(score: number): Category {
  if (score >= THRESHOLDS.sangatLayak) return 'sangat_layak'
  if (score >= THRESHOLDS.layakBersyarat) return 'layak_bersyarat'
  if (score >= THRESHOLDS.perluPenyesuaian) return 'perlu_penyesuaian'
  if (score >= THRESHOLDS.risikoTinggi) return 'risiko_tinggi'
  return 'tidak_layak'
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
  manajemen: {
    1: 'Proposal tidak menyebut susunan tim.',
    2: 'Tim baru, belum ada rekam jejak di bidang ini.',
    3: 'Pendiri punya pengalaman sebagian di industri.',
    4: 'Tim inti berpengalaman dan lengkap.',
    5: 'Pendiri pernah membangun dan keluar dari startup serupa.',
  },
  kinerja: {
    1: 'Tidak ada data pengguna atau pendapatan.',
    2: 'Baru uji coba kecil.',
    3: 'Ada pengguna awal, pertumbuhan belum konsisten.',
    4: 'Pendapatan tumbuh beberapa bulan berturut-turut.',
    5: 'Pendapatan tumbuh tiap kuartal dengan pelanggan yang disebut namanya.',
  },
  risiko: {
    1: 'Risiko utama tidak dibahas sama sekali.',
    2: 'Pesaing banyak dan bergantung pada satu pemasok.',
    3: 'Risiko disebut, mitigasinya belum jelas.',
    4: 'Risiko utama terkendali dan tren pasar mendukung.',
    5: 'Risiko rendah dengan regulasi dan tren makro yang mendukung.',
  },
  rencana: {
    1: 'Rencana bisnis dan kebutuhan dana tidak disebut.',
    2: 'Penggunaan dana belum jelas.',
    3: 'Rencana dana jelas, proyeksi belum berdasar data.',
    4: 'Unit ekonomi positif di satu wilayah.',
    5: 'Unit ekonomi positif dan proyeksi imbal hasil rinci.',
  },
  dampak: {
    1: 'Dampak sosial atau lingkungan tidak disebut.',
    2: 'Dampak disebut tanpa angka.',
    3: 'Dampak terukur untuk sebagian kecil pengguna.',
    4: 'Membuka lapangan kerja lokal dengan angka yang jelas.',
    5: 'Dampak inklusi dan lingkungan terukur dan dilaporkan rutin.',
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
    anchors: ANCHORS,
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
    reason: 'Skala penilaian baru: 5 kriteria (A–E) dan 5 grade',
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
    if (seed.values) {
      const score = scoreOf(seed.values)
      fit = fitOf(seed)
      category = categoryOf(score)
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
          via: seed.response.kind === 'setuju' ? 'wa' : 'dashboard',
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
        detail: `Grade ${seed.name} dipindahkan ke ${GRADE_LABEL[correction.category]}`,
      })
    if (response) {
      const answered = seed.legacyResponse ?? response.kind
      history(`seed-tanggapan-${seed.key}`, {
        at: response.at,
        via: response.via,
        action: 'tanggapan',
        proposalId: id,
        proposalName: seed.name,
        after: answered,
        reason: response.note ?? null,
        detail: `${capitalize(answered)} ${seed.name}`,
      })
      if (seed.legacyResponse)
        history(`seed-migrasi-tanggapan-${seed.key}`, {
          at: at(2),
          via: 'sistem',
          action: 'tanggapan',
          proposalId: id,
          proposalName: seed.name,
          before: seed.legacyResponse,
          after: response.kind,
          reason: RESPONSE_MIGRATION_REASON,
          detail: `Tanggapan ${seed.name} dipindah ke skala baru: ${capitalize(seed.legacyResponse)} → ${capitalize(response.kind)}`,
        })
    }

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
            code('Tentukan grade', 'kode', 1),
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
    '*Sangat layak (3)*',
    '1. Tani Maju (agritech, Rp5 M) · 92,5. Pendapatannya tumbuh tiap kuartal dan timnya berpengalaman.',
    '2. Dana UMKM (fintech, Rp6 M) · 90. Pendiri pernah membangun dan keluar dari startup serupa.',
    '3. Kopi Rakyat (F&B, Rp3 M) · 85 (di luar fokus). Tim inti berpengalaman dan lengkap.',
    '*Layak bersyarat (1)*: Klinik Desa (77,5)',
    '*Perlu penyesuaian (2)*: SawahKu (66,3), Pasar Ikan (50)',
    '*Risiko tinggi (1)*',
    '*Tidak layak (2)*',
    '3 di antaranya di luar fokus (sektor, tahap, atau dana): prioritas rendah.',
    '*Perlu dicek manual (2)*: Bengkel Online, Rumah Belajar',
    '',
    `Yang menarik: ${digestInsight}`,
  ].join('\n')
  batch.set(db.collection(DIGESTS_COLLECTION).doc(digestId), {
    slot: '09.00',
    windowStart: new Date(digestAt.getTime() - 16 * HOUR),
    sentAt: digestAt,
    text: digestText,
    counts: {
      sangat_layak: 3,
      layak_bersyarat: 1,
      perlu_penyesuaian: 2,
      risiko_tinggi: 1,
      tidak_layak: 2,
      luarFokus: 3,
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
  // A ringkasan sent before the grade scale changed: its text and count keys
  // stay on the old four-step scale, as production keeps them.
  const legacyDigestAt = new Date(digestAt.getTime() - 16 * HOUR)
  batch.set(
    db
      .collection(DIGESTS_COLLECTION)
      .doc(`seed-${wibDate.format(legacyDigestAt)}-1700`),
    {
      slot: '17.00',
      windowStart: new Date(legacyDigestAt.getTime() - 8 * HOUR),
      sentAt: legacyDigestAt,
      text: [
        'Selamat sore, Bu Rina. Sejak pukul 09.00 masuk 2 proposal baru. Ada 7 proposal yang belum Ibu tanggapi.',
        '',
        '*Sangat cocok (1)*',
        '1. Dana UMKM (fintech, Rp6 M) · 90.',
        '*Cocok (2):* Klinik Desa (77), SawahKu (71)',
        '*Kurang cocok (1):* BelajarYuk',
        '*Tidak cocok (2)*',
        '*Berkualitas, di luar fokus (1):* Kopi Rakyat (83)',
      ].join('\n'),
      counts: {
        sangat_cocok: 1,
        cocok: 2,
        kurang_cocok: 1,
        tidak_cocok: 2,
        kualitasLuarFokus: 1,
        perluDicekManual: 1,
        belumDitanggapi: 7,
        baruMasuk: 2,
      },
      proposalIds: [],
      usedTemplate: true,
      insight: null,
      jobId: null,
      gowaMessageIds: ['seed-gowa-0'],
    },
  )
  // The weekly summary (17.00, Fridays): the latest Friday at least a day
  // before the legacy 17.00 ringkasan above, so their one-per-slot-per-day ids
  // never collide.
  let weeklyAt = new Date(
    `${wibDate.format(new Date(legacyDigestAt.getTime() - DAY))}T17:00:00+07:00`,
  )
  while (wibWeekday.format(weeklyAt) !== 'Fri')
    weeklyAt = new Date(weeklyAt.getTime() - DAY)
  const weeklyStart = new Date(
    `${wibDate.format(new Date(weeklyAt.getTime() - 4 * DAY))}T00:00:00+07:00`,
  )
  const weeklyId = `seed-${wibDate.format(weeklyAt)}-1700`
  batch.set(db.collection(DIGESTS_COLLECTION).doc(weeklyId), {
    slot: '17.00',
    period: 'mingguan',
    windowStart: weeklyStart,
    sentAt: weeklyAt,
    text: [
      'Selamat sore, Bu Rina. Ini ringkasan mingguan AISA.',
      '',
      '*Proposal masuk*: 10 (minggu lalu 7, naik 3)',
      '*Sektor*: Agritech 40% (4 dari 10) · Fintech 30% (3 dari 10) · F&B 20% (2 dari 10) · tanpa sektor 1',
      '*Grade* (8 dinilai): Sangat layak 2 · Layak bersyarat 1 · Perlu penyesuaian 2 · Risiko tinggi 2 · Tidak layak 1',
      'Sangat layak + Layak bersyarat: 3 · di luar fokus: 25% (2 dari 8)',
      '*Rata-rata skor*: 68,4 (minggu lalu 65,1, naik 3,3)',
      '*Keputusan minggu ini*: Setuju 2 · Tolak 1',
      'Menunggu keputusan: 9 (terlama 6 hari)',
      '*Top 3 minggu ini*',
      '1. Dana UMKM · Sangat layak · 90',
      '2. Kopi Rakyat · Sangat layak · 85 (di luar fokus)',
      '3. Klinik Desa · Layak bersyarat · 77,5',
      '*Perlu dicek manual*: 1',
      '',
      'Yang menarik: minggu ini paling banyak Agritech: 40% (4 dari 10 proposal).',
    ].join('\n'),
    counts: {
      sangat_layak: 2,
      layak_bersyarat: 1,
      perlu_penyesuaian: 2,
      risiko_tinggi: 1,
      tidak_layak: 2,
      luarFokus: 2,
      perluDicekManual: 1,
      belumDitanggapi: 9,
      baruMasuk: 10,
    },
    proposalIds: [],
    usedTemplate: false,
    insight: 'minggu ini paling banyak Agritech: 40% (4 dari 10 proposal).',
    jobId: null,
    gowaMessageIds: ['seed-gowa-mingguan'],
    week: {
      start: wibDate.format(weeklyStart),
      end: wibDate.format(weeklyAt),
    },
    weekly: {
      proposalsIn: 10,
      proposalsInLastWeek: 7,
      topSectors: [
        { sector: 'agritech', label: 'Agritech', count: 4, percent: 40 },
        { sector: 'fintech', label: 'Fintech', count: 3, percent: 30 },
        { sector: 'f&b', label: 'F&B', count: 2, percent: 20 },
      ],
      noSector: 1,
      assessed: 8,
      byCategory: {
        sangat_layak: 2,
        layak_bersyarat: 1,
        perlu_penyesuaian: 2,
        risiko_tinggi: 2,
        tidak_layak: 1,
      },
      good: 3,
      outOfFocus: 2,
      outOfFocusPercent: 25,
      avgScore: 68.4,
      avgScoreLastWeek: 65.1,
      setuju: 2,
      tolak: 1,
      waiting: 9,
      oldestWaitingDays: 6,
      perluDicekManual: 1,
    },
  })
  history(`seed-ringkasan-${weeklyId}`, {
    at: new Date(weeklyAt.getTime() + 1_000),
    via: 'sistem',
    action: 'ringkasan_terkirim',
    detail:
      'Ringkasan mingguan terkirim (10 masuk minggu ini, 9 menunggu keputusan)',
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
      read: 'data ringkasan per grade',
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
      wrote: 'sesuai',
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
      action: 'Hapus proposal ditolak lebih dari 90 hari',
      tool: 'firestore.delete',
      actor: 'kode',
      model: null,
      read: 'proposals (ditolak)',
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
    detail: 'Data proposal dihapus (ditolak lebih dari 90 hari)',
  })

  // --- history from before the grade scale changed ---
  // A koreksi on the old four-step scale, and the migration's re-grade row:
  // both keep the old kategori values as written, so Riwayat must show them
  // as "(skala lama)" rather than fail or pass them off as a current grade.
  history('seed-koreksi-lama-klinikdesa', {
    at: at(240),
    via: 'wa',
    action: 'koreksi',
    proposalId: 'upload-seedklinikdesa',
    proposalName: 'Klinik Desa',
    before: 'cocok',
    after: 'sangat_cocok',
    reason: 'Sudah dipakai di tiga kabupaten',
    detail: 'Kategori Klinik Desa dikoreksi',
  })
  history('seed-dinilai-ulang-tanimaju', {
    at: at(4.5),
    via: 'sistem',
    action: 'dinilai_ulang',
    proposalId: 'form-seedtanimaju',
    proposalName: 'Tani Maju',
    before: 'sangat_cocok',
    after: 'sangat_layak',
    reason: 'Skala penilaian baru: 5 kriteria (A–E) dan 5 grade',
    detail:
      'Tani Maju dinilai ulang dengan skala baru: skor 92,5, Sangat layak',
  })

  // A Pantau answered on the earlier scale, and the system row that cleared it:
  // SawahKu is back to waiting for a decision, as the migration leaves it.
  history('seed-tanggapan-lama-sawahku', {
    at: at(6),
    via: 'dashboard',
    action: 'tanggapan',
    proposalId: 'form-seedsawahku',
    proposalName: 'SawahKu',
    after: 'pantau',
    reason: null,
    detail: 'Pantau SawahKu',
  })
  history('seed-migrasi-tanggapan-sawahku', {
    at: at(2),
    via: 'sistem',
    action: 'tanggapan',
    proposalId: 'form-seedsawahku',
    proposalName: 'SawahKu',
    before: 'pantau',
    after: null,
    reason: RESPONSE_MIGRATION_REASON,
    detail:
      'Tanggapan Pantau untuk SawahKu dikosongkan; proposal kembali menunggu keputusan',
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
    const bersyarat = Math.floor(scored * 0.15)
    const penyesuaian = Math.floor(scored * 0.25)
    const risiko = Math.floor(scored * 0.25)
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
        sangat_layak: sangat,
        layak_bersyarat: bersyarat,
        perlu_penyesuaian: penyesuaian,
        risiko_tinggi: risiko,
        tidak_layak: scored - sangat - bersyarat - penyesuaian - risiko,
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
