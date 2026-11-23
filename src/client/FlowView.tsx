/**
 * The flow view of one session: the whole session as a numbered path.
 *
 * This is the `dsh-session-progress` panel, embedded in a monitor card. It draws
 * the same view that plugin draws in the right Sidebar:
 *
 * 1. a fixed header — status, turn and elapsed clock, the current prompt, a rail
 *    of the current turn's steps, the counts, and the activity card;
 * 2. a scrolling list of the **entire session** in the order the work happened:
 *    every human prompt as a numbered, tinted block (`1`, `2`, `3`…) and every
 *    agent-loop step numbered under it (`1.1`, `1.2`, `2.1`…);
 * 3. a footer with the session totals.
 *
 * The list follows the newest row: it scrolls to the bottom on open and keeps
 * following while new rows and live text arrive. A reader who scrolls up keeps
 * their place — the follow re-arms when they return to the bottom.
 *
 * Every value comes from {@link deriveProgress}; this component only decides what
 * to draw. It imports no host UI package, so no primitive change can blank the
 * card.
 *
 * The component uses the progress panel's class names with a `dsf-` prefix,
 * which is what keeps the two stylesheets from touching each other when both
 * plugins are enabled on the same page.
 *
 * @module dsh-session-monitor/client/FlowView
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type UIEvent,
} from 'react'
import { EmptyGlyph, StepGlyph } from './FlowIcons.tsx'
import {
  deriveProgress,
  formatClock,
  formatStamp,
  type ProgressModel,
  type SessionItem,
  type StepItem,
} from './flowProgress.ts'
import { activityDetail, stepTitle, type PurposeOf } from './flowTitles.ts'
import type { MonitorTranslate } from './locales.ts'
import type { EventEntryLike, PendingInteractionLike } from './types.ts'

/** Props of one session's flow view. */
export interface FlowViewProps {
  /** Bound translate seat. */
  readonly t: MonitorTranslate
  /** The session's event window, oldest first; `undefined` until it opens. */
  readonly entries: readonly EventEntryLike[] | undefined
  /** The session's authoritative run state, from its binding or the catalog. */
  readonly running: boolean
  /** The pending interaction, when the session is blocked on the user. */
  readonly pending: PendingInteractionLike | undefined
  /** The binding is still opening the event log. */
  readonly opening: boolean
  /** The binding could not be opened (or retention was refused). */
  readonly failed: boolean
  /**
   * The monitor's own pending-answer block, when the session is blocked.
   *
   * It sits at the top of the flow body, so the answer controls share the
   * body's scroll region instead of pushing the flow header out of a short card.
   */
  readonly pendingSlot?: ReactNode
  /** Keep the pending answer block at the top instead of following the tail. */
  readonly holdTop?: boolean
}

/** The visual tone of the status pill. */
type StatusTone = 'running' | 'waiting' | 'done' | 'failed' | 'idle'

/** Distance from the bottom, in pixels, still counted as "following". */
const FOLLOW_SLACK = 28

/**
 * No model-written descriptions are requested by the monitor.
 *
 * The progress panel asks its host to describe a shell command with a small
 * model call. The monitor is a multi-session grid and deliberately keeps its host
 * half empty (one model call per card would be a bill, not a view), so the local
 * phrase fallback is always used. A shell command is still never drawn.
 */
const NO_PURPOSE: PurposeOf = () => undefined

/**
 * Pick the tone the header reports.
 *
 * Waiting outranks running: a session blocked on the user is not making progress,
 * and that is the state worth noticing. A failed turn outranks completed.
 *
 * @param model - the derived progress model.
 * @returns the pill tone.
 */
function toneOf(model: ProgressModel): StatusTone {
  if (model.waiting) return 'waiting'
  if (model.running) return 'running'
  if (model.failed > 0 || model.error !== undefined) return 'failed'
  if (model.endedAt > 0) return 'done'
  return 'idle'
}

/**
 * The pill's text for one tone.
 * @param tone - the resolved tone.
 * @param t - translate seat.
 * @returns the label.
 */
function labelOf(tone: StatusTone, t: MonitorTranslate): string {
  switch (tone) {
    case 'running':
      return t('flowStatusRunning')
    case 'waiting':
      return t('flowStatusWaiting')
    case 'done':
      return t('flowStatusDone')
    case 'failed':
      return t('flowStatusFailed')
    default:
      return t('flowStatusIdle')
  }
}

/**
 * The files line under a step whose title is the agent's own words.
 *
 * Every written or edited file is named here (up to two, then a count), which is
 * what keeps a write visible even when the step also explains itself.
 *
 * @param files - the step's files.
 * @returns the file names, or an empty string.
 */
function filesLine(files: StepItem['files']): string {
  const names = files.slice(0, 2).map((file) => file.name)
  const tail = files.length > 2 ? ` +${files.length - 2}` : ''
  return `${names.join(', ')}${tail}`
}

/**
 * The activity card's head label for the current kind.
 * @param model - the derived model.
 * @param t - translate seat.
 * @returns the label text.
 */
function activityLabel(model: ProgressModel, t: MonitorTranslate): string {
  switch (model.activity.kind) {
    case 'waiting':
      return model.activity.tool !== undefined ? t('flowActivityApproval') : t('flowActivityQuestion')
    case 'tool':
      return t('flowActivityTool', { tool: model.activity.tool ?? 'tool' })
    case 'thinking':
      return t('flowActivityThinking')
    default:
      return model.endedAt > 0 ? t('flowActivityDone') : t('flowActivityIdle')
  }
}

/**
 * A one-second clock that only runs while a turn is running.
 *
 * The progress panel's elapsed readout must keep moving without a session event;
 * an idle card does not need a timer at all.
 *
 * @param active - whether time must keep moving.
 * @returns the current epoch milliseconds.
 */
function useFlowNow(active: boolean): number {
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

/**
 * Render one prompt row.
 * @param item - the prompt.
 * @param t - translate seat.
 * @returns the row element.
 */
function PromptRow({
  item,
  t,
}: {
  readonly item: Extract<SessionItem, { kind: 'prompt' }>
  readonly t: MonitorTranslate
}): ReactElement {
  return (
    <li className="dsf-item dsf-promptItem" data-kind="prompt">
      <span className="dsf-promptIndex" aria-hidden="true">
        {item.index}
      </span>
      <span className="dsf-stepBody">
        <span className="dsf-promptHead">
          <span className="dsf-promptTag">{t('flowPromptTag')}</span>
        </span>
        <p className="dsf-promptText">{item.text}</p>
      </span>
    </li>
  )
}

/**
 * Render one step row.
 * @param item - the step.
 * @param t - translate seat.
 * @param purposeOf - descriptions the page has received.
 * @returns the row element.
 */
function StepRow({
  item,
  t,
  purposeOf,
}: {
  readonly item: StepItem
  readonly t: MonitorTranslate
  readonly purposeOf: PurposeOf
}): ReactElement {
  const stamp = formatStamp(item.at)
  return (
    <li
      className="dsf-item dsf-step"
      data-status={item.status}
      data-live={item.status === 'running' ? 'true' : undefined}
    >
      <span className="dsf-stepLabel" aria-label={t('flowStepNumberLabel', { label: item.label })}>
        <span className="dsf-stepNumber">{item.label}</span>
        {stamp === '' ? null : (
          <time className="dsf-stepStamp" dateTime={new Date(item.at).toISOString()}>
            {stamp}
          </time>
        )}
      </span>
      <span className="dsf-stepIcon">
        <StepGlyph status={item.status} />
      </span>
      <span className="dsf-stepBody">
        <p className="dsf-stepTitle">{stepTitle(item, t, purposeOf)}</p>
        <span className="dsf-stepMeta">
          {item.tools.length > 0 ? <span className="dsf-stepTools">{item.tools.join(' · ')}</span> : null}
          {item.text !== '' && item.files.length > 0 ? (
            <span className="dsf-stepFiles">
              <span aria-hidden="true">✎ </span>
              {filesLine(item.files)}
            </span>
          ) : null}
          {item.failed > 0 ? <span className="dsf-stepFail">{t('flowFailedCount', { count: item.failed })}</span> : null}
        </span>
      </span>
    </li>
  )
}

/**
 * Render the whole session's flow.
 * @param props - the event window and the session's state.
 * @returns the flow element tree.
 */
export function FlowView({
  t,
  entries,
  running,
  pending,
  opening,
  failed,
  pendingSlot,
  holdTop = false,
}: FlowViewProps): ReactElement {
  const waiting = pending !== undefined
  const model = useMemo(
    () => deriveProgress(entries, { sessionRunning: running, waiting, pending }),
    [entries, running, waiting, pending],
  )
  const now = useFlowNow(model.running)

  const bodyRef = useRef<HTMLDivElement | null>(null)
  const followRef = useRef(true)

  const lastItem = model.items.length === 0 ? undefined : model.items[model.items.length - 1]
  const tail = lastItem?.kind === 'step' && lastItem.status === 'running' ? lastItem : undefined
  const settled = tail === undefined ? model.items : model.items.slice(0, -1)

  // The signature changes on every new row, status change or live-text growth, so
  // the follow effect runs exactly when the bottom moved.
  const signature = [
    model.items.length,
    model.omitted,
    model.running ? 1 : 0,
    lastItem?.kind ?? '',
    lastItem?.kind === 'step' ? lastItem.status : '',
    lastItem?.kind === 'step' ? lastItem.live.length : 0,
    lastItem?.kind === 'step' ? lastItem.text.length : 0,
  ].join(':')

  useEffect(() => {
    if (holdTop) return
    const element = bodyRef.current
    if (element === null) return
    if (!followRef.current) return
    element.scrollTop = element.scrollHeight
  }, [signature, holdTop])

  // A blocking request owns the top of the body: show the question and its
  // answers first, and stop following the tail until the request is settled.
  useEffect(() => {
    const element = bodyRef.current
    if (element === null) return
    if (holdTop) {
      element.scrollTop = 0
      followRef.current = false
      return
    }
    followRef.current = true
    element.scrollTop = element.scrollHeight
  }, [holdTop])

  const onScroll = (event: UIEvent<HTMLDivElement>): void => {
    const element = event.currentTarget
    followRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < FOLLOW_SLACK
  }

  const settledRows = useMemo(
    () =>
      settled.map((item) =>
        item.kind === 'prompt' ? (
          <PromptRow key={item.key} item={item} t={t} />
        ) : (
          <StepRow key={item.key} item={item} t={t} purposeOf={NO_PURPOSE} />
        ),
      ),
    // Membership and the quiet prefix only change with the row count, the cap or
    // the moment the running step settles; streaming text stays in `tail`.
    [settled.length, model.omitted, model.prompts, lastItem?.kind === 'step' ? lastItem.status : '', t],
  )

  const tone = toneOf(model)
  const startedAt = model.startedAt
  const endedAt = model.endedAt
  const elapsed =
    startedAt > 0 ? (endedAt > 0 ? endedAt - startedAt : model.running ? now - startedAt : 0) : 0
  const currentSteps = model.items.filter(
    (item): item is StepItem => item.kind === 'step' && item.prompt === model.prompts,
  )
  const detail = activityDetail(model, true, t, NO_PURPOSE)
  const empty = model.items.length === 0

  return (
    <div className="dsf-root" data-tone={tone}>
      <header className="dsf-head">
        <div className="dsf-statusRow">
          <span className="dsf-status" data-tone={tone} role="status" aria-live="polite">
            <span className="dsf-statusDot" aria-hidden="true" />
            {labelOf(tone, t)}
          </span>
          <span className="dsf-spacer" />
          {model.turn > 0 ? <span className="dsf-turn">{t('flowTurnLabel', { turn: model.turn })}</span> : null}
          {elapsed > 0 ? (
            <span className="dsf-elapsed" title={t('flowElapsedLabel', { time: formatClock(elapsed) })}>
              {formatClock(elapsed)}
            </span>
          ) : null}
        </div>

        {model.prompt !== '' ? <div className="dsf-currentPrompt">{model.prompt}</div> : null}

        {currentSteps.length > 0 ? (
          <>
            <div
              className="dsf-rail"
              role="img"
              aria-label={t('flowRailLabel', { done: model.done, total: currentSteps.length })}
            >
              {currentSteps.map((step) => (
                <span
                  key={step.key}
                  className="dsf-seg"
                  data-state={step.status === 'running' ? 'running' : step.status === 'error' ? 'error' : 'done'}
                />
              ))}
            </div>
            <div className="dsf-meta">
              {model.done > 0 ? (
                <span className="dsf-metaChip" data-tone="done">
                  {t('flowDoneCount', { count: model.done })}
                </span>
              ) : null}
              {model.current > 0 ? (
                <span className="dsf-metaChip" data-tone="running">
                  {t('flowRunningCount', { count: model.current })}
                </span>
              ) : null}
              {model.failed > 0 ? (
                <span className="dsf-metaChip" data-tone="failed">
                  {t('flowFailedCount', { count: model.failed })}
                </span>
              ) : null}
            </div>
          </>
        ) : null}

        {empty ? null : (
          <section className="dsf-activity" data-kind={model.activity.kind}>
            <div className="dsf-activityHead">
              <span className="dsf-activityTitle">{activityLabel(model, t)}</span>
            </div>
            {detail !== undefined ? <p className="dsf-activityDetail">{detail}</p> : null}
            {model.activity.kind === 'waiting' && model.activity.detail !== undefined ? (
              <p className="dsf-activityText">{model.activity.detail}</p>
            ) : null}
            {model.activity.kind === 'thinking' && model.activity.text !== undefined ? (
              <p className="dsf-activityText" data-live="true">
                {model.activity.text}
              </p>
            ) : null}
            {model.running && model.activity.kind !== 'waiting' ? <span className="dsf-sweep" /> : null}
          </section>
        )}
        {model.error !== undefined ? (
          <div className="dsf-errorCard">
            <span className="dsf-errorTitle">{t('flowErrorLine')}</span>
            <p className="dsf-errorText">{model.error}</p>
          </div>
        ) : null}
      </header>

      <div className="dsf-body" ref={bodyRef} onScroll={onScroll}>
        {pendingSlot}
        {empty ? (
          <div className="dsf-empty">
            <span className="dsf-emptyGlyph">
              <EmptyGlyph />
            </span>
            <p className="dsf-emptyTitle">
              {opening ? t('flowOpeningHistory') : failed ? t('flowHistoryFailed') : t('flowEmptyTitle')}
            </p>
            {opening || failed ? null : <p className="dsf-emptyHint">{t('flowEmptyHint')}</p>}
          </div>
        ) : (
          <div className="dsf-session">
            <div className="dsf-headingRow">{t('flowSessionHeading')}</div>
            {model.omitted > 0 ? <div className="dsf-omitted">{t('flowOmitted', { count: model.omitted })}</div> : null}
            <ol className="dsf-items">
              {settledRows}
              {tail === undefined ? null : <StepRow key={tail.key} item={tail} t={t} purposeOf={NO_PURPOSE} />}
            </ol>
          </div>
        )}
      </div>

      {empty ? null : (
        <footer className="dsf-foot">
          <span className="dsf-footTurn">
            {model.prompts === 1 ? t('flowPromptsCountOne') : t('flowPromptsCount', { count: model.prompts })}
          </span>
          <span className="dsf-spacer" />
          <span>{model.stepTotal === 1 ? t('flowStepsCountOne') : t('flowStepsCount', { count: model.stepTotal })}</span>
        </footer>
      )}
    </div>
  )
}