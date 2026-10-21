'use client'

// GOOD: the client imports a pure module for value, and a `'use server'` action
// (an RPC boundary) — never reaching the `server-only` module behind the action.
import { value } from './pure.ts'
import { doWork } from './action.ts'

export const shown = value
export const work = doWork
