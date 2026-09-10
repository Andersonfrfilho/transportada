/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  buildCargoChipFacts,
  resolveLoadingPosition,
} from '@/modules/trip/shared/cargoPrintSummary.service'
import trip from '../../src/modules/trip/locales/trip.locale.json'
import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function box(overrides: Partial<Parameters<typeof buildCargoChipFacts>[0][number]>) {
  return {
    depthM: 0.5,
    isEstimated: false,
    isSplit: false,
    stopSequence: 1,
    widthM: 0.4,
    xM: 0,
    yM: 0,
    ...overrides,
  }
}

/**
 * Uma lista só na tela.
 *
 * ⚠️ **Eram duas, e ninguém as ligava.** A ficha colorida dizia cliente e endereço; a tabela ao
 * lado dizia a ordem de carregamento, a faixa do baú e as contagens. Quem estava no barracão casava
 * as duas por nome de mercado — e a tabela existe para o **papel**, onde não há cor nem clique.
 */
describe('fichas de parada do plano de carga', () => {
  const boxes = [
    box({ stopSequence: 1, xM: 0 }),
    box({ isEstimated: true, stopSequence: 3, xM: 2 }),
    box({ isSplit: true, stopSequence: 3, xM: 9 }),
    box({ stopSequence: 2, xM: 1 }),
  ]

  it('dá a cada parada a ordem de carregamento dela', () => {
    const facts = buildCargoChipFacts(boxes)

    /** Em profundidade a última entrega carrega primeiro: ela vai ao fundo. */
    expect(facts.get(3)?.loadingPosition).toBe(1)
    expect(facts.get(1)?.loadingPosition).toBe(3)
  })

  /**
   * ⚠️ **A posição de carregamento é da viagem inteira.** Com 37 entregas e 7 desenhadas, a entrega
   * 25 aparecia como "1º a carregar"; quem entra primeiro é a 37ª. Visto na tela em 2026-09-10.
   */
  it('conta a posição de carregamento entre todas as paradas, não só as desenhadas', () => {
    const facts = buildCargoChipFacts([box({ stopSequence: 25, xM: 0 })], 'depth', 37)
    expect(facts.get(25)?.loadingPosition).toBe(13)
    expect(resolveLoadingPosition({ arrangement: 'depth', stopSequence: 37, totalStops: 37 })).toBe(
      1,
    )
    expect(resolveLoadingPosition({ arrangement: 'lanes', stopSequence: 2, totalStops: 37 })).toBe(
      2,
    )
  })

  /** Uma ficha por linha, e o número diz o que é. Pedido do operador em 2026-09-10. */
  it('uma ficha por linha, com "N · ordem de entrega"', () => {
    const component = readFileSync(
      new URL('src/modules/trip/components/TripCargoLayers.component.tsx', APPLICATION_ROOT),
      'utf8',
    )
    const css = readFileSync(
      new URL('src/modules/trip/styles/trip.module.css', APPLICATION_ROOT),
      'utf8',
    )
    const rule = css.slice(css.indexOf('.cargoStops {'))
    expect(rule.slice(0, rule.indexOf('}'))).toContain('flex-direction: column')
    expect(component).toContain("t('cargoLayers.chip.deliveryOrder', { sequence })")
    expect(trip.cargoLayers.chip.deliveryOrder).toContain('ordem de entrega')
  })

  /**
   * Spec 113: a grade chega do servidor como `grid`. ⚠️ A validação recusava tudo que não fosse
   * `depth` ou `lanes`, e uma recusa ali apaga o painel inteiro com 200 na rede.
   */
  it('aceita a grade, sem corte atravessado e sem o aviso de peso', () => {
    const read = (path: string) => readFileSync(new URL(path, APPLICATION_ROOT), 'utf8')
    expect(read('src/modules/trip/shared/tripResponse.validation.ts')).toContain(
      "value.stopArrangement === 'grid' ||",
    )
    expect(read('src/modules/trip/shared/cargoLegend.service.ts')).toContain(
      "if (arrangement === 'grid') return []",
    )
    expect(read('src/modules/trip/components/TripCargoLayers.component.tsx')).toContain(
      "layout.stopArrangementReason === 'weight' && arrangement === 'depth'",
    )
    expect(trip.cargoLayers.arrangement.grid).toBeTruthy()
    expect(trip.cargoLayers.print.caption.grid).toBeTruthy()
    expect(trip.cargoLayers.print.span.grid).toBeTruthy()
  })

  it('lista todas as paradas, e a fora do desenho diz que está fora', () => {
    const component = readFileSync(
      new URL('src/modules/trip/components/TripCargoLayers.component.tsx', APPLICATION_ROOT),
      'utf8',
    )
    expect(component).toContain('const stopChips = layout.rows')
    expect(component).toContain("t('cargoLayers.chip.notDrawn')")
  })

  it('carrega a faixa e as contagens que a tabela imprime', () => {
    const facts = buildCargoChipFacts(boxes)

    expect(facts.get(3)).toMatchObject({ boxes: 2, presumed: 1, split: 1 })
    expect(facts.get(3)?.fromM).toBe(2)
    expect(facts.get(1)).toMatchObject({ boxes: 1, presumed: 0, split: 0 })
  })

  /** A ficha e a folha saem da **mesma** conta: duas contas divergiriam caladas. */
  it('nasce do mesmo resumo que a folha impressa', () => {
    const source = readFileSync(
      new URL('src/modules/trip/shared/cargoPrintSummary.service.ts', APPLICATION_ROOT),
      'utf8',
    )

    expect(source).toContain('buildCargoPrintSummary(boxes, arrangement)')
  })

  it('põe os números na ficha e deixa a tabela para o papel', () => {
    const component = readFileSync(
      new URL('src/modules/trip/components/TripCargoLayers.component.tsx', APPLICATION_ROOT),
      'utf8',
    )
    const css = readFileSync(
      new URL('src/modules/trip/styles/trip.module.css', APPLICATION_ROOT),
      'utf8',
    )

    expect(component).toContain('buildCargoChipFacts')
    /** A folha continua existindo — ela é o que o agregado leva para dentro da van. */
    expect(component).toContain('cargoPrintSheet')
    expect(css).toContain('.cargoPrintSheet')
    expect(trip.cargoLayers.chip.loading).toBeTruthy()
    expect(tripEn.cargoLayers.chip.loading).toBeTruthy()
  })
})
