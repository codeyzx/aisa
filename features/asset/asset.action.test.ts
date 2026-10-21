import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type Session } from '@/lib/auth/session'
import { anAsset } from '@/test/builders/asset'
import { signedInAs } from '@/test/builders/session'
import { type Asset, type AssetFormValues } from './asset.schema'

/**
 * The authz on the WRITE actions — the only property here worth a test.
 *
 * It matters most for `deleteAssetsAction`: it is the repo's first BULK
 * destructive action, so a capability that reads `asset:read` instead of
 * `asset:write` does not leak one row to a reader — it hands them the whole
 * page. That downgrade is a ONE-WORD edit that passed typecheck, lint and every
 * other test in this suite, under a doc comment declaring "THE AUTHZ HERE IS THE
 * POINT". A property no test can fail on is a property the next refactor is free
 * to delete.
 *
 * The role split is what gives the test teeth: `user` holds `asset:read` but
 * NOT `asset:write` (lib/auth/rbac.ts), so a downgraded capability lets a
 * `user` session straight through and the repo spy fires. Asserting the repo was
 * NOT CALLED — rather than only that the envelope says forbidden — is the half
 * that catches a gate which reports a refusal after already doing the work.
 */
const repo = vi.hoisted(() => ({
  deleteAssets: vi.fn(async (ids: string[]) =>
    ids.map((id) => ({ id, attachmentKey: undefined })),
  ),
  deleteAsset: vi.fn<() => Promise<string | undefined>>(async () => undefined),
  createAsset: vi.fn<() => Promise<{ id: string }>>(async () => ({
    id: 'new-id',
  })),
  updateAsset: vi.fn<
    () => Promise<{
      asset: { id: string }
      previousAttachmentKey: string | undefined
    }>
  >(async () => ({
    asset: { id: 'updated-id' },
    previousAttachmentKey: undefined,
  })),
  getAsset: vi.fn(),
  listAssets: vi.fn(),
  countAssets: vi.fn(),
}))

const session = vi.hoisted(() => ({ current: null as Session | null }))
const lifecycle = vi.hoisted(() => ({
  promoteAttachment: vi.fn(),
  reapAttachment: vi.fn(),
  reapPromotionOnFailedWrite: vi.fn(),
  requireFreshStagingAttachment: vi.fn(),
  requireValidAttachmentUpdate: vi.fn(),
}))
const formAction = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('./asset.repo', () => repo)
vi.mock('@/lib/storage/attachment-lifecycle', () => lifecycle)
vi.mock('@/lib/data/form-action', () => ({ runFormAction: formAction }))
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(async () => session.current),
}))

beforeEach(() => {
  vi.clearAllMocks()
  session.current = signedInAs('admin')
  lifecycle.promoteAttachment.mockImplementation(
    async (attachmentKey?: string) => ({
      attachmentKey,
      moved: false,
    }),
  )
  lifecycle.reapAttachment.mockResolvedValue(undefined)
  lifecycle.reapPromotionOnFailedWrite.mockResolvedValue(undefined)
})

const formValues: AssetFormValues = {
  name: 'Office chair',
  description: '',
  value: 100_000,
  status: 'active',
  attachmentKey: 'uploads/uid-1/chair.pdf',
}

function runForm(values: AssetFormValues): void {
  formAction.mockImplementation(
    async ({
      run,
    }: {
      run: (session: Session, values: AssetFormValues) => Promise<void>
    }) => run(session.current as Session, values),
  )
}

describe('deleteAssetsAction — the bulk destructive path', () => {
  it('refuses a reader, and does not touch the repo on the way out', async () => {
    const { deleteAssetsAction } = await import('./asset.action')
    session.current = signedInAs('user')

    const result = await deleteAssetsAction(['a', 'b', 'c'])

    expect(result).toEqual({
      ok: false,
      error: 'Anda tidak memiliki izin',
      code: 'forbidden',
    })
    // The load-bearing assertion. An envelope saying "forbidden" after the rows
    // are already gone is not a gate, it is an apology.
    expect(repo.deleteAssets).not.toHaveBeenCalled()
  })

  it('refuses a signed-out caller', async () => {
    const { deleteAssetsAction } = await import('./asset.action')
    session.current = null

    const result = await deleteAssetsAction(['a'])

    expect(result.ok).toBe(false)
    expect(repo.deleteAssets).not.toHaveBeenCalled()
  })

  it('lets a writer through', async () => {
    // The other half: a gate that refuses everyone passes the two tests above
    // and is just as broken.
    const { deleteAssetsAction } = await import('./asset.action')

    const result = await deleteAssetsAction(['a', 'b'])

    expect(result.ok).toBe(true)
    expect(repo.deleteAssets).toHaveBeenCalledWith(['a', 'b'])
  })

  it('rejects an empty id list before reaching the repo', async () => {
    const { deleteAssetsAction } = await import('./asset.action')

    const result = await deleteAssetsAction([])

    expect(result.ok).toBe(false)
    expect(repo.deleteAssets).not.toHaveBeenCalled()
  })
})

describe('deleteAssetAction — the single-row path', () => {
  it('refuses a reader', async () => {
    const { deleteAssetAction } = await import('./asset.action')
    session.current = signedInAs('user')

    const result = await deleteAssetAction('a')

    expect(result.ok).toBe(false)
    expect(repo.deleteAsset).not.toHaveBeenCalled()
  })

  it('deletes the document before reaping its attachment', async () => {
    const { deleteAssetAction } = await import('./asset.action')
    const calls: string[] = []
    repo.deleteAsset.mockImplementation(async () => {
      calls.push('document')
      return 'assets/uid-1/chair.pdf'
    })
    lifecycle.reapAttachment.mockImplementation(
      async (_session, key: string) => {
        calls.push(`object:${key}`)
      },
    )

    await expect(deleteAssetAction('asset-1')).resolves.toMatchObject({
      ok: true,
    })

    expect(calls).toEqual(['document', 'object:assets/uid-1/chair.pdf'])
  })
})

describe('Asset form actions — attachment lifecycle wiring', () => {
  it('promotes a create attachment before writing the document', async () => {
    const { createAssetFormAction } = await import('./asset.action')
    const calls: string[] = []
    runForm(formValues)
    lifecycle.requireFreshStagingAttachment.mockImplementation(() => {
      calls.push('assert-fresh')
    })
    lifecycle.promoteAttachment.mockImplementation(async () => {
      calls.push('promote')
      return { attachmentKey: 'assets/uid-1/chair.pdf', moved: true }
    })
    repo.createAsset.mockImplementation(async () => {
      calls.push('document')
      return { id: 'asset-1' }
    })

    await createAssetFormAction(null, new FormData())

    expect(calls).toEqual(['assert-fresh', 'promote', 'document'])
    expect(repo.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentKey: 'assets/uid-1/chair.pdf' }),
    )
  })

  it('routes a failed write to lifecycle compensation', async () => {
    const { createAssetFormAction } = await import('./asset.action')
    const failure = new Error('write failed')
    const promotion = {
      attachmentKey: 'assets/uid-1/chair.pdf',
      moved: true,
    }
    runForm(formValues)
    lifecycle.promoteAttachment.mockResolvedValue(promotion)
    repo.createAsset.mockRejectedValue(failure)

    await expect(createAssetFormAction(null, new FormData())).rejects.toThrow(
      failure,
    )

    expect(lifecycle.reapPromotionOnFailedWrite).toHaveBeenCalledWith(
      session.current,
      failure,
      promotion,
      'asset.attachment.orphan',
    )
  })

  it('reaps the transaction-derived prior key after an attachment replacement', async () => {
    const { updateAssetFormAction } = await import('./asset.action')
    const calls: string[] = []
    runForm(formValues)
    lifecycle.promoteAttachment.mockImplementation(async () => {
      calls.push('promote')
      return { attachmentKey: 'assets/uid-1/replacement.pdf', moved: true }
    })
    repo.updateAsset.mockImplementation(async () => {
      calls.push('document')
      return {
        asset: { id: 'asset-1' },
        previousAttachmentKey: 'assets/uid-1/prior.pdf',
      }
    })
    lifecycle.reapAttachment.mockImplementation(
      async (_session, key: string) => {
        calls.push(`object:${key}`)
      },
    )

    await updateAssetFormAction('asset-1', undefined, null, new FormData())

    expect(repo.getAsset).not.toHaveBeenCalled()
    expect(calls).toEqual([
      'promote',
      'document',
      'object:assets/uid-1/prior.pdf',
    ])
  })
})

describe('getAssetAction — the gated read a tool delegates to', () => {
  // This action exists so an AI tool reads through a capability gate instead of
  // the repo (docs/reference/contracts/ai.md). The teeth here are the same as the
  // write paths': refuse without a session and DON'T touch the repo — a read that
  // answers before the gate would be the back door the doctrine forbids, whether
  // the caller is a human or a model's tool call.
  it('refuses a signed-out caller, and does not touch the repo', async () => {
    const { getAssetAction } = await import('./asset.action')
    session.current = null

    const result = await getAssetAction('a')

    expect(result.ok).toBe(false)
    expect(repo.getAsset).not.toHaveBeenCalled()
  })

  it('lets a signed-in reader through and returns the asset', async () => {
    const { getAssetAction } = await import('./asset.action')
    session.current = signedInAs('user') // holds asset:read, not asset:write
    const asset = {
      ...anAsset(),
      id: 'a',
      code: 'AST-0001',
      searchPrefixes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Asset
    repo.getAsset.mockResolvedValue(asset)

    const result = await getAssetAction('a')

    expect(result).toEqual({ ok: true, data: asset })
    expect(repo.getAsset).toHaveBeenCalledWith('a')
  })

  it('maps a missing asset to not_found', async () => {
    const { getAssetAction } = await import('./asset.action')
    repo.getAsset.mockResolvedValue(undefined)

    const result = await getAssetAction('missing')

    expect(result).toMatchObject({ ok: false, code: 'not_found' })
  })
})
