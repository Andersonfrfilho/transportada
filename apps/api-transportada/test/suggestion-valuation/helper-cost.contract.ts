/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 149 T7: a mesma parcela `helper` (D7) na conta da proposta multi-veículo — reusando
 * `buildTripHelperCost` pelo seam único (`buildValuationFromContext`, dentro de `resolveValuation`),
 * sem uma segunda conta escrita para a sugestão.
 */
import { describe, expect, it } from 'bun:test'

import { readSuggestionValuation } from '../../src/routing/application/read-suggestion-valuation.use-case.js'
import type { MultiVehicleSuggestionGroup } from '../../src/routing/application/multi-vehicle-suggestion.repository.js'
import type { SuggestionValuationPort } from '../../src/routing/application/suggestion-valuation.port.js'
import {
  buildValuationFromContext,
  type TripValuationContext,
} from '../../src/trips/application/read-trip-valuation.use-case.js'
import { buildTripHelperCost } from '../../src/trips/domain/trip-helper-cost.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000901'
const SUGGESTION_ID = '00000000-0000-4000-8000-000000000902'
const VEHICLE_A = '00000000-0000-4000-8000-0000000000a1'
const HELPER_A = '00000000-0000-4000-8000-0000000000h1'
const HELPER_B = '00000000-0000-4000-8000-0000000000h2'
const HOUR = 3_600

function leg(
  distanceFromPreviousMeters: null | number,
  durationFromPreviousSeconds: null | number,
) {
  return { distanceFromPreviousMeters, durationFromPreviousSeconds, serviceTimeSeconds: 0 }
}

function group(overrides: Partial<MultiVehicleSuggestionGroup> = {}): MultiVehicleSuggestionGroup {
  return {
    documentIds: [],
    documentIdsByAddressKey: new Map(),
    driverId: null,
    estimatedArrivalByAddressKey: new Map(),
    orderedAddressKeys: [],
    vehicleId: VEHICLE_A,
    ...overrides,
  }
}

const VALUATION_REPOSITORY = {
  findApplicableRule: async () => null,
  readContext: async () => null,
}

function port(input: {
  readonly groups: readonly MultiVehicleSuggestionGroup[]
  readonly helperCompanyDailyRate?: null | string
  readonly ownDailyRateByDriverId?: ReadonlyMap<string, null | string>
  readonly returnDurationSeconds?: null | number
  readonly stops: readonly ReturnType<typeof leg>[]
}): { calls: { readonly readHelperOwnDailyRates: number }; port: SuggestionValuationPort } {
  const calls = { readHelperOwnDailyRates: 0 }

  const repository: SuggestionValuationPort = {
    readGroups: async () => input.groups,
    readHelperCompanyDailyRate: async () => input.helperCompanyDailyRate ?? null,
    readHelperOwnDailyRates: async () => {
      calls.readHelperOwnDailyRates += 1
      return input.ownDailyRateByDriverId ?? new Map()
    },
    readPreviewContext: async () =>
      ({
        distanceMeters: null,
        documents: [],
        fuelPricePerLiter: '6.0000',
        vehicle: { kilometersPerLiter: '4.0000', otherCostsPerKilometer: '0.3000' },
      }) satisfies TripValuationContext,
    readSuggestionStatus: async () => 'ready',
    readVehicleRoads: async () => [
      {
        endPolicy: 'depot',
        returnDistanceMeters: input.returnDurationSeconds === undefined ? null : 1_000,
        returnDurationSeconds: input.returnDurationSeconds ?? null,
        stops: input.stops,
        vehicleId: VEHICLE_A,
      },
    ],
    resolveValuation: async (resolveInput) =>
      buildValuationFromContext({
        companyId: COMPANY_ID,
        context: resolveInput.context,
        repository: VALUATION_REPOSITORY,
      }),
  }

  return { calls, port: repository }
}

function helperParcelOf(vehicle: {
  readonly valuation: { readonly costParcels: readonly unknown[] }
}) {
  return vehicle.valuation.costParcels.find(
    (
      parcel,
    ): parcel is {
      readonly amount: string
      readonly gap: null | string
      readonly source: string
    } =>
      typeof parcel === 'object' && parcel !== null && 'kind' in parcel && parcel.kind === 'helper',
  )
}

describe('a diária do ajudante na proposta (spec 149 T7)', () => {
  /** Critério 4, na proposta: mesma conta que a viagem (T6) — R$ 150 própria + R$ 120 geral × 2 dias. */
  it('2 ajudantes (150 própria / 120 geral), jornada de 30h com volta = 540.00 no veículo e no total', async () => {
    const { port: repository } = port({
      groups: [group({ helperIds: [HELPER_A, HELPER_B] })],
      helperCompanyDailyRate: '120.0000',
      ownDailyRateByDriverId: new Map([
        [HELPER_A, '150.0000'],
        [HELPER_B, null],
      ]),
      returnDurationSeconds: 1_800,
      stops: [leg(50_000, (30 * HOUR - 1_800) as number)],
    })

    const result = await readSuggestionValuation({
      companyId: COMPANY_ID,
      repository,
      suggestionId: SUGGESTION_ID,
    })

    const vehicle = result.vehicles[0]
    if (vehicle === undefined) throw new Error('veículo ausente')
    const helper = helperParcelOf(vehicle)

    expect(helper?.amount).toBe('540.0000')
    expect(helper?.gap).toBeNull()
    /** O relatório do conjunto soma a parcela junto das outras (não fica de fora do total). */
    expect(Number(result.report.totalCost)).toBeGreaterThanOrEqual(540)
  })

  it('volta desconhecida: estimated com HELPER_JOURNEY_WITHOUT_RETURN, não lacuna', async () => {
    const { port: repository } = port({
      groups: [group({ helperIds: [HELPER_A] })],
      helperCompanyDailyRate: '120.0000',
      ownDailyRateByDriverId: new Map([[HELPER_A, null]]),
      stops: [leg(10_000, 10 * HOUR)],
    })

    const result = await readSuggestionValuation({
      companyId: COMPANY_ID,
      repository,
      suggestionId: SUGGESTION_ID,
    })

    const vehicle = result.vehicles[0]
    if (vehicle === undefined) throw new Error('veículo ausente')
    const helper = helperParcelOf(vehicle)

    expect(helper?.source).toBe('estimated')
    expect(helper?.gap).toBe('HELPER_JOURNEY_WITHOUT_RETURN')
    expect(helper?.amount).toBe('120.0000')
  })

  it('ajudante sem diária própria e sem geral: missing com HELPER_DAILY_RATE_MISSING', async () => {
    const { port: repository } = port({
      groups: [group({ helperIds: [HELPER_A] })],
      helperCompanyDailyRate: null,
      ownDailyRateByDriverId: new Map([[HELPER_A, null]]),
      returnDurationSeconds: 600,
      stops: [leg(10_000, 600)],
    })

    const result = await readSuggestionValuation({
      companyId: COMPANY_ID,
      repository,
      suggestionId: SUGGESTION_ID,
    })

    const vehicle = result.vehicles[0]
    if (vehicle === undefined) throw new Error('veículo ausente')
    const helper = helperParcelOf(vehicle)

    expect(helper?.source).toBe('missing')
    expect(helper?.gap).toBe('HELPER_DAILY_RATE_MISSING')
    expect(helper?.amount).toBe('0.0000')
  })

  it('veículo sem ajudante: parcela zero, sem lacuna', async () => {
    const { port: repository } = port({
      groups: [group({ helperIds: [] })],
      returnDurationSeconds: 600,
      stops: [leg(10_000, 600)],
    })

    const result = await readSuggestionValuation({
      companyId: COMPANY_ID,
      repository,
      suggestionId: SUGGESTION_ID,
    })

    const vehicle = result.vehicles[0]
    if (vehicle === undefined) throw new Error('veículo ausente')
    const helper = helperParcelOf(vehicle)

    expect(helper?.amount).toBe('0.0000')
    expect(helper?.gap).toBeNull()
  })

  /**
   * ⚠️ Sem N+1: a diária própria dos ajudantes é lida **uma vez para a sugestão inteira**, nunca uma
   * vez por veículo — a proposta com três veículos não pode disparar três consultas.
   */
  it('a diária própria é lida uma vez para toda a sugestão, não por veículo', async () => {
    const VEHICLE_B = '00000000-0000-4000-8000-0000000000a2'
    const { calls, port: base } = port({
      groups: [group({ helperIds: [HELPER_A] })],
      ownDailyRateByDriverId: new Map([[HELPER_A, '100.0000']]),
      returnDurationSeconds: 600,
      stops: [leg(10_000, 600)],
    })
    const repository: SuggestionValuationPort = {
      ...base,
      readGroups: async () => [
        group({ helperIds: [HELPER_A], vehicleId: VEHICLE_A }),
        group({ helperIds: [HELPER_A], vehicleId: VEHICLE_B }),
      ],
      readVehicleRoads: async () => [
        {
          endPolicy: 'depot',
          returnDistanceMeters: 1_000,
          returnDurationSeconds: 600,
          stops: [leg(10_000, 600)],
          vehicleId: VEHICLE_A,
        },
        {
          endPolicy: 'depot',
          returnDistanceMeters: 1_000,
          returnDurationSeconds: 600,
          stops: [leg(10_000, 600)],
          vehicleId: VEHICLE_B,
        },
      ],
    }

    await readSuggestionValuation({
      companyId: COMPANY_ID,
      repository,
      suggestionId: SUGGESTION_ID,
    })

    expect(calls.readHelperOwnDailyRates).toBe(1)
  })

  /**
   * Contrato de paridade (D7): a mesma entrada (diárias, tripulação e jornada) produz o mesmo valor
   * na viagem (T6, `buildTripHelperCost` direto) e na proposta (T7, pelo mesmo seam via a sugestão) —
   * uma segunda implementação nunca diverge calada.
   */
  it('paridade: a mesma entrada na viagem e na proposta dá o mesmo valor', async () => {
    const directParcel = buildTripHelperCost({
      companyDailyRate: '120.0000',
      helpers: [
        { driverId: HELPER_A, ownDailyRate: '150.0000' },
        { driverId: HELPER_B, ownDailyRate: null },
      ],
      journeyIncludesReturn: true,
      journeySeconds: 30 * HOUR,
    })

    const { port: repository } = port({
      groups: [group({ helperIds: [HELPER_A, HELPER_B] })],
      helperCompanyDailyRate: '120.0000',
      ownDailyRateByDriverId: new Map([
        [HELPER_A, '150.0000'],
        [HELPER_B, null],
      ]),
      returnDurationSeconds: 1_800,
      stops: [leg(50_000, 30 * HOUR - 1_800)],
    })

    const result = await readSuggestionValuation({
      companyId: COMPANY_ID,
      repository,
      suggestionId: SUGGESTION_ID,
    })

    const vehicle = result.vehicles[0]
    if (vehicle === undefined) throw new Error('veículo ausente')
    const helper = helperParcelOf(vehicle)

    expect(helper?.amount).toBe(directParcel.amount)
    expect(helper?.gap).toBe(directParcel.gap)
    expect(helper?.source).toBe(directParcel.source)
  })
})
