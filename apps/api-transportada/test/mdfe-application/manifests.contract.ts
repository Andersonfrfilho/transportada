/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { MdfeManifestStatus } from '../../src/database/mdfe.schema.js'
import type { MdfeCandidateDocument } from '../../src/mdfe-manifests/domain/mdfe-manifest-eligibility.policy.js'
import {
  createMdfeManifestsUseCase,
  type CreateMdfeManifestFields,
} from '../../src/mdfe-manifests/application/mdfe-manifests.use-case.js'
import type {
  CreateMdfeManifestRecord,
  MdfeFiscalSettings,
  MdfeManifestDetail,
  MdfeManifestDriver,
  MdfeManifestPage,
  MdfeManifestRepositoryPort,
  MdfeManifestVehicle,
} from '../../src/mdfe-manifests/application/mdfe-manifest.port.js'
import type { ApiError } from '../../src/shared/api.error.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_COMPANY_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const VEHICLE_ID = '44444444-4444-4444-8444-444444444441'
const FIRST_DRIVER_ID = '44444444-4444-4444-8444-444444444442'
const SECOND_DRIVER_ID = '44444444-4444-4444-8444-444444444443'
const MANIFEST_ID = '44444444-4444-4444-8444-444444444444'

const CURITIBA_KEY = '41260712345678000195570010000000011000000010'
const SAO_PAULO_KEY = '35260712345678000195570010000000021000000020'
const BELO_HORIZONTE_KEY = '31260712345678000195570010000000031000000030'

const CONTEXT = { companyId: COMPANY_ID, userId: USER_ID }

const candidate = (
  overrides: Partial<MdfeCandidateDocument> & { readonly fiscalDocumentId: string },
): MdfeCandidateDocument => ({
  accessKey: SAO_PAULO_KEY,
  cargoValue: '1000.00',
  cargoWeight: '500.0000',
  companyId: COMPANY_ID,
  dischargeCityCode: '3550308',
  dischargeCityName: 'Sao Paulo',
  dischargeState: 'SP',
  fiscalEnvironment: 'homologation',
  liveManifestId: null,
  originCityCode: '4106902',
  originCityName: 'Curitiba',
  originState: 'PR',
  status: 'authorized',
  ...overrides,
})

const fields = (overrides: Partial<CreateMdfeManifestFields> = {}): CreateMdfeManifestFields => ({
  additionalInformation: '',
  cargoProduct: 'Bebidas',
  cargoProductNcm: '22021000',
  cargoType: '05',
  cargoUnit: '01',
  contractorName: 'Industria Contratante',
  contractorTaxId: '11222333000181',
  dischargePostalCode: '01310100',
  freightValue: '480.00',
  insuranceEndorsement: '12345678901234',
  loadingPostalCode: '80010000',
  destinationState: '',
  documentIds: ['doc-1'],
  driverIds: [FIRST_DRIVER_ID],
  emitterType: '1',
  transporterType: '1',
  tripId: null,
  tripStartedAt: null,
  vehicleId: VEHICLE_ID,
  ...overrides,
})

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

const DETAIL = { id: MANIFEST_ID } as unknown as MdfeManifestDetail
const PAGE: MdfeManifestPage = { items: [], nextCursor: null }

const storedManifest = (status: MdfeManifestStatus): MdfeManifestDetail =>
  ({ id: MANIFEST_ID, status }) as unknown as MdfeManifestDetail

type FixtureParams = {
  readonly candidates?: readonly MdfeCandidateDocument[]
  readonly discarded?: MdfeManifestDetail | null
  readonly drivers?: readonly MdfeManifestDriver[]
  readonly settings?: MdfeFiscalSettings | null
  readonly stored?: MdfeManifestDetail | null
  readonly vehicle?: MdfeManifestVehicle | null
}

const createFixture = (params: FixtureParams = {}) => {
  const createCalls: CreateMdfeManifestRecord[] = []
  const discardCalls: object[] = []
  const findByIdCalls: object[] = []
  const listCalls: object[] = []
  const listDriverCalls: object[] = []
  const vehicleCalls: object[] = []

  const repository: MdfeManifestRepositoryPort = {
    async create(input) {
      createCalls.push(input)
      return DETAIL
    },
    async discard(input) {
      discardCalls.push(input)
      return params.discarded === undefined ? storedManifest('discarded') : params.discarded
    },
    async findById(input) {
      findByIdCalls.push(input)
      return params.stored === undefined ? DETAIL : params.stored
    },
    async findFiscalSettings() {
      return params.settings === undefined
        ? { environment: 'homologation', rntrc: '12345678' }
        : params.settings
    },
    async findVehicle(input) {
      vehicleCalls.push(input)
      return params.vehicle === undefined ? VEHICLE : params.vehicle
    },
    async listCandidateDocuments() {
      return params.candidates ?? [candidate({ fiscalDocumentId: 'doc-1' })]
    },
    async listDrivers(input) {
      listDriverCalls.push(input)
      return params.drivers ?? [DRIVERS[0] as MdfeManifestDriver]
    },
    async listManifests(input) {
      listCalls.push(input)
      return PAGE
    },
  }

  return {
    createCalls,
    discardCalls,
    findByIdCalls,
    listCalls,
    listDriverCalls,
    useCase: createMdfeManifestsUseCase({ repository }),
    vehicleCalls,
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

describe('create MDF-e manifest', () => {
  test('freezes the totals, the cities, the crew and the documents of the selection', async () => {
    const fixture = createFixture({
      candidates: [
        candidate({ fiscalDocumentId: 'doc-1' }),
        candidate({
          accessKey: CURITIBA_KEY,
          cargoValue: '250.50',
          cargoWeight: '120.5000',
          fiscalDocumentId: 'doc-2',
          originCityCode: '4113700',
          originCityName: 'Londrina',
        }),
      ],
      drivers: DRIVERS,
    })

    await fixture.useCase.create({
      context: CONTEXT,
      correlationId: 'correlation-1',
      manifest: fields({
        destinationState: 'SP',
        documentIds: ['doc-1', 'doc-2'],
        driverIds: [FIRST_DRIVER_ID, SECOND_DRIVER_ID],
      }),
    })

    expect(fixture.createCalls).toEqual([
      {
        companyId: COMPANY_ID,
        drivers: [
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
        ],
        items: [
          {
            accessKey: SAO_PAULO_KEY,
            cargoValue: '1000.00',
            cargoWeight: '500.0000',
            cteFiscalDocumentId: 'doc-1',
            dischargeCityCode: '3550308',
            dischargeCityName: 'Sao Paulo',
          },
          {
            accessKey: CURITIBA_KEY,
            cargoValue: '250.50',
            cargoWeight: '120.5000',
            cteFiscalDocumentId: 'doc-2',
            dischargeCityCode: '3550308',
            dischargeCityName: 'Sao Paulo',
          },
        ],
        loadingCities: [
          { cityCode: '4106902', cityName: 'Curitiba', position: 1 },
          { cityCode: '4113700', cityName: 'Londrina', position: 2 },
        ],
        manifest: {
          additionalInformation: '',
          cargoProduct: 'Bebidas',
          cargoProductNcm: '22021000',
          cargoType: '05',
          cargoUnit: '01',
          cargoValue: '1250.50',
          cargoWeight: '620.5000',
          contractorName: 'Industria Contratante',
          contractorTaxId: '11222333000181',
          cteCount: 2,
          destinationState: 'SP',
          dischargePostalCode: '01310100',
          emitterType: '1',
          fiscalEnvironment: 'homologation',
          freightValue: '480.00',
          insuranceEndorsement: '12345678901234',
          loadingPostalCode: '80010000',
          originState: 'PR',
          rntrc: '12345678',
          transporterType: '1',
          tripId: null,
          tripStartedAt: null,
          vehicleId: VEHICLE_ID,
        },
      },
    ])
  })

  test('takes the company from the context and the RNTRC from the fiscal profile', async () => {
    const fixture = createFixture()
    const payloadCarryingACompany = {
      context: CONTEXT,
      correlationId: 'correlation-1',
      manifest: {
        ...fields({ destinationState: 'SP' }),
        companyId: OTHER_COMPANY_ID,
        rntrc: '00000001',
      },
    }

    await fixture.useCase.create(payloadCarryingACompany)

    expect(fixture.createCalls[0]?.companyId).toBe(COMPANY_ID)
    expect(fixture.createCalls[0]?.manifest.rntrc).toBe('12345678')
    expect(fixture.vehicleCalls).toEqual([{ companyId: COMPANY_ID, vehicleId: VEHICLE_ID }])
    expect(fixture.listDriverCalls).toEqual([
      { companyId: COMPANY_ID, driverIds: [FIRST_DRIVER_ID] },
    ])
  })

  test('refuses to manifest a selection with any blocked CT-e', async () => {
    const fixture = createFixture({
      candidates: [candidate({ fiscalDocumentId: 'doc-1', liveManifestId: 'manifest-9' })],
    })

    const error = await refusal(() =>
      fixture.useCase.create({
        context: CONTEXT,
        correlationId: 'correlation-1',
        manifest: fields({ destinationState: 'SP' }),
      }),
    )

    expect(error.code).toBe('MDFE_MANIFEST_DOCUMENTS_BLOCKED')
    expect(error.status).toBe(422)
    expect(fixture.createCalls).toEqual([])
  })

  test('refuses a vehicle that is not an active traction of the company', async () => {
    const missing = createFixture({ vehicle: null })
    const notFound = await refusal(() =>
      missing.useCase.create({
        context: CONTEXT,
        correlationId: 'correlation-1',
        manifest: fields({ destinationState: 'SP' }),
      }),
    )
    expect(notFound.code).toBe('MDFE_MANIFEST_VEHICLE_NOT_FOUND')
    expect(notFound.status).toBe(404)

    for (const vehicle of [
      { ...VEHICLE, status: 'inactive' as const },
      { ...VEHICLE, role: 'trailer' as const },
    ]) {
      const fixture = createFixture({ vehicle })
      const error = await refusal(() =>
        fixture.useCase.create({
          context: CONTEXT,
          correlationId: 'correlation-1',
          manifest: fields({ destinationState: 'SP' }),
        }),
      )

      expect(error.code).toBe('MDFE_MANIFEST_VEHICLE_NOT_AVAILABLE')
      expect(error.status).toBe(422)
      expect(fixture.createCalls).toEqual([])
    }
  })

  test('refuses a crew with an unknown, an inactive or a repeated driver', async () => {
    const missing = createFixture({ drivers: [] })
    const notFound = await refusal(() =>
      missing.useCase.create({
        context: CONTEXT,
        correlationId: 'correlation-1',
        manifest: fields({ destinationState: 'SP' }),
      }),
    )
    expect(notFound.code).toBe('MDFE_MANIFEST_DRIVER_NOT_FOUND')
    expect(notFound.status).toBe(404)

    const inactive = createFixture({
      drivers: [{ ...(DRIVERS[0] as MdfeManifestDriver), status: 'inactive' }],
    })
    const unavailable = await refusal(() =>
      inactive.useCase.create({
        context: CONTEXT,
        correlationId: 'correlation-1',
        manifest: fields({ destinationState: 'SP' }),
      }),
    )
    expect(unavailable.code).toBe('MDFE_MANIFEST_DRIVER_NOT_AVAILABLE')
    expect(unavailable.status).toBe(422)

    const repeated = createFixture()
    const duplicated = await refusal(() =>
      repeated.useCase.create({
        context: CONTEXT,
        correlationId: 'correlation-1',
        manifest: fields({
          destinationState: 'SP',
          driverIds: [FIRST_DRIVER_ID, FIRST_DRIVER_ID],
        }),
      }),
    )
    expect(duplicated.code).toBe('MDFE_MANIFEST_DRIVER_DUPLICATED')
    expect(duplicated.status).toBe(422)
    expect(repeated.createCalls).toEqual([])
  })

  test('asks the operator to choose the destination when the CT-es unload in more than one state', async () => {
    const candidates = [
      candidate({ fiscalDocumentId: 'doc-1' }),
      candidate({
        accessKey: BELO_HORIZONTE_KEY,
        dischargeCityCode: '3106200',
        dischargeCityName: 'Belo Horizonte',
        dischargeState: 'MG',
        fiscalDocumentId: 'doc-2',
      }),
    ]
    const documentIds = ['doc-1', 'doc-2']

    const undecided = createFixture({ candidates })
    const required = await refusal(() =>
      undecided.useCase.create({
        context: CONTEXT,
        correlationId: 'correlation-1',
        manifest: fields({ documentIds }),
      }),
    )
    expect(required.code).toBe('MDFE_MANIFEST_DESTINATION_STATE_REQUIRED')
    expect(required.status).toBe(422)

    const foreign = createFixture({ candidates })
    const outside = await refusal(() =>
      foreign.useCase.create({
        context: CONTEXT,
        correlationId: 'correlation-1',
        manifest: fields({ destinationState: 'RS', documentIds }),
      }),
    )
    expect(outside.code).toBe('MDFE_MANIFEST_DESTINATION_STATE_REQUIRED')

    const chosen = createFixture({ candidates })
    await chosen.useCase.create({
      context: CONTEXT,
      correlationId: 'correlation-1',
      manifest: fields({ destinationState: 'MG', documentIds }),
    })
    expect(chosen.createCalls[0]?.manifest.destinationState).toBe('MG')
  })

  test('derives the destination when every CT-e unloads in the same state', async () => {
    const fixture = createFixture()

    await fixture.useCase.create({
      context: CONTEXT,
      correlationId: 'correlation-1',
      manifest: fields(),
    })

    expect(fixture.createCalls[0]?.manifest.destinationState).toBe('SP')
  })

  test('refuses to manifest without the fiscal settings that define the environment', async () => {
    const fixture = createFixture({ settings: null })

    const error = await refusal(() =>
      fixture.useCase.create({
        context: CONTEXT,
        correlationId: 'correlation-1',
        manifest: fields({ destinationState: 'SP' }),
      }),
    )

    expect(error.code).toBe('MDFE_FISCAL_SETTINGS_MISSING')
    expect(error.status).toBe(409)
    expect(fixture.createCalls).toEqual([])
  })
})

describe('read MDF-e manifests', () => {
  test('lists the manifests of the authenticated company only', async () => {
    const fixture = createFixture()

    const page = await fixture.useCase.list({
      context: CONTEXT,
      cursor: 'cursor-1',
      filters: { statusEq: 'authorized' },
      limit: 5,
    })

    expect(page).toBe(PAGE)
    expect(fixture.listCalls).toEqual([
      {
        companyId: COMPANY_ID,
        cursor: 'cursor-1',
        filters: { statusEq: 'authorized' },
        limit: 5,
      },
    ])
  })

  test('reads a manifest by id inside the company', async () => {
    const fixture = createFixture()

    const detail = await fixture.useCase.get({ context: CONTEXT, manifestId: MANIFEST_ID })

    expect(detail).toBe(DETAIL)
    expect(fixture.findByIdCalls).toEqual([{ companyId: COMPANY_ID, manifestId: MANIFEST_ID }])
  })

  test('reports a manifest of another company as not found', async () => {
    const fixture = createFixture({ stored: null })

    const error = await refusal(() =>
      fixture.useCase.get({ context: CONTEXT, manifestId: MANIFEST_ID }),
    )

    expect(error.code).toBe('MDFE_MANIFEST_NOT_FOUND')
    expect(error.status).toBe(404)
  })
})

// ADR-0017: descartar é o único jeito de tirar o CT-e de um manifesto que a SEFAZ recusou
describe('discard MDF-e manifest', () => {
  test('discards a rejected manifest and hands the CT-e back', async () => {
    const fixture = createFixture({ stored: storedManifest('rejected') })

    const detail = await fixture.useCase.discard({ context: CONTEXT, manifestId: MANIFEST_ID })

    expect(detail.status).toBe('discarded')
    expect(fixture.discardCalls).toEqual([{ companyId: COMPANY_ID, manifestId: MANIFEST_ID }])
  })

  test('answers a repeated discard without touching the manifest again', async () => {
    const fixture = createFixture({ stored: storedManifest('discarded') })

    const detail = await fixture.useCase.discard({ context: CONTEXT, manifestId: MANIFEST_ID })

    expect(detail.status).toBe('discarded')
    expect(fixture.discardCalls).toEqual([])
  })

  test('refuses to discard what the SEFAZ already authorized', async () => {
    const fixture = createFixture({ stored: storedManifest('authorized') })

    const error = await refusal(() =>
      fixture.useCase.discard({ context: CONTEXT, manifestId: MANIFEST_ID }),
    )

    expect(error.code).toBe('MDFE_MANIFEST_NOT_DISCARDABLE')
    expect(error.status).toBe(409)
    expect(fixture.discardCalls).toEqual([])
  })

  test('reports a manifest of another company as not found', async () => {
    const fixture = createFixture({ stored: null })

    const error = await refusal(() =>
      fixture.useCase.discard({ context: CONTEXT, manifestId: MANIFEST_ID }),
    )

    expect(error.code).toBe('MDFE_MANIFEST_NOT_FOUND')
    expect(error.status).toBe(404)
    expect(fixture.discardCalls).toEqual([])
  })

  /** A transmissão pode entrar entre a leitura e o update — quem perde a corrida ouve `in flight`. */
  test('refuses the discard that lost the race to a transmission', async () => {
    const fixture = createFixture({ discarded: null, stored: storedManifest('draft') })

    const error = await refusal(() =>
      fixture.useCase.discard({ context: CONTEXT, manifestId: MANIFEST_ID }),
    )

    expect(error.code).toBe('MDFE_MANIFEST_IN_FLIGHT')
    expect(error.status).toBe(409)
  })
})
