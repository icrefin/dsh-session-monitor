/**
 * The flow view rendered to static markup.
 *
 * The jsdom page test opens the page and switches modes; this test renders the
 * embedded view itself, so the header, the numbered list and the footer are
 * checked as markup rather than as pixels. It also writes a standalone preview
 * page when `FLOW_PREVIEW_OUT` names a path, which is how the visual check of the
 * embedded view was taken without a browser-control tool.
 *
 * @module dsh-session-monitor/test/flow-view
 */

import { writeFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FlowView } from '../src/client/FlowView.tsx'
import { en, type MonitorKey } from '../src/client/locales.ts'
import { PANEL_CSS } from '../src/client/styles.ts'
import type { EventEntryLike, PendingInteractionLike } from '../src/client/types.ts'

/** Translate one key through the real English dictionary. */
function t(key: MonitorKey, params?: Record<string, string | number>): string {
  const template = en[key]
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/** A realistic instant for the preview: the turn started two minutes ago. */
const BASE = Date.now() - 120_000

/** One event entry at a synthetic time. */
function entry(type: string, seq: number, data: unknown, time = BASE + seq * 1_000): EventEntryLike {
  return { type: 'durable', event: { type, seq, time, data } }
}

/** A prompt, one assistant step with a file edit, and a turn end. */
const entries: EventEntryLike[] = [
  entry('turn/start', 1, { turn: 2 }),
  entry('user/message', 2, {
    id: 'm1',
    content: [{ type: 'text', text: 'Add a --dry-run flag and keep the monitor open.' }],
    source: { kind: 'user' },
  }),
  entry('step/start', 3, { turn: 2, step: 1 }),
  entry('assistant/message', 4, { message: { content: [{ type: 'text', text: 'Editing the toolbar first' }] } }),
  entry('tool/call', 5, { callId: 'c1', name: 'edit', arguments: '{"file_path":"src/client/MonitorPage.tsx"}' }),
  entry('tool/result', 6, { toolCallId: 'c1', message: { isError: false } }),
  entry('step/end', 7, { turn: 2, step: 1 }),
  entry('step/start', 8, { turn: 2, step: 2 }),
  entry('tool/call', 9, { callId: 'c2', name: 'bash', arguments: '{"command":"pnpm test"}' }),
]

/** The pending question shown by the waiting activity card. */
const pending: PendingInteractionLike = {
  kind: 'question',
  key: 'question:1',
  sessionId: 'session-1',
  answerable: true,
  questions: [{ id: 'q1', question: 'Ship it?' }],
}

/** The card shell the page uses around the flow view. */
function card(markup: string): string {
  return `<article class="dsm-card" data-mode="flow" data-state="running">
  <header class="dsm-cardHead">
    <span class="dsm-dot" data-state="running"></span>
    <div class="dsm-cardHeadText">
      <div class="dsm-cardTitle">Flow preview</div>
      <div class="dsm-cardSub"><span class="dsm-cardWorkspace">dsh-plugins</span></div>
    </div>
    <button type="button" class="dsm-iconBtn" title="Remove from monitor">×</button>
  </header>
  ${markup}
</article>`
}

/** Light theme tokens the installed page publishes. */
const TOKENS = `
--dsw-alias-bg-base:#fbfbfa;--dsw-alias-bg-layer-1:#ffffff;--dsw-alias-bg-module-platform:#f4f5f7;
--dsw-alias-border-l1:#eceef1;--dsw-alias-border-l2:#e2e5e9;--dsw-alias-border-l3:#d3d8de;
--dsw-alias-label-primary:#15181c;--dsw-alias-label-secondary:#4d5661;--dsw-alias-label-tertiary:#7b848f;--dsw-alias-label-caption:#8a939e;
--dsw-alias-interactive-bg-hover:#f0f2f5;--dsw-alias-interactive-bg-active:#e8ebef;--dsw-alias-brand-primary:#2f6fed;
--dsw-alias-state-business-primary:#2f6fed;--dsw-alias-state-success-primary:#1a9b57;
--dsw-alias-state-warn-primary:#c98212;--dsw-alias-state-error-primary:#cc3b3b;
--dsw-alias-label-primary-foreground:#ffffff;--dsw-alias-button-primary-fill:#2f6fed;--dsw-alias-button-primary-hover:#2560d6;
--dsh-content-font-size:14px;--dsh-content-font-delta:0px;
`

describe('FlowView', () => {
  it('draws the progress header, the numbered prompts and steps, and the footer', () => {
    const markup = renderToStaticMarkup(
      <FlowView t={t} entries={entries} running={true} pending={undefined} opening={false} failed={false} />,
    )
    expect(markup).toContain('class="dsf-root"')
    expect(markup).toContain('class="dsf-status"')
    expect(markup).toContain(en.flowStatusRunning)
    expect(markup).toContain('Add a --dry-run flag and keep the monitor open.')
    expect(markup).toContain(en.flowPromptTag)
    expect(markup).toContain('>1.1<')
    expect(markup).toContain('>1.2<')
    expect(markup).toContain('Editing the toolbar first')
    // The local purpose is the title itself, capitalized; no "Using bash:" prefix.
    expect(markup).toContain('Running tests')
    expect(markup).not.toContain('Using bash')
    expect(markup).toContain(en.flowRunningCount.replace('{count}', '1'))
    expect(markup).toContain('dsf-stepStamp')
    expect(markup).toContain('dsf-foot')
    expect(markup).toContain('1 prompt')
    expect(markup).toContain('2 steps')
  })

  it('reports a pending interaction in the activity card and the status pill', () => {
    const markup = renderToStaticMarkup(
      <FlowView t={t} entries={entries} running={true} pending={pending} opening={false} failed={false} />,
    )
    expect(markup).toContain(en.flowStatusWaiting)
    expect(markup).toContain(en.flowActivityQuestion)
    expect(markup).toContain('Ship it?')
  })

  it('shows the opening and failure states in an empty session', () => {
    const opening = renderToStaticMarkup(
      <FlowView t={t} entries={undefined} running={false} pending={undefined} opening={true} failed={false} />,
    )
    expect(opening).toContain(en.flowOpeningHistory)
    const failed = renderToStaticMarkup(
      <FlowView t={t} entries={undefined} running={false} pending={undefined} opening={false} failed={true} />,
    )
    expect(failed).toContain(en.flowHistoryFailed)
  })

  it('writes the standalone preview page when the environment asks for one', () => {
    const out = process.env.FLOW_PREVIEW_OUT
    if (out === undefined || out === '') return
    const runningMarkup = renderToStaticMarkup(
      <FlowView t={t} entries={entries} running={true} pending={undefined} opening={false} failed={false} />,
    )
    const waitingMarkup = renderToStaticMarkup(
      <FlowView t={t} entries={entries} running={true} pending={pending} opening={false} failed={false} />,
    )
    const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Flow view preview</title><style>
:root{${TOKENS}}
*{box-sizing:border-box}
body{margin:0;padding:28px;background:var(--dsw-alias-bg-base);font:14px/22px -apple-system,system-ui,"PingFang SC",sans-serif;color:var(--dsw-alias-label-primary);-webkit-font-smoothing:antialiased}
.row{display:flex;align-items:flex-start;gap:12px}
.frame{width:360px;height:560px;display:flex;flex-direction:column}
${PANEL_CSS}
</style></head><body><div class="row"><div class="frame">${card(runningMarkup)}</div><div class="frame">${card(waitingMarkup)}</div></div></body></html>`
    writeFileSync(out, page)
    expect(page).toContain('dsf-root')
  })
})