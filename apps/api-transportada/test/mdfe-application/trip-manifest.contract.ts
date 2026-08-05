/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { MdfeCandidateDocument } from '../../src/mdfe-manifests/domain/mdfe-manifest-eligibility.policy.js'
import {
  createTripMdfeManifestUseCase,
  type CreateTripMdfeManifestFields,
  type TripLookupPort,
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

const candidate = (
  overrides: Partial<MdfeCandidateDocument> = {},
): MdfeCandidateDocument => ({
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
  documentIds: [CTE_DOCUMENT_ID],
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
  readonly tripDriverIds?: readonly string[]
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
        vehicleId: VEHICLE_ID,
      }
    },
  }

  return {
    createCalls,
    tripCalls,
    useCase: createTripMdfeManifestUseCase({
      manifests: createMdfeManifestsUseCase({ repository }),
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
})
