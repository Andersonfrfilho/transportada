/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripProgressBar.component.tsx',
  import.meta.url,
)
const CSS = new URL('../../src/modules/trip/styles/trip.module.css', import.meta.url)

/**
 * Spec 079 T011. ⚠️ O componente **já existia** com os segmentos por estado — a task pedia para
 * criá-lo, e criar de novo teria produzido duas barras. O que falta é só o que a P4 acrescenta:
 * a transição e a previsão de término.
 */
describe('a barra de progresso ganha movimento e previsão (spec 079 T011)', () => {
  const source = readFileSync(COMPONENT, 'utf8')
  const css = readFileSync(CSS, 'utf8')

  it('anima a mudança de largura dos segmentos', () => {
    const bloco = css.slice(css.indexOf('.progressTrack > span'))

    expect(bloco.slice(0, bloco.indexOf('}'))).toInclude('transition')
  })

  /**
   * ⚠️ Quem pediu para não ter animação não tem. A regra vale para **este** seletor, e afirmá-la
   * por "existe um @media em algum lugar do arquivo" passaria com o bloco cobrindo outra coisa.
   */
  it('desliga o movimento sob prefers-reduced-motion', () => {
    const reduzido = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))

    expect(reduzido).toInclude('.progressTrack > span')
  })

  /** A previsão é estimativa, e o rótulo diz isso — número sozinho lê como compromisso. */
  it('anuncia a previsão como estimativa', () => {
    expect(source).toInclude('estimatedCompletionAt')
    expect(trip.stops.estimatedCompletion).toInclude('Previsão')
  })

  /**
   * Sem ritmo medido **a linha aparece dizendo que não há previsão**, em vez de sumir: ausência de
   * previsão é informação, e esconder a linha faz o operador achar que a tela esqueceu de carregar.
   */
  it('diz que não há previsão em vez de esconder a linha', () => {
    expect(source).toInclude("t('stops.withoutEstimate')")
    expect(trip.stops.withoutEstimate).toBeString()
  })
})
