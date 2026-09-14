/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { readSuggestionValuation } from '../../src/routing/application/read-suggestion-valuation.use-case.js'
import type { MultiVehicleSuggestionRoad } from '../../src/routing/application/multi-vehicle-suggestion.repository.js'
import type { SuggestionValuationPort } from '../../src/routing/application/suggestion-valuation.port.js'
import type { RouteSuggestionStatus } from '../../src/database/route-suggestion.schema.js'
import {
  buildValuationFromContext,
  type TripValuationContext,
} from '../../src/trips/application/read-trip-valuation.use-case.js'
import type { TripValuation } from '../../src/trips/domain/trip-valuation.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000901'
const SUGGESTION_ID = '00000000-0000-4000-8000-000000000902'
const VEHICLE_A = '00000000-0000-4000-8000-0000000000a1'
const VEHICLE_B = '00000000-0000-4000-8000-0000000000a2'
const DOCUMENT_A = '00000000-0000-4000-8000-0000000000d1'
const DOCUMENT_B = '00000000-0000-4000-8000-0000000000d2'

function context(overrides: Partial<TripValuationContext> = {}): TripValuationContext {
  return {
    distanceMeters: null,
    documents: [],
    fuelPricePerLiter: '6.0000',
    vehicle: { kilometersPerLiter: '4.0000', otherCostsPerKilometer: '0.3000' },
    ...overrides,
  }
}

type Recorded = { readonly distanceMeters: null | number; readonly vehicleId: string }

/** A perna de uma parada, sem tempo parado — o formato dos casos de distância. */
function leg(
  distanceFromPreviousMeters: null | number,
  durationFromPreviousSeconds: null | number,
) {
  return { distanceFromPreviousMeters, durationFromPreviousSeconds, serviceTimeSeconds: 0 }
}

function road(input: {
  readonly endPolicy?: string
  readonly returnDistanceMeters?: null | number
  readonly returnDurationSeconds?: null | number
  readonly stops: MultiVehicleSuggestionRoad['stops']
  readonly vehicleId: string
}): MultiVehicleSuggestionRoad {
  return {
    endPolicy: input.endPolicy ?? 'last_stop',
    returnDistanceMeters:
      input.returnDistanceMeters === undefined
        ? input.returnDurationSeconds === undefined
          ? null
          : 1_000
        : input.returnDistanceMeters,
    returnDurationSeconds: input.returnDurationSeconds ?? null,
    stops: input.stops,
    vehicleId: input.vehicleId,
  }
}

function port(
  overrides: {
    readonly groups?: readonly {
      documentIds: readonly string[]
      documentIdsByAddressKey: ReadonlyMap<string, readonly string[]>
      driverId: null | string
      estimatedArrivalByAddressKey: ReadonlyMap<string, string>
      orderedAddressKeys: readonly string[]
      vehicleId: string
    }[]
    readonly roads?: readonly MultiVehicleSuggestionRoad[]
    readonly status?: RouteSuggestionStatus
  } = {},
) {
  const contexts: Recorded[] = []
  const port: SuggestionValuationPort = {
    readGroups: async () =>
      overrides.groups ?? [
        {
          documentIds: [DOCUMENT_A],
          documentIdsByAddressKey: new Map(),
          driverId: null,
          estimatedArrivalByAddressKey: new Map(),
          orderedAddressKeys: [],
          vehicleId: VEHICLE_A,
        },
      ],
    readPreviewContext: async (input) => {
      contexts.push({ distanceMeters: null, vehicleId: input.vehicleId })
      return context()
    },
    readSuggestionStatus: async () => overrides.status ?? 'ready',
    readVehicleRoads: async () =>
      overrides.roads ?? [
        road({ stops: [leg(null, null), leg(50_000, 1_800)], vehicleId: VEHICLE_A }),
      ],
    resolveValuation: async (input) => {
      contexts.push({ distanceMeters: input.context.distanceMeters, vehicleId: 'resolved' })
      return {
        costParcels: [],
        hasGaps: false,
        marginPercentage: null,
        revenueLines: [],
        revenueSource: 'estimated',
        totalCost: '10.0000',
        totalMargin: '90.0000',
        totalRevenue: '100.0000',
      }
    },
  }

  return { contexts, port }
}

describe('readSuggestionValuation (spec 101)', () => {
  /**
   * ⚠️ **A guarda executável da D1.** A porta não expõe geometria nenhuma — se alguém acrescentar
   * uma chamada ao roteirizador neste caminho, ela terá de aparecer aqui, e este teste é o lugar
   * onde a decisão se defende. A distância tem de ser exatamente a soma das paradas da sugestão.
   */
  it('a distância injetada é a soma das paradas da sugestão, não uma rota nova', async () => {
    const { contexts, port: repository } = port()

    await readSuggestionValuation({
      companyId: COMPANY_ID,
      repository,
      suggestionId: SUGGESTION_ID,
    })

    const resolved = contexts.filter((entry) => entry.vehicleId === 'resolved')
    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.distanceMeters).toBe(50_000)
  })

  it('devolve uma entrada por veículo, com as notas dele', async () => {
    const { port: repository } = port({
      groups: [
        {
          documentIds: [DOCUMENT_A],
          documentIdsByAddressKey: new Map(),
          driverId: null,
          estimatedArrivalByAddressKey: new Map(),
          orderedAddressKeys: [],
          vehicleId: VEHICLE_A,
        },
        {
          documentIds: [DOCUMENT_B, DOCUMENT_A],
          documentIdsByAddressKey: new Map(),
          driverId: null,
          estimatedArrivalByAddressKey: new Map(),
          orderedAddressKeys: [],
          vehicleId: VEHICLE_B,
        },
      ],
      roads: [
        road({ stops: [leg(10_000, 600)], vehicleId: VEHICLE_A }),
        road({ stops: [leg(20_000, 1_200)], vehicleId: VEHICLE_B }),
      ],
    })

    const result = await readSuggestionValuation({
      companyId: COMPANY_ID,
      repository,
      suggestionId: SUGGESTION_ID,
    })

    expect(result.vehicles).toHaveLength(2)
    expect(result.vehicles[0]?.vehicleId).toBe(VEHICLE_A)
    expect(result.vehicles[0]?.documentCount).toBe(1)
    expect(result.vehicles[1]?.documentCount).toBe(2)
    expect(result.report.totalDistanceMeters).toBe(30_000)
  })

  /**
   * Sugestão que ainda roda não tem parada, e responder lista vazia seria indistinguível de "o
   * solver não distribuiu nada". `409` diz qual das duas coisas é.
   */
  it('sugestão que não está pronta é recusada, não devolve conjunto vazio', async () => {
    const { port: repository } = port({ status: 'queued' })

    await expect(
      readSuggestionValuation({ companyId: COMPANY_ID, repository, suggestionId: SUGGESTION_ID }),
    ).rejects.toThrow()
  })

  /** Sugestão de outra empresa é ausência, nunca 403 — o id não é adivinhável. */
  it('sugestão inexistente para a empresa é recusada', async () => {
    const { port: repository } = port()

    await expect(
      readSuggestionValuation({
        companyId: COMPANY_ID,
        repository: { ...repository, readSuggestionStatus: async () => null },
        suggestionId: SUGGESTION_ID,
      }),
    ).rejects.toThrow()
  })

  /**
   * ⚠️ Veículo com paradas e **sem** perna conhecida entra com distância `null`, e o relatório
   * marca o conjunto como incompleto — nunca soma zero, que faria a margem parecer melhor.
   */
  it('veículo sem perna conhecida contamina o conjunto', async () => {
    const { port: repository } = port({
      roads: [road({ stops: [leg(null, null)], vehicleId: VEHICLE_A })],
    })

    const result = await readSuggestionValuation({
      companyId: COMPANY_ID,
      repository,
      suggestionId: SUGGESTION_ID,
    })

    expect(result.vehicles[0]?.distanceMeters).toBe(null)
    expect(result.report.hasGaps).toBe(true)
  })

  /**
   * Decisão do usuário (2026-09-13): o tempo servido é a viagem inteira — ida + volta + parado —, e
   * é o mesmo número que o cartão, o detalhe e o mapa imprimem. 24 entregas × 20 min = 8 h.
   */
  it('o tempo do veículo é ida + volta + parado de todas as entregas', async () => {
    const deliveries = Array.from({ length: 24 }, (_entry, index) => ({
      ...leg(index === 0 ? 60_000 : 8_000, index === 0 ? 6_880 : 400),
      serviceTimeSeconds: 1_200,
    }))
    const { port: repository } = port({
      roads: [
        road({
          endPolicy: 'depot',
          returnDurationSeconds: 3_720,
          stops: deliveries,
          vehicleId: VEHICLE_A,
        }),
      ],
    })

    const result = await readSuggestionValuation({
      companyId: COMPANY_ID,
      repository,
      suggestionId: SUGGESTION_ID,
    })

    expect(result.vehicles[0]?.durationSeconds).toBe(48_600)
    expect(result.vehicles[0]?.durationParts).toEqual({
      drivingSeconds: 16_080,
      returnSeconds: 3_720,
      returnStatus: 'included',
      serviceSeconds: 28_800,
    })
    expect(result.report.totalDurationSeconds).toBe(48_600)
  })

  /** Sugestão antiga: a política mandava voltar e a perna não foi gravada — a volta é desconhecida. */
  it('volta esperada sem perna gravada sai marcada como desconhecida', async () => {
    const { port: repository } = port({
      roads: [road({ endPolicy: 'depot', stops: [leg(10_000, 600)], vehicleId: VEHICLE_A })],
    })

    const result = await readSuggestionValuation({
      companyId: COMPANY_ID,
      repository,
      suggestionId: SUGGESTION_ID,
    })

    expect(result.vehicles[0]?.durationParts.returnStatus).toBe('unknown')
    expect(result.vehicles[0]?.durationSeconds).toBe(600)
  })
})

/**
 * Decisão do usuário (2026-09-13, segunda parte): a volta ao barracão entra na **distância**, e
 * por ela no combustível, no R$/km e no lucro — pela conta única (`buildValuationFromContext`),
 * nunca por uma segunda soma. A viagem de 24 entregas: ida 244 km, volta 70 km; diesel R$ 6,00,
 * 4 km/l, outros R$ 0,30/km.
 */
describe('readSuggestionValuation — a volta no custo (decisão 2026-09-13)', () => {
  const VALUATION_REPOSITORY = {
    findApplicableRule: async () => null,
    readContext: async () => null,
  }
  const deliveries = Array.from({ length: 24 }, (_entry, index) => ({
    ...leg(index === 0 ? 60_000 : 8_000, index === 0 ? 6_880 : 400),
    serviceTimeSeconds: 1_200,
  }))

  async function valuate(returnDistanceMeters: null | number) {
    const { port: base } = port({
      roads: [
        road({
          endPolicy: 'depot',
          returnDistanceMeters,
          returnDurationSeconds: returnDistanceMeters === null ? null : 3_720,
          stops: deliveries,
          vehicleId: VEHICLE_A,
        }),
      ],
    })
    const result = await readSuggestionValuation({
      companyId: COMPANY_ID,
      repository: {
        ...base,
        resolveValuation: async (input) =>
          buildValuationFromContext({
            companyId: COMPANY_ID,
            context: input.context,
            repository: VALUATION_REPOSITORY,
          }),
      },
      suggestionId: SUGGESTION_ID,
    })
    const vehicle = result.vehicles[0]
    if (vehicle === undefined) throw new Error('veículo ausente')
    return { report: result.report, vehicle }
  }

  const fuelOf = (vehicle: { readonly valuation: TripValuation }) =>
    vehicle.valuation.costParcels.find((parcel) => parcel.kind === 'fuel')?.amount

  it('com a volta gravada, distância, combustível e lucro contam ida + volta', async () => {
    const { report, vehicle } = await valuate(70_000)

    expect(vehicle.distanceMeters).toBe(314_000)
    expect(vehicle.distanceParts).toEqual({
      outboundMeters: 244_000,
      returnMeters: 70_000,
      returnStatus: 'included',
    })
    /** 314 km ÷ 4 km/l × R$ 6,00 = R$ 471,00. */
    expect(fuelOf(vehicle)).toBe('471.0000')
    /** Combustível R$ 471,00 + outros 314 km × R$ 0,30 = R$ 94,20. */
    expect(vehicle.valuation.totalCost).toBe('565.2000')
    expect(report.totalDistanceMeters).toBe(314_000)
  })

  it('o lucro cai exatamente o custo da volta (70 km: R$ 105,00 + R$ 21,00)', async () => {
    const withReturn = await valuate(70_000)
    const withoutReturn = await valuate(null)

    expect(withoutReturn.vehicle.valuation.totalMargin).toBe('-439.2000')
    expect(withReturn.vehicle.valuation.totalMargin).toBe('-565.2000')
  })

  /** Sugestão antiga: não inventa volta — só a ida, e a volta marcada como desconhecida. */
  it('sem a volta gravada, a conta usa só a ida e diz que a volta é desconhecida', async () => {
    const { vehicle } = await valuate(null)

    expect(vehicle.distanceMeters).toBe(244_000)
    expect(vehicle.distanceParts.returnStatus).toBe('unknown')
    /** 244 km ÷ 4 km/l × R$ 6,00 = R$ 366,00. */
    expect(fuelOf(vehicle)).toBe('366.0000')
  })
})
