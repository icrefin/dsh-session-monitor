/**
 * The component the `main` slot actually renders: the monitor page behind a
 * page-level crash boundary.
 *
 * Registering this wrapper instead of {@link MonitorPage} directly is what keeps
 * the shell's slot boundary out of the picture. A throw inside the page — even
 * one from its own hooks, before any card mounts — lands in
 * {@link PanelErrorBoundary}, renders a readable "try again" panel, and leaves
 * the registration alive. Without it the shell retires the entry and the centre
 * column stays blank until the browser is reloaded.
 *
 * @module dsh-session-monitor/client/MonitorPanel
 */

import type { ReactElement } from 'react'
import { PanelErrorBoundary } from './Boundaries.tsx'
import { MonitorPage, type MonitorPageProps } from './MonitorPage.tsx'

/**
 * Render the monitor panel with its crash containment.
 * @param props - the slot-composed props the page needs.
 * @returns the bounded page.
 */
export function MonitorPanel(props: MonitorPageProps): ReactElement {
  return (
    <PanelErrorBoundary t={props.t}>
      <MonitorPage {...props} />
    </PanelErrorBoundary>
  )
}