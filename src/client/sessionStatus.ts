/**
 * The optional Session-status projection, read without a required injection.
 *
 * `sessionStatus` is not a member of the `uiSession` service object: it is a
 * **nested Cordis service** registered under the dotted name
 * `uiSession.sessionStatus`. On the current runtime the context proxy enforces
 * that exact name against the reading fiber's `inject` list and throws
 * `cannot get property "uiSession.sessionStatus" without inject` otherwise —
 * and because the read happens while the page renders, that throw costs the
 * whole centre column.
 *
 * Two ways out exist: require the service in the static `inject` list, or read
 * it reflectively. This plugin takes the reflective path, for the same reason
 * it resolves `remote.permissionPresets` that way (see `remote.ts`): a
 * composition without the status projection must still mount the monitor, whose
 * cards then simply show no live state. The read happens when the page mounts,
 * after every client service has registered, so the ordering is not a problem.
 *
 * @module dsh-session-monitor/client/sessionStatus
 */

import type { ObservableSnapshotLike, SessionStatusLike, UiSessionServiceLike } from './types.ts'

/** The context surface this resolver needs: the unchecked reflective read. */
export interface SessionStatusContextLike {
  /** Reflective read that bypasses the context proxy's inject check. */
  get?(name: string): unknown
}

/**
 * Whether a value is an observable status table.
 *
 * A service instance satisfies this structurally; so does the plain
 * `{getSnapshot, subscribe}` fixture the tests use.
 *
 * @param value - candidate service value.
 * @returns true when it can be followed as an observable.
 */
function isStatusTable(value: unknown): value is ObservableSnapshotLike<ReadonlyMap<string, SessionStatusLike>> {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { getSnapshot?: unknown; subscribe?: unknown }
  return typeof candidate.getSnapshot === 'function' && typeof candidate.subscribe === 'function'
}

/**
 * Resolve the Session status projection the page should follow.
 *
 * @param ctx - client root context carrying the reflective read.
 * @returns the projection as the page sees it, or `undefined` when the
 * composition does not expose one.
 */
export function resolveSessionStatus(ctx: SessionStatusContextLike): UiSessionServiceLike | undefined {
  try {
    const table = ctx.get?.('uiSession.sessionStatus')
    return isStatusTable(table) ? { sessionStatus: table } : undefined
  } catch (error) {
    console.warn('[dsh-session-monitor] the Session status projection could not be read', error)
    return undefined
  }
}