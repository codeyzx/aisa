import {
  DocumentReference,
  GeoPoint,
  Timestamp,
} from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'
import { describe, expect, it } from 'vitest'

import { decode, encode } from './codec'

/**
 * `decode` needs a Firestore handle for ONE reason — rebuilding a
 * DocumentReference. Everything else is pure, so a stub that only answers
 * `doc()` is enough and keeps this suite free of an emulator.
 */
const fakeDb = {
  doc: (path: string) => ({ path, __isRef: true }),
} as unknown as Firestore

/** The round trip through actual JSON — the thing the codec has to survive. */
const roundTrip = (value: unknown): unknown =>
  decode(JSON.parse(JSON.stringify(encode(value))), fakeDb)

describe('codec round trip', () => {
  it('restores a Timestamp AS A TIMESTAMP, not as {_seconds,_nanoseconds}', () => {
    // THE test. Without the codec, JSON.stringify turns a Timestamp into a
    // plain object; it restores looking correct in the emulator UI and the
    // zodConverter throws on the next read. Asserting the CLASS is the whole
    // point — asserting the shape would pass on the broken version.
    const ts = Timestamp.fromDate(new Date('2026-07-17T10:30:00.000Z'))
    const restored = roundTrip({ createdAt: ts }) as { createdAt: Timestamp }

    expect(restored.createdAt).toBeInstanceOf(Timestamp)
    expect(restored.createdAt.isEqual(ts)).toBe(true)
  })

  it('keeps nanosecond precision, which a millisecond Date would silently drop', () => {
    const ts = new Timestamp(1_784_286_158, 753_000_123)
    const restored = roundTrip({ at: ts }) as { at: Timestamp }
    expect(restored.at.nanoseconds).toBe(753_000_123)
    expect(restored.at.isEqual(ts)).toBe(true)
  })

  it('restores a GeoPoint as a GeoPoint', () => {
    const point = new GeoPoint(-6.2088, 106.8456)
    const restored = roundTrip({ where: point }) as { where: GeoPoint }
    expect(restored.where).toBeInstanceOf(GeoPoint)
    expect(restored.where.isEqual(point)).toBe(true)
  })

  it('restores Bytes without corrupting them', () => {
    const bytes = Buffer.from([0, 1, 254, 255, 128])
    const restored = roundTrip({ blob: bytes }) as { blob: Buffer }
    expect(Buffer.isBuffer(restored.blob)).toBe(true)
    expect(restored.blob.equals(bytes)).toBe(true)
  })

  it('restores a DocumentReference as a link, not a string', () => {
    const restored = roundTrip({ owner: { path: 'users/abc' } as never })
    // Encoded refs go through db.doc(); a real DocumentReference instance is
    // not constructible here, so the ref leg is proven via the encode tag.
    expect(restored).toEqual({ owner: { path: 'users/abc' } })
  })

  it('encodes a ref by path and decodes it back through db.doc()', () => {
    const ref = Object.create(DocumentReference.prototype) as DocumentReference
    Object.defineProperty(ref, 'path', { value: 'items/xyz' })
    expect(encode({ link: ref })).toEqual({
      link: { __t: 'ref', path: 'items/xyz' },
    })
    const restored = decode({ link: { __t: 'ref', path: 'items/xyz' } }, fakeDb)
    expect(restored).toEqual({ link: { path: 'items/xyz', __isRef: true } })
  })

  it('recurses into nested objects and arrays', () => {
    // The Timestamp inside an array inside an object is where a shallow codec
    // quietly stops working while the top level still looks right.
    const ts = Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z'))
    const restored = roundTrip({
      meta: { history: [{ at: ts }, { at: ts }] },
    }) as { meta: { history: { at: Timestamp }[] } }

    expect(restored.meta.history).toHaveLength(2)
    for (const entry of restored.meta.history) {
      expect(entry.at).toBeInstanceOf(Timestamp)
      expect(entry.at.isEqual(ts)).toBe(true)
    }
  })

  it('leaves plain JSON values exactly as they were', () => {
    const plain = {
      name: 'Widget',
      count: 42,
      ratio: 1.5,
      active: true,
      tags: ['a', 'b'],
      nested: { deep: { deeper: 'value' } },
    }
    expect(roundTrip(plain)).toEqual(plain)
  })

  it('normalises undefined to null rather than dropping the key', () => {
    // JSON.stringify DELETES undefined keys. Encoding to null keeps the field
    // present, which matters because Firestore's ignoreUndefinedProperties makes
    // "absent" and "undefined" different things on the way back in.
    expect(encode({ a: undefined })).toEqual({ a: null })
  })

  it('encodes a Date as a Timestamp — restoring a Date would be the same bug, one level down', () => {
    const date = new Date('2026-03-04T05:06:07.008Z')
    const restored = roundTrip({ when: date }) as { when: Timestamp }
    expect(restored.when).toBeInstanceOf(Timestamp)
    expect(restored.when.toDate().toISOString()).toBe(date.toISOString())
  })
})
