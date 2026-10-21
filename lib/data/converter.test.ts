import { describe, expect, it } from 'vitest'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import * as z from 'zod'

import { zodConverter } from './converter'

const Schema = z.object({ id: z.string(), name: z.string() })

/** Minimal snapshot double — the converter only reads `.id` and `.data()`. */
function snapshot(
  id: string,
  data: Record<string, unknown>,
): QueryDocumentSnapshot {
  return { id, data: () => data } as unknown as QueryDocumentSnapshot
}

describe('zodConverter', () => {
  it('fromFirestore: the document key wins over a stored `id` field', () => {
    const model = zodConverter(Schema).fromFirestore(
      // A doc that carries a stale `id` in its data must NOT override its key.
      snapshot('real-key', { id: 'stale-stored-id', name: 'A' }),
    )
    expect(model.id).toBe('real-key')
  })

  it('toFirestore: drops the synthetic `id` (it is the key, not stored data)', () => {
    const data = zodConverter(Schema).toFirestore({ id: 'x', name: 'A' })
    expect(data).not.toHaveProperty('id')
    expect(data.name).toBe('A')
  })
})
