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
import { DEFAULT_MAX_CARDS, MAX_CARDS_LIMIT, MAX_COLUMNS, ORDER_LIMIT } from '../src/client/model.ts'

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
      expect(prefs.acknowledged.size).toBe(0)
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

  it('reads the created-session ids and drops unusable ones', () => {
    expect([...parsePrefs('{"spawned":["a","",3,"b"]}').spawned]).toEqual(['a', 'b'])
    expect(parsePrefs('{}').spawned.size).toBe(0)
    // The set is bounded on read, so a corrupt payload cannot grow it forever.
    const many = JSON.stringify({ spawned: Array.from({ length: 80 }, (_, index) => `s${index}`) })
    expect(parsePrefs(many).spawned.size).toBe(32)
  })

  it('reads the frozen order and drops unusable or duplicate ids', () => {
    expect(parsePrefs('{"order":["b","",3,"a","b"]}').order).toEqual(['b', 'a'])
    expect(parsePrefs('{}').order).toEqual([])
    // A corrupt payload cannot grow the stored order without bound.
    const many = JSON.stringify({ order: Array.from({ length: ORDER_LIMIT + 20 }, (_, index) => `s${index}`) })
    expect(parsePrefs(many).order).toHaveLength(ORDER_LIMIT)
  })

  it('reads the remembered new-session Workspace and drops an empty one', () => {
    expect(parsePrefs('{"newWorkspaceId":"ws-1"}').newWorkspaceId).toBe('ws-1')
    expect(parsePrefs('{"newWorkspaceId":""}').newWorkspaceId).toBeUndefined()
    expect(parsePrefs('{"newWorkspaceId":3}').newWorkspaceId).toBeUndefined()
    expect(parsePrefs('{}').newWorkspaceId).toBeUndefined()
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
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      hidden: ['session-1'],
      acknowledged: [],
      spawned: [],
      order: [],
      maxCards: DEFAULT_MAX_CARDS,
      columns: 0,
    })

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

  it('keeps a created blank session as a card until its first turn', () => {
    const storage = new FakeStorage()
    const store = new MonitorStore(storage)
    store.markSpawned('session-new')
    expect(store.getSnapshot().spawned.has('session-new')).toBe(true)
    // One write per change; repeating a mark is not a change.
    expect(storage.writes).toBe(1)
    store.markSpawned('session-new')
    expect(storage.writes).toBe(1)
    expect(new MonitorStore(storage).getSnapshot().spawned.has('session-new')).toBe(true)

    store.forgetSpawned('session-new')
    expect(store.getSnapshot().spawned.size).toBe(0)
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}').spawned).toEqual([])
    // An empty id is never remembered.
    store.markSpawned('')
    expect(storage.writes).toBe(2)
  })

  it('remembers the new-session Workspace across a reload', () => {
    const storage = new FakeStorage()
    const store = new MonitorStore(storage)
    store.setNewWorkspace('ws-2')
    expect(store.getSnapshot().newWorkspaceId).toBe('ws-2')
    // One write for one change: a repeated choice is not a change.
    expect(storage.writes).toBe(1)
    store.setNewWorkspace('ws-2')
    expect(storage.writes).toBe(1)
    expect(new MonitorStore(storage).getSnapshot().newWorkspaceId).toBe('ws-2')

    // Forgetting the choice is a change too, and writes no dangling id.
    store.setNewWorkspace(undefined)
    expect(store.getSnapshot().newWorkspaceId).toBeUndefined()
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}')).not.toHaveProperty('newWorkspaceId')
    store.setNewWorkspace('')
    expect(storage.writes).toBe(2)
  })

  it('remembers a clicked completion and forgets it when the next run starts', () => {
    const storage = new FakeStorage()
    const store = new MonitorStore(storage)
    store.acknowledge('session-1')
    expect(store.getSnapshot().acknowledged.has('session-1')).toBe(true)
    // The click survives a reload, so the green dot does not come back by itself.
    expect(new MonitorStore(storage).getSnapshot().acknowledged.has('session-1')).toBe(true)

    store.clearAcknowledgement('session-1')
    expect(store.getSnapshot().acknowledged.has('session-1')).toBe(false)
    expect(new MonitorStore(storage).getSnapshot().acknowledged.size).toBe(0)
  })

  it('ignores an empty id and stays quiet when a reminder is already cleared', () => {
    const storage = new FakeStorage()
    const store = new MonitorStore(storage)
    store.acknowledge('')
    store.clearAcknowledgement('missing')
    expect(storage.writes).toBe(0)
  })

  it('stores the frozen order so a remount resumes the same positions', () => {
    const storage = new FakeStorage()
    const store = new MonitorStore(storage)
    store.setOrder(['b', 'a'])
    expect(store.getSnapshot().order).toEqual(['b', 'a'])
    expect(storage.writes).toBe(1)
    // The page reconciles on every render; the same positions are not a change.
    store.setOrder(['b', 'a'])
    expect(storage.writes).toBe(1)
    // A different sequence is a change, and it survives a reload.
    store.setOrder(['a', 'b'])
    expect(storage.writes).toBe(2)
    expect(new MonitorStore(storage).getSnapshot().order).toEqual(['a', 'b'])
    // Unusable and duplicate ids never reach the order.
    store.setOrder(['a', '', 'a', 'c'])
    expect(store.getSnapshot().order).toEqual(['a', 'c'])
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