/**
 * Reveal a Session's Workspace in the host sidebar.
 *
 * Opening a Session and folding its Workspace are two different things to the
 * host. `ctx.uiWorkspace.openSession()` selects the Session, but the sidebar
 * expands a group only when that group has **no explicit expansion entry**
 * (`Object.hasOwn(groupExpansion, currentGroup)` in `dsh-client-ui-workspace`).
 * Once the user has folded a Workspace once, the entry stays in the persisted
 * view state, so every later open leaves the row hidden behind a folded group.
 * The sidebar publishes no service for its expansion state, so this bundle
 * drives the row the way the user does: it clicks the
 * `data-row-key="workspace:<id>"` tree item while it is folded. The shipped
 * `dsh-workspace-running-indicator` reads those same rows for its badge, so the
 * addressing is not invented here.
 *
 * Every read is defensive: a host that renames the row, a page without a
 * sidebar (rail, flat grouping) or a composition without Workspaces simply gets
 * no expansion. The title stays a working link, exactly as before.
 *
 * @module dsh-session-monitor/client/workspaceReveal
 */

import type { WorkspaceViewLike } from './types.ts'

/** Prefix of the sidebar `data-row-key` that names a Workspace header row. */
export const WORKSPACE_ROW_KEY_PREFIX = 'workspace:'

/** Every tree item that can carry a row key, wherever the sidebar mounted it. */
const TREE_ITEM = '[role="treeitem"][data-row-key]'

/**
 * The `data-row-key` the sidebar gives one Workspace's header row.
 * @param workspaceId - Workspace identity.
 * @returns the row key.
 */
export function workspaceRowKey(workspaceId: string): string {
  return `${WORKSPACE_ROW_KEY_PREFIX}${workspaceId}`
}

/**
 * Normalize a directory for path comparisons: both separators become `/`, a
 * trailing separator is dropped, and the filesystem root keeps its one slash.
 * @param value - candidate path from the Host projection.
 * @returns the normalized path, or `undefined` when the value is not a path.
 */
function directoryPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const normalized = trimmed.replaceAll('\\', '/').replace(/\/+$/, '')
  return normalized === '' ? '/' : normalized
}

/**
 * Resolve the Workspace that owns one Session.
 *
 * The Workspace projection's own membership is authoritative; the Session's
 * `cwd` is the fallback the host's derived rows also use, so a Workspace whose
 * membership has not arrived yet still expands when the directory matches.
 *
 * @param sessionId - Session whose group is required.
 * @param workspaces - `ctx.workspaces.list` items, as published.
 * @param cwd - the Session's working directory, when the catalog reports one.
 * @returns the owning Workspace id, or `undefined` for Unassigned / unknown.
 */
export function workspaceIdForSession(
  sessionId: string,
  workspaces: readonly WorkspaceViewLike[] | undefined,
  cwd: string | undefined,
): string | undefined {
  if (!Array.isArray(workspaces)) return undefined
  for (const workspace of workspaces) {
    const id = workspace?.workspaceId
    if (typeof id !== 'string' || id === '') continue
    const members = workspace.sessionIds
    if (Array.isArray(members) && members.includes(sessionId)) return id
  }
  const directory = directoryPath(cwd)
  if (directory === undefined) return undefined
  for (const workspace of workspaces) {
    const id = workspace?.workspaceId
    if (typeof id !== 'string' || id === '') continue
    if (directoryPath(workspace.path) === directory) return id
  }
  return undefined
}

/**
 * Expand one Workspace group in the host sidebar, if it is folded.
 *
 * The row is left alone when it is already expanded (`aria-expanded` is
 * anything but `"false"`); a row the sidebar does not render — rail sidebar,
 * flat session grouping, folded ancestor in tree grouping — is simply not
 * found. The click runs synchronously inside the title click, before the
 * navigation re-renders the tree, so the row this function addresses is the one
 * currently mounted.
 *
 * @param workspaceId - Workspace whose group should open.
 * @param doc - document to query; defaults to the page's own. Tests pass theirs.
 * @returns whether a Workspace row was found (an already-open row counts).
 */
export function expandWorkspaceGroup(
  workspaceId: string,
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
): boolean {
  if (workspaceId === '') return false
  if (doc === undefined || typeof doc.querySelectorAll !== 'function') return false
  const key = workspaceRowKey(workspaceId)
  let rows: NodeListOf<HTMLElement>
  try {
    rows = doc.querySelectorAll<HTMLElement>(TREE_ITEM)
  } catch {
    return false
  }
  for (const row of rows) {
    if (row.getAttribute('data-row-key') !== key) continue
    if (row.getAttribute('aria-expanded') === 'false') {
      // The host row's own click handler toggles the persisted group state.
      row.click()
    }
    return true
  }
  return false
}