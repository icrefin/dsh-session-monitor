/**
 * Resolving the optional Remote capability.
 *
 * The permission namespace is a dotted Cordis service that this bundle does not
 * require, so the two reads it can take — the plain property and the reflective
 * `ctx.get()` — and the failure of either must be pinned down here: a silent
 * `undefined` is exactly the state that would hide the permission control in a
 * running GUI.
 *
 * @module dsh-session-monitor/test/remote
 */

import { describe, expect, it, vi } from 'vitest'
import { resolveRemote } from '../src/client/remote.ts'
import type { RemoteServiceLike } from '../src/client/types.ts'

/** A catalog namespace shaped like the real Remote service. */
const presets = {
  catalog: async () => ({ ok: true, value: { options: [{ value: 'read-only', name: 'read-only' }] } }),
}

describe('resolveRemote', () => {
  it('returns undefined when the composition mounts no Remote service', () => {
    expect(resolveRemote({})).toBeUndefined()
    expect(resolveRemote({ get: () => presets })).toBeUndefined()
  })

  it('keeps the namespace and the catalog subscription', () => {
    const stop = vi.fn()
    const receivers: unknown[] = []
    const remote = {
      permissionPresets: presets,
      $on(event: string, listener: () => void) {
        receivers.push(this)
        expect(event).toBe('permission-presets/catalog-changed')
        expect(typeof listener).toBe('function')
        return stop
      },
    }

    const face = resolveRemote({ remote })
    expect(face?.permissionPresets).toBe(presets)
    const disposer = face?.$on?.('permission-presets/catalog-changed', () => {})
    expect(disposer).toBe(stop)
    // The wrapper must call the service method on the service itself: its
    // `this` carries the Remote's own state.
    expect(receivers[0]).toBe(remote)
  })

  it('falls back to the reflective read when the proxy refuses the namespace', () => {
    const remote = Object.defineProperty({}, 'permissionPresets', {
      get() {
        throw new Error('cannot get property "permissionPresets" without inject')
      },
    }) as RemoteServiceLike
    const get = vi.fn((name: string) => (name === 'remote.permissionPresets' ? presets : undefined))

    const face = resolveRemote({ remote, get })
    expect(get).toHaveBeenCalledWith('remote.permissionPresets')
    expect(face?.permissionPresets).toBe(presets)
  })

  it('keeps the subscription when neither namespace read resolves', () => {
    const stop = vi.fn()
    const remote: RemoteServiceLike = { $on: () => stop }
    const face = resolveRemote({ remote, get: () => undefined })
    expect(face?.permissionPresets).toBeUndefined()
    expect(face?.$on?.('permission-presets/catalog-changed', () => {})).toBe(stop)
  })

  it('survives a reflective read that throws and still keeps the subscription', () => {
    const stop = vi.fn()
    const remote: RemoteServiceLike = { $on: () => stop }
    const get = () => {
      throw new Error('no such service')
    }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const face = resolveRemote({ remote, get })
    expect(face?.permissionPresets).toBeUndefined()
    expect(face?.$on).toBeDefined()
    vi.restoreAllMocks()
  })
})
