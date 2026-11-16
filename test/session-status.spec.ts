/**
 * The Session status projection is read reflectively, never through the proxy.
 *
 * On the current runtime the context proxy enforces `inject` per **service
 * name** and throws for a nested name the plugin did not declare:
 *
 * ```
 * cannot get property "uiSession.sessionStatus" without inject
 * ```
 *
 * That read used to happen while the page rendered (`uiSession.sessionStatus`),
 * so the throw reached the page boundary and every mount of the monitor ended in
 * "This page could not be drawn". The resolver below is the supported path, and
 * the source checks keep a future edit from reintroducing the proxy read.
 *
 * @module dsh-session-monitor/test/session-status
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveSessionStatus } from '../src/client/sessionStatus.ts'

/** A stand-in for the service instance the Host provides. */
const table = {
  getSnapshot: () => new Map<string, { running: boolean }>([['session-1', { running: true }]]),
  subscribe: () => () => {},
}

const clientDir = fileURLToPath(new URL('../src/client/', import.meta.url))

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveSessionStatus', () => {
  it('forwards the service instance unchanged, so the page keeps reference equality', () => {
    const resolved = resolveSessionStatus({ get: () => table })
    expect(resolved?.sessionStatus).toBe(table)
  })

  it('reads the dotted name, which is what the reflective read expects', () => {
    const get = vi.fn(() => table)
    resolveSessionStatus({ get })
    expect(get).toHaveBeenCalledWith('uiSession.sessionStatus')
  })

  for (const value of [undefined, null, 42, 'x', {}, { getSnapshot: 1 }, { subscribe: () => {} }]) {
    it(`reads nothing as absent: ${JSON.stringify(value) ?? String(value)}`, () => {
      expect(resolveSessionStatus({ get: () => value })).toBeUndefined()
    })
  }

  it('reads an absent reflective seat as absent', () => {
    expect(resolveSessionStatus({})).toBeUndefined()
  })

  it('turns a throwing read into an absent projection instead of a page crash', () => {
    const resolved = resolveSessionStatus({
      get: () => {
        throw new Error('cannot get property "uiSession.sessionStatus" without inject')
      },
    })
    expect(resolved).toBeUndefined()
  })
})

describe('the client half never reads the nested service through the proxy', () => {
  const index = readFileSync(`${clientDir}index.tsx`, 'utf8')

  it('never touches ctx.uiSession', () => {
    expect(index).not.toContain('ctx.uiSession')
  })

  it('composes the page prop from the reflective resolver', () => {
    expect(index).toContain('resolveSessionStatus(ctx)')
    expect(index).toContain('uiSession: uiSessionFor()')
  })
})