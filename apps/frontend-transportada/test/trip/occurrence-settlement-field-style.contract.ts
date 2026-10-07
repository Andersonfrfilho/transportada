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
 * Spec 247 T7.1 (revisão de design): na página de detalhe da ocorrência o acerto não está dentro do
 * `.workspace-panel`, então "Código do produto" e "Valor" saíam como `<input>` nativo de 21 px, sem
 * borda do sistema — onde a sugestão do registro preenche o valor. O campo do acerto traz o próprio
 * estilo, com a altura do campo do sistema e anel de foco.
 */
describe('os campos do acerto têm o estilo do sistema fora do .workspace-panel (spec 247 T7.1)', () => {
  test('o input do campo tem a altura do campo do sistema e ocupa a coluna', () => {
    const body = ruleBody('.settlementField input')
    expect(body).toContain('min-height: var(--field-height)')
    expect(body).toContain('width: 100%')
    expect(body).toContain('padding: var(--field-padding)')
  })

  test('o anel de foco e o estado inválido são desenhados', () => {
    expect(ruleBody('.settlementField input:focus-visible')).toContain('outline: 2px solid')
    expect(ruleBody(".settlementField input[aria-invalid='true']")).toContain(
      'border-color: var(--color-alert)',
    )
  })
})
