import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const css = readFileSync(
  new URL('../../src/modules/trip/styles/occurrenceTypeMail.module.css', import.meta.url),
  'utf8',
)
const component = readFileSync(
  new URL(
    '../../src/modules/trip/components/OccurrenceTypeContractorMail.component.tsx',
    import.meta.url,
  ),
  'utf8',
)

/**
 * Spec 247 T7.1 (revisão de design): "Salvar e-mail" e "Desfazer" usam o `Button` pequeno do design
 * system, que fica em 38,4 px num tablet de toque (768 px). Sob toque o alvo cresce até o alvo de toque.
 */
describe('Salvar e-mail e Desfazer são alvos de toque (spec 247 T7.1)', () => {
  test('sob toque, a classe das ações cresce até o alvo de toque', () => {
    const coarse = css.slice(css.indexOf('@media (pointer: coarse)'))
    expect(coarse).toMatch(/\.action\s*\{[^}]*min-height: var\(--touch-target\)/u)
  })

  test('os dois botões do bloco levam a classe das ações', () => {
    expect(component.match(/<Button\b/gu)?.length).toBe(2)
    expect(component.match(/className=\{styles\.action\}/gu)?.length).toBe(2)
  })
})
