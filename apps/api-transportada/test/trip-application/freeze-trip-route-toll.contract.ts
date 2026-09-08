/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 090 T11: congela o pedágio na mesma chamada que planeja o roteiro — a mesma rota que o
 * mapa desenharia, nunca uma segunda que poderia discordar (D4).
 */
import { describe, expect, test } from 'bun:test'

import {
  freezeTripRouteToll,
  type FreezeTripRouteTollPort,
  type FreezeTripRouteTollVehicleContext,
} from '../../src/trips/application/freeze-trip-route-toll.use-case.js'
import type { RouteGeometryPoint } from '../../src/trips/domain/route-geometry.policy.js'
import type { TollBoothRouteRecord } from '../../src/toll-booths/application/toll-booth.port.js'
import type { TollRouteCost } from '../../src/toll-booths/domain/toll-route-cost.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000t01'

const STOPS: readonly RouteGeometryPoint[] = [
  { latitude: -21.1775, longitude: -47.8103 },
  { latitude: -21.9967, longitude: -47.4256 },
]

const ESTRADA = STOPS
const TRECHOS = [{ distanceMetres: 89_400, durationSeconds: 4_200 }] as const

function praca(osmNodeId: number, chargePerAxle: string): TollBoothRouteRecord {
  return {
    chargeCar: chargePerAxle,
    chargePerAxle,
    chargePerAxleAutomatic: null,
    latitude: '-21.1775000',
    longitude: '-47.8103000',
    name: `Praça ${osmNodeId}`,
    observedOn: '2026-07-01',
    operator: 'Operadora',
    osmNodeId,
  }
}

const TRES_PRACAS = [praca(1, '10.9333'), praca(2, '10.9333'), praca(3, '10.9334')]

function createFakeRepository(input: {
  readonly stops?: readonly RouteGeometryPoint[]
  readonly vehicle: FreezeTripRouteTollVehicleContext | null
}): FreezeTripRouteTollPort & { readonly writeCalls: readonly (null | TollRouteCost)[] } {
  const writeCalls: (null | TollRouteCost)[] = []

  return {
    get writeCalls() {
      return writeCalls
    },
    async readStopCoordinates() {
      return input.stops ?? STOPS
    },
    async readTollContext() {
      return input.vehicle
    },
    async writePlannedToll(writeInput) {
      writeCalls.push(writeInput.toll)
    },
  }
}

function createGeometryPort(nodeIds: null | readonly number[]) {
  return {
    readRouteGeometry: async () => ({ legs: TRECHOS, nodeIds, points: ESTRADA }) as const,
  }
}

describe('congelamento do pedágio no planejamento (spec 090 T11)', () => {
  test('congela o total certo — veículo de 2 eixos, três praças, sem tag', async () => {
    const repository = createFakeRepository({
      vehicle: {
        axles: { count: 2, source: 'declared' },
        /** Toco: dois eixos de rodagem dupla, Categoria 2 — multiplicador 2. */
        multiplier: { denominator: 1, numerator: 2 },
        hasAutomaticTollPayment: false,
      },
    })

    await freezeTripRouteToll({
      companyId: COMPANY_ID,
      geometry: createGeometryPort([10, 1, 2, 3]),
      repository,
      tollBooths: { readByNodeIds: async () => TRES_PRACAS },
      tripId: TRIP_ID,
    })

    expect(repository.writeCalls).toHaveLength(1)
    const [frozen] = repository.writeCalls
    expect(frozen?.total).toBe('65.6000')
    expect(frozen?.boothsWithoutCharge).toBe(0)
    expect(frozen?.paymentMode).toBe('manual')
  })

  test('não carrega a data de observação — ela não faz parte da decisão congelada', async () => {
    const repository = createFakeRepository({
      vehicle: {
        axles: { count: 2, source: 'declared' },
        /** Toco: dois eixos de rodagem dupla, Categoria 2 — multiplicador 2. */
        multiplier: { denominator: 1, numerator: 2 },
        hasAutomaticTollPayment: false,
      },
    })

    await freezeTripRouteToll({
      companyId: COMPANY_ID,
      geometry: createGeometryPort([1]),
      repository,
      tollBooths: { readByNodeIds: async () => [praca(1, '32.80')] },
      tripId: TRIP_ID,
    })

    const [frozen] = repository.writeCalls
    expect(frozen).not.toHaveProperty('tariffObservedOn')
  })

  test('sem geometria disponível, grava null — nunca inventa um total', async () => {
    const repository = createFakeRepository({
      vehicle: {
        axles: { count: 2, source: 'declared' },
        /** Toco: dois eixos de rodagem dupla, Categoria 2 — multiplicador 2. */
        multiplier: { denominator: 1, numerator: 2 },
        hasAutomaticTollPayment: false,
      },
    })

    await freezeTripRouteToll({
      companyId: COMPANY_ID,
      geometry: { readRouteGeometry: async () => null },
      repository,
      tollBooths: { readByNodeIds: async () => TRES_PRACAS },
      tripId: TRIP_ID,
    })

    expect(repository.writeCalls).toEqual([null])
  })

  test('viagem sem menos de duas paradas também grava null, e regrava sobre o que já existia', async () => {
    const repository = createFakeRepository({
      stops: [STOPS[0] as RouteGeometryPoint],
      vehicle: {
        axles: { count: 2, source: 'declared' },
        /** Toco: dois eixos de rodagem dupla, Categoria 2 — multiplicador 2. */
        multiplier: { denominator: 1, numerator: 2 },
        hasAutomaticTollPayment: false,
      },
    })

    await freezeTripRouteToll({
      companyId: COMPANY_ID,
      geometry: createGeometryPort([1, 2, 3]),
      repository,
      tollBooths: { readByNodeIds: async () => TRES_PRACAS },
      tripId: TRIP_ID,
    })

    expect(repository.writeCalls).toEqual([null])
  })

  test('viagem sumida entre o gate e o congelamento é no-op, sem escrever nada', async () => {
    const repository = createFakeRepository({ vehicle: null })

    await freezeTripRouteToll({
      companyId: COMPANY_ID,
      geometry: createGeometryPort([1, 2, 3]),
      repository,
      tollBooths: { readByNodeIds: async () => TRES_PRACAS },
      tripId: TRIP_ID,
    })

    expect(repository.writeCalls).toHaveLength(0)
  })
})
