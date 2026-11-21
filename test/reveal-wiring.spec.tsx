// @vitest-environment jsdom
/**
 * The title link's wiring: opening a Session must also unfold its Workspace.
 *
 * The page tests render a card with an injected `openSession` callback and never
 * see where that callback comes from. This spec mounts the plugin's `apply`
 * behind a fake client context, takes the real injection face the `main` slot
 * registration hands the page, and drives the callback with a Workspace row in
 * the document — the only place the two halves meet.
 *
 * @module dsh-session-monitor/test/reveal-wiring
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.tsx'

/** One slot registration the fake harness observed. */
interface Registration {
  readonly slot: string
  readonly inject?: () => Record<string, unknown>
}

/** The document-side row a title click should unfold. */
interface Row {
  readonly element: HTMLElement
  readonly events: string[]
}

/**
 * Mount a Workspace header row that toggles like the host's own, recording the
 * click in a shared event log so ordering can be asserted.
 * @param workspaceId - identity the row addresses.
 * @param events - shared log; the row pushes `expand`.
 * @returns the mounted row.
 */
function mountWorkspaceRow(workspaceId: string, events: string[]): Row {
  const element = document.createElement('div')
  element.setAttribute('role', 'treeitem')
  element.setAttribute('data-row-key', `workspace:${workspaceId}`)
  element.setAttribute('aria-expanded', 'false')
  element.addEventListener('click', () => {
    events.push('expand')
    element.setAttribute('aria-expanded', 'true')
  })
  document.body.append(element)
  return { element, events }
}

/**
 * Run `apply` against the smallest client context that mounts both slots.
 * @param options - services and navigation the composition provides.
 * @returns the captured registrations and an opener for the real title callback.
 */
function mountPlugin(options: {
  openSession?: (sessionId: string) => void
  workspaces?: { items?: readonly Record<string, unknown>[] }
  sessions?: { byId?: Readonly<Record<string, Record<string, unknown>>> }
}): {
  registrations: Registration[]
  openSession: ((sessionId: string) => void) | undefined
} {
  const registrations: Registration[] = []
  const disposers: Array<() => void> = []
  const ctx = {
    effect: (callback: () => void | (() => void)) => {
      const dispose = callback()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    slots: {
      inject: (_key: string, callback: () => () => void) => {
        disposers.push(callback())
        return () => {}
      },
      register: (spec: { name: string; inject?: () => Record<string, unknown> }) => {
        registrations.push({ slot: spec.name, inject: spec.inject })
        return () => {}
      },
    },
    locale: {
      register: () => () => {},
      bind: () => (key: string) => key,
    },
    sessions: options.sessions === undefined
      ? undefined
      : { list: { getSnapshot: () => options.sessions } },
    workspaces: options.workspaces === undefined
      ? undefined
      : { list: { getSnapshot: () => options.workspaces } },
    get: (name: string) => (name === 'uiWorkspace'
      ? { openSession: options.openSession }
      : undefined),
  }
  apply(ctx as unknown as Parameters<typeof apply>[0])
  const main = registrations.find(registration => registration.slot === 'main')
  const face = main?.inject?.()
  return {
    registrations,
    openSession: face?.openSession as ((sessionId: string) => void) | undefined,
  }
}

beforeEach(() => {
  document.body.replaceChildren()
})

describe('title click wiring', () => {
  it('unfolds the owner before opening the Session', () => {
    const events: string[] = []
    const row = mountWorkspaceRow('ws-1', events)
    const openSession = vi.fn(() => { events.push('open') })
    const mounted = mountPlugin({
      openSession,
      workspaces: { items: [{ workspaceId: 'ws-1', path: '/Users/me/app', sessionIds: ['s-1'] }] },
      sessions: { byId: { 's-1': { id: 's-1', cwd: '/Users/me/app' } } },
    })

    expect(mounted.openSession).toBeTypeOf('function')
    mounted.openSession?.('s-1')

    expect(openSession).toHaveBeenCalledWith('s-1')
    expect(row.element.getAttribute('aria-expanded')).toBe('true')
    expect(events).toEqual(['expand', 'open'])
  })

  it('finds the Workspace from the Session cwd when membership is missing', () => {
    const events: string[] = []
    const row = mountWorkspaceRow('ws-2', events)
    const openSession = vi.fn()
    const mounted = mountPlugin({
      openSession,
      workspaces: { items: [{ workspaceId: 'ws-2', path: '/Users/me/other' }] },
      sessions: { byId: { 's-2': { id: 's-2', cwd: '/Users/me/other/' } } },
    })

    mounted.openSession?.('s-2')

    expect(openSession).toHaveBeenCalledWith('s-2')
    expect(row.element.getAttribute('aria-expanded')).toBe('true')
  })

  it('still opens the Session when no Workspace row answers', () => {
    const openSession = vi.fn()
    const mounted = mountPlugin({
      openSession,
      workspaces: { items: [{ workspaceId: 'ws-gone', path: '/Users/me/gone', sessionIds: ['s-3'] }] },
      sessions: { byId: { 's-3': { id: 's-3', cwd: '/Users/me/gone' } } },
    })

    mounted.openSession?.('s-3')

    expect(openSession).toHaveBeenCalledWith('s-3')
  })

  it('still opens the Session without Workspace or Session projections', () => {
    const openSession = vi.fn()
    const mounted = mountPlugin({ openSession })

    mounted.openSession?.('s-4')

    expect(openSession).toHaveBeenCalledWith('s-4')
  })

  it('opens the Session when the Workspace projection throws', () => {
    const openSession = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mounted = mountPlugin({
      openSession,
      // The getter throws the way a disposed projection would.
      workspaces: { get items(): never { throw new Error('projection closed') } },
      sessions: { byId: {} },
    })

    try {
      expect(() => mounted.openSession?.('s-5')).not.toThrow()
      expect(openSession).toHaveBeenCalledWith('s-5')
      // The failure is reported, not silently swallowed.
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})