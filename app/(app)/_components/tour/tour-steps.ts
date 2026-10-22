import { PIPELINE } from '../../proposal/_components/assessment-steps'

/**
 * The onboarding tour, in order: what each step points at, where it lives, and
 * what it says. The controller (`tour-controller.tsx`) shows them; the rules
 * for which step applies and what follows live in `tour-plan.ts`.
 *
 * A step points at an element by its `data-tour` attribute, never by a CSS
 * class, so restyling a page cannot silently detach the tour from it.
 */

export const TOUR_STEP_IDS = [
  'welcome',
  'dash-pending',
  'dash-top',
  'dash-trend',
  'intake-form',
  'intake-upload',
  'progress',
  'list-first',
  'list-empty',
  'detail-score',
  'detail-grade',
  'detail-action',
  'detail-criteria',
  'detail-log',
  'detail-decision',
  'assistant',
  'nav-aturan',
  'nav-tren',
  'nav-biaya',
  'whatsapp',
  'finish',
] as const

export type TourStepId = (typeof TOUR_STEP_IDS)[number]

/** Where a step is shown; `proposal-detail` is the tour's chosen proposal. */
export type TourRoute = '/dashboard' | '/proposal' | 'proposal-detail'

/**
 * What must hold for a step to apply at all:
 * - `upload`: the reader may upload (a read-only seat has no upload button);
 * - `uploaded`: the reader uploaded a deck during this tour;
 * - `browse`: the reader did not, so the tour picks a proposal from the list;
 * - `no-proposal`: the tour has no proposal to show (the list was empty);
 * - `proposal`: the tour has a proposal to show.
 */
export type TourNeed =
  | 'upload'
  | 'uploaded'
  | 'browse'
  | 'no-proposal'
  | 'proposal'

/**
 * What a step waits for before the tour moves on by itself:
 * - `upload`: clicking the target opens the upload dialog; the tour steps
 *   aside and resumes on the new proposal, or here again if it was cancelled;
 * - `assessment`: the assessment on screen settles;
 * - `assistant`: clicking the target opens Tanya AISA; the tour steps aside
 *   and continues once the panel is closed.
 */
export type TourWait = 'upload' | 'assessment' | 'assistant'

/**
 * When the target is absent or hidden: `skip` the step, show it `center`ed
 * without a target, or go to another step instead.
 */
export type TourMissing = 'skip' | 'center' | TourStepId

export interface TourStep {
  id: TourStepId
  /** Where to show it; none means wherever the reader is. */
  route?: TourRoute
  /** The `data-tour` value to point at; none means a centred popover. */
  target?: string
  missing: TourMissing
  /** A `data-tour` value whose presence means `target` will not render. */
  emptyTarget?: string
  title: string
  /** Paragraphs, plain text. */
  body: readonly string[]
  /** Replaces `body` for a read-only seat. */
  readOnlyBody?: readonly string[]
  needs?: TourNeed
  wait?: TourWait
  side?: 'top' | 'bottom' | 'left' | 'right'
}

/** The assessment steps every run goes through, named as the progress card names them. */
const ASSESSMENT_STEPS = PIPELINE.filter((step) => !step.optional)
  .map((step) => step.title)
  .join(', ')

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    route: '/dashboard',
    missing: 'center',
    title: 'Selamat datang di AISA',
    body: [
      'AISA membantu Anda menyaring proposal startup dengan AI. Setiap proposal dibaca, diberi skor 0–100, lalu masuk ke salah satu dari lima grade, dari Sangat layak sampai Tidak layak.',
      'Keputusannya tetap di tangan Anda: Setuju atau Tolak. Tur singkat ini menunjukkan alurnya dari awal. Tekan Esc untuk berhenti; tur bisa diulang dari menu akun → Panduan.',
    ],
  },
  {
    id: 'dash-pending',
    route: '/dashboard',
    target: 'dash-pending',
    missing: 'skip',
    title: 'Menunggu keputusan',
    body: [
      'Jumlah proposal yang belum Anda tanggapi. Klik kartunya untuk langsung membuka daftarnya.',
    ],
  },
  {
    id: 'dash-top',
    route: '/dashboard',
    target: 'dash-top',
    missing: 'skip',
    title: 'Paling layak untuk Anda',
    body: [
      'Proposal dengan grade terbaik yang belum ditanggapi; yang sesuai fokus investasi didahulukan. Mulai dari sini kalau waktu Anda sedikit.',
    ],
  },
  {
    id: 'dash-trend',
    route: '/dashboard',
    target: 'dash-trend',
    missing: 'skip',
    side: 'top',
    title: 'Tren proposal',
    body: [
      'Berapa proposal yang masuk tiap minggu dan bagaimana sebaran grade-nya.',
    ],
  },
  {
    id: 'intake-form',
    route: '/dashboard',
    target: 'nav:/pengaturan',
    missing: 'center',
    title: 'Dari mana proposal masuk?',
    body: [
      'Ada dua jalan. Pertama, founder mengisi Google Form tim Anda dan melampirkan PDF; proposalnya masuk dan dinilai otomatis, tanpa perlu Anda unggah. Alur Form ada di Pengaturan → Integrasi.',
      'Kedua, Anda mengunggah PDF sendiri. Itu langkah berikutnya.',
    ],
    readOnlyBody: [
      'Founder mengisi Google Form tim Anda dan melampirkan PDF; proposalnya masuk dan dinilai otomatis. Alur Form ada di Pengaturan → Integrasi.',
      'Manajer investasi juga bisa mengunggah PDF langsung. Akun Anda hanya bisa membaca, jadi tur lanjut ke proposal yang sudah ada.',
    ],
  },
  {
    id: 'intake-upload',
    route: '/dashboard',
    target: 'upload',
    missing: 'skip',
    needs: 'upload',
    wait: 'upload',
    title: 'Coba unggah proposal',
    body: [
      'Klik Unggah proposal, pilih berkas PDF, lalu kirim. Tur menunggu di sini dan ikut membuka proposal barunya.',
      'Tidak punya PDF sekarang? Pilih Lewati; tur memakai proposal yang sudah ada.',
    ],
  },
  {
    id: 'progress',
    route: 'proposal-detail',
    target: 'assessment-progress',
    missing: 'skip',
    needs: 'uploaded',
    wait: 'assessment',
    title: 'AISA sedang menilai',
    body: [
      `Kartu ini mengikuti penilaiannya langkah demi langkah: ${ASSESSMENT_STEPS}. Biasanya selesai dalam satu sampai dua menit.`,
      'Tur lanjut sendiri begitu hasilnya keluar. Mau lanjut sekarang? Pilih Lewati.',
    ],
  },
  {
    id: 'list-first',
    route: '/proposal',
    target: 'proposal-first',
    missing: 'list-empty',
    emptyTarget: 'proposal-empty',
    needs: 'browse',
    title: 'Daftar proposal',
    body: [
      'Semua proposal ada di sini, lengkap dengan grade dan skornya. Kita buka yang paling atas.',
    ],
  },
  {
    id: 'list-empty',
    route: '/proposal',
    missing: 'center',
    needs: 'no-proposal',
    title: 'Belum ada proposal untuk dibuka',
    body: [
      'Daftarnya masih kosong. Begitu ada proposal dari Form atau unggahan, halaman detailnya menampilkan grade, skor, nilai per kriteria beserta buktinya, dan tempat Anda memutuskan.',
    ],
  },
  {
    id: 'detail-score',
    route: 'proposal-detail',
    target: 'score',
    missing: 'skip',
    needs: 'proposal',
    side: 'left',
    title: 'Skor kualitas',
    body: [
      'Skor 0–100 dihitung dari nilai tiap kriteria dikali bobotnya. Proposal yang tidak bisa dibaca AI ditandai perlu dicek manual, tanpa skor.',
    ],
  },
  {
    id: 'detail-grade',
    route: 'proposal-detail',
    target: 'grade',
    missing: 'skip',
    needs: 'proposal',
    title: 'Grade',
    body: [
      'Grade ditentukan dari skor saja, dengan batas yang sama untuk semua proposal. Garis di bawahnya menunjukkan posisi skor di antara kelima grade.',
    ],
  },
  {
    id: 'detail-action',
    route: 'proposal-detail',
    target: 'grade-action',
    missing: 'skip',
    needs: 'proposal',
    title: 'Aksi yang disarankan',
    body: [
      'Langkah yang disarankan untuk grade ini, beserta kriteria yang paling menaikkan atau menahan skornya.',
    ],
  },
  {
    id: 'detail-criteria',
    route: 'proposal-detail',
    target: 'criterion',
    missing: 'skip',
    needs: 'proposal',
    title: 'Nilai per kriteria',
    body: [
      'Lima kriteria A–E, masing-masing bernilai 1–5. Kutipan dari proposal dan tanda Hal. menunjukkan halaman buktinya; klik untuk membuka halaman itu.',
      'Bagian "Mengapa N/5?" menjelaskan alasan nilainya dan apa yang dibutuhkan untuk naik satu tingkat.',
    ],
  },
  {
    id: 'detail-log',
    route: 'proposal-detail',
    target: 'log',
    missing: 'skip',
    needs: 'proposal',
    title: 'Log penilaian',
    body: [
      'Semua langkah penilaian tercatat di sini, langkah demi langkah: mana yang dikerjakan sistem dan mana yang dikerjakan AI.',
    ],
  },
  {
    id: 'detail-decision',
    route: 'proposal-detail',
    target: 'decision',
    missing: 'skip',
    needs: 'proposal',
    title: 'Keputusan Anda',
    body: [
      'Setelah meninjau, pilih Setuju atau Tolak, dengan catatan bila perlu. AI hanya memberi saran; keputusan akhir ada pada Anda.',
    ],
    readOnlyBody: [
      'Di sini terlihat keputusan untuk proposal ini. Akun Anda hanya bisa membaca; Setuju atau Tolak diberikan manajer investasi.',
    ],
  },
  {
    id: 'assistant',
    target: 'assistant',
    missing: 'skip',
    wait: 'assistant',
    side: 'left',
    title: 'Tanya AISA',
    body: [
      'Punya pertanyaan tentang proposal, skor, atau tren? Klik tombol ini dan tanyakan dalam bahasa sehari-hari, misalnya "Kenapa proposal ini dapat grade ini?".',
      'Tur lanjut setelah panelnya Anda tutup, atau pilih Lanjut.',
    ],
  },
  {
    id: 'nav-aturan',
    route: '/dashboard',
    target: 'nav:/aturan',
    missing: 'center',
    title: 'Aturan penilaian',
    body: [
      'Bobot tiap kriteria dan patokan nilai 1–5 (rubrik) yang dipakai AI saat menilai ada di sini.',
    ],
  },
  {
    id: 'nav-tren',
    route: '/dashboard',
    target: 'nav:/tren',
    missing: 'center',
    title: 'Tren',
    body: [
      'Perkembangan proposal yang masuk dan hasil penilaiannya dari hari ke hari.',
    ],
  },
  {
    id: 'nav-biaya',
    route: '/dashboard',
    target: 'nav:/biaya',
    missing: 'center',
    title: 'Biaya AI',
    body: [
      'Berapa biaya AI untuk menilai proposal, dan berapa yang dihemat dibanding cek manual.',
    ],
  },
  {
    id: 'whatsapp',
    route: '/dashboard',
    target: 'whatsapp',
    missing: 'center',
    title: 'AISA juga ada di WhatsApp',
    body: [
      'Ringkasan proposal dikirim terjadwal ke WhatsApp nomor yang terdaftar. Dari sana Anda juga bisa bertanya ke AISA atau memberi keputusan.',
    ],
  },
  {
    id: 'finish',
    route: '/dashboard',
    missing: 'center',
    title: 'Selesai, selamat menyaring!',
    body: [
      'Itu seluruh alurnya. Tur ini bisa diulang kapan saja dari menu akun di kanan atas → Panduan.',
    ],
  },
]
