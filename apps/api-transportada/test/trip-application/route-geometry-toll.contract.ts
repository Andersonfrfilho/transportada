/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 090 T7: o pedágio viaja na resposta de `readRouteGeometry` — nunca numa chamada própria
 * (D4). Este contrato prova que a política pura (T5) é alimentada pelos nós que a **mesma**
 * consulta ao OSRM devolveu, e que a data da tarifa é a mais antiga entre as praças cobradas.
 */
import { describe, expect, test } from 'bun:test'

import { readRouteGeometry } from '../../src/trips/application/read-route-geometry.use-case.js'
import type { RouteGeometryPoint } from '../../src/trips/domain/route-geometry.policy.js'
import type { TollBoothRouteRecord } from '../../src/toll-booths/application/toll-booth.port.js'

const PARADAS: readonly RouteGeometryPoint[] = [
  { latitude: -22.0175, longitude: -47.8908 },
  { latitude: -22.009, longitude: -47.8825 },
]

const ESTRADA: readonly RouteGeometryPoint[] = [
  { latitude: -22.0175, longitude: -47.8908 },
  { latitude: -22.009, longitude: -47.8825 },
]

const TRECHOS = [{ distanceMetres: 106_600, durationSeconds: 5_160 }] as const

function porta(input: {
  readonly booths: readonly TollBoothRouteRecord[]
  readonly nodeIds: null | readonly number[]
  /** Quando o caso é sobre em que perna a praça cai, os nós vêm agrupados como o OSRM os devolve. */
  readonly nodeIdsByLeg?: readonly (readonly number[])[]
  readonly legCount?: number
}) {
  const calls: (readonly number[])[] = []
  return {
    calls,
    geometryPort: {
      readRouteGeometry: async () => ({
        legs: Array.from({ length: input.legCount ?? 1 }, () => TRECHOS[0]),
        nodeIds: input.nodeIdsByLeg?.flat() ?? input.nodeIds,
        nodeIdsByLeg: input.nodeIdsByLeg ?? (input.nodeIds === null ? null : [input.nodeIds]),
        points: ESTRADA,
      }),
    },
    tollBooths: {
      readByNodeIds: async (nodeIds: readonly number[]) => {
        calls.push(nodeIds)
        return input.booths
      },
    },
  }
}

function praca(osmNodeId: number, chargePerAxle: string, observedOn: string): TollBoothRouteRecord {
  return {
    chargeCar: chargePerAxle,
    chargePerAxle,
    chargePerAxleAutomatic: null,
    latitude: '-22.0175000',
    longitude: '-47.8908000',
    name: `Praça ${osmNodeId}`,
    observedOn,
    operator: 'Operadora',
    osmNodeId,
  }
}

describe('pedágio na resposta da geometria (spec 090 T7)', () => {
  test('soma o pedágio a partir dos nós que a mesma chamada devolveu', async () => {
    const { geometryPort, tollBooths } = porta({
      booths: [praca(10, '10.50', '2026-07-01'), praca(20, '11.80', '2026-07-01')],
      nodeIds: [1, 10, 5, 20],
    })

    const view = await readRouteGeometry({
      axles: { count: 2, source: 'declared' },
      /** Rodagem dupla: multiplicador = eixos. */
      multiplier: { denominator: 1, numerator: 2 },
      geometry: geometryPort,
      stops: PARADAS,
      tollBooths,
    })

    expect(view.toll?.total).toBe('44.6000')
    expect(view.toll?.booths.map((booth) => booth.osmNodeId)).toEqual([10, 20])
  })

  /**
   * Spec 096 T4: a coordenada viaja da praça até a resposta da rota, para o mapa desenhar o ícone
   * sobre a praça do trajeto — nunca sobre toda cabine da região (D3).
   */
  test('a praça cobrada carrega a própria coordenada', async () => {
    const { geometryPort, tollBooths } = porta({
      booths: [praca(10, '10.50', '2026-07-01')],
      nodeIds: [10],
    })

    const view = await readRouteGeometry({
      axles: { count: 2, source: 'declared' },
      /** Rodagem dupla: multiplicador = eixos. */
      multiplier: { denominator: 1, numerator: 2 },
      geometry: geometryPort,
      stops: PARADAS,
      tollBooths,
    })

    expect(view.toll?.booths[0]?.latitude).toBe('-22.0175000')
    expect(view.toll?.booths[0]?.longitude).toBe('-47.8908000')
  })

  /** A data que a tela imprime é a mais antiga entre as praças cobradas — a mais conservadora. */
  test('a data da tarifa é a mais antiga entre as praças cobradas', async () => {
    const { geometryPort, tollBooths } = porta({
      booths: [praca(10, '10.50', '2026-07-15'), praca(20, '11.80', '2026-06-01')],
      nodeIds: [10, 20],
    })

    const view = await readRouteGeometry({
      axles: { count: 2, source: 'declared' },
      /** Rodagem dupla: multiplicador = eixos. */
      multiplier: { denominator: 1, numerator: 2 },
      geometry: geometryPort,
      stops: PARADAS,
      tollBooths,
    })

    expect(view.toll?.tariffObservedOn).toBe('2026-06-01')
  })

  /** Sem eixo ou sem porta de praças, ninguém pediu pedágio — a resposta não inventa um. */
  test('sem eixo conhecido, o pedágio não é calculado', async () => {
    const { geometryPort, tollBooths } = porta({ booths: [], nodeIds: [10] })

    const view = await readRouteGeometry({ geometry: geometryPort, stops: PARADAS, tollBooths })

    expect(view.toll).toBeNull()
  })

  test('sem nós anotados, o pedágio é desconhecido — nunca zero', async () => {
    const { geometryPort, tollBooths } = porta({ booths: [], nodeIds: null })

    const view = await readRouteGeometry({
      axles: { count: 2, source: 'declared' },
      /** Rodagem dupla: multiplicador = eixos. */
      multiplier: { denominator: 1, numerator: 2 },
      geometry: geometryPort,
      stops: PARADAS,
      tollBooths,
    })

    expect(view.toll).toBeNull()
  })

  /** Rota sem praça é zero com origem conhecida — a mesma regra da T5, agora na borda da API. */
  test('rota sem praça é zero, com a marca de eixo junto', async () => {
    const { geometryPort, tollBooths } = porta({ booths: [], nodeIds: [1, 2, 3] })

    const view = await readRouteGeometry({
      axles: { count: 5, source: 'estimated' },
      /** Rodagem dupla: multiplicador = eixos. */
      multiplier: { denominator: 1, numerator: 5 },
      geometry: geometryPort,
      stops: PARADAS,
      tollBooths,
    })

    expect(view.toll?.total).toBe('0.0000')
    expect(view.toll?.axles.source).toBe('estimated')
    expect(view.toll?.tariffObservedOn).toBeNull()
  })
})

/**
 * ⚠️ **O par de cancelas gêmeas é o caso que a lista achatada não sabia responder.** "Sales Oliveira
 * (sentido Norte)" e "(sentido Sul)" são duas praças a metros uma da outra: numa viagem que fecha no
 * barracão, uma é da ida e a outra da volta. Com os nós colados numa lista só, as duas apareciam no
 * mesmo trecho — e a tela as imprimia uma embaixo da outra antes da primeira entrega, com a volta
 * inteira sem pedágio nenhum.
 */
describe('em que trecho cada praça é cruzada', () => {
  test('a praça carrega o trecho em que o caminhão passa por ela', async () => {
    const { geometryPort, tollBooths } = porta({
      booths: [praca(10, '15.00', '2026-09-01'), praca(20, '15.00', '2026-09-01')],
      legCount: 2,
      nodeIds: null,
      nodeIdsByLeg: [
        [1, 10],
        [5, 20],
      ],
    })

    const view = await readRouteGeometry({
      axles: { count: 2, source: 'declared' },
      multiplier: { denominator: 1, numerator: 1 },
      geometry: geometryPort,
      hasAutomaticTollPayment: false,
      stops: [...PARADAS, PARADAS[0]!],
      tollBooths,
    })

    expect(view.toll?.booths.map((booth) => booth.legIndex)).toEqual([0, 1])
  })

  /** Sem os nós agrupados não há o que afirmar — e `null` é a ausência, nunca o trecho zero. */
  test('sem agrupamento por trecho a praça não inventa perna', async () => {
    const { geometryPort, tollBooths } = porta({
      booths: [praca(10, '15.00', '2026-09-01')],
      nodeIds: [1, 10],
    })

    const view = await readRouteGeometry({
      axles: { count: 2, source: 'declared' },
      multiplier: { denominator: 1, numerator: 1 },
      geometry: geometryPort,
      hasAutomaticTollPayment: false,
      stops: PARADAS,
      tollBooths,
    })

    expect(view.toll?.booths[0]?.legIndex).toBe(0)
  })
})
