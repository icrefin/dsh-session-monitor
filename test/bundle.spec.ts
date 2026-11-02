/**
 * The *built* client bundle, loaded the way the browser module system loads it.
 *
 * The source specs exercise the source. This one executes `lib/client.js` behind
 * a fake `window.__ModuleLoader__`, which is the only check that catches a broken
 * loader banner — a wrong `id` fails the live page with
 * `loaded without registering "<id>"`, and nothing else notices.
 *
 * It skips with a visible note when the artifact has not been built yet;
 * `pnpm check` builds before it tests, so a normal run always exercises it.
 *
 * @module dsh-session-monitor/test/bundle
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NS, PANEL_ID, inject } from '../src/client/plugin.ts'

const packageName = 'dsh-session-monitor'
const bundlePath = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const built = existsSync(bundlePath)

/** One loader entry, captured from the fake module table. */
interface LoaderEntry {
  id: string
  factory: (require: (specifier: string) => unknown) => Record<string, unknown>
}

/**
 * Execute the bundle behind a fake module loader.
 * @returns the captured loader entry id and the materialized module exports.
 */
function loadBundle(): { id: string; exports: Record<string, unknown> } {
  let entry: LoaderEntry | undefined
  const globals = globalThis as { window?: unknown }
  const previous = globals.window
  globals.window = {
    __ModuleLoader__: {
      load: (candidate: LoaderEntry) => {
        entry = candidate
      },
    },
  }
  try {
    // Executing the emitted bundle is the point of this spec.
    const requireFromBundle = createRequire(bundlePath)
    new Function(readFileSync(bundlePath, 'utf8'))()
    expect(entry).toBeDefined()
    const captured = entry as LoaderEntry
    return { id: captured.id, exports: captured.factory((specifier) => requireFromBundle(specifier)) }
  } finally {
    if (previous === undefined) delete globals.window
    else globals.window = previous
  }
}

describe.skipIf(!built)('built client bundle', () => {
  it('registers under its package name — the boot graph row id', () => {
    expect(loadBundle().id).toBe(packageName)
  })

  it('exports the client plugin face the harness mounts', () => {
    const { exports } = loadBundle()
    expect(typeof exports.apply).toBe('function')
    expect(exports.inject).toEqual(inject)
    expect(exports.NS).toBe(NS)
    expect(exports.PANEL_ID).toBe(PANEL_ID)
  })

  it('mounts its sidebar row and main page through the real apply', () => {
    const { exports } = loadBundle()
    const apply = exports.apply as (ctx: unknown) => void
    const injected: string[] = []
    const registrations: { options: Record<string, unknown>; component: unknown }[] = []
    const dictionaries: { ns: string; en?: unknown; zh?: unknown }[] = []
    const effects: string[] = []
    const disposers: (() => void)[] = []
    const list = { getSnapshot: () => ({ ids: [], byId: {} }), subscribe: () => () => {} }
    const status = { getSnapshot: () => new Map(), subscribe: () => () => {} }
    const fake = {
      effect: (callback: () => (() => void) | void, label?: string) => {
        effects.push(label ?? '')
        const dispose = callback()
        if (typeof dispose === 'function') disposers.push(dispose)
      },
      locale: {
        register: (ns: string, dicts: { en?: unknown; zh?: unknown }) => {
          dictionaries.push({ ns, ...dicts })
          return () => {}
        },
        bind: () => (key: string) => key,
      },
      slots: {
        inject: (key: string, callback: () => () => void) => {
          injected.push(key)
          return callback()
        },
        register: (options: Record<string, unknown>, component: unknown) => {
          registrations.push({ options, component })
          return () => {}
        },
      },
      sessions: { list },
      uiSession: { sessionStatus: status },
    }

    // The real apply must survive a mounted shell; a throw here fails the page boot.
    expect(() => apply(fake)).not.toThrow()

    expect(dictionaries.map((entry) => entry.ns)).toEqual([NS])
    expect(injected).toEqual(['sidebar.panellist', 'main'])
    const row = registrations.find((entry) => entry.options.name === 'sidebar.panellist')
    const page = registrations.find((entry) => entry.options.name === 'main')
    expect(row?.options.id).toBe(PANEL_ID)
    expect(row?.options.order).toBe(5)
    expect(page?.options.key).toBe(PANEL_ID)
    expect(typeof (row?.component as unknown)).toBe('function')
    expect(typeof (page?.component as unknown)).toBe('function')

    // The page's inject face carries the captured services and the pref store.
    const injectFace = page?.options.inject as (() => Record<string, unknown>) | undefined
    expect(typeof injectFace).toBe('function')
    const face = injectFace?.()
    expect(face?.sessions).toBe(fake.sessions)
    expect(face?.uiSession).toBe(fake.uiSession)
    expect(typeof (face?.store as { getSnapshot?: unknown }).getSnapshot).toBe('function')

    // Every registration is effect-scoped, so unloading the plugin disposes it.
    expect(effects.length).toBeGreaterThanOrEqual(3)
    for (const dispose of disposers) expect(() => dispose()).not.toThrow()
  })

  it('does not bundle a second copy of React', () => {
    const source = readFileSync(bundlePath, 'utf8')
    expect(source).toContain('require("react")')
    // A bundled React would bring its own copy of this internal marker, and two
    // Reacts in one page break hooks silently.
    expect(source).not.toContain('__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED')
  })
})