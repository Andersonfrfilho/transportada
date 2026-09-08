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
  return { readByNodeIds: async () => booths }
}

describe('opções de rota (spec 096 T1)', () => {
  test('rota única não publica alternativa, e o ranking diz que não há escolha', async () => {
    const geometry = {
      readRouteGeometry: async (): Promise<RouteGeometryRoad> => ({
        legs: [{ distanceMetres: 106_600, durationSeconds: 5_160 }],
        nodeIds: [1, 2, 3],
        points: ESTRADA_PRINCIPAL,
      }),
    }

    const view = await readRouteGeometry({ geometry, stops: PARADAS })

    expect(view.options).toHaveLength(1)
    expect(view.hasChoice).toBe(false)
  })

  /**
   * ⚠️ Compatibilidade: quem lê `.legs`/`.points`/`.toll`/`.source` hoje continua recebendo os
   * dados da rota **principal** — a primeira que o OSRM devolveu, nunca a mais barata.
   */
  test('os campos de sempre continuam sendo os da rota principal', async () => {
    const geometry = {
      readRouteGeometry: async (): Promise<RouteGeometryRoad> => ({
        alternatives: [
          { legs: TRECHO_ALTERNATIVA, nodeIds: [30, 40], points: ESTRADA_ALTERNATIVA },
        ],
        legs: TRECHO_PRINCIPAL,
        nodeIds: [10, 20],
        points: ESTRADA_PRINCIPAL,
      }),
    }

    const view = await readRouteGeometry({
      axles: { count: 2, source: 'declared' },
      fuelBaseline: TOCO,
      geometry,
      stops: PARADAS,
      tollBooths: tollBooths([praca(10, '10.8600', '2026-07-01')]),
    })

    expect(view.legs).toEqual(TRECHO_PRINCIPAL)
    expect(view.toll?.total).toBe('21.7200')
    expect(view.source).toBe('road')
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
          { legs: TRECHO_ALTERNATIVA, nodeIds: [30, 40], points: ESTRADA_ALTERNATIVA },
        ],
        legs: TRECHO_PRINCIPAL,
        nodeIds: [10, 20],
        points: ESTRADA_PRINCIPAL,
      }),
    }

    const calls: (readonly number[])[] = []
    const view = await readRouteGeometry({
      axles: { count: 2, source: 'declared' },
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
          { legs: TRECHO_ALTERNATIVA, nodeIds: [30, 40], points: ESTRADA_ALTERNATIVA },
        ],
        legs: TRECHO_PRINCIPAL,
        nodeIds: [10, 20],
        points: ESTRADA_PRINCIPAL,
      }),
    }

    const view = await readRouteGeometry({
      axles: { count: 2, source: 'declared' },
      geometry,
      stops: PARADAS,
      tollBooths: tollBooths([praca(10, '5.0000', '2026-07-01')]),
    })

    expect(view.cheapestIndex).toBeNull()
    expect(view.costGap).toBe('NO_FUEL_BASELINE')
  })

  test('provedor mudo continua sem opção nenhuma e sem escolha', async () => {
    const geometry = { readRouteGeometry: async () => null }

    const view = await readRouteGeometry({ geometry, stops: PARADAS })

    expect(view).toEqual({
      cheapestIndex: null,
      costGap: null,
      depot: null,
      fastestIndex: null,
      hasChoice: false,
      legs: [],
      options: [],
      points: [],
      source: 'unavailable',
      toll: null,
    })
  })
})
