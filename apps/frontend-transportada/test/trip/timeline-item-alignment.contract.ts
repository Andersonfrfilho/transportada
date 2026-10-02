/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196: o recuo do ícone existia só dentro de `.itemHead`, então título, horário e autoria
 * começavam em `--timeline-icon-size + --space-3` e o botão "Ver mais", o bloco de detalhe e os
 * links começavam em zero — debaixo do ícone, por cima do trilho vertical da lista. Medido em
 * 1280px: coluna de texto a 40px, botão e detalhe a 0px. O `padding-inline` do botão não era
 * alinhamento, era um número menor que o recuo real.
 *
 * A calha passa a ser do `.item`, não de cada filho: uma coluna declarada uma vez, com o cabeçalho
 * atravessando as duas para o ícone seguir sobre o trilho. É isso que estes casos travam — inclusive
 * que o número da calha existe **uma vez só** no arquivo (regra de número repetido do projeto).
 */
import { describe, expect, it } from 'bun:test'

const STYLES_PATH = new URL(
  '../../src/modules/trip/styles/tripTimeline.module.css',
  import.meta.url,
)

const styles = await Bun.file(STYLES_PATH).text()

function readRuleBlock(selector: string): string {
  const start = styles.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`regra ausente: ${selector}`)
  const end = styles.indexOf('}', start)
  if (end === -1) throw new Error(`regra sem fechamento: ${selector}`)
  return styles.slice(start, end)
}

const GUTTER_TOKEN = 'var(--timeline-gutter)'
const TOGGLE_INSET_TOKEN = 'var(--space-2)'

describe('calha do item da linha do tempo (spec 196)', () => {
  it('declara a calha uma vez, na lista, a partir dos mesmos tokens que desenham o ícone', () => {
    expect(readRuleBlock('.list')).toMatch(
      /--timeline-gutter:\s*calc\(var\(--timeline-icon-size\) \+ var\(--space-3\)\)/,
    )
  })

  it('não repete a conta da calha — ela é um nome, não quatro cópias de um número', () => {
    const occurrences = styles.match(/calc\(var\(--timeline-icon-size\) \+ var\(--space-3\)\)/g)

    expect(occurrences).toHaveLength(1)
  })

  it('o item ganha a coluna, em vez de cada filho recuar por conta própria', () => {
    expect(readRuleBlock('.item')).toContain(`grid-template-columns: ${GUTTER_TOKEN}`)
  })

  /** Sem zerar a calha entre colunas, o conteúdo nasceria um `gap` à frente da coluna de texto. */
  it('o espaço entre as duas colunas é zero: a calha já é a medida inteira', () => {
    expect(readRuleBlock('.item')).toMatch(/column-gap:\s*0/)
  })

  it('o cabeçalho atravessa as duas colunas — o ícone continua sobre o trilho', () => {
    expect(readRuleBlock('.itemHead')).toMatch(/grid-column:\s*1 \/ -1/)
  })

  it('botão, links e detalhe moram na coluna do texto', () => {
    for (const selector of ['.itemLinks', '.itemToggle', '.itemDetailGroup']) {
      expect(readRuleBlock(selector)).toMatch(/grid-column:\s*2/)
    }
  })

  /**
   * Alinhar não é gastar o recuo interno: zerado, o rótulo encosta na borda da própria caixa, e
   * isso aparece assim que o fundo ou o anel de foco desenham. A caixa anda para a esquerda o
   * mesmo tanto que recua por dentro — por isso os dois têm de citar o **mesmo** token.
   */
  it('o botão mantém recuo interno e paga o alinhamento com margem negativa de igual medida', () => {
    const toggle = readRuleBlock('.itemToggle')

    expect(toggle).toContain(`padding-inline: ${TOGGLE_INSET_TOKEN}`)
    expect(toggle).toContain(`margin-inline-start: calc(-1 * ${TOGGLE_INSET_TOKEN})`)
  })

  /** Altura de botão é a do design system: compacta com mouse, alvo de toque sob toque (revisão da 227). */
  it('e a caixa tem a altura compacta do botão, e o alvo de toque sob pointer: coarse', () => {
    expect(readRuleBlock('.itemToggle')).toContain('min-height: var(--control-height-compact)')
    expect(styles).toMatch(
      /@media \(pointer: coarse\) \{\s*\.itemToggle \{[^}]*min-height: var\(--touch-target\)/u,
    )
  })

  it('o intervalo entre eventos passa a usar a mesma calha, e não a sua própria conta', () => {
    expect(readRuleBlock('.gap')).toContain(GUTTER_TOKEN)
  })
})
