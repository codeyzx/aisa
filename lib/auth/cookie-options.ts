/**
 * Shared safety baseline for auth cookies. Cookie names, lifetimes, and deletion
 * stay at their mutation sites because they carry different semantics.
 */
export const SECURE_COOKIE_ATTRIBUTES = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
} as const
