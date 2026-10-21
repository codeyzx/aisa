'use server'

import 'server-only'

import { revalidatePath } from 'next/cache'
import * as z from 'zod'

import { callAisaApi, type AisaApiOutcome } from '@/lib/aisa-api/client'
import { runAction, type ActionResult } from '@/lib/data/action-result'

import { AISA_CONFIGURE, AISA_READ, AISA_RESPOND } from './aisa.capability'
import { MAX_DECK_BYTES, MAX_REASON_LENGTH } from './aisa.limits'
import { getRules } from './aisa.repo'
import {
  CategorySchema,
  ResponseKindSchema,
  type Category,
  type EditableRules,
  type ResponseKind,
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

/**
 * Respond to every unresponded proposal in one effective category. Answers how
 * many the API actually responded to, which can differ from the count on screen
 * when some were answered over WhatsApp in the meantime.
 */
export async function bulkRespondAction(
  category: Category,
  kind: ResponseKind,
): ApiAction<{ count: number }> {
  return runAction(AISA_RESPOND, async () => {
    const body = {
      category: CategorySchema.parse(category),
      kind: ResponseKindSchema.parse(kind),
    }
    return afterWrite(
      await callAisaApi<{ count: number }>(
        'POST',
        '/api/proposals/bulk-response',
        body,
      ),
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
    models: z
      .object({
        penilai: modelName,
        ringkasan: modelName,
        insight: modelName,
      })
      .strict(),
    minCharsPerPage: z.number().int().min(0),
    retentionDays: z.number().int().min(1, 'Retensi minimal 1 hari'),
  })
  .strict() satisfies z.ZodType<EditableRules>

/**
 * Validation failures are returned as an API-style refusal so the form can show
 * WHICH rule failed; `runAction` would reduce a ZodError to "Validasi gagal".
 */
export async function updateRulesAction(
  rules: EditableRules,
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
    // The Asisten model is not the dashboard's to change (it takes a redeploy of
    // the Asisten), so the stored value goes back exactly as it was read.
    const stored = await getRules()
    if (!stored) {
      return {
        ok: false as const,
        status: null,
        error: 'Aturan penilaian belum ada di Firestore (settings/rules).',
      }
    }
    return afterWrite(
      await callAisaApi('PUT', '/api/rules', {
        rules: {
          ...parsedRules.data,
          models: {
            ...parsedRules.data.models,
            asisten: stored.models.asisten,
          },
        },
        reason: parsedReason.data,
      }),
    )
  })
}

/**
 * "Hapus data": permanently delete one proposal — its document, text, deck and
 * job. `aisa-api` keeps the history rows (scrubbed of the name) and adds a
 * `proposal_dihapus` row carrying the reason.
 *
 * Only the list is revalidated, not the whole layout: revalidating the detail
 * page the manager is still on would re-render it into a 404 before the client
 * navigates away to /proposal.
 */
export async function deleteProposalAction(
  proposalId: string,
  reason: string,
): ApiAction<{ deleted: boolean }> {
  return runAction(AISA_CONFIGURE, async () => {
    const id = ProposalIdSchema.parse(proposalId)
    const parsedReason = ReasonSchema.safeParse(reason)
    if (!parsedReason.success) {
      return {
        ok: false as const,
        status: null,
        error: parsedReason.error.issues.map((i) => i.message).join('; '),
      }
    }
    const outcome = await callAisaApi<{ deleted: boolean }>(
      'DELETE',
      `/api/proposals/${encodeURIComponent(id)}`,
      { reason: parsedReason.data },
    )
    if (outcome.ok) revalidatePath('/proposal')
    return outcome
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

const AskTextSchema = z.string().trim().min(1).max(4000)
const ConversationIdSchema = z.string().regex(/^[A-Za-z0-9]{1,40}$/)

/**
 * "Tanya AISA": one question to the same Asisten the manager reaches over
 * WhatsApp (read-only tools). The session id is built here from the signed-in
 * user's uid, never taken whole from the client, so a dashboard conversation
 * never mixes with another user's or with a manager phone's WhatsApp session.
 * `conversationId` names one conversation of that user: "Percakapan baru"
 * starts a new one, so the Asisten does not carry the old context into it.
 */
export async function askAssistantAction(
  conversationId: string,
  text: string,
): ApiAction<{ answer: string }> {
  return runAction(AISA_READ, async (session) =>
    callAisaApi<{ answer: string }>(
      'POST',
      '/api/assistant/ask',
      {
        session: `dashboard-${session.uid}-${ConversationIdSchema.parse(conversationId)}`,
        text: AskTextSchema.parse(text),
      },
      // aisa-api waits up to 180s for the Asisten's turn; wait slightly longer
      // so the API's own outcome, not an abort here, is what the panel shows.
      190_000,
    ),
  )
}
