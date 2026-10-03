/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'

/**
 * Achado A6 da spec 235: o papel sem ficha é um `<span class="badge">` (caixa alta) e o papel com ficha é
 * um botão `ghost` — "Ajudante" de um lado, "AJUDANTE" do outro. O link tem de se ler como a etiqueta.
 */
const STYLESHEET = readFileSync(
  new URL('../../src/modules/identity/styles/userAdministration.module.css', import.meta.url),
  'utf8',
)

const SHARED_PROPERTIES = [
  'border',
  'color',
  'font-family',
  'font-size',
  'padding',
  'text-transform',
  'white-space',
] as const

function readDeclarations(selector: string): ReadonlyMap<string, string> {
  const start = STYLESHEET.indexOf(`\n${selector} {`)
  if (start === -1) throw new Error(`SELECTOR_NOT_FOUND: ${selector}`)
  const body = STYLESHEET.slice(STYLESHEET.indexOf('{', start) + 1, STYLESHEET.indexOf('}', start))

  return new Map(
    body
      .split(';')
      .map((declaration) => declaration.split(/:(.*)/su))
      .filter((parts): parts is [string, string, string] => parts.length >= 2)
      .map(([property, value]) => [property.trim(), value.trim()] as const),
  )
}

describe('o papel com ficha lê como a etiqueta do papel (spec 243 T5 A6)', () => {
  const badge = readDeclarations('.badge')
  const link = readDeclarations('button.roleLink')

  test('a etiqueta está em caixa alta, e é a referência', () => {
    expect(badge.get('text-transform')).toBe('uppercase')
  })

  for (const property of SHARED_PROPERTIES) {
    test(`o link tem o mesmo ${property} da etiqueta`, () => {
      expect(link.get(property)).toBeDefined()
      expect(link.get(property)).toBe(badge.get(property))
    })
  }

  test('o botão não deixa a altura mínima do controle engordar a caixa', () => {
    expect(link.get('min-height')).toBe('0')
  })

  test('o componente continua trocando etiqueta por link pela ficha, com a mesma classe', () => {
    const table = readFileSync(
      new URL(
        '../../src/modules/identity/components/CompanyUserTable.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )

    expect(table).toContain('className={styles.badge}')
    expect(table).toContain('className={styles.roleLink}')
  })
})
