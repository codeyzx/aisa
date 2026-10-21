import type { ActionErrorCode } from './action.contract'

/**
 * An EXPECTED, handled failure a repo raises when a write cannot proceed for a
 * reason the CALLER can act on — a missing row, a lost precondition — as opposed
 * to a bug. Each subclass carries the closed `ActionErrorCode` it maps to, so
 * `runAction` returns that code AND does NOT log it as an unknown internal error
 * (the noise it would otherwise bury a real bug under).
 *
 * Deliberately NOT a broad hierarchy: there is one subclass per real throw site,
 * added when a repo actually needs it — never a speculative taxonomy. A repo
 * throws these; nothing constructs them across the RSC boundary, so the classes
 * stay here in the pure data layer rather than in `*.contract.ts` (a class is not
 * a serializable contract value).
 *
 * The `message` is for the SERVER LOG only — the client is given
 * `ACTION_ERROR_MESSAGE[code]`, never this string — so it can name the entity
 * freely (`'asset not found'`) to help whoever reads the log.
 */
export abstract class DomainError extends Error {
  abstract readonly code: ActionErrorCode
}

/** A named resource does not exist. Maps to `not_found`. */
export class NotFoundError extends DomainError {
  readonly code = 'not_found'
}

/**
 * A write lost a precondition it read inside its own transaction — an optimistic
 * concurrency conflict (a concurrent edit moved the ground under it). Maps to
 * `conflict`: the caller reloads and retries, it is not a bad request.
 */
export class ConflictError extends DomainError {
  readonly code = 'conflict'
}

/**
 * The caller holds the capability but this particular operation is refused by
 * policy — an impersonated session attempting an account mutation. Maps to
 * `forbidden`, the same answer the capability gate would have given, because the
 * caller's remedy is identical: stop, and act as yourself.
 */
export class ForbiddenError extends DomainError {
  readonly code = 'forbidden'
}

/**
 * Another operation holds the account-mutation lease. Maps to
 * `lease_unavailable`: nothing was attempted and nothing changed, so the remedy
 * is to retry the SAME request shortly — not to reload, and not to give up.
 */
export class LeaseUnavailableError extends DomainError {
  readonly code = 'lease_unavailable'
}

/**
 * The mutation would remove administrator access the application must keep — the
 * actor's own (self-demotion / self-disable) or the last one standing. Maps to
 * `admin_lockout`. One class for all three because the refusal is one rule:
 * a live administrator must remain, and an administrator may not remove
 * themselves.
 */
export class AdminLockoutError extends DomainError {
  readonly code = 'admin_lockout'
}

/**
 * The external mutation LANDED but a required follow-up did not — session
 * revocation, or settling the durable audit event. Maps to
 * `reconciliation_required`.
 *
 * This is the one DomainError that must not be read as "it failed". Retrying is
 * the wrong move (the change is already applied) and so is reporting success
 * (the sessions it was meant to end may still be alive). The throw site logs the
 * underlying cause before raising this, because `runAction` deliberately does not
 * log a typed domain failure and this one always warrants a line.
 */
export class ReconciliationRequiredError extends DomainError {
  readonly code = 'reconciliation_required'
}

/**
 * A per-uid COST BUDGET is spent for this window (`lib/http`'s `rateLimit`).
 * Maps to `resource_exhausted`.
 *
 * The only DomainError not thrown by a repo, and that is deliberate rather than
 * a stretch of the class: this is still "an expected, handled failure the CALLER
 * can act on", which is what the abstract base models — the actor is a limiter
 * instead of a Firestore write. Throwing is the only way an action body can pick
 * a failure code at all, since `runAction`'s `fn` resolves to `T` and the
 * envelope is built for it.
 *
 * The `message` is server-log-only (the client gets
 * `ACTION_ERROR_MESSAGE.resource_exhausted`), so a throw site should put the
 * seconds-until-reset in it — the action envelope has no `retryAfter` field the
 * way the HTTP one does, and an operator reading the log wants the number.
 */
export class RateLimitedError extends DomainError {
  readonly code = 'resource_exhausted'
}

/**
 * Narrow an absent lookup to the value, or throw `NotFoundError`.
 *
 * The same three lines were spelled at every read that must not proceed on a
 * miss — inside a transaction after `tx.get`, and in an action after a cached
 * read. Sharing them is worth it not to save the typing but because the LOOKUP
 * CONVENTION is shared: absence is `null`/`undefined` and a missing row is a
 * `not_found` the caller can act on, never an internal error. A site that
 * open-codes the check is free to pick a different answer.
 *
 * `message` is server-log-only (`runAction` returns the code), so name the
 * entity plainly — `'asset not found'` — for whoever reads the log.
 */
export function requireFound<T>(
  value: T | null | undefined,
  message: string,
): T {
  if (value === null || value === undefined) throw new NotFoundError(message)
  return value
}
