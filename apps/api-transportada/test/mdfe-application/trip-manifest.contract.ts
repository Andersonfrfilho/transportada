/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { MdfeCandidateDocument } from '../../src/mdfe-manifests/domain/mdfe-manifest-eligibility.policy.js'
import type { TripStatus } from '../../src/database/trip.schema.js'
import type { TripFiscalReadinessSnapshot } from '../../src/trips/application/read-trip-fiscal-readiness.use-case.js'
import {
  createTripMdfeManifestUseCase,
  type CreateTripMdfeManifestFields,
  type TripLookupPort,
  type TripReadinessLookupPort,
} from '../../src/mdfe-manifests/application/create-trip-mdfe-manifest.use-case.js'
import { createMdfeManifestsUseCase } from '../../src/mdfe-manifests/application/mdfe-manifests.use-case.js'
import type {
  CreateMdfeManifestRecord,
  MdfeManifestDetail,
  MdfeManifestDriver,
  MdfeManifestRepositoryPort,
  MdfeManifestVehicle,
} from '../../src/mdfe-manifests/application/mdfe-manifest.port.js'
import type { ApiError } from '../../src/shared/api.error.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const VEHICLE_ID = '44444444-4444-4444-8444-444444444441'
const FIRST_DRIVER_ID = '44444444-4444-4444-8444-444444444442'
const SECOND_DRIVER_ID = '44444444-4444-4444-8444-444444444443'
const MANIFEST_ID = '44444444-4444-4444-8444-444444444444'
const TRIP_ID = '44444444-4444-4444-8444-444444444445'
const CTE_DOCUMENT_ID = '44444444-4444-4444-8444-444444444446'
const TRIP_DOCUMENT_ID = '44444444-4444-4444-8444-444444444447'

const SAO_PAULO_KEY = '35260712345678000195570010000000021000000020'

const CONTEXT = { companyId: COMPANY_ID, userId: USER_ID }

const DETAIL = { id: MANIFEST_ID } as unknown as MdfeManifestDetail

const VEHICLE: MdfeManifestVehicle = {
  id: VEHICLE_ID,
  plate: 'ABC1D23',
  role: 'traction',
  status: 'active',
}

const DRIVERS: readonly MdfeManifestDriver[] = [
  { id: FIRST_DRIVER_ID, name: 'Ana Souza', status: 'active', taxId: '12345678909' },
  { id: SECOND_DRIVER_ID, name: 'Bruno Lima', status: 'active', taxId: '98765432100' },
]

const candidate = (overrides: Partial<MdfeCandidateDocument> = {}): MdfeCandidateDocument => ({
  accessKey: SAO_PAULO_KEY,
  cargoValue: '1000.00',
  cargoWeight: '500.0000',
  companyId: COMPANY_ID,
  dischargeCityCode: '3550308',
  dischargeCityName: 'Sao Paulo',
  dischargeState: 'SP',
  fiscalDocumentId: CTE_DOCUMENT_ID,
  fiscalEnvironment: 'homologation',
  liveManifestId: null,
  originCityCode: '4106902',
  originCityName: 'Curitiba',
  originState: 'PR',
  status: 'authorized',
  ...overrides,
})

const fields = (
  overrides: Partial<CreateTripMdfeManifestFields> = {},
): CreateTripMdfeManifestFields => ({
  additionalInformation: '',
  cargoProduct: 'Bebidas',
  cargoProductNcm: '22021000',
  cargoType: '05',
  cargoUnit: '01',
  contractorName: 'Industria Contratante',
  contractorTaxId: '11222333000181',
  destinationState: '',
  dischargePostalCode: '01310100',
  emitterType: '1',
  freightValue: '480.00',
  insuranceEndorsement: '12345678901234',
  loadingPostalCode: '80010000',
  transporterType: '1',
  tripStartedAt: null,
  ...overrides,
})

type FixtureParams = {
  readonly candidates?: readonly MdfeCandidateDocument[]
  readonly dischargeCityCount?: number
  readonly readinessState?: TripFiscalReadinessSnapshot['state']
  readonly tripDriverIds?: readonly string[]
  readonly tripStatus?: TripStatus
}

function createFixture(params: FixtureParams = {}) {
  const createCalls: CreateMdfeManifestRecord[] = []
  const tripCalls: object[] = []

  const repository: MdfeManifestRepositoryPort = {
    async create(input) {
      createCalls.push(input)
      return DETAIL
    },
    async discard() {
      return DETAIL
    },
    async findById() {
      return DETAIL
    },
    async findFiscalSettings() {
      return { environment: 'homologation', rntrc: '12345678' }
    },
    async findVehicle() {
      return VEHICLE
    },
    async listCandidateDocuments() {
      return params.candidates ?? [candidate()]
    },
    async listDrivers(input) {
      return DRIVERS.filter((driver) => input.driverIds.includes(driver.id))
    },
    async listManifests() {
      return { items: [], nextCursor: null }
    },
  }

  const trips: TripLookupPort = {
    async get(input) {
      tripCalls.push(input)
      return {
        drivers: (params.tripDriverIds ?? [FIRST_DRIVER_ID, SECOND_DRIVER_ID]).map((driverId) => ({
          driverId,
        })),
        id: TRIP_ID,
        status: params.tripStatus ?? 'dispatched',
        vehicleId: VEHICLE_ID,
      }
    },
  }

  /** Spec 059 D4: os CT-e do manifesto saem da prontidão, não do corpo da requisição. */
  const readiness: TripReadinessLookupPort = {
    countDischargeCities: () => Promise.resolve(params.dischargeCityCount ?? 1),
    read: () =>
      Promise.resolve({
        documents: [
          {
            cteAccessKey: SAO_PAULO_KEY,
            cteFiscalDocumentId: CTE_DOCUMENT_ID,
            reason: 'ok',
            rejectionCode: null,
            rejectionMessage: null,
            tripDocumentId: TRIP_DOCUMENT_ID,
          },
        ],
        readyCount: 1,
        state: params.readinessState ?? 'ready',
        totalCount: 1,
      }),
  }

  return {
    createCalls,
    tripCalls,
    useCase: createTripMdfeManifestUseCase({
      manifests: createMdfeManifestsUseCase({ repository }),
      readiness,
      trips,
    }),
  }
}

const refusal = async (operation: () => Promise<unknown>): Promise<ApiError> => {
  try {
    await operation()
  } catch (error) {
    return error as ApiError
  }
  throw new Error('EXPECTED_REFUSAL')
}

describe('create MDF-e manifest from a trip', () => {
  test('takes the crew, the vehicle and the trip link from the trip, never from the payload', async () => {
    const fixture = createFixture()

    const manifest = await fixture.useCase.execute({
      context: CONTEXT,
      correlationId: 'correlation-1',
      manifest: fields({ destinationState: 'SP' }),
      tripId: TRIP_ID,
    })

    expect(manifest).toEqual(DETAIL)
    expect(fixture.tripCalls).toEqual([{ context: CONTEXT, tripId: TRIP_ID }])
    expect(fixture.createCalls).toHaveLength(1)
    expect(fixture.createCalls[0]?.drivers).toEqual([
      {
        driverId: FIRST_DRIVER_ID,
        driverName: 'Ana Souza',
        driverTaxId: '12345678909',
        position: 1,
      },
      {
        driverId: SECOND_DRIVER_ID,
        driverName: 'Bruno Lima',
        driverTaxId: '98765432100',
        position: 2,
      },
    ])
    expect(fixture.createCalls[0]?.manifest).toMatchObject({
      tripId: TRIP_ID,
      vehicleId: VEHICLE_ID,
    })
  })

  test('refuses a note with no authorized CT-e, by the same validation the direct route uses', async () => {
    const fixture = createFixture({ candidates: [candidate({ status: 'rejected' })] })

    const error = await refusal(() =>
      fixture.useCase.execute({
        context: CONTEXT,
        correlationId: 'correlation-1',
        manifest: fields({ destinationState: 'SP' }),
        tripId: TRIP_ID,
      }),
    )

    expect(error.code).toBe('MDFE_MANIFEST_DOCUMENTS_BLOCKED')
    expect(error.status).toBe(422)
    expect(fixture.createCalls).toEqual([])
  })

  test('refuses a trip with no crew before touching the manifest creation', async () => {
    const fixture = createFixture({ tripDriverIds: [] })

    const error = await refusal(() =>
      fixture.useCase.execute({
        context: CONTEXT,
        correlationId: 'correlation-1',
        manifest: fields({ destinationState: 'SP' }),
        tripId: TRIP_ID,
      }),
    )

    expect(error.code).toBe('MDFE_MANIFEST_CREW_REQUIRED')
    expect(error.status).toBe(422)
    expect(fixture.createCalls).toEqual([])
  })

  /**
   * Spec 059 D4: os CT-e do manifesto saem da **prontidão da viagem**, nunca do corpo. Aceitá-los do
   * cliente deixaria alguém declarar à SEFAZ um conjunto diferente do que a viagem carrega.
   */
  test('takes the CT-e list from the trip readiness, not from the payload', async () => {
    const fixture = createFixture()

    await fixture.useCase.execute({
      context: CONTEXT,
      correlationId: 'correlation-readiness',
      manifest: fields({ destinationState: 'SP' }),
      tripId: TRIP_ID,
    })

    expect(fixture.createCalls[0]?.items).toHaveLength(1)
  })

  /**
   * Spec 065: o caminhão sai antes de qualquer emissão, e o lote é autorizado com a viagem já na rua
   * ou de volta. Se este caminho recusasse, a operação inteira ficaria sem manifesto.
   */
  test('issues with the cargo already on the road and after the trip completed', async () => {
    for (const tripStatus of ['in_transit', 'completed'] as const) {
      const fixture = createFixture({ tripStatus })

      await fixture.useCase.execute({
        context: CONTEXT,
        correlationId: `correlation-${tripStatus}`,
        manifest: fields({ destinationState: 'SP' }),
        tripId: TRIP_ID,
      })

      expect(fixture.createCalls).toHaveLength(1)
    }
  })

  test('refuses a trip whose cargo has not left yet, even when fiscally ready', async () => {
    const fixture = createFixture({ tripStatus: 'route_planned' })

    const error = await refusal(() =>
      fixture.useCase.execute({
        context: CONTEXT,
        correlationId: 'correlation-not-dispatched',
        manifest: fields({ destinationState: 'SP' }),
        tripId: TRIP_ID,
      }),
    )

    expect(error.code).toBe('TRIP_MANIFEST_TRIP_NOT_DISPATCHED')
    expect(fixture.createCalls).toHaveLength(0)
  })

  test('refuses when an invoice still has no authorized CT-e', async () => {
    const fixture = createFixture({ readinessState: 'incomplete' })

    const error = await refusal(() =>
      fixture.useCase.execute({
        context: CONTEXT,
        correlationId: 'correlation-incomplete',
        manifest: fields({ destinationState: 'SP' }),
        tripId: TRIP_ID,
      }),
    )

    expect(error.code).toBe('TRIP_MANIFEST_READINESS_INCOMPLETE')
    expect(fixture.createCalls).toHaveLength(0)
  })

  /** A recusa dos 50 é **nossa**, com a lista — nunca a rejeição da SEFAZ traduzida do jeito dela. */
  test('refuses above fifty discharge municipalities before touching the queue', async () => {
    const fixture = createFixture({ dischargeCityCount: 51 })

    const error = await refusal(() =>
      fixture.useCase.execute({
        context: CONTEXT,
        correlationId: 'correlation-cities',
        manifest: fields({ destinationState: 'SP' }),
        tripId: TRIP_ID,
      }),
    )

    expect(error.code).toBe('TRIP_MANIFEST_DISCHARGE_CITIES_OVER_LIMIT')
    expect(fixture.createCalls).toHaveLength(0)
  })

  test('refuses a second manifest while one is still live', async () => {
    const fixture = createFixture({ readinessState: 'manifested' })

    const error = await refusal(() =>
      fixture.useCase.execute({
        context: CONTEXT,
        correlationId: 'correlation-live',
        manifest: fields({ destinationState: 'SP' }),
        tripId: TRIP_ID,
      }),
    )

    expect(error.code).toBe('TRIP_MANIFEST_ALREADY_LIVE')
    expect(fixture.createCalls).toHaveLength(0)
  })
})
