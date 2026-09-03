/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createTripUseCase } from '../../src/trips/application/trip.use-case.js'
import type {
  TripDetail,
  TripDocument,
  TripPage,
  TripRepositoryPort,
} from '../../src/trips/application/trip.port.js'
import { TripDocumentAlreadyLinkedError } from '../../src/trips/domain/trip.error.js'
import type {
  TripDriverCandidate,
  TripVehicleCandidate,
} from '../../src/trips/domain/trip.policy.js'
import { ApiError } from '../../src/shared/api.error.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_COMPANY_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const VEHICLE_ID = '44444444-4444-4444-8444-444444444441'
const FIRST_DRIVER_ID = '44444444-4444-4444-8444-444444444442'
const SECOND_DRIVER_ID = '44444444-4444-4444-8444-444444444443'
const TRIP_ID = '44444444-4444-4444-8444-444444444444'
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444445'
const NFE_DOCUMENT_ID = '44444444-4444-4444-8444-444444444446'

const CONTEXT = { companyId: COMPANY_ID, userId: USER_ID }

const VEHICLE: TripVehicleCandidate = { id: VEHICLE_ID, role: 'traction', status: 'active' }

const DRIVERS: readonly TripDriverCandidate[] = [
  { id: FIRST_DRIVER_ID, name: 'Ana Souza', status: 'active', taxId: '12345678909' },
  { id: SECOND_DRIVER_ID, name: 'Bruno Lima', status: 'active', taxId: '98765432100' },
]

const openTrip = (overrides: Partial<TripDetail> = {}): TripDetail => ({
  companyId: COMPANY_ID,
  createdAt: '2026-08-01T10:00:00.000Z',
  cargoLayout: null,
  cargoWeight: null,
  documents: [],
  occupancy: null,
  drivers: [],
  id: TRIP_ID,
  requiresMdfe: null,
  requiresMdfeReason: null,
  status: 'draft',
  stops: [],
  updatedAt: '2026-08-01T10:00:00.000Z',
  vehicleId: VEHICLE_ID,
  ...overrides,
})

const document = (overrides: Partial<TripDocument> = {}): TripDocument => ({
  createdAt: '2026-08-01T10:00:00.000Z',
  deliveredAt: null,
  destinationOrigin: null,
  freightCalculationId: null,
  id: DOCUMENT_ID,
  loadedAt: null,
  nfeDocumentId: NFE_DOCUMENT_ID,
  releasedAt: null,
  returnedAt: null,
  returnReason: null,
  separatedAt: null,
  separationStatus: 'pending',
  stopId: null,
  tripId: TRIP_ID,
  updatedAt: '2026-08-01T10:00:00.000Z',
  ...overrides,
})

type FixtureParams = {
  readonly deliverResult?: TripDocument | null
  readonly documentResult?: TripDocument | null
  readonly drivers?: readonly TripDriverCandidate[]
  readonly linkError?: Error
  readonly listResult?: TripPage
  readonly releaseResult?: TripDocument | null
  readonly stored?: TripDetail | null
  readonly vehicle?: TripVehicleCandidate | null
}

function createFixture(params: FixtureParams = {}) {
  const closeCalls: object[] = []
  const createCalls: object[] = []
  const deliverCalls: object[] = []
  const linkCalls: object[] = []
  const listCalls: object[] = []
  const releaseCalls: object[] = []

  const repository: TripRepositoryPort = {
    async close(input) {
      closeCalls.push(input)
      const trip = params.stored === undefined ? openTrip() : params.stored
      return trip === null ? null : { ...trip, status: 'completed' }
    },
    async create(input) {
      createCalls.push(input)
      return openTrip({
        drivers: input.crew.map((member) => ({
          ...member,
          driverEmail: '',
          driverPhone: '',
        })),
        vehicleId: input.vehicleId,
      })
    },
    async deliverDocument(input) {
      deliverCalls.push(input)
      return params.deliverResult === undefined
        ? document({ deliveredAt: '2026-08-02T10:00:00.000Z' })
        : params.deliverResult
    },
    async findById() {
      return params.stored === undefined ? openTrip() : params.stored
    },
    async findDocumentById() {
      return params.documentResult === undefined ? document() : params.documentResult
    },
    async findVehicle() {
      return params.vehicle === undefined ? VEHICLE : params.vehicle
    },
    async linkDocument(input) {
      linkCalls.push(input)
      if (params.linkError !== undefined) throw params.linkError
      return document({
        freightCalculationId: input.freightCalculationId,
        nfeDocumentId: input.nfeDocumentId,
      })
    },
    async list(input) {
      listCalls.push(input)
      return params.listResult === undefined ? { items: [], nextCursor: null } : params.listResult
    },
    async listDrivers() {
      return params.drivers ?? DRIVERS
    },
    async releaseDocument(input) {
      releaseCalls.push(input)
      return params.releaseResult === undefined
        ? document({ releasedAt: '2026-08-02T10:00:00.000Z' })
        : params.releaseResult
    },
  }

  return { closeCalls, createCalls, deliverCalls, linkCalls, listCalls, releaseCalls, repository }
}

describe('trip use case contract', () => {
  test('creates a trip resolving the traction vehicle and the ordered crew', async () => {
    const fixture = createFixture()
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const trip = await useCase.create({
      context: CONTEXT,
      driverIds: [FIRST_DRIVER_ID, SECOND_DRIVER_ID],
      vehicleId: VEHICLE_ID,
    })

    expect(trip.drivers).toEqual([
      {
        driverEmail: '',
        driverId: FIRST_DRIVER_ID,
        driverName: 'Ana Souza',
        driverPhone: '',
        driverTaxId: '12345678909',
        position: 1,
      },
      {
        driverEmail: '',
        driverId: SECOND_DRIVER_ID,
        driverName: 'Bruno Lima',
        driverPhone: '',
        driverTaxId: '98765432100',
        position: 2,
      },
    ])
    /**
     * A tripulação **enviada** é o retrato fiscal — nome, CPF e posição. O contato só existe na
     * leitura, e sai da ficha da frota: comparar as duas como iguais escondia essa diferença.
     */
    expect(fixture.createCalls).toEqual([
      {
        companyId: COMPANY_ID,
        crew: trip.drivers.map((driver) => ({
          driverId: driver.driverId,
          driverName: driver.driverName,
          driverTaxId: driver.driverTaxId,
          position: driver.position,
        })),
        vehicleId: VEHICLE_ID,
      },
    ])
  })

  test('links a document by nfe document id, xor freight calculation id', async () => {
    const fixture = createFixture()
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const linked = await useCase.linkDocument({
      context: CONTEXT,
      freightCalculationId: null,
      nfeDocumentId: NFE_DOCUMENT_ID,
      tripId: TRIP_ID,
    })

    expect(linked.nfeDocumentId).toBe(NFE_DOCUMENT_ID)
    expect(linked.freightCalculationId).toBeNull()
  })

  test('refuses to link a document with both or neither reference', async () => {
    const useCase = createTripUseCase({
      locations: purgeSpy(),
      repository: createFixture().repository,
    })
    const both = await useCase
      .linkDocument({
        context: CONTEXT,
        freightCalculationId: NFE_DOCUMENT_ID,
        nfeDocumentId: NFE_DOCUMENT_ID,
        tripId: TRIP_ID,
      })
      .catch((error: unknown) => error)
    const neither = await useCase
      .linkDocument({
        context: CONTEXT,
        freightCalculationId: null,
        nfeDocumentId: null,
        tripId: TRIP_ID,
      })
      .catch((error: unknown) => error)

    expect((both as ApiError).code).toBe('TRIP_DOCUMENT_REFERENCE_INVALID')
    expect((neither as ApiError).code).toBe('TRIP_DOCUMENT_REFERENCE_INVALID')
  })

  // spec 027 § Dúvidas: a nota/frete só vive em uma viagem por vez.
  test('propagates the conflict when the document is already linked to another open trip', async () => {
    const fixture = createFixture({ linkError: new TripDocumentAlreadyLinkedError() })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const error = await useCase
      .linkDocument({
        context: CONTEXT,
        freightCalculationId: null,
        nfeDocumentId: NFE_DOCUMENT_ID,
        tripId: TRIP_ID,
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
    expect((error as ApiError).code).toBe('TRIP_DOCUMENT_ALREADY_LINKED')
  })

  test('unlinks a document that has not been delivered yet', async () => {
    const fixture = createFixture()
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const released = await useCase.releaseDocument({
      context: CONTEXT,
      documentId: DOCUMENT_ID,
      tripId: TRIP_ID,
    })

    expect(released.releasedAt).not.toBeNull()
    expect(fixture.releaseCalls).toEqual([
      { companyId: COMPANY_ID, documentId: DOCUMENT_ID, tripId: TRIP_ID },
    ])
  })

  // spec 027 § Dúvidas: entregue trava na viagem — nunca migra, nem se desvincula.
  test('refuses to unlink a document that has already been delivered', async () => {
    const fixture = createFixture({
      documentResult: document({ deliveredAt: '2026-08-02T09:00:00.000Z' }),
    })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const error = await useCase
      .releaseDocument({ context: CONTEXT, documentId: DOCUMENT_ID, tripId: TRIP_ID })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('TRIP_DOCUMENT_ALREADY_DELIVERED')
    expect(fixture.releaseCalls).toEqual([])
  })

  test('marking an already delivered document as delivered again is idempotent', async () => {
    const deliveredDocument = document({ deliveredAt: '2026-08-02T09:00:00.000Z' })
    const fixture = createFixture({ documentResult: deliveredDocument })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const delivered = await useCase.deliverDocument({
      context: CONTEXT,
      documentId: DOCUMENT_ID,
      tripId: TRIP_ID,
    })

    expect(delivered).toEqual(deliveredDocument)
    expect(fixture.deliverCalls).toEqual([])
  })

  test('closing an already closed trip is idempotent', async () => {
    const closedTrip = openTrip({ status: 'completed' })
    const fixture = createFixture({ stored: closedTrip })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const closed = await useCase.close({ context: CONTEXT, tripId: TRIP_ID })

    expect(closed).toEqual(closedTrip)
    expect(fixture.closeCalls).toEqual([])
  })

  test('refuses to link, deliver or release documents on a completed trip', async () => {
    const fixture = createFixture({ stored: openTrip({ status: 'completed' }) })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const linkError = await useCase
      .linkDocument({
        context: CONTEXT,
        freightCalculationId: null,
        nfeDocumentId: NFE_DOCUMENT_ID,
        tripId: TRIP_ID,
      })
      .catch((caught: unknown) => caught)
    const deliverError = await useCase
      .deliverDocument({ context: CONTEXT, documentId: DOCUMENT_ID, tripId: TRIP_ID })
      .catch((caught: unknown) => caught)
    const releaseError = await useCase
      .releaseDocument({ context: CONTEXT, documentId: DOCUMENT_ID, tripId: TRIP_ID })
      .catch((caught: unknown) => caught)

    expect((linkError as ApiError).code).toBe('STATE_TRANSITION_NOT_ALLOWED')
    expect((linkError as ApiError).status).toBe(409)
    expect((deliverError as ApiError).code).toBe('STATE_TRANSITION_NOT_ALLOWED')
    expect((releaseError as ApiError).code).toBe('STATE_TRANSITION_NOT_ALLOWED')
  })

  // ADR-0043 §2, T013: vincular e desvincular selam a partir de `dispatched`, não só em
  // `completed`/`cancelled` — a mesma porta de não-retorno de separar/carregar.
  test.each(['dispatched', 'in_transit', 'cancelled'] as const)(
    'refuses to link documents once the trip is %s',
    async (status) => {
      const fixture = createFixture({ stored: openTrip({ status }) })
      const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

      const linkError = await useCase
        .linkDocument({
          context: CONTEXT,
          freightCalculationId: null,
          nfeDocumentId: NFE_DOCUMENT_ID,
          tripId: TRIP_ID,
        })
        .catch((caught: unknown) => caught)

      expect((linkError as ApiError).code).toBe('STATE_TRANSITION_NOT_ALLOWED')
      expect((linkError as ApiError).status).toBe(409)
    },
  )

  test('throws not-found errors when the trip does not exist in this company', async () => {
    const fixture = createFixture({ stored: null })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const error = await useCase
      .get({ context: { companyId: OTHER_COMPANY_ID, userId: USER_ID }, tripId: TRIP_ID })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
    expect((error as ApiError).code).toBe('TRIP_NOT_FOUND')
  })

  test('delegates listing to the repository, scoped by company and paging', async () => {
    const page: TripPage = { items: [openTrip()], nextCursor: 'cursor-value' }
    const fixture = createFixture({ listResult: page })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const result = await useCase.list({
      context: CONTEXT,
      cursor: null,
      filters: { statusEq: 'draft' },
      limit: 25,
    })

    expect(result).toEqual(page)
    expect(fixture.listCalls).toEqual([
      { companyId: COMPANY_ID, cursor: null, filters: { statusEq: 'draft' }, limit: 25 },
    ])
  })
  /**
   * ADR-0050 §5: **o rastro morre com a viagem.** O expurgo é consequência de fechar, não rotina que
   * alguém pode esquecer de rodar — e é por isso que ele tem contrato próprio aqui.
   */
  test('fecha a viagem e apaga o rastro ao vivo dela', async () => {
    const fixture = createFixture()
    const purged: { companyId: string; tripId: string }[] = []
    const useCase = createTripUseCase({
      locations: purgeSpy(purged),
      repository: fixture.repository,
    })

    await useCase.close({ context: CONTEXT, tripId: TRIP_ID })

    expect(purged).toEqual([{ companyId: CONTEXT.companyId, tripId: TRIP_ID }])
  })
})

/**
 * ADR-0050 §5: fechar a viagem apaga o rastro ao vivo. O espião existe para o contrato dizer que o
 * expurgo é chamado — a suíte de fechamento não precisa de banco para provar isso.
 */
function purgeSpy(purged: { companyId: string; tripId: string }[] = []): {
  purgeByTrip(input: { readonly companyId: string; readonly tripId: string }): Promise<void>
} {
  return {
    async purgeByTrip(input) {
      purged.push({ companyId: input.companyId, tripId: input.tripId })
    },
  }
}
