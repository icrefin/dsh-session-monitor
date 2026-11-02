// @vitest-environment jsdom
/**
 * The monitor page, rendered for real against fake projections.
 *
 * Nothing here mocks React or the page: the component tree mounts, the card
 * retains its session through the same `ctx.sessions.retain` contract the
 * harness implements, follows a live event window, answers a pending question
 * through the carrier's own `answer()`, sends a prompt through the session's own
 * `prompt()`, and reacts to a removal. That is the behavioural claim a typecheck
 * and a bundle-shape test cannot make.
 *
 * The fake projections are shaped exactly like the harness ones (catalog
 * `ids`/`byId`, status `Map`, binding `eventSource`), so a field the real client
 * publishes but this fixture omits is a bug found here.
 *
 * @module dsh-session-monitor/test/page
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import type { ReactElement } from 'react'
import { MonitorPage } from '../src/client/MonitorPage.tsx'
import { MonitorStore } from '../src/client/store.ts'
import { en, type MonitorKey } from '../src/client/locales.ts'
import type {
  EventEntryLike,
  RemoteServiceLike,
  SessionListSnapshotLike,
  SessionStatusLike,
  SessionsServiceLike,
  UiSessionServiceLike,
  WorkspacesServiceLike,
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

/** A question carrier shaped like the shipped `PendingQuestion`. */
function questionCarrier(answer: (value: unknown) => Promise<unknown>) {
  return {
    kind: 'question',
    key: 'question:session-1:call-1',
    sessionId: 'session-1',
    callId: 'call-1',
    answerable: true,
    questions: [
      { id: 'q1', header: 'Deploy', question: 'Proceed?', options: [{ label: 'Yes' }, { label: 'No' }] },
    ],
    answer,
  }
}

let host: HTMLElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
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

/** Render the page and wait for the cards' bindings. */
async function renderPage(element: ReactElement): Promise<void> {
  act(() => root.render(element))
  await flush()
}

/** Click one button found by its visible text. */
async function clickByText(text: string): Promise<void> {
  const button = [...host.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === text)
  expect(button, `button "${text}" should exist`).toBeDefined()
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await flush()
}

/** Click the nth button carrying one aria-label (the queue rows share labels). */
async function clickNthByLabel(label: string, index: number): Promise<void> {
  const buttons = [...host.querySelectorAll('button')].filter(
    (candidate) => candidate.getAttribute('aria-label') === label,
  )
  expect(buttons[index], `button "${label}" #${index} should exist`).toBeDefined()
  await act(async () => {
    buttons[index]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await flush()
}

/** Set a textarea's value the way React's onChange expects. */
async function typeInto(textarea: HTMLTextAreaElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('MonitorPage', () => {
  it('renders one card per monitored session, newest activity first', async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-2', 'session-1'],
      byId: {
        'session-1': {
          id: 'session-1',
          title: 'Running session',
          running: true,
          blank: false,
          updatedAt: 1_000,
          cwd: '/work/one',
        },
        'session-2': {
          id: 'session-2',
          title: 'Idle session',
          running: false,
          blank: false,
          updatedAt: 5_000,
          cwd: '/work/two',
        },
      },
      phase: 'ready',
    })
    const statuses = new Source<ReadonlyMap<string, SessionStatusLike>>(new Map())
    const windows = new Map([
      [
        'session-1',
        [
          {
            type: 'event',
            event: {
              type: 'user/message',
              seq: 1,
              time: 10,
              data: { content: [{ type: 'text', text: 'hello from one' }], source: { kind: 'user' } },
            },
          },
        ],
      ],
      ['session-2', []],
    ])
    const releases = new Map<string, ReturnType<typeof vi.fn>>()
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => {
        const release = vi.fn()
        releases.set(id, release)
        return {
          sessionId: id,
          // `ready` resolves asynchronously, exactly as the real controller does.
          ready: Promise.resolve({
            session: { sessionId: id, prompt: vi.fn(async () => ({ ok: true })) },
            eventSource: new Source(windowOf(windows.get(id) ?? [])),
          }),
          release,
        }
      },
    }
    const uiSession: UiSessionServiceLike = { sessionStatus: statuses }
    const store = new MonitorStore(new FakeStorage())

    await renderPage(<MonitorPage t={t} store={store} sessions={sessions} uiSession={uiSession} />)

    const titles = [...host.querySelectorAll('.dsm-cardTitle')].map((node) => node.textContent)
    // session-1 is running, so it outranks the more-recent idle session-2.
    expect(titles).toEqual(['Running session', 'Idle session'])
    expect(host.textContent).toContain('hello from one')
    expect(host.textContent).toContain('2 shown')
    // Without the navigation service the title stays a plain heading.
    expect(host.querySelector('.dsm-cardOpen')).toBeNull()
    expect([...releases.keys()].sort()).toEqual(['session-1', 'session-2'])
    // Retention is held while the card is mounted, not released after opening.
    expect(releases.get('session-1')).not.toHaveBeenCalled()
    expect(releases.get('session-2')).not.toHaveBeenCalled()
  })

  it('opens a session when its card title is clicked', async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1'],
      byId: {
        'session-1': { id: 'session-1', title: 'Openable', running: false, blank: false, updatedAt: 1_000 },
      },
      phase: 'ready',
    })
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: { sessionId: id, prompt: vi.fn(async () => ({ ok: true })) },
          eventSource: new Source(windowOf([])),
        }),
        release: vi.fn(),
      }),
    }
    const openSession = vi.fn()
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
        openSession={openSession}
      />,
    )

    const title = host.querySelector<HTMLButtonElement>('.dsm-cardOpen')
    expect(title, 'the title should be a link when navigation exists').not.toBeNull()
    expect(title?.textContent).toBe('Openable')
    expect(title?.getAttribute('title')).toBe(en.openSession)

    await act(async () => {
      title?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(openSession).toHaveBeenCalledWith('session-1')
  })

  it('keeps card positions when a card becomes the most recently active', async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1', 'session-2', 'session-3'],
      byId: {
        'session-1': { id: 'session-1', title: 'First', running: false, blank: false, updatedAt: 3_000 },
        'session-2': { id: 'session-2', title: 'Second', running: false, blank: false, updatedAt: 2_000 },
        'session-3': { id: 'session-3', title: 'Third', running: false, blank: false, updatedAt: 1_000 },
      },
      phase: 'ready',
    })
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: { sessionId: id, prompt: vi.fn(async () => ({ ok: true })) },
          eventSource: new Source(windowOf([])),
        }),
        release: vi.fn(),
      }),
    }
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
      />,
    )
    const titles = (): (string | null)[] =>
      [...host.querySelectorAll('.dsm-cardTitle')].map((node) => node.textContent)
    expect(titles()).toEqual(['First', 'Second', 'Third'])

    // A prompt in the third card makes it the newest session in the catalog.
    await act(async () => {
      list.set({
        ids: ['session-1', 'session-2', 'session-3'],
        byId: {
          'session-1': { id: 'session-1', title: 'First', running: false, blank: false, updatedAt: 3_000 },
          'session-2': { id: 'session-2', title: 'Second', running: false, blank: false, updatedAt: 2_000 },
          'session-3': { id: 'session-3', title: 'Third', running: false, blank: false, updatedAt: 9_000 },
        },
        phase: 'ready',
      })
    })
    await flush()

    // The grid keeps the positions it already showed; only the card content moved.
    expect(titles()).toEqual(['First', 'Second', 'Third'])
  })

  it('gives a new session the slot of the oldest card on a full grid', async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1', 'session-2', 'session-3'],
      byId: {
        'session-1': { id: 'session-1', title: 'First', running: false, blank: false, updatedAt: 3_000 },
        'session-2': { id: 'session-2', title: 'Second', running: false, blank: false, updatedAt: 2_000 },
        'session-3': { id: 'session-3', title: 'Third', running: false, blank: false, updatedAt: 1_000 },
      },
      phase: 'ready',
    })
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: { sessionId: id, prompt: vi.fn(async () => ({ ok: true })) },
          eventSource: new Source(windowOf([])),
        }),
        release: vi.fn(),
      }),
    }
    const store = new MonitorStore(new FakeStorage())
    // Three cards fill the budget before the fourth session appears.
    store.setMaxCards(3)

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
      />,
    )
    const titles = (): (string | null)[] =>
      [...host.querySelectorAll('.dsm-cardTitle')].map((node) => node.textContent)
    expect(titles()).toEqual(['First', 'Second', 'Third'])

    await act(async () => {
      list.set({
        ids: ['session-1', 'session-2', 'session-3', 'session-4'],
        byId: {
          'session-1': { id: 'session-1', title: 'First', running: false, blank: false, updatedAt: 3_000 },
          'session-2': { id: 'session-2', title: 'Second', running: false, blank: false, updatedAt: 2_000 },
          'session-3': { id: 'session-3', title: 'Third', running: false, blank: false, updatedAt: 1_000 },
          'session-4': { id: 'session-4', title: 'Fourth', running: false, blank: false, updatedAt: 4_000 },
        },
        phase: 'ready',
      })
    })
    await flush()

    // 'Third' is the least recently used card: 'Fourth' takes its slot, and the
    // other two cards keep theirs.
    expect(titles()).toEqual(['First', 'Second', 'Fourth'])
  })

  it('does not let sessions beyond the seed budget displace displayed cards', async () => {
    const rows = (fifth: number) => ({
      ids: ['session-1', 'session-2', 'session-3', 'session-4', 'session-5'],
      byId: {
        'session-1': { id: 'session-1', title: 'First', running: false, blank: false, updatedAt: 5_000 },
        'session-2': { id: 'session-2', title: 'Second', running: false, blank: false, updatedAt: 4_000 },
        'session-3': { id: 'session-3', title: 'Third', running: false, blank: false, updatedAt: 3_000 },
        'session-4': { id: 'session-4', title: 'Fourth', running: false, blank: false, updatedAt: 2_000 },
        'session-5': { id: 'session-5', title: 'Fifth', running: false, blank: false, updatedAt: fifth },
      },
      phase: 'ready',
    })
    const list = new Source<SessionListSnapshotLike>(rows(1_000))
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: { sessionId: id, prompt: vi.fn(async () => ({ ok: true })) },
          eventSource: new Source(windowOf([])),
        }),
        release: vi.fn(),
      }),
    }
    const store = new MonitorStore(new FakeStorage())
    store.setMaxCards(3)

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
      />,
    )
    const titles = (): (string | null)[] =>
      [...host.querySelectorAll('.dsm-cardTitle')].map((node) => node.textContent)
    expect(titles()).toEqual(['First', 'Second', 'Third'])

    // A catalog update must not treat the never-shown sessions as arrivals.
    await act(async () => {
      list.set(rows(9_000))
    })
    await flush()
    expect(titles()).toEqual(['First', 'Second', 'Third'])
  })

  it('re-ranks to the newest cards when the budget shrinks and keeps the order when it grows', async () => {
    const rows = (third: number) => ({
      ids: ['session-1', 'session-2', 'session-3', 'session-4', 'session-5'],
      byId: {
        'session-1': { id: 'session-1', title: 'First', running: false, blank: false, updatedAt: 5_000 },
        'session-2': { id: 'session-2', title: 'Second', running: false, blank: false, updatedAt: 4_000 },
        'session-3': { id: 'session-3', title: 'Third', running: false, blank: false, updatedAt: third },
        'session-4': { id: 'session-4', title: 'Fourth', running: false, blank: false, updatedAt: 2_000 },
        'session-5': { id: 'session-5', title: 'Fifth', running: false, blank: false, updatedAt: 1_000 },
      },
      phase: 'ready',
    })
    const list = new Source<SessionListSnapshotLike>(rows(3_000))
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: { sessionId: id, prompt: vi.fn(async () => ({ ok: true })) },
          eventSource: new Source(windowOf([])),
        }),
        release: vi.fn(),
      }),
    }
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
      />,
    )
    const titles = (): (string | null)[] =>
      [...host.querySelectorAll('.dsm-cardTitle')].map((node) => node.textContent)
    expect(titles()).toEqual(['First', 'Second', 'Third', 'Fourth', 'Fifth'])

    // Third receives a prompt; the frozen order does not move it…
    await act(async () => {
      list.set(rows(9_000))
    })
    await flush()
    expect(titles()).toEqual(['First', 'Second', 'Third', 'Fourth', 'Fifth'])

    // …but shrinking the budget is the user asking for the newest cards.
    await act(async () => {
      store.setMaxCards(3)
    })
    await flush()
    expect(titles()).toEqual(['Third', 'First', 'Second'])

    // Growing it again reveals the rest without reordering what is shown.
    await act(async () => {
      store.setMaxCards(5)
    })
    await flush()
    expect(titles()).toEqual(['Third', 'First', 'Second', 'Fourth', 'Fifth'])
  })

  it('follows a running-status change and a catalog update after mount', async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1'],
      byId: {
        'session-1': { id: 'session-1', title: 'Live', running: false, blank: false, updatedAt: 1 },
      },
      phase: 'ready',
    })
    const statuses = new Source<ReadonlyMap<string, SessionStatusLike>>(new Map())
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: { sessionId: id, prompt: vi.fn(async () => ({ ok: true })) },
          eventSource: new Source(windowOf([])),
        }),
        release: vi.fn(),
      }),
    }
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage t={t} store={store} sessions={sessions} uiSession={{ sessionStatus: statuses }} />,
    )
    expect(host.querySelector('.dsm-cardSub')?.textContent).toContain(en.idle)

    // The Host's status event lands in the unified projection first.
    await act(async () => {
      statuses.set(new Map([['session-1', { running: true }]]))
    })
    await flush()
    expect(host.querySelector('.dsm-cardSub')?.textContent).toContain(en.working)

    // A catalog refresh alone must also carry the run state.
    await act(async () => {
      list.set({
        ids: ['session-1'],
        byId: { 'session-1': { id: 'session-1', title: 'Live', running: true, blank: false, updatedAt: 2 } },
        phase: 'ready',
      })
    })
    await flush()
    expect(host.querySelector('.dsm-cardSub')?.textContent).toContain(en.working)
  })

  it('shows the Workspace title beside the state, not the raw path', async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1'],
      byId: {
        'session-1': {
          id: 'session-1',
          title: 'Rename the dashboard route',
          running: false,
          blank: false,
          updatedAt: 1,
          cwd: '/Users/me/workspace/tendedero',
        },
      },
      phase: 'ready',
    })
    const workspaces: WorkspacesServiceLike = {
      list: new Source({ items: [{ workspaceId: 'w1', title: 'Tendedero', sessionIds: ['session-1'] }] }),
    }
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: { sessionId: id, prompt: vi.fn(async () => ({ ok: true })) },
          eventSource: new Source(windowOf([])),
        }),
        release: vi.fn(),
      }),
    }
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
        workspaces={workspaces}
      />,
    )

    const sub = host.querySelector('.dsm-cardSub')
    expect(sub?.querySelector('.dsm-cardWorkspace')?.textContent).toBe('Tendedero')
    expect(sub?.textContent).toContain(en.idle)
    // The raw path is a tooltip, never the visible label.
    expect(sub?.textContent).not.toContain('workspace/tendedero')
  })

  it('renders events and streamed text that arrive after mount', async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1'],
      byId: {
        'session-1': { id: 'session-1', title: 'Live tail', running: false, blank: false, updatedAt: 1 },
      },
      phase: 'ready',
    })
    const stream = new Source<{ entries: readonly EventEntryLike[] }>(
      windowOf([
        {
          type: 'event',
          event: {
            type: 'user/message',
            seq: 1,
            time: 10,
            data: { content: [{ type: 'text', text: 'first prompt' }], source: { kind: 'user' } },
          },
        },
      ]),
    )
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: { sessionId: id, prompt: vi.fn(async () => ({ ok: true })) },
          eventSource: stream,
        }),
        release: vi.fn(),
      }),
    }
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
      />,
    )
    expect(host.textContent).toContain('first prompt')

    // A durable event and a streamed text delta, both after mount.
    await act(async () => {
      stream.set(
        windowOf([
          {
            type: 'event',
            event: {
              type: 'user/message',
              seq: 1,
              time: 10,
              data: { content: [{ type: 'text', text: 'first prompt' }], source: { kind: 'user' } },
            },
          },
          {
            type: 'event',
            event: {
              type: 'tool/call',
              seq: 2,
              time: 20,
              data: { callId: 'c1', name: 'bash', arguments: '{"command":"pnpm test"}' },
            },
          },
          {
            type: 'transient',
            event: {
              type: 'assistant/live-chunk',
              seq: 3,
              time: 30,
              data: {
                attemptId: 'a1',
                turn: 1,
                step: 1,
                chunk: { type: 'text-delta', index: 0, text: 'running the tests now' },
              },
            },
          },
        ]),
      )
    })
    await flush()

    expect(host.textContent).toContain('bash')
    expect(host.textContent).toContain('pnpm test')
    expect(host.textContent).toContain('running the tests now')
  })

  it('reopens a window left holding a live row after its turn ended', async () => {
    vi.useFakeTimers()
    try {
      const list = new Source<SessionListSnapshotLike>({
        ids: ['session-1'],
        byId: {
          'session-1': { id: 'session-1', title: 'Stalled mid-turn', running: false, blank: false, updatedAt: 1000 },
        },
        phase: 'ready',
      })
      const stream = new Source<{ entries: readonly EventEntryLike[] }>(
        windowOf([
          {
            type: 'transient',
            event: {
              type: 'assistant/live-chunk',
              seq: 1,
              time: 1000,
              data: { attemptId: 'a1', turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'half a sentence' } },
            },
          },
        ]),
      )
      const lifecycle = new Source<{ running?: boolean; openState?: string }>({ running: false, openState: 'open' })
      const resync = vi.fn(async () => undefined)
      const sessions: SessionsServiceLike = {
        list,
        retain: (id: string) => ({
          sessionId: id,
          ready: Promise.resolve({
            session: {
              sessionId: id,
              getSnapshot: lifecycle.getSnapshot,
              subscribe: lifecycle.subscribe,
              resync,
              prompt: vi.fn(async () => ({ ok: true })),
            },
            eventSource: stream,
          }),
          release: vi.fn(),
        }),
      }
      const store = new MonitorStore(new FakeStorage())

      await renderPage(
        <MonitorPage
          t={t}
          store={store}
          sessions={sessions}
          uiSession={{ sessionStatus: new Source(new Map()) }}
        />,
      )
      expect(resync).not.toHaveBeenCalled()

      await act(async () => {
        vi.advanceTimersByTime(11_000)
      })
      await flush()
      // A transient row can only exist during an attempt; idle plus a live row is
      // inconsistent, so the card re-reads the Host tail.
      expect(resync).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the newest visible activity time, not only the last prompt', async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1'],
      byId: {
        'session-1': { id: 'session-1', title: 'Fresh', running: false, blank: false, updatedAt: 1_000 },
      },
      phase: 'ready',
    })
    const stream = new Source<{ entries: readonly EventEntryLike[] }>(
      windowOf([
        {
          type: 'event',
          event: {
            type: 'assistant/message',
            seq: 1,
            time: Date.now(),
            data: { message: { content: [{ type: 'text', text: 'fresh answer' }] } },
          },
        },
      ]),
    )
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: { sessionId: id, getSnapshot: () => ({ running: false, openState: 'open' }), subscribe: () => () => {}, prompt: vi.fn(async () => ({ ok: true })) },
          eventSource: stream,
        }),
        release: vi.fn(),
      }),
    }
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
      />,
    )

    // updatedAt is 1 s (epoch), but the loaded answer is from just now.
    expect(host.querySelector('.dsm-cardTime')?.textContent).toBe(en.nowLabel)
  })

  it('reopens a window the catalog has outrun', async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1'],
      byId: {
        'session-1': { id: 'session-1', title: 'Behind', running: false, blank: false, updatedAt: 500_000 },
      },
      phase: 'ready',
    })
    const stream = new Source<{ entries: readonly EventEntryLike[] }>(
      windowOf([
        {
          type: 'event',
          event: {
            type: 'user/message',
            seq: 1,
            time: 10_000,
            data: { content: [{ type: 'text', text: 'old prompt' }], source: { kind: 'user' } },
          },
        },
      ]),
    )
    const resync = vi.fn(async () => undefined)
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: {
            sessionId: id,
            getSnapshot: () => ({ running: false, openState: 'open' }),
            subscribe: () => () => {},
            resync,
            prompt: vi.fn(async () => ({ ok: true })),
          },
          eventSource: stream,
        }),
        release: vi.fn(),
      }),
    }
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
      />,
    )
    await flush()

    // Recency says 500 s, the newest loaded event says 10 s: the window is behind.
    expect(resync).toHaveBeenCalledTimes(1)
  })

  it('reopens a tail stream the controller marked as failed', async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1'],
      byId: {
        'session-1': { id: 'session-1', title: 'Dropped', running: true, blank: false, updatedAt: 1 },
      },
      phase: 'ready',
    })
    const lifecycle = new Source<{ running?: boolean; openState?: string }>({
      running: true,
      openState: 'error',
    })
    const resync = vi.fn(async () => undefined)
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: {
            sessionId: id,
            getSnapshot: lifecycle.getSnapshot,
            subscribe: lifecycle.subscribe,
            resync,
            prompt: vi.fn(async () => ({ ok: true })),
          },
          eventSource: new Source(windowOf([])),
        }),
        release: vi.fn(),
      }),
    }
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
      />,
    )
    await flush()

    // A terminated follow stream never recovers on its own; the card reopens it.
    expect(resync).toHaveBeenCalledTimes(1)
  })

  it('reconciles a catalog whose subscription never fires', async () => {
    vi.useFakeTimers()
    try {
      const list = new Source<SessionListSnapshotLike>({
        ids: ['session-1'],
        byId: {
          'session-1': { id: 'session-1', title: 'Silent', running: false, blank: false, updatedAt: 1 },
        },
        phase: 'ready',
      })
      // A foreign store that accepts a listener but never calls it.
      list.subscribe = () => () => {}
      const sessions: SessionsServiceLike = {
        list,
        retain: (id: string) => ({
          sessionId: id,
          ready: Promise.resolve({
            session: { sessionId: id, prompt: vi.fn(async () => ({ ok: true })) },
            eventSource: new Source(windowOf([])),
          }),
          release: vi.fn(),
        }),
      }
      const store = new MonitorStore(new FakeStorage())

      await renderPage(
        <MonitorPage
          t={t}
          store={store}
          sessions={sessions}
          uiSession={{ sessionStatus: new Source(new Map()) }}
        />,
      )
      expect(host.querySelector('.dsm-cardSub')?.textContent).toContain(en.idle)

      // The snapshot changes with no notification at all.
      list.set({
        ids: ['session-1'],
        byId: {
          'session-1': { id: 'session-1', title: 'Silent', running: true, blank: false, updatedAt: 2 },
        },
        phase: 'ready',
      })
      await act(async () => {
        vi.advanceTimersByTime(1_600)
      })
      await flush()
      expect(host.querySelector('.dsm-cardSub')?.textContent).toContain(en.working)
    } finally {
      vi.useRealTimers()
    }
  })

  it('asks the Host for a catalog baseline when the panel opens', async () => {
    const list = new Source<SessionListSnapshotLike>({ ids: [], byId: {}, phase: 'ready' })
    const refresh = vi.fn(async () => undefined)
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={{ list, refresh }}
        uiSession={{ sessionStatus: new Source(new Map()) }}
      />,
    )

    expect(refresh).toHaveBeenCalled()
  })

  it('answers a pending question through the carrier and hides the session when removed', async () => {
    const answer = vi.fn(async () => undefined)
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1'],
      byId: {
        'session-1': {
          id: 'session-1',
          title: 'Asking session',
          running: true,
          blank: false,
          updatedAt: 1_000,
          cwd: '/work/one',
        },
      },
      phase: 'ready',
    })
    const statuses = new Source<ReadonlyMap<string, SessionStatusLike>>(
      new Map([['session-1', { running: true, pendingInteraction: questionCarrier(answer) }]]),
    )
    const store = new MonitorStore(new FakeStorage())
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: { sessionId: id, prompt: vi.fn(async () => ({ ok: true })) },
          eventSource: new Source(windowOf([])),
        }),
        release: vi.fn(),
      }),
    }

    await renderPage(<MonitorPage t={t} store={store} sessions={sessions} uiSession={{ sessionStatus: statuses }} />)

    // The card header names the waiting state; the block starts with the question.
    expect(host.textContent).toContain(en.waiting)
    expect(host.textContent).toContain('Deploy')
    expect(host.textContent).toContain('Proceed?')

    await clickByText('Yes')
    await clickByText('Submit')
    expect(answer).toHaveBeenCalledTimes(1)
    expect(answer).toHaveBeenCalledWith({ answers: [{ id: 'q1', selected: ['Yes'] }] })

    const remove = [...host.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === en.remove,
    )
    expect(remove).toBeDefined()
    await act(async () => {
      remove?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()
    expect(host.querySelectorAll('.dsm-card')).toHaveLength(0)
    expect(host.textContent).toContain(en.emptyTitle)
  })

  it('lays the grid out with the chosen number of cards per row', async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1', 'session-2'],
      byId: {
        'session-1': { id: 'session-1', title: 'One', running: false, blank: false, updatedAt: 2 },
        'session-2': { id: 'session-2', title: 'Two', running: false, blank: false, updatedAt: 1 },
      },
      phase: 'ready',
    })
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: { sessionId: id, prompt: vi.fn(async () => ({ ok: true })) },
          eventSource: new Source(windowOf([])),
        }),
        release: vi.fn(),
      }),
    }
    const store = new MonitorStore(new FakeStorage())
    store.setColumns(2)

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
      />,
    )

    const grid = host.querySelector('.dsm-grid') as HTMLElement
    expect(grid.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))')
    expect(grid.style.gridTemplateRows).toBe('repeat(1, minmax(0, 1fr))')
    expect(host.querySelectorAll('.dsm-card')).toHaveLength(2)

    // One card per row needs two rows, so every card still fits the page.
    await act(async () => {
      store.setColumns(1)
    })
    await flush()
    const single = host.querySelector('.dsm-grid') as HTMLElement
    expect(single.style.gridTemplateRows).toBe('repeat(2, minmax(0, 1fr))')

    // Auto derives its own fitted track list; it never falls back to a filling
    // rule that could overflow the page.
    await act(async () => {
      store.setColumns(0)
    })
    await flush()
    const auto = host.querySelector('.dsm-grid') as HTMLElement
    expect(auto.style.gridTemplateColumns).toMatch(/^repeat\(\d, minmax\(0, 1fr\)\)$/)
  })

  it('sends custom text instead of a chosen label on a single-select question', async () => {
    const answer = vi.fn(async () => undefined)
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1'],
      byId: {
        'session-1': { id: 'session-1', title: 'Asking', running: true, blank: false, updatedAt: 1 },
      },
      phase: 'ready',
    })
    const carrier = {
      ...questionCarrier(answer),
      questions: [
        {
          id: 'q1',
          question: 'Which branch?',
          options: [{ label: 'main' }, { label: 'next' }],
        },
      ],
    }
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: { sessionId: id, prompt: vi.fn(async () => ({ ok: true })) },
          eventSource: new Source(windowOf([])),
        }),
        release: vi.fn(),
      }),
    }
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{
          sessionStatus: new Source<ReadonlyMap<string, SessionStatusLike>>(
            new Map([['session-1', { running: true, pendingInteraction: carrier }]]),
          ),
        }}
      />,
    )

    await clickByText('main')
    const input = host.querySelector('input[type="text"]')
    expect(input).not.toBeNull()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'release-9')
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await clickByText('Submit')
    // A single-select question takes the custom text INSTEAD of the label.
    expect(answer).toHaveBeenCalledWith({
      answers: [{ id: 'q1', selected: [], custom: 'release-9' }],
    })
  })

  it('follows the bound session lifecycle when the catalog never changes', async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1'],
      byId: {
        'session-1': { id: 'session-1', title: 'Binding source', running: false, blank: false, updatedAt: 1 },
      },
      phase: 'ready',
    })
    const lifecycle = new Source<{ running?: boolean }>({ running: false })
    const face = {
      sessionId: 'session-1',
      getSnapshot: lifecycle.getSnapshot,
      subscribe: lifecycle.subscribe,
      prompt: vi.fn(async () => ({ ok: true })),
    }
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({ session: face, eventSource: new Source(windowOf([])) }),
        release: vi.fn(),
      }),
    }
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
      />,
    )
    expect(host.querySelector('.dsm-cardSub')?.textContent).toContain(en.idle)

    // The Host status event reaches the Session object, but the catalog row
    // stays stale: the card must still move to working.
    await act(async () => {
      lifecycle.set({ running: true })
    })
    await flush()
    expect(host.querySelector('.dsm-cardSub')?.textContent).toContain(en.working)

    const input = host.querySelector('textarea') as HTMLTextAreaElement
    await typeInto(input, 'ping')
    await clickByText(en.send)
    expect(face.prompt).toHaveBeenCalledWith(
      [{ type: 'text', text: 'ping' }],
      'queue',
      undefined,
      expect.any(String),
    )
  })

  it('sends a prompt to a session through its own prompt()', async () => {
    const prompt = vi.fn(async () => ({ ok: true }))
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1'],
      byId: {
        'session-1': {
          id: 'session-1',
          title: 'Chat session',
          running: false,
          blank: false,
          updatedAt: 1_000,
        },
      },
      phase: 'ready',
    })
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: { sessionId: id, prompt },
          eventSource: new Source(windowOf([])),
        }),
        release: vi.fn(),
      }),
    }
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
      />,
    )

    // An idle session has nothing to stop.
    expect(host.querySelector(`button[aria-label="${en.stop}"]`)).toBeNull()

    const textarea = host.querySelector('textarea')
    expect(textarea).not.toBeNull()
    await typeInto(textarea as HTMLTextAreaElement, '  run the tests  ')
    await clickByText(en.send)

    expect(prompt).toHaveBeenCalledTimes(1)
    const [content, mode, , requestId] = prompt.mock.calls[0] as unknown as [
      { type: string; text: string }[],
      string,
      undefined,
      string,
    ]
    expect(content).toEqual([{ type: 'text', text: 'run the tests' }])
    expect(mode).toBe('queue')
    expect(typeof requestId).toBe('string')

    // An accepted prompt clears the draft.
    expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('')
  })

  it("switches a session's permission preset, confirming only Auto review", async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1'],
      byId: {
        'session-1': { id: 'session-1', title: 'Guarded', running: false, blank: false, updatedAt: 1 },
      },
      phase: 'ready',
    })
    // The `permissions` projection is the Host's own current-preset value.
    const permissions = new Source<{ currentValue: string }>({ currentValue: 'workspace-write' })
    const command = vi.fn(async (_line: string) => ({ ok: true, value: { matched: true } }))
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: {
            sessionId: id,
            prompt: vi.fn(async () => ({ ok: true })),
            command,
            projections: { faceOf: (key: string) => (key === 'permissions' ? permissions : undefined) },
          },
          eventSource: new Source(windowOf([])),
        }),
        release: vi.fn(),
      }),
    }
    const remote: RemoteServiceLike = {
      permissionPresets: {
        catalog: async () => ({
          ok: true,
          value: {
            options: [
              { value: 'read-only', name: 'read-only' },
              { value: 'workspace-write', name: 'workspace-write' },
              { value: 'danger-full-access', name: 'Full access' },
              { value: 'auto', name: 'auto' },
            ],
          },
        }),
      },
      $on: () => () => {},
    }
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
        remote={remote}
      />,
    )
    await flush()

    const select = host.querySelector<HTMLSelectElement>('.dsm-permSelect')
    expect(select, 'the permission control should render once the catalog resolves').not.toBeNull()
    expect(select?.value).toBe('workspace-write')
    // Built-in values use this plugin's own product labels, not the machine names.
    expect([...(select?.options ?? [])].map((option) => option.textContent)).toEqual([
      'Read Only',
      'Workspace Write',
      'Full access',
      'Auto review',
    ])

    // A plain preset switches through the Session's own `/permission` command.
    await act(async () => {
      if (select !== null) {
        select.value = 'read-only'
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
    await flush()
    expect(command).toHaveBeenCalledWith('/permission read-only')

    // Full access is an explicit selection: it switches with no extra step.
    command.mockClear()
    await act(async () => {
      if (select !== null) {
        select.value = 'danger-full-access'
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
    await flush()
    expect(command).toHaveBeenCalledWith('/permission danger-full-access')
    expect(command).toHaveBeenCalledTimes(1)

    // Auto review keeps its one acknowledgement.
    command.mockClear()
    await act(async () => {
      if (select !== null) {
        select.value = 'auto'
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
    await flush()
    expect(command).not.toHaveBeenCalled()
    expect(host.textContent).toContain(en.permConfirmAuto)

    await clickByText(en.permConfirmSwitch)
    expect(command).toHaveBeenCalledWith('/permission auto')

    // The Host's projection is the settlement: the control follows it.
    await act(async () => {
      permissions.set({ currentValue: 'auto' })
    })
    await flush()
    expect(host.querySelector<HTMLSelectElement>('.dsm-permSelect')?.value).toBe('auto')
  })

  it('lists queued messages and steers one into the running turn', async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1'],
      byId: {
        'session-1': { id: 'session-1', title: 'Busy', running: true, blank: false, updatedAt: 1 },
      },
      phase: 'ready',
    })
    const inbox = new Source<{ 'next-turn': readonly unknown[] }>({
      'next-turn': [
        { id: 'q1', content: [{ type: 'text', text: 'queued hello' }] },
        { id: 'q2', content: [{ type: 'text', text: 'second queued' }] },
        { id: 'q3', content: [{ type: 'text', text: 'third queued' }] },
        { id: 'q4', content: [{ type: 'text', text: 'fourth queued' }] },
      ],
    })
    const updateQueue = vi.fn(async (_id: string, _action: { kind: string }) => ({ ok: true }))
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: {
            sessionId: id,
            prompt: vi.fn(async () => ({ ok: true })),
            updateQueue,
            projections: { faceOf: (key: string) => (key === 'inbox' ? inbox : undefined) },
          },
          eventSource: new Source(windowOf([])),
        }),
        release: vi.fn(),
      }),
    }
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
      />,
    )

    // Every queued row is shown up to the card's budget, with a summary for the rest.
    expect(host.textContent).toContain('4 queued')
    expect(host.textContent).toContain('queued hello')
    expect(host.textContent).toContain('second queued')
    expect(host.textContent).toContain('+1 more')
    // The composer no longer carries the Queue/Steer delivery toggle.
    expect(host.querySelector('.dsm-mode')).toBeNull()
    expect(host.querySelectorAll('button[aria-label="Steer queued message"]')).toHaveLength(3)
    expect(host.querySelectorAll('button[aria-label="Edit queued message"]')).toHaveLength(3)
    expect(host.querySelectorAll('button[aria-label="Discard queued message"]')).toHaveLength(3)

    // Steer is the main-view dock action: updateQueue(kind: 'steer').
    await clickNthByLabel(en.steerQueued, 0)
    expect(updateQueue).toHaveBeenCalledWith('q1', { kind: 'steer' })

    // Edit opens an inline editor prefilled with the row's text…
    updateQueue.mockClear()
    await clickNthByLabel(en.queueEdit, 1)
    const editor = host.querySelector<HTMLTextAreaElement>('textarea.dsm-queueEdit')
    expect(editor?.value).toBe('second queued')
    await typeInto(editor as HTMLTextAreaElement, 'edited second')
    await clickNthByLabel(en.queueSave, 0)
    expect(updateQueue).toHaveBeenCalledWith('q2', {
      kind: 'edit',
      content: [{ type: 'text', text: 'edited second' }],
    })

    // …and Discard removes the row through the same dock action.
    updateQueue.mockClear()
    await clickNthByLabel(en.queueDiscard, 2)
    expect(updateQueue).toHaveBeenCalledWith('q3', { kind: 'remove' })
  })

  it("switches one session's model through its shared directory", async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1'],
      byId: {
        'session-1': { id: 'session-1', title: 'Modeled', running: false, blank: false, updatedAt: 1 },
      },
      phase: 'ready',
    })
    // The directory service only answers once the session is materialized, so a
    // card that resolves it before its own `retain()` runs is exactly the bug
    // this test pins: the two sessions the app is not viewing had no picker.
    let retained = false
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => {
        retained = true
        return {
          sessionId: id,
          ready: Promise.resolve({
            session: { sessionId: id, prompt: vi.fn(async () => ({ ok: true })) },
            eventSource: new Source(windowOf([])),
          }),
          release: vi.fn(),
        }
      },
    }
    const directoryState = new Source({
      current: { provider: 'p1', model: 'm1' },
      groups: [
        {
          id: 'p1',
          name: 'Provider One',
          models: [
            { id: 'm1', name: 'Model One' },
            { id: 'm2', name: 'Model Two' },
          ],
        },
      ],
      status: 'ready',
    })
    const select = vi.fn(async (_selection: unknown) => ({ ok: true }))
    const load = vi.fn(async () => undefined)
    const modelDirectoryFor = (_sessionId: string) => {
      if (!retained) throw new Error('ui-model-selection: session resolved no binding')
      return { store: directoryState, load, select }
    }
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
        modelDirectoryFor={modelDirectoryFor}
      />,
    )
    await flush()

    const model = host.querySelector<HTMLSelectElement>('.dsm-modelSelect')
    expect(model, 'the model control should render once the directory resolves').not.toBeNull()
    // The picker sits in the same composer row as the permission control.
    expect(model?.closest('.dsm-composerFoot')).not.toBeNull()
    expect(model?.value).toBe('p1\u0000m1')
    expect(load).toHaveBeenCalled()
    expect([...(model?.options ?? [])].map((option) => option.textContent)).toEqual([
      'Model One',
      'Model Two',
    ])

    await act(async () => {
      if (model !== null) {
        model.value = 'p1\u0000m2'
        model.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
    await flush()
    // A model with no advertised reasoning effort submits the pair alone.
    expect(select).toHaveBeenCalledWith({ provider: 'p1', model: 'm2' })
  })

  it('stops a running session through its own cancel()', async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1'],
      byId: {
        'session-1': { id: 'session-1', title: 'Working', running: true, blank: false, updatedAt: 1 },
      },
      phase: 'ready',
    })
    const cancel = vi.fn(async () => ({ ok: true }))
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: { sessionId: id, prompt: vi.fn(async () => ({ ok: true })), cancel },
          eventSource: new Source(windowOf([])),
        }),
        release: vi.fn(),
      }),
    }
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
      />,
    )

    const stop = host.querySelector<HTMLButtonElement>(`button[aria-label="${en.stop}"]`)
    expect(stop, 'a running session should offer Stop').not.toBeNull()
    expect(stop?.textContent).toBe(en.stop)

    await clickNthByLabel(en.stop, 0)
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('reports an open failure in the card instead of blanking the page', async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1'],
      byId: {
        'session-1': { id: 'session-1', title: 'Broken', running: false, blank: false, updatedAt: 1 },
      },
      phase: 'ready',
    })
    const sessions: SessionsServiceLike = {
      list,
      retain: () => ({
        sessionId: 'session-1',
        ready: Promise.reject(new Error('history unavailable')),
        release: vi.fn(),
      }),
    }
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
      />,
    )

    expect(host.querySelectorAll('.dsm-card')).toHaveLength(1)
    expect(host.textContent).toContain(en.openFailed)
  })

  it('renders a long answer whole, not clipped behind an ellipsis', async () => {
    const list = new Source<SessionListSnapshotLike>({
      ids: ['session-1'],
      byId: {
        'session-1': { id: 'session-1', title: 'Long answer', running: false, blank: false, updatedAt: 1 },
      },
      phase: 'ready',
    })
    // A 5,000-character answer: the part after the old 2,000-character budget is
    // the end of a sentence, and it is what a card must show.
    const answer = `${'head '.repeat(480)}- I cannot find the code that built this panel.`
    const sessions: SessionsServiceLike = {
      list,
      retain: (id: string) => ({
        sessionId: id,
        ready: Promise.resolve({
          session: { sessionId: id, getSnapshot: () => ({ running: false, openState: 'open' }), subscribe: () => () => {} },
          eventSource: new Source(
            windowOf([
              {
                type: 'event',
                event: {
                  type: 'assistant/message',
                  seq: 1,
                  time: 10,
                  data: { message: { content: [{ type: 'text', text: answer }] } },
                },
              },
            ]),
          ),
        }),
        release: vi.fn(),
      }),
    }
    const store = new MonitorStore(new FakeStorage())

    await renderPage(
      <MonitorPage
        t={t}
        store={store}
        sessions={sessions}
        uiSession={{ sessionStatus: new Source(new Map()) }}
      />,
    )

    const body = host.querySelector('.dsm-assistant')
    expect(body?.textContent).toBe(answer)
    expect(body?.textContent?.endsWith('- I cannot find the code that built this panel.')).toBe(true)
  })
})