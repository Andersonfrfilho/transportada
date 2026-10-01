/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196: o título do evento leva à nota (RF15) e media 21px de altura — seis a dez deles por
 * tela, todos abaixo do mínimo de 44px do `web.md` §10. Crescer por `padding` resolveria o alvo e
 * estragaria outra coisa: a linha subiria de 21 para 44px em cada evento, e dez eventos empurrariam
 * a página uns 230px para baixo, desfazendo o que o recolhimento dos mapas acabou de ganhar.
 *
 * Então vale aqui a mesma técnica do pino de GPS: um pseudo-elemento que estica o alvo sem alargar
 * o desenho. A folga medida entre dois links consecutivos é de 71px no pior caso, contra os ~11,5px
 * que o alvo transborda para cada lado — não há como um roubar o toque do outro.
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

describe('alvo de toque do título do evento (spec 196)', () => {
  it('o link ancora o próprio alvo, em vez de depender de quem está em volta', () => {
    expect(readRuleBlock('.itemTitleLink')).toMatch(/position:\s*relative/u)
  })

  it('e o alvo tem a altura do token de toque, não a da fonte', () => {
    expect(readRuleBlock('.itemTitleLink::after')).toContain('block-size: var(--touch-target)')
  })

  /**
   * O que diferencia este caso do pino: ali o alvo é quadrado porque o desenho é um ícone; aqui a
   * área clicável já é a palavra inteira, e encolhê-la para 44px de largura tiraria toque de quem
   * acerta o fim do título.
   */
  it('e cobre o título inteiro na horizontal, sem inventar largura própria', () => {
    const target = readRuleBlock('.itemTitleLink::after')

    expect(target).toMatch(/inset-inline:\s*0/u)
    expect(target).not.toMatch(/inline-size/u)
  })

  it('o desenho não cresce: a regra do link segue sem padding vertical', () => {
    expect(readRuleBlock('.itemTitleLink')).not.toMatch(/padding/u)
  })
})
