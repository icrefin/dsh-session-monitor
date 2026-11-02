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

import { DEFAULT_MAX_CARDS, MAX_CARDS_LIMIT, MAX_COLUMNS } from './model.ts'

/** Storage key of the monitor's preferences. */
export const STORAGE_KEY = 'dsh-session-monitor:prefs'

/** One immutable view of the preferences. */
export interface MonitorPrefs {
  /** Session ids removed from the grid. */
  readonly hidden: ReadonlySet<string>
  /** Card budget for idle and running sessions. */
  readonly maxCards: number
  /** Cards per row; `0` lets the grid fill the column automatically. */
  readonly columns: number
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
  const defaults: MonitorPrefs = { hidden: new Set(), maxCards: DEFAULT_MAX_CARDS, columns: 0 }
  if (raw === null || raw.trim() === '') return defaults
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return defaults
    const record = parsed as Record<string, unknown>
    const hidden = new Set<string>()
    if (Array.isArray(record.hidden)) {
      for (const id of record.hidden) if (typeof id === 'string' && id !== '') hidden.add(id)
    }
    const max = typeof record.maxCards === 'number' && Number.isFinite(record.maxCards) ? Math.trunc(record.maxCards) : DEFAULT_MAX_CARDS
    const columns = typeof record.columns === 'number' && Number.isFinite(record.columns) ? Math.trunc(record.columns) : 0
    return {
      hidden,
      maxCards: Math.max(1, Math.min(MAX_CARDS_LIMIT, max || DEFAULT_MAX_CARDS)),
      columns: Math.max(0, Math.min(MAX_COLUMNS, columns)),
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

  /** Bring every removed session back. */
  restoreAll(): void {
    if (this.#snapshot.hidden.size === 0) return
    this.#commit({ ...this.#snapshot, hidden: new Set() })
  }

  /**
   * Change how many ordinary cards the grid shows.
   * @param maxCards - requested budget; clamped to the supported range.
   */
  setMaxCards(maxCards: number): void {
    const next = Math.max(1, Math.min(MAX_CARDS_LIMIT, Math.trunc(maxCards) || DEFAULT_MAX_CARDS))
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
   * Publish one new snapshot and persist it.
   * @param next - the new preferences.
   */
  #commit(next: MonitorPrefs): void {
    this.#snapshot = next
    try {
      this.#storage?.setItem(
        STORAGE_KEY,
        JSON.stringify({ hidden: [...next.hidden], maxCards: next.maxCards, columns: next.columns }),
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