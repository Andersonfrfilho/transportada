/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveCargoPlacement,
  type CargoPlacement,
  type PlacementBox,
} from '../../src/trips/domain/cargo-placement.policy.js'
import { ATEGO_85_STOPS } from '../fixtures/real-mixed-cargo.fixture.js'

/**
 * Spec 117: **a caixa pequena vai para onde a caixa da carga não cabe**, e **a busca de lugar vai até
 * a porta**.
 *
 * ⚠️ As afirmações são de **propriedade** — quanto uma caixa pequena custa, quanto fica fora —, nunca
 * a posição de uma caixa. Os limites saem da geometria, não de uma porcentagem escolhida.
 */
const ATEGO_BED = {
  heightM: '2.300',
  lengthM: '7.400',
  source: 'measured',
  widthM: '2.470',
} as const
const PRESUMED_HEIGHT_MM = 210
/** Quantas caixas presumidas uma coluna do baú empilha: 2,30 m ÷ 0,21 m. */
const BOXES_PER_COLUMN = Math.floor(2300 / PRESUMED_HEIGHT_MM)
/**
 * A escada da porta, em caixas presumidas de 0,371 × 0,261 × 0,21 m: a fileira encostada na porta sobe
 * três vezes a base (3 camadas de 10), a seguinte três vezes a base acima dela (6) e a terceira 9 —
 * 7 + 4 + 1 camadas a menos, de 8 caixas cada. É o que a porta, que não é parede, tira de qualquer
 * carga que chegue até ela.
 */
const DOOR_STAIRCASE_BOXES = (7 + 4 + 1) * 8

function box(input: {
  readonly count: number
  readonly heightMm: number
  readonly lengthMm: number
  readonly source: 'estimated' | 'measured'
  readonly stopSequence: number
  readonly widthMm: number
}): PlacementBox {
  return {
    ...input,
    isFragile: null,
    isStackable: null,
    keepUpright: null,
    label: `P${String(input.stopSequence)}`,
    maxStackCount: null,
  }
}

function drawnOf(plan: CargoPlacement | null): CargoPlacement['layers'][number]['boxes'] {
  return (plan?.layers ?? []).flatMap((layer) => layer.boxes)
}

function unplacedOf(plan: CargoPlacement | null): number {
  return (plan?.unplaced ?? []).reduce((total, entry) => total + entry.count, 0)
}

/** As 85 paradas reais do Atego, todas na caixa presumida — a carga sem nenhum tamanho misturado. */
function presumedAtegoStops(): readonly (readonly [number, number])[] {
  const totals = new Map<number, number>()
  for (const [stop, count] of ATEGO_85_STOPS) totals.set(stop, (totals.get(stop) ?? 0) + count)

  return [...totals.entries()]
}

function presumedOf(stop: number, count: number): PlacementBox {
  return box({
    count,
    heightMm: PRESUMED_HEIGHT_MM,
    lengthMm: 371,
    source: 'estimated',
    stopSequence: stop,
    widthMm: 261,
  })
}

describe('a caixa pequena vai para onde a caixa da carga não cabe (spec 117)', () => {
  /**
   * ⚠️ Um cubo medido de 10 cm entrava antes das presumidas da própria parada, sentava no meio da
   * fileira e empurrava as seguintes 10 cm para o lado. A chaminé que sobrava tirava o apoio da fileira
   * de trás naquela coluna, e cada camada acima perdia uma caixa. Medido nas 85 paradas reais: com um
   * cubo a cada cinco paradas as presumidas caíam de 1344 para 1093 — 17 cubos custando 251 caixas.
   *
   * O limite é físico: uma caixa pequena ocupa no máximo **uma coluna** do baú. Custar mais que isso é
   * a desarrumação que ela provoca em volta, não o lugar que ela ocupa.
   */
  test('um cubo de 10 cm não custa mais que a coluna em que entra', () => {
    const stops = presumedAtegoStops()
    const alone = resolveCargoPlacement({
      bed: ATEGO_BED,
      boxes: stops.map(([stop, count]) => presumedOf(stop, count)),
      payloadRatio: '0.9897',
    })
    const cubeStops = stops.filter(([stop]) => stop % 5 === 0)
    const mixed = resolveCargoPlacement({
      bed: ATEGO_BED,
      boxes: [
        ...stops.map(([stop, count]) => presumedOf(stop, count)),
        ...cubeStops.map(([stop]) =>
          box({
            count: 1,
            heightMm: 100,
            lengthMm: 100,
            source: 'measured',
            stopSequence: stop,
            widthMm: 100,
          }),
        ),
      ],
      payloadRatio: '0.9897',
    })
    const presumedAlone = drawnOf(alone).length
    const drawnMixed = drawnOf(mixed)
    const presumedMixed = drawnMixed.filter((entry) => entry.source === 'estimated').length

    expect(drawnMixed.filter((entry) => entry.source === 'measured').length).toBe(cubeStops.length)
    expect(presumedAlone - presumedMixed).toBeLessThanOrEqual(cubeStops.length * BOXES_PER_COLUMN)
  })
})

describe('a busca de lugar vai até a porta (spec 116, contrato da spec 117)', () => {
  /**
   * ⚠️ O teto de tentativas por caixa era 64 fileiras para qualquer baú. Cada avanço da fronteira custa
   * duas passadas da testeira até ela, e num baú de 7,40 m isso passa de 64 perto da porta: a busca
   * desistia com lugar livre adiante, e a memória de formato recusava as gêmeas sem procurar. Medido
   * nesta carga: 1285 de 1396 caixas com o teto fixo, 1368 com o teto proporcional às fileiras.
   *
   * ⚠️ O que fica fora não passa da escada da porta — é a única perda que a física exige.
   */
  test('num baú de 7,40 m com 85 paradas, o que fica fora cabe na escada da porta', () => {
    const boxes = Array.from({ length: 85 }, (_, index) => index + 1).flatMap((stop) => [
      presumedOf(stop, 16),
      ...(stop % 7 === 0
        ? [
            box({
              count: 3,
              heightMm: 250,
              lengthMm: 400,
              source: 'measured',
              stopSequence: stop,
              widthMm: 300,
            }),
          ]
        : []),
    ])
    const requested = boxes.reduce((total, entry) => total + entry.count, 0)
    const plan = resolveCargoPlacement({ bed: ATEGO_BED, boxes, payloadRatio: '0.9897' })

    expect(requested).toBeLessThan(1500)
    expect(plan?.unplaced.filter((entry) => entry.reason === 'tooMany')).toEqual([])
    expect(unplacedOf(plan)).toBeLessThanOrEqual(DOOR_STAIRCASE_BOXES)
  })
})
