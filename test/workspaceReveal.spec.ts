// @vitest-environment jsdom
/**
 * Revealing a Session's Workspace in the host sidebar.
 *
 * The helpers here address the sidebar through the row attributes the host
 * actually renders (`role="treeitem"`, `data-row-key`, `aria-expanded`), so the
 * fixtures below build those rows rather than mocking a React tree: a changed
 * attribute contract fails here instead of in the browser.
 *
 * @module dsh-session-monitor/test/workspaceReveal
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  WORKSPACE_ROW_KEY_PREFIX,
  expandWorkspaceGroup,
  workspaceIdForSession,
  workspaceRowKey,
} from '../src/client/workspaceReveal.ts'
import type { WorkspaceViewLike } from '../src/client/types.ts'

/** One observable Workspace header row. */
interface Row {
  readonly element: HTMLElement
  clicks(): number
}

/**
 * Mount one header row that toggles exactly like the host's own.
 * @param key - `data-row-key` value.
 * @param expanded - starting `aria-expanded` state.
 * @param aria - whether the row carries `aria-expanded` at all.
 * @returns the row and its click counter.
 */
function mountRow(key: string, expanded: boolean, aria = true): Row {
  const element = document.createElement('div')
  element.setAttribute('role', 'treeitem')
  element.setAttribute('data-row-key', key)
  if (aria) element.setAttribute('aria-expanded', String(expanded))
  let clicks = 0
  element.addEventListener('click', () => {
    clicks += 1
    element.setAttribute('aria-expanded', String(element.getAttribute('aria-expanded') !== 'true'))
  })
  document.body.append(element)
  return { element, clicks: () => clicks }
}

beforeEach(() => {
  document.body.replaceChildren()
})

describe('workspaceRowKey', () => {
  it('prefixes the Workspace identity the sidebar addresses', () => {
    expect(workspaceRowKey('8f4a')).toBe('workspace:8f4a')
    expect(workspaceRowKey('8f4a').startsWith(WORKSPACE_ROW_KEY_PREFIX)).toBe(true)
  })
})

describe('expandWorkspaceGroup', () => {
  it('clicks a folded Workspace row and reports it was found', () => {
    const row = mountRow('workspace:ws-1', false)
    expect(expandWorkspaceGroup('ws-1', document)).toBe(true)
    expect(row.clicks()).toBe(1)
    expect(row.element.getAttribute('aria-expanded')).toBe('true')
  })

  it('leaves an already-expanded Workspace row untouched', () => {
    const row = mountRow('workspace:ws-1', true)
    expect(expandWorkspaceGroup('ws-1', document)).toBe(true)
    expect(row.clicks()).toBe(0)
    expect(row.element.getAttribute('aria-expanded')).toBe('true')
  })

  it('clicking twice is idempotent in effect: the second pass finds it open', () => {
    const row = mountRow('workspace:ws-1', false)
    expandWorkspaceGroup('ws-1', document)
    expandWorkspaceGroup('ws-1', document)
    expect(row.clicks()).toBe(1)
  })

  it('does not touch another Workspace row', () => {
    const other = mountRow('workspace:ws-2', false)
    expect(expandWorkspaceGroup('ws-1', document)).toBe(false)
    expect(other.clicks()).toBe(0)
  })

  it('ignores Session rows that merely share the suffix', () => {
    const session = mountRow('session:ws-1', false)
    expect(expandWorkspaceGroup('ws-1', document)).toBe(false)
    expect(session.clicks()).toBe(0)
  })

  it('matches the row key exactly, not by prefix', () => {
    const longer = mountRow('workspace:ws-1-extra', false)
    expect(expandWorkspaceGroup('ws-1', document)).toBe(false)
    expect(longer.clicks()).toBe(0)
  })

  it('never expands the Unassigned bucket or an empty identity', () => {
    const ungrouped = mountRow('workspace:', false)
    expect(expandWorkspaceGroup('', document)).toBe(false)
    expect(ungrouped.clicks()).toBe(0)
  })

  it('treats a row without aria-expanded as already open', () => {
    const row = mountRow('workspace:ws-1', false, false)
    expect(expandWorkspaceGroup('ws-1', document)).toBe(true)
    expect(row.clicks()).toBe(0)
  })

  it('reports absence instead of throwing when the document has no rows', () => {
    expect(expandWorkspaceGroup('ws-1', document)).toBe(false)
  })

  it('reports absence instead of throwing when the document cannot be queried', () => {
    const broken = {
      querySelectorAll: () => { throw new Error('detached') },
    } as unknown as Document
    expect(expandWorkspaceGroup('ws-1', broken)).toBe(false)
  })
})

describe('workspaceIdForSession', () => {
  const workspaces: readonly WorkspaceViewLike[] = [
    { workspaceId: 'ws-1', path: '/Users/me/app', sessionIds: ['s-1'] },
    { workspaceId: 'ws-2', path: '/Users/me/other', sessionIds: ['s-2'] },
  ]

  it('resolves by the Workspace projection membership', () => {
    expect(workspaceIdForSession('s-2', workspaces, '/Users/me/app')).toBe('ws-2')
  })

  it('prefers membership over a matching directory', () => {
    expect(workspaceIdForSession('s-1', workspaces, '/Users/me/other')).toBe('ws-1')
  })

  it('falls back to the Session cwd when membership has not arrived', () => {
    expect(workspaceIdForSession('s-9', workspaces, '/Users/me/other/')).toBe('ws-2')
  })

  it('normalizes both separators and trailing slashes', () => {
    const windows: readonly WorkspaceViewLike[] = [
      { workspaceId: 'ws-win', path: 'C:\\work\\app' },
    ]
    expect(workspaceIdForSession('s-9', windows, 'C:/work/app/')).toBe('ws-win')
    expect(workspaceIdForSession('s-9', windows, 'D:/work/app')).toBe(undefined)
  })

  it('answers Unassigned when neither membership nor directory matches', () => {
    expect(workspaceIdForSession('s-9', workspaces, '/Users/me/elsewhere')).toBe(undefined)
    expect(workspaceIdForSession('s-9', workspaces, undefined)).toBe(undefined)
  })

  it('survives a projection without usable rows', () => {
    const malformed = [
      undefined,
      null,
      { workspaceId: '', sessionIds: ['s-1'] },
      { workspaceId: 'ws-x' },
      { workspaceId: 'ws-y', sessionIds: 's-1' },
    ] as unknown as readonly WorkspaceViewLike[]
    expect(workspaceIdForSession('s-1', malformed, undefined)).toBe(undefined)
    expect(workspaceIdForSession('s-1', undefined, undefined)).toBe(undefined)
    expect(workspaceIdForSession('s-1', [], undefined)).toBe(undefined)
  })
})