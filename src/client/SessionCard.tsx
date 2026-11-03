/**
 * One card of the monitor grid: status header, live transcript, pending
 * interaction, and the composer for that session.
 *
 * The card owns no session state of its own beyond drafts. Everything it shows
 * comes from two harness projections — the catalog row and the session's live
 * event window — plus the `uiSession` pending-interaction projection. Retaining
 * and releasing that window is the only side effect it adds.
 *
 * @module dsh-session-monitor/client/SessionCard
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react'
import { InteractionCard } from './InteractionCard.tsx'
import { useModelDirectory } from './useModelDirectory.ts'
import type { MonitorTranslate } from './locales.ts'
import {
  cacheHitPercent,
  consumedTokens,
  contextOccupancy,
  deriveTranscript,
  displayPresetName,
  formatCompactTokens,
  formatExactTokens,
  monitorState,
  needsPermissionConfirmation,
  newestEventTime,
  permissionLabelKey,
  relativeLabel,
  type MonitoredSession,
  type TranscriptRow,
} from './model.ts'
import type { MonitorStore } from './store.ts'
import type {
  ModelDirectoryLike,
  PermissionCatalogLike,
  PermissionOptionLike,
  QueueActionLike,
  QueueRowLike,
  SessionsServiceLike,
} from './types.ts'
import { useSessionFeed } from './useSessionFeed.ts'

/** Props of one monitored session card. */
export interface SessionCardProps {
  /** The session this card shows. */
  readonly session: MonitoredSession
  /** The client Session service, passed through the slot injection face. */
  readonly sessions: SessionsServiceLike | undefined
  /** The monitor's local preference store. */
  readonly store: MonitorStore
  /** Bound translate seat. */
  readonly t: MonitorTranslate
  /** Current epoch milliseconds, refreshed by the page for relative labels. */
  readonly now: number
  /** Selectable permission presets; absent when the Host has no permission catalog. */
  readonly permissionCatalog?: PermissionCatalogLike | undefined
  /** Resolve this session's shared model directory, when the service is composed. */
  readonly modelDirectoryFor?: ((sessionId: string) => ModelDirectoryLike | undefined) | undefined
  /** Open this session in the conversation view, when the navigation service exists. */
  readonly openSession?: ((sessionId: string) => void) | undefined
  /** Whether the user already looked at this Session's finished run. */
  readonly acknowledged?: boolean | undefined
}

/** Longest draft kept in a card composer. */
const MAX_DRAFT = 4000

/** Queued rows a card lists before it summarises the rest. */
const MAX_QUEUE_ROWS = 3

/**
 * Render one relative timestamp through the dictionary.
 * @param t - translate seat.
 * @param now - current clock.
 * @param time - event time.
 * @returns the labeled time, or an empty string.
 */
function when(t: MonitorTranslate, now: number, time: number): string {
  const label = relativeLabel(now, time)
  if (label === undefined) return ''
  switch (label.unit) {
    case 'now':
      return t('nowLabel')
    case 'minute':
      return t('minutesAgo', { count: label.count })
    case 'hour':
      return t('hoursAgo', { count: label.count })
    case 'day':
      return t('daysAgo', { count: label.count })
    case 'date':
      return label.text
  }
}

/**
 * Render one transcript row.
 * @param row - the row.
 * @param t - translate seat.
 * @returns the row element.
 */
function TranscriptLine({ row, t }: { row: TranscriptRow; t: MonitorTranslate }): ReactElement {
  switch (row.kind) {
    case 'user':
      return <div className="dsm-user">{row.text}</div>
    case 'assistant':
      return (
        <div className="dsm-assistant" data-live={row.live ? 'true' : undefined}>
          {row.text}
        </div>
      )
    case 'tool':
      return (
        <div className="dsm-tool" data-status={row.status} title={row.detail}>
          <span className="dsm-toolDot" aria-hidden="true" />
          <span className="dsm-toolName">{row.name}</span>
          <span className="dsm-toolDetail">{row.detail}</span>
        </div>
      )
    case 'notice': {
      const text =
        row.code === 'approval-asked'
          ? t('approvalAsked', { tool: row.detail ?? 'tool' })
          : row.code === 'approval-decided'
            ? t('approvalDecided', { outcome: row.detail ?? '' })
            : row.detail === undefined || row.detail === ''
              ? t('retry')
              : t('retryReason', { reason: row.detail })
      return (
        <div className="dsm-notice" data-tone={row.tone}>
          {text}
        </div>
      )
    }
  }
}

/**
 * Make one request identity without assuming `crypto.randomUUID` exists.
 * @returns a unique-enough request id for prompt correlation.
 */
function requestId(): string {
  try {
    return globalThis.crypto.randomUUID()
  } catch {
    return `monitor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

/**
 * Read whether a Remote result reports an accepted prompt.
 * @param result - `session.prompt()` return value.
 * @returns true when the result reports a failure.
 */
function refused(result: unknown): boolean {
  if (typeof result !== 'object' || result === null) return false
  return (result as { ok?: unknown }).ok === false
}

/**
 * Read the visible text of one queued message.
 * @param row - one `next-turn` inbox row.
 * @param t - translate seat.
 * @returns the message text, a clip of it, or the attachment placeholder.
 */
function queueRawText(row: QueueRowLike): string {
  const blocks = row.content
  return Array.isArray(blocks)
    ? blocks
        .filter((block) => block?.type === 'text')
        .map((block) => (typeof block?.text === 'string' ? block.text : ''))
        .join('')
        .trim()
    : ''
}

/**
 * Render the visible text of one queued message.
 * @param row - one `next-turn` inbox row.
 * @param t - translate seat.
 * @returns the clipped message text, or the attachment placeholder.
 */
function queueText(row: QueueRowLike, t: MonitorTranslate): string {
  const text = queueRawText(row)
  if (text === '') return t('queueAttachment')
  return text.length > 200 ? `${text.slice(0, 200)}…` : text
}

/**
 * Render one permission preset under its product label.
 *
 * The built-in values get this plugin's own localized labels (the same words the
 * shipped picker uses); a Host-configured preset keeps its Host-supplied name,
 * title-cased when that name is only the machine value.
 *
 * @param option - one catalog entry, or a bare current value.
 * @param t - translate seat.
 * @returns the display label.
 */
function permissionLabel(option: Pick<PermissionOptionLike, 'value' | 'name'>, t: MonitorTranslate): string {
  const key = permissionLabelKey(option.value)
  if (key !== undefined) return t(key)
  const name = typeof option.name === 'string' && option.name.trim() !== '' ? option.name.trim() : (option.value ?? '')
  return displayPresetName(name)
}

/**
 * Render one session's card.
 * @param props - the monitored session and the services it needs.
 * @returns the card.
 */
export function SessionCard({
  session,
  sessions,
  store,
  t,
  now,
  permissionCatalog,
  modelDirectoryFor,
  openSession,
  acknowledged,
}: SessionCardProps): ReactElement {
  const feed = useSessionFeed(sessions, session.id, session.updatedAt)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [promptFailed, setPromptFailed] = useState(false)
  /** The running turn's Stop action is in flight. */
  const [stopping, setStopping] = useState(false)
  const [stopFailed, setStopFailed] = useState(false)
  /** Preset the card shows while its switch is in flight (the Host projection confirms it). */
  const [permissionPick, setPermissionPick] = useState<string | null>(null)
  const [permissionBusy, setPermissionBusy] = useState(false)
  const [permissionFailed, setPermissionFailed] = useState(false)
  /** A preset waiting for the explicit acknowledgement Auto review requires. */
  const [permissionConfirm, setPermissionConfirm] = useState<string | null>(null)
  /** Queue row whose steer/edit/discard action is in flight. */
  const [queueBusyId, setQueueBusyId] = useState<string | null>(null)
  /** Which queue action last failed, for the card's error line. */
  const [queueFailed, setQueueFailed] = useState<'steer' | 'edit' | 'discard' | null>(null)
  /** The queued row being edited, with its draft text. */
  const [queueEdit, setQueueEdit] = useState<{ id: string; text: string } | null>(null)
  /** Directory key the picker shows while its model switch is in flight. */
  const [modelPick, setModelPick] = useState<string | null>(null)
  const [modelBusy, setModelBusy] = useState(false)
  const [modelFailed, setModelFailed] = useState(false)
  const modelId = useId()
  const permissionId = useId()
  /**
   * The shared per-session model directory the composer picker and `/model`
   * use. Resolving it is a foreign call, so it is guarded like every other read
   * on this card.
   */
  const modelDirectory = useMemo(() => {
    // Resolve only after this card holds the binding: `directoryFor()` requires
    // the session's scope and binding to exist, and on the first render (before
    // `retain()` ran) it throws for every session the app has not materialized
    // yet — which is every card but the one currently open. Re-running when
    // `feed.session` arrives is what gives those cards their picker.
    if (feed.session === undefined) return undefined
    try {
      return modelDirectoryFor?.(session.id)
    } catch (error) {
      console.warn(`[dsh-session-monitor] session ${session.id} exposes no model directory`, error)
      return undefined
    }
  }, [modelDirectoryFor, session.id, feed.session])
  const modelState = useModelDirectory(modelDirectory)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  /** Whether the transcript is pinned to its bottom edge. */
  const stickRef = useRef(true)

  const rows = useMemo(() => deriveTranscript(feed.entries), [feed.entries])
  const pending = session.pending
  // The retained binding is the run state of this exact session; the catalog row
  // is the fallback before the binding reports and after it goes away. Either
  // source saying "running" wins, so a lagging snapshot never hides live work.
  const running = session.running || feed.running === true
  // The green completion mark exists to be noticed: it stays until the user
  // clicks this card, which records the acknowledgement in the local store.
  const completed = session.completionUnread && acknowledged !== true
  const state = monitorState(running, pending, completed)
  // The same three figures the native composer footer shows: whole-log tokens,
  // prompt-cache hit share, and how full the context window is.
  const usedTokens = consumedTokens(feed.usage)
  const cacheHit = cacheHitPercent(feed.usage)
  const context = contextOccupancy(feed.pressure)

  const pendingKey = pending?.key ?? ''
  useEffect(() => {
    const body = bodyRef.current
    if (body === null) return
    // A pending request is the reason the card exists, so it owns the top of the
    // scroll region while it stands; otherwise the transcript follows its tail.
    if (pendingKey !== '') {
      body.scrollTop = 0
      stickRef.current = false
      return
    }
    stickRef.current = true
    body.scrollTop = body.scrollHeight
  }, [feed.entries, pendingKey])

  const permissionOptions = useMemo(() => {
    const options = permissionCatalog?.options
    const result: { value: string; label: string }[] = []
    if (options === undefined) return result
    const seen = new Set<string>()
    for (const option of options) {
      const value = option.value
      if (typeof value !== 'string' || value === '' || seen.has(value)) continue
      seen.add(value)
      result.push({ value, label: permissionLabel(option, t) })
    }
    return result
  }, [permissionCatalog, t])

  const currentPermission = feed.permission
  const shownPermission = permissionPick ?? currentPermission
  const permissionKnown =
    shownPermission !== undefined && permissionOptions.some((option) => option.value === shownPermission)
  const showPermission =
    feed.session !== undefined && currentPermission !== undefined && permissionOptions.length > 0

  // The Host's own projection is the settlement: once it reports the picked
  // value the optimistic one retires; a settlement that never arrives expires.
  useEffect(() => {
    if (permissionPick === null) return
    if (currentPermission === permissionPick) {
      setPermissionPick(null)
      return
    }
    const timer = globalThis.setTimeout(() => setPermissionPick(null), 6_000)
    return () => globalThis.clearTimeout(timer)
  }, [permissionPick, currentPermission])

  const applyPermission = (value: string): void => {
    setPermissionConfirm(null)
    const face = feed.session
    if (face === undefined || typeof face.command !== 'function') {
      setPermissionFailed(true)
      return
    }
    setPermissionBusy(true)
    setPermissionFailed(false)
    setPermissionPick(value)
    Promise.resolve()
      .then(() => face.command?.(`/permission ${value}`))
      .then((result) => {
        if (result?.ok !== false && result?.value?.matched !== false) return
        setPermissionPick(null)
        setPermissionFailed(true)
      })
      .catch((error: unknown) => {
        console.warn(`[dsh-session-monitor] session ${session.id} refused a permission switch`, error)
        setPermissionPick(null)
        setPermissionFailed(true)
      })
      .finally(() => {
        setPermissionBusy(false)
      })
  }

  const onPickPermission = (event: ChangeEvent<HTMLSelectElement>): void => {
    const value = event.target.value
    if (value === '' || value === currentPermission || permissionBusy) return
    if (needsPermissionConfirmation(value)) {
      setPermissionConfirm(value)
      return
    }
    applyPermission(value)
  }

  const modelGroups = useMemo(() => {
    const groups: { id: string; name: string; models: { id: string; name: string; effort?: string }[] }[] = []
    for (const group of modelState?.groups ?? []) {
      if (typeof group.id !== 'string' || group.id === '') continue
      const models: { id: string; name: string; effort?: string }[] = []
      for (const model of group.models ?? []) {
        if (typeof model.id !== 'string' || model.id === '') continue
        models.push({
          id: model.id,
          name: typeof model.name === 'string' && model.name !== '' ? model.name : model.id,
          ...(model.reasoning?.defaultEffort === undefined ? {} : { effort: model.reasoning.defaultEffort }),
        })
      }
      groups.push({
        id: group.id,
        name: typeof group.name === 'string' && group.name !== '' ? group.name : group.id,
        models,
      })
    }
    return groups
  }, [modelState])

  const modelChoices = useMemo(
    () =>
      modelGroups.flatMap((group) =>
        group.models.map((model) => ({
          key: `${group.id}\u0000${model.id}`,
          provider: group.id,
          model: model.id,
          ...(model.effort === undefined ? {} : { effort: model.effort }),
        })),
      ),
    [modelGroups],
  )

  const modelCurrent = modelState?.pending ?? modelState?.current ?? null
  const modelCurrentKey =
    typeof modelCurrent?.provider === 'string' && typeof modelCurrent?.model === 'string'
      ? `${modelCurrent.provider}\u0000${modelCurrent.model}`
      : ''
  const modelShownKey = modelPick ?? modelCurrentKey
  const modelKnown = modelShownKey !== '' && modelChoices.some((choice) => choice.key === modelShownKey)
  const showModel = modelDirectory !== undefined
  const modelLoading = modelState?.status === 'loading'

  // The directory's own snapshot settles the optimistic pick; a settlement that
  // never arrives expires the same way the permission pick does.
  useEffect(() => {
    if (modelPick === null) return
    if (modelPick === modelCurrentKey) {
      setModelPick(null)
      return
    }
    const timer = globalThis.setTimeout(() => setModelPick(null), 6_000)
    return () => globalThis.clearTimeout(timer)
  }, [modelPick, modelCurrentKey])

  const onPickModel = (event: ChangeEvent<HTMLSelectElement>): void => {
    const key = event.target.value
    if (key === '' || key === modelCurrentKey || modelBusy) return
    const choice = modelChoices.find((candidate) => candidate.key === key)
    if (choice === undefined) return
    setModelBusy(true)
    setModelFailed(false)
    setModelPick(key)
    Promise.resolve()
      .then(() =>
        modelDirectory?.select?.({
          provider: choice.provider,
          model: choice.model,
          ...(choice.effort === undefined ? {} : { reasoningEffort: choice.effort }),
        }),
      )
      .then((result) => {
        if (result?.ok !== false) return
        setModelPick(null)
        setModelFailed(true)
      })
      .catch((error: unknown) => {
        console.warn(`[dsh-session-monitor] session ${session.id} refused a model switch`, error)
        setModelPick(null)
        setModelFailed(true)
      })
      .finally(() => {
        setModelBusy(false)
      })
  }

  const queue = feed.queue
  const queueView = useMemo(() => {
    const rows = queue ?? []
    const visible: { id: string; text: string; raw: string }[] = []
    for (const row of rows) {
      if (visible.length >= MAX_QUEUE_ROWS) break
      const id = row?.id
      if (typeof id !== 'string' || id === '') continue
      visible.push({ id, text: queueText(row, t), raw: queueRawText(row) })
    }
    return { total: rows.length, visible }
  }, [queue, t])

  const canMutateQueue = typeof feed.session?.updateQueue === 'function'

  /**
   * Run one queue mutation through the session's own `updateQueue`, which is
   * exactly what the main-view queue dock calls. `session/steer-unavailable`
   * and `session/queue-item-not-found` are convergence, not failure: the turn
   * ended first, or the agent already claimed/removed the row.
   */
  const queueAction = (
    id: string,
    action: QueueActionLike,
    failure: 'steer' | 'edit' | 'discard',
    onSuccess?: () => void,
  ): void => {
    const face = feed.session
    if (face === undefined || typeof face.updateQueue !== 'function' || queueBusyId !== null) return
    setQueueBusyId(id)
    setQueueFailed(null)
    Promise.resolve()
      .then(() => face.updateQueue?.(id, action))
      .then((result) => {
        if (result?.ok !== false) {
          onSuccess?.()
          return
        }
        const code = result.error?.code
        if (code === 'session/steer-unavailable' || code === 'session/queue-item-not-found') {
          onSuccess?.()
          return
        }
        setQueueFailed(failure)
      })
      .catch((error: unknown) => {
        console.warn(`[dsh-session-monitor] session ${session.id} refused a queue ${action.kind}`, error)
        setQueueFailed(failure)
      })
      .finally(() => {
        setQueueBusyId(null)
      })
  }

  const steerQueued = (id: string): void => {
    queueAction(id, { kind: 'steer' }, 'steer')
  }

  const discardQueued = (id: string): void => {
    queueAction(id, { kind: 'remove' }, 'discard', () => {
      if (queueEdit?.id === id) setQueueEdit(null)
    })
  }

  const saveQueued = (id: string): void => {
    if (queueEdit === null || queueEdit.id !== id) return
    const text = queueEdit.text.trim()
    if (text === '') return
    queueAction(id, { kind: 'edit', content: [{ type: 'text', text }] }, 'edit', () => {
      setQueueEdit(null)
    })
  }

  const onQueueEditKey = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setQueueEdit(null)
      return
    }
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.nativeEvent.isComposing) return
    event.preventDefault()
    if (queueEdit !== null) saveQueued(queueEdit.id)
  }

  const onScroll = (): void => {
    const body = bodyRef.current
    if (body === null) return
    stickRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < 40
  }

  const send = (): void => {
    const text = draft.trim()
    if (text === '' || busy) return
    const face = feed.session
    if (face === undefined || typeof face.prompt !== 'function') {
      setPromptFailed(true)
      return
    }
    setBusy(true)
    setPromptFailed(false)
    Promise.resolve()
      .then(() => face.prompt?.([{ type: 'text', text }], 'queue', undefined, requestId()))
      .then((result) => {
        if (refused(result)) {
          setPromptFailed(true)
          return
        }
        setDraft('')
      })
      .catch((error: unknown) => {
        console.warn(`[dsh-session-monitor] session ${session.id} refused a prompt`, error)
        setPromptFailed(true)
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.nativeEvent.isComposing) return
    event.preventDefault()
    send()
  }

  const stopSession = (): void => {
    const face = feed.session
    if (face === undefined || typeof face.cancel !== 'function' || stopping) return
    setStopping(true)
    setStopFailed(false)
    Promise.resolve()
      .then(() => face.cancel?.())
      .then((result) => {
        if (result?.ok === false) setStopFailed(true)
      })
      .catch((error: unknown) => {
        console.warn(`[dsh-session-monitor] session ${session.id} refused a stop`, error)
        setStopFailed(true)
      })
      .finally(() => {
        setStopping(false)
      })
  }

  const stateLabel =
    state === 'waiting'
      ? t('waiting')
      : state === 'completed'
        ? t('completed')
        : running
          ? t('working')
          : t('idle')
  // Activity, not just the last prompt: the newest visible event keeps the label
  // moving while the session writes, and freezes only when the card is behind.
  const activityAt = Math.max(session.updatedAt, newestEventTime(feed.entries))
  const timeLabel = when(t, now, activityAt)
  const workspace = session.workspace

  const acknowledge = (): void => {
    if (!completed) return
    store.acknowledge(session.id)
  }

  return (
    <article className="dsm-card" data-state={state} aria-label={session.title} onClick={acknowledge}>
      <header className="dsm-cardHead">
        <span className="dsm-dot" data-state={state} aria-hidden="true" />
        <div className="dsm-cardHeadText">
          {openSession === undefined ? (
            <div className="dsm-cardTitle" title={session.title}>
              {session.title}
            </div>
          ) : (
            <button
              type="button"
              className="dsm-cardTitle dsm-cardOpen"
              title={t('openSession')}
              onClick={() => openSession(session.id)}
            >
              {session.title}
            </button>
          )}
          <div className="dsm-cardSub" title={session.cwd}>
            {workspace === undefined || workspace === '' ? null : (
              <span className="dsm-cardWorkspace">{workspace}</span>
            )}
            <span className="dsm-cardState">{stateLabel}</span>
            {timeLabel === '' ? null : <span className="dsm-cardTime">{timeLabel}</span>}
          </div>
        </div>
        <button
          type="button"
          className="dsm-iconBtn"
          data-danger="true"
          title={t('remove')}
          aria-label={t('remove')}
          onClick={() => store.hide(session.id)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
      </header>

      <div className="dsm-body" ref={bodyRef} onScroll={onScroll}>
        {pending === undefined ? null : (
          <InteractionCard key={pending.key ?? 'pending'} interaction={pending} t={t} />
        )}
        {rows.length === 0 ? (
          <div className="dsm-hint" data-tone={feed.error ? 'error' : undefined}>
            {feed.error ? t('openFailed') : feed.opening ? t('opening') : t('noHistory')}
          </div>
        ) : (
          rows.map((row) => <TranscriptLine key={row.key} row={row} t={t} />)
        )}
      </div>

      {queueView.visible.length === 0 ? null : (
        <div className="dsm-queue" aria-label={t('queuedCount', { count: queueView.total })}>
          <div className="dsm-queueHead">
            <span className="dsm-queueGlyph" aria-hidden="true">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                <path d="M1.5 2.5h9M1.5 6h9M1.5 9.5h6" />
              </svg>
            </span>
            <span>{t('queuedCount', { count: queueView.total })}</span>
          </div>
          {queueView.visible.map((row) =>
            queueEdit?.id === row.id ? (
              <div className="dsm-queueRow" data-editing="true" key={row.id}>
                <textarea
                  className="dsm-queueEdit"
                  rows={2}
                  maxLength={MAX_DRAFT}
                  aria-label={t('queueEdit')}
                  value={queueEdit.text}
                  autoFocus
                  onChange={(event) => setQueueEdit({ id: row.id, text: event.target.value })}
                  onKeyDown={onQueueEditKey}
                />
                <span className="dsm-queueActions">
                  <button
                    type="button"
                    className="dsm-queueBtn"
                    disabled={queueBusyId !== null || queueEdit.text.trim() === ''}
                    title={t('queueSave')}
                    aria-label={t('queueSave')}
                    onClick={() => saveQueued(row.id)}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 6.2l2.6 2.6L10 3.4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="dsm-queueBtn"
                    title={t('queueCancelEdit')}
                    aria-label={t('queueCancelEdit')}
                    onClick={() => setQueueEdit(null)}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                      <path d="M3 3l6 6M9 3l-6 6" />
                    </svg>
                  </button>
                </span>
              </div>
            ) : (
              <div className="dsm-queueRow" key={row.id}>
                <span className="dsm-queueText" title={row.text}>
                  {row.text}
                </span>
                {canMutateQueue ? (
                  <span className="dsm-queueActions">
                    <button
                      type="button"
                      className="dsm-queueBtn"
                      disabled={queueBusyId !== null || row.raw === ''}
                      title={row.raw === '' ? t('queueEditUnsupported') : t('queueEdit')}
                      aria-label={t('queueEdit')}
                      onClick={() => setQueueEdit({ id: row.id, text: row.raw })}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M8.2 1.8l2 2-6 6-2.6.6.6-2.6 6-6z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="dsm-queueBtn"
                      data-danger="true"
                      disabled={queueBusyId !== null}
                      title={t('queueDiscard')}
                      aria-label={t('queueDiscard')}
                      onClick={() => discardQueued(row.id)}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
                        <path d="M2 3h8M4.5 3V2h3v1M3 3l.5 7h5L9 3M5 5v3M7 5v3" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="dsm-queueBtn"
                      disabled={!running || queueBusyId !== null}
                      title={running ? t('steerQueued') : t('steerUnavailable')}
                      aria-label={t('steerQueued')}
                      onClick={() => steerQueued(row.id)}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M1.5 6l9-4.2-3 4.2 3 4.2-9-4.2z" />
                      </svg>
                    </button>
                  </span>
                ) : null}
              </div>
            ),
          )}
          {queueView.total > queueView.visible.length ? (
            <div className="dsm-queueMore">{t('queuedMore', { count: queueView.total - queueView.visible.length })}</div>
          ) : null}
        </div>
      )}

      <footer className="dsm-composer">
        <textarea
          className="dsm-input"
          rows={1}
          maxLength={MAX_DRAFT}
          aria-label={t('placeholder')}
          value={draft}
          placeholder={t('placeholder')}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="dsm-composerFoot">
          {showPermission ? (
            <label className="dsm-perm" htmlFor={permissionId} title={t('permission')}>
              <span className="dsm-permGlyph" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
                  <path d="M6 1.4l3.7 1.3v3.1c0 2.4-1.6 3.9-3.7 4.6-2.1-.7-3.7-2.2-3.7-4.6V2.7L6 1.4z" />
                </svg>
              </span>
              <select
                id={permissionId}
                className="dsm-select dsm-permSelect"
                aria-label={t('permission')}
                title={t('permission')}
                value={shownPermission}
                disabled={permissionBusy}
                onChange={onPickPermission}
              >
                {permissionKnown ? null : (
                  <option value={shownPermission} disabled>
                    {permissionLabel({ value: shownPermission }, t)}
                  </option>
                )}
                {permissionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {showModel ? (
            <label className="dsm-model" htmlFor={modelId} title={t('model')}>
              <select
                id={modelId}
                className="dsm-select dsm-modelSelect"
                aria-label={t('model')}
                title={t('model')}
                value={modelShownKey}
                disabled={modelBusy || modelLoading || modelChoices.length === 0}
                onChange={onPickModel}
              >
                {modelShownKey === '' ? (
                  <option value="">{modelLoading ? t('modelLoading') : t('modelUnavailable')}</option>
                ) : null}
                {modelShownKey !== '' && !modelKnown ? (
                  <option value={modelShownKey} disabled>
                    {`${modelCurrent?.provider ?? ''}/${modelCurrent?.model ?? ''}`}
                  </option>
                ) : null}
                {modelGroups.map((group) => (
                  <optgroup key={group.id} label={group.name}>
                    {group.models.map((model) => (
                      <option key={model.id} value={`${group.id}\u0000${model.id}`}>
                        {model.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          ) : null}
          {usedTokens === 0 && cacheHit === null && context === null ? null : (
            <div className="dsm-usage" role="group" aria-label={t('usageLabel')}>
              {usedTokens === 0 ? null : (
                <span
                  className="dsm-usageStat"
                  data-stat="tokens"
                  title={t('usageTokensTitle', { tokens: formatExactTokens(usedTokens) })}
                >
                  {t('usageTokens', { tokens: formatCompactTokens(usedTokens) })}
                </span>
              )}
              {cacheHit === null ? null : (
                <span
                  className="dsm-usageStat"
                  data-stat="cache"
                  title={t('usageCacheHitTitle', { percent: cacheHit })}
                >
                  {t('usageCacheHit', { percent: cacheHit })}
                </span>
              )}
              {context === null ? null : (
                <span
                  className="dsm-usageStat"
                  data-stat="context"
                  title={t('usageContextTitle', {
                    percent: context.percent,
                    used: formatCompactTokens(context.used),
                    window: formatCompactTokens(context.contextWindow),
                  })}
                >
                  {t('usageContext', { percent: context.percent })}
                </span>
              )}
            </div>
          )}
          <span className="dsm-footerActions">
            {running ? (
              <button
                type="button"
                className="dsm-btn"
                data-danger="true"
                disabled={stopping}
                onClick={stopSession}
                aria-label={t('stop')}
                title={stopFailed ? t('stopFailed') : t('stopHint')}
              >
                {stopping ? t('stopping') : t('stop')}
              </button>
            ) : null}
            <button
              type="button"
              className="dsm-btn"
              data-primary="true"
              disabled={busy || draft.trim() === ''}
              onClick={send}
              title={promptFailed ? t('promptFailed') : t('send')}
            >
              {busy ? t('sending') : t('send')}
            </button>
          </span>
        </div>
        {permissionConfirm === null ? null : (
          <div className="dsm-permConfirm" role="group" aria-label={t('permission')}>
            <span className="dsm-permConfirmText">{t('permConfirmAuto')}</span>
            <span className="dsm-permConfirmActions">
              <button type="button" className="dsm-btn" onClick={() => setPermissionConfirm(null)}>
                {t('permConfirmCancel')}
              </button>
              <button
                type="button"
                className="dsm-btn"
                data-primary="true"
                onClick={() => applyPermission(permissionConfirm)}
              >
                {t('permConfirmSwitch')}
              </button>
            </span>
          </div>
        )}
      </footer>
      {promptFailed || permissionFailed || queueFailed !== null || modelFailed || stopFailed ? (
        <div className="dsm-cardError">
          {promptFailed ? <div className="dsm-pendingError">{t('promptFailed')}</div> : null}
          {stopFailed ? <div className="dsm-pendingError">{t('stopFailed')}</div> : null}
          {permissionFailed ? <div className="dsm-pendingError">{t('permFailed')}</div> : null}
          {queueFailed === 'steer' ? <div className="dsm-pendingError">{t('steerQueuedFailed')}</div> : null}
          {queueFailed === 'edit' ? <div className="dsm-pendingError">{t('queueEditFailed')}</div> : null}
          {queueFailed === 'discard' ? <div className="dsm-pendingError">{t('queueDiscardFailed')}</div> : null}
          {modelFailed ? <div className="dsm-pendingError">{t('modelFailed')}</div> : null}
        </div>
      ) : null}
    </article>
  )
}