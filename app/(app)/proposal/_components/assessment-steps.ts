import type { Step } from '@/features/aisa/aisa.schema'

// The Penilai's steps in the order `run_intake` (services/api/aisa/intake.py)
// runs them, each with the words a manager reads instead of the raw action.
// Both the live progress card and the Log penilaian read from this one list, so
// a step is explained the same way while it runs and after it finished.
//
// A step is recognised by its recorded `action`: the code steps share the tool
// "kode", so the tool alone cannot tell "Hitung skor" from "Cek kecocokan".

export type StepKey =
  | 'ambil'
  | 'ekstrak'
  | 'cek_teks'
  | 'baca_gambar'
  | 'nilai'
  | 'skor'
  | 'cocok'
  | 'kategori'
  | 'simpan'
  | 'stop'

export interface StepInfo {
  key: StepKey
  /** The `action` the API records, without a retry's " (ulang)". */
  action: string
  /** Plain-language name, in the present tense of the work. */
  title: string
  /** One sentence: what happens in this step and why it matters. */
  explain: string
  by: 'ai' | 'sistem'
  /** Only runs on some assessments, so it is not listed before it starts. */
  optional?: boolean
  /** How long it usually takes, for the step that dominates the wait. */
  typical?: string
}

export const RETRY_SUFFIX = ' (ulang)'

export const PIPELINE: readonly StepInfo[] = [
  {
    key: 'ambil',
    action: 'Ambil pitch deck',
    title: 'Mengambil proposal',
    explain: 'Sistem mengambil berkas PDF dari penyimpanan.',
    by: 'sistem',
    optional: true,
  },
  {
    key: 'ekstrak',
    action: 'Ekstrak teks per halaman',
    title: 'Membaca teks tiap halaman',
    explain:
      'Sistem menyalin teks dari setiap halaman PDF, supaya AI bisa menunjuk halaman tempat buktinya.',
    by: 'sistem',
  },
  {
    key: 'cek_teks',
    action: 'Cek jumlah teks',
    title: 'Memeriksa proposal bisa dibaca',
    explain:
      'Proposal yang hampir tanpa teks (mis. hasil pindai) dibaca AI sebagai gambar dulu; bila tetap tidak terbaca, ditandai perlu dicek manual.',
    by: 'sistem',
  },
  {
    key: 'baca_gambar',
    action: 'Baca teks dari gambar',
    title: 'AI membaca proposal sebagai gambar',
    explain:
      'Proposal tampaknya hasil pindai atau gambar, jadi AI menyalin teks yang terlihat di tiap halaman, termasuk angka di grafik, sebelum dinilai.',
    by: 'ai',
    optional: true,
  },
  {
    key: 'nilai',
    action: 'Menilai 5 kriteria',
    title: 'AI menilai 5 kriteria',
    explain:
      'AI membaca isi proposal dan memberi nilai 1–5 untuk tiap kriteria beserta kutipan halaman sebagai bukti.',
    by: 'ai',
    typical: 'biasanya 15–25 detik',
  },
  {
    key: 'skor',
    action: 'Hitung skor',
    title: 'Menghitung skor',
    explain:
      'Sistem menjumlahkan nilai × bobot dari aturan penilaian. AI tidak ikut menghitung.',
    by: 'sistem',
  },
  {
    key: 'cocok',
    action: 'Cek kecocokan',
    title: 'Mencocokkan dengan fokus investasi',
    explain:
      'Sektor, tahap, dan besar dana dari proposal dibandingkan dengan fokus di aturan penilaian.',
    by: 'sistem',
  },
  {
    key: 'kategori',
    action: 'Tentukan kategori',
    title: 'Menentukan kategori',
    explain:
      'Kategori dipilih dari skor dan hasil cek fokus, dengan ambang yang sama untuk semua proposal.',
    by: 'sistem',
  },
  {
    key: 'simpan',
    action: 'Simpan hasil penilaian',
    title: 'Menyimpan hasil',
    explain:
      'Skor, kategori, dan kutipan disimpan, lalu proposal siap ditinjau.',
    by: 'sistem',
  },
]

const STOP: StepInfo = {
  key: 'stop',
  action: 'Dihentikan oleh STOP',
  title: 'Dihentikan oleh STOP',
  explain:
    'STOP aktif, jadi penilaian berhenti di sini. Proposal dinilai ulang dari awal setelah LANJUT.',
  by: 'sistem',
}

const RETRY_EXPLAIN =
  'Jawaban AI sebelumnya tidak lolos pemeriksaan, jadi AI diminta menilai sekali lagi.'

export interface StepDescription extends Omit<StepInfo, 'key'> {
  /** Null for an action this build does not know: it is shown as recorded. */
  key: StepKey | null
  retry: boolean
}

/** The words for one recorded or running step. */
export function describeStep(
  step: Pick<Step, 'action' | 'actor'>,
): StepDescription {
  const retry = step.action.endsWith(RETRY_SUFFIX)
  const action = retry
    ? step.action.slice(0, -RETRY_SUFFIX.length)
    : step.action
  const info = [...PIPELINE, STOP].find((entry) => entry.action === action)
  if (!info)
    return {
      key: null,
      action: step.action,
      title: step.action,
      explain: '',
      by: step.actor === 'model' ? 'ai' : 'sistem',
      retry,
    }
  return retry
    ? {
        ...info,
        title: `${info.title} (ulang)`,
        explain: RETRY_EXPLAIN,
        retry,
      }
    : { ...info, retry }
}
