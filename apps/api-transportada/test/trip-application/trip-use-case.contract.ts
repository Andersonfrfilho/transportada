/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createTripUseCase } from '../../src/trips/application/trip.use-case.js'
import type {
  TripDetail,
  TripDocument,
  TripDocumentDetail,
  TripPage,
  TripRepositoryPort,
} from '../../src/trips/application/trip.port.js'
import type { PlanTripRouteTollFreezer } from '../../src/trips/application/plan-trip-route.use-case.js'
import { resolveCrewStatus } from '../../src/trips/domain/trip-state.policy.js'
import {
  TripCloseReasonRequiredError,
  TripDocumentAlreadyLinkedError,
  TripStateTransitionNotAllowedError,
  TripVehicleNotFoundError,
} from '../../src/trips/domain/trip.error.js'
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
const CORRELATION_ID = 'correlation-close-trip'
const IP_ADDRESS = '203.0.113.10'

const VEHICLE: TripVehicleCandidate = {
  defaultTrailerVehicleId: null,
  id: VEHICLE_ID,
  role: 'traction',
  status: 'active',
  vehicleType: 'tractor_unit',
}

const DRIVERS: readonly TripDriverCandidate[] = [
  {
    canActAsHelper: false,
    id: FIRST_DRIVER_ID,
    name: 'Ana Souza',
    status: 'active',
    taxId: '12345678909',
  },
  {
    canActAsHelper: false,
    id: SECOND_DRIVER_ID,
    name: 'Bruno Lima',
    status: 'active',
    taxId: '98765432100',
  },
]

const openTrip = (overrides: Partial<TripDetail> = {}): TripDetail => ({
  amounts: null,
  companyId: COMPANY_ID,
  driverNames: [],
  createdAt: '2026-08-01T10:00:00.000Z',
  closeReason: null,
  closedAt: null,
  closedByName: null,
  cargoLayout: null,
  cargoLayoutState: {
    computedAt: null,
    errorCode: null,
    stale: false,
    status: 'unavailable',
    truncated: false,
  },
  capacityUnknownReason: null,
  capacityUnknownVehicleId: null,
  cargoWeight: null,
  documents: [],
  occupancy: null,
  trailer: null,
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

const documentDetail = (overrides: Partial<TripDocument> = {}): TripDocumentDetail => ({
  ...document(overrides),
  contact: null,
  cteAuthorized: false,
  fiscalStatus: 'authorized',
  freightAmount: null,
  freightRuleName: null,
  freightSource: 'missing',
  leavesBehindOnDispatch: false,
  nfeIssuedAt: null,
  nfeNumber: null,
  nfeSeries: null,
  nfeTotalValue: null,
  openOccurrenceCase: false,
})

type FixtureParams = {
  readonly documentResult?: TripDocument | null
  readonly drivers?: readonly TripDriverCandidate[]
  readonly linkError?: Error
  readonly listResult?: TripPage
  readonly releaseResult?: TripDocument | null
  readonly setTrailerResult?: TripDetail | null
  readonly stored?: TripDetail | null
  readonly trailerInOpenTrip?: boolean
  readonly trailerVehicle?: TripVehicleCandidate | null
  readonly vehicle?: TripVehicleCandidate | null
}

function createFixture(params: FixtureParams = {}) {
  const closeCalls: object[] = []
  const createCalls: object[] = []
  const linkCalls: object[] = []
  const listCalls: object[] = []
  const releaseCalls: object[] = []
  const updateCrewCalls: object[] = []
  const findVehicleCalls: object[] = []
  const isTrailerInOpenTripCalls: object[] = []
  const setTrailerCalls: object[] = []

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
        /** Spec 217 D1: mesma função da troca decide o status de nascimento — sem regra paralela. */
        status: resolveCrewStatus({
          hasDriver: input.crew.length > 0,
          hasVehicle: input.vehicleId !== null,
        }),
        vehicleId: input.vehicleId,
      })
    },
    async findById() {
      return params.stored === undefined ? openTrip() : params.stored
    },
    async findDocumentById() {
      return params.documentResult === undefined ? document() : params.documentResult
    },
    async findLiveTripIdForDocuments() {
      return null
    },
    async findVehicle(input) {
      findVehicleCalls.push(input)
      if (input.vehicleId === VEHICLE_ID) {
        return params.vehicle === undefined ? VEHICLE : params.vehicle
      }
      return params.trailerVehicle === undefined ? TRAILER : params.trailerVehicle
    },
    async isTrailerInOpenTrip(input) {
      isTrailerInOpenTripCalls.push(input)
      return params.trailerInOpenTrip ?? false
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
    async updateCrew(input) {
      updateCrewCalls.push(input)
      const trip = params.stored === undefined ? openTrip() : params.stored
      return trip === null
        ? null
        : {
            ...trip,
            drivers: input.crew.map((member) => ({ ...member, driverEmail: '', driverPhone: '' })),
            status: 'draft',
            vehicleId: input.vehicleId,
          }
    },
    async setTrailer(input) {
      setTrailerCalls.push(input)
      if (params.setTrailerResult !== undefined) return params.setTrailerResult
      const trip = params.stored === undefined ? openTrip() : params.stored
      return trip === null
        ? null
        : {
            ...trip,
            trailer:
              input.trailerVehicleId === null
                ? null
                : { bodyType: '02', id: input.trailerVehicleId, plate: 'XYZ9A88' },
          }
    },
  }

  return {
    closeCalls,
    createCalls,
    findVehicleCalls,
    isTrailerInOpenTripCalls,
    linkCalls,
    listCalls,
    releaseCalls,
    repository,
    updateCrewCalls,
    setTrailerCalls,
  }
}

const TRAILER: TripVehicleCandidate = {
  defaultTrailerVehicleId: null,
  id: '44444444-4444-4444-8444-444444444447',
  role: 'trailer',
  status: 'active',
  vehicleType: '',
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
        role: 'driver',
      },
      {
        driverEmail: '',
        driverId: SECOND_DRIVER_ID,
        driverName: 'Bruno Lima',
        driverPhone: '',
        driverTaxId: '98765432100',
        position: 2,
        role: 'driver',
      },
    ])
    /**
     * A tripulação **enviada** é o retrato fiscal — nome, CPF, papel e posição. O contato só existe
     * na leitura, e sai da ficha da frota: comparar as duas como iguais escondia essa diferença.
     */
    expect(fixture.createCalls).toEqual([
      {
        actorUserId: USER_ID,
        channel: 'backoffice',
        companyId: COMPANY_ID,
        crew: trip.drivers.map((driver) => ({
          driverId: driver.driverId,
          driverName: driver.driverName,
          driverTaxId: driver.driverTaxId,
          position: driver.position,
          role: driver.role,
        })),
        trailerVehicleId: null,
        vehicleId: VEHICLE_ID,
      },
    ])
  })

  /** Spec 171 RF1: quem criou e por qual canal chegam ao repositório — mesmo caminho das transições. */
  test('forwards the creator and the backoffice channel to the repository', async () => {
    const fixture = createFixture()
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    await useCase.create({ context: CONTEXT, driverIds: [FIRST_DRIVER_ID], vehicleId: VEHICLE_ID })

    expect(fixture.createCalls[0]).toMatchObject({ actorUserId: USER_ID, channel: 'backoffice' })
  })

  /**
   * Spec 143 T5: ausente não é zero — o repositório não recebe a chave, e é a política (T2) quem
   * lê essa ausência como "sugere pela duração".
   */
  test('forwards the informed daily allowance days to the repository, and omits it when absent', async () => {
    const fixture = createFixture()
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    await useCase.create({
      context: CONTEXT,
      dailyAllowanceDays: 2,
      driverIds: [FIRST_DRIVER_ID],
      vehicleId: VEHICLE_ID,
    })
    await useCase.create({ context: CONTEXT, driverIds: [FIRST_DRIVER_ID], vehicleId: VEHICLE_ID })

    expect(fixture.createCalls[0]).toMatchObject({ dailyAllowanceDays: 2 })
    expect(fixture.createCalls[1]).not.toHaveProperty('dailyAllowanceDays')
  })

  /**
   * Spec 217 T201 (RF2/RF3, D1): a criação passa a aceitar par incompleto, e o status nasce do par —
   * mesma função (`resolveCrewStatus`) que decide a troca (T101/T102). Os quatro cenários de aceite
   * do spec.md: nenhum dos dois, só motorista, só veículo, os dois.
   */
  describe('creates a trip deriving the status from the crew composition (spec 217 RF2/RF3/D1)', () => {
    test('without driver and without vehicle: awaiting_crew, and never throws TripVehicleNotFoundError', async () => {
      const fixture = createFixture()
      const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

      const trip = await useCase.create({ context: CONTEXT, driverIds: [], vehicleId: undefined })

      expect(trip.status).toBe('awaiting_crew')
      expect(trip.vehicleId).toBeNull()
      expect(fixture.createCalls).toEqual([
        {
          actorUserId: USER_ID,
          channel: 'backoffice',
          companyId: COMPANY_ID,
          crew: [],
          trailerVehicleId: null,
          vehicleId: null,
        },
      ])
    })

    test('only driver, without vehicle: awaiting_crew', async () => {
      const fixture = createFixture()
      const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

      const trip = await useCase.create({
        context: CONTEXT,
        driverIds: [FIRST_DRIVER_ID],
        vehicleId: undefined,
      })

      expect(trip.status).toBe('awaiting_crew')
      expect(trip.vehicleId).toBeNull()
    })

    test('only vehicle, without driver: awaiting_crew', async () => {
      const fixture = createFixture()
      const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

      const trip = await useCase.create({ context: CONTEXT, driverIds: [], vehicleId: VEHICLE_ID })

      expect(trip.status).toBe('awaiting_crew')
      expect(trip.vehicleId).toBe(VEHICLE_ID)
    })

    /** Sem regressão: o par completo continua nascendo `draft`, como antes da 217. */
    test('driver and vehicle: draft, same as before the spec', async () => {
      const fixture = createFixture()
      const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

      const trip = await useCase.create({
        context: CONTEXT,
        driverIds: [FIRST_DRIVER_ID],
        vehicleId: VEHICLE_ID,
      })

      expect(trip.status).toBe('draft')
      expect(trip.vehicleId).toBe(VEHICLE_ID)
    })

    /**
     * Um `vehicleId` informado e não encontrado continua erro — só a **ausência** do campo é "sem
     * veículo ainda" (spec 217, `resolveTripVehicleForCreation`).
     */
    test('an informed but unresolved vehicleId still refuses, never silently becomes awaiting_crew', async () => {
      const fixture = createFixture({ vehicle: null })
      const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

      const refusal = await useCase
        .create({ context: CONTEXT, driverIds: [], vehicleId: VEHICLE_ID })
        .then(() => null)
        .catch((error: unknown) => error)

      expect(refusal).toBeInstanceOf(TripVehicleNotFoundError)
      expect(fixture.createCalls).toEqual([])
    })
  })

  // Spec 149 (ADR-0065): 1 motorista + 2 ajudantes grava 3 linhas, motorista na posição 1.
  test('creates a trip with a driver and helpers, helpers after the driver', async () => {
    const helperOne = '55555555-5555-4555-8555-555555555551'
    const helperTwo = '55555555-5555-4555-8555-555555555552'
    const fixture = createFixture({
      drivers: [
        ...DRIVERS,
        {
          canActAsHelper: true,
          id: helperOne,
          name: 'Carlos Ajudante',
          status: 'active',
          taxId: '11111111111',
        },
        {
          canActAsHelper: true,
          id: helperTwo,
          name: 'Diana Ajudante',
          status: 'active',
          taxId: '22222222222',
        },
      ],
    })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const trip = await useCase.create({
      context: CONTEXT,
      driverIds: [FIRST_DRIVER_ID],
      helperIds: [helperOne, helperTwo],
      vehicleId: VEHICLE_ID,
    })

    expect(
      trip.drivers.map((driver) => ({ driverId: driver.driverId, role: driver.role })),
    ).toEqual([
      { driverId: FIRST_DRIVER_ID, role: 'driver' },
      { driverId: helperOne, role: 'helper' },
      { driverId: helperTwo, role: 'helper' },
    ])
  })

  // Critério de aceite 3: a posição 1 exige um motorista — ajudante sozinho é 409.
  test('refuses helpers without a driver in the crew', async () => {
    const fixture = createFixture({
      drivers: [
        {
          canActAsHelper: true,
          id: FIRST_DRIVER_ID,
          name: 'Ana Souza',
          status: 'active',
          taxId: '12345678909',
        },
      ],
    })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const error = await useCase
      .create({
        context: CONTEXT,
        driverIds: [],
        helperIds: [FIRST_DRIVER_ID],
        vehicleId: VEHICLE_ID,
      })
      .catch((caught: unknown) => caught)

    expect((error as ApiError).code).toBe('TRIP_CREW_HELPER_WITHOUT_DRIVER')
    expect((error as ApiError).status).toBe(409)
    expect(fixture.createCalls).toEqual([])
  })

  // Critério de aceite 3: ficha sem `can_act_as_helper` não entra como ajudante.
  test('refuses a helper whose driver record cannot help', async () => {
    const fixture = createFixture({
      drivers: [
        {
          canActAsHelper: false,
          id: FIRST_DRIVER_ID,
          name: 'Ana Souza',
          status: 'active',
          taxId: '12345678909',
        },
        {
          canActAsHelper: false,
          id: SECOND_DRIVER_ID,
          name: 'Bruno Lima',
          status: 'active',
          taxId: '98765432100',
        },
      ],
    })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const error = await useCase
      .create({
        context: CONTEXT,
        driverIds: [FIRST_DRIVER_ID],
        helperIds: [SECOND_DRIVER_ID],
        vehicleId: VEHICLE_ID,
      })
      .catch((caught: unknown) => caught)

    expect((error as ApiError).code).toBe('TRIP_CREW_HELPER_NOT_ELIGIBLE')
    expect((error as ApiError).status).toBe(409)
    expect(fixture.createCalls).toEqual([])
  })

  // Mesma pessoa em driverIds e helperIds é 409, igual à repetição dentro da mesma lista.
  test('refuses the same person as driver and helper', async () => {
    const fixture = createFixture({
      drivers: [
        {
          canActAsHelper: true,
          id: FIRST_DRIVER_ID,
          name: 'Ana Souza',
          status: 'active',
          taxId: '12345678909',
        },
      ],
    })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const error = await useCase
      .create({
        context: CONTEXT,
        driverIds: [FIRST_DRIVER_ID],
        helperIds: [FIRST_DRIVER_ID],
        vehicleId: VEHICLE_ID,
      })
      .catch((caught: unknown) => caught)

    expect((error as ApiError).code).toBe('TRIP_DRIVER_DUPLICATED')
    expect(fixture.createCalls).toEqual([])
  })

  // T18 (revisão): a padrão só vale quando ainda é, de fato, uma carreta ativa livre desta empresa.
  test('copies the tractor default trailer into the trip when it is a free active trailer', async () => {
    const fixture = createFixture({ vehicle: { ...VEHICLE, defaultTrailerVehicleId: TRAILER.id } })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    await useCase.create({ context: CONTEXT, driverIds: [], vehicleId: VEHICLE_ID })

    expect(fixture.createCalls).toEqual([expect.objectContaining({ trailerVehicleId: TRAILER.id })])
  })

  test('never copies the default trailer when it is already in an open trip', async () => {
    const fixture = createFixture({
      vehicle: { ...VEHICLE, defaultTrailerVehicleId: TRAILER.id },
      trailerInOpenTrip: true,
    })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    await useCase.create({ context: CONTEXT, driverIds: [], vehicleId: VEHICLE_ID })

    expect(fixture.createCalls).toEqual([expect.objectContaining({ trailerVehicleId: null })])
  })

  test('never copies the default trailer when it is no longer an active trailer', async () => {
    const fixture = createFixture({
      vehicle: { ...VEHICLE, defaultTrailerVehicleId: TRAILER.id },
      trailerVehicle: { ...TRAILER, status: 'inactive' },
    })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    await useCase.create({ context: CONTEXT, driverIds: [], vehicleId: VEHICLE_ID })

    expect(fixture.createCalls).toEqual([expect.objectContaining({ trailerVehicleId: null })])
  })

  test('never copies the default trailer when it no longer exists in this company', async () => {
    const fixture = createFixture({
      vehicle: { ...VEHICLE, defaultTrailerVehicleId: TRAILER.id },
      trailerVehicle: null,
    })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    await useCase.create({ context: CONTEXT, driverIds: [], vehicleId: VEHICLE_ID })

    expect(fixture.createCalls).toEqual([expect.objectContaining({ trailerVehicleId: null })])
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

  test('closing an already closed trip is idempotent', async () => {
    const closedTrip = openTrip({ status: 'completed' })
    const fixture = createFixture({ stored: closedTrip })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const closed = await useCase.close({
      context: CONTEXT,
      correlationId: CORRELATION_ID,
      ipAddress: IP_ADDRESS,
      reason: null,
      tripId: TRIP_ID,
    })

    expect(closed).toEqual(closedTrip)
    expect(fixture.closeCalls).toEqual([])
  })

  // spec 158 T12 (PERGUNTAS-ABERTAS #28): `close` passa por `checkTripTransition`, então uma
  // viagem cancelada nunca vira `completed` pelo botão de encerrar.
  test('refuses to close a cancelled trip', async () => {
    const fixture = createFixture({ stored: openTrip({ status: 'cancelled' }) })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const error = await useCase
      .close({
        context: CONTEXT,
        correlationId: CORRELATION_ID,
        ipAddress: IP_ADDRESS,
        reason: null,
        tripId: TRIP_ID,
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('STATE_TRANSITION_NOT_ALLOWED')
    expect((error as ApiError).status).toBe(409)
    expect(fixture.closeCalls).toEqual([])
  })

  // spec 156 T8c (ADR-0067): nota em aberto (nem entregue, nem devolvida, nem liberada) exige motivo.
  test('refuses to close a trip with an open document and no reason', async () => {
    const fixture = createFixture({ stored: openTrip({ documents: [documentDetail()] }) })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const error = await useCase
      .close({
        context: CONTEXT,
        correlationId: CORRELATION_ID,
        ipAddress: IP_ADDRESS,
        reason: null,
        tripId: TRIP_ID,
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripCloseReasonRequiredError)
    expect((error as ApiError).code).toBe('TRIP_CLOSE_REASON_REQUIRED')
    expect(fixture.closeCalls).toEqual([])
  })

  test('closes a trip with an open document when a reason is given', async () => {
    const fixture = createFixture({ stored: openTrip({ documents: [documentDetail()] }) })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const closed = await useCase.close({
      context: CONTEXT,
      correlationId: CORRELATION_ID,
      ipAddress: IP_ADDRESS,
      reason: 'Canhotos recebidos no escritório',
      tripId: TRIP_ID,
    })

    expect(closed.status).toBe('completed')
    expect(fixture.closeCalls).toEqual([
      {
        actorUserId: USER_ID,
        channel: 'backoffice',
        closeReason: 'Canhotos recebidos no escritório',
        companyId: COMPANY_ID,
        correlationId: CORRELATION_ID,
        ipAddress: IP_ADDRESS,
        onBehalfOfDriverId: null,
        tripId: TRIP_ID,
      },
    ])
  })

  // Com todas as notas fechadas (entregue, devolvida ou liberada), o motivo é opcional.
  test('closes a trip without a reason when every document is settled', async () => {
    const fixture = createFixture({
      stored: openTrip({
        documents: [
          documentDetail({
            deliveredAt: '2026-08-02T09:00:00.000Z',
            separationStatus: 'delivered',
          }),
          documentDetail({ releasedAt: '2026-08-02T09:00:00.000Z' }),
        ],
      }),
    })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const closed = await useCase.close({
      context: CONTEXT,
      correlationId: CORRELATION_ID,
      ipAddress: IP_ADDRESS,
      reason: null,
      tripId: TRIP_ID,
    })

    expect(closed.status).toBe('completed')
    expect(fixture.closeCalls).toHaveLength(1)
  })

  test('refuses to link or release documents on a completed trip', async () => {
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
    const releaseError = await useCase
      .releaseDocument({ context: CONTEXT, documentId: DOCUMENT_ID, tripId: TRIP_ID })
      .catch((caught: unknown) => caught)

    expect((linkError as ApiError).code).toBe('STATE_TRANSITION_NOT_ALLOWED')
    expect((linkError as ApiError).status).toBe(409)
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

    await useCase.close({
      context: CONTEXT,
      correlationId: CORRELATION_ID,
      ipAddress: IP_ADDRESS,
      reason: null,
      tripId: TRIP_ID,
    })

    expect(purged).toEqual([{ companyId: CONTEXT.companyId, tripId: TRIP_ID }])
  })

  /**
   * Spec 216: define/troca a tripulação enquanto a viagem está `awaiting_crew` ou `draft` — antes
   * do roteiro planejado, nada calculado a partir do veículo (pedágio) foi congelado ainda.
   */
  test('updates the crew of a draft trip, resolving the new vehicle and driver ordering', async () => {
    const fixture = createFixture({ stored: openTrip({ status: 'draft' }) })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const trip = await useCase.updateCrew({
      context: CONTEXT,
      driverIds: [SECOND_DRIVER_ID],
      tripId: TRIP_ID,
      vehicleId: VEHICLE_ID,
    })

    expect(trip.status).toBe('draft')
    expect(trip.drivers).toEqual([
      {
        driverEmail: '',
        driverId: SECOND_DRIVER_ID,
        driverName: 'Bruno Lima',
        driverPhone: '',
        driverTaxId: '98765432100',
        position: 1,
        role: 'driver',
      },
    ])
    expect(fixture.updateCrewCalls).toEqual([
      {
        actorUserId: USER_ID,
        channel: 'backoffice',
        companyId: COMPANY_ID,
        crew: trip.drivers.map((driver) => ({
          driverId: driver.driverId,
          driverName: driver.driverName,
          driverTaxId: driver.driverTaxId,
          position: driver.position,
          role: driver.role,
        })),
        tripId: TRIP_ID,
        vehicleId: VEHICLE_ID,
      },
    ])
  })

  /**
   * Spec 217 D2, substituindo a recusa que a 216 colocava aqui: a troca **passou a ser permitida**
   * em `route_planned`. É a necessidade operacional que abriu esta spec — trocar o motorista de uma
   * viagem já roteirizada. Quem decide o destino do roteiro é o repositório, sob lock, pela
   * comparação do veículo (D3-ter); o caso de uso só não pode mais barrar.
   */
  test('lets the crew be swapped once the route is planned', async () => {
    const fixture = createFixture({ stored: openTrip({ status: 'route_planned' }) })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    await useCase.updateCrew({
      context: CONTEXT,
      driverIds: [SECOND_DRIVER_ID],
      tripId: TRIP_ID,
      vehicleId: VEHICLE_ID,
    })

    /**
     * O que importa aqui é o caso de uso **deixar passar** — o conteúdo gravado é provado contra
     * Postgres na T307 (`test/integration/trip-crew-update.integration.ts`), onde há banco para ler.
     */
    expect(fixture.updateCrewCalls).toHaveLength(1)
  })

  /** Spec 217 D2: a porta que fecha é a separação, e fecha sem tocar no repositório. */
  test('refuses to update the crew once separation started, without touching the repository', async () => {
    const fixture = createFixture({ stored: openTrip({ status: 'separating' }) })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    await expect(
      useCase.updateCrew({
        context: CONTEXT,
        driverIds: [SECOND_DRIVER_ID],
        tripId: TRIP_ID,
        vehicleId: VEHICLE_ID,
      }),
    ).rejects.toThrow(TripStateTransitionNotAllowedError)
    expect(fixture.updateCrewCalls).toEqual([])
  })
})

/** D6: vincular ou desvincular nota muda as paradas — recalcula a rota com `cheapest`, D5 valendo. */
describe('trip document link/release route recalculation (D6)', () => {
  test('recalculates the route with cheapest after linking a document', async () => {
    const fixture = createFixture()
    const routeFreezer = createFreezer()
    const useCase = createTripUseCase({
      locations: purgeSpy(),
      repository: fixture.repository,
      routeFreezer,
    })

    await useCase.linkDocument({
      context: CONTEXT,
      freightCalculationId: null,
      nfeDocumentId: NFE_DOCUMENT_ID,
      tripId: TRIP_ID,
    })

    expect(routeFreezer.freezeCalls).toEqual([{ companyId: COMPANY_ID, tripId: TRIP_ID }])
  })

  test('links the document even when the route freezer fails (D5, OSRM fora do ar)', async () => {
    const fixture = createFixture()
    const routeFreezer = createFreezer({ shouldFail: true })
    const useCase = createTripUseCase({
      locations: purgeSpy(),
      repository: fixture.repository,
      routeFreezer,
    })

    const linked = await useCase.linkDocument({
      context: CONTEXT,
      freightCalculationId: null,
      nfeDocumentId: NFE_DOCUMENT_ID,
      tripId: TRIP_ID,
    })

    expect(linked.nfeDocumentId).toBe(NFE_DOCUMENT_ID)
  })

  test('recalculates the route with cheapest after releasing a document', async () => {
    const fixture = createFixture()
    const routeFreezer = createFreezer()
    const useCase = createTripUseCase({
      locations: purgeSpy(),
      repository: fixture.repository,
      routeFreezer,
    })

    await useCase.releaseDocument({ context: CONTEXT, documentId: DOCUMENT_ID, tripId: TRIP_ID })

    expect(routeFreezer.freezeCalls).toEqual([{ companyId: COMPANY_ID, tripId: TRIP_ID }])
  })

  test('releases the document even when the route freezer fails (D5, OSRM fora do ar)', async () => {
    const fixture = createFixture()
    const routeFreezer = createFreezer({ shouldFail: true })
    const useCase = createTripUseCase({
      locations: purgeSpy(),
      repository: fixture.repository,
      routeFreezer,
    })

    const released = await useCase.releaseDocument({
      context: CONTEXT,
      documentId: DOCUMENT_ID,
      tripId: TRIP_ID,
    })

    expect(released.releasedAt).not.toBeNull()
  })
})

// Feature 147 T10: montar a viagem inclui escolher a carreta que o cavalo puxa.
describe('setTrailer', () => {
  const TRAILER_ID = '44444444-4444-4444-8444-444444444447'

  test('links an active trailer of the company to a tractor unit trip', async () => {
    const fixture = createFixture()
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const trip = await useCase.setTrailer({
      context: CONTEXT,
      trailerVehicleId: TRAILER_ID,
      tripId: TRIP_ID,
    })

    expect(trip.trailer).toEqual({ bodyType: '02', id: TRAILER_ID, plate: 'XYZ9A88' })
    expect(fixture.setTrailerCalls).toEqual([
      { companyId: COMPANY_ID, tripId: TRIP_ID, trailerVehicleId: TRAILER_ID },
    ])
  })

  test('is idempotent: repeating the same value never writes', async () => {
    const fixture = createFixture({ stored: openTrip({ trailer: null }) })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const trip = await useCase.setTrailer({
      context: CONTEXT,
      trailerVehicleId: null,
      tripId: TRIP_ID,
    })

    expect(trip.trailer).toBeNull()
    expect(fixture.setTrailerCalls).toEqual([])
  })

  test('refuses a trailer for a trip whose vehicle is not a tractor unit', async () => {
    const fixture = createFixture({
      vehicle: {
        defaultTrailerVehicleId: null,
        id: VEHICLE_ID,
        role: 'traction',
        status: 'active',
        vehicleType: 'truck',
      },
    })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const error = await useCase
      .setTrailer({ context: CONTEXT, trailerVehicleId: TRAILER_ID, tripId: TRIP_ID })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)
    expect((error as ApiError).code).toBe('TRIP_TRAILER_REQUIRES_TRACTOR')
    expect(fixture.setTrailerCalls).toEqual([])
  })

  test('answers 404 when the pointed vehicle does not exist in this company', async () => {
    const fixture = createFixture({ trailerVehicle: null })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const error = await useCase
      .setTrailer({ context: CONTEXT, trailerVehicleId: TRAILER_ID, tripId: TRIP_ID })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
    expect(fixture.setTrailerCalls).toEqual([])
  })

  test('refuses a pointed vehicle that is not an active trailer', async () => {
    const fixture = createFixture({
      trailerVehicle: {
        defaultTrailerVehicleId: null,
        id: TRAILER_ID,
        role: 'trailer',
        status: 'inactive',
        vehicleType: '',
      },
    })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const error = await useCase
      .setTrailer({ context: CONTEXT, trailerVehicleId: TRAILER_ID, tripId: TRIP_ID })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)
    expect((error as ApiError).code).toBe('TRIP_TRAILER_NOT_A_TRAILER')
    expect(fixture.setTrailerCalls).toEqual([])
  })

  test('refuses a trailer already linked to another open trip', async () => {
    const fixture = createFixture({ trailerInOpenTrip: true })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const error = await useCase
      .setTrailer({ context: CONTEXT, trailerVehicleId: TRAILER_ID, tripId: TRIP_ID })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
    expect((error as ApiError).code).toBe('TRIP_TRAILER_IN_USE')
    expect(fixture.setTrailerCalls).toEqual([])
  })

  test('refuses to change the trailer after the trip was dispatched', async () => {
    const fixture = createFixture({ stored: openTrip({ status: 'dispatched', trailer: null }) })
    const useCase = createTripUseCase({ locations: purgeSpy(), repository: fixture.repository })

    const error = await useCase
      .setTrailer({ context: CONTEXT, trailerVehicleId: TRAILER_ID, tripId: TRIP_ID })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
    expect((error as ApiError).code).toBe('STATE_TRANSITION_NOT_ALLOWED')
    expect(fixture.setTrailerCalls).toEqual([])
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

function createFreezer(
  options: { readonly shouldFail?: boolean } = {},
): PlanTripRouteTollFreezer & { readonly freezeCalls: unknown[] } {
  const freezeCalls: unknown[] = []
  return {
    freezeCalls,
    async freeze(input) {
      freezeCalls.push(input)
      if (options.shouldFail === true) throw new Error('OSRM indisponível')
      return { routeFrozen: true }
    },
  }
}
