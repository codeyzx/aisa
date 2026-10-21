/**
 * The account-create form must not leak the typed email when it is not hydrated.
 *
 * This surface is deliberately NOT progressively enhanced: `createAccountAction`
 * returns a one-time temporary password in the action RESULT, and a redirect has
 * nowhere to carry a credential — see the docblock in `create-account-form.tsx`.
 * That makes the unhydrated case a real state rather than a theoretical one, and
 * the failure it used to have was silent: a native GET put the administrator's
 * typed email into the address bar, history and any referrer, then re-rendered
 * an apparently-reset form having created nothing.
 *
 * A unit test cannot see this. The bug lives in what the BROWSER does with a
 * `<form>` whose `onSubmit` handler has not been attached yet, so the only way
 * to hold the line is to drive a real one with the client bundle blocked.
 */
import { expect, test } from '@playwright/test'

import { BASE_URL } from './target.ts'
import { signIn } from './sign-in.ts'

test('an unhydrated create submit navigates nowhere and leaks nothing', async ({
  browser,
}) => {
  // Sign-in compiles routes on demand against a dev server; see sign-in.ts.
  test.setTimeout(120_000)
  const context = await browser.newContext({ baseURL: BASE_URL })
  try {
    const signInPage = await context.newPage()
    await signIn(signInPage, 'admin')
    await signInPage.close()

    const page = await context.newPage()
    // Block the BUNDLE rather than disabling JS: React never hydrates, so the
    // `onSubmit` preventDefault never attaches, which is exactly the window the
    // native `method="dialog"` no-op has to cover.
    await page.route('**/_next/static/**', (route) => route.abort())
    await page.goto('/admin/accounts/new')

    await page.getByLabel('Email').fill('nojs-probe@aixel.test')
    await page.getByRole('button', { name: 'Buat akun' }).click()
    // No navigation is expected, so there is no load event to await.
    await page.waitForTimeout(1000)

    // The regression: this URL carried `?email=nojs-probe%40aixel.test` before
    // the form was given `method="dialog"`.
    expect(page.url()).not.toContain('nojs-probe')
    expect(page.url()).not.toContain('email=')

    // And the requirement is stated rather than merely intended.
    expect(await page.content()).toContain('membutuhkan JavaScript')
  } finally {
    await context.close()
  }
})
