/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 323 T1: o ordenador das paradas do rascunho.
 *
 * O ordenador recebe a matriz de custo pela estrada (barracão na linha 0) e devolve a ordem das paradas. É função pura:
 * nada de rede, banco ou relógio, então o mesmo conjunto dá sempre a mesma ordem. Os contratos são os da spec: é
 * permutação do conjunto, é determinístico, nunca piora a ordem de entrada, desempata pela menor `sequence`, manda a
 * parada sem coordenada para o fim e, com a ordem do despachante (`manual`), só encaixa a parada nova.
 */
import { describe, expect, it } from 'bun:test'

import {
  type DraftStopForOrdering,
  measureOpenPathCost,
  orderStopsByRoad,
  type RoadCostMatrix,
  resolveDraftStopOrderMode,
} from '../../src/trips/domain/draft-stop-order.policy.js'

/** Matriz de pontos numa reta (custo = distância absoluta), com o barracão na posição `depot`. */
function lineMatrix(depot: number, positions: readonly number[]): RoadCostMatrix {
  const points = [depot, ...positions]
  return points.map((from) => points.map((to) => Math.abs(from - to)))
}

function stop(
  id: string,
  sequence: number,
  matrixIndex: number | null,
  isNew = false,
): DraftStopForOrdering {
  return { id, isNew, matrixIndex, sequence }
}

/** Gerador pseudoaleatório com semente (mulberry32): a propriedade roda sempre os mesmos casos. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    const current = copy[index] as T
    copy[index] = copy[swap] as T
    copy[swap] = current
  }
  return copy
}

/** Matriz assimétrica, como a do OSRM (ida e volta diferem), com algumas células sem estrada. */
function randomMatrix(size: number, random: () => number): RoadCostMatrix {
  return Array.from({ length: size }, (_, from) =>
    Array.from({ length: size }, (_, to) => {
      if (from === to) return 0
      if (random() < 0.03) return null
      return Math.round(random() * 10_000)
    }),
  )
}

describe('spec 323 — o ordenador das paradas do rascunho', () => {
  it('põe Matão, Monte Alto e Jaboticabal na ordem da estrada a partir do barracão, mesmo bipadas intercaladas', () => {
    // Barracão em 0; Jaboticabal a 60, Monte Alto a 85 e Matão a 115 na mesma estrada (caso da viagem d5fe956c).
    const costs = lineMatrix(0, [115, 60, 85, 115, 60])
    const stops = [
      stop('matao-1', 1, 1),
      stop('jaboticabal-1', 2, 2),
      stop('monte-alto', 3, 3),
      stop('matao-2', 4, 4),
      stop('jaboticabal-2', 5, 5),
    ]

    const result = orderStopsByRoad({ costs, mode: 'reorder_all', stops })

    expect(result.orderedStopIds).toEqual([
      'jaboticabal-1',
      'jaboticabal-2',
      'monte-alto',
      'matao-1',
      'matao-2',
    ])
    expect(result.excludedStopIds).toEqual([])
  })

  it('desempata pela menor sequence atual quando duas paradas custam igual', () => {
    const costs = lineMatrix(0, [10, 10, 10])
    const stops = [stop('c', 7, 3), stop('a', 3, 1), stop('b', 5, 2)]

    expect(orderStopsByRoad({ costs, mode: 'reorder_all', stops }).orderedStopIds).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('corrige o vizinho mais próximo quando ele erra (o refinamento acha a ordem melhor)', () => {
    // Barracão em 0, paradas em 1, 3 e -2. O vizinho mais próximo faz 1 → 3 → -2 (custo 8); a melhor é -2 → 1 → 3 (7).
    const costs = lineMatrix(0, [1, 3, -2])
    const stops = [stop('um', 1, 1), stop('tres', 2, 2), stop('menos-dois', 3, 3)]

    const result = orderStopsByRoad({ costs, mode: 'reorder_all', stops })

    expect(result.orderedStopIds).toEqual(['menos-dois', 'um', 'tres'])
    expect(result.cost).toBe(7)
  })

  it('manda a parada sem coordenada para o fim, na ordem atual, e diz quais ficaram de fora (RF3)', () => {
    const costs = lineMatrix(0, [50, 10])
    const stops = [
      stop('sem-ponto-b', 4, null),
      stop('longe', 1, 1),
      stop('sem-ponto-a', 2, null),
      stop('perto', 3, 2),
    ]

    const result = orderStopsByRoad({ costs, mode: 'reorder_all', stops })

    expect(result.orderedStopIds).toEqual(['perto', 'longe', 'sem-ponto-a', 'sem-ponto-b'])
    expect(result.excludedStopIds).toEqual(['sem-ponto-a', 'sem-ponto-b'])
  })

  it('zero ou uma parada não tem o que ordenar', () => {
    expect(orderStopsByRoad({ costs: [[0]], mode: 'reorder_all', stops: [] })).toEqual({
      cost: 0,
      excludedStopIds: [],
      orderedStopIds: [],
    })
    expect(
      orderStopsByRoad({
        costs: lineMatrix(0, [5]),
        mode: 'reorder_all',
        stops: [stop('so', 1, 1)],
      }).orderedStopIds,
    ).toEqual(['so'])
  })

  it('trata a célula sem estrada como a pior escolha, sem cair para a linha reta', () => {
    // De "a" para "b" não há estrada: o ordenador prefere a → c → b, que tem estrada em todas as pernas.
    const costs: RoadCostMatrix = [
      [0, 1, 50, 2],
      [1, 0, null, 1],
      [50, null, 0, 1],
      [2, 1, 1, 0],
    ]
    const stops = [stop('a', 1, 1), stop('b', 2, 2), stop('c', 3, 3)]

    expect(orderStopsByRoad({ costs, mode: 'reorder_all', stops }).orderedStopIds).toEqual([
      'a',
      'c',
      'b',
    ])
  })

  it('recusa matriz que não cobre as paradas (erro de quem chamou, nunca ordem inventada)', () => {
    expect(() =>
      orderStopsByRoad({
        costs: lineMatrix(0, [1]),
        mode: 'reorder_all',
        stops: [stop('a', 1, 2)],
      }),
    ).toThrow()
    expect(() =>
      orderStopsByRoad({
        costs: [[0, 1], [1]],
        mode: 'reorder_all',
        stops: [stop('a', 1, 1)],
      }),
    ).toThrow()
  })

  describe('com a ordem do despachante (manual), só a parada nova é encaixada', () => {
    it('encaixa a nova na posição mais barata e mantém a ordem relativa das antigas', () => {
      // O despachante pôs A → B → C. A nova (X) fica perto de B e de C e longe do barracão e de A.
      const costs: RoadCostMatrix = [
        [0, 10, 20, 30, 30],
        [10, 0, 10, 20, 30],
        [20, 10, 0, 10, 2],
        [30, 20, 10, 0, 2],
        [30, 30, 2, 2, 0],
      ]
      const stops = [stop('a', 1, 1), stop('b', 2, 2), stop('c', 3, 3), stop('x', 4, 4, true)]

      const result = orderStopsByRoad({ costs, mode: 'insert_new', stops })

      expect(result.orderedStopIds).toEqual(['a', 'b', 'x', 'c'])
    })

    it('não desfaz a ordem do despachante mesmo quando ela é pior que a ótima', () => {
      // 30 → 10 → 20 é pior que 10 → 20 → 30, e continua assim; a nova (90) vai para o fim.
      const costs = lineMatrix(0, [30, 10, 20, 90])
      const stops = [
        stop('trinta', 1, 1),
        stop('dez', 2, 2),
        stop('vinte', 3, 3),
        stop('noventa', 4, 4, true),
      ]

      expect(orderStopsByRoad({ costs, mode: 'insert_new', stops }).orderedStopIds).toEqual([
        'trinta',
        'dez',
        'vinte',
        'noventa',
      ])
    })

    it('a nova pode entrar antes da primeira e no fim', () => {
      const atStart = orderStopsByRoad({
        costs: lineMatrix(0, [20, 30, 5]),
        mode: 'insert_new',
        stops: [stop('vinte', 1, 1), stop('trinta', 2, 2), stop('cinco', 3, 3, true)],
      })
      const atEnd = orderStopsByRoad({
        costs: lineMatrix(0, [20, 30, 90]),
        mode: 'insert_new',
        stops: [stop('vinte', 1, 1), stop('trinta', 2, 2), stop('noventa', 3, 3, true)],
      })

      expect(atStart.orderedStopIds).toEqual(['cinco', 'vinte', 'trinta'])
      expect(atEnd.orderedStopIds).toEqual(['vinte', 'trinta', 'noventa'])
    })

    it('a antiga sem coordenada fica onde o despachante a pôs; a nova entra logo depois da parada anterior; a nova sem coordenada vai para o fim', () => {
      const costs = lineMatrix(0, [10, 30, 20])
      const stops = [
        stop('dez', 1, 1),
        stop('antiga-sem-ponto', 2, null),
        stop('trinta', 3, 2),
        stop('vinte', 4, 3, true),
        stop('nova-sem-ponto', 5, null, true),
      ]

      const result = orderStopsByRoad({ costs, mode: 'insert_new', stops })

      expect(result.orderedStopIds).toEqual([
        'dez',
        'vinte',
        'antiga-sem-ponto',
        'trinta',
        'nova-sem-ponto',
      ])
      expect(result.excludedStopIds).toEqual(['antiga-sem-ponto', 'nova-sem-ponto'])
    })

    it('várias novas entram uma a uma, na ordem da sequence', () => {
      const costs = lineMatrix(0, [10, 40, 30, 20])
      const stops = [
        stop('dez', 1, 1),
        stop('quarenta', 2, 2),
        stop('trinta', 3, 3, true),
        stop('vinte', 4, 4, true),
      ]

      expect(orderStopsByRoad({ costs, mode: 'insert_new', stops }).orderedStopIds).toEqual([
        'dez',
        'vinte',
        'trinta',
        'quarenta',
      ])
    })

    it('sem parada nova, a ordem do despachante não muda', () => {
      const costs = lineMatrix(0, [30, 10, 20])
      const stops = [stop('trinta', 1, 1), stop('dez', 2, 2), stop('vinte', 3, 3)]

      expect(orderStopsByRoad({ costs, mode: 'insert_new', stops }).orderedStopIds).toEqual([
        'trinta',
        'dez',
        'vinte',
      ])
    })
  })

  it('a origem da ordem decide o modo: manual encaixa, suggested e unordered reordenam tudo (D2)', () => {
    expect(resolveDraftStopOrderMode('manual')).toBe('insert_new')
    expect(resolveDraftStopOrderMode('suggested')).toBe('reorder_all')
    expect(resolveDraftStopOrderMode('unordered')).toBe('reorder_all')
  })

  describe('propriedades (RF1), em 300 matrizes assimétricas com semente fixa', () => {
    const random = seededRandom(323)
    const cases = Array.from({ length: 300 }, (_, caseIndex) => {
      const located = 1 + Math.floor(random() * 12)
      const costs = randomMatrix(located + 1, random)
      const ids = Array.from(
        { length: located },
        (_, index) => `p${String(caseIndex)}-${String(index)}`,
      )
      const sequences = shuffled(
        Array.from({ length: located }, (_, index) => index + 1),
        random,
      )
      const stops = ids.map((id, index) =>
        stop(id, sequences[index] as number, index + 1, random() < 0.2),
      )
      return { costs, stops }
    })

    it('é permutação do conjunto: nenhuma parada some nem se repete', () => {
      for (const { costs, stops } of cases) {
        for (const mode of ['reorder_all', 'insert_new'] as const) {
          const result = orderStopsByRoad({ costs, mode, stops })
          expect([...result.orderedStopIds].sort()).toEqual(stops.map((item) => item.id).sort())
        }
      }
    })

    it('é determinístico: a ordem do array de entrada não muda o resultado', () => {
      const shuffle = seededRandom(7)
      for (const { costs, stops } of cases) {
        for (const mode of ['reorder_all', 'insert_new'] as const) {
          const first = orderStopsByRoad({ costs, mode, stops })
          const second = orderStopsByRoad({ costs, mode, stops: shuffled(stops, shuffle) })
          expect(second).toEqual(first)
        }
      }
    })

    it('reordenando tudo, nunca fica pior que a ordem de entrada', () => {
      for (const { costs, stops } of cases) {
        const inputOrder = [...stops].sort((left, right) => left.sequence - right.sequence)
        const inputCost = measureOpenPathCost(
          costs,
          inputOrder.map((item) => item.matrixIndex as number),
        )
        const result = orderStopsByRoad({ costs, mode: 'reorder_all', stops })

        expect(result.cost).toBeLessThanOrEqual(inputCost)
      }
    })

    it('encaixando, as antigas mantêm a ordem relativa da sequence', () => {
      for (const { costs, stops } of cases) {
        const oldIds = stops
          .filter((item) => item.isNew !== true)
          .sort((left, right) => left.sequence - right.sequence)
          .map((item) => item.id)
        const result = orderStopsByRoad({ costs, mode: 'insert_new', stops })

        expect(result.orderedStopIds.filter((id) => oldIds.includes(id))).toEqual(oldIds)
      }
    })
  })
})
