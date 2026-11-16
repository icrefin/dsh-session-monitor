/**
 * Crash containment for the monitor's own surfaces.
 *
 * The web shell isolates every registered slot entry: a component that throws
 * during render (or in an effect it owns) is reported to the slot registry, the
 * entry is **retired**, and the region keeps an empty crash face until the page
 * is reloaded. For the monitor that region is the whole centre column, so one
 * unexpected value in one card would present as a blank page and a reload
 * requirement — the exact failure these boundaries exist to prevent.
 *
 * Two boundaries are installed, each with a different reach:
 *
 * - {@link PanelErrorBoundary} wraps the page itself, so anything the page's own
 *   hooks throw is caught inside this plugin. The shell never sees the error, the
 *   entry stays registered, and Retry remounts a fresh page instead of asking for
 *   a browser reload.
 * - {@link CardErrorBoundary} wraps one card, so a value only that card cannot
 *   draw costs its own cell, not the grid beside it.
 *
 * Neither boundary reports anything upwards: a contained failure is a monitor
 * problem, not a harness problem.
 *
 * @module dsh-session-monitor/client/Boundaries
 */

import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react'
import type { MonitorKey, MonitorTranslate } from './locales.ts'

/** What one boundary remembers about the failed mount. */
interface BoundaryState {
  /** The subtree threw and the fallback is showing. */
  readonly failed: boolean
  /** Remount axis: every retry renders the subtree from scratch. */
  readonly attempt: number
  /** One line naming the failure, so a recurrence is diagnosable in place. */
  readonly reason: string
}

/** Props of the page-level boundary. */
export interface PanelErrorBoundaryProps {
  /** Bound translate seat, for the fallback copy. */
  readonly t: MonitorTranslate
  /** The monitor page. */
  readonly children: ReactNode
}

/** Props of the per-card boundary. */
export interface CardErrorBoundaryProps {
  /** Bound translate seat, for the fallback copy. */
  readonly t: MonitorTranslate
  /** The card's session title, so the failed cell still says what it was. */
  readonly title: string
  /** The card. */
  readonly children: ReactNode
}

/**
 * Translate one key without letting a broken dictionary break the fallback.
 *
 * The fallback exists for the case where something already threw; it must not
 * become a second throw. A locale that cannot answer leaves the literal English
 * sentence in place.
 *
 * @param t - bound translate seat.
 * @param key - one of this plugin's keys.
 * @param literal - English text used only when the seat throws.
 * @returns the localized sentence, or the literal.
 */
function say(t: MonitorTranslate, key: MonitorKey, literal: string): string {
  try {
    const text = t(key)
    return typeof text === 'string' && text.trim() !== '' ? text : literal
  } catch {
    return literal
  }
}

/**
 * Read a thrown value as one short line.
 *
 * The fallback is the only place a person can see what went wrong without
 * opening DevTools, so the reason is worth one line — but it must never become
 * a second throw, and it must never be an object handed to React as a child.
 *
 * @param error - the value the subtree threw.
 * @returns its message, or `''` when it has none.
 */
function describe(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.message === 'string') return error.message.trim()
    if (typeof error === 'string') return error.trim()
    return ''
  } catch {
    return ''
  }
}

/**
 * Contain a thrown page and offer a remount.
 *
 * The fallback keeps the page's own container classes, so it fills the panel the
 * way the monitor does instead of collapsing to the height of one sentence.
 */
export class PanelErrorBoundary extends Component<PanelErrorBoundaryProps, BoundaryState> {
  override state: BoundaryState = { failed: false, attempt: 0, reason: '' }

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { failed: true, reason: describe(error) }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.warn(
      '[dsh-session-monitor] the panel stopped drawing; Retry remounts it',
      error,
      info.componentStack,
    )
  }

  /** Drop the failed subtree and mount a fresh one. */
  readonly #retry = (): void => {
    this.setState((previous) => ({ failed: false, attempt: previous.attempt + 1, reason: '' }))
  }

  override render(): ReactNode {
    if (!this.state.failed) {
      // The key is the remount axis: a retry must not reuse the crashed state.
      return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>
    }
    return (
      <div
        className="dsm-page"
        data-dsm-panel-error="true"
        data-dsm-panel-error-reason={this.state.reason === '' ? undefined : this.state.reason}
      >
        <div className="dsm-inner">
          <div className="dsm-failed" role="alert">
            <div className="dsm-failedTitle">
              {say(this.props.t, 'panelFailed', 'The monitor could not draw this page.')}
            </div>
            <p className="dsm-failedBody">
              {say(
                this.props.t,
                'panelFailedBody',
                'One of the sessions reported something this page could not read. Nothing was changed.',
              )}
            </p>
            {this.state.reason === '' ? null : (
              <p className="dsm-failedBody" data-detail="true">
                {this.state.reason}
              </p>
            )}
            <div className="dsm-failedActions">
              <button type="button" className="dsm-btn" data-primary="true" onClick={this.#retry}>
                {say(this.props.t, 'panelRetry', 'Try again')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

/**
 * Contain one thrown card so its neighbours keep drawing.
 *
 * The failed cell keeps the card shape and names the session it belongs to, so
 * the grid stays readable while one session's data is unreadable.
 */
export class CardErrorBoundary extends Component<CardErrorBoundaryProps, BoundaryState> {
  override state: BoundaryState = { failed: false, attempt: 0, reason: '' }

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { failed: true, reason: describe(error) }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.warn(
      `[dsh-session-monitor] the card "${typeof this.props.title === 'string' ? this.props.title : ''}" stopped drawing; Retry remounts it`,
      error,
      info.componentStack,
    )
  }

  /** Drop the failed card and mount a fresh one. */
  readonly #retry = (): void => {
    this.setState((previous) => ({ failed: false, attempt: previous.attempt + 1, reason: '' }))
  }

  override render(): ReactNode {
    if (!this.state.failed) {
      return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>
    }
    const title = typeof this.props.title === 'string' ? this.props.title : ''
    return (
      <article
        className="dsm-card"
        data-dsm-card-error="true"
        data-dsm-card-error-reason={this.state.reason === '' ? undefined : this.state.reason}
        aria-label={title}
      >
        <header className="dsm-cardHead">
          <span className="dsm-dot" data-state="idle" aria-hidden="true" />
          <div className="dsm-cardHeadText">
            <div className="dsm-cardTitle" title={title}>
              {title}
            </div>
            <div className="dsm-cardSub">
              <span className="dsm-cardState">
                {say(this.props.t, 'cardFailed', 'This card could not be drawn.')}
              </span>
            </div>
          </div>
        </header>
        <div className="dsm-body">
          <div className="dsm-failed" role="alert">
            <p className="dsm-failedBody">
              {say(
                this.props.t,
                'cardFailedBody',
                'This session reported something this card could not read. The session itself is unaffected.',
              )}
            </p>
            {this.state.reason === '' ? null : (
              <p className="dsm-failedBody" data-detail="true">
                {this.state.reason}
              </p>
            )}
            <div className="dsm-failedActions">
              <button type="button" className="dsm-btn" onClick={this.#retry}>
                {say(this.props.t, 'cardRetry', 'Try again')}
              </button>
            </div>
          </div>
        </div>
      </article>
    )
  }
}