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
import { buildRouteSignature } from '../../src/trips/domain/route-choice.policy.js'
import type { RouteGeometryPoint } from '../../src/trips/domain/route-geometry.policy.js'
import type { TollBoothRouteRecord } from '../../src/toll-booths/application/toll-booth.port.js'
import { NO_FUEL_BASELINE } from '../../src/toll-booths/domain/route-option.policy.js'

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
  /** Sem consumo nem preço: nenhuma opção tem custo, e o `cheapest` não acha candidata. */
  fuelBaseline: NO_FUEL_BASELINE,
  /** Toco: dois eixos de rodagem dupla, Categoria 2 — multiplicador 2. */
  multiplier: { denominator: 1, numerator: 2 },
  hasAutomaticTollPayment: false,
}

/** O mesmo toco, agora com consumo e preço: o critério `cheapest` passa a ter o que comparar. */
const VEHICLE_WITH_FUEL: FreezeTripPlannedRouteVehicleContext = {
  ...VEHICLE,
  fuelBaseline: { kilometersPerLiter: '3.5000', pricePerLiter: '6.2000' },
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

const PRINCIPAL_NODES = [[10, 1, 2, 3]] as const
const ALTERNATIVE_NODES = [[20, 21]] as const
const ALTERNATIVE_LEGS = [{ distanceMetres: 95_000, durationSeconds: 4_800 }] as const

/**
 * Ribeirão Preto → Campinas ao contrário (spec 096): a principal passa pelas três praças e roda
 * 89,4 km (R$ 158,37 de diesel + R$ 65,60 de pedágio), a alternativa roda 95 km sem praça nenhuma
 * (R$ 168,29). A mais barata é a **alternativa**, e só o combustível permite saber disso.
 */
function createGeometryPortWithAlternative() {
  return {
    readRouteGeometry: async (
      _points: readonly RouteGeometryPoint[],
      options?: Readonly<{ excludeToll?: boolean }>,
    ) =>
      options?.excludeToll === true
        ? null
        : ({
            alternatives: [
              {
                legs: ALTERNATIVE_LEGS,
                nodeIds: ALTERNATIVE_NODES[0],
                nodeIdsByLeg: ALTERNATIVE_NODES,
                points: ESTRADA,
              },
            ],
            legs: TRECHOS,
            nodeIds: PRINCIPAL_NODES[0],
            nodeIdsByLeg: PRINCIPAL_NODES,
            points: ESTRADA,
          } as const),
  }
}

/** Só as praças que a opção de fato cruza — a alternativa não passa por nenhuma. */
const TOLL_BOOTHS_BY_NODE = {
  readByNodeIds: async (nodeIds: readonly number[]) =>
    TRES_PRACAS.filter((booth) => nodeIds.includes(booth.osmNodeId)),
  readCatalogSummary: async () => ({ boothCount: 3, latestObservedOn: '2026-07-01' }),
}

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

    const result = await freezeTripPlannedRoute({
      companyId: COMPANY_ID,
      geometry: createGeometryPort([1, 2, 3]),
      repository,
      tollBooths: {
        readByNodeIds: async () => TRES_PRACAS,
        readCatalogSummary: async () => ({ boothCount: 3, latestObservedOn: '2026-07-01' }),
      },
      tripId: TRIP_ID,
    })

    expect(result).toEqual({ routeFrozen: true })
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

  /**
   * ⚠️ O defeito medido na bancada (viagem `route_planned` com `planned_route`/`planned_toll`
   * nulos): o roteirizador indisponível não lança, grava `null` de propósito — e quem chama
   * `freezeTripPlannedRoute` precisa de `routeFrozen: false` para saber que não há roteiro
   * nenhum para sustentar a transição, já que o `catch` nunca dispara aqui.
   */
  test('D5: sem geometria disponível, grava rota e pedágio null juntos — nunca zero — e avisa que não congelou', async () => {
    const repository = createFakeRepository({ vehicle: VEHICLE })

    const result = await freezeTripPlannedRoute({
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
    expect(result).toEqual({ routeFrozen: false })
  })

  test('viagem com menos de duas paradas também grava null, e regrava sobre o que já existia', async () => {
    const repository = createFakeRepository({
      stops: [STOPS[0] as RouteGeometryPoint],
      vehicle: VEHICLE,
    })

    const result = await freezeTripPlannedRoute({
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
    expect(result).toEqual({ routeFrozen: false })
  })

  test('viagem sumida entre o gate e o congelamento é no-op, sem escrever nada, e avisa que não congelou', async () => {
    const repository = createFakeRepository({ vehicle: null })

    const result = await freezeTripPlannedRoute({
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
    expect(result).toEqual({ routeFrozen: false })
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

  test('com consumo e preço, o critério padrão congela a mais barata — pedágio + combustível', async () => {
    const repository = createFakeRepository({ vehicle: VEHICLE_WITH_FUEL })

    await freezeTripPlannedRoute({
      companyId: COMPANY_ID,
      geometry: createGeometryPortWithAlternative(),
      repository,
      tollBooths: TOLL_BOOTHS_BY_NODE,
      tripId: TRIP_ID,
    })

    const [written] = repository.writeCalls
    expect(written?.route?.criterion).toBe('cheapest')
    expect(written?.route?.choiceReproduced).toBe(true)
    expect(written?.route?.distanceMeters).toBe(95_000)
    expect(written?.route?.signature).toBe(buildRouteSignature({ nodeIdsByLeg: ALTERNATIVE_NODES }))
    /** O pedágio congelado é o da rota que se congelou — a alternativa não cruza praça. */
    expect(written?.toll?.total).toBe('0.0000')
  })

  test('a escolha declarada por assinatura é reproduzida — congela a rota que o operador viu', async () => {
    const repository = createFakeRepository({ vehicle: VEHICLE_WITH_FUEL })
    const principalSignature = buildRouteSignature({ nodeIdsByLeg: PRINCIPAL_NODES })

    await freezeTripPlannedRoute({
      choice: { criterion: 'alternative', signature: principalSignature },
      companyId: COMPANY_ID,
      geometry: createGeometryPortWithAlternative(),
      repository,
      tollBooths: TOLL_BOOTHS_BY_NODE,
      tripId: TRIP_ID,
    })

    const [written] = repository.writeCalls
    expect(written?.route?.choiceReproduced).toBe(true)
    expect(written?.route?.signature).toBe(principalSignature)
    expect(written?.route?.distanceMeters).toBe(89_400)
  })

  test('sem consumo ou preço, o cheapest não acha candidata: cai na principal e avisa não reproduzida', async () => {
    const repository = createFakeRepository({ vehicle: VEHICLE })

    await freezeTripPlannedRoute({
      companyId: COMPANY_ID,
      geometry: createGeometryPortWithAlternative(),
      repository,
      tollBooths: TOLL_BOOTHS_BY_NODE,
      tripId: TRIP_ID,
    })

    const [written] = repository.writeCalls
    expect(written?.route?.choiceReproduced).toBe(false)
    expect(written?.route?.distanceMeters).toBe(89_400)
    expect(written?.route?.signature).toBe(buildRouteSignature({ nodeIdsByLeg: PRINCIPAL_NODES }))
  })
})
