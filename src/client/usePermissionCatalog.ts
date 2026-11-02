/**
 * The process-level permission catalog, read once for the whole grid.
 *
 * The catalog is not a Session projection: it is a Remote on the Host that lists
 * every currently selectable permission preset, and it changes only when the
 * Host's composition changes (for example when the Auto review integration
 * mounts or withdraws). The panel therefore reads it once and re-reads it after
 * the payload-free `permission-presets/catalog-changed` notification, which is
 * subscribed to *before* the first read so a change between mount and read is
 * not lost.
 *
 * Nothing here is trusted: an absent namespace, a rejecting Remote and a
 * malformed payload all resolve to "no catalog", and the cards then render
 * without a permission control instead of the page failing to mount.
 *
 * @module dsh-session-monitor/client/usePermissionCatalog
 */

import { useEffect, useState } from 'react'
import type { PermissionCatalogLike, RemoteResultLike, RemoteServiceLike } from './types.ts'

/**
 * Whether a Remote value is a usable catalog.
 * @param value - candidate payload.
 * @returns true when it carries an options array.
 */
function isCatalog(value: unknown): value is PermissionCatalogLike {
  return typeof value === 'object' && value !== null && Array.isArray((value as PermissionCatalogLike).options)
}

/**
 * Follow the Host's permission catalog.
 * @param remote - the client Remote service, when composed.
 * @returns the latest complete catalog, or `undefined` while absent.
 */
export function usePermissionCatalog(remote: RemoteServiceLike | undefined): PermissionCatalogLike | undefined {
  const [catalog, setCatalog] = useState<PermissionCatalogLike | undefined>(undefined)

  useEffect(() => {
    let alive = true

    const read = (): void => {
      const presets = remote?.permissionPresets
      if (presets?.catalog === undefined) {
        setCatalog(undefined)
        return
      }
      let pending: Promise<RemoteResultLike<PermissionCatalogLike>>
      try {
        pending = presets.catalog()
      } catch (error) {
        console.warn('[dsh-session-monitor] the permission catalog could not be read', error)
        setCatalog(undefined)
        return
      }
      Promise.resolve(pending)
        .then((result) => {
          if (!alive) return
          if (result?.ok !== true || !isCatalog(result.value)) {
            // A withdrawn preset must not stay selectable: clear rather than keep
            // the last good snapshot.
            setCatalog(undefined)
            return
          }
          setCatalog(result.value)
        })
        .catch((error: unknown) => {
          if (!alive) return
          console.warn('[dsh-session-monitor] the permission catalog could not be read', error)
          setCatalog(undefined)
        })
    }

    let stop: () => void = () => {}
    try {
      stop = remote?.$on?.('permission-presets/catalog-changed', read) ?? (() => {})
    } catch (error) {
      console.warn('[dsh-session-monitor] the permission catalog could not be followed', error)
    }
    read()

    return () => {
      alive = false
      try {
        stop()
      } catch {
        // The Remote notifier is already gone.
      }
    }
  }, [remote])

  return catalog
}