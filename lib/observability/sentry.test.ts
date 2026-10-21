import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs'
import { describe, expect, it } from 'vitest'

import { scrubBreadcrumb, scrubEvent } from './sentry'

/**
 * `ErrorEvent` requires the discriminant `type: undefined` (that is what makes it
 * an error rather than a transaction), so every fixture below goes through this
 * helper instead of repeating the field.
 */
function errorEvent(partial: Partial<ErrorEvent>): ErrorEvent {
  return { type: undefined, ...partial } as ErrorEvent
}

/**
 * `scrubEvent` / `scrubBreadcrumb` are the ENTIRE PII boundary between this app
 * and an error reporter, so every case below is a payload the SDK genuinely
 * produces, not a hypothetical:
 *
 *   - `Sentry.captureRequestError` (wired as `onRequestError`) copies EVERY
 *     request header onto the event, and `requestDataIntegration`'s deny-list
 *     filtering runs on the span path only — so the `__session` cookie reaches
 *     `event.request.headers` verbatim unless this function removes it.
 *   - Next's own `onRequestError` docs give `/blog?name=foo` as the shape of
 *     `request.path` — the query string is included.
 *   - server console breadcrumbs are `lib/log`'s output, uids and all.
 *
 * A relaxation of any of these reddens here rather than in production traffic.
 */
describe('scrubEvent', () => {
  it('drops the session cookie and every other request header', () => {
    const event = scrubEvent(
      errorEvent({
        request: {
          method: 'POST',
          url: 'https://app.example/assets/abc',
          headers: {
            cookie: '__session=eyJhbGciOiJSUzI1NiJ9.super-secret-token',
            authorization: 'Bearer super-secret-token',
            'user-agent': 'Mozilla/5.0',
          },
          cookies: { __session: 'eyJhbGciOiJSUzI1NiJ9.super-secret-token' },
        },
      }),
    )

    expect(event.request).toStrictEqual({
      method: 'POST',
      url: 'https://app.example/assets/abc',
    })
    expect(JSON.stringify(event)).not.toContain('super-secret-token')
  })

  it('drops the request body', () => {
    const event = scrubEvent(
      errorEvent({
        request: {
          method: 'POST',
          data: { password: 'rahasia123', email: 'admin@aixel.test' },
        },
      }),
    )

    expect(event.request).toStrictEqual({ method: 'POST' })
  })

  it('strips the query string from the request url and the next.js route path', () => {
    const event = scrubEvent(
      errorEvent({
        request: { url: 'https://app.example/assets?token=abc123&q=budi' },
        contexts: { nextjs: { request_path: '/assets?token=abc123' } },
      } as Partial<ErrorEvent>),
    )

    expect(event.request?.url).toBe('https://app.example/assets')
    expect(event.contexts?.nextjs?.request_path).toBe('/assets')
  })

  it('removes the user block — uid, email and ip alike', () => {
    const event = scrubEvent(
      errorEvent({
        user: {
          id: 'uid-123',
          email: 'admin@aixel.test',
          ip_address: '203.0.113.7',
        },
      }),
    )

    expect(event.user).toBeUndefined()
  })

  it('redacts an email carried in the exception message', () => {
    const event = scrubEvent(
      errorEvent({
        message: 'no user record for admin@aixel.test',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'auth/user-not-found: budi.s+test@mail.co.id',
            },
          ],
        },
      }),
    )

    expect(event.message).toBe('no user record for [redacted-email]')
    expect(event.exception?.values?.[0]?.value).toBe(
      'auth/user-not-found: [redacted-email]',
    )
  })

  it('leaves the stack trace intact — the payload must still be useful', () => {
    const event = scrubEvent(
      errorEvent({
        exception: {
          values: [
            {
              type: 'TypeError',
              value: 'x is not a function',
              stacktrace: {
                frames: [{ filename: 'app/page.tsx', lineno: 12 }],
              },
            },
          ],
        },
      }),
    )

    expect(event.exception?.values?.[0]?.stacktrace?.frames).toHaveLength(1)
  })
})

/**
 * The ARBITRARY carriers. `event.extra`, `event.tags` and `event.contexts`
 * are open bags — anything can attach a person to one, and the module header
 * claims the payload is "allow-listed, not deny-listed". Before these fixtures
 * that claim held only for `event.request`; the three bags passed through
 * verbatim, so a `setExtra({ actorEmail })` or a custom context shipped intact.
 */
describe('scrubEvent — the arbitrary carriers', () => {
  it('drops event.extra entirely — no allow-list makes an arbitrary bag safe', () => {
    const event = scrubEvent(
      errorEvent({
        extra: {
          uid: 'uid-123',
          actorEmail: 'admin@aixel.test',
          documentPath: 'assets/abc',
        },
      }),
    )
    expect(event.extra).toBeUndefined()
  })

  it('keeps only the allow-listed tags and drops the rest', () => {
    const event = scrubEvent(
      errorEvent({
        tags: {
          cid: 'cid-123',
          capability: 'asset:write',
          code: 'INTERNAL',
          // Not allow-listed — the shapes a hurried `setTag` actually takes.
          userEmail: 'admin@aixel.test',
          uid: 'uid-123',
        },
      }),
    )

    expect(event.tags).toStrictEqual({
      cid: 'cid-123',
      capability: 'asset:write',
      code: 'INTERNAL',
    })
  })

  it('keeps only the allow-listed contexts and drops the rest', () => {
    const event = scrubEvent(
      errorEvent({
        contexts: {
          nextjs: { request_path: '/assets?q=budi' },
          runtime: { name: 'node', version: '24.18.0' },
          // Not allow-listed: a custom context, plus the two SDK ones that
          // narrow a person (device name, locale + timezone).
          account: { uid: 'uid-123', email: 'admin@aixel.test' },
          device: { name: "Budi's MacBook Pro" },
          culture: { locale: 'id-ID', timezone: 'Asia/Jakarta' },
        },
      }),
    )

    expect(Object.keys(event.contexts ?? {}).toSorted()).toStrictEqual([
      'nextjs',
      'runtime',
    ])
    // And the survivor is still query-stripped.
    expect(event.contexts?.nextjs?.request_path).toBe('/assets')
  })

  it('drops a tag key the app never sets, however innocent it looks', () => {
    // The point of an allow-list: a future SDK version or integration adding a
    // field must not silently start shipping it.
    const event = scrubEvent(
      errorEvent({ tags: { some_future_sdk_tag: 'value' } }),
    )
    expect(event.tags).toBeUndefined()
  })
})

describe('scrubBreadcrumb', () => {
  it('drops console breadcrumbs outright', () => {
    expect(
      scrubBreadcrumb({
        category: 'console',
        message: 'account updated',
        data: { uid: 'uid-123', actorEmail: 'admin@aixel.test' },
      } as Breadcrumb),
    ).toBeNull()
  })

  it('strips query strings from fetch and navigation breadcrumbs', () => {
    expect(
      scrubBreadcrumb({
        category: 'fetch',
        data: { url: '/api/export?token=abc123' },
      } as Breadcrumb)?.data?.url,
    ).toBe('/api/export')

    expect(
      scrubBreadcrumb({
        category: 'navigation',
        data: { from: '/login?next=/admin', to: '/admin?tab=akun' },
      } as Breadcrumb)?.data,
    ).toStrictEqual({ from: '/login', to: '/admin' })
  })

  it('keeps only allow-listed breadcrumb data keys', () => {
    // The same arbitrary-bag problem one layer down: stripping the query off
    // three known URL keys left every OTHER key untouched, so a breadcrumb
    // carrying an actor email shipped verbatim.
    const breadcrumb = scrubBreadcrumb({
      category: 'fetch',
      data: {
        url: '/api/assets?q=budi',
        method: 'POST',
        status_code: 500,
        actorEmail: 'admin@aixel.test',
        uid: 'uid-123',
      },
    } as Breadcrumb)

    expect(breadcrumb?.data).toStrictEqual({
      url: '/api/assets',
      method: 'POST',
      status_code: 500,
    })
  })

  it('keeps a plain breadcrumb — the trail must still be readable', () => {
    const breadcrumb = scrubBreadcrumb({
      category: 'ui.click',
      message: 'button#simpan',
    } as Breadcrumb)

    expect(breadcrumb?.message).toBe('button#simpan')
  })
})
