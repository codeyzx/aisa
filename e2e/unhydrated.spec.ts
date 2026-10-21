/**
 * The progressive-enhancement claim, driven with the client bundle BLOCKED.
 *
 * THE FLOOR IS HYDRATION, NOT JAVASCRIPT, and that distinction is the whole
 * reason this file exists in its current shape.
 *
 * What the code claims: `asset-form.tsx` posts to a Server Function through a
 * real `<form>`, and the two non-native fields (the Base UI status select, the
 * formatted currency input) each carry a hidden input so their values still
 * reach the server without React. So a submit works in the window BEFORE the
 * bundle has loaded, and it still works if the bundle never arrives — a slow
 * chunk, a failed chunk, a click in the first moments of a page. That is a real
 * degradation a real reader hits, and it is what these tests drive.
 *
 * What the app does NOT claim, since 2026-07-22: that it works with scripting
 * switched off. It does not, and the root layout says so in a `<noscript>`.
 * Sign-in hands the password to Firebase from the browser, so nobody can
 * authenticate without JavaScript and no protected surface is reachable to begin
 * with. Two things follow, and both are why this file no longer tests "JS off":
 *
 *   - A `javaScriptEnabled: false` run has to BORROW a session from a scripted
 *     context to reach anything, which means it is already not the state a real
 *     visitor is ever in.
 *   - `/assets/new` streams behind the root Suspense boundary in
 *     `app/loading.tsx`, and React swaps the real content in with an inline
 *     `$RC(...)` script. With scripting off that swap never runs, so the page
 *     shows the "Memuat" spinner forever and no person can fill the form.
 *
 * This file previously carried a third test asserting the form WAS usable with
 * scripting off, marked `test.fail()` as a self-retiring record of that
 * limitation. It has been deleted rather than left red: a tracked failure means
 * "we intend to fix this", and we do not. The app requires JavaScript, says so,
 * and the property worth guarding is the unhydrated one — which the two tests
 * below guard for real, with assertions that can fail.
 *
 * (That deleted marker earned its keep first. It was originally wrapped around
 * BOTH halves of this file, and `test.fail()` reports a test as PASSED when ANY
 * assertion in it fails — so the true half was unfalsifiable: deleting the hidden
 * `name="status"` input left the run green. Splitting it is what made the
 * assertions below real.)
 *
 * SCOPE, stated narrowly because the obvious generalisation is FALSE. The
 * streaming behaviour above is about segments that actually suspend.
 * `/login` is dynamic (absent from `.next/prerender-manifest.json`) yet its
 * `<form>` is in the initial HTML with no `S:0` placeholder and no `$RC(` call —
 * verified against a production build on 2026-07-22. Do not read this as
 * "remove `app/loading.tsx`"; the boundary matters only where a segment suspends.
 */
import { expect, test } from '@playwright/test'

import { BASE_URL } from './target.ts'
import { signIn } from './sign-in.ts'

/**
 * A signed-in context whose pages never receive the client bundle.
 *
 * Sign-in itself needs JavaScript by design — the browser talks to Firebase and
 * posts the resulting ID token for a session cookie, because the password must
 * never reach this origin. So the session is established normally and the BUNDLE
 * is blocked per page afterwards, which is exactly the shape of the real failure:
 * a reader who is already signed in and whose chunk request does not arrive.
 */
async function signedInContext(browser: import('@playwright/test').Browser) {
  // `newContext` does not inherit the config's `use`, so baseURL is passed here.
  const context = await browser.newContext({ baseURL: BASE_URL })
  const signInPage = await context.newPage()
  await signIn(signInPage, 'admin')
  await signInPage.close()
  return context
}

/** A page in `context` that will never load a `_next/static` chunk. */
async function unhydratedPage(
  context: import('@playwright/test').BrowserContext,
) {
  const page = await context.newPage()
  await page.route('**/_next/static/**', (route) => route.abort())
  return page
}

test('the server ships a real POST form with named fields, before any hydration', async ({
  browser,
}) => {
  // Sign-in compiles routes on demand against a dev server; see sign-in.ts.
  test.setTimeout(120_000)
  const context = await signedInContext(browser)
  try {
    const page = await unhydratedPage(context)
    await page.goto('/assets/new')
    // Present without React: the field is in the served markup, so waiting for
    // it proves the server half rather than the client's.
    await expect(page.getByLabel('Nama', { exact: true })).toBeVisible()

    const html = await page.content()
    // These assertions must be able to FAIL — that is the whole point of having
    // deleted the `test.fail()` wrapper that once covered them. `name="status"`
    // is the hidden input behind the Base UI select; lose it and the form
    // silently posts without a status.
    expect(html).toContain('method="POST"')
    expect(html).toContain('name="name"')
    expect(html).toContain('name="status"')
  } finally {
    await context.close()
  }
})

test('an unhydrated submit creates the record and lands on the list', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const context = await signedInContext(browser)
  try {
    const page = await unhydratedPage(context)
    await page.goto('/assets/new')

    const token = `nh${Date.now().toString(36)}`
    const name = `${token} Meja tanpa hidrasi`
    await page.getByLabel('Nama', { exact: true }).fill(name)
    await page.getByRole('button', { name: 'Buat aset' }).click()

    // The redirect is the SERVER's — nothing client-side is running to perform
    // one, which is precisely the claim being driven.
    await expect(page).toHaveURL(/\/assets(\?|$)/)

    // And the record really exists, rather than the navigation merely looking
    // right: a submit that redirected without writing would pass the line above.
    await page.goto(`/assets?q=${token}&status=all`)
    await expect(page.getByText(name)).toBeVisible()
  } finally {
    await context.close()
  }
})

test('a rejected unhydrated submit shows the field error and nothing else', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const context = await signedInContext(browser)
  try {
    const page = await unhydratedPage(context)
    await page.goto('/assets/new')
    // Submit empty, so the server rejects and re-renders with errors. Unhydrated
    // this is a real full-page POST, which is the only path that populated the
    // form-level error map — the bug below never reproduced with the bundle
    // loaded.
    await page.getByRole('button', { name: 'Buat aset' }).click()

    // The real error must be there: an assertion that only checked for the
    // absence of "undefined" would pass on a page that rendered no errors at
    // all, which is the same bug wearing a different mask.
    await expect(page.getByText('Nama wajib diisi')).toBeVisible()

    // The regression: `String(errors[0])` over a non-message entry rendered a
    // literal "undefined" alert next to the real one (observed 2026-07-22).
    await expect(page.getByText('undefined', { exact: true })).toHaveCount(0)
  } finally {
    await context.close()
  }
})
