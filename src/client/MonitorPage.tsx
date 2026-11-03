/**
 * The page the sidebar row opens: one grid of every active and recently used
 * session, with each card's live transcript and its own composer.
 *
 * The page reads three sources and owns no business state: the Session catalog
 * (`ctx.sessions.list`), the unified status projection
 * (`ctx.uiSession.sessionStatus`), and this plugin's own local preferences.
 * Cards retain their own history window; the page only decides which sessions
 * deserve a card and in what order.
 *
 * @module dsh-session-monitor/client/MonitorPage
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import type { MonitorTranslate } from './locales.ts'
import {
  autoColumns,
  collectSessions,
  DEFAULT_MAX_CARDS,
  displayOrder,
  gridRows,
  MAX_CARDS_LIMIT,
  MAX_COLUMNS,
  reconcileBudget,
} from './model.ts'
import type { MonitorStore } from './store.ts'
import type { MonitorPrefs } from './store.ts'
import { SessionCard } from './SessionCard.tsx'
import type {
  ModelDirectoryLike,
  ObservableSnapshotLike,
  RemoteServiceLike,
  SessionListSnapshotLike,
  SessionStatusLike,
  SessionsServiceLike,
  UiSessionServiceLike,
  WorkspacesServiceLike,
  WorkspacesSnapshotLike,
} from './types.ts'
import { usePermissionCatalog } from './usePermissionCatalog.ts'
import { VERSION } from './version.ts'

/** Props composed by the slot framework for this key of the `main` slot. */
export interface MonitorPageProps {
  /** Bound translate seat. */
  readonly t: MonitorTranslate
  /** This plugin's local preference store. */
  readonly store: MonitorStore
  /** The client Session service. */
  readonly sessions: SessionsServiceLike | undefined
  /** The unified Session status projection. */
  readonly uiSession: UiSessionServiceLike | undefined
  /** The Workspace registry, read for the Workspace titles a card shows. */
  readonly workspaces?: WorkspacesServiceLike | undefined
  /** The Remote service, read for the process-level permission catalog. */
  readonly remote?: RemoteServiceLike | undefined
  /** Resolve one session's shared model directory, when the service is composed. */
  readonly modelDirectoryFor?: ((sessionId: string) => ModelDirectoryLike | undefined) | undefined
  /** Open one session in the conversation view, when the navigation service exists. */
  readonly openSession?: ((sessionId: string) => void) | undefined
}

/** Card budgets the toolbar offers. */
const CARD_CHOICES = [3, 6, 9, 12, MAX_CARDS_LIMIT]

/** Explicit cards-per-row choices; `0` (Auto) is offered separately. */
const COLUMN_CHOICES = [2, 3, 4, 5, MAX_COLUMNS]

/**
 * Subscribe to one optional observable without trusting it.
 *
 * An absent, throwing or partially shaped projection costs the panel its live
 * updates, not its mount: the renderer retires a slot entry whose render throws,
 * and a monitor that blanks the page is worse than one that refreshes by hand.
 *
 * @param source - the projection, when the service is composed.
 * @returns its current snapshot, or `undefined`.
 */
function readSnapshot<T>(source: ObservableSnapshotLike<T> | undefined): T | undefined {
  try {
    return source?.getSnapshot()
  } catch (error) {
    console.warn('[dsh-session-monitor] a projection could not be read', error)
    return undefined
  }
}

/** How often a projection reconciles without a subscription event. */
const PROJECTION_RECONCILE_MS = 1_500

function useServiceSnapshot<T>(source: ObservableSnapshotLike<T> | undefined): T | undefined {
  const [snapshot, setSnapshot] = useState<T | undefined>(() => readSnapshot(source))

  useEffect(() => {
    let alive = true
    const publish = (): void => {
      if (!alive) return
      const next = readSnapshot(source)
      // Reference equality is the contract of these snapshots: an unchanged
      // projection must not re-render the grid.
      setSnapshot((previous) => (previous === next ? previous : next))
    }

    publish()

    let stop: () => void = () => {}
    try {
      stop = source?.subscribe(publish) ?? (() => {})
    } catch (error) {
      console.warn('[dsh-session-monitor] a projection could not be followed', error)
    }

    // Reconciliation, not a replacement for the subscription: a push that never
    // arrives would otherwise leave every card's state and ordering frozen, and
    // the reads themselves are local snapshot accessors.
    const timer = globalThis.setInterval(publish, PROJECTION_RECONCILE_MS)

    return () => {
      alive = false
      globalThis.clearInterval(timer)
      try {
        stop()
      } catch {
        // Already unsubscribed.
      }
    }
  }, [source])

  return snapshot
}

/**
 * Render the monitor page.
 * @param props - the translate seat, preference store and projections.
 * @returns the page.
 */
export function MonitorPage({
  t,
  store,
  sessions,
  uiSession,
  workspaces,
  remote,
  modelDirectoryFor,
  openSession,
}: MonitorPageProps): ReactElement {
  const list = useServiceSnapshot<SessionListSnapshotLike>(sessions?.list)
  const statuses = useServiceSnapshot<ReadonlyMap<string, SessionStatusLike>>(uiSession?.sessionStatus)
  const workspaceSnapshot = useServiceSnapshot<WorkspacesSnapshotLike>(workspaces?.list)
  // One catalog read for the whole grid: it is process-scoped, not per session.
  const permissionCatalog = usePermissionCatalog(remote)

  const subscribePrefs = useCallback((listener: () => void) => store.subscribe(listener), [store])
  const readPrefs = useCallback((): MonitorPrefs => store.getSnapshot(), [store])
  const prefs = useSyncExternalStore(subscribePrefs, readPrefs, readPrefs)

  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    const timer = globalThis.setInterval(() => setNow(Date.now()), 30_000)
    return () => globalThis.clearInterval(timer)
  }, [])

  // Keep the catalog honest for selection and ordering. The run states on the
  // cards come from each binding, but a card only appears, moves or shows its
  // recency from this snapshot — so it is refreshed on a slow interval and once
  // on mount instead of trusting a push that may have been missed while the
  // panel was closed.
  useEffect(() => {
    const service = sessions
    if (service?.refresh === undefined) return
    const pull = (): void => {
      try {
        const pending = service.refresh?.()
        if (pending !== undefined) {
          void pending.catch((error: unknown) => {
            console.warn('[dsh-session-monitor] the Session catalog refresh failed', error)
          })
        }
      } catch (error) {
        console.warn('[dsh-session-monitor] the Session catalog refresh failed', error)
      }
    }
    pull()
    const timer = globalThis.setInterval(pull, 15_000)
    return () => globalThis.clearInterval(timer)
  }, [sessions])

  /** Every session eligible for a card, before the display order is applied. */
  const candidates = useMemo(
    () => collectSessions(list, statuses, prefs.hidden, workspaceSnapshot?.items),
    [list, statuses, prefs.hidden, workspaceSnapshot],
  )

  /**
   * The grid's order is frozen once cards are on screen: a prompt or a state
   * change updates a card's content, never its position. Only a session that is
   * not displayed yet enters — at the end while there is room, or into the slot
   * of the least recently used card on a full grid — mirroring the user's intent
   * that the cards they are watching stay put.
   */
  const orderRef = useRef<readonly string[]>([])
  const budgetRef = useRef<number>(prefs.maxCards)
  const monitored = useMemo(() => {
    const byId = new Map(candidates.map((entry) => [entry.id, entry]))
    const previous = orderRef.current
    const next = reconcileBudget(previous, candidates, budgetRef.current, prefs.maxCards)
    orderRef.current = next
    budgetRef.current = prefs.maxCards
    const cards = []
    for (const id of displayOrder(next, candidates, prefs.maxCards)) {
      const entry = byId.get(id)
      if (entry !== undefined) cards.push(entry)
    }
    return cards
  }, [candidates, prefs.maxCards])

  // A reminder is over once the Session reports no unread completion — a new
  // run started, or the conversation view opened it. Forget the acknowledgement
  // then, so the next completion lights the green dot again.
  useEffect(() => {
    for (const entry of monitored) {
      if (!entry.completionUnread) store.clearAcknowledgement(entry.id)
    }
  }, [monitored, store])

  const waiting = monitored.filter((entry) => entry.state === 'waiting').length
  const running = monitored.filter((entry) => entry.running).length
  const hidden = prefs.hidden.size

  // The grid is a fixed page: every card must be visible without scrolling the
  // panel, so the column count and the row count are derived from the box the
  // page actually gives the grid, not from content height.
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
  const hasCards = monitored.length > 0

  useEffect(() => {
    if (!hasCards) return
    const element = gridRef.current
    if (element === null) return
    const measure = (): void => {
      const next = { width: element.clientWidth, height: element.clientHeight }
      setBox((previous) => (previous.width === next.width && previous.height === next.height ? previous : next))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasCards])

  const count = monitored.length
  const columns = prefs.columns > 0 ? Math.min(prefs.columns, Math.max(1, count)) : autoColumns(count, box.width, box.height)
  const rows = gridRows(count, columns)
  const gridStyle = {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  }

  return (
    <div className="dsm-page">
      <div className="dsm-inner">
        <header className="dsm-header">
          <div className="dsm-titleRow">
            <h1 className="dsm-title">{t('title')}</h1>
            <span className="dsm-chip">{t('credit', { version: VERSION })}</span>
          </div>
          <p className="dsm-intro">{t('description')}</p>
        </header>

        <div className="dsm-toolbar">
          <span className="dsm-stat">{t('shown', { count: monitored.length })}</span>
          {waiting === 0 ? null : (
            <span className="dsm-stat" data-tone="waiting">
              {t('waitingCount', { count: waiting })}
            </span>
          )}
          {running === 0 ? null : (
            <span className="dsm-stat" data-tone="running">
              {t('runningCount', { count: running })}
            </span>
          )}
          <span className="dsm-spacer" />
          <label className="dsm-stat" htmlFor="dsm-card-budget">
            {t('cards')}
            <select
              id="dsm-card-budget"
              className="dsm-select"
              value={prefs.maxCards}
              onChange={(event) => store.setMaxCards(Number(event.target.value) || DEFAULT_MAX_CARDS)}
            >
              {CARD_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
            </select>
          </label>
          <label className="dsm-stat" htmlFor="dsm-columns">
            {t('columns')}
            <select
              id="dsm-columns"
              className="dsm-select"
              value={prefs.columns}
              onChange={(event) => store.setColumns(Number(event.target.value))}
            >
              <option value={0}>{t('auto')}</option>
              {COLUMN_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="dsm-btn"
            disabled={hidden === 0}
            onClick={() => store.restoreAll()}
          >
            {hidden === 0 ? t('restoreNone') : t('restoreAll', { count: hidden })}
          </button>
        </div>

        {monitored.length === 0 ? (
          <div className="dsm-empty">
            <div className="dsm-emptyTitle">{t('emptyTitle')}</div>
            <div className="dsm-emptyBody">{t('emptyBody')}</div>
          </div>
        ) : (
          <div className="dsm-grid" ref={gridRef} style={gridStyle}>
            {monitored.map((entry) => (
              <SessionCard
                key={entry.id}
                session={entry}
                sessions={sessions}
                store={store}
                t={t}
                now={now}
                permissionCatalog={permissionCatalog}
                modelDirectoryFor={modelDirectoryFor}
                openSession={openSession}
                acknowledged={prefs.acknowledged.has(entry.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}