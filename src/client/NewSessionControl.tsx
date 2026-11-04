/**
 * The toolbar's new-session control: one button, and the Workspace it starts in.
 *
 * The select beside the button is the Workspace choice for the next session, so
 * a person can start a session in any registered Workspace without leaving the
 * monitor. Its last row opens the host's folder chooser and adopts the picked
 * folder as a Workspace first, which is how a session starts in a directory the
 * sidebar does not list yet.
 *
 * The control owns no session state: it calls the injected verbs and reports
 * their outcome. Once a session is created the conversation view is revealed,
 * so this panel may unmount while the request is still in flight.
 *
 * @module dsh-session-monitor/client/NewSessionControl
 */

import { useState, type ChangeEvent, type ReactElement } from 'react'
import type { MonitorTranslate } from './locales.ts'
import { shortPath, workspaceLabel } from './model.ts'
import type { NewSessionActionsLike, WorkspaceViewLike } from './types.ts'

/**
 * Pseudo-value of the select's folder row.
 *
 * Workspace ids are Host-generated opaque strings, so a value carrying a `::`
 * prefix cannot collide with one.
 */
export const CHOOSE_FOLDER = '::choose-folder'

/** What the control is waiting for, if anything. */
type Busy = 'idle' | 'starting' | 'picking' | 'adopting'

/** Props of the new-session control. */
export interface NewSessionControlProps {
  /** Bound translate seat. */
  readonly t: MonitorTranslate
  /** Workspace rows, in Host (sidebar) order. */
  readonly workspaces: readonly WorkspaceViewLike[]
  /** The Workspace the next session starts in, when one is known. */
  readonly selectedId: string | undefined
  /** The creation verbs the composition provides. */
  readonly actions: NewSessionActionsLike
  /** Remember one Workspace choice. */
  readonly onSelect: (workspaceId: string) => void
  /**
   * Report the Session that was created, so the page can put its card in the
   * oldest card's slot without moving the others.
   */
  readonly onStarted?: (sessionId: string) => void
}

/**
 * Read a failure as one line of text.
 * @param failure - the thrown value.
 * @returns its message when it has one, else its string form.
 */
function reasonOf(failure: unknown): string {
  if (failure instanceof Error && failure.message.trim() !== '') return failure.message
  const text = String(failure).trim()
  return text === '' ? 'unknown error' : text
}

/**
 * Render the new-session control.
 * @param props - the Workspace rows, the current choice and the creation verbs.
 * @returns the button with its Workspace select.
 */
export function NewSessionControl({
  t,
  workspaces,
  selectedId,
  actions,
  onSelect,
  onStarted,
}: NewSessionControlProps): ReactElement {
  const [busy, setBusy] = useState<Busy>('idle')
  const [error, setError] = useState<string | undefined>(undefined)

  const labels = new Map<string, string>()
  for (const workspace of workspaces) {
    const id = workspace.workspaceId
    if (typeof id !== 'string' || id === '') continue
    labels.set(
      id,
      workspaceLabel(workspace.title, t('defaultWorkspace')) ?? shortPath(workspace.path) ?? id,
    )
  }

  const selectedLabel = selectedId === undefined ? undefined : labels.get(selectedId)
  /** The folder row exists only when both halves of the adoption are provided. */
  const canPick = actions.pickFolder !== undefined && actions.createWorkspace !== undefined

  /** Create the session in place; a refusal is reported, not swallowed. */
  const start = async (workspaceId: string): Promise<void> => {
    setError(undefined)
    setBusy('starting')
    try {
      const sessionId = await actions.start(workspaceId)
      if (typeof sessionId === 'string' && sessionId !== '') onStarted?.(sessionId)
    } catch (failure) {
      setError(t('newSessionFailed', { reason: reasonOf(failure) }))
    } finally {
      setBusy('idle')
    }
  }

  /** Pick a folder, adopt it as a Workspace, then start the session there. */
  const chooseFolder = async (): Promise<void> => {
    if (!canPick || busy !== 'idle') return
    setError(undefined)
    setBusy('picking')
    try {
      const path = await actions.pickFolder?.()
      // A cancelled chooser is not a failure: the previous choice stays.
      if (path === undefined || path === null || path.trim() === '') return
      setBusy('adopting')
      const workspace = await actions.createWorkspace?.(path)
      const id = workspace?.workspaceId
      if (typeof id !== 'string' || id === '') {
        setError(t('newSessionFailed', { reason: path }))
        return
      }
      onSelect(id)
      await start(id)
    } catch (failure) {
      setError(t('newSessionFailed', { reason: reasonOf(failure) }))
    } finally {
      setBusy('idle')
    }
  }

  const handleSelect = (event: ChangeEvent<HTMLSelectElement>): void => {
    const value = event.target.value
    if (value === CHOOSE_FOLDER) {
      // A pseudo-row: hand the select back to the real choice so the control
      // keeps showing where the next session will start. The flow re-renders,
      // so the reverted value is what the user sees.
      event.target.value = selectedId ?? ''
      if (canPick) void chooseFolder()
      return
    }
    setError(undefined)
    onSelect(value)
  }

  // One line of feedback beside the controls: the error outranks progress.
  const status =
    error !== undefined
      ? { tone: 'error', text: error }
      : busy === 'picking'
        ? { tone: 'progress', text: t('newSessionPicking') }
        : busy === 'adopting'
          ? { tone: 'progress', text: t('newSessionAdopting') }
          : undefined

  return (
    <div className="dsm-newSession">
      <button
        type="button"
        className="dsm-btn"
        data-primary="true"
        disabled={selectedId === undefined || busy !== 'idle'}
        title={
          selectedLabel === undefined
            ? t('newSession')
            : t('newSessionHint', { workspace: selectedLabel })
        }
        onClick={() => {
          if (selectedId === undefined || busy !== 'idle') return
          void start(selectedId)
        }}
      >
        <span className="dsm-newGlyph" aria-hidden="true">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M6 2.5v7M2.5 6h7" />
          </svg>
        </span>
        {busy === 'starting' ? t('newSessionStarting') : t('newSession')}
      </button>
      <select
        className="dsm-select dsm-newWorkspace"
        aria-label={t('newSessionWorkspace')}
        title={t('newSessionWorkspace')}
        value={selectedId ?? ''}
        disabled={busy !== 'idle'}
        onChange={handleSelect}
      >
        {selectedId === undefined ? (
          <option value="" disabled>
            {t('noWorkspace')}
          </option>
        ) : null}
        {workspaces.map((workspace) => (
          <option key={workspace.workspaceId} value={workspace.workspaceId} title={workspace.path}>
            {labels.get(workspace.workspaceId ?? '') ?? workspace.workspaceId}
          </option>
        ))}
        {canPick ? <option value={CHOOSE_FOLDER}>{t('pickFolder')}</option> : null}
      </select>
      {status === undefined ? null : (
        <span
          className="dsm-newStatus"
          data-tone={status.tone}
          role={status.tone === 'error' ? 'alert' : 'status'}
        >
          {status.text}
        </span>
      )}
    </div>
  )
}