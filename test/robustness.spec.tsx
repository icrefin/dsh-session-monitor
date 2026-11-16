// @vitest-environment jsdom
/**
 * What the panel does when a value surprises it.
 *
 * The shell isolates a slot entry with an error boundary that **retires** the
 * entry: one throw during render leaves an empty region for the rest of the
 * page's life, which a person experiences as "the monitor is blank until I
 * reload". Two things must therefore hold:
 *
 * 1. a Host value the page cannot draw is turned into readable text or ignored,
 *    never handed to React as an object;
 * 2. if something still throws, this plugin's own boundaries contain it and
 *    offer a remount — the shell's boundary must never see it.
 *
 * The first case that reached a person was an approval whose `displayReason` is
 * a locale map (`{ en, zh, … }`): every sandbox-escalation request carries one.
 *
 * @module dsh-session-monitor/test/robustness
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import type { ReactElement } from 'react'
import { CardErrorBoundary, PanelErrorBoundary } from '../src/client/Boundaries.tsx'
import { MonitorPanel } from '../src/client/MonitorPanel.tsx'
import { MonitorPage } from '../src/client/MonitorPage.tsx'
import { MonitorStore } from '../src/client/store.ts'
import { en, type MonitorKey } from '../src/client/locales.ts'
import type {
  EventEntryLike,
  PendingInteractionLike,
  ResolveTextLike,
  SessionListSnapshotLike,
  SessionStatusLike,
  SessionsServiceLike,
  UiSessionServiceLike,
} from '../src/client/types.ts'

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

  set(value: T): void {
    this.#value = value
    for (const listener of this.#listeners) listener()
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

/** Wrap durable events into a window. */
function windowOf(entries: readonly EventEntryLike[]): { entries: readonly EventEntryLike[] } {
  return { entries }
}

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

/** Render one element and wait for its cards' bindings. */
async function render(element: ReactElement): Promise<void> {
  act(() => root.render(element))
  await flush()
}

/** One approval carrier shaped like the Host's `PendingApproval`. */
function approval(displayReason: unknown, reason = 'escalate sandbox to workspace-write: mkdir out'): PendingInteractionLike {
  return {
    kind: 'approval',
    key: 'approval:session-1:call-1',
    sessionId: 'session-1',
    toolName: 'bash',
    reason,
    displayReason: displayReason as PendingInteractionLike['displayReason'],
    answerable: true,
    answer: vi.fn(async () => undefined),
  }
}

/** Build the page props for one session with a pending approval. */
function pageFor(interaction: PendingInteractionLike, resolveText?: ResolveTextLike): ReactElement {
  const list = new Source<SessionListSnapshotLike>({
    ids: ['session-1'],
    byId: {
      'session-1': { id: 'session-1', title: 'Escalation', running: false, blank: false, updatedAt: 1_000 },
    },
    phase: 'ready',
  })
  const statuses = new Source<ReadonlyMap<string, SessionStatusLike>>(
    new Map([['session-1', { running: false, pendingInteraction: interaction }]]),
  )
  const sessions: SessionsServiceLike = {
    list,
    retain: () => ({
      sessionId: 'session-1',
      ready: Promise.resolve({
        session: { sessionId: 'session-1', prompt: vi.fn(async () => ({ ok: true })) },
        eventSource: new Source(windowOf([])),
      }),
      release: vi.fn(),
    }),
  }
  const uiSession: UiSessionServiceLike = { sessionStatus: statuses }
  return (
    <MonitorPage
      t={t}
      store={new MonitorStore(new FakeStorage())}
      sessions={sessions}
      uiSession={uiSession}
      resolveText={resolveText}
    />
  )
}

describe('approval copy', () => {
  it('resolves a locale map before it reaches the page, so the panel keeps drawing', async () => {
    // The regression: this map used to be handed to React as a child, which
    // throws and retires the whole `main` entry until a reload.
    const map = { en: 'Escalate to workspace-write', zh: '把沙箱提升为工作区写入' }
    await render(pageFor(approval(map), (text) => text.zh ?? text.en ?? ''))

    expect(host.querySelector('[data-dsm-panel-error]')).toBeNull()
    expect(host.textContent).toContain('把沙箱提升为工作区写入')
    expect(host.textContent).not.toContain('[object Object]')
    expect(host.querySelector('.dsm-pending')).not.toBeNull()
  })

  it('falls back to the map’s English entry when no resolver is composed', async () => {
    const map = { en: 'Escalate to workspace-write', zh: '把沙箱提升为工作区写入' }
    await render(pageFor(approval(map)))

    expect(host.querySelector('[data-dsm-panel-error]')).toBeNull()
    expect(host.textContent).toContain('Escalate to workspace-write')
  })

  it('still renders a plain-string displayReason and the audit reason', async () => {
    await render(pageFor(approval('Escalate for one command')))
    expect(host.textContent).toContain('Escalate for one command')

    act(() => root.unmount())
    root = createRoot(host)
    await render(pageFor(approval(undefined, 'audit sentence only')))
    expect(host.textContent).toContain('audit sentence only')
  })

  it('ignores a displayReason that is neither a string nor a map', async () => {
    await render(pageFor(approval({ en: 42 }), (text) => text.en ?? ''))
    expect(host.querySelector('[data-dsm-panel-error]')).toBeNull()
    expect(host.querySelector('.dsm-pending')).not.toBeNull()
  })
})

describe('crash containment', () => {
  it('contains one failing card and keeps its neighbours', async () => {
    function Boom(): ReactElement {
      throw new Error('card exploded')
    }
    await render(
      <>
        <CardErrorBoundary t={t} title="Broken session">
          <Boom />
        </CardErrorBoundary>
        <CardErrorBoundary t={t} title="Healthy session">
          <div className="dsm-card">healthy body</div>
        </CardErrorBoundary>
      </>,
    )

    expect(host.querySelector('[data-dsm-card-error="true"]')).not.toBeNull()
    expect(host.textContent).toContain('Broken session')
    expect(host.textContent).toContain('This card could not be drawn')
    expect(host.textContent).toContain('healthy body')
  })

  it('contains a failing page and remounts it on Retry', async () => {
    let broken = true
    function Page(): ReactElement {
      if (broken) throw new Error('page exploded')
      return <div className="dsm-page">recovered</div>
    }
    await render(
      <PanelErrorBoundary t={t}>
        <Page />
      </PanelErrorBoundary>,
    )
    expect(host.querySelector('[data-dsm-panel-error="true"]')).not.toBeNull()
    expect(host.textContent).toContain('This page could not be drawn')

    broken = false
    const retry = [...host.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Try again',
    )
    expect(retry).toBeDefined()
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()
    expect(host.querySelector('[data-dsm-panel-error]')).toBeNull()
    expect(host.textContent).toContain('recovered')
  })

  it('keeps a crash inside the plugin, where the shell cannot retire the entry', async () => {
    // A store that cannot be read throws from `useSyncExternalStore` during the
    // page's own render — the case that used to reach the shell's boundary.
    const store = {
      getSnapshot: () => {
        throw new Error('prefs unavailable')
      },
      subscribe: () => () => {},
      setOrder: () => {},
      acknowledge: () => {},
      hide: () => {},
    } as unknown as MonitorStore
    const list = new Source<SessionListSnapshotLike>({ ids: [], byId: {}, phase: 'ready' })
    const sessions = { list } as unknown as SessionsServiceLike

    await expect(
      render(
        <MonitorPanel
          t={t}
          store={store}
          sessions={sessions}
          uiSession={undefined}
        />,
      ),
    ).resolves.toBeUndefined()
    expect(host.querySelector('[data-dsm-panel-error="true"]')).not.toBeNull()
  })
})

describe('malformed projections', () => {
  interface Case {
    readonly name: string
    readonly list?: unknown
    readonly statuses?: Map<string, unknown>
    readonly entries?: readonly unknown[]
    readonly permissionCatalog?: unknown
    readonly modelDirectory?: unknown
    readonly queue?: unknown
  }

  const cases: readonly Case[] = [
    { name: 'catalog ids is not an array', list: { ids: 42, byId: { 'session-1': { id: 'session-1' } }, phase: 'ready' } },
    { name: 'catalog row is null', list: { ids: ['session-1'], byId: { 'session-1': null }, phase: 'ready' } },
    { name: 'status row is null', statuses: new Map([['session-1', null]]) },
    { name: 'event window holds junk', entries: [null, {}, { type: 'event', event: { type: 'user/message', data: { content: 'x' } } }] },
    { name: 'permission option is null', permissionCatalog: { options: [null, { value: 7, name: 3 }] } },
    {
      name: 'model groups are junk',
      modelDirectory: {
        store: { getSnapshot: () => ({ status: 'ready', groups: [null, { id: 'p', models: 'nope' }] }), subscribe: () => () => {} },
        load: async () => ({}),
      },
    },
    { name: 'queued row is null', queue: { 'next-turn': [null, { id: 'q1', content: [null] }] } },
  ]

  for (const item of cases) {
    it(`survives: ${item.name}`, async () => {
      const list = new Source<SessionListSnapshotLike>(
        (item.list ?? {
          ids: ['session-1'],
          byId: { 'session-1': { id: 'session-1', title: 'One', updatedAt: 1_000 } },
          phase: 'ready',
        }) as SessionListSnapshotLike,
      )
      const statuses = new Source<ReadonlyMap<string, SessionStatusLike>>(
        (item.statuses ?? new Map()) as ReadonlyMap<string, SessionStatusLike>,
      )
      const sessions: SessionsServiceLike = {
        list,
        retain: () => ({
          sessionId: 'session-1',
          ready: Promise.resolve({
            session: {
              sessionId: 'session-1',
              projections: {
                faceOf: (key: string) => {
                  if (key === 'inbox' && item.queue !== undefined) return new Source(item.queue)
                  return undefined
                },
              },
            },
            eventSource: new Source(windowOf((item.entries ?? []) as EventEntryLike[])),
          }),
          release: vi.fn(),
        }),
      }
      const remote =
        item.permissionCatalog === undefined
          ? undefined
          : {
              permissionPresets: {
                catalog: async () => ({
                  ok: true,
                  value: item.permissionCatalog as never,
                }),
              },
              $on: () => () => {},
            }

      await expect(
        render(
          <MonitorPage
            t={t}
            store={new MonitorStore(new FakeStorage())}
            sessions={sessions}
            uiSession={{ sessionStatus: statuses }}
            remote={remote}
            modelDirectoryFor={
              item.modelDirectory === undefined ? undefined : () => item.modelDirectory as never
            }
          />,
        ),
      ).resolves.toBeUndefined()

      // The page is still the monitor page, not an empty region.
      expect(host.querySelector('.dsm-page')).not.toBeNull()
      expect(host.querySelector('[data-dsm-panel-error]')).toBeNull()
    })
  }

  it('survives a crashing card without losing the rest of the grid', async () => {
    // One card receives a model directory whose snapshot getter throws on a
    // later read; the page's card boundary must keep the other card mounted.
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1', 'session-2'],
      byId: {
        'session-1': { id: 'session-1', title: 'First', updatedAt: 2_000 },
        'session-2': { id: 'session-2', title: 'Second', updatedAt: 1_000 },
      },
      phase: 'ready',
    })
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: { sessionId: id },
          eventSource: new Source(windowOf([])),
        }),
        release: vi.fn(),
      }),
    }
    await render(
      <MonitorPage
        t={t}
        store={new MonitorStore(new FakeStorage())}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
      />,
    )
    expect([...host.querySelectorAll('.dsm-cardTitle')].map((node) => node.textContent)).toEqual([
      'First',
      'Second',
    ])
  })
})

describe('interaction drafts stay keyed', () => {
  it('ignores a null question and a null option inside a batch', async () => {
    const interaction: PendingInteractionLike = {
      kind: 'question',
      key: 'question:session-1:call-1',
      answerable: true,
      answer: vi.fn(async () => undefined),
      questions: [
        null as never,
        { id: 'q1', header: 'Deploy', question: 'Proceed?', options: [null as never, { label: 'Yes' }] },
      ],
    }
    await render(pageFor(interaction))
    expect(host.querySelector('.dsm-pending')).not.toBeNull()
    expect(host.textContent).toContain('Proceed?')
    expect(host.textContent).toContain('Yes')
  })
})

describe('the registered entry', () => {
  it('draws the whole page when nothing throws', async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1'],
      byId: { 'session-1': { id: 'session-1', title: 'Healthy', updatedAt: 1_000 } },
      phase: 'ready',
    })
    const sessions: SessionsServiceLike = {
      list,
      retain: () => ({
        sessionId: 'session-1',
        ready: Promise.resolve({
          session: { sessionId: 'session-1' },
          eventSource: new Source(windowOf([])),
        }),
        release: vi.fn(),
      }),
    }
    await render(
      <MonitorPanel
        t={t}
        store={new MonitorStore(new FakeStorage())}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
      />,
    )
    expect(host.querySelector('[data-dsm-panel-error]')).toBeNull()
    expect(host.querySelector('.dsm-page')).not.toBeNull()
    expect(host.textContent).toContain('Session Monitor')
    expect(host.textContent).toContain('Healthy')
  })
})
