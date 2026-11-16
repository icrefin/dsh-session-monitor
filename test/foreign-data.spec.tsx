// @vitest-environment jsdom
/**
 * Foreign data at the page's own level.
 *
 * The monitor reads three projections it does not own (`sessions.list`,
 * `uiSession.sessionStatus`, `workspaces.list`) plus its local preferences. The
 * shell retires a `main` entry whose render throws, so a single unreadable value
 * above the cards used to cost the whole centre column. `PanelErrorBoundary`
 * contains that, but a contained crash is still a blank monitor: the page must
 * *draw*.
 *
 * This suite is the regression guarantee. It mounts the real panel — with the
 * toolbar's new-session control included — against a matrix of single-field
 * mutations of every foreign value the page reads, and asserts the page-level
 * fallback never appears. The two paths that used to reach it:
 *
 * - a catalog snapshot whose `byId` is `null` (the page indexed it);
 * - a catalog row with no usable title whose `cwd` is not a string (the title
 *   fallback called `.split()` on it);
 * - a `null` row for an id this page spawned (the prune effect read `.blank`).
 *
 * @module dsh-session-monitor/test/foreign-data
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import type { ReactElement } from 'react'
import { PanelErrorBoundary } from '../src/client/Boundaries.tsx'
import { MonitorPanel } from '../src/client/MonitorPanel.tsx'
import { MonitorStore, STORAGE_KEY } from '../src/client/store.ts'
import { en, type MonitorKey } from '../src/client/locales.ts'
import type { SessionListSnapshotLike } from '../src/client/types.ts'

declare global {
  /** React asks the host to flag an act-enabled test environment. */
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/** Translate one key through the real English dictionary. */
function t(key: MonitorKey, params?: Record<string, string | number>): string {
  const template = en[key]
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/** One controllable projection, exactly the `getSnapshot`/`subscribe` shape. */
class Source<T> {
  #value: T
  readonly #listeners = new Set<() => void>()

  constructor(value: T) {
    this.#value = value
  }

  getSnapshot = (): T => this.#value

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }
}

/** In-memory storage for the preference store. */
class FakeStorage {
  readonly values = new Map<string, string>()
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

/** Values a foreign producer can plausibly deliver for one field. */
const HOSTILE: readonly unknown[] = [
  undefined,
  null,
  0,
  1,
  -1,
  Number.NaN,
  Infinity,
  '',
  'x',
  {},
  [],
  [1, 2],
  { length: 2 },
  true,
  false,
  { en: 'localized' },
  () => {},
]

let host: HTMLElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

/** Flush effects and the retention promise chain. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** The readable shape every mutation starts from. */
interface Fixture {
  readonly list?: Record<string, unknown>
  readonly row?: Record<string, unknown>
  readonly statusRow?: Record<string, unknown>
  readonly workspaceRow?: Record<string, unknown>
  readonly prefs?: Record<string, unknown>
  /** Render the toolbar's new-session control, which reads the Workspace rows. */
  readonly withNewSession?: boolean
}

/** One healthy session and one healthy Workspace. */
function fixture(): {
  row: Record<string, unknown>
  statusRow: Record<string, unknown>
  workspaceRow: Record<string, unknown>
} {
  return {
    row: {
      id: 'session-1',
      title: 'One',
      displayTitle: 'One',
      cwd: '/work/dir',
      running: false,
      blank: false,
      updatedAt: 1_000,
    },
    statusRow: { running: false },
    workspaceRow: { workspaceId: 'w1', title: 'Workspace', path: '/work', sessionIds: ['session-1'] },
  }
}

/** Mount the registered panel over one mutated fixture. */
async function mount(mutation: Fixture): Promise<void> {
  const base = fixture()
  const list = {
    ids: ['session-1'],
    byId: { 'session-1': { ...base.row, ...(mutation.row ?? {}) } },
    phase: 'ready',
    ...(mutation.list ?? {}),
  }
  const statuses = new Map([['session-1', { ...base.statusRow, ...(mutation.statusRow ?? {}) }]])
  const workspacesSnapshot = {
    items: [{ ...base.workspaceRow, ...(mutation.workspaceRow ?? {}) }],
  }
  const storage = new FakeStorage()
  if (mutation.prefs !== undefined) {
    storage.values.set(STORAGE_KEY, JSON.stringify(mutation.prefs))
  }
  const sessions = {
    list: new Source<SessionListSnapshotLike>(list as unknown as SessionListSnapshotLike),
    retain: (id: string) => ({
      sessionId: id,
      ready: Promise.resolve({
        session: { sessionId: id },
        eventSource: new Source({ entries: [] }),
      }),
      release: vi.fn(),
    }),
  }
  const newSession = mutation.withNewSession
    ? {
        start: async () => 'session-2',
        pickFolder: async () => null,
        createWorkspace: async () => ({ workspaceId: 'w2', path: '/other', title: 'Other' }),
      }
    : undefined

  act(() =>
    root.render(
      (
        <MonitorPanel
          t={t}
          store={new MonitorStore(storage)}
          sessions={sessions as never}
          uiSession={{ sessionStatus: new Source(statuses as never) } as never}
          workspaces={{ list: new Source(workspacesSnapshot as never) } as never}
          newSession={newSession as never}
        />
      ) as ReactElement,
    ),
  )
  await flush()
}

/** Whether the page-level fallback is on screen. */
function pageFailed(): boolean {
  return host.querySelector('[data-dsm-panel-error="true"]') !== null
}

/** Remount a fresh root between mutations. */
async function remount(): Promise<void> {
  act(() => root.unmount())
  root = createRoot(host)
}

describe('foreign catalog data never blanks the page', () => {
  it('draws for every single-field mutation of the values the page reads', async () => {
    const holes: string[] = []
    /** Every mutation slot, with the fixture it writes to. */
    const slots: readonly {
      readonly where: string
      readonly write: (value: unknown) => Fixture
    }[] = [
      { where: 'list.byId', write: (value) => ({ list: { byId: value } }) },
      { where: 'list.ids', write: (value) => ({ list: { ids: value } }) },
      { where: 'list.phase', write: (value) => ({ list: { phase: value } }) },
      { where: 'row.id', write: (value) => ({ row: { id: value } }) },
      { where: 'row.title', write: (value) => ({ row: { title: value } }) },
      { where: 'row.displayTitle', write: (value) => ({ row: { displayTitle: value } }) },
      {
        where: 'row.title+displayTitle+cwd',
        write: (value) => ({ row: { title: value, displayTitle: value, cwd: value } }),
      },
      { where: 'row.cwd', write: (value) => ({ row: { cwd: value } }) },
      { where: 'row.updatedAt', write: (value) => ({ row: { updatedAt: value } }) },
      { where: 'row.blank', write: (value) => ({ row: { blank: value } }) },
      { where: 'row.running', write: (value) => ({ row: { running: value } }) },
      { where: 'row.origin', write: (value) => ({ row: { origin: value } }) },
      { where: 'row.parentId', write: (value) => ({ row: { parentId: value } }) },
      { where: 'status.running', write: (value) => ({ statusRow: { running: value } }) },
      { where: 'status.completionUnread', write: (value) => ({ statusRow: { completionUnread: value } }) },
      { where: 'status.pendingInteraction', write: (value) => ({ statusRow: { pendingInteraction: value } }) },
      {
        where: 'workspace.workspaceId',
        write: (value) => ({ workspaceRow: { workspaceId: value }, withNewSession: true }),
      },
      {
        where: 'workspace.title',
        write: (value) => ({ workspaceRow: { title: value }, withNewSession: true }),
      },
      {
        where: 'workspace.path',
        write: (value) => ({ workspaceRow: { path: value }, withNewSession: true }),
      },
      {
        where: 'workspace.sessionIds',
        write: (value) => ({ workspaceRow: { sessionIds: value } }),
      },
      { where: 'prefs.order', write: (value) => ({ prefs: { order: value } }) },
      { where: 'prefs.hidden', write: (value) => ({ prefs: { hidden: value } }) },
      { where: 'prefs.spawned', write: (value) => ({ prefs: { spawned: value } }) },
      { where: 'prefs.acknowledged', write: (value) => ({ prefs: { acknowledged: value } }) },
      { where: 'prefs.maxCards', write: (value) => ({ prefs: { maxCards: value } }) },
      { where: 'prefs.columns', write: (value) => ({ prefs: { columns: value } }) },
      { where: 'prefs.newWorkspaceId', write: (value) => ({ prefs: { newWorkspaceId: value } }) },
    ]

    for (const slot of slots) {
      for (const value of HOSTILE) {
        await mount(slot.write(value))
        if (pageFailed()) {
          holes.push(`${slot.where} = ${typeof value === 'function' ? 'function' : JSON.stringify(value) ?? String(value)}`)
        }
        await remount()
      }
    }

    expect(holes).toEqual([])
  }, 120_000)

  it('draws when the catalog snapshot itself is a non-object', async () => {
    const sessions = { list: new Source({ ids: [], byId: null, phase: 'ready' }) }
    act(() =>
      root.render(
        (
          <MonitorPanel
            t={t}
            store={new MonitorStore(new FakeStorage())}
            sessions={sessions as never}
            uiSession={undefined}
          />
        ) as ReactElement,
      ),
    )
    await flush()
    expect(pageFailed()).toBe(false)
    expect(host.querySelector('.dsm-page')).not.toBeNull()
  })

  it('draws when a spawned id still points at a null catalog row', async () => {
    // The prune effect used to read `.blank` off the row: `null` threw from the
    // effect, which the page boundary contained as a blank monitor.
    const storage = new FakeStorage()
    storage.values.set(STORAGE_KEY, JSON.stringify({ spawned: ['session-1'] }))
    const sessions = {
      list: new Source({ ids: ['session-1'], byId: { 'session-1': null }, phase: 'ready' }),
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({ session: { sessionId: id }, eventSource: new Source({ entries: [] }) }),
        release: vi.fn(),
      }),
    }
    act(() =>
      root.render(
        (
          <MonitorPanel
            t={t}
            store={new MonitorStore(storage)}
            sessions={sessions as never}
            uiSession={undefined}
          />
        ) as ReactElement,
      ),
    )
    await flush()
    expect(pageFailed()).toBe(false)
  })

  it('titles a row that has no usable title and a non-string cwd by its id', async () => {
    const sessions = {
      list: new Source({
        ids: ['session-abc12345'],
        byId: { 'session-abc12345': { id: 'session-abc12345', cwd: null, updatedAt: 1 } },
        phase: 'ready',
      }),
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({ session: { sessionId: id }, eventSource: new Source({ entries: [] }) }),
        release: vi.fn(),
      }),
    }
    act(() =>
      root.render(
        (
          <MonitorPanel
            t={t}
            store={new MonitorStore(new FakeStorage())}
            sessions={sessions as never}
            uiSession={undefined}
          />
        ) as ReactElement,
      ),
    )
    await flush()
    expect(pageFailed()).toBe(false)
    expect(host.textContent).toContain('session-')
  })
})

describe('the fallback names the failure', () => {
  it('shows the thrown message so a recurrence is diagnosable without DevTools', async () => {
    function Broken(): ReactElement {
      throw new Error('catalog row exploded')
    }
    act(() =>
      root.render(
        (
          <PanelErrorBoundary t={t}>
            <Broken />
          </PanelErrorBoundary>
        ) as ReactElement,
      ),
    )
    await flush()
    const panel = host.querySelector('[data-dsm-panel-error="true"]')
    expect(panel).not.toBeNull()
    expect(panel?.getAttribute('data-dsm-panel-error-reason')).toBe('catalog row exploded')
    expect(host.textContent).toContain('catalog row exploded')
    expect(host.textContent).toContain('This page could not be drawn')
  })
})