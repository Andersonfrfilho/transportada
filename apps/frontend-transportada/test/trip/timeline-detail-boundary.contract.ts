/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196: "o botão Ver mais está quebrado". Medido, ele abre — o que não existia era a fronteira.
 * Com `border-left` de 2px a 25% de `--color-slate`, sem fundo, sem respiro e sem padding vertical,
 * o detalhe de uma linha só nascia com 20px de altura colado no botão: indistinguível de nada ter
 * acontecido. Estes casos travam a fronteira, e travam que ela é feita de token, não de cor literal.
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

const LITERAL_COLOR = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i

describe('fronteira do detalhe expandido da linha do tempo (spec 196)', () => {
  const detailGroup = readRuleBlock('.itemDetailGroup')

  it('separa o bloco do botão que o abriu — sem respiro ele lê como continuação da linha', () => {
    expect(detailGroup).toMatch(/margin-block-start:\s*var\(--space-\d\)/)
  })

  it('tem corpo próprio: padding em cima e embaixo, não só o recuo da esquerda', () => {
    expect(detailGroup).toMatch(/padding(-block)?:\s*var\(--space-\d\)/)
  })

  it('tem fundo sutil — a linha de 20px precisa de superfície, não só de um traço de 2px', () => {
    expect(detailGroup).toMatch(/background:\s*color-mix\(in srgb, var\(--color-[a-z-]+\)/)
  })

  it('mantém o traço à esquerda do precedente, com peso que se enxerga', () => {
    expect(detailGroup).toMatch(/border-inline-start:\s*2px solid color-mix\(/)
  })

  it('não usa cor literal — o tema claro e o escuro redefinem os tokens', () => {
    expect(detailGroup).not.toMatch(LITERAL_COLOR)
  })

  it('anuncia a abertura com a mesma gramática de movimento do item, e respeita quem pediu menos', () => {
    expect(styles).toContain('@keyframes tripTimelineDetailEnter')
    expect(detailGroup).toContain('animation: tripTimelineDetailEnter')

    const reducedMotionIndex = styles.indexOf('(prefers-reduced-motion: reduce)')
    expect(styles.slice(reducedMotionIndex)).toContain('.itemDetailGroup')
  })
})

/**
 * O alvo do pino media 14×19px porque o `inset` negativo partia de `1rem` — um tamanho de ícone
 * suposto, não o medido. Fixar o lado do pseudo-elemento no próprio token entrega 44×44 sem depender
 * da métrica da fonte, e sem alargar um pixel do desenho.
 */
describe('alvo de toque do pino de GPS (spec 196)', () => {
  const hitArea = readRuleBlock('.locationButton::after')

  it('mede o alvo pelo token de toque, nos dois eixos', () => {
    expect(hitArea).toMatch(/block-size:\s*var\(--touch-target\)/)
    expect(hitArea).toMatch(/inline-size:\s*var\(--touch-target\)/)
  })

  it('cresce centrado no ícone, sem empurrar a linha de autoria', () => {
    expect(hitArea).toContain('position: absolute')
    expect(hitArea).toMatch(/transform:\s*translate\(-50%, -50%\)/)
  })

  it('deixou de supor que o ícone mede 1rem', () => {
    expect(hitArea).not.toContain('var(--touch-target) - 1rem')
  })
})
