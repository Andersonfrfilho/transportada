/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 096 T1: a resposta da rota passa a carregar as alternativas — cada uma com trechos, nós,
 * pedágio e o ranking de `rankRouteOptions` (spec 096 T2) — sem quebrar quem lê hoje `.legs`,
 * `.points`, `.toll` e `.source` (RouteGeometryView já é consumida pelo mapa e pelo detalhe).
 */
import { describe, expect, test } from 'bun:test'

import { readRouteGeometry } from '../../src/trips/application/read-route-geometry.use-case.js'
import type { RouteGeometryPoint } from '../../src/trips/domain/route-geometry.policy.js'
import type { RouteGeometryRoad } from '../../src/trips/application/route-geometry.port.js'
import type { TollBoothRouteRecord } from '../../src/toll-booths/application/toll-booth.port.js'

const PARADAS: readonly RouteGeometryPoint[] = [
  { latitude: -21.1767, longitude: -47.8103 },
  { latitude: -22.9056, longitude: -47.0608 },
]

const ESTRADA_PRINCIPAL: readonly RouteGeometryPoint[] = [
  { latitude: -21.1767, longitude: -47.8103 },
  { latitude: -22.9056, longitude: -47.0608 },
]

const ESTRADA_ALTERNATIVA: readonly RouteGeometryPoint[] = [
  { latitude: -21.1767, longitude: -47.8103 },
  { latitude: -22.85, longitude: -47.1 },
  { latitude: -22.9056, longitude: -47.0608 },
]

/** Ribeirão Preto → Campinas medido em 2026-09-07: a principal com cinco praças, 221,5 km. */
const TRECHO_PRINCIPAL = [{ distanceMetres: 221_500, durationSeconds: 179 * 60 }] as const
/** A alternativa, com uma praça a menos e 18,1 km a mais. */
const TRECHO_ALTERNATIVA = [{ distanceMetres: 239_600, durationSeconds: 198 * 60 }] as const

function praca(osmNodeId: number, chargePerAxle: string, observedOn: string): TollBoothRouteRecord {
  return {
    chargeCar: chargePerAxle,
    chargePerAxle,
    chargePerAxleAutomatic: null,
    latitude: '-21.9000000',
    longitude: '-47.5000000',
    name: `Praça ${osmNodeId}`,
    observedOn,
    operator: 'Operadora',
    osmNodeId,
  }
}

/** Um toco: 3,5 km/l, diesel a R$ 6,20 — os números que a spec 096 usou para medir. */
const TOCO = { kilometersPerLiter: '3.5000', pricePerLiter: '6.2000' } as const

function tollBooths(booths: readonly TollBoothRouteRecord[]) {
  return {
    readByNodeIds: async () => booths,
    readCatalogSummary: async () => ({ boothCount: booths.length, latestObservedOn: '2026-07-01' }),
  }
}

describe('opções de rota (spec 096 T1)', () => {
  test('rota única não publica alternativa, e o ranking diz que não há escolha', async () => {
    const geometry = {
      readRouteGeometry: async (): Promise<RouteGeometryRoad> => ({
        legs: [{ distanceMetres: 106_600, durationSeconds: 5_160 }],
        nodeIds: [1, 2, 3],
        nodeIdsByLeg: [[1, 2, 3]],
        points: ESTRADA_PRINCIPAL,
      }),
    }

    const view = await readRouteGeometry({ geometry, stops: PARADAS })

    expect(view.options).toHaveLength(1)
    expect(view.hasChoice).toBe(false)
    expect(view.selectedIndex).toBe(0)
  })

  /**
   * ⚠️ Spec 153 D1: `.legs`/`.points`/`.toll` passam a ser os da rota **selecionada**, não mais
   * sempre a principal. Nesta fixação a principal continua sendo a mais barata (a alternativa roda
   * 18,1 km a mais e economiza uma praça só), então a seleção por padrão coincide com o índice 0 —
   * é o mesmo resultado de antes, por coincidência do custo, não por regra de índice.
   */
  test('os campos de sempre continuam sendo os da rota selecionada, e a principal é a mais barata aqui', async () => {
    const geometry = {
      readRouteGeometry: async (): Promise<RouteGeometryRoad> => ({
        alternatives: [
          {
            legs: TRECHO_ALTERNATIVA,
            nodeIds: [30, 40],
            nodeIdsByLeg: [[30, 40]],
            points: ESTRADA_ALTERNATIVA,
          },
        ],
        legs: TRECHO_PRINCIPAL,
        nodeIds: [10, 20],
        nodeIdsByLeg: [[10, 20]],
        points: ESTRADA_PRINCIPAL,
      }),
    }

    const view = await readRouteGeometry({
      axles: { count: 2, source: 'declared' },
      /** Rodagem dupla: multiplicador = eixos. */
      multiplier: { denominator: 1, numerator: 2 },
      fuelBaseline: TOCO,
      geometry,
      stops: PARADAS,
      tollBooths: tollBooths([praca(10, '10.8600', '2026-07-01')]),
    })

    expect(view.legs).toEqual(TRECHO_PRINCIPAL)
    expect(view.toll?.total).toBe('21.7200')
    expect(view.source).toBe('road')
    expect(view.selectedIndex).toBe(0)
    expect(view.choiceReproduced).toBe(true)
    expect(view.options[0]?.signature).not.toBeNull()
  })

  /**
   * ⚠️ O caso medido de Campinas: a alternativa tem uma praça a menos e economiza pedágio, mas
   * roda mais e o combustível a mais custa mais do que o pedágio economizado — ela não vira
   * "mais barata" (spec 096 D1). Cada opção soma o **próprio** pedágio (D3), pelos **próprios**
   * nós.
   */
  test('cada opção soma o próprio pedágio, e a mais barata não é a de menor pedágio', async () => {
    const geometry = {
      readRouteGeometry: async (): Promise<RouteGeometryRoad> => ({
        alternatives: [
          {
            legs: TRECHO_ALTERNATIVA,
            nodeIds: [30, 40],
            nodeIdsByLeg: [[30, 40]],
            points: ESTRADA_ALTERNATIVA,
          },
        ],
        legs: TRECHO_PRINCIPAL,
        nodeIds: [10, 20],
        nodeIdsByLeg: [[10, 20]],
        points: ESTRADA_PRINCIPAL,
      }),
    }

    const calls: (readonly number[])[] = []
    const view = await readRouteGeometry({
      axles: { count: 2, source: 'declared' },
      /** Rodagem dupla: multiplicador = eixos. */
      multiplier: { denominator: 1, numerator: 2 },
      fuelBaseline: TOCO,
      geometry,
      stops: PARADAS,
      tollBooths: {
        readByNodeIds: async (nodeIds) => {
          calls.push(nodeIds)
          if (nodeIds.includes(10)) {
            return [praca(10, '27.1500', '2026-07-01'), praca(20, '27.1500', '2026-07-01')]
          }
          return [praca(30, '46.6000', '2026-07-01')]
        },
        readCatalogSummary: async () => ({ boothCount: 3, latestObservedOn: '2026-07-01' }),
      },
    })

    expect(calls).toEqual([
      [10, 20],
      [30, 40],
    ])
    expect(view.options).toHaveLength(2)
    expect(view.options[0]?.toll?.total).toBe('108.6000')
    expect(view.options[1]?.toll?.total).toBe('93.2000')
    expect(view.hasChoice).toBe(true)
    expect(view.fastestIndex).toBe(0)
    expect(view.cheapestIndex).toBe(0)
    expect(view.options[0]?.totalCost).not.toBeNull()
    expect(view.options[1]?.totalCost).not.toBeNull()
  })

  /** Sem consumo declarado não há "mais barata" nenhuma — nunca inventar o número que decide. */
  test('sem consumo do veículo, nenhuma opção recebe o rótulo de mais barata', async () => {
    const geometry = {
      readRouteGeometry: async (): Promise<RouteGeometryRoad> => ({
        alternatives: [
          {
            legs: TRECHO_ALTERNATIVA,
            nodeIds: [30, 40],
            nodeIdsByLeg: [[30, 40]],
            points: ESTRADA_ALTERNATIVA,
          },
        ],
        legs: TRECHO_PRINCIPAL,
        nodeIds: [10, 20],
        nodeIdsByLeg: [[10, 20]],
        points: ESTRADA_PRINCIPAL,
      }),
    }

    const view = await readRouteGeometry({
      axles: { count: 2, source: 'declared' },
      /** Rodagem dupla: multiplicador = eixos. */
      multiplier: { denominator: 1, numerator: 2 },
      geometry,
      stops: PARADAS,
      tollBooths: tollBooths([praca(10, '5.0000', '2026-07-01')]),
    })

    expect(view.cheapestIndex).toBeNull()
    expect(view.costGap).toBe('NO_FUEL_BASELINE')
    /**
     * ⚠️ Sem baseline, o critério `cheapest` não acha candidata nenhuma (nenhum custo é conhecido) —
     * a seleção cai na principal, e avisa que não é reproduzida (spec 153 D3), distinto do caso em
     * que uma assinatura pedida não bate.
     */
    expect(view.selectedIndex).toBe(0)
    expect(view.choiceReproduced).toBe(false)
  })

  test('provedor mudo continua sem opção nenhuma e sem escolha', async () => {
    const geometry = { readRouteGeometry: async () => null }

    const view = await readRouteGeometry({ geometry, stops: PARADAS })

    expect(view).toEqual({
      cheapestIndex: null,
      choiceReproduced: true,
      costGap: null,
      depot: null,
      fastestIndex: null,
      hasChoice: false,
      legs: [],
      options: [],
      points: [],
      selectedIndex: null,
      source: 'unavailable',
      toll: null,
    })
  })

  /** Spec 153 RF2: a rota sem pedágio entra como candidata própria, com a marca e a assinatura. */
  test('cada opção carrega assinatura e marca de sem pedágio (spec 153 RF2)', async () => {
    const geometry = {
      readRouteGeometry: async (
        _points: readonly RouteGeometryPoint[],
        options?: Readonly<{ excludeToll?: boolean }>,
      ): Promise<RouteGeometryRoad> =>
        options?.excludeToll === true
          ? {
              legs: TRECHO_ALTERNATIVA,
              nodeIds: [50, 60],
              nodeIdsByLeg: [[50, 60]],
              points: ESTRADA_ALTERNATIVA,
            }
          : {
              legs: TRECHO_PRINCIPAL,
              nodeIds: [10, 20],
              nodeIdsByLeg: [[10, 20]],
              points: ESTRADA_PRINCIPAL,
            },
    }

    const view = await readRouteGeometry({ geometry, stops: PARADAS })

    expect(view.options).toHaveLength(2)
    expect(view.options[0]?.signature).not.toBeNull()
    expect(view.options[0]?.isNoToll).toBe(false)
    expect(view.options[1]?.signature).not.toBeNull()
    expect(view.options[1]?.isNoToll).toBe(true)
  })

  test('critério no_toll escolhe a opção marcada, mesmo sem ser a mais barata (spec 153 RF2/D2)', async () => {
    const geometry = {
      readRouteGeometry: async (
        _points: readonly RouteGeometryPoint[],
        options?: Readonly<{ excludeToll?: boolean }>,
      ): Promise<RouteGeometryRoad> =>
        options?.excludeToll === true
          ? {
              legs: TRECHO_ALTERNATIVA,
              nodeIds: [50, 60],
              nodeIdsByLeg: [[50, 60]],
              points: ESTRADA_ALTERNATIVA,
            }
          : {
              legs: TRECHO_PRINCIPAL,
              nodeIds: [10, 20],
              nodeIdsByLeg: [[10, 20]],
              points: ESTRADA_PRINCIPAL,
            },
    }

    const view = await readRouteGeometry({
      choice: { criterion: 'no_toll', signature: null },
      geometry,
      stops: PARADAS,
    })

    expect(view.options[1]?.isNoToll).toBe(true)
    expect(view.selectedIndex).toBe(1)
    expect(view.legs).toEqual(TRECHO_ALTERNATIVA)
    expect(view.choiceReproduced).toBe(true)
  })

  /** O ponto central da spec 153: a viagem para de congelar sempre a principal. */
  test('quando a alternativa é mais barata, os campos de topo passam a ser os dela (spec 153 D1)', async () => {
    const geometry = {
      readRouteGeometry: async (): Promise<RouteGeometryRoad> => ({
        alternatives: [
          {
            legs: TRECHO_ALTERNATIVA,
            nodeIds: [30, 40],
            nodeIdsByLeg: [[30, 40]],
            points: ESTRADA_ALTERNATIVA,
          },
        ],
        legs: TRECHO_PRINCIPAL,
        nodeIds: [10, 20],
        nodeIdsByLeg: [[10, 20]],
        points: ESTRADA_PRINCIPAL,
      }),
    }

    const view = await readRouteGeometry({
      axles: { count: 2, source: 'declared' },
      multiplier: { denominator: 1, numerator: 2 },
      fuelBaseline: TOCO,
      geometry,
      stops: PARADAS,
      /** Pedágio enorme na principal garante a alternativa mais barata mesmo rodando mais km. */
      tollBooths: tollBooths([praca(10, '250.0000', '2026-07-01')]),
    })

    const alternativeOption = view.options[1]
    if (alternativeOption === undefined) throw new Error('esperava rota alternativa')

    expect(view.selectedIndex).toBe(1)
    expect(view.cheapestIndex).toBe(1)
    expect(view.legs).toEqual(TRECHO_ALTERNATIVA)
    expect(view.points).toEqual(alternativeOption.points)
    expect(view.toll?.total).toBe(alternativeOption.toll?.total)
    expect(view.choiceReproduced).toBe(true)
  })

  test('escolha por assinatura reproduz a rota pedida, mesmo que o critério não bata (spec 153 D2)', async () => {
    const geometry = {
      readRouteGeometry: async (): Promise<RouteGeometryRoad> => ({
        alternatives: [
          {
            legs: TRECHO_ALTERNATIVA,
            nodeIds: [30, 40],
            nodeIdsByLeg: [[30, 40]],
            points: ESTRADA_ALTERNATIVA,
          },
        ],
        legs: TRECHO_PRINCIPAL,
        nodeIds: [10, 20],
        nodeIdsByLeg: [[10, 20]],
        points: ESTRADA_PRINCIPAL,
      }),
    }

    const preview = await readRouteGeometry({ geometry, stops: PARADAS })
    const alternativeSignature = preview.options[1]?.signature ?? null
    if (alternativeSignature === null) throw new Error('esperava assinatura da alternativa')

    const view = await readRouteGeometry({
      /** 'fastest' sozinho escolheria a principal (179 min < 198 min) — só a assinatura força a alternativa. */
      choice: { criterion: 'fastest', signature: alternativeSignature },
      geometry,
      stops: PARADAS,
    })

    expect(view.selectedIndex).toBe(1)
    expect(view.choiceReproduced).toBe(true)
    expect(view.legs).toEqual(TRECHO_ALTERNATIVA)
  })

  test('assinatura que não bate cai no critério e avisa (spec 153 D3)', async () => {
    const geometry = {
      readRouteGeometry: async (): Promise<RouteGeometryRoad> => ({
        alternatives: [
          {
            legs: TRECHO_ALTERNATIVA,
            nodeIds: [30, 40],
            nodeIdsByLeg: [[30, 40]],
            points: ESTRADA_ALTERNATIVA,
          },
        ],
        legs: TRECHO_PRINCIPAL,
        nodeIds: [10, 20],
        nodeIdsByLeg: [[10, 20]],
        points: ESTRADA_PRINCIPAL,
      }),
    }

    const view = await readRouteGeometry({
      choice: { criterion: 'cheapest', signature: 'assinatura-que-nao-existe' },
      axles: { count: 2, source: 'declared' },
      multiplier: { denominator: 1, numerator: 2 },
      fuelBaseline: TOCO,
      geometry,
      stops: PARADAS,
      /** Pedágio enorme na principal garante a alternativa mais barata — prova que a queda vai para o critério, não para a principal. */
      tollBooths: tollBooths([praca(10, '250.0000', '2026-07-01')]),
    })

    expect(view.choiceReproduced).toBe(false)
    expect(view.selectedIndex).toBe(1)
    expect(view.legs).toEqual(TRECHO_ALTERNATIVA)
  })

  /**
   * ⚠️ A divergência que a spec 153 pede pinada: pedágio desconhecido barra o rótulo de "mais
   * barata" por inteiro (`cheapestIndex` sai `null`), mas a seleção continua achando a rota de
   * custo conhecido — as duas contas respondem perguntas diferentes e não devem ser unificadas.
   */
  test('cheapestIndex e selectedIndex podem discordar: pedágio desconhecido barra o rótulo, mas a seleção acha a rota com custo conhecido (spec 153)', async () => {
    const geometry = {
      readRouteGeometry: async (): Promise<RouteGeometryRoad> => ({
        alternatives: [
          {
            legs: TRECHO_ALTERNATIVA,
            nodeIds: [99],
            nodeIdsByLeg: [[99]],
            points: ESTRADA_ALTERNATIVA,
          },
        ],
        legs: TRECHO_PRINCIPAL,
        /** A: pedágio desconhecido de propósito — sem anotação de nó nenhuma. */
        nodeIds: null,
        nodeIdsByLeg: null,
        points: ESTRADA_PRINCIPAL,
      }),
    }

    const view = await readRouteGeometry({
      axles: { count: 1, source: 'declared' },
      multiplier: { denominator: 1, numerator: 1 },
      fuelBaseline: TOCO,
      geometry,
      stops: PARADAS,
      /** B: R$ 110 exatos de pedágio, custo conhecido. */
      tollBooths: tollBooths([praca(99, '110.0000', '2026-07-01')]),
    })

    expect(view.options[0]?.toll).toBeNull()
    expect(view.options[0]?.totalCost).toBeNull()
    expect(view.options[1]?.toll?.total).toBe('110.0000')
    expect(view.options[1]?.totalCost).not.toBeNull()

    expect(view.cheapestIndex).toBeNull()
    expect(view.costGap).toBe('TOLL_UNKNOWN')
    expect(view.selectedIndex).toBe(1)
    expect(view.choiceReproduced).toBe(true)
    expect(view.legs).toEqual(TRECHO_ALTERNATIVA)
  })
})
