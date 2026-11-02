/**
 * Release invariants: the three ids a composed plugin must agree on, the version
 * the page advertises, and the activation ordering its registrations need.
 *
 * These are the failures that a typecheck cannot see: a Loader row renamed in
 * `cordis.patch.yml`, a client bundle id that differs from the package name (the
 * page then dies with `loaded without registering`), a chip that reports a
 * version the artifact does not have, or a slot owner that is not loaded before
 * this bundle asks for its declaration.
 *
 * @module dsh-session-monitor/test/manifest
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NS, PANEL_ID, inject } from '../src/client/plugin.ts'
import { VERSION } from '../src/client/version.ts'
import { en, zh } from '../src/client/locales.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const packageJson = JSON.parse(readFileSync(`${root}package.json`, 'utf8')) as {
  name: string
  version: string
  main: string
  exports: Record<string, unknown>
  dsh: {
    manifestVersion: number
    bundle: { patch: string }
    client: { platform: string; inject: string[] }
  }
  peerDependencies: Record<string, string>
}
const patch = readFileSync(`${root}cordis.patch.yml`, 'utf8')

describe('package identity', () => {
  it('names the package the client bundle id and the Loader row', () => {
    expect(packageJson.name).toBe('dsh-session-monitor')
    expect(NS).toBe(packageJson.name)
    expect(patch).toContain(`id: ${packageJson.name}`)
    expect(patch).toContain(`name: '${packageJson.name}'`)
  })

  it('shares one id between the sidebar row and the main page', () => {
    expect(PANEL_ID).toBe('dshSessionMonitor')
  })

  it('declares the browser half and a bundle patch', () => {
    expect(packageJson.dsh.manifestVersion).toBe(1)
    expect(packageJson.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(packageJson.dsh.client.platform).toBe('web')
    expect(packageJson.exports['./client']).toBe('./lib/client.js')
  })
})

describe('activation ordering', () => {
  const declared = new Set(packageJson.dsh.client.inject)

  it('loads the slot owners before this bundle', () => {
    expect(declared.has('@deepseek-ai/dsh-client-ui-layout')).toBe(true)
    expect(declared.has('@deepseek-ai/dsh-client-ui-sidebar')).toBe(true)
  })

  it('loads the services this bundle injects', () => {
    expect(inject).toContain('sessions')
    expect(inject).toContain('uiSession')
    expect(inject).toContain('workspaces')
    expect(declared.has('@deepseek-ai/dsh-api-session-controller')).toBe(true)
    expect(declared.has('@deepseek-ai/dsh-client-ui-session')).toBe(true)
    expect(declared.has('@deepseek-ai/dsh-api-workspace-controller')).toBe(true)
  })

  it('lists the locale service this bundle registers into', () => {
    expect(declared.has('@deepseek-ai/dsh-client-locale')).toBe(true)
  })
})

describe('version chip', () => {
  it('reports the packaged version', () => {
    expect(VERSION).toBe(packageJson.version)
  })

  it('carries the mandatory credit line verbatim', () => {
    expect(en.credit).toBe('v{version} | Author: icrefin [icrefinai@gmail.com]')
    expect(zh.credit).toBe(en.credit)
  })
})

describe('dictionaries', () => {
  it('define the same keys in both languages', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  })

  it('do not leave a placeholder empty', () => {
    for (const dict of [en, zh]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(typeof value, key).toBe('string')
        expect(value.trim(), key).not.toBe('')
      }
    }
  })
})