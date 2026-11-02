/**
 * Every class the components render has a rule in the stylesheet.
 *
 * A typo in a `className` is invisible to the typechecker and to every
 * behavioural test: the page mounts, the text is right, and the card silently
 * loses its layout. Since this build could not be checked visually, this guard
 * is the substitute for "does the styling actually apply".
 *
 * @module dsh-session-monitor/test/styles
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PANEL_CSS, STYLE_ID } from '../src/client/styles.ts'

const clientDir = fileURLToPath(new URL('../src/client/', import.meta.url))
const sources = readdirSync(clientDir)
  .filter((name) => name.endsWith('.tsx'))
  .map((name) => ({ name, text: readFileSync(`${clientDir}${name}`, 'utf8') }))

/** Collect every `dsm-` class token from literal `className` attributes. */
function usedClasses(): Map<string, string> {
  const used = new Map<string, string>()
  for (const source of sources) {
    for (const match of source.text.matchAll(/className="([^"]+)"/g)) {
      for (const token of (match[1] ?? '').split(/\s+/)) {
        if (token.startsWith('dsm-')) used.set(token, source.name)
      }
    }
  }
  return used
}

describe('stylesheet', () => {
  it('defines a rule for every class the components render', () => {
    const used = usedClasses()
    expect(used.size).toBeGreaterThan(20)
    const missing = [...used].filter(([token]) => !PANEL_CSS.includes(`.${token}`))
    expect(missing.map(([token, file]) => `${file}: .${token}`)).toEqual([])
  })

  it('uses theme tokens instead of literal colours', () => {
    const declarations = PANEL_CSS.match(/[a-z-]+:[^;}{]+;/g) ?? []
    const literal = declarations.filter((rule) => /#[0-9a-fA-F]{3,8}\b/.test(rule))
    // The only permitted literal is a neutral fallback inside var(--token, #...).
    expect(literal.filter((rule) => !rule.includes('var('))).toEqual([])
  })

  it('sizes transcript text from the content-font tokens, like the conversation', () => {
    expect(PANEL_CSS).toMatch(/\.dsm-user\{[^}]*var\(--dsh-content-font-size,/)
    expect(PANEL_CSS).toMatch(/\.dsm-assistant\{[^}]*var\(--dsh-content-font-size,/)
    expect(PANEL_CSS).toMatch(/\.dsm-tool\{[^}]*var\(--dsh-content-font-size-secondary,/)
  })

  it('injects under one stable, plugin-owned tag id', () => {
    expect(STYLE_ID).toBe('dsh-session-monitor-style')
    expect(PANEL_CSS).toContain('.dsm-page')
    expect(PANEL_CSS).toContain('.dsm-card')
    expect(PANEL_CSS).not.toContain("'")
  })
})