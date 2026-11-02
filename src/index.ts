/**
 * dsh-session-monitor — host half.
 *
 * This plugin is deliberately browser-only in behaviour. Everything the monitor
 * shows and does already exists in the Client: the Session Controller publishes
 * the catalog and opens a history window on demand, the unified Session status
 * projection publishes pending interactions, and a pending carrier settles
 * itself through its own `answer()` method. Adding a Host route would duplicate
 * transport, not capability.
 *
 * The Loader row still needs a host module to be a valid plugin, so this half
 * exports its identity and an `apply` that registers nothing. Keeping it honest
 * matters: a host half that quietly started serving state would be a second
 * authority behind the same panel.
 *
 * @module dsh-session-monitor
 */

/** Loader row id; mirrors `cordis.patch.yml` and the package name. */
export const name = 'dsh-session-monitor'

/** Mount nothing: this plugin's work happens in the browser half. */
export function apply(): void {
  // Intentionally empty — see the module note above.
}