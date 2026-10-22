'use server'

import 'server-only'

import { refresh, revalidatePath } from 'next/cache'
import * as z from 'zod'

import { callAisaApi, type AisaApiOutcome } from '@/lib/aisa-api/client'
import { runAction, type ActionResult } from '@/lib/data/action-result'

import { AISA_CONFIGURE, AISA_READ, AISA_RESPOND } from './aisa.capability'
import { deckRefusal, MAX_REASON_LENGTH } from './aisa.limits'
import {
  getAssessmentProgress,
  getRules,
  type AssessmentProgress,
} from './aisa.repo'
import {
  CategorySchema,
  ResponseKindSchema,
  type Category,
  type EditableRules,
  type ProposalStatus,
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

/** Setuju / tolak one proposal. */
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

/** Koreksi grade — the reason is required, and the AI score stays stored. */
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

/**
 * Where a deck can be opened, as `aisa-api` answers `GET …/deck-url`: `url` for
 * a new tab, and `previewUrl` for an `<iframe>` — a signed GCS link served
 * inline as a PDF for uploads, Drive's `/preview` viewer for Form decks. An API
 * older than the preview sends no `previewUrl`, which reads as "no preview".
 * `expiresIn` is seconds until both links stop working, null when they do not
 * expire (Drive).
 */
export interface DeckLink {
  url: string
  previewUrl?: string | null
  expiresIn: number | null
}

/** Links to a proposal's deck: a short-lived signed one for uploads, Drive for Form. */
export async function getDeckUrlAction(
  proposalId: string,
): ApiAction<DeckLink> {
  return runAction(AISA_READ, async () => {
    const id = ProposalIdSchema.parse(proposalId)
    return callAisaApi<DeckLink>(
      'GET',
      `/api/proposals/${encodeURIComponent(id)}/deck-url`,
    )
  })
}

/**
 * The detail page's live progress poll: a read of Firestore, not a call to
 * `aisa-api`, so it resolves to the progress itself (null once the proposal is
 * gone). The browser polls this instead of listening to Firestore, whose rules
 * deny every client read.
 *
 * `seenStatus` is the proposal status the browser last showed. When the
 * status has moved on (claimed, scored, flagged, failed, deleted), the same
 * response carries a re-render of the page, so its header, result and log
 * change together with the progress card instead of waiting for a reload.
 */
export async function getAssessmentProgressAction(
  proposalId: string,
  seenStatus?: ProposalStatus,
): Promise<ActionResult<AssessmentProgress | null>> {
  return runAction(AISA_READ, async () => {
    const progress = await getAssessmentProgress(
      ProposalIdSchema.parse(proposalId),
    )
    if (seenStatus !== undefined && progress?.status !== seenStatus) refresh()
    return progress
  })
}

const criterionNumbers = z.object({
  manajemen: z.number().finite(),
  kinerja: z.number().finite(),
  risiko: z.number().finite(),
  rencana: z.number().finite(),
  dampak: z.number().finite(),
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
      manajemen: anchor,
      kinerja: anchor,
      risiko: anchor,
      rencana: anchor,
      dampak: anchor,
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
        sangatLayak: z.number().gt(0).max(100),
        layakBersyarat: z.number().gt(0).max(100),
        perluPenyesuaian: z.number().gt(0).max(100),
        risikoTinggi: z.number().gt(0).max(100),
      })
      .refine(
        (t) =>
          t.sangatLayak > t.layakBersyarat &&
          t.layakBersyarat > t.perluPenyesuaian &&
          t.perluPenyesuaian > t.risikoTinggi,
        'Batas grade harus menurun: Sangat layak > Layak bersyarat > Perlu penyesuaian > Risiko tinggi',
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

// aisa-api words its intake refusals as lowercase fragments ("berkas bukan
// PDF"); the upload form shows them as the sentences its own checks write.
const asSentence = (text: string) => {
  const trimmed = text.trim()
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  return /[.!?]$/u.test(capital) ? capital : `${capital}.`
}

/**
 * Forward a pitch deck to `/intake/upload`. Answers the proposal id (202) and
 * whether this upload created it: the id is the deck's content hash, so a deck
 * sent before answers `created: false` with the existing proposal's id. Scoring
 * a new deck continues asynchronously in the worker.
 */
export async function uploadDeckAction(
  formData: FormData,
): ApiAction<{ proposalId: string; created: boolean }> {
  return runAction(AISA_RESPOND, async () => {
    const file = formData.get('file')
    const name = formData.get('name')
    const refusal = deckRefusal(file)
    if (refusal !== null) {
      return { ok: false as const, status: null, error: refusal }
    }
    // `deckRefusal` only accepts a non-empty File.
    const deck = file as File
    const upstream = new FormData()
    upstream.append('file', deck, deck.name)
    const trimmedName =
      typeof name === 'string' ? name.trim().slice(0, 120) : ''
    if (trimmedName) upstream.append('name', trimmedName)
    const outcome = await callAisaApi<{
      proposalId: string
      created: boolean
    }>('POST', '/intake/upload', upstream)
    return afterWrite(
      outcome.ok ? outcome : { ...outcome, error: asSentence(outcome.error) },
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
