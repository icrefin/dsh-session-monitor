/**
 * The sidebar row glyph: four panes, which is what the monitor shows.
 *
 * Drawn in `currentColor` so the sidebar's own active and idle colours apply,
 * and decorative (`aria-hidden`) because the row's label carries the name.
 *
 * @module dsh-session-monitor/client/PanelIcon
 */

import type { ReactElement } from 'react'

/** Geometry the sidebar hands one panel row. */
export interface PanelIconProps {
  /** Requested square edge in pixels (16 expanded, 18 in the rail). */
  size: number
  /** Whether this panel is the selected main panel. */
  active: boolean
}

/**
 * Render the panel glyph.
 * @param props - requested size and selection state.
 * @returns the inline SVG.
 */
export function PanelIcon({ size, active }: PanelIconProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 1.5 : 1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2.25" y="2.75" width="4.6" height="4.3" rx="1" />
      <rect x="9.15" y="2.75" width="4.6" height="4.3" rx="1" />
      <rect x="2.25" y="8.95" width="4.6" height="4.3" rx="1" />
      <rect x="9.15" y="8.95" width="4.6" height="4.3" rx="1" />
    </svg>
  )
}