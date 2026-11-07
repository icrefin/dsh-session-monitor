/**
 * Pure derivations for the monitor: which sessions it watches, and what one
 * session's live event window says happened.
 *
 * Both functions are total and defensive. They never throw on a foreign shape,
 * never read a field the harness does not publish, and take the whole input as
 * data — which is what makes the monitor's behaviour testable without a browser
 * or a harness run.
 *
 * @module dsh-session-monitor/client/model
 */

import type { MonitorKey } from './locales.ts'
import type {
  ContextPressureLike,
  EventEntryLike,
  PendingInteractionLike,
  SessionListSnapshotLike,
  SessionRowLike,
  SessionStatusLike,
  TokenUsageLike,
  WorkspaceViewLike,
} from './types.ts'

/** How a monitored session is doing right now. */
export type MonitorState = 'waiting' | 'running' | 'completed' | 'idle'

/** One session the grid shows, after ordering and removal. */
export interface MonitoredSession {
  /** Session identity. */
  readonly id: string
  /** Display title; never empty. */
  readonly title: string
  /** Working directory, when the catalog records one. */
  readonly cwd: string | undefined
  /** Workspace title the session is accounted to; short path when none is known. */
  readonly workspace: string | undefined
  /** Live run state from the host. */
  readonly running: boolean
  /** The pending interaction, when the session is blocked on the user. */
  readonly pending: PendingInteractionLike | undefined
  /** Recency timestamp in epoch milliseconds (0 when unknown). */
  readonly updatedAt: number
  /** Status mark for the card header. */
  readonly state: MonitorState
  /** A turn finished in a session this browser is not viewing. */
  readonly completionUnread: boolean
}

/** One rendered transcript line. */
export type TranscriptRow =
  | {
      readonly kind: 'user'
      readonly key: string
      readonly time: number
      readonly text: string
    }
  | {
      readonly kind: 'assistant'
      readonly key: string
      readonly time: number
      readonly text: string
      /** True while the text is still arriving through the live chunk stream. */
      readonly live: boolean
    }
  | {
      readonly kind: 'tool'
      readonly key: string
      readonly time: number
      readonly name: string
      /** One-line argument or result hint. */
      readonly detail: string
      readonly status: 'running' | 'done' | 'error'
    }
  | {
      readonly kind: 'notice'
      readonly key: string
      readonly time: number
      readonly tone: 'info' | 'error'
      /** Which localized notice to show. */
      readonly code: 'approval-asked' | 'approval-decided' | 'retry'
      /** Tool name, approval outcome or retry reason, when the event carries one. */
      readonly detail: string | undefined
    }

/** User-message source kinds that are a human turn (or a human answer). */
const HUMAN_SOURCES = new Set(['user', 'user-approval', 'user-question-reply'])

/** Default number of cards the grid shows at once. */
export const DEFAULT_MAX_CARDS = 9

/** Lowest card budget the toolbar offers. */
export const MIN_CARDS = 2

/** Hard ceiling on cards, so a huge profile cannot open fifty history streams. */
export const MAX_CARDS_LIMIT = 24

/**
 * Normalise a card budget to the values the toolbar can step through.
 *
 * The budget is always a whole number in [MIN_CARDS, MAX_CARDS_LIMIT]. A value
 * of zero means "never stored", so it falls back to the default instead of
 * clamping to the floor.
 *
 * @param max - requested budget.
 * @returns a whole number between {@link MIN_CARDS} and {@link MAX_CARDS_LIMIT}.
 */
export function clampMaxCards(max: number): number {
  const whole = Number.isFinite(max) ? Math.trunc(max) : DEFAULT_MAX_CARDS
  const requested = whole === 0 ? DEFAULT_MAX_CARDS : whole
  return Math.max(MIN_CARDS, Math.min(MAX_CARDS_LIMIT, requested))
}

/** Hard ceiling on the explicit cards-per-row choice. */
export const MAX_COLUMNS = 6

/**
 * Hard ceiling on the stored display order.
 *
 * The order holds every known session, not only the displayed cards: a card the
 * budget hides must stay known or it would look like a fresh arrival and evict
 * another card. This limit only defends `localStorage` against a corrupt
 * payload; it is far above any realistic profile.
 */
export const ORDER_LIMIT = 512

/** Card size the Auto layout aims for, in CSS pixels. */
export const NOMINAL_CARD = { width: 300, height: 220 } as const

/**
 * Choose the cards-per-row count that fits every card in the available box.
 *
 * Auto is a fit, not a fill: for each candidate column count the resulting cell
 * is scored by how closely it reaches the nominal card size on its tighter axis,
 * and the best score wins. A layout that would shrink cards below a usable floor
 * is only chosen when no other arrangement exists.
 *
 * @param count - number of cards to place.
 * @param width - grid content width in CSS pixels (0 before measurement).
 * @param height - grid content height in CSS pixels (0 before measurement).
 * @returns a column count between 1 and {@link MAX_COLUMNS}.
 */
export function autoColumns(count: number, width: number, height: number): number {
  if (count <= 1) return 1
  const boxWidth = width > 0 ? width : 900
  const boxHeight = height > 0 ? height : 520
  let best = Math.min(count, 3)
  let bestScore = -Infinity
  for (let columns = 1; columns <= Math.min(count, MAX_COLUMNS); columns += 1) {
    const rows = Math.ceil(count / columns)
    const cellWidth = boxWidth / columns
    const cellHeight = boxHeight / rows
    const score = Math.min(cellWidth / NOMINAL_CARD.width, cellHeight / NOMINAL_CARD.height)
    // Prefer the fit that keeps cards closest to their nominal size; a tie goes
    // to the arrangement with fewer columns (larger cards).
    if (score > bestScore + 0.001) {
      best = columns
      bestScore = score
    }
  }
  return best
}

/**
 * Rows needed to place every card in the chosen columns.
 * @param count - number of cards.
 * @param columns - cards per row.
 * @returns the row count, at least one.
 */
export function gridRows(count: number, columns: number): number {
  return Math.max(1, Math.ceil(count / Math.max(1, columns)))
}

/**
 * Read one field of a foreign object without trusting it.
 * @param value - candidate object.
 * @param key - field name.
 * @returns the field value, or `undefined`.
 */
function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined
  return (value as Record<string, unknown>)[key]
}

/**
 * Read a string field of a foreign object.
 * @param value - candidate object.
 * @param key - field name.
 * @returns the string, or `undefined` when the field is not a string.
 */
export function textField(value: unknown, key: string): string | undefined {
  const read = field(value, key)
  return typeof read === 'string' ? read : undefined
}

/**
 * Read a number field of a foreign object.
 * @param value - candidate object.
 * @param key - field name.
 * @returns the finite number, or `undefined`.
 */
export function numberField(value: unknown, key: string): number | undefined {
  const read = field(value, key)
  return typeof read === 'number' && Number.isFinite(read) ? read : undefined
}

/** Product labels for the permission presets the harness ships under fixed values. */
const PERMISSION_LABEL_KEYS: Readonly<Record<string, MonitorKey>> = {
  'read-only': 'permReadOnly',
  'workspace-write': 'permWorkspaceWrite',
  'danger-full-access': 'permFullAccess',
  auto: 'permAuto',
  custom: 'permCustom',
}

/**
 * The locale key of one preset value, when the value is one the harness ships.
 * @param value - preset machine value from the catalog or the projection.
 * @returns the dictionary key, or `undefined` for a Host-configured name.
 */
export function permissionLabelKey(value: string | undefined): MonitorKey | undefined {
  if (value === undefined) return undefined
  return PERMISSION_LABEL_KEYS[value]
}

/**
 * Title-case a conventional kebab-case preset name.
 *
 * Host-configured presets carry their own `name`; when that name is the machine
 * value, this is the readable fallback (the shipped picker does the same).
 * @param name - preset name, machine value or product label.
 * @returns the display name unchanged when it is not kebab-case.
 */
export function displayPresetName(name: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Whether picking this preset needs an explicit acknowledgement.
 *
 * The monitor deliberately does not confirm Full access: choosing it in this
 * picker is the user's explicit selection and it switches immediately. Auto
 * review stays behind one acknowledgement because it changes how every request
 * is reviewed, not just where writes are allowed.
 * @param value - preset machine value.
 * @returns true when the pick must be confirmed first.
 */
export function needsPermissionConfirmation(value: string): boolean {
  return value === 'auto'
}

/**
 * Render a working-directory title fallback: the last two path segments.
 * @param cwd - absolute host path.
 * @returns the short label, or `undefined`.
 */
export function shortPath(cwd: string | undefined): string | undefined {
  if (cwd === undefined || cwd === '') return undefined
  const parts = cwd.split('/').filter((part) => part !== '')
  if (parts.length === 0) return cwd
  return parts.slice(-2).join('/')
}

/**
 * The card title of one catalog row, never empty.
 * @param row - one catalog row.
 * @returns the display title.
 */
export function sessionTitle(row: SessionRowLike): string {
  for (const candidate of [row.title, row.displayTitle]) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim()
  }
  const path = shortPath(row.cwd)
  if (path !== undefined) return path
  return row.id.slice(0, 8)
}

/**
 * Derive the state mark of one session.
 *
 * A run that ended and was never opened outranks plain idleness: its green mark
 * is the reminder that the result still needs a look. A fresh run supersedes it
 * (`completionUnread` is already false while running), and a pending question
 * outranks everything, because it is the one state that blocks the session.
 *
 * @param running - host run state.
 * @param pending - pending interaction, when any.
 * @param completionUnread - a finished run this browser has not opened since.
 * @returns the state mark.
 */
export function monitorState(
  running: boolean,
  pending: PendingInteractionLike | undefined,
  completionUnread = false,
): MonitorState {
  if (pending !== undefined) return 'waiting'
  if (running) return 'running'
  return completionUnread ? 'completed' : 'idle'
}

/**
 * Count one optional token bucket, ignoring anything that is not a number.
 * @param value - a provider-reported bucket.
 * @returns the bucket, or 0.
 */
function tokens(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * Sum the three disjoint prompt-side buckets, exactly as the native footer does.
 * @param usage - the session's token-usage projection.
 * @returns billed input tokens (0 when nothing was billed).
 */
export function billedInputTokens(usage: TokenUsageLike | undefined): number {
  if (usage === undefined) return 0
  return tokens(usage.uncachedInputTokens) + tokens(usage.cacheReadTokens) + tokens(usage.cacheWriteTokens)
}

/**
 * Total tokens the session consumed: billed input plus completion output.
 * @param usage - the session's token-usage projection.
 * @returns the total, 0 when no usage is known.
 */
export function consumedTokens(usage: TokenUsageLike | undefined): number {
  if (usage === undefined) return 0
  return billedInputTokens(usage) + tokens(usage.outputTokens)
}

/**
 * Prompt-cache hit share of the billed input.
 *
 * Rounding stays below 100 unless every billed prompt token was a cache read, so
 * a near-miss never reads as a perfect hit — the same rule the native usage pill
 * applies.
 *
 * @param usage - the session's token-usage projection.
 * @returns integer percent, or null when no prompt tokens were billed.
 */
export function cacheHitPercent(usage: TokenUsageLike | undefined): number | null {
  const billed = billedInputTokens(usage)
  const read = tokens(usage?.cacheReadTokens)
  if (billed === 0) return null
  if (read >= billed) return 100
  return Math.min(99, Math.max(0, Math.round((read / billed) * 100)))
}

/** Bounded context occupancy, as the native context meter shows it. */
export interface ContextOccupancy {
  /** Whole percent of the window in use, capped at 100. */
  readonly percent: number
  /** Prompt tokens the next request would carry. */
  readonly used: number
  /** The newest recorded route capacity. */
  readonly contextWindow: number
}

/**
 * Resolve context-window occupancy from the pressure projection.
 *
 * The numerator is the next request's projection when it exists, so the card
 * reacts the moment a compaction changes the surface — the same choice the
 * native meter makes.
 *
 * @param pressure - the session's context-pressure projection.
 * @returns occupancy, or null until both a size and a capacity are known.
 */
export function contextOccupancy(pressure: ContextPressureLike | undefined): ContextOccupancy | null {
  const used = pressure?.projectedTokens ?? pressure?.pressureTokens
  const contextWindow = pressure?.contextWindow
  if (typeof used !== 'number' || !Number.isFinite(used) || used < 0) return null
  if (typeof contextWindow !== 'number' || !Number.isFinite(contextWindow) || contextWindow <= 0) return null
  return { percent: Math.min(100, Math.round((used / contextWindow) * 100)), used, contextWindow }
}

/**
 * Compact a token count for a pill: `999`, `1.2k`, `12k`, `1.3M`.
 * @param value - token count.
 * @returns the short form.
 */
export function formatCompactTokens(value: number): string {
  const whole = Math.max(0, Math.round(value))
  /**
   * One decimal below 100, whole numbers above it — the native token pill's own
   * rule, so `10.5k` does not become `11k`.
   */
  const scaled = (candidate: number): string =>
    candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10)
  if (whole < 1_000) return String(whole)
  if (whole < 1_000_000) return `${scaled(whole / 1_000)}k`
  return `${scaled(whole / 1_000_000)}M`
}

/**
 * Group a token count for a tooltip: `12345` → `12,345`.
 * @param value - token count.
 * @returns the exact form.
 */
export function formatExactTokens(value: number): string {
  return String(Math.max(0, Math.round(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Map every accounted Session to its Workspace title.
 *
 * The catalog row carries only `cwd`, which is a path, not the renamable title a
 * person sees in the sidebar. This reads the Workspace registry so the card shows
 * the name the Workspace actually has.
 *
 * @param workspaces - the Workspace projection rows.
 * @returns session id → Workspace title; empty when the registry is absent.
 */
export function workspaceTitles(
  workspaces: readonly WorkspaceViewLike[] | undefined,
): Map<string, string> {
  const titles = new Map<string, string>()
  if (workspaces === undefined) return titles
  for (const workspace of workspaces) {
    const title = typeof workspace.title === 'string' ? workspace.title.trim() : ''
    const members = workspace.sessionIds
    if (title === '' || !Array.isArray(members)) continue
    for (const id of members) titles.set(id, title)
  }
  return titles
}

/**
 * The literal title the Host gives a Workspace it created on first use.
 *
 * The sidebar replaces it with the caller's localized default name instead of
 * showing the sentinel, and this panel does the same.
 */
export const DEFAULT_WORKSPACE_TITLE = 'default-workspace'

/**
 * Resolve the title a Workspace row is displayed under.
 *
 * @param title - the registry title, possibly the automatic sentinel.
 * @param fallback - localized name for the automatic title.
 * @returns the display title, or `undefined` when the row carries none.
 */
export function workspaceLabel(title: string | undefined, fallback?: string): string | undefined {
  const trimmed = typeof title === 'string' ? title.trim() : ''
  if (trimmed === '') return undefined
  if (trimmed !== DEFAULT_WORKSPACE_TITLE) return trimmed
  return fallback ?? trimmed
}

/**
 * The Workspace a new session should start in.
 *
 * The remembered choice wins while it still exists, so the control keeps the
 * Workspace the user used last. Otherwise the Workspace holding the most
 * recently active Session wins, which is what the native sidebar does; an
 * occupied Workspace beats an empty one, and Host order breaks the last tie.
 *
 * @param items - Workspace rows in Host order.
 * @param list - the Session catalog snapshot, read for recency.
 * @param remembered - this browser's last choice, when it still exists.
 * @returns the Workspace id, or `undefined` when no Workspace is registered.
 */
export function defaultWorkspaceId(
  items: readonly WorkspaceViewLike[] | undefined,
  list: SessionListSnapshotLike | undefined,
  remembered: string | undefined,
): string | undefined {
  if (items === undefined || items.length === 0) return undefined
  const known = new Map<string, WorkspaceViewLike>()
  for (const item of items) {
    const id = item.workspaceId
    if (typeof id === 'string' && id !== '') known.set(id, item)
  }
  if (known.size === 0) return undefined
  if (remembered !== undefined && known.has(remembered)) return remembered

  const byId = list?.byId
  let newest: { readonly id: string; readonly time: number } | undefined
  let firstOccupied: string | undefined
  for (const [id, item] of known) {
    const members = Array.isArray(item.sessionIds) ? item.sessionIds : []
    if (members.length > 0) firstOccupied ??= id
    for (const sessionId of members) {
      const updatedAt = byId?.[sessionId]?.updatedAt
      if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) continue
      if (newest === undefined || updatedAt > newest.time) newest = { id, time: updatedAt }
    }
  }
  return newest?.id ?? firstOccupied ?? known.keys().next().value
}

/**
 * Order and filter the watched sessions.
 *
 * Ordering is deliberate: a session blocked on the user outranks one that is
 * merely running, which outranks an idle but recently used session; within one
 * rank the more recent session comes first. Blank sessions (the sidebar's
 * provisional New Session) and subagent child rows are not conversations a
 * person monitors here, so they are dropped before ordering.
 *
 * @param list - the client Session catalog snapshot.
 * @param statuses - the unified status projection.
 * @param hidden - ids the user removed from the monitor.
 * @param max - card budget; pending sessions are never cut off by it.
 * @param options - Workspace rows and the two local exceptions to filtering.
 * @returns the ordered card list.
 */
export function selectMonitored(
  list: SessionListSnapshotLike | undefined,
  statuses: ReadonlyMap<string, SessionStatusLike> | undefined,
  hidden: ReadonlySet<string>,
  max: number = DEFAULT_MAX_CARDS,
  options: CollectOptions = {},
): MonitoredSession[] {
  return initialCards(collectSessions(list, statuses, hidden, options), max)
}

/**
 * How the page's view of the catalog differs from the raw registry.
 *
 * Everything here is a local presentation choice, not a fact about a Session.
 */
export interface CollectOptions {
  /** Workspace registry rows, read for the titles a card shows. */
  readonly workspaces?: readonly WorkspaceViewLike[]
  /** Localized name for the Host's automatic Workspace title. */
  readonly defaultWorkspaceTitle?: string
  /**
   * Sessions this panel created and still displays while they are blank.
   *
   * A blank Session has no turn yet, so the grid normally ignores it. One that
   * was created here is exactly the card the user just asked for, and it keeps
   * showing until its first turn gives it a title.
   */
  readonly spawned?: ReadonlySet<string>
  /** Localized title for a spawned blank Session's card. */
  readonly blankTitle?: string
}

/**
 * Collect every session eligible for a card, in catalog order.
 *
 * Filtering is the only opinion here: blank provisional sessions and subagent
 * child rows are not conversations a person monitors, and a hidden session is
 * one this browser removed from the grid. Ordering happens separately because
 * the grid freezes an order once cards are on screen.
 *
 * @param list - the client Session catalog snapshot.
 * @param statuses - the unified status projection.
 * @param hidden - ids the user removed from the monitor.
 * @param options - Workspace rows, the localized automatic title, and the
 *   spawned blanks this page keeps as cards.
 * @returns the eligible sessions, unordered.
 */
export function collectSessions(
  list: SessionListSnapshotLike | undefined,
  statuses: ReadonlyMap<string, SessionStatusLike> | undefined,
  hidden: ReadonlySet<string>,
  options: CollectOptions = {},
): MonitoredSession[] {
  const byId = list?.byId
  if (byId === undefined) return []
  const ids = list?.ids ?? Object.keys(byId)
  const workspaceBySession = workspaceTitles(options.workspaces)

  const candidates: MonitoredSession[] = []
  for (const id of ids) {
    if (hidden.has(id)) continue
    const row = byId[id]
    if (row === undefined) continue
    const blank = row.blank === true
    if (blank && options.spawned?.has(id) !== true) continue
    if (row.origin === 'subagent' || row.parentId !== undefined) continue
    const status = statuses?.get(id)
    const pending = status?.pendingInteraction
    const running = row.running === true || status?.running === true
    candidates.push({
      id,
      title: blank ? (options.blankTitle ?? sessionTitle(row)) : sessionTitle(row),
      cwd: row.cwd,
      workspace:
        workspaceLabel(workspaceBySession.get(id), options.defaultWorkspaceTitle) ?? shortPath(row.cwd),
      running,
      pending,
      updatedAt: row.updatedAt ?? 0,
      state: monitorState(running, pending),
      completionUnread: status?.completionUnread === true,
    })
  }
  return candidates
}

/**
 * Rank a candidate for the very first order: a session blocked on the user
 * outranks a working one, which outranks an idle but recently used session.
 * This precedence is used only when the grid is seeded (or a brand-new card is
 * admitted into a full grid); after that the displayed order is frozen.
 * @param entry - one candidate.
 * @returns the precedence rank.
 */
function precedence(entry: MonitoredSession): number {
  return entry.state === 'waiting' ? 2 : entry.running ? 1 : 0
}

/**
 * Compare two candidates by the initial precedence.
 * @param left - one candidate.
 * @param right - another candidate.
 * @returns the sort comparison.
 */
function byPrecedence(left: MonitoredSession, right: MonitoredSession): number {
  const byRank = precedence(right) - precedence(left)
  if (byRank !== 0) return byRank
  const byRecent = right.updatedAt - left.updatedAt
  if (byRecent !== 0) return byRecent
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

/**
 * Normalise a card budget.
 * @param max - requested budget.
 * @returns a budget between {@link MIN_CARDS} and {@link MAX_CARDS_LIMIT}.
 */
function budgetOf(max: number): number {
  return clampMaxCards(max)
}

/**
 * The initial grid: precedence order, capped by the budget.
 *
 * The budget applies to idle/running cards only; a waiting session is the
 * reason the monitor exists and is never cut off by it.
 *
 * @param candidates - every eligible session.
 * @param max - card budget.
 * @returns the cards in their first display order.
 */
export function initialCards(candidates: readonly MonitoredSession[], max: number = DEFAULT_MAX_CARDS): MonitoredSession[] {
  const budget = budgetOf(max)
  const sorted = [...candidates].sort(byPrecedence)
  const shown: MonitoredSession[] = []
  let ordinary = 0
  for (const entry of sorted) {
    if (entry.state === 'waiting') {
      shown.push(entry)
      continue
    }
    if (ordinary >= budget) continue
    ordinary += 1
    shown.push(entry)
  }
  return shown
}

/**
 * The full seed order: every candidate ranked by precedence, without the budget.
 *
 * The budget decides what is *shown*, not what is *known*: seeding only the
 * visible prefix would make every older-than-budget session look like a new
 * arrival on the next reconcile, and those "arrivals" would then displace
 * displayed cards. Keeping the whole order lets {@link displayOrder} hide the
 * tail and reveal it again, in place, when the budget grows.
 *
 * @param candidates - every eligible session at the first reconcile.
 * @returns every candidate id, in precedence order.
 */
export function seedOrder(candidates: readonly MonitoredSession[]): string[] {
  return [...candidates].sort(byPrecedence).map((entry) => entry.id)
}

/**
 * Reconcile the frozen display order with the current candidate set.
 *
 * Once a card is on screen its position is stable: a prompt, a new turn or a
 * state change updates the card's own content, never the grid's order. Two
 * things may still change the grid:
 *
 * - a displayed session disappears (removed, or hidden by the user): its slot
 *   collapses;
 * - a session that is not displayed yet appears: with room it joins at the end,
 *   and on a full grid it takes the slot of the **least recently used**
 *   displayed card, so every other card keeps its position. A waiting card is
 *   never displaced.
 *
 * The returned order may hold more cards than the budget shows; {@link
 * displayOrder} decides which prefix is actually on screen. This reconcile never
 * re-ranks: activity and a larger budget leave every position alone. A smaller
 * budget is the one explicit exception — {@link orderForBudget} re-seeds the
 * grid first, so the cards that stay are the newest ones.
 *
 * A displaced card keeps its place in the order, at the tail: it becomes the
 * last candidate the budget hides. Dropping it instead would make it "fresh" on
 * the next reconcile, and it would then replace the next oldest card — the grid
 * would churn between two cards for as long as both exist. The page stores this
 * order, so a remount or an app restart resumes the same positions instead of
 * re-seeding them by recency.
 *
 * @param previous - ids in their displayed order.
 * @param candidates - every currently eligible session.
 * @param max - card budget for the ordinary cards.
 * @returns the next frozen order.
 */
export function reconcileOrder(
  previous: readonly string[],
  candidates: readonly MonitoredSession[],
  max: number = DEFAULT_MAX_CARDS,
): string[] {
  const budget = budgetOf(max)
  const byId = new Map(candidates.map((entry) => [entry.id, entry]))
  const order: string[] = []
  for (const id of previous) {
    if (byId.has(id) && !order.includes(id)) order.push(id)
  }

  const shown = (): string[] => displayOrder(order, candidates, budget)
  const shownOrdinary = (): string[] =>
    shown().filter((id) => byId.get(id)?.state !== 'waiting')

  /** The least recently used displayed ordinary card, if any is displayed. */
  const oldestOrdinary = (): string | undefined => {
    let oldestId: string | undefined
    let oldestAt = Number.POSITIVE_INFINITY
    for (const id of shownOrdinary()) {
      const card = byId.get(id)
      if (card === undefined) continue
      if (card.updatedAt < oldestAt) {
        oldestAt = card.updatedAt
        oldestId = id
      }
    }
    return oldestId
  }

  const fresh = candidates.filter((entry) => !order.includes(entry.id)).sort(byPrecedence)
  for (const entry of fresh) {
    if (entry.state === 'waiting') {
      // A blocked session is never cut off; appended so no displayed card moves.
      order.push(entry.id)
      continue
    }
    if (shownOrdinary().length < budget) {
      // Room: the new card joins after the last one and nothing else moves.
      order.push(entry.id)
      continue
    }
    // Full: the least recently used displayed ordinary card yields its slot,
    // and the new card takes that exact position. The displaced card stays
    // known at the tail, hidden by the budget, so it cannot come back and push
    // another card out on the next reconcile.
    const oldestId = oldestOrdinary()
    if (oldestId === undefined) {
      // Every displayed card is waiting: keep them and show the new one too.
      order.push(entry.id)
      continue
    }
    const index = order.indexOf(oldestId)
    if (index === -1) {
      order.push(entry.id)
    } else {
      order.splice(index, 1, entry.id)
      order.push(oldestId)
    }
  }

  return order
}

/**
 * The first order of a grid that has none yet.
 *
 * Seeding is the only place recency decides a position. A monitor whose order was
 * never stored (a first mount, a fresh browser) starts from the same precedence
 * the shipped Session rows use; from then on the order is frozen and stored.
 *
 * @param previous - the stored order; used as-is when it is not empty.
 * @param candidates - every currently eligible session.
 * @param max - card budget for the ordinary cards.
 * @returns the next frozen order.
 */
export function orderOrSeed(
  previous: readonly string[],
  candidates: readonly MonitoredSession[],
  max: number = DEFAULT_MAX_CARDS,
): string[] {
  return previous.length === 0 ? seedOrder(candidates) : reconcileOrder(previous, candidates, max)
}

/**
 * The order to use after a card-budget change.
 *
 * Lowering the budget is a request to see the newest sessions: the grid is
 * re-seeded from the current candidates (waiting, then running, then recency),
 * so the cards that stay on screen are the newest ones and they are
 * re-arranged to say so. Raising the budget, or leaving it alone, keeps the
 * frozen order — the cards already on screen do not move, and the extra room
 * reveals the order's next cards in place.
 *
 * @param previous - the stored order.
 * @param candidates - every currently eligible session.
 * @param previousMax - the budget the grid used before this change.
 * @param max - the budget now.
 * @returns the re-seeded order on a shrink, otherwise {@link orderOrSeed}.
 */
export function orderForBudget(
  previous: readonly string[],
  candidates: readonly MonitoredSession[],
  previousMax: number,
  max: number = DEFAULT_MAX_CARDS,
): string[] {
  if (max < previousMax) return seedOrder(candidates)
  return orderOrSeed(previous, candidates, max)
}

/**
 * The cards actually on screen, in their frozen order.
 *
 * Waiting cards are always shown; ordinary cards are taken up to the budget, so
 * a budget that shrank shows the newest cards (the order was re-seeded) and
 * raising it again reveals the rest of that order.
 *
 * @param ordered - the frozen order of ids.
 * @param candidates - every currently eligible session.
 * @param max - card budget for the ordinary cards.
 * @returns the visible ids, in display order.
 */
export function displayOrder(
  ordered: readonly string[],
  candidates: readonly MonitoredSession[],
  max: number = DEFAULT_MAX_CARDS,
): string[] {
  const budget = budgetOf(max)
  const byId = new Map(candidates.map((entry) => [entry.id, entry]))
  const shown: string[] = []
  let ordinary = 0
  for (const id of ordered) {
    const entry = byId.get(id)
    if (entry === undefined) continue
    if (entry.state === 'waiting') {
      shown.push(id)
      continue
    }
    if (ordinary >= budget) continue
    ordinary += 1
    shown.push(id)
  }
  return shown
}

/**
 * Read the plain text of one message content block list.
 * @param content - blocks array from a message payload.
 * @returns joined text, trimmed.
 */
function blocksText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (textField(block, 'type') !== 'text') continue
    const text = textField(block, 'text')
    if (text !== undefined && text.trim() !== '') parts.push(text)
  }
  return parts.join('\n').trim()
}

/**
 * One-line argument hint for a tool call.
 *
 * The call arguments are a JSON string. A monitor wants to recognize the call,
 * not read it, so the first two keys are shown with clipped values; anything
 * unparsable falls back to the raw prefix.
 *
 * @param argumentsText - `tool/call.data.arguments`.
 * @returns the hint.
 */
export function summarizeArguments(argumentsText: string | undefined): string {
  if (argumentsText === undefined || argumentsText.trim() === '') return ''
  try {
    const parsed: unknown = JSON.parse(argumentsText)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return ''
    const keys = Object.keys(parsed).slice(0, 2)
    const shown = keys.map((key) => {
      const value = (parsed as Record<string, unknown>)[key]
      const rendered =
        typeof value === 'string'
          ? value.replace(/\s+/g, ' ').trim()
          : typeof value === 'number' || typeof value === 'boolean'
            ? String(value)
            : Array.isArray(value)
              ? `[${value.length}]`
              : '…'
      return `${key}=${rendered.length > 60 ? `${rendered.slice(0, 60)}…` : rendered}`
    })
    return shown.join(' · ')
  } catch {
    const flat = argumentsText.replace(/\s+/g, ' ').trim()
    return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat
  }
}

/**
 * Read the first line of a tool result payload.
 * @param message - `tool/result.data.message`.
 * @returns a clipped one-line result hint.
 */
function resultHint(message: unknown): string {
  const text = blocksText(field(message, 'content'))
  if (text === '') return ''
  const firstLine = text.split('\n')[0] ?? ''
  return firstLine.length > 100 ? `${firstLine.slice(0, 100)}…` : firstLine
}

/**
 * Build the compact transcript of one session.
 *
 * The single pass keeps two indexes so repeated events update one row instead of
 * appending a new one: a tool call and its result share the call row, and every
 * streamed text delta lands in the same live assistant row of its attempt. The
 * result is the last {@link TRANSCRIPT_WINDOW} rows, oldest first.
 *
 * User and assistant text is kept **whole**. The card already scrolls, so a
 * character budget on that text only cuts a sentence in half and shows an
 * ellipsis where the conversation continues; the row window alone bounds the
 * work a card does.
 *
 * @param entries - the Session binding's event window entries.
 * @returns transcript rows, oldest first.
 */
export function deriveTranscript(entries: readonly EventEntryLike[] | undefined): TranscriptRow[] {
  if (entries === undefined) return []
  const rows: TranscriptRow[] = []
  /** Tool-call identity → index of its row. */
  const tools = new Map<string, number>()
  /** Assistant attempt identity → index of its live text row. */
  const live = new Map<string, number>()

  for (const entry of entries) {
    const event = entry?.event
    const type = event?.type
    if (type === undefined) continue
    const time = event?.time ?? 0
    const data = event?.data
    const seq = event?.seq ?? 0

    switch (type) {
      case 'user/message': {
        const sourceKind = textField(field(data, 'source'), 'kind')
        if (sourceKind !== undefined && !HUMAN_SOURCES.has(sourceKind)) continue
        const text = blocksText(field(data, 'content'))
        if (text === '') continue
        const id = textField(data, 'id') ?? String(seq)
        rows.push({ kind: 'user', key: `user:${id}`, time, text })
        continue
      }
      case 'assistant/message': {
        const text = blocksText(field(field(data, 'message'), 'content'))
        if (text === '') continue
        const key = `assistant:${seq}`
        // The durable settlement retires its live chunks from the window, so
        // this row replaces the transient one instead of duplicating it.
        rows.push({ kind: 'assistant', key, time, text, live: false })
        continue
      }
      case 'assistant/live-chunk': {
        const chunk = field(data, 'chunk')
        if (textField(chunk, 'type') !== 'text-delta') continue
        const delta = textField(chunk, 'text') ?? ''
        if (delta === '') continue
        const attemptId = textField(data, 'attemptId') ?? 'live'
        const index = live.get(attemptId)
        if (index === undefined) {
          live.set(attemptId, rows.length)
          rows.push({ kind: 'assistant', key: `live:${attemptId}`, time, text: delta, live: true })
          continue
        }
        const previous = rows[index]
        if (previous?.kind !== 'assistant') continue
        rows[index] = { ...previous, text: previous.text + delta }
        continue
      }
      case 'tool/call': {
        const callId = textField(data, 'callId') ?? `seq-${seq}`
        const name = textField(data, 'name') ?? 'tool'
        const detail = summarizeArguments(textField(data, 'arguments'))
        tools.set(callId, rows.length)
        rows.push({ kind: 'tool', key: `tool:${callId}`, time, name, detail, status: 'running' })
        continue
      }
      case 'tool/result': {
        const message = field(data, 'message')
        const callId = textField(data, 'toolCallId') ?? textField(message, 'toolCallId')
        if (callId === undefined) continue
        const index = tools.get(callId)
        const failed = field(message, 'isError') === true || field(data, 'error') !== undefined
        const hint = resultHint(message)
        const status: 'done' | 'error' = failed ? 'error' : 'done'
        if (index === undefined) {
          rows.push({ kind: 'tool', key: `tool:${callId}`, time, name: 'tool', detail: hint, status })
          continue
        }
        const previous = rows[index]
        if (previous?.kind !== 'tool') continue
        rows[index] = { ...previous, status, detail: failed && hint !== '' ? hint : previous.detail }
        continue
      }
      case 'approval/asked': {
        rows.push({
          kind: 'notice',
          key: `approval-asked:${seq}`,
          time,
          tone: 'info',
          code: 'approval-asked',
          detail: textField(data, 'toolName'),
        })
        continue
      }
      case 'approval/decided': {
        const outcome = textField(data, 'outcome') ?? 'decided'
        rows.push({
          kind: 'notice',
          key: `approval-decided:${seq}`,
          time,
          tone: outcome === 'rejected' ? 'error' : 'info',
          code: 'approval-decided',
          detail: outcome,
        })
        continue
      }
      case 'llm/retry': {
        const reason = textField(data, 'reason') ?? textField(data, 'message')
        rows.push({
          kind: 'notice',
          key: `retry:${seq}`,
          time,
          tone: 'error',
          code: 'retry',
          detail: reason,
        })
        continue
      }
      default:
        continue
    }
  }

  return rows.slice(-TRANSCRIPT_WINDOW)
}

/** How many transcript rows one card keeps. */
export const TRANSCRIPT_WINDOW = 60

/**
 * Newest event time in a loaded window.
 *
 * The catalog's `updatedAt` advances on user activity only; this advances on any
 * session event, which is what makes a card's "ago" label a liveness signal: a
 * stalled stream freezes it while a live one keeps saying "just now".
 *
 * @param entries - loaded window entries.
 * @returns epoch milliseconds, or 0 when the window holds no timed event.
 */
export function newestEventTime(entries: readonly EventEntryLike[] | undefined): number {
  if (entries === undefined) return 0
  let newest = 0
  for (const entry of entries) {
    const time = entry.event?.time
    if (typeof time === 'number' && Number.isFinite(time) && time > newest) newest = time
  }
  return newest
}

/**
 * Detect an interaction the monitor can answer.
 * @param interaction - a pending-interaction carrier.
 * @returns whether it exposes the settlement method the monitor calls.
 */
export function isAnswerable(interaction: PendingInteractionLike | undefined): boolean {
  return interaction !== undefined && typeof interaction.answer === 'function' && interaction.answerable !== false
}

/** A localized-able relative timestamp: the page supplies the words. */
export type RelativeLabel =
  | { readonly unit: 'now' }
  | { readonly unit: 'minute'; readonly count: number }
  | { readonly unit: 'hour'; readonly count: number }
  | { readonly unit: 'day'; readonly count: number }
  | { readonly unit: 'date'; readonly text: string }

/**
 * Classify one event timestamp against the current clock.
 * @param now - current epoch milliseconds.
 * @param time - event epoch milliseconds.
 * @returns the label parts, or `undefined` for an unusable timestamp.
 */
export function relativeLabel(now: number, time: number): RelativeLabel | undefined {
  if (!Number.isFinite(time) || time <= 0) return undefined
  const delta = Math.max(0, now - time)
  if (delta < 45_000) return { unit: 'now' }
  if (delta < 3_600_000) return { unit: 'minute', count: Math.max(1, Math.round(delta / 60_000)) }
  if (delta < 86_400_000) return { unit: 'hour', count: Math.round(delta / 3_600_000) }
  if (delta < 7 * 86_400_000) return { unit: 'day', count: Math.round(delta / 86_400_000) }
  const date = new Date(time)
  return { unit: 'date', text: `${date.getMonth() + 1}/${date.getDate()}` }
}