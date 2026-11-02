/**
 * The monitor's local preference store: removal, restore, budget, persistence.
 *
 * The store is fed a fake storage so these tests exercise the real code without
 * a browser — and cover the two properties the page depends on: a snapshot that
 * is reference-stable between changes (or `useSyncExternalStore` loops) and one
 * notification per change (or cards re-render twice).
 *
 * @module dsh-session-monitor/test/store
 */

import { describe, expect, it, vi } from 'vitest'
import { MonitorStore, STORAGE_KEY, parsePrefs } from '../src/client/store.ts'
import { DEFAULT_MAX_CARDS, MAX_CARDS_LIMIT, MAX_COLUMNS } from '../src/client/model.ts'

/** In-memory storage that records the last written value. */
class FakeStorage {
  readonly values = new Map<string, string>()
  writes = 0

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.writes += 1
    this.values.set(key, value)
  }
}

describe('parsePrefs', () => {
  it('returns the defaults for absent or unusable payloads', () => {
    for (const raw of [null, '', 'not json', '[]', '"text"', '{"hidden":"no"}']) {
      const prefs = parsePrefs(raw)
      expect(prefs.hidden.size).toBe(0)
      expect(prefs.maxCards).toBe(DEFAULT_MAX_CARDS)
      expect(prefs.columns).toBe(0)
    }
  })

  it('clamps the cards-per-row choice to Auto or 1..MAX_COLUMNS', () => {
    expect(parsePrefs('{"columns":3}').columns).toBe(3)
    expect(parsePrefs('{"columns":0}').columns).toBe(0)
    expect(parsePrefs('{"columns":99}').columns).toBe(MAX_COLUMNS)
    expect(parsePrefs('{"columns":-2}').columns).toBe(0)
    expect(parsePrefs('{"columns":"4"}').columns).toBe(0)
    expect(parsePrefs('{}').columns).toBe(0)
  })

  it('reads ids and clamps the card budget', () => {
    expect([...parsePrefs('{"hidden":["a","b",3,""],"maxCards":2}').hidden]).toEqual(['a', 'b'])
    expect(parsePrefs('{"maxCards":9999}').maxCards).toBe(MAX_CARDS_LIMIT)
    expect(parsePrefs('{"maxCards":-4}').maxCards).toBe(1)
    expect(parsePrefs('{"maxCards":"9"}').maxCards).toBe(DEFAULT_MAX_CARDS)
  })
})

describe('MonitorStore', () => {
  it('starts empty and keeps the snapshot identity until a change', () => {
    const store = new MonitorStore(new FakeStorage())
    const first = store.getSnapshot()
    expect(store.getSnapshot()).toBe(first)
    store.hide('a')
    const second = store.getSnapshot()
    expect(second).not.toBe(first)
    expect(store.getSnapshot()).toBe(second)
  })

  it('removes and restores a session, persisting the removal', () => {
    const storage = new FakeStorage()
    const store = new MonitorStore(storage)
    store.hide('session-1')
    expect(store.getSnapshot().hidden.has('session-1')).toBe(true)
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}')).toEqual({ hidden: ['session-1'], maxCards: DEFAULT_MAX_CARDS, columns: 0 })

    // A fresh store reads what the previous one wrote: removal survives a reload.
    const reloaded = new MonitorStore(storage)
    expect(reloaded.getSnapshot().hidden.has('session-1')).toBe(true)

    reloaded.restore('session-1')
    expect(reloaded.getSnapshot().hidden.size).toBe(0)
  })

  it('restores every removed session at once', () => {
    const store = new MonitorStore(new FakeStorage())
    store.hide('a')
    store.hide('b')
    expect(store.getSnapshot().hidden.size).toBe(2)
    store.restoreAll()
    expect(store.getSnapshot().hidden.size).toBe(0)
  })

  it('remembers the cards-per-row choice and restores it after a reload', () => {
    const storage = new FakeStorage()
    const store = new MonitorStore(storage)
    store.setColumns(4)
    expect(store.getSnapshot().columns).toBe(4)
    store.setColumns(99)
    expect(store.getSnapshot().columns).toBe(MAX_COLUMNS)
    store.setColumns(0)
    expect(store.getSnapshot().columns).toBe(0)
    store.setColumns(3)
    expect(new MonitorStore(storage).getSnapshot().columns).toBe(3)
  })

  it('does not write when the request changes nothing', () => {
    const storage = new FakeStorage()
    const store = new MonitorStore(storage)
    store.restoreAll()
    store.restore('unknown')
    store.setMaxCards(DEFAULT_MAX_CARDS)
    expect(storage.writes).toBe(0)
  })

  it('notifies one listener per change and survives a throwing listener', () => {
    const store = new MonitorStore(new FakeStorage())
    const good = vi.fn()
    store.subscribe(good)
    store.subscribe(() => {
      throw new Error('boom')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => store.hide('x')).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('accepts a missing storage without failing', () => {
    const store = new MonitorStore(undefined)
    expect(() => store.hide('a')).not.toThrow()
    expect(store.getSnapshot().hidden.has('a')).toBe(true)
  })
})