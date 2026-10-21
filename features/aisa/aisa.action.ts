'use server'

import 'server-only'

import { revalidatePath } from 'next/cache'
import * as z from 'zod'

import { callAisaApi, type AisaApiOutcome } from '@/lib/aisa-api/client'
import { runAction, type ActionResult } from '@/lib/data/action-result'

import { AISA_CONFIGURE, AISA_READ, AISA_RESPOND } from './aisa.capability'
import { MAX_DECK_BYTES, MAX_REASON_LENGTH } from './aisa.limits'
import {
  CategorySchema,
  ResponseKindSchema,
  type Category,
  type ResponseKind,
  type RulesInput,
} from './aisa.schema'

// Every write in the dashboard lands here and goes to `aisa-api` — Next never
// writes an AISA document itself, so the WhatsApp commands and these buttons run
// the same Python code and leave identical history rows.
//
// Each action resolves to `ActionResult<AisaApiOutcome<…>>`: the outer envelope
// is the capability gate / input validation, the inner one is what the API said.
// An API refusal is returned with its own message rather than thrown, because
// `runAction` would turn a throw into an anonymous "Terjadi kesalahan" and the
// manager would not learn why nothing changed.

type ApiAction<T> = Promise<ActionResult<AisaApiOutcome<T>>>

const ProposalIdSchema = z.string().trim().min(1).max(200)
const ReasonSchema = z
  .string()
  .trim()
  .min(1, 'Alasan wajib diisi')
  .max(MAX_REASON_LENGTH)

/** Re-render every AISA page after a write; they all read the changed data. */
function refreshAll() {
  revalidatePath('/', 'layout')
}

async function afterWrite<T>(outcome: AisaApiOutcome<T>) {
  if (outcome.ok) refreshAll()
  return outcome
}

/** Undang / pantau / arsipkan one proposal. */
export async function respondToProposalAction(
  proposalId: string,
  kind: ResponseKind,
  note?: string,
): ApiAction<unknown> {
  return runAction(AISA_RESPOND, async () => {
    const id = ProposalIdSchema.parse(proposalId)
    const body = {
      kind: ResponseKindSchema.parse(kind),
      note:
        z.string().trim().max(MAX_REASON_LENGTH).optional().parse(note) ||
        undefined,
    }
    return afterWrite(
      await callAisaApi(
        'POST',
        `/api/proposals/${encodeURIComponent(id)}/response`,
        body,
      ),
    )
  })
}

/** Koreksi kategori — the reason is required, and the AI score stays stored. */
export async function correctCategoryAction(
  proposalId: string,
  category: Category,
  reason: string,
): ApiAction<unknown> {
  return runAction(AISA_RESPOND, async () => {
    const id = ProposalIdSchema.parse(proposalId)
    const body = {
      category: CategorySchema.parse(category),
      reason: ReasonSchema.parse(reason),
    }
    return afterWrite(
      await callAisaApi(
        'POST',
        `/api/proposals/${encodeURIComponent(id)}/correction`,
        body,
      ),
    )
  })
}

/** Respond to every unresponded proposal in one effective category. */
export async function bulkRespondAction(
  category: Category,
  kind: ResponseKind,
): ApiAction<unknown> {
  return runAction(AISA_RESPOND, async () => {
    const body = {
      category: CategorySchema.parse(category),
      kind: ResponseKindSchema.parse(kind),
    }
    return afterWrite(
      await callAisaApi('POST', '/api/proposals/bulk-response', body),
    )
  })
}

/** A short-lived link to an uploaded deck. Only uploads have one. */
export async function getDeckUrlAction(
  proposalId: string,
): ApiAction<{ url: string }> {
  return runAction(AISA_READ, async () => {
    const id = ProposalIdSchema.parse(proposalId)
    return callAisaApi<{ url: string }>(
      'GET',
      `/api/proposals/${encodeURIComponent(id)}/deck-url`,
    )
  })
}

const criterionNumbers = z.object({
  tim: z.number().finite(),
  pasar: z.number().finite(),
  produk: z.number().finite(),
  traksi: z.number().finite(),
  bisnis: z.number().finite(),
})
const anchor = z.object({
  '1': z.string().trim().min(1),
  '3': z.string().trim().min(1),
  '5': z.string().trim().min(1),
})
const modelName = z.string().trim().min(1).max(100)

const RulesInputSchema = z
  .object({
    weights: criterionNumbers.refine(
      (weights) =>
        Object.values(weights).every((weight) => weight >= 0) &&
        Math.abs(Object.values(weights).reduce((a, b) => a + b, 0) - 1) <
          0.0005,
      'Total bobot harus 100%',
    ),
    anchors: z.object({
      tim: anchor,
      pasar: anchor,
      produk: anchor,
      traksi: anchor,
      bisnis: anchor,
    }),
    fit: z
      .object({
        sectors: z.array(z.string().trim().min(1)).min(1),
        stages: z.array(z.string().trim().min(1)).min(1),
        fundingMinIdr: z.number().int().min(0),
        fundingMaxIdr: z.number().int().min(0),
      })
      .refine(
        (fit) => fit.fundingMinIdr <= fit.fundingMaxIdr,
        'Dana minimum melebihi maksimum',
      ),
    thresholds: z
      .object({
        sangatCocok: z.number().min(0).max(100),
        cocok: z.number().min(0).max(100),
        kurangCocok: z.number().min(0).max(100),
        qualityOutsideFocus: z.number().min(0).max(100),
      })
      .refine(
        (t) => t.sangatCocok > t.cocok && t.cocok > t.kurangCocok,
        'Batas kategori harus menurun: sangat cocok > cocok > kurang cocok',
      ),
    models: z.object({
      penilai: modelName,
      ringkasan: modelName,
      insight: modelName,
      asisten: modelName,
      orchestrator: modelName,
    }),
    minCharsPerPage: z.number().int().min(0),
  })
  .strict() satisfies z.ZodType<RulesInput>

/**
 * Validation failures are returned as an API-style refusal so the form can show
 * WHICH rule failed; `runAction` would reduce a ZodError to "Validasi gagal".
 */
export async function updateRulesAction(
  rules: RulesInput,
  reason: string,
): ApiAction<unknown> {
  return runAction(AISA_CONFIGURE, async () => {
    const parsedRules = RulesInputSchema.safeParse(rules)
    const parsedReason = ReasonSchema.safeParse(reason)
    if (!parsedRules.success || !parsedReason.success) {
      const issues = [
        ...(parsedRules.error?.issues ?? []),
        ...(parsedReason.error?.issues ?? []),
      ]
      return {
        ok: false as const,
        status: null,
        error: issues.map((issue) => issue.message).join('; '),
      }
    }
    return afterWrite(
      await callAisaApi('PUT', '/api/rules', {
        rules: parsedRules.data,
        reason: parsedReason.data,
      }),
    )
  })
}

/** STOP (paused = true) or LANJUT (paused = false). */
export async function setRuntimePausedAction(
  paused: boolean,
): ApiAction<unknown> {
  return runAction(AISA_CONFIGURE, async () => {
    const path = z.boolean().parse(paused)
      ? '/api/runtime/stop'
      : '/api/runtime/resume'
    return afterWrite(await callAisaApi('POST', path))
  })
}

/**
 * Forward a pitch deck to `/intake/upload`. Answers the new proposal id (202);
 * scoring continues asynchronously in the worker.
 */
export async function uploadDeckAction(
  formData: FormData,
): ApiAction<{ proposalId: string }> {
  return runAction(AISA_RESPOND, async () => {
    const file = formData.get('file')
    const name = formData.get('name')
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false as const, status: null, error: 'Pilih berkas PDF.' }
    }
    if (
      file.type !== 'application/pdf' &&
      !file.name.toLowerCase().endsWith('.pdf')
    ) {
      return { ok: false as const, status: null, error: 'Berkas harus PDF.' }
    }
    if (file.size > MAX_DECK_BYTES) {
      return {
        ok: false as const,
        status: null,
        error: `Berkas terlalu besar (maksimal ${MAX_DECK_BYTES / 1024 / 1024} MB).`,
      }
    }
    const upstream = new FormData()
    upstream.append('file', file, file.name)
    const trimmedName =
      typeof name === 'string' ? name.trim().slice(0, 120) : ''
    if (trimmedName) upstream.append('name', trimmedName)
    return afterWrite(
      await callAisaApi<{ proposalId: string }>(
        'POST',
        '/intake/upload',
        upstream,
      ),
    )
  })
}
