// What AISA's model calls cost, priced from Google's published list prices.
// Pure and client-safe: the Biaya page's server render and its calculator both
// read these numbers, so the two cannot quote different tariffs.
//
// Every figure here is an ESTIMATE from token counts and a list price, not an
// invoice amount: the project's billing account is not visible to the app.

/** USD per one million tokens, Vertex AI Standard tier. */
export interface TokenRates {
  input: number
  cachedInput: number
  /** Response and reasoning ("thinking") tokens are both billed as output. */
  output: number
}

export interface PricePeriod {
  /**
   * First WIB usage date this tariff applies to (`YYYY-MM-DD`), inclusive;
   * `null` when the source names no start (the model's first tariff).
   */
  from: string | null
  /** Last WIB usage date, inclusive; `null` while it has no announced end. */
  until: string | null
  label: string
  /** The same period in a few words, for a switch button. */
  shortLabel: string
  rates: TokenRates
  /** How the source says the tariff reaches the invoice, when it says so. */
  invoiceNote?: string
}

export const PRICING_SOURCE = {
  url: 'https://cloud.google.com/vertex-ai/generative-ai/pricing',
  retrievedOn: '2026-10-22',
  endpoint: 'global',
} as const

/**
 * Tariffs per model, in date order. A model missing here has no price: the page
 * says "tarif belum tersedia" instead of borrowing another model's.
 */
export const MODEL_PRICES: Readonly<Record<string, readonly PricePeriod[]>> = {
  'gemini-3.8-flash': [
    {
      from: null,
      until: '2026-12-31',
      label: 'Harga perkenalan s.d. 31 Des 2026',
      shortLabel: 's.d. 31 Des 2026',
      rates: { input: 0.75, cachedInput: 0.075, output: 3.75 },
      invoiceNote:
        'Menurut catatan kaki halaman harga, harga perkenalan diberikan lewat kredit 50% dari belanja bersih, jadi tagihan bisa menampilkan harga daftar $1,50 / $7,50 lalu potongan kredit.',
    },
    {
      from: '2027-01-01',
      until: null,
      label: 'Harga standar mulai 1 Jan 2027',
      shortLabel: 'Mulai 1 Jan 2027',
      rates: { input: 1.5, cachedInput: 0.15, output: 7.5 },
    },
  ],
}

/**
 * Rupiah per US dollar. A reference rate for showing an amount in rupiah, not
 * the rate a card or invoice is converted at.
 */
export const USD_IDR = {
  rate: 17_917,
  date: '2026-10-06',
  source: 'Bank Indonesia JISDOR',
  url: 'https://www.bi.go.id/en/statistik/informasi-kurs/jisdor/Default.aspx',
} as const

/** The Google Cloud Free Trial credit, in USD. */
export const FREE_TRIAL_CREDIT_USD = 300

/** Every tariff of `model`, oldest first; none for a model this module lacks. */
export function pricePeriodsOf(
  model: string | null | undefined,
): readonly PricePeriod[] {
  return model && Object.hasOwn(MODEL_PRICES, model)
    ? (MODEL_PRICES[model] ?? [])
    : []
}

export function pricePeriodOn(
  model: string | null | undefined,
  isoDate: string,
): PricePeriod | null {
  return (
    pricePeriodsOf(model).find(
      (p) =>
        (p.from === null || p.from <= isoDate) &&
        (p.until === null || isoDate <= p.until),
    ) ?? null
  )
}

/** The tariff `model` was billed at on the WIB date `isoDate`, or `null`. */
export function ratesOn(
  model: string | null | undefined,
  isoDate: string,
): TokenRates | null {
  return pricePeriodOn(model, isoDate)?.rates ?? null
}

export interface TokenCount {
  in: number
  out: number
}

export interface TokenCost {
  inputUsd: number
  outputUsd: number
  usd: number
}

/**
 * Every input token is priced at the full input rate: AISA does not record
 * which input tokens were served from cache, so this is the upper bound of
 * what caching would have cost.
 */
export function tokenCost(tokens: TokenCount, rates: TokenRates): TokenCost {
  const inputUsd = (tokens.in * rates.input) / 1_000_000
  const outputUsd = (tokens.out * rates.output) / 1_000_000
  return { inputUsd, outputUsd, usd: inputUsd + outputUsd }
}

export function usdToIdr(usd: number): number {
  return usd * USD_IDR.rate
}
