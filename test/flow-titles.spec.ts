/**
 * The flow view's central promise: a shell command is never drawn.
 *
 * These tests drive the pure pieces behind a step row — the local phrase
 * classifier, the title rule and the activity detail rule — with a translate seat
 * that records what would be rendered. If a command's text ever reaches the
 * title, the assertion fails.
 *
 * The rules match `dsh-session-progress` 0.3.5: a described or local purpose is
 * the title itself (no "Using bash:" prefix), and the first letter is
 * capitalized.
 *
 * @module dsh-session-monitor/test/flow-titles
 */

import { describe, expect, it } from 'vitest'
import { bashPurposeHint } from '../src/client/flowBashPurpose.ts'
import { EMPTY_PROGRESS, type StepItem } from '../src/client/flowProgress.ts'
import { activityDetail, capitalizeFirst, stepTitle } from '../src/client/flowTitles.ts'
import type { MonitorTranslate } from '../src/client/locales.ts'

/** A translate seat that renders its key and parameters, so tests can assert both. */
const t: MonitorTranslate = (key, params) => {
  // One real phrase, so the capitalization rule is observable through the seat.
  if (key === 'flowBashPurposeTests') return 'running tests'
  if (params === undefined) return key
  const rendered = Object.entries(params)
    .map(([name, value]) => `${name}=${value}`)
    .join(',')
  return `${key}(${rendered})`
}

/** One step fixture. */
function step(overrides: Partial<StepItem> = {}): StepItem {
  return {
    kind: 'step',
    key: 'step:1',
    at: 1_000,
    prompt: 1,
    index: 1,
    label: '1.1',
    status: 'done',
    text: '',
    live: '',
    tools: ['bash'],
    files: [],
    file: undefined,
    command: 'pnpm test',
    calls: 1,
    failed: 0,
    ...overrides,
  }
}

describe('bashPurposeHint', () => {
  it('classifies the common intents without returning any command text', () => {
    expect(bashPurposeHint('pnpm install')).toBe('flowBashPurposeInstall')
    expect(bashPurposeHint('cd app && pnpm install --frozen-lockfile')).toBe('flowBashPurposeInstall')
    expect(bashPurposeHint('pnpm test')).toBe('flowBashPurposeTests')
    expect(bashPurposeHint('python3 -m pytest -q')).toBe('flowBashPurposeTests')
    expect(bashPurposeHint('pnpm build')).toBe('flowBashPurposeBuild')
    expect(bashPurposeHint('git status --short')).toBe('flowBashPurposeGit')
    expect(bashPurposeHint('rg "TODO" src')).toBe('flowBashPurposeSearch')
    expect(bashPurposeHint('curl -s https://example.test/health')).toBe('flowBashPurposeNetwork')
    expect(bashPurposeHint('ls -la reports')).toBe('flowBashPurposeFiles')
    expect(bashPurposeHint('ps aux')).toBe('flowBashPurposeProcesses')
    expect(bashPurposeHint('python3 script.py')).toBe('flowBashPurposeScript')
    expect(bashPurposeHint('pnpm outdated')).toBe('flowBashPurposePackages')
    expect(bashPurposeHint('echo hello')).toBe('flowBashPurposeGeneric')
  })

  it('does not let a commit message change the classification', () => {
    expect(bashPurposeHint('git commit -m "fix pytest config"')).toBe('flowBashPurposeGit')
  })
})

describe('stepTitle', () => {
  it('prints the described purpose for a wordless shell step, never the command', () => {
    const command = 'docker run --rm -v /tmp:/work image:tag pnpm test --filter core'
    const title = stepTitle(step({ command }), t, () => 'running the core test suite')
    expect(title).toBe('Running the core test suite')
    expect(title).not.toContain(command)
  })

  it('falls back to the local phrase when no description arrived', () => {
    const command = 'docker run --rm -v /tmp:/work image:tag pnpm test --filter core'
    const title = stepTitle(step({ command }), t, () => undefined)
    expect(title).toBe('Running tests')
    expect(title).not.toContain(command)
  })

  it('keeps the agent words ahead of any command description', () => {
    const title = stepTitle(step({ text: 'Running the tests', command: 'pnpm test' }), t, () => 'run tests')
    expect(title).toBe('Running the tests')
  })

  it('keeps a write visible ahead of a command', () => {
    const item = step({ text: '', command: 'pnpm test', files: [{ verb: 'write', name: 'docs/a.md' }] })
    expect(stepTitle(item, t, () => 'run tests')).toBe('flowStepWriting(name=docs/a.md)')
  })

  it('prefers live text while the step runs', () => {
    const item = step({ status: 'running', live: 'Watching the output', command: 'pnpm test' })
    expect(stepTitle(item, t, () => 'run tests')).toBe('Watching the output')
  })
})

describe('activityDetail', () => {
  const base = {
    ...EMPTY_PROGRESS,
    present: true,
    running: true,
    activity: {
      kind: 'tool' as const,
      tool: 'bash',
      detail: 'command=pnpm test',
      command: 'pnpm test',
      text: undefined,
    },
  }

  it('shows the purpose, not the shell argument hint, capitalized', () => {
    expect(activityDetail(base, true, t, () => 'running the tests')).toBe('Running the tests')
  })

  it('falls back to the local phrase before a description arrives', () => {
    expect(activityDetail(base, true, t, () => undefined)).toBe('Running tests')
  })

  it('shows a non-shell tool argument hint as before', () => {
    const model = {
      ...base,
      activity: { kind: 'tool' as const, tool: 'read', detail: 'path=src/a.ts', command: undefined, text: undefined },
    }
    expect(activityDetail(model, true, t, () => undefined)).toBe('path=src/a.ts')
  })

  it('shows nothing when the view disables tool details', () => {
    expect(activityDetail(base, false, t, () => 'running the tests')).toBeUndefined()
  })
})

describe('capitalizeFirst', () => {
  it('uppercases only the first character', () => {
    expect(capitalizeFirst('check running web server and logs')).toBe('Check running web server and logs')
    expect(capitalizeFirst('Already upper')).toBe('Already upper')
    expect(capitalizeFirst('123 tests')).toBe('123 tests')
    expect(capitalizeFirst('运行测试')).toBe('运行测试')
    expect(capitalizeFirst('')).toBe('')
  })
})