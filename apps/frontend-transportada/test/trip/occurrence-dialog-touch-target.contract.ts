/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const css = readFileSync(
  new URL('../../src/modules/trip/styles/trip.module.css', import.meta.url),
  'utf8',
)

function ruleBody(selector: string): string {
  const start = css.indexOf(`\n${selector} {`)
  if (start === -1) throw new Error(`RULE_NOT_FOUND: ${selector}`)
  return css.slice(start, css.indexOf('}', start))
}

/**
 * Spec 240 T5.1 (revisão de design): o fechar do diálogo de cancelamento é um `.iconAction` num
 * cabeçalho flex; sem `flex-shrink: 0` o título comprimia o botão a 20px de largura no celular, e
 * sob toque ele não chegava aos 44px do alvo.
 */
describe('o fechar do diálogo de cancelamento é alvo de toque (spec 240 T5.1)', () => {
  test('o botão de ícone não encolhe dentro do cabeçalho flex', () => {
    expect(ruleBody('.iconAction')).toContain('flex-shrink: 0')
  })

  test('sob toque, o botão de ícone cresce até o alvo de toque nos dois eixos', () => {
    const coarse = css.slice(css.indexOf('@media (pointer: coarse) {\n  .iconAction {'))
    expect(coarse).toMatch(/\.iconAction\s*\{[^}]*min-width: var\(--touch-target\)/u)
    expect(coarse).toMatch(/\.iconAction\s*\{[^}]*min-height: var\(--touch-target\)/u)
  })
})
