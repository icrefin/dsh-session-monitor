/**
 * The optional Remote capabilities the monitor uses.
 *
 * The permission catalog lives behind a Cordis service named
 * `remote.permissionPresets`. This bundle deliberately does **not** list that
 * service in its required `inject` list: a Host without permission presets must
 * still mount the monitor (it then renders no permission control), and a
 * required injection would park the whole plugin instead.
 *
 * Cordis resolves a dotted service through the context proxy only when the
 * caller injected it; the reflective `ctx.get(name)` read is the supported path
 * for an optional capability. Both reads are attempted, because a deployment may
 * also expose the namespace as a plain property when the whole Remote service is
 * one object.
 *
 * @module dsh-session-monitor/client/remote
 */

import type { RemoteServiceLike } from './types.ts'

/** The context surface this resolver needs. */
export interface RemoteContextLike {
  /** Reflective read that bypasses the context proxy's inject check. */
  get?(name: string): unknown
  /** The Remote service, when the composition mounts it. */
  remote?: RemoteServiceLike
}

/**
 * Whether a value is a usable permission-preset namespace.
 * @param value - candidate service.
 * @returns true when it exposes a callable `catalog`.
 */
function isPermissionPresets(value: unknown): value is NonNullable<RemoteServiceLike['permissionPresets']> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { catalog?: unknown }).catalog === 'function'
  )
}

/**
 * Resolve the Remote face the page should receive.
 * @param ctx - client root context.
 * @returns the narrowed face, or `undefined` when the composition has neither
 * capability the page uses.
 */
export function resolveRemote(ctx: RemoteContextLike): RemoteServiceLike | undefined {
  const remote = ctx.remote
  if (remote === undefined) return undefined

  let permissionPresets: RemoteServiceLike['permissionPresets'] | undefined
  try {
    permissionPresets = remote.permissionPresets
  } catch {
    permissionPresets = undefined
  }
  if (!isPermissionPresets(permissionPresets)) {
    try {
      const candidate = ctx.get?.('remote.permissionPresets')
      permissionPresets = isPermissionPresets(candidate) ? candidate : undefined
    } catch (error) {
      console.warn('[dsh-session-monitor] the permission preset namespace could not be read', error)
      permissionPresets = undefined
    }
  }

  const face: RemoteServiceLike = {
    ...(permissionPresets === undefined ? {} : { permissionPresets }),
    // Call through the member so the service keeps its own receiver; extracting
    // the method would lose the traceable context Cordis binds around it.
    ...(typeof remote.$on === 'function'
      ? { $on: (event, listener) => remote.$on?.(event, listener) ?? (() => {}) }
      : {}),
  }
  return face.permissionPresets === undefined && face.$on === undefined ? undefined : face
}