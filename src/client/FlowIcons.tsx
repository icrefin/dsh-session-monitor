/**
 * The flow view's own glyphs, drawn inline in `currentColor`.
 *
 * A plugin must not import the host's icon package into its client half: a
 * primitive can change without notice, and a throwing component blanks the slot
 * entry. These are self-contained SVGs that inherit the surrounding colour, so
 * the sidebar's active and idle states, the status tokens and dark mode all
 * apply without a second style.
 *
 * @module dsh-session-monitor/client/FlowIcons
 */

import type { ReactElement } from 'react'
import type { StepStatus } from './flowProgress.ts'

/**
 * One step's status mark inside the timeline.
 *
 * @param props - the step status and an optional size.
 * @returns the inline SVG glyph.
 */
export function StepGlyph({ status, size = 14 }: { readonly status: StepStatus; readonly size?: number }): ReactElement {
  if (status === 'running') {
    return (
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        fill="none"
        aria-hidden="true"
        focusable="false"
        className="dsf-stepSpinner"
      >
        <circle cx="8" cy="8" r="5.4" stroke="currentColor" strokeWidth="1.6" opacity="0.25" />
        <path d="M8 2.6a5.4 5.4 0 0 1 5.4 5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }
  if (status === 'error') {
    return (
      <svg viewBox="0 0 16 16" width={size} height={size} fill="none" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="5.7" stroke="currentColor" strokeWidth="1.3" opacity="0.55" />
        <path d="M6.1 6.1l3.8 3.8M9.9 6.1l-3.8 3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" aria-hidden="true" focusable="false">
      <path d="M3.6 8.4l2.9 2.9 5.9-6.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * The empty state's glyph: an empty step rail.
 *
 * @param props - optional size.
 * @returns the inline SVG glyph.
 */
export function EmptyGlyph({ size = 26 }: { readonly size?: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true" focusable="false">
      <circle cx="5.5" cy="5.5" r="2.1" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="5.5" cy="12" r="2.1" stroke="currentColor" strokeWidth="1.3" opacity="0.6" />
      <circle cx="5.5" cy="18.5" r="2.1" stroke="currentColor" strokeWidth="1.3" opacity="0.35" />
      <path d="M10.5 5.5h8M10.5 12h6M10.5 18.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}