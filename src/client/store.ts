/**
 * The monitor's own local preferences: which sessions the user removed from the
 * grid, and how many cards it shows.
 *
 * These are presentation choices about this browser's monitor, not facts about
 * a Session, so they live in `localStorage` and never in the harness. A removed
 * session is only hidden from this panel — it keeps running, keeps its history,
 * and stays in the sidebar.
 *
 * @module dsh-session-monitor/client/store
 */

import { clampMaxCards, DEFAULT_MAX_CARDS, MAX_COLUMNS, ORDER_LIMIT } from './model.ts'

/** Storage key of the monitor's preferences. */
export const STORAGE_KEY = 'dsh-session-monitor:prefs'

/** Most acknowledgements kept, oldest dropped: a reminder log, not a history. */
const ACKNOWLEDGED_LIMIT = 200

/** Most created-but-still-blank sessions kept as cards. */
const SPAWNED_LIMIT = 32

/** One immutable view of the preferences. */
export interface MonitorPrefs {
  /** Session ids removed from the grid. */
  readonly hidden: ReadonlySet<string>
  /**
   * Session ids whose finished run this browser has already looked at.
   *
   * The green completion mark stays until the user clicks the card; this set is
   * what records that click across remounts. It is forgotten as soon as the
   * Session reports no unread completion (a new run started, or the Session was
   * opened elsewhere), so the mark returns for the next run.
   */
  readonly acknowledged: ReadonlySet<string>
  /**
   * Session ids this panel created and still shows while they are blank.
   *
   * A Session with no turn yet is normally not a card, but the one the user
   * just created here is exactly the card they asked for. Once its first turn
   * gives it a title, the id is forgotten and the card stays as an ordinary one.
   */
  readonly spawned: ReadonlySet<string>
  /**
   * The grid's frozen display order: session ids in the position they hold.
   *
   * A card's position is a promise the monitor keeps: once a session is placed
   * it stays in that cell until it is the oldest card and a newer session takes
   * its slot. Storing the order here — rather than in the mounted page — is what
   * keeps that promise across a panel switch and an app restart, and it means
   * activity never re-ranks the grid.
   */
  readonly order: readonly string[]
  /** Card budget for idle and running sessions. */
  readonly maxCards: number
  /** Cards per row; `0` lets the grid fill the column automatically. */
  readonly columns: number
  /**
   * The Workspace the toolbar's new-session control last started in.
   *
   * It is a remembered choice, not a fact: a Workspace that no longer exists is
   * ignored when the default is resolved, and the next choice replaces it.
   */
  readonly newWorkspaceId: string | undefined
}

/** Where the preferences are persisted; injectable so tests need no browser. */
export interface PrefsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** The observable face the page subscribes to. */
export interface MonitorPrefsSource {
  getSnapshot(): MonitorPrefs
  subscribe(listener: () => void): () => void
}

/**
 * Parse persisted preferences, tolerating anything.
 * @param raw - the stored JSON text.
 * @returns the parsed preferences, or the defaults.
 */
export function parsePrefs(raw: string | null): MonitorPrefs {
  const defaults: MonitorPrefs = {
    hidden: new Set(),
    acknowledged: new Set(),
    spawned: new Set(),
    order: [],
    maxCards: DEFAULT_MAX_CARDS,
    columns: 0,
    newWorkspaceId: undefined,
  }
  if (raw === null || raw.trim() === '') return defaults
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return defaults
    const record = parsed as Record<string, unknown>
    const hidden = new Set<string>()
    if (Array.isArray(record.hidden)) {
      for (const id of record.hidden) if (typeof id === 'string' && id !== '') hidden.add(id)
    }
    const acknowledged = new Set<string>()
    if (Array.isArray(record.acknowledged)) {
      for (const id of record.acknowledged) if (typeof id === 'string' && id !== '') acknowledged.add(id)
    }
    const spawned = new Set<string>()
    if (Array.isArray(record.spawned)) {
      for (const id of record.spawned) {
        if (typeof id === 'string' && id !== '') spawned.add(id)
        if (spawned.size >= SPAWNED_LIMIT) break
      }
    }
    const max = typeof record.maxCards === 'number' && Number.isFinite(record.maxCards) ? record.maxCards : DEFAULT_MAX_CARDS
    const columns = typeof record.columns === 'number' && Number.isFinite(record.columns) ? Math.trunc(record.columns) : 0
    const order: string[] = []
    if (Array.isArray(record.order)) {
      for (const id of record.order) {
        if (typeof id !== 'string' || id === '' || order.includes(id)) continue
        order.push(id)
        if (order.length >= ORDER_LIMIT) break
      }
    }
    return {
      hidden,
      acknowledged,
      spawned,
      order,
      maxCards: clampMaxCards(max),
      columns: Math.max(0, Math.min(MAX_COLUMNS, columns)),
      newWorkspaceId:
        typeof record.newWorkspaceId === 'string' && record.newWorkspaceId !== ''
          ? record.newWorkspaceId
          : undefined,
    }
  } catch {
    return defaults
  }
}

/**
 * Resolve the browser's storage without assuming it is reachable.
 * @returns the storage, or `undefined` when unavailable.
 */
function browserStorage(): PrefsStorage | undefined {
  try {
    const storage = globalThis.localStorage
    if (storage === undefined || storage === null) return undefined
    return storage
  } catch {
    return undefined
  }
}

/**
 * Whether two orders already describe the same positions.
 * @param left - the stored order.
 * @param right - the reconciled order.
 * @returns true when they are the same sequence of ids.
 */
function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

/**
 * The monitor's preference store.
 *
 * `getSnapshot` must stay reference-stable between changes: the page feeds it to
 * `useSyncExternalStore`, and a fresh object on every read is an infinite render
 * loop.
 */
export class MonitorStore implements MonitorPrefsSource {
  readonly #storage: PrefsStorage | undefined
  readonly #listeners = new Set<() => void>()
  #snapshot: MonitorPrefs

  /**
   * @param storage - persistence target; the browser's `localStorage` when omitted.
   */
  constructor(storage: PrefsStorage | undefined = browserStorage()) {
    this.#storage = storage
    let raw: string | null = null
    try {
      raw = storage?.getItem(STORAGE_KEY) ?? null
    } catch {
      raw = null
    }
    this.#snapshot = parsePrefs(raw)
  }

  /** @returns the current immutable preferences. */
  getSnapshot(): MonitorPrefs {
    return this.#snapshot
  }

  /**
   * Watch for preference changes.
   * @param listener - invalidation callback.
   * @returns the unsubscribe callback.
   */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /**
   * Remove one session from the grid.
   * @param sessionId - session to hide.
   */
  hide(sessionId: string): void {
    if (this.#snapshot.hidden.has(sessionId)) return
    const hidden = new Set(this.#snapshot.hidden)
    hidden.add(sessionId)
    this.#commit({ ...this.#snapshot, hidden })
  }

  /**
   * Bring one removed session back.
   * @param sessionId - session to show again.
   */
  restore(sessionId: string): void {
    if (!this.#snapshot.hidden.has(sessionId)) return
    const hidden = new Set(this.#snapshot.hidden)
    hidden.delete(sessionId)
    this.#commit({ ...this.#snapshot, hidden })
  }

  /**
   * Remember that the user looked at one finished session.
   *
   * The completion mark is a reminder, not a log: once the card is clicked the
   * dot goes grey, and the next run clears this record again.
   *
   * @param sessionId - session whose completion was seen.
   */
  acknowledge(sessionId: string): void {
    if (sessionId === '' || this.#snapshot.acknowledged.has(sessionId)) return
    const acknowledged = new Set(this.#snapshot.acknowledged)
    acknowledged.add(sessionId)
    // Bounded, oldest-first: this set only exists for reminders that are never
    // acknowledged, and localStorage must not grow with every session ever run.
    while (acknowledged.size > ACKNOWLEDGED_LIMIT) {
      const oldest = acknowledged.values().next().value
      if (oldest === undefined) break
      acknowledged.delete(oldest)
    }
    this.#commit({ ...this.#snapshot, acknowledged })
  }

  /**
   * Forget one acknowledgement, because its completion is no longer unread.
   * @param sessionId - session whose reminder is over.
   */
  clearAcknowledgement(sessionId: string): void {
    if (!this.#snapshot.acknowledged.has(sessionId)) return
    const acknowledged = new Set(this.#snapshot.acknowledged)
    acknowledged.delete(sessionId)
    this.#commit({ ...this.#snapshot, acknowledged })
  }

  /** Bring every removed session back. */
  restoreAll(): void {
    if (this.#snapshot.hidden.size === 0) return
    this.#commit({ ...this.#snapshot, hidden: new Set() })
  }

  /**
   * Replace the grid's frozen display order.
   *
   * Called by the page after every reconcile; an identical order is a no-op, so
   * a render that changed only card content never touches storage or notifies a
   * listener.
   *
   * @param order - ids in the position they now hold.
   */
  setOrder(order: readonly string[]): void {
    const next: string[] = []
    for (const id of order) {
      if (typeof id !== 'string' || id === '' || next.includes(id)) continue
      next.push(id)
      if (next.length >= ORDER_LIMIT) break
    }
    if (sameOrder(this.#snapshot.order, next)) return
    this.#commit({ ...this.#snapshot, order: next })
  }

  /**
   * Change how many ordinary cards the grid shows.
   * @param maxCards - requested budget; clamped to the supported range.
   */
  setMaxCards(maxCards: number): void {
    const next = clampMaxCards(maxCards)
    if (next === this.#snapshot.maxCards) return
    this.#commit({ ...this.#snapshot, maxCards: next })
  }

  /**
   * Choose how many cards one row holds, or `0` for automatic filling.
   * @param columns - requested count; clamped to the supported range.
   */
  setColumns(columns: number): void {
    const next = Math.max(0, Math.min(MAX_COLUMNS, Math.trunc(columns) || 0))
    if (next === this.#snapshot.columns) return
    this.#commit({ ...this.#snapshot, columns: next })
  }

  /**
   * Remember the Workspace the new-session control starts in.
   * @param workspaceId - chosen Workspace, or `undefined` to forget it.
   */
  setNewWorkspace(workspaceId: string | undefined): void {
    const next = workspaceId === '' ? undefined : workspaceId
    if (next === this.#snapshot.newWorkspaceId) return
    this.#commit({ ...this.#snapshot, newWorkspaceId: next })
  }

  /**
   * Keep the card of a Session this panel just created, while it stays blank.
   * @param sessionId - the Session the Host created or reused.
   */
  markSpawned(sessionId: string): void {
    if (sessionId === '' || this.#snapshot.spawned.has(sessionId)) return
    const spawned = new Set(this.#snapshot.spawned)
    spawned.add(sessionId)
    // Bounded, oldest-first: a blank Session that never started a turn must not
    // grow this browser's preferences forever.
    while (spawned.size > SPAWNED_LIMIT) {
      const oldest = spawned.values().next().value
      if (oldest === undefined) break
      spawned.delete(oldest)
    }
    this.#commit({ ...this.#snapshot, spawned })
  }

  /**
   * Stop treating one Session as a blank card.
   * @param sessionId - the Session whose first turn started, or which vanished.
   */
  forgetSpawned(sessionId: string): void {
    if (!this.#snapshot.spawned.has(sessionId)) return
    const spawned = new Set(this.#snapshot.spawned)
    spawned.delete(sessionId)
    this.#commit({ ...this.#snapshot, spawned })
  }

  /**
   * Publish one new snapshot and persist it.
   * @param next - the new preferences.
   */
  #commit(next: MonitorPrefs): void {
    this.#snapshot = next
    try {
      this.#storage?.setItem(
        STORAGE_KEY,
        JSON.stringify({
          hidden: [...next.hidden],
          acknowledged: [...next.acknowledged],
          spawned: [...next.spawned],
          order: next.order,
          maxCards: next.maxCards,
          columns: next.columns,
          newWorkspaceId: next.newWorkspaceId,
        }),
      )
    } catch {
      // A full or blocked storage costs persistence, not the panel.
    }
    for (const listener of this.#listeners) {
      try {
        listener()
      } catch (error) {
        console.warn('[dsh-session-monitor] a preference listener threw', error)
      }
    }
  }
}