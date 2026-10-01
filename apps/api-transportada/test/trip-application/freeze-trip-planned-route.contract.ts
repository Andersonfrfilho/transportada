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
  type PlannedRouteWriteOutcome,
  type WritePlannedRouteInput,
} from '../../src/trips/application/freeze-trip-planned-route.use-case.js'
import { buildRouteSignature } from '../../src/trips/domain/route-choice.policy.js'
import { freezeTripRouteGracefully } from '../../src/trips/application/freeze-trip-route-gracefully.js'
import type { RouteGeometryPoint } from '../../src/trips/domain/route-geometry.policy.js'
import type { RouteGeometryRoad } from '../../src/trips/application/route-geometry.port.js'
import type { TollBoothRouteRecord } from '../../src/toll-booths/application/toll-booth.port.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000t01'

const STOPS: readonly RouteGeometryPoint[] = [
  { latitude: -21.1775, longitude: -47.8103 },
  { latitude: -21.9967, longitude: -47.4256 },
]

const ESTRADA = STOPS
const TRECHOS = [{ distanceMetres: 89_400, durationSeconds: 4_200 }] as const

/** T704 M3: a revisão da viagem lida no disparo — o compare-and-set da escrita do congelamento. */
const REVISION = '2026-09-17 12:00:00.123456+00'

const VEHICLE: FreezeTripPlannedRouteVehicleContext = {
  axles: { count: 2, source: 'declared' },
  revision: REVISION,
  /** Toco: dois eixos de rodagem dupla, Categoria 2 — multiplicador 2. */
  multiplier: { denominator: 1, numerator: 2 },
  /** Sem consumo/preço declarados — o congelador não sabe comparar custo (H1/`NO_FUEL_BASELINE`). */
  fuelBaseline: { kilometersPerLiter: null, pricePerLiter: null },
  hasAutomaticTollPayment: false,
}

/** O mesmo toco, agora com consumo e preço: o critério `cheapest` passa a ter o que comparar. */
const VEHICLE_WITH_FUEL: FreezeTripPlannedRouteVehicleContext = {
  ...VEHICLE,
  fuelBaseline: { kilometersPerLiter: '3.5000', pricePerLiter: '6.2000' },
}

/** O mesmo veículo, mas com consumo e preço conhecidos — o que faz `cheapest` ter o que comparar. */
const VEHICLE_WITH_FUEL_BASELINE: FreezeTripPlannedRouteVehicleContext = {
  ...VEHICLE,
  fuelBaseline: { kilometersPerLiter: '2.5000', pricePerLiter: '6.0000' },
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

function createFakeRepository(
  input: {
    /** `null` é T704 M4: alguma parada sem coordenada — nada a traçar, nunca um subconjunto. */
    readonly stops?: readonly RouteGeometryPoint[] | null
    readonly vehicle: FreezeTripPlannedRouteVehicleContext | null
  },
  /** T802: o que `writePlannedRoute` devolve — só os testes do descarte passam algo diferente de `'written'`. */
  options: { readonly outcome?: PlannedRouteWriteOutcome } = {},
): FreezeTripPlannedRoutePort & { readonly writeCalls: readonly WritePlannedRouteInput[] } {
  const writeCalls: WritePlannedRouteInput[] = []

  return {
    get writeCalls() {
      return writeCalls
    },
    async readStopCoordinates() {
      return input.stops === undefined ? STOPS : input.stops
    },
    async readVehicleContext() {
      return input.vehicle
    },
    async writePlannedRoute(writeInput) {
      writeCalls.push(writeInput)
      return options.outcome ?? 'written'
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
   * L5 (revisão final da 153): antes o congelado fixava `isNoToll: false` sempre — mesmo quando a
   * opção congelada era mesmo a alternativa sem cancela (RF2). Este contrato prova que a marca
   * viaja da opção selecionada até o que se grava.
   */
  test('L5: congela isNoToll quando a opção escolhida veio da chamada sem pedágio', async () => {
    const repository = createFakeRepository({ vehicle: VEHICLE_WITH_FUEL_BASELINE })
    /** Alternativa sem pedágio, mais barata: 100 km sem praça nenhuma contra 240 km com uma. */
    const principal: RouteGeometryRoad = {
      legs: [{ distanceMetres: 240_000, durationSeconds: 12_000 }],
      nodeIds: [10],
      nodeIdsByLeg: [[10]],
      points: ESTRADA,
    }
    const semPedagio: RouteGeometryRoad = {
      legs: [{ distanceMetres: 100_000, durationSeconds: 6_000 }],
      nodeIds: [99],
      nodeIdsByLeg: [[99]],
      points: ESTRADA,
    }

    await freezeTripPlannedRoute({
      choice: { criterion: 'no_toll', signature: null },
      companyId: COMPANY_ID,
      geometry: {
        readRouteGeometry: async (_points, options) =>
          options?.excludeToll === true ? semPedagio : principal,
      },
      repository,
      tollBooths: {
        readByNodeIds: async (nodeIds) => (nodeIds.includes(10) ? [praca(10, '10.5000')] : []),
        readCatalogSummary: async () => ({ boothCount: 1, latestObservedOn: '2026-07-01' }),
      },
      tripId: TRIP_ID,
    })

    const [written] = repository.writeCalls
    expect(written?.route?.distanceMeters).toBe(100_000)
    expect(written?.route?.isNoToll).toBe(true)
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
      {
        companyId: COMPANY_ID,
        expectedRevision: REVISION,
        route: null,
        toll: null,
        tripId: TRIP_ID,
      },
    ])
  })

  /**
   * T704 M4 (caso extremo da spec): parada sem coordenada é **sem rota**, nunca rota parcial. O
   * subconjunto geocodificado gravaria uma distância menor do que a viagem de verdade, e essa
   * distância alimenta combustível e valoração — erro que não se anuncia.
   */
  test('M4: alguma parada sem coordenada grava rota e pedágio null — nunca o subconjunto', async () => {
    const repository = createFakeRepository({ stops: null, vehicle: VEHICLE })

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
      {
        companyId: COMPANY_ID,
        expectedRevision: REVISION,
        route: null,
        toll: null,
        tripId: TRIP_ID,
      },
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

  /**
   * spec 153 H1: sem `fuelBaseline` nenhuma opção tem `totalCost`, `applyCriterion('cheapest')`
   * não acha candidata, e o congelamento sempre grava a principal com `choiceReproduced: false` —
   * mesmo que ninguém tenha pedido assinatura nenhuma. Este contrato prova as duas pontas: com o
   * consumo/preço do veículo conhecidos, a rota mais barata (a alternativa, sem pedágio e mais
   * curta em custo total) é a que se congela, com `choiceReproduced: true`.
   */
  describe('H1: a mais barata é de fato eleita — nunca sempre a principal', () => {
    /** Principal: 240 km com uma praça de R$ 10,50/eixo — cara e mais longa. */
    const PRINCIPAL: RouteGeometryRoad = {
      legs: [{ distanceMetres: 240_000, durationSeconds: 12_000 }],
      nodeIds: [10],
      nodeIdsByLeg: [[10]],
      points: ESTRADA,
      /** A alternativa do OSRM: 100 km, sem passar por praça nenhuma — mais barata no total. */
      alternatives: [
        {
          legs: [{ distanceMetres: 100_000, durationSeconds: 6_000 }],
          nodeIds: [99],
          nodeIdsByLeg: [[99]],
          points: ESTRADA,
        },
      ],
    }

    function createGeometryPortWithAlternative() {
      return {
        readRouteGeometry: async (_points: unknown, options?: { excludeToll?: boolean }) =>
          options?.excludeToll === true ? null : PRINCIPAL,
      }
    }

    /** Só o nó 10 é praça conhecida — o nó 99 da alternativa não cobra pedágio nenhum. */
    async function readByNodeIds(nodeIds: readonly number[]) {
      return nodeIds.includes(10) ? [praca(10, '10.5000')] : []
    }

    test('com fuelBaseline conhecido, congela a alternativa mais barata — não a principal', async () => {
      const repository = createFakeRepository({ vehicle: VEHICLE_WITH_FUEL_BASELINE })

      await freezeTripPlannedRoute({
        companyId: COMPANY_ID,
        geometry: createGeometryPortWithAlternative(),
        repository,
        tollBooths: {
          readByNodeIds,
          readCatalogSummary: async () => ({ boothCount: 1, latestObservedOn: '2026-07-01' }),
        },
        tripId: TRIP_ID,
      })

      expect(repository.writeCalls).toHaveLength(1)
      const [written] = repository.writeCalls
      /**
       * Principal: 240 km ÷ 2,5 km/l × 6,00 = 576,00 + pedágio 21,00 (10,50 × 2 eixos) = 597,00.
       * Alternativa: 100 km ÷ 2,5 km/l × 6,00 = 240,00 + pedágio 0 = 240,00 — a mais barata.
       */
      expect(written?.route?.distanceMeters).toBe(100_000)
      expect(written?.route?.choiceReproduced).toBe(true)
      expect(written?.toll?.total).toBe('0.0000')
    })

    /**
     * ⚠️ Sem `fuelBaseline` (o comportamento anterior a esta correção) o defeito reaparece: a
     * eleição não acha candidata e cai na principal, com o aviso falso de "não reproduzida" — o
     * mesmo aviso que aparecia quase sempre em produção. Este teste documenta o antes, para a
     * regressão não voltar sem ninguém perceber.
     */
    test('sem fuelBaseline, cai na principal com choiceReproduced: false — o defeito documentado', async () => {
      const repository = createFakeRepository({ vehicle: VEHICLE })

      await freezeTripPlannedRoute({
        companyId: COMPANY_ID,
        geometry: createGeometryPortWithAlternative(),
        repository,
        tollBooths: {
          readByNodeIds,
          readCatalogSummary: async () => ({ boothCount: 1, latestObservedOn: '2026-07-01' }),
        },
        tripId: TRIP_ID,
      })

      const [written] = repository.writeCalls
      expect(written?.route?.distanceMeters).toBe(240_000)
      expect(written?.route?.choiceReproduced).toBe(false)
    })
  })

  /**
   * Spec 153 T802 (N3): o UPDATE afetar zero linhas parava aqui, mudo. `freezeTripPlannedRoute`
   * trata qualquer descarte do compare-and-set (revisão obsoleta, viagem fora da janela) como
   * `routeFrozen: false` — o mesmo sinal de D5 (OSRM fora do ar) — em vez de lançar: quem bloqueia
   * a transição (`plan-trip-route.use-case.ts`) já sabe avisar antes de recusar, e o fallback
   * gracioso (`freezeTripRouteGracefully`, T704 L7) segue adiante sem exceção para capturar.
   * Estes contratos provam a cadeia inteira sem precisar de Postgres: o repositório é dublê, e é
   * ele quem decide o `outcome`.
   */
  describe('T802: o descarte do compare-and-set vira routeFrozen: false, nunca falha visível', () => {
    test('revisão obsoleta não escreve rota nova e devolve routeFrozen: false', async () => {
      const repository = createFakeRepository({ vehicle: VEHICLE }, { outcome: 'stale_revision' })

      const result = await freezeTripPlannedRoute({
        companyId: COMPANY_ID,
        geometry: createGeometryPort([10, 1, 2, 3]),
        repository,
        tollBooths: {
          readByNodeIds: async () => TRES_PRACAS,
          readCatalogSummary: async () => ({ boothCount: 1, latestObservedOn: '2026-07-01' }),
        },
        tripId: TRIP_ID,
      })

      expect(result).toEqual({ routeFrozen: false })
    })

    test('viagem fora da janela não escreve rota nova e devolve routeFrozen: false', async () => {
      const repository = createFakeRepository(
        { vehicle: VEHICLE },
        { outcome: 'status_not_before_dispatch' },
      )

      const result = await freezeTripPlannedRoute({
        companyId: COMPANY_ID,
        geometry: createGeometryPort([10, 1, 2, 3]),
        repository,
        tollBooths: {
          readByNodeIds: async () => TRES_PRACAS,
          readCatalogSummary: async () => ({ boothCount: 1, latestObservedOn: '2026-07-01' }),
        },
        tripId: TRIP_ID,
      })

      expect(result).toEqual({ routeFrozen: false })
    })

    test('o descarte não derruba quem chama pelo caminho gracioso (T704 L7)', async () => {
      const repository = createFakeRepository({ vehicle: VEHICLE }, { outcome: 'stale_revision' })

      await expect(
        freezeTripRouteGracefully({
          companyId: COMPANY_ID,
          freezer: {
            freeze: (input) =>
              freezeTripPlannedRoute({
                ...input,
                geometry: createGeometryPort([10, 1, 2, 3]),
                repository,
                tollBooths: {
                  readByNodeIds: async () => TRES_PRACAS,
                  readCatalogSummary: async () => ({
                    boothCount: 1,
                    latestObservedOn: '2026-07-01',
                  }),
                },
              }),
          },
          tripId: TRIP_ID,
        }),
      ).resolves.toBeUndefined()
    })
  })
})
