import { redirect } from 'next/navigation'

/**
 * The root route is not a landing page — it forwards to the app. A signed-in
 * visitor lands on the Dashboard; an anonymous one is bounced to /login first
 * (the proxy gate on a cookie-less request, then the (app) layout's verified
 * getSession() as the real boundary). If the product needs a public marketing
 * page here, update the proxy's public-route policy too; replacing this file
 * alone is not enough.
 */
export default function Page() {
  redirect('/dashboard')
}
