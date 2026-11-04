/**
 * The monitor's two pure derivations: which sessions it watches, and what one
 * live event window says happened.
 *
 * These tests drive the real functions with shaped fixtures; no browser, no
 * harness, and no mock of the harness — the point is that the derivations hold
 * for the payloads the Session Controller actually publishes.
 *
 * @module dsh-session-monitor/test/model
 */

import { describe, expect, it } from 'vitest'
import {
  autoColumns,
  billedInputTokens,
  cacheHitPercent,
  collectSessions,
  consumedTokens,
  contextOccupancy,
  DEFAULT_MAX_CARDS,
  defaultWorkspaceId,
  deriveTranscript,
  displayOrder,
  displayPresetName,
  formatCompactTokens,
  formatExactTokens,
  gridRows,
  needsPermissionConfirmation,
  permissionLabelKey,
  monitorState,
  newestEventTime,
  orderOrSeed,
  reconcileOrder,
  relativeLabel,
  selectMonitored,
  sessionTitle,
  summarizeArguments,
  workspaceLabel,
  workspaceTitles,
  type TranscriptRow,
} from '../src/client/model.ts'
import type { EventEntryLike, SessionListSnapshotLike, SessionStatusLike } from '../src/client/types.ts'

/** Wrap one durable event as the Session binding's window entry. */
function event(type: string, seq: number, data: unknown, time = seq): EventEntryLike {
  return { type: 'event', event: { type, seq, time, data } }
}

/** A minimal catalog row. */
function row(id: string, overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id,
    displayTitle: `Session ${id}`,
    title: `Session ${id}`,
    running: false,
    blank: false,
    updatedAt: 1_000,
    cwd: `/work/${id}`,
    ...overrides,
  }
}

/** Build a catalog snapshot from rows, in the given order. */
function catalog(rows: readonly Record<string, unknown>[]): SessionListSnapshotLike {
  const byId: Record<string, never> = {}
  for (const entry of rows) (byId as Record<string, unknown>)[String(entry.id)] = entry
  return { ids: rows.map((entry) => String(entry.id)), byId: byId as never, phase: 'ready' }
}

/** Extract only the transcript row kinds, ordered. */
function kinds(rows: readonly TranscriptRow[]): string[] {
  return rows.map((entry) => entry.kind)
}

describe('usage readout', () => {
  it('sums the prompt buckets and the output', () => {
    const usage = { uncachedInputTokens: 1_000, cacheReadTokens: 9_000, cacheWriteTokens: 500, outputTokens: 250 }
    expect(billedInputTokens(usage)).toBe(10_500)
    expect(consumedTokens(usage)).toBe(10_750)
    expect(billedInputTokens(undefined)).toBe(0)
    expect(consumedTokens({})).toBe(0)
  })

  it('never rounds a near miss up to a perfect cache hit', () => {
    expect(cacheHitPercent({ uncachedInputTokens: 1, cacheReadTokens: 999 })).toBe(99)
    expect(cacheHitPercent({ cacheReadTokens: 10 })).toBe(100)
    expect(cacheHitPercent({ outputTokens: 10 })).toBeNull()
    expect(cacheHitPercent(undefined)).toBeNull()
  })

  it('resolves context occupancy from the next-request projection first', () => {
    expect(contextOccupancy({ projectedTokens: 64_000, pressureTokens: 32_000, contextWindow: 128_000 })).toEqual({
      percent: 50,
      used: 64_000,
      contextWindow: 128_000,
    })
    expect(contextOccupancy({ pressureTokens: 32_000, contextWindow: 128_000 })?.percent).toBe(25)
    expect(contextOccupancy({ projectedTokens: 200_000, contextWindow: 128_000 })?.percent).toBe(100)
    expect(contextOccupancy({ pressureTokens: 32_000 })).toBeNull()
    expect(contextOccupancy({ pressureTokens: 32_000, contextWindow: 0 })).toBeNull()
    expect(contextOccupancy(undefined)).toBeNull()
  })

  it('formats compact and exact token counts', () => {
    expect(formatCompactTokens(999)).toBe('999')
    expect(formatCompactTokens(1_200)).toBe('1.2k')
    expect(formatCompactTokens(12_500)).toBe('12.5k')
    expect(formatCompactTokens(125_000)).toBe('125k')
    expect(formatCompactTokens(1_300_000)).toBe('1.3M')
    expect(formatExactTokens(12_345)).toBe('12,345')
    expect(formatExactTokens(999)).toBe('999')
  })
})

describe('monitorState', () => {
  it('draws the reminder for a finished run until something else outranks it', () => {
    expect(monitorState(false, undefined, true)).toBe('completed')
    expect(monitorState(false, undefined, false)).toBe('idle')
    // A fresh run and a pending question both supersede the reminder.
    expect(monitorState(true, undefined, true)).toBe('running')
    expect(monitorState(true, { key: 'q' }, true)).toBe('waiting')
    expect(monitorState(false, { key: 'q' }, true)).toBe('waiting')
  })
})

describe('newestEventTime', () => {
  it('returns the newest event time, including transient rows', () => {
    expect(newestEventTime(undefined)).toBe(0)
    expect(newestEventTime([])).toBe(0)
    expect(
      newestEventTime([
        { type: 'event', event: { type: 'user/message', seq: 1, time: 10, data: {} } },
        { type: 'transient', event: { type: 'assistant/live-chunk', seq: 2, time: 30, data: {} } },
        { type: 'event', event: { type: 'tool/call', seq: 3, time: 20, data: {} } },
        { type: 'event', event: { type: 'tool/result' } },
      ]),
    ).toBe(30)
  })
})

describe('grid fit', () => {
  it('fits cards into the box with balanced columns', () => {
    // Wide, short box with nine cards: three columns keep the cells usable.
    expect(autoColumns(9, 1100, 700)).toBe(3)
    // Two cards side by side are wider than stacked alternatives.
    expect(autoColumns(2, 1100, 700)).toBe(2)
    // A tall narrow box stacks instead of squeezing.
    expect(autoColumns(4, 320, 900)).toBe(1)
    // Never more columns than cards, and never past the ceiling.
    expect(autoColumns(1, 1200, 600)).toBe(1)
    expect(autoColumns(20, 2400, 600)).toBeLessThanOrEqual(6)
  })

  it('never asks for fewer than one row', () => {
    expect(gridRows(0, 3)).toBe(1)
    expect(gridRows(1, 3)).toBe(1)
    expect(gridRows(7, 3)).toBe(3)
    expect(gridRows(6, 0)).toBe(6)
  })
})

describe('sessionTitle', () => {
  it('prefers the projected title, then the display title, then the path', () => {
    expect(sessionTitle({ id: 'a', title: 'Titled', displayTitle: 'Display' })).toBe('Titled')
    expect(sessionTitle({ id: 'a', displayTitle: 'Display' })).toBe('Display')
    expect(sessionTitle({ id: 'a', cwd: '/Users/me/workspace/project' })).toBe('workspace/project')
    expect(sessionTitle({ id: 'abcdef123456' })).toBe('abcdef12')
  })

  it('ignores a whitespace-only title', () => {
    expect(sessionTitle({ id: 'a', title: '   ', displayTitle: 'Real' })).toBe('Real')
  })
})

describe('selectMonitored', () => {
  it('orders waiting first, then running, then recency', () => {
    const list = catalog([
      row('old', { updatedAt: 10 }),
      row('busy', { running: true, updatedAt: 5 }),
      row('fresh', { updatedAt: 900 }),
      row('asked', { running: true, updatedAt: 1 }),
    ])
    const statuses = new Map<string, SessionStatusLike>([
      ['asked', { running: true, pendingInteraction: { kind: 'question', sessionId: 'asked' } }],
    ])
    const picked = selectMonitored(list, statuses, new Set(), 9)
    expect(picked.map((entry) => entry.id)).toEqual(['asked', 'busy', 'fresh', 'old'])
    expect(picked[0]?.state).toBe('waiting')
    expect(picked[1]?.state).toBe('running')
  })

  it('drops blank sessions, subagent children and removed ids', () => {
    const list = catalog([
      row('blank', { blank: true }),
      row('child', { parentId: 'parent', origin: 'subagent' }),
      row('gone'),
      row('keep'),
    ])
    const picked = selectMonitored(list, undefined, new Set(['gone']), 9)
    expect(picked.map((entry) => entry.id)).toEqual(['keep'])
  })

  it('keeps a waiting session even when the card budget is exhausted', () => {
    const rows = [row('asked'), row('a1'), row('a2'), row('a3')]
    const statuses = new Map<string, SessionStatusLike>([
      ['asked', { pendingInteraction: { kind: 'approval' } }],
    ])
    const picked = selectMonitored(catalog(rows), statuses, new Set(), 1)
    expect(picked.map((entry) => entry.id)).toEqual(['asked', 'a1'])
  })

  it('clamps the budget to the supported range', () => {
    const rows = Array.from({ length: 40 }, (_, index) => row(`s${index}`))
    const picked = selectMonitored(catalog(rows), undefined, new Set(), 999)
    // 16 is the hard ceiling; waiting sessions are none, so the budget applies.
    expect(picked.length).toBe(16)
    expect(DEFAULT_MAX_CARDS).toBeLessThanOrEqual(16)
  })

  it('labels each card with its Workspace title, falling back to the path', () => {
    const list = catalog([
      row('a', { cwd: '/work/project-a' }),
      row('b', { cwd: '/work/project-b' }),
    ])
    const picked = selectMonitored(list, undefined, new Set(), 9, {
      workspaces: [
        { workspaceId: 'w1', title: 'Release notes', sessionIds: ['a'] },
        { workspaceId: 'w2', title: '  ', sessionIds: ['b'] },
      ],
    })
    expect(picked.find((entry) => entry.id === 'a')?.workspace).toBe('Release notes')
    expect(picked.find((entry) => entry.id === 'b')?.workspace).toBe('work/project-b')
  })

  it('maps only titled Workspaces that list their members', () => {
    expect([...workspaceTitles([
      { title: 'Alpha', sessionIds: ['a', 'b'] },
      { title: '', sessionIds: ['c'] },
      { title: 'No members' },
    ])]).toEqual([['a', 'Alpha'], ['b', 'Alpha']])
    expect(workspaceTitles(undefined).size).toBe(0)
  })

  it('replaces the automatic Workspace title with the localized name', () => {
    expect(workspaceLabel('default-workspace', 'Default workspace')).toBe('Default workspace')
    expect(workspaceLabel('Release notes', 'Default workspace')).toBe('Release notes')
    expect(workspaceLabel('  ', 'Default workspace')).toBeUndefined()
    expect(workspaceLabel(undefined)).toBeUndefined()
    // Without a fallback the sentinel stays verbatim instead of turning blank.
    expect(workspaceLabel('default-workspace')).toBe('default-workspace')

    const [card] = collectSessions(
      catalog([row('a', { cwd: '/work/project-a' })]),
      undefined,
      new Set(),
      {
        workspaces: [{ workspaceId: 'w1', title: 'default-workspace', sessionIds: ['a'] }],
        defaultWorkspaceTitle: 'Default workspace',
      },
    )
    expect(card?.workspace).toBe('Default workspace')
  })

  it('shows a spawned blank session as a card, with the localized title', () => {
    const list = catalog([
      row('created', { blank: true, updatedAt: 5_000 }),
      row('ordinary', { updatedAt: 1_000 }),
    ])
    // A blank session stays out of the grid unless this panel created it.
    expect(collectSessions(list, undefined, new Set()).map((entry) => entry.id)).toEqual(['ordinary'])
    const picked = collectSessions(list, undefined, new Set(), {
      spawned: new Set(['created']),
      blankTitle: 'New Session',
    })
    expect(picked.map((entry) => entry.id)).toEqual(['created', 'ordinary'])
    expect(picked[0]?.title).toBe('New Session')
    expect(picked[0]?.state).toBe('idle')
    // A hidden id stays hidden even when it was created here.
    expect(
      collectSessions(list, undefined, new Set(['created']), {
        spawned: new Set(['created']),
        blankTitle: 'New Session',
      }).map((entry) => entry.id),
    ).toEqual(['ordinary'])
  })

  it('defaults a new session to the most recently used Workspace', () => {
    const list = catalog([
      row('a', { updatedAt: 10 }),
      row('b', { updatedAt: 50 }),
      row('c', { updatedAt: 5 }),
    ])
    const items = [
      { workspaceId: 'w1', sessionIds: ['a'] },
      { workspaceId: 'w2', sessionIds: ['b'] },
      { workspaceId: 'w3', sessionIds: [] as string[] },
    ]
    // The remembered choice outranks recency while it still exists.
    expect(defaultWorkspaceId(items, list, 'w3')).toBe('w3')
    expect(defaultWorkspaceId(items, list, undefined)).toBe('w2')
    // A Workspace that no longer exists is not a choice, and no registry has no default.
    expect(defaultWorkspaceId(items, list, 'gone')).toBe('w2')
    expect(defaultWorkspaceId([], list, undefined)).toBeUndefined()
    expect(defaultWorkspaceId(undefined, list, undefined)).toBeUndefined()
  })

  it('prefers an occupied Workspace when no catalog ranks its sessions', () => {
    const items = [
      { workspaceId: 'w1', sessionIds: [] as string[] },
      { workspaceId: 'w2', sessionIds: ['b'] },
    ]
    expect(defaultWorkspaceId(items, undefined, undefined)).toBe('w2')
    // Host order is the last tie-break; a row without an id is never chosen.
    expect(defaultWorkspaceId([{ workspaceId: 'w9', sessionIds: [] as string[] }], undefined, undefined)).toBe('w9')
    expect(defaultWorkspaceId([{ title: 'No id' }], undefined, undefined)).toBeUndefined()
  })

  it('returns nothing without a catalog', () => {
    expect(selectMonitored(undefined, undefined, new Set(), 9)).toEqual([])
  })
})

describe('deriveTranscript', () => {
  it('keeps human turns and drops injected context', () => {
    const entries: EventEntryLike[] = [
      event('user/message', 1, { content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } }),
      event('user/message', 2, { content: [{ type: 'text', text: 'hidden' }], source: { kind: 'runtime-context' } }),
      event('user/message', 3, { content: [{ type: 'text', text: 'answered' }], source: { kind: 'user-question-reply' } }),
      event('user/message', 4, { content: [{ type: 'text', text: 'seeded' }] }),
    ]
    const rows = deriveTranscript(entries)
    const users = rows.filter((entry): entry is Extract<TranscriptRow, { kind: 'user' }> => entry.kind === 'user')
    expect(users.map((entry) => entry.text)).toEqual(['hello', 'answered', 'seeded'])
  })

  it('merges a tool call with its result and marks failures', () => {
    const entries: EventEntryLike[] = [
      event('tool/call', 10, { callId: 'c1', name: 'bash', arguments: '{"command":"ls","description":"list"}' }),
      event('tool/call', 11, { callId: 'c2', name: 'read', arguments: 'not json' }),
      event('tool/result', 12, { toolCallId: 'c1', message: { content: [{ type: 'text', text: 'ok output' }] } }),
      event('tool/result', 13, {
        toolCallId: 'c2',
        message: { content: [{ type: 'text', text: 'boom' }], isError: true },
      }),
    ]
    const rows = deriveTranscript(entries)
    expect(rows).toHaveLength(2)
    const [first, second] = rows
    expect(first?.kind).toBe('tool')
    expect(second?.kind).toBe('tool')
    if (first?.kind !== 'tool' || second?.kind !== 'tool') throw new Error('unreachable')
    expect(first.name).toBe('bash')
    expect(first.detail).toContain('command=ls')
    expect(first.status).toBe('done')
    expect(second.status).toBe('error')
    expect(second.detail).toBe('boom')
  })

  it('accumulates streamed text deltas into one live row', () => {
    const live = (seq: number, text: string): EventEntryLike => ({
      type: 'transient',
      event: {
        type: 'assistant/live-chunk',
        seq,
        time: seq,
        data: { attemptId: 'a1', turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text } },
      },
    })
    const rows = deriveTranscript([live(1, 'Hel'), live(2, 'lo'), live(3, '!')])
    expect(rows).toHaveLength(1)
    const [only] = rows
    if (only?.kind !== 'assistant') throw new Error('unreachable')
    expect(only.text).toBe('Hello!')
    expect(only.live).toBe(true)
  })

  it('keeps a long message whole instead of clipping it', () => {
    // 5,000 characters: the card scrolls, so the row must not swallow the rest
    // of the answer behind an ellipsis.
    const phrase = '- I cannot find the code that '
    const long = `${'a'.repeat(2_499)}${phrase}${'b'.repeat(5_000 - 2_499 - phrase.length)}`
    expect(long.length).toBe(5_000)
    const rows = deriveTranscript([
      event('assistant/message', 1, { message: { content: [{ type: 'text', text: long }] } }),
      event('user/message', 2, { content: [{ type: 'text', text: long }], source: { kind: 'user' } }),
    ])
    expect(rows).toHaveLength(2)
    const [assistant, user] = rows
    expect(assistant?.kind === 'assistant' ? assistant.text : undefined).toBe(long)
    expect(user?.kind === 'user' ? user.text : undefined).toBe(long)
    expect(
      rows.some((entry) => (entry.kind === 'user' || entry.kind === 'assistant') && entry.text.includes('…')),
    ).toBe(false)
  })

  it('keeps a streamed answer whole past any text budget', () => {
    const live = (seq: number, text: string): EventEntryLike => ({
      type: 'transient',
      event: {
        type: 'assistant/live-chunk',
        seq,
        time: seq,
        data: { attemptId: 'a1', turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text } },
      },
    })
    const deltas = Array.from({ length: 5 }, (_, index) => `chunk${index}-${'x'.repeat(1_000)} `)
    const rows = deriveTranscript(deltas.map((text, index) => live(index + 1, text)))
    const [only] = rows
    if (only?.kind !== 'assistant') throw new Error('unreachable')
    expect(only.text).toBe(deltas.join(''))
    expect(only.text.endsWith('…')).toBe(false)
  })

  it('renders approvals and retries as localized notice codes', () => {
    const rows = deriveTranscript([
      event('approval/asked', 1, { toolName: 'bash' }),
      event('approval/decided', 2, { outcome: 'rejected' }),
      event('llm/retry', 3, { reason: 'rate limited' }),
    ])
    expect(rows.map((entry) => (entry.kind === 'notice' ? entry.code : ''))).toEqual([
      'approval-asked',
      'approval-decided',
      'retry',
    ])
    expect(rows[1]?.kind === 'notice' && rows[1].tone).toBe('error')
  })

  it('ignores assistant messages with no text and unknown event types', () => {
    const rows = deriveTranscript([
      event('assistant/message', 1, { message: { content: [{ type: 'reasoning', text: 'thinking' }] } }),
      event('todo/write', 2, { todos: [] }),
    ])
    expect(rows).toEqual([])
  })

  it('keeps only the recent window', () => {
    const entries: EventEntryLike[] = Array.from({ length: 90 }, (_, index) =>
      event('user/message', index, {
        content: [{ type: 'text', text: `m${index}` }],
        source: { kind: 'user' },
      }),
    )
    const rows = deriveTranscript(entries)
    expect(rows).toHaveLength(60)
    const first = rows[0]
    const last = rows.at(-1)
    expect(first?.kind === 'user' ? first.text : undefined).toBe('m30')
    expect(last?.kind === 'user' ? last.text : undefined).toBe('m89')
    expect(kinds(rows).every((kind) => kind === 'user')).toBe(true)
  })

  it('tolerates malformed entries', () => {
    expect(deriveTranscript([{}, { type: 'event' }, { event: {} }])).toEqual([])
    expect(deriveTranscript(undefined)).toEqual([])
  })
})

describe('summarizeArguments', () => {
  it('shows the first two keys of parsed arguments', () => {
    expect(summarizeArguments('{"command":"ls -la","description":"list","other":1}')).toBe(
      'command=ls -la · description=list',
    )
  })

  it('describes non-string values compactly', () => {
    expect(summarizeArguments('{"limit":20,"deep":true,"items":[1,2,3],"nested":{"a":1}}')).toBe(
      'limit=20 · deep=true',
    )
  })

  it('falls back to the raw prefix when the JSON is broken', () => {
    const raw = `{broken ${'x'.repeat(200)}`
    expect(summarizeArguments(raw)).toBe(`${raw.replace(/\s+/g, ' ').slice(0, 80)}…`)
    expect(summarizeArguments('')).toBe('')
    expect(summarizeArguments(undefined)).toBe('')
  })
})

describe('relativeLabel', () => {
  it('classifies timestamps against the current clock', () => {
    const now = Date.parse('2026-11-01T12:00:00Z')
    expect(relativeLabel(now, now - 1_000)).toEqual({ unit: 'now' })
    expect(relativeLabel(now, now - 5 * 60_000)).toEqual({ unit: 'minute', count: 5 })
    expect(relativeLabel(now, now - 3 * 3_600_000)).toEqual({ unit: 'hour', count: 3 })
    expect(relativeLabel(now, now - 2 * 86_400_000)).toEqual({ unit: 'day', count: 2 })
    expect(relativeLabel(now, 0)).toBeUndefined()
    expect(relativeLabel(now, Number.NaN)).toBeUndefined()
  })

  it('formats an older timestamp as a date', () => {
    const label = relativeLabel(Date.parse('2026-11-01T00:00:00Z'), Date.parse('2026-09-01T00:00:00Z'))
    expect(label?.unit).toBe('date')
  })
})
describe('permission presets', () => {
  it('maps the built-in preset values to this plugin\'s own labels', () => {
    expect(permissionLabelKey('read-only')).toBe('permReadOnly')
    expect(permissionLabelKey('workspace-write')).toBe('permWorkspaceWrite')
    expect(permissionLabelKey('danger-full-access')).toBe('permFullAccess')
    expect(permissionLabelKey('auto')).toBe('permAuto')
    expect(permissionLabelKey('custom')).toBe('permCustom')
    expect(permissionLabelKey('team-policy')).toBeUndefined()
    expect(permissionLabelKey(undefined)).toBeUndefined()
  })

  it('title-cases a conventional kebab-case name and leaves a product label alone', () => {
    expect(displayPresetName('team-policy')).toBe('Team Policy')
    expect(displayPresetName('Full access')).toBe('Full access')
  })

  it('asks for confirmation only on Auto review — Full access is an explicit pick', () => {
    expect(needsPermissionConfirmation('auto')).toBe(true)
    expect(needsPermissionConfirmation('danger-full-access')).toBe(false)
    expect(needsPermissionConfirmation('workspace-write')).toBe(false)
    expect(needsPermissionConfirmation('read-only')).toBe(false)
  })
})

/** One displayed-card shape, reduced to the fields the order reconcile reads. */
function card(id: string, updatedAt: number, state: 'idle' | 'running' | 'waiting' = 'idle') {
  return {
    id,
    title: id,
    cwd: undefined,
    workspace: undefined,
    running: state === 'running',
    pending: state === 'waiting' ? { key: `p-${id}` } : undefined,
    updatedAt,
    state,
    completionUnread: false,
  }
}

describe('frozen grid order', () => {
  it('keeps the displayed order when activity changes', () => {
    // A new prompt would order c, b, a by recency; the displayed order must win.
    const candidates = [card('a', 10), card('b', 20), card('c', 30)]
    expect(reconcileOrder(['a', 'b', 'c'], candidates, 3)).toEqual(['a', 'b', 'c'])
  })

  it('appends a session that appears while there is room', () => {
    const candidates = [card('a', 10), card('b', 20), card('d', 5)]
    expect(reconcileOrder(['a', 'b'], candidates, 3)).toEqual(['a', 'b', 'd'])
  })

  it('gives a new session the slot of the least recently used card on a full grid', () => {
    const candidates = [card('a', 10), card('b', 30), card('c', 20), card('d', 40)]
    // `a` is the oldest at index 0; the new card takes that slot in place, and
    // the displaced card stays known at the tail, where the budget hides it.
    expect(reconcileOrder(['a', 'b', 'c'], candidates, 3)).toEqual(['d', 'b', 'c', 'a'])
    expect(displayOrder(['d', 'b', 'c', 'a'], candidates, 3)).toEqual(['d', 'b', 'c'])
  })

  it('does not let a displaced card push another card out on the next reconcile', () => {
    const candidates = [card('a', 10), card('b', 30), card('c', 20), card('d', 40)]
    const first = reconcileOrder(['a', 'b', 'c'], candidates, 3)
    // A card dropped from the order would look like a new arrival and evict `c`
    // next time; keeping it at the tail makes the grid stable.
    expect(reconcileOrder(first, candidates, 3)).toEqual(first)
    expect(displayOrder(reconcileOrder(first, candidates, 3), candidates, 3)).toEqual([
      'd',
      'b',
      'c',
    ])
  })

  it('never displaces a waiting card, replacing the oldest ordinary one instead', () => {
    const candidates = [card('a', 5, 'waiting'), card('b', 30), card('c', 40)]
    // Measured by index: `a` stays at 0 while `b` (ordinary, index 1) yields.
    expect(reconcileOrder(['a', 'b'], candidates, 1)).toEqual(['a', 'c', 'b'])
    expect(displayOrder(['a', 'c', 'b'], candidates, 1)).toEqual(['a', 'c'])
  })

  it('keeps the frozen order when the budget shrinks, and reveals it again when it grows', () => {
    const candidates = [card('a', 10), card('b', 20), card('c', 30)]
    const order = reconcileOrder(['a', 'b', 'c'], candidates, 2)
    expect(order).toEqual(['a', 'b', 'c'])
    expect(displayOrder(order, candidates, 2)).toEqual(['a', 'b'])
    expect(displayOrder(order, candidates, 9)).toEqual(['a', 'b', 'c'])
  })

  it('always shows a waiting card, even past the ordinary budget', () => {
    const candidates = [card('a', 10), card('b', 20, 'waiting'), card('c', 30)]
    expect(displayOrder(['a', 'b', 'c'], candidates, 1)).toEqual(['a', 'b'])
  })

  it('never re-ranks when the budget shrinks: it hides the tail and keeps the rest in place', () => {
    const candidates = [card('a', 10), card('b', 20), card('c', 30)]
    // Activity says c is the newest, but a smaller budget must not move anyone:
    // the frozen positions stay and only the shown prefix shrinks.
    const order = orderOrSeed(['a', 'b', 'c'], candidates, 2)
    expect(order).toEqual(['a', 'b', 'c'])
    expect(displayOrder(order, candidates, 2)).toEqual(['a', 'b'])
    // Raising it again reveals the same tail, in place.
    expect(displayOrder(order, candidates, 3)).toEqual(['a', 'b', 'c'])
  })

  it('seeds by precedence only when no order is stored, then keeps the stored order', () => {
    const candidates = [card('a', 10), card('b', 20), card('c', 30)]
    expect(orderOrSeed([], candidates, 3)).toEqual(['c', 'b', 'a'])
    // A stored order wins over recency, which is what keeps a remount still.
    expect(orderOrSeed(['a', 'c', 'b'], candidates, 3)).toEqual(['a', 'c', 'b'])
  })

  it('appends a session that is not in the stored order while there is room', () => {
    const candidates = [card('a', 10), card('b', 20), card('c', 30)]
    expect(orderOrSeed(['b', 'a'], candidates, 3)).toEqual(['b', 'a', 'c'])
  })

  it('drops a displayed session that disappeared and leaves the rest in place', () => {
    const candidates = [card('a', 10), card('c', 30)]
    expect(reconcileOrder(['a', 'b', 'c'], candidates, 3)).toEqual(['a', 'c'])
  })
})
