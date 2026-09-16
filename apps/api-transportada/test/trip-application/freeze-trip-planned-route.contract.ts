/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T201 (substitui a spec 090 T11): a rota inteira — traçado, métricas e a escolha — se
 * congela na mesma chamada que o pedágio, nunca em duas (D4). `writePlannedRoute` prova isso: uma
 * única chamada carrega `route` e `toll` juntos, e D5 (estrada indisponível) grava os dois `null`
 * — nunca zero.
 */
import { describe, expect, test } from 'bun:test'

import {
  freezeTripPlannedRoute,
  type FreezeTripPlannedRoutePort,
  type FreezeTripPlannedRouteVehicleContext,
  type WritePlannedRouteInput,
} from '../../src/trips/application/freeze-trip-planned-route.use-case.js'
import type { RouteGeometryPoint } from '../../src/trips/domain/route-geometry.policy.js'
import type { TollBoothRouteRecord } from '../../src/toll-booths/application/toll-booth.port.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000t01'

const STOPS: readonly RouteGeometryPoint[] = [
  { latitude: -21.1775, longitude: -47.8103 },
  { latitude: -21.9967, longitude: -47.4256 },
]

const ESTRADA = STOPS
const TRECHOS = [{ distanceMetres: 89_400, durationSeconds: 4_200 }] as const

const VEHICLE: FreezeTripPlannedRouteVehicleContext = {
  axles: { count: 2, source: 'declared' },
  /** Toco: dois eixos de rodagem dupla, Categoria 2 — multiplicador 2. */
  multiplier: { denominator: 1, numerator: 2 },
  hasAutomaticTollPayment: false,
}

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
  readonly vehicle: FreezeTripPlannedRouteVehicleContext | null
}): FreezeTripPlannedRoutePort & { readonly writeCalls: readonly WritePlannedRouteInput[] } {
  const writeCalls: WritePlannedRouteInput[] = []

  return {
    get writeCalls() {
      return writeCalls
    },
    async readStopCoordinates() {
      return input.stops ?? STOPS
    },
    async readVehicleContext() {
      return input.vehicle
    },
    async writePlannedRoute(writeInput) {
      writeCalls.push(writeInput)
    },
  }
}

function createGeometryPort(nodeIds: null | readonly number[]) {
  return {
    readRouteGeometry: async () =>
      ({
        legs: TRECHOS,
        nodeIds,
        nodeIdsByLeg: nodeIds === null ? null : [nodeIds],
        points: ESTRADA,
      }) as const,
  }
}

describe('congelamento da rota inteira (spec 153 T201)', () => {
  test('congela o pedágio certo — veículo de 2 eixos, três praças, sem tag', async () => {
    const repository = createFakeRepository({ vehicle: VEHICLE })

    await freezeTripPlannedRoute({
      companyId: COMPANY_ID,
      geometry: createGeometryPort([10, 1, 2, 3]),
      repository,
      tollBooths: {
        readByNodeIds: async () => TRES_PRACAS,
        readCatalogSummary: async () => ({ boothCount: 3, latestObservedOn: '2026-07-01' }),
      },
      tripId: TRIP_ID,
    })

    expect(repository.writeCalls).toHaveLength(1)
    const [written] = repository.writeCalls
    expect(written?.toll?.total).toBe('65.6000')
    expect(written?.toll?.boothsWithoutCharge).toBe(0)
    expect(written?.toll?.paymentMode).toBe('manual')
  })

  test('congela a rota junto — traçado, métricas e critério, na mesma escrita do pedágio', async () => {
    const repository = createFakeRepository({ vehicle: VEHICLE })

    await freezeTripPlannedRoute({
      companyId: COMPANY_ID,
      geometry: createGeometryPort([1, 2, 3]),
      repository,
      tollBooths: {
        readByNodeIds: async () => TRES_PRACAS,
        readCatalogSummary: async () => ({ boothCount: 3, latestObservedOn: '2026-07-01' }),
      },
      tripId: TRIP_ID,
    })

    expect(repository.writeCalls).toHaveLength(1)
    const [written] = repository.writeCalls
    expect(written?.route).not.toBeNull()
    expect(written?.route?.criterion).toBe('cheapest')
    expect(written?.route?.distanceMeters).toBe(89_400)
    expect(written?.route?.durationSeconds).toBe(4_200)
    expect(written?.route?.legs).toEqual(TRECHOS)
    /** `readRouteGeometry` já simplifica e formata os pontos como string de 5 casas — não como número. */
    expect(written?.route?.points).toEqual([
      { latitude: '-21.17750', longitude: '-47.81030' },
      { latitude: '-21.99670', longitude: '-47.42560' },
    ])
    /** O pedágio some do que a rota carrega — ele já mora em `toll`, gravado ao lado (D4). */
    expect(written?.route).not.toHaveProperty('toll')
  })

  test('não carrega a data de observação — ela não faz parte da decisão congelada', async () => {
    const repository = createFakeRepository({ vehicle: VEHICLE })

    await freezeTripPlannedRoute({
      companyId: COMPANY_ID,
      geometry: createGeometryPort([1]),
      repository,
      tollBooths: {
        readByNodeIds: async () => [praca(1, '32.80')],
        readCatalogSummary: async () => ({ boothCount: 1, latestObservedOn: '2026-07-01' }),
      },
      tripId: TRIP_ID,
    })

    const [written] = repository.writeCalls
    expect(written?.toll).not.toHaveProperty('tariffObservedOn')
  })

  test('D5: sem geometria disponível, grava rota e pedágio null juntos — nunca zero', async () => {
    const repository = createFakeRepository({ vehicle: VEHICLE })

    await freezeTripPlannedRoute({
      companyId: COMPANY_ID,
      geometry: { readRouteGeometry: async () => null },
      repository,
      tollBooths: {
        readByNodeIds: async () => TRES_PRACAS,
        readCatalogSummary: async () => ({ boothCount: 3, latestObservedOn: '2026-07-01' }),
      },
      tripId: TRIP_ID,
    })

    expect(repository.writeCalls).toHaveLength(1)
    const [written] = repository.writeCalls
    expect(written?.route).toBeNull()
    expect(written?.toll).toBeNull()
  })

  test('viagem com menos de duas paradas também grava null, e regrava sobre o que já existia', async () => {
    const repository = createFakeRepository({
      stops: [STOPS[0] as RouteGeometryPoint],
      vehicle: VEHICLE,
    })

    await freezeTripPlannedRoute({
      companyId: COMPANY_ID,
      geometry: createGeometryPort([1, 2, 3]),
      repository,
      tollBooths: {
        readByNodeIds: async () => TRES_PRACAS,
        readCatalogSummary: async () => ({ boothCount: 3, latestObservedOn: '2026-07-01' }),
      },
      tripId: TRIP_ID,
    })

    expect(repository.writeCalls).toEqual([
      { companyId: COMPANY_ID, route: null, toll: null, tripId: TRIP_ID },
    ])
  })

  test('viagem sumida entre o gate e o congelamento é no-op, sem escrever nada', async () => {
    const repository = createFakeRepository({ vehicle: null })

    await freezeTripPlannedRoute({
      companyId: COMPANY_ID,
      geometry: createGeometryPort([1, 2, 3]),
      repository,
      tollBooths: {
        readByNodeIds: async () => TRES_PRACAS,
        readCatalogSummary: async () => ({ boothCount: 3, latestObservedOn: '2026-07-01' }),
      },
      tripId: TRIP_ID,
    })

    expect(repository.writeCalls).toHaveLength(0)
  })

  test('D3: assinatura que não bate com nenhuma opção cai no critério, e avisa não reproduzida', async () => {
    const repository = createFakeRepository({ vehicle: VEHICLE })
    const unmatchedSignature = 'deadbeefdeadbeefdeadbeefdeadbeef'

    await freezeTripPlannedRoute({
      choice: { criterion: 'cheapest', signature: unmatchedSignature },
      companyId: COMPANY_ID,
      geometry: createGeometryPort([1, 2, 3]),
      repository,
      tollBooths: {
        readByNodeIds: async () => TRES_PRACAS,
        readCatalogSummary: async () => ({ boothCount: 3, latestObservedOn: '2026-07-01' }),
      },
      tripId: TRIP_ID,
    })

    expect(repository.writeCalls).toHaveLength(1)
    const [written] = repository.writeCalls
    expect(written?.route?.choiceReproduced).toBe(false)
    /** A assinatura gravada é a da rota que de fato se congelou, não a que o pedido tentou. */
    expect(written?.route?.signature).not.toBe(unmatchedSignature)
  })
})
