/**
 * The session-wide flow derivation, driven with plain event fixtures.
 *
 * These are the rules the flow view's honesty depends on: a human prompt is a
 * numbered group, its steps are numbered under it (`1.1`, `2.1`), only human
 * sources count as prompts, the running step follows the session's run state, and
 * a turn error is reported rather than shown as a tidy completion.
 *
 * The derivation is the one `dsh-session-progress` draws; these fixtures pin the
 * port so the embedded view cannot drift from the original panel.
 *
 * @module dsh-session-monitor/test/flow
 */

import { describe, expect, it } from 'vitest'
import {
  argumentFilePath,
  deriveProgress,
  formatClock,
  formatStamp,
  shortFileName,
  summarizeArguments,
  type PromptItem,
  type StepItem,
} from '../src/client/flowProgress.ts'
import type { EventEntryLike } from '../src/client/types.ts'

/** One event entry at a synthetic time. */
function entry(type: string, seq: number, data: unknown, time = 1_000 + seq): EventEntryLike {
  return { type: 'durable', event: { type, seq, time, data } }
}

/** A human prompt (or another user-role message, by source kind). */
function prompt(text: string, seq: number, kind = 'user'): EventEntryLike {
  return entry('user/message', seq, { id: `m${seq}`, content: [{ type: 'text', text }], source: { kind } })
}

/** An assistant message inside the current step. */
function assistant(text: string, seq: number): EventEntryLike {
  return entry('assistant/message', seq, { message: { content: [{ type: 'text', text }] } })
}

/** One streamed text delta inside the current step. */
function delta(text: string, seq: number): EventEntryLike {
  return entry('assistant/live-chunk', seq, { attemptId: 'a', chunk: { type: 'text-delta', text } })
}

/** A tool call. */
function call(callId: string, name: string, args: Record<string, unknown>, seq: number): EventEntryLike {
  return entry('tool/call', seq, { callId, name, arguments: JSON.stringify(args) })
}

/** A tool result. */
function result(callId: string, failed = false, seq = 0): EventEntryLike {
  return entry('tool/result', seq, {
    toolCallId: callId,
    message: { content: [{ type: 'text', text: failed ? 'failed' : 'ok' }], isError: failed },
  })
}

/** Turn boundaries. */
const turnStart = (turn: number, seq: number): EventEntryLike => entry('turn/start', seq, { turn })
const turnEnd = (turn: number, seq: number, error?: string): EventEntryLike =>
  entry(
    'turn/end',
    seq,
    error === undefined ? { turn, reason: { kind: 'completed' } } : { turn, reason: { kind: 'error', error: { message: error } } },
  )
const stepStart = (turn: number, step: number, seq: number): EventEntryLike =>
  entry('step/start', seq, { turn, step })
const stepEnd = (turn: number, step: number, seq: number): EventEntryLike =>
  entry('step/end', seq, { turn, step })

/** A one-prompt, two-step session. */
function oneTurn(): EventEntryLike[] {
  return [
    turnStart(1, 1),
    prompt('Fix the login bug', 2),
    stepStart(1, 1, 3),
    assistant('Looking at the auth module', 4),
    call('c1', 'read', { path: 'src/auth.ts' }, 5),
    result('c1', false, 6),
    stepEnd(1, 1, 7),
    stepStart(1, 2, 8),
    call('c2', 'edit', { file_path: 'src/auth.ts' }, 9),
    assistant('Changed the guard', 10),
    result('c2', false, 11),
    stepEnd(1, 2, 12),
    turnEnd(1, 13),
  ]
}

/** The prompt rows of a model. */
function promptsOf(items: readonly (PromptItem | StepItem)[]): PromptItem[] {
  return items.filter((item): item is PromptItem => item.kind === 'prompt')
}

/** The step rows of a model. */
function stepsOf(items: readonly (PromptItem | StepItem)[]): StepItem[] {
  return items.filter((item): item is StepItem => item.kind === 'step')
}

describe('deriveProgress', () => {
  it('is total on an absent window', () => {
    const model = deriveProgress(undefined, { sessionRunning: undefined, waiting: false })
    expect(model.present).toBe(false)
    expect(model.items).toEqual([])
    expect(model.activity.kind).toBe('idle')
  })

  it('shows an opened session with no events as present and empty', () => {
    const model = deriveProgress([], { sessionRunning: false, waiting: false })
    expect(model.present).toBe(true)
    expect(model.items).toEqual([])
    expect(model.prompts).toBe(0)
  })

  it('numbers a prompt and its steps', () => {
    const model = deriveProgress(oneTurn(), { sessionRunning: false, waiting: false })
    expect(model.prompts).toBe(1)
    expect(model.stepTotal).toBe(2)
    expect(promptsOf(model.items).map((item) => item.index)).toEqual([1])
    expect(stepsOf(model.items).map((item) => item.label)).toEqual(['1.1', '1.2'])
    expect(stepsOf(model.items).map((item) => item.status)).toEqual(['done', 'done'])
    expect(promptsOf(model.items)[0]?.text).toBe('Fix the login bug')
    expect(model.prompt).toBe('Fix the login bug')
    expect(stepsOf(model.items)[0]?.text).toBe('Looking at the auth module')
    // The row timestamp is the step's own start, not the turn's.
    expect(stepsOf(model.items)[0]?.at).toBe(1_003)
    expect(stepsOf(model.items)[1]?.file).toEqual({ verb: 'edit', name: 'src/auth.ts' })
    expect(model.done).toBe(2)
    expect(model.endedAt).toBeGreaterThan(0)
  })

  it('restarts the step numbering under a second prompt', () => {
    const events = [
      turnStart(1, 1),
      prompt('First request', 2),
      stepStart(1, 1, 3),
      assistant('Did the first', 4),
      stepEnd(1, 1, 5),
      turnEnd(1, 6),
      turnStart(2, 7),
      prompt('Second request', 8),
      stepStart(2, 1, 9),
      assistant('Did the second', 10),
      stepEnd(2, 1, 11),
      turnEnd(2, 12),
    ]
    const model = deriveProgress(events, { sessionRunning: false, waiting: false })
    expect(model.prompts).toBe(2)
    expect(model.stepTotal).toBe(2)
    expect(model.items.map((item) => (item.kind === 'prompt' ? `P${item.index}` : item.label))).toEqual([
      'P1',
      '1.1',
      'P2',
      '2.1',
    ])
    expect(stepsOf(model.items)[1]?.prompt).toBe(2)
  })

  it('puts a prompt above the step that was already open when it arrived', () => {
    // The agent loop opens the step first, then claims the queued user message
    // into it; the prompt must still own that step and read above it.
    const events = [
      turnStart(1, 1),
      stepStart(1, 1, 2),
      prompt('install the skill', 3),
      assistant('done', 4),
      stepEnd(1, 1, 5),
      turnEnd(1, 6),
    ]
    const model = deriveProgress(events, { sessionRunning: false, waiting: false })
    expect(model.items.map((item) => (item.kind === 'prompt' ? `P${item.index}` : item.label))).toEqual(['P1', '1.1'])
    expect(promptsOf(model.items)[0]?.text).toBe('install the skill')
  })

  it('does not count an approval reply as a prompt', () => {
    const events = [
      turnStart(1, 1),
      stepStart(1, 1, 2),
      prompt('The approval policy changed', 3, 'user-approval'),
      prompt('the real prompt', 4),
      assistant('done', 5),
      stepEnd(1, 1, 6),
      turnEnd(1, 7),
    ]
    const model = deriveProgress(events, { sessionRunning: false, waiting: false })
    expect(model.prompts).toBe(1)
    expect(promptsOf(model.items)[0]?.text).toBe('the real prompt')
    expect(model.items.map((item) => (item.kind === 'prompt' ? `P${item.index}` : item.label))).toEqual(['P1', '1.1'])
  })

  it('ignores non-human user-role messages', () => {
    const events = [turnStart(1, 1), prompt('context notice', 2, 'agent.inject'), prompt('human', 3)]
    const model = deriveProgress(events, { sessionRunning: false, waiting: false })
    expect(model.prompts).toBe(1)
    expect(promptsOf(model.items)[0]?.text).toBe('human')
  })

  it('hides a step that names no purpose, and closes the numbering gap', () => {
    const events = [
      turnStart(1, 1),
      prompt('Package it', 2),
      // Step 1 only reads a file and says nothing: it has no purpose to show.
      stepStart(1, 1, 3),
      call('c1', 'read', { path: 'src/a.ts' }, 4),
      result('c1', false, 5),
      stepEnd(1, 1, 6),
      stepStart(1, 2, 7),
      call('c2', 'write', { file_path: 'pkg/skill.md' }, 8),
      result('c2', false, 9),
      stepEnd(1, 2, 10),
      stepStart(1, 3, 11),
      call('c3', 'bash', { command: 'pnpm test' }, 12),
      result('c3', false, 13),
      stepEnd(1, 3, 14),
      turnEnd(1, 15),
    ]
    const model = deriveProgress(events, { sessionRunning: false, waiting: false })
    expect(model.items.map((item) => (item.kind === 'prompt' ? `P${item.index}` : item.label))).toEqual([
      'P1',
      '1.1',
      '1.2',
    ])
    const steps = stepsOf(model.items)
    expect(steps[0]?.files).toEqual([{ verb: 'write', name: 'pkg/skill.md' }])
    expect(steps[1]?.command).toBe('pnpm test')
    expect(model.stepTotal).toBe(2)
  })

  it('keeps every file a step wrote, not only the last one', () => {
    const events = [
      turnStart(1, 1),
      prompt('Write the docs', 2),
      stepStart(1, 1, 3),
      call('c1', 'write', { file_path: 'docs/a.md' }, 4),
      call('c2', 'write', { file_path: 'docs/b.md' }, 5),
      call('c3', 'edit', { file_path: 'docs/a.md' }, 6),
      result('c1', false, 7),
      result('c2', false, 8),
      result('c3', false, 9),
      stepEnd(1, 1, 10),
      turnEnd(1, 11),
    ]
    const model = deriveProgress(events, { sessionRunning: false, waiting: false })
    expect(stepsOf(model.items)[0]?.files).toEqual([
      { verb: 'write', name: 'docs/a.md' },
      { verb: 'write', name: 'docs/b.md' },
    ])
  })

  it('keeps a bash step that says nothing, carrying its command for the describing call', () => {
    const events = [
      turnStart(1, 1),
      prompt('Run it', 2),
      stepStart(1, 1, 3),
      call('c1', 'bash', { command: 'git status --short' }, 4),
      result('c1', false, 5),
      stepEnd(1, 1, 6),
      turnEnd(1, 7),
    ]
    const model = deriveProgress(events, { sessionRunning: false, waiting: false })
    expect(stepsOf(model.items)[0]?.command).toBe('git status --short')
    expect(stepsOf(model.items)[0]?.text).toBe('')
  })

  it('keeps the whole shell command, collapsed to one line, for the describing model', () => {
    const events = [
      turnStart(1, 1),
      prompt('Run it', 2),
      stepStart(1, 1, 3),
      call('c1', 'bash', { command: 'cd app &&\n  pnpm test --filter core\n' }, 4),
      result('c1', false, 5),
      stepEnd(1, 1, 6),
      turnEnd(1, 7),
    ]
    const model = deriveProgress(events, { sessionRunning: false, waiting: false })
    expect(stepsOf(model.items)[0]?.command).toBe('cd app && pnpm test --filter core')
  })

  it('marks the open step as running and reads its live tool call', () => {
    const events = [
      turnStart(1, 1),
      prompt('Run the tests', 2),
      stepStart(1, 1, 3),
      call('c1', 'bash', { command: 'pnpm test' }, 4),
    ]
    const model = deriveProgress(events, { sessionRunning: true, waiting: false })
    expect(stepsOf(model.items)[0]?.status).toBe('running')
    expect(model.running).toBe(true)
    expect(model.activity.kind).toBe('tool')
    expect(model.activity.tool).toBe('bash')
    expect(model.activity.detail).toContain('command=pnpm test')
    expect(model.activity.command).toBe('pnpm test')
  })

  it('leaves the activity command unset for a non-shell tool', () => {
    const events = [
      turnStart(1, 1),
      prompt('Read it', 2),
      stepStart(1, 1, 3),
      call('c1', 'read', { path: 'src/a.ts' }, 4),
    ]
    const model = deriveProgress(events, { sessionRunning: true, waiting: false })
    expect(model.activity.kind).toBe('tool')
    expect(model.activity.command).toBeUndefined()
  })

  it('carries streamed text on the running step and in the activity card', () => {
    const events = [turnStart(1, 1), prompt('Think', 2), stepStart(1, 1, 3), delta('Weighing ', 4), delta('options', 5)]
    const model = deriveProgress(events, { sessionRunning: true, waiting: false })
    expect(stepsOf(model.items)[0]?.live).toBe('Weighing options')
    expect(model.activity.kind).toBe('thinking')
    expect(model.activity.text).toBe('Weighing options')
  })

  it('counts a failed tool result against its step without failing the step', () => {
    const events = [
      turnStart(1, 1),
      prompt('Run', 2),
      stepStart(1, 1, 3),
      call('c1', 'bash', { command: 'false' }, 4),
      result('c1', true, 5),
      stepEnd(1, 1, 6),
      turnEnd(1, 7),
    ]
    const model = deriveProgress(events, { sessionRunning: false, waiting: false })
    expect(stepsOf(model.items)[0]?.failed).toBe(1)
    expect(stepsOf(model.items)[0]?.status).toBe('done')
  })

  it('marks the failing step and reports the turn error', () => {
    const events = [
      turnStart(1, 1),
      prompt('Try it', 2),
      stepStart(1, 1, 3),
      assistant('Calling the provider', 4),
      turnEnd(1, 5, 'Rate limit reached'),
    ]
    const model = deriveProgress(events, { sessionRunning: false, waiting: false })
    expect(stepsOf(model.items)[0]?.status).toBe('error')
    expect(model.failed).toBe(1)
    expect(model.error).toBe('Rate limit reached')
  })

  it('reports a waiting session ahead of a running one', () => {
    const events = [turnStart(1, 1), prompt('Ship it', 2), stepStart(1, 1, 3)]
    const model = deriveProgress(events, {
      sessionRunning: true,
      waiting: true,
      pending: { kind: 'approval', toolName: 'bash', reason: 'needs the sandbox' },
    })
    expect(model.waiting).toBe(true)
    expect(model.activity.kind).toBe('waiting')
    expect(model.activity.detail).toBe('needs the sandbox')
  })

  it('normalises a localized approval reason to one string', () => {
    const events = [turnStart(1, 1), prompt('Go', 2), stepStart(1, 1, 3)]
    const model = deriveProgress(events, {
      sessionRunning: true,
      waiting: true,
      pending: { kind: 'approval', displayReason: { en: 'Sandbox expansion', zh: '扩展沙箱' } },
    })
    expect(model.activity.detail).toBe('Sandbox expansion')
  })

  it('flattens light Markdown out of a step title', () => {
    const events = [
      turnStart(1, 1),
      prompt('Go', 2),
      stepStart(1, 1, 3),
      assistant('**Done** with `src/a.ts`\n## Next\n- wire the test', 4),
      stepEnd(1, 1, 5),
      turnEnd(1, 6),
    ]
    const model = deriveProgress(events, { sessionRunning: false, waiting: false })
    expect(stepsOf(model.items)[0]?.text).toBe('Done with src/a.ts Next wire the test')
  })

  it('keeps a step that opened before any prompt, numbered 0', () => {
    const events = [turnStart(1, 1), stepStart(1, 1, 2), assistant('prelude', 3), stepEnd(1, 1, 4), turnEnd(1, 5)]
    const model = deriveProgress(events, { sessionRunning: false, waiting: false })
    expect(stepsOf(model.items)[0]?.label).toBe('0.1')
  })
})

describe('formatClock', () => {
  it('renders minutes and seconds, then hours', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(7_000)).toBe('0:07')
    expect(formatClock(65_000)).toBe('1:05')
    expect(formatClock(3_723_000)).toBe('1:02:03')
    expect(formatClock(Number.NaN)).toBe('0:00')
  })
})

describe('formatStamp', () => {
  it('formats a local instant as a zero-padded clock', () => {
    const at = new Date(2026, 10, 22, 14, 30, 5).getTime()
    expect(formatStamp(at)).toBe('14:30:05')
    const early = new Date(2026, 0, 2, 3, 4, 9).getTime()
    expect(formatStamp(early)).toBe('03:04:09')
  })

  it('omits an absent or unusable instant', () => {
    expect(formatStamp(0)).toBe('')
    expect(formatStamp(Number.NaN)).toBe('')
    expect(formatStamp(-1)).toBe('')
  })
})

describe('argument helpers', () => {
  it('summarises the first two argument keys', () => {
    expect(summarizeArguments('{"path":"src/a.ts","limit":10}')).toBe('path=src/a.ts · limit=10')
    expect(summarizeArguments('not json')).toBe('not json')
    expect(summarizeArguments(undefined)).toBe('')
  })

  it('reads a file argument and ignores long content values', () => {
    expect(argumentFilePath('{"file_path":"src/a.ts"}')).toBe('src/a.ts')
    expect(argumentFilePath('{"content":"x\\ny"}')).toBeUndefined()
    expect(argumentFilePath('')).toBeUndefined()
  })

  it('shortens a path to two segments', () => {
    expect(shortFileName('/Users/me/project/src/a.ts')).toBe('src/a.ts')
    expect(shortFileName('README.md')).toBe('README.md')
  })
})