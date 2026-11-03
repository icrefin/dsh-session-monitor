/**
 * One card's live view of one session.
 *
 * A Session binding is the harness's own read path: `ctx.sessions.retain()`
 * acquires one exact Client generation, opens its history, and keeps the live
 * event stream alive until the reference is released. Holding one is what lets
 * the monitor show a session the user is not currently viewing — and releasing
 * it on unmount is what keeps the grid from leaking one history stream per card.
 *
 * The binding also carries the **authoritative run state of this exact session**:
 * the Host's `api-session/status` event calls `Session.handleRunning()`, so
 * `session.getSnapshot().running` changes even when the shared catalog snapshot
 * behind it lags. The card therefore renders its status mark from this source,
 * not from the catalog row alone.
 *
 * Two layers keep that state current: the Session's own notifier (immediate) and
 * a 2-second reading of both snapshots. The timer is deliberate: a monitor that
 * silently stops updating because a foreign store's subscription semantics
 * drifted is worse than one that reconciles on a short interval, and the reads
 * are local snapshot accessors.
 *
 * The hook is deliberately defensive: retention refuses an unknown session, a
 * binding can fail to open, and a foreign projection can throw. Every one of
 * those becomes visible state on the card, never an exception in the renderer.
 *
 * @module dsh-session-monitor/client/useSessionFeed
 */

import { useEffect, useRef, useState } from 'react'
import { REFERENCE_SOURCE } from './plugin.ts'
import type {
  ContextPressureLike,
  EventEntryLike,
  InboxSnapshotLike,
  ObservableSnapshotLike,
  PermissionsSnapshotLike,
  QueueRowLike,
  SessionFaceLike,
  SessionsServiceLike,
  TokenUsageLike,
} from './types.ts'

/** What one card knows about its session right now. */
export interface SessionFeed {
  /** The session object once its binding is ready; the composer needs it. */
  readonly session: SessionFaceLike | undefined
  /** The contiguous event window, oldest first. */
  readonly entries: readonly EventEntryLike[] | undefined
  /** Live run state of this session, or `undefined` before its binding is ready. */
  readonly running: boolean | undefined
  /** The session's current permission preset, when its `permissions` projection exists. */
  readonly permission: string | undefined
  /** Messages queued for this session's next turn, in FIFO order. */
  readonly queue: readonly QueueRowLike[] | undefined
  /** Provider-reported token usage over the whole durable log. */
  readonly usage: TokenUsageLike | undefined
  /** Newest request pressure and the route's context capacity. */
  readonly pressure: ContextPressureLike | undefined
  /** History could not be opened (or retention was refused). */
  readonly error: boolean
  /** History is still opening. */
  readonly opening: boolean
}

/** State holder so one object update publishes session, window and run state together. */
interface FeedState {
  session: SessionFaceLike | undefined
  entries: readonly EventEntryLike[] | undefined
  running: boolean | undefined
  permission: string | undefined
  queue: readonly QueueRowLike[] | undefined
  usage: TokenUsageLike | undefined
  pressure: ContextPressureLike | undefined
  error: boolean
  opening: boolean
}

/** What a card shows before its first binding arrives. */
const INITIAL: FeedState = {
  session: undefined,
  entries: undefined,
  running: undefined,
  permission: undefined,
  queue: undefined,
  usage: undefined,
  pressure: undefined,
  error: false,
  opening: true,
}

/** How often the card reconciles its two snapshots without a subscription event. */
const RECONCILE_MS = 2_000

/**
 * Retain one session and follow its lifecycle and event window.
 *
 * The retention reference is acquired by the effect and released by its
 * cleanup, so switching cards, leaving the panel, or disabling the plugin all
 * close the stream.
 *
 * @param sessions - the client Session service.
 * @param sessionId - the session this card is bound to.
 * @returns the current feed state.
 */
export function useSessionFeed(
  sessions: SessionsServiceLike | undefined,
  sessionId: string,
  activityAt: number = 0,
): SessionFeed {
  const [feed, setFeed] = useState<FeedState>(INITIAL)
  /** The service proxy is read from a ref so it never re-triggers retention. */
  const serviceRef = useRef<SessionsServiceLike | undefined>(sessions)
  serviceRef.current = sessions
  /** Catalog recency, read by the interval without re-running the retention effect. */
  const activityRef = useRef(activityAt)
  activityRef.current = activityAt

  useEffect(() => {
    let alive = true
    let stopStream: () => void = () => {}
    let stopSession: () => void = () => {}
    let stopPermission: () => void = () => {}
    let stopInbox: () => void = () => {}
    let stopUsage: () => void = () => {}
    let stopPressure: () => void = () => {}
    let timer: ReturnType<typeof setInterval> | undefined
    let reference: ReturnType<NonNullable<SessionsServiceLike['retain']>> | undefined

    setFeed(INITIAL)

    const fail = (): void => {
      if (alive) {
        setFeed({
          session: undefined,
          entries: undefined,
          running: undefined,
          permission: undefined,
          queue: undefined,
          usage: undefined,
          pressure: undefined,
          error: true,
          opening: false,
        })
      }
    }

    const service = serviceRef.current
    if (service?.retain === undefined) {
      fail()
      return () => {
        alive = false
      }
    }

    try {
      reference = service.retain(sessionId, { source: REFERENCE_SOURCE })
    } catch (error) {
      console.warn(`[dsh-session-monitor] session ${sessionId} could not be retained`, error)
      fail()
      return () => {
        alive = false
      }
    }

    const ready = reference?.ready
    if (ready === undefined || typeof ready.then !== 'function') {
      fail()
    } else {
      ready
        .then((binding) => {
          if (!alive) return
          const stream = binding?.eventSource
          const face = binding?.session
          /**
           * The `permissions` projection is the Host's own answer to "which
           * preset is this session on". It is absent on a composition without
           * permission presets, which is why the read is guarded and the card
           * simply renders no control then.
           */
          let permissionsFace: ObservableSnapshotLike<unknown> | undefined
          try {
            permissionsFace = face?.projections?.faceOf?.('permissions')
          } catch (error) {
            console.warn(`[dsh-session-monitor] session ${sessionId} exposes no permissions projection`, error)
          }

          const readPermission = (): string | undefined => {
            try {
              const snapshot = permissionsFace?.getSnapshot?.() as PermissionsSnapshotLike | undefined
              const value = snapshot?.currentValue
              return typeof value === 'string' && value !== '' ? value : undefined
            } catch (error) {
              console.warn(`[dsh-session-monitor] session ${sessionId} published an unreadable permission value`, error)
              return undefined
            }
          }

          /**
           * The `inbox` projection is the queue the main-view conversation dock
           * renders. Its `next-turn` list holds the messages the agent accepts
           * after this turn; a card lists them and can steer one into the
           * running turn, exactly like the dock's per-row Steer.
           */
          let inboxFace: ObservableSnapshotLike<unknown> | undefined
          try {
            inboxFace = face?.projections?.faceOf?.('inbox')
          } catch (error) {
            console.warn(`[dsh-session-monitor] session ${sessionId} exposes no inbox projection`, error)
          }

          const EMPTY_QUEUE: readonly QueueRowLike[] = []
          const readQueue = (): readonly QueueRowLike[] => {
            try {
              const snapshot = inboxFace?.getSnapshot?.() as InboxSnapshotLike | undefined
              const rows = snapshot?.['next-turn']
              return Array.isArray(rows) ? rows : EMPTY_QUEUE
            } catch (error) {
              console.warn(`[dsh-session-monitor] session ${sessionId} published an unreadable queue`, error)
              return EMPTY_QUEUE
            }
          }
          /**
           * The token and context projections are the ones the native composer
           * footer reads (`UsagePill`, `ContextMeter`). A card shows the same
           * numbers the open conversation would, without opening it.
           */
          let usageFace: ObservableSnapshotLike<unknown> | undefined
          let pressureFace: ObservableSnapshotLike<unknown> | undefined
          try {
            usageFace = face?.projections?.faceOf?.('tokenUsage')
          } catch (error) {
            console.warn(`[dsh-session-monitor] session ${sessionId} exposes no token usage projection`, error)
          }
          try {
            pressureFace = face?.projections?.faceOf?.('contextPressure')
          } catch (error) {
            console.warn(`[dsh-session-monitor] session ${sessionId} exposes no context pressure projection`, error)
          }

          const readUsage = (): TokenUsageLike | undefined => {
            try {
              const snapshot = usageFace?.getSnapshot?.() as TokenUsageLike | undefined
              return snapshot === null || typeof snapshot !== 'object' ? undefined : snapshot
            } catch (error) {
              console.warn(`[dsh-session-monitor] session ${sessionId} published unreadable token usage`, error)
              return undefined
            }
          }

          const readPressure = (): ContextPressureLike | undefined => {
            try {
              const snapshot = pressureFace?.getSnapshot?.() as ContextPressureLike | undefined
              return snapshot === null || typeof snapshot !== 'object' ? undefined : snapshot
            } catch (error) {
              console.warn(`[dsh-session-monitor] session ${sessionId} published unreadable context pressure`, error)
              return undefined
            }
          }

          /**
           * A terminated tail stream is permanent: the controller marks the
           * session `openState: 'error'` and never retries by itself, so the card
           * would keep showing the window it opened with. Reopening the binding is
           * the supported recovery (`Session.resync()`), and the cooldown plus the
           * attempt cap keep a Host that keeps refusing from becoming a loop.
           */
          let lastResync = 0
          let resyncAttempts = 0
          let lastWindow: readonly EventEntryLike[] | undefined
          let lastWindowAt = Date.now()

          const reopen = (): void => {
            if (typeof face?.resync !== 'function') return
            const now = Date.now()
            if (resyncAttempts >= 40 || now - lastResync < 10_000) return
            lastResync = now
            resyncAttempts += 1
            try {
              void Promise.resolve(face.resync()).catch((error: unknown) => {
                console.warn(`[dsh-session-monitor] session ${sessionId} tail stream could not reopen`, error)
              })
            } catch (error) {
              console.warn(`[dsh-session-monitor] session ${sessionId} tail stream could not reopen`, error)
            }
          }

          /**
           * Liveness watchdog.
           *
           * A follow stream that is alive publishes dirt-cheaply and the window
           * changes on every event. A window that has been frozen for seconds
           * while its session is running is the observable shape of a dead tail,
           * even when the controller still reports `openState: 'open'`; reopening
           * re-reads the Host tail page and restores the live baseline.
           */
          const checkLiveness = (entries: readonly EventEntryLike[] | undefined, running: boolean | undefined, openState: string | undefined): void => {
            if (entries !== undefined && entries !== lastWindow) {
              lastWindow = entries
              lastWindowAt = Date.now()
            }
            if (openState === 'error') {
              reopen()
              return
            }
            const now = Date.now()
            const stale = now - lastWindowAt > 10_000
            if (running === true && openState === 'open' && stale) {
              reopen()
              return
            }
            // An idle session must not still hold transient stream rows: that is the
            // visible signature of a turn whose settlement never arrived.
            const liveRows = entries?.some((entry) => entry.type === 'transient') === true
            if (liveRows && running !== true && now - lastWindowAt > 8_000) {
              reopen()
              return
            }
            // The catalog's recency can outrun a silently stalled window. When it
            // names activity newer than the newest loaded event by a clear margin,
            // the window is behind and only a reopen re-reads the Host tail.
            const newestEntry = entries?.reduce((max, entry) => Math.max(max, entry.event?.time ?? 0), 0) ?? 0
            if (newestEntry > 0 && activityRef.current > newestEntry + 10_000) {
              reopen()
            }
          }

          const publish = (): void => {
            if (!alive) return
            try {
              const window = stream?.getSnapshot?.()
              const snapshot = face?.getSnapshot?.()
              const running = typeof snapshot?.running === 'boolean' ? snapshot.running : undefined
              const permission = readPermission()
              const queue = readQueue()
              const usage = readUsage()
              const pressure = readPressure()
              checkLiveness(window?.entries, running, snapshot?.openState)
              setFeed((previous) => {
                if (
                  previous.session === face &&
                  previous.entries === window?.entries &&
                  previous.running === running &&
                  previous.permission === permission &&
                  previous.queue === queue &&
                  previous.usage === usage &&
                  previous.pressure === pressure &&
                  !previous.error &&
                  !previous.opening
                ) {
                  return previous
                }
                return {
                  session: face,
                  entries: window?.entries,
                  running,
                  permission,
                  queue,
                  usage,
                  pressure,
                  error: false,
                  opening: false,
                }
              })
            } catch (error) {
              console.warn(`[dsh-session-monitor] session ${sessionId} published an unreadable snapshot`, error)
              fail()
            }
          }

          publish()

          // Immediate updates from the two foreign notifiers.
          try {
            if (typeof stream?.subscribe === 'function') stopStream = stream.subscribe(publish) ?? (() => {})
          } catch (error) {
            console.warn(`[dsh-session-monitor] session ${sessionId} event window could not be followed`, error)
          }
          try {
            if (typeof face?.subscribe === 'function') stopSession = face.subscribe(publish) ?? (() => {})
          } catch (error) {
            console.warn(`[dsh-session-monitor] session ${sessionId} lifecycle could not be followed`, error)
          }
          try {
            if (typeof permissionsFace?.subscribe === 'function') stopPermission = permissionsFace.subscribe(publish) ?? (() => {})
          } catch (error) {
            console.warn(`[dsh-session-monitor] session ${sessionId} permission value could not be followed`, error)
          }
          try {
            if (typeof inboxFace?.subscribe === 'function') stopInbox = inboxFace.subscribe(publish) ?? (() => {})
          } catch (error) {
            console.warn(`[dsh-session-monitor] session ${sessionId} queue could not be followed`, error)
          }
          try {
            if (typeof usageFace?.subscribe === 'function') stopUsage = usageFace.subscribe(publish) ?? (() => {})
          } catch (error) {
            console.warn(`[dsh-session-monitor] session ${sessionId} token usage could not be followed`, error)
          }
          try {
            if (typeof pressureFace?.subscribe === 'function') stopPressure = pressureFace.subscribe(publish) ?? (() => {})
          } catch (error) {
            console.warn(`[dsh-session-monitor] session ${sessionId} context pressure could not be followed`, error)
          }

          // Reconciliation: local snapshot reads, so a missed notification only
          // delays a mark by one interval instead of leaving it wrong.
          timer = setInterval(publish, RECONCILE_MS)
        })
        .catch((error: unknown) => {
          if (!alive) return
          console.warn(`[dsh-session-monitor] session ${sessionId} history did not open`, error)
          fail()
        })
    }

    return () => {
      alive = false
      if (timer !== undefined) clearInterval(timer)
      try {
        stopStream()
      } catch {
        // The stream is already gone; nothing left to unsubscribe.
      }
      try {
        stopSession()
      } catch {
        // The lifecycle notifier is already gone.
      }
      try {
        stopPermission()
      } catch {
        // The projection notifier is already gone.
      }
      try {
        stopInbox()
      } catch {
        // The queue notifier is already gone.
      }
      try {
        stopUsage()
      } catch {
        // The usage notifier is already gone.
      }
      try {
        stopPressure()
      } catch {
        // The context notifier is already gone.
      }
      try {
        reference?.release?.()
      } catch (error) {
        console.warn(`[dsh-session-monitor] session ${sessionId} could not be released`, error)
      }
    }
  }, [sessionId])

  return feed
}