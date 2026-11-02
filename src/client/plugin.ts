/**
 * Identifiers and the injection list shared by the browser half, the host
 * bundle check, and the unit tests.
 *
 * These live in a plain `.ts` module on purpose: the host `tsconfig` excludes
 * `src/client`, so a test that imported a `.tsx` could not be typechecked there.
 * Anything a test needs from the browser half belongs here.
 *
 * @module dsh-session-monitor/client/plugin
 */

/** Locale namespace and dictionary owner. */
export const NS = 'dsh-session-monitor'

/**
 * The id shared by the sidebar row and the page it opens.
 *
 * The sidebar hands this to the layout's panel selection, which looks it up in
 * the live `main` registry; the two registrations must therefore agree.
 */
export const PANEL_ID = 'dshSessionMonitor'

/**
 * Row position in `sidebar.panellist`.
 *
 * Plugins is `order: 0` and the shipped Automation-tasks row is `order: 10`, so
 * this row lands directly below Plugins and above the automation tasks.
 */
export const PANEL_ORDER = 5

/** Reference-source key this plugin's retention is accounted under. */
export const REFERENCE_SOURCE = 'sessionMonitor'

/** Services the two registrations require before the bundle activates. */
export const inject = ['slots', 'locale', 'sessions', 'uiSession', 'workspaces', 'remote']