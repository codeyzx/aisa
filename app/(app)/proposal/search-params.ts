import * as z from 'zod'

import {
  CategorySchema,
  ProposalStatusSchema,
} from '@/features/aisa/aisa.schema'

/**
 * The proposal list's URL contract. An unknown value is dropped to "no filter"
 * by `catch(undefined)` — a hand-edited URL shows the whole list, never an error
 * page — and the form only ever submits the values listed here.
 */
const ListParamsSchema = z.object({
  kategori: CategorySchema.optional().catch(undefined),
  status: ProposalStatusSchema.optional().catch(undefined),
  sektor: z.string().trim().max(80).optional().catch(undefined),
  tanggapan: z.enum(['belum', 'sudah']).optional().catch(undefined),
  luarFokus: z.literal('1').optional().catch(undefined),
  q: z.string().trim().max(120).optional().catch(undefined),
})
export type ProposalListParams = z.infer<typeof ListParamsSchema>

export function parseProposalListParams(
  raw: Record<string, string | string[] | undefined>,
): ProposalListParams {
  const first = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value) || undefined
  return ListParamsSchema.parse({
    kategori: first(raw.kategori),
    status: first(raw.status),
    sektor: first(raw.sektor),
    tanggapan: first(raw.tanggapan),
    luarFokus: first(raw.luarFokus),
    q: first(raw.q),
  })
}
