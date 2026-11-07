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
  defaultWorkspaceId,
  displayOrder,
  gridRows,
  MAX_COLUMNS,
  orderForBudget,
} from './model.ts'
import type { MonitorStore } from './store.ts'
import type { MonitorPrefs } from './store.ts'
import { CardBudgetControl } from './CardBudgetControl.tsx'
import { NewSessionControl } from './NewSessionControl.tsx'
import { SessionCard } from './SessionCard.tsx'
import type {
  ModelDirectoryLike,
  NewSessionActionsLike,
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
  /**
   * Create a session in a chosen or newly adopted Workspace, when the
   * composition provides the verbs. Without it the toolbar renders no
   * new-session control.
   */
  readonly newSession?: NewSessionActionsLike | undefined
}

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
  newSession,
}: MonitorPageProps): ReactElement {
  const list = useServiceSnapshot<SessionListSnapshotLike>(sessions?.list)
  const statuses = useServiceSnapshot<ReadonlyMap<string, SessionStatusLike>>(uiSession?.sessionStatus)
  const workspaceSnapshot = useServiceSnapshot<WorkspacesSnapshotLike>(workspaces?.list)
  // One catalog read for the whole grid: it is process-scoped, not per session.
  const permissionCatalog = usePermissionCatalog(remote)

  const subscribePrefs = useCallback((listener: () => void) => store.subscribe(listener), [store])
  const readPrefs = useCallback((): MonitorPrefs => store.getSnapshot(), [store])
  const prefs = useSyncExternalStore(subscribePrefs, readPrefs, readPrefs)
  const handleMaxCards = useCallback((value: number): void => store.setMaxCards(value), [store])

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
  const defaultWorkspaceTitle = t('defaultWorkspace')
  const blankTitle = t('newSession')
  const candidates = useMemo(
    () =>
      collectSessions(list, statuses, prefs.hidden, {
        workspaces: workspaceSnapshot?.items,
        defaultWorkspaceTitle,
        spawned: prefs.spawned,
        blankTitle,
      }),
    [list, statuses, prefs.hidden, prefs.spawned, workspaceSnapshot, defaultWorkspaceTitle, blankTitle],
  )

  /**
   * The grid's order is frozen once cards are on screen: a prompt or a state
   * change updates a card's content, never its position. A session that is not
   * displayed yet enters — at the end while there is room, or into the slot of
   * the least recently used card on a full grid — mirroring the user's intent
   * that the cards they are watching stay put. A session created from this
   * toolbar is an ordinary new arrival here: with room nothing moves, and on a
   * full grid its card takes the oldest card's slot.
   *
   * The order itself is stored with the preferences rather than kept in a
   * closure, so leaving the panel and coming back — or restarting the app —
   * resumes the same positions instead of re-seeding them by recency. Activity
   * never re-ranks the grid. Lowering the card budget is the one explicit
   * exception: the grid is re-seeded so the cards that stay are the newest ones.
   */
  const orderRef = useRef<readonly string[]>(prefs.order)
  // The budget the grid last laid out. A lower one re-seeds the order; a higher
  // one only reveals more of it.
  const budgetRef = useRef<number>(prefs.maxCards)
  const monitored = useMemo(() => {
    const byId = new Map(candidates.map((entry) => [entry.id, entry]))
    // Before the catalog's first pull the snapshot is empty and `pending`, which
    // says "nothing is known yet", not "every card disappeared". Reconciling it
    // would erase the stored order and re-seed it (moving every card) on each
    // mount, so the order is left alone until the catalog is ready.
    const previous = orderRef.current
    const ready = list?.byId !== undefined && list.phase !== 'pending'
    const next = ready
      ? orderForBudget(previous, candidates, budgetRef.current, prefs.maxCards)
      : previous
    // Only a ready catalog commits the new budget: a shrink that arrives while
    // the catalog is pending must still re-seed once it becomes ready.
    if (ready) budgetRef.current = prefs.maxCards
    orderRef.current = next
    const cards = []
    for (const id of displayOrder(next, candidates, prefs.maxCards)) {
      const entry = byId.get(id)
      if (entry !== undefined) cards.push(entry)
    }
    return cards
  }, [candidates, list, prefs.maxCards])

  // Persist the reconciled order after the render that produced it. `setOrder`
  // ignores an unchanged sequence, so this is not a render loop.
  useEffect(() => {
    store.setOrder(orderRef.current)
  }, [candidates, list, prefs.maxCards, store])

  /**
   * Keep the card of a session created from this toolbar.
   *
   * A blank row is normally not a card; this one is exactly what the user just
   * asked for, so its id is remembered until its first turn titles it.
   *
   * @param sessionId - the Session the Host created.
   */
  const handleStarted = useCallback(
    (sessionId: string): void => {
      store.markSpawned(sessionId)
    },
    [store],
  )

  // A created session stops being a special blank card as soon as its first turn
  // gives it a title; the card itself stays where it is.
  useEffect(() => {
    for (const id of prefs.spawned) {
      const row = list?.byId?.[id]
      if (row !== undefined && row.blank !== true) store.forgetSpawned(id)
    }
  }, [list, prefs.spawned, store])

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

  // The remembered Workspace wins while it exists; otherwise the most recently
  // used one, so the toolbar's choice matches what the sidebar would start in.
  const newWorkspaceId = defaultWorkspaceId(workspaceSnapshot?.items, list, prefs.newWorkspaceId)

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
          {newSession === undefined ? null : (
            <NewSessionControl
              t={t}
              workspaces={workspaceSnapshot?.items ?? []}
              selectedId={newWorkspaceId}
              actions={newSession}
              onSelect={(workspaceId) => store.setNewWorkspace(workspaceId)}
              onStarted={handleStarted}
            />
          )}
          {newSession === undefined ? null : <span className="dsm-divider" aria-hidden="true" />}
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
          <CardBudgetControl t={t} value={prefs.maxCards} onChange={handleMaxCards} />
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