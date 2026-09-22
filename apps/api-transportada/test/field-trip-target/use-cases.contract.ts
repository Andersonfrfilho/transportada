/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T3: os mesmos casos de uso de campo servem ao motorista e ao escritório. O que muda é o
 * alvo que chega às portas — nunca a regra.
 */
import { describe, expect, it } from 'bun:test'

import type { TripStatus } from '../../src/database/trip.schema.js'
import { ApiError } from '../../src/shared/api.error.js'
import {
  attachDeliveryProof,
  type DeliveryProofPort,
} from '../../src/trips/application/attach-delivery-proof.use-case.js'
import type {
  DriverFieldReportTransactionPort,
  DriverFieldReportUnitOfWork,
} from '../../src/trips/application/driver-field-report.port.js'
import type {
  FieldTripLocator,
  ResolvedTripFieldTarget,
} from '../../src/trips/application/field-trip-target.types.js'
import { DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS } from '../../src/trips/domain/delivery-proof-settings.policy.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import { reportStopArrival } from '../../src/trips/application/report-stop-arrival.use-case.js'
import { reportStopOccurrence } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import { resolveFieldTripTarget } from '../../src/trips/application/resolve-field-trip-target.use-case.js'
import { startFieldTrip } from '../../src/trips/application/start-field-trip.use-case.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'
const STOP_ID = '00000000-0000-4000-8000-000000000005'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000006'
const NOW = new Date('2026-09-18T13:00:00.000Z')

const TRIP_TARGET = { kind: 'trip', tripId: TRIP_ID } as const
const DRIVER_TARGET = { driverId: DRIVER_ID, kind: 'driver' } as const

async function resolveTarget(tripStatus: TripStatus): Promise<ResolvedTripFieldTarget> {
  return resolveFieldTripTarget({
    companyId: COMPANY_ID,
    repository: {
      findTripCrew: async () => ({
        drivers: [{ driverId: DRIVER_ID, position: 1 }],
        tripId: TRIP_ID,
        tripStatus,
      }),
    },
    target: { kind: 'trip', tripId: TRIP_ID },
  })
}

/** O dublê da 057 embrulhado por um espião das consultas — sem editar o dublê. */
function buildFieldWorld() {
  const state = createFieldReportState()
  state.stops.set(STOP_ID, {
    arrivedAt: null,
    estimatedArrivalAt: null,
    tripId: TRIP_ID,
    tripStatus: 'in_transit',
  })
  state.documents.set(DOCUMENT_ID, {
    separationStatus: 'loaded',
    stopId: STOP_ID,
    tripId: TRIP_ID,
    tripStatus: 'in_transit',
  })
  const inner = createFieldReportUnitOfWork(state)
  const lookups: unknown[] = []

  const unitOfWork: DriverFieldReportUnitOfWork = {
    execute<TResult>(
      operation: (transaction: DriverFieldReportTransactionPort) => Promise<TResult>,
    ): Promise<TResult> {
      return inner.execute((transaction) =>
        operation({
          ...transaction,
          findDocumentForDriver: (input) => {
            lookups.push(input)
            return transaction.findDocumentForDriver(input)
          },
          findStopForDriver: (input) => {
            lookups.push(input)
            return transaction.findStopForDriver(input)
          },
        }),
      )
    },
  }

  return { lookups, state, unitOfWork }
}

function buildProofRepository() {
  const lookups: unknown[] = []
  const repository: DeliveryProofPort = {
    findDeliveryContext: async () => ({
      deliveredAt: new Date('2026-09-18T12:00:00.000Z'),
      deliveryEventPosition: undefined,
      stopPosition: undefined,
    }),
    findDeliveryEventId: async (input) => {
      lookups.push(input)
      return 'event-1'
    },
    findProofIdByAttachmentKey: async () => null,
    findProofPunctuality: async () => null,
    resolveProofFieldSettings: async () => ({
      photo: 'optional',
      receiverDocument: 'off',
      receiverName: 'optional',
      signature: 'optional',
    }),
    resolveProofPunctualitySettings: async () => DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
    saveProof: async () => ({ id: 'proof-1' }),
  }
  return { lookups, repository }
}

function buildStartRepository(input: {
  readonly rereadStatus?: TripStatus
  readonly updates?: readonly boolean[]
}) {
  const updates: unknown[] = []
  const pending = [...(input.updates ?? [true])]
  let readCurrentCalls = 0

  return {
    get readCurrentCalls(): number {
      return readCurrentCalls
    },
    repository: {
      async readCurrent() {
        readCurrentCalls += 1
        return null
      },
      async readStatus() {
        return input.rereadStatus ?? null
      },
      async updateStatus(update: {
        readonly actorUserId: string
        readonly companyId: string
        readonly expectedStatus: TripStatus
        readonly tripId: string
        readonly tripStatus: TripStatus
      }) {
        updates.push(update)
        return pending.shift() ?? true
      },
    },
    updates,
  }
}

async function expectApiError(operation: Promise<unknown>, code: string): Promise<void> {
  try {
    await operation
    throw new Error('EXPECTED_API_ERROR')
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe(code)
  }
}

describe('o alvo que chega às portas de campo (spec 156 T3)', () => {
  it('chegada: o escritório busca a parada pela viagem, o motorista pelo vínculo', async () => {
    const office = buildFieldWorld()
    await reportStopArrival({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      idempotencyKey: 'office-arrival',
      location: null,
      now: NOW,
      stopId: STOP_ID,
      target: await resolveTarget('in_transit'),
      unitOfWork: office.unitOfWork,
    })
    expect(office.lookups).toEqual([
      { companyId: COMPANY_ID, stopId: STOP_ID, target: TRIP_TARGET },
    ])

    const driver = buildFieldWorld()
    await reportStopArrival({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      idempotencyKey: 'driver-arrival',
      location: null,
      now: NOW,
      stopId: STOP_ID,
      unitOfWork: driver.unitOfWork,
    })
    expect(driver.lookups).toEqual([
      { companyId: COMPANY_ID, stopId: STOP_ID, target: DRIVER_TARGET },
    ])
  })

  it('entrega: a nota é buscada pela viagem do alvo', async () => {
    const office = buildFieldWorld()
    const result = await reportDocumentDelivery({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      idempotencyKey: 'office-delivery',
      location: null,
      now: NOW,
      /**
       * Spec 156 T6, ADR-0067 §3: o canal `office` valida `deliveredAt` contra "agora" — sem isto o
       * teste ficaria refém do relógio de parede em vez do `NOW` fixo do arquivo.
       */
      recordedAt: NOW,
      target: await resolveTarget('in_transit'),
      unitOfWork: office.unitOfWork,
    })

    expect(office.lookups).toEqual([
      { companyId: COMPANY_ID, documentId: DOCUMENT_ID, target: TRIP_TARGET },
    ])
    expect(result.alreadySettled).toBe(false)
  })

  it('ocorrência de parada: parada e nota pelo mesmo alvo', async () => {
    const office = buildFieldWorld()
    await reportStopOccurrence({
      actorUserId: ACTOR_USER_ID,
      attachmentObjectId: null,
      companyId: COMPANY_ID,
      description: 'Doca fechada',
      distanceMeters: null,
      documentId: DOCUMENT_ID,
      idempotencyKey: 'office-occurrence',
      kind: 'long_wait',
      stopId: STOP_ID,
      target: await resolveTarget('in_transit'),
      unitOfWork: office.unitOfWork,
    })

    expect(office.lookups).toEqual([
      { companyId: COMPANY_ID, stopId: STOP_ID, target: TRIP_TARGET },
      { companyId: COMPANY_ID, documentId: DOCUMENT_ID, target: TRIP_TARGET },
    ])
  })

  it('comprovante: o evento de entrega é buscado pela viagem do alvo', async () => {
    const proof = buildProofRepository()
    await attachDeliveryProof({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      newObjectId: () => 'object-1',
      newProofId: () => 'proof-1',
      now: new Date('2026-09-18T12:00:00.000Z'),
      repository: proof.repository,
      sealDocument: () => Promise.reject(new Error('DOCUMENT_MUST_NOT_BE_SEALED_HERE')),
      storage: { store: async () => ({ sha256: 'a'.repeat(64) }) },
      target: await resolveTarget('completed'),
      upload: {
        attachmentKey: '',
        bytes: new Uint8Array(16),
        capturedAt: undefined,
        kind: 'photo',
        mimeType: 'image/jpeg',
        position: undefined,
        receiverDocument: '',
        receiverName: '',
      },
    })

    expect(proof.lookups).toEqual([
      { companyId: COMPANY_ID, documentId: DOCUMENT_ID, target: TRIP_TARGET },
    ])
  })

  it('ocorrência da nota (spec 079): a nota alcançável é buscada pela viagem do alvo', async () => {
    const lookups: unknown[] = []
    await registerDriverOccurrence({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      note: '',
      occurrenceTypeId: 'type-1',
      productCode: '',
      repository: {
        findOccurrenceType: async () => ({
          active: true,
          allowsMultipleItems: true,
          emailBody: '',
          emailSubject: '',
          emailTemplateKey: null,
          id: 'type-1',
          name: 'Recusa',
          notifies: false,
          stage: 'delivery',
        }),
        findReachableDocument: async (input) => {
          lookups.push(input)
          return { tripId: TRIP_ID }
        },
        listDocumentProducts: async () => [],
        saveOccurrence: async () => ({
          createdAt: '2026-09-18T13:00:00.000Z',
          id: 'occurrence-1',
          note: '',
          occurrenceTypeId: 'type-1',
          productCode: '',
          stage: 'delivery',
          typeName: 'Recusa',
        }),
      },
      target: await resolveTarget('in_transit'),
    })

    expect(lookups).toEqual([
      { companyId: COMPANY_ID, documentId: DOCUMENT_ID, target: TRIP_TARGET },
    ])
  })
})

describe('os dois toques do campo pelo escritório (spec 156 T3)', () => {
  it('não lê a viagem atual de motorista nenhum: usa a viagem resolvida', async () => {
    const world = buildStartRepository({})

    const result = await startFieldTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      repository: world.repository,
      step: 'confirmLoad',
      target: await resolveTarget('dispatched'),
    })

    expect(world.readCurrentCalls).toBe(0)
    expect(result).toEqual({ changed: true, tripId: TRIP_ID, tripStatus: 'in_transit' })
    expect(world.updates).toEqual([
      {
        actorUserId: ACTOR_USER_ID,
        channel: 'office',
        companyId: COMPANY_ID,
        expectedStatus: 'dispatched',
        onBehalfOfDriverId: DRIVER_ID,
        tripId: TRIP_ID,
        tripStatus: 'in_transit',
      },
    ])
  })

  it('viagem concluída recusa com 409, sem gravar', async () => {
    const world = buildStartRepository({})

    await expectApiError(
      startFieldTrip({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        repository: world.repository,
        step: 'startRoute',
        target: await resolveTarget('completed'),
      }),
      'STATE_TRANSITION_NOT_ALLOWED',
    )
    expect(world.updates).toEqual([])
  })
})

describe('a gravação do status é compare-and-set (spec 156 T3, R2)', () => {
  it('perdeu a corrida para completed: relê e recusa com 409, sem regredir', async () => {
    const world = buildStartRepository({ rereadStatus: 'completed', updates: [false] })

    await expectApiError(
      startFieldTrip({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        repository: world.repository,
        step: 'confirmLoad',
        target: await resolveTarget('dispatched'),
      }),
      'STATE_TRANSITION_NOT_ALLOWED',
    )
    expect(world.updates).toHaveLength(1)
  })

  it('perdeu a corrida para o mesmo passo: converge em changed: false', async () => {
    const world = buildStartRepository({ rereadStatus: 'in_transit', updates: [false] })

    const result = await startFieldTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      repository: world.repository,
      step: 'confirmLoad',
      target: await resolveTarget('dispatched'),
    })

    expect(result).toEqual({ changed: false, tripId: TRIP_ID, tripStatus: 'in_transit' })
  })

  it('perdeu a corrida para a conferência: o início do trajeto ainda vale sobre o status novo', async () => {
    const world = buildStartRepository({ rereadStatus: 'in_transit', updates: [false, true] })

    const result = await startFieldTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      repository: world.repository,
      step: 'startRoute',
      target: await resolveTarget('dispatched'),
    })

    expect(result).toEqual({ changed: true, tripId: TRIP_ID, tripStatus: 'on_delivery_route' })
    expect(world.updates).toMatchObject([
      { expectedStatus: 'dispatched' },
      { expectedStatus: 'in_transit' },
    ])
  })

  /**
   * Spec 156 T15: as três voltas esgotadas sem gravar não são "nada mudou" — o toque não aconteceu,
   * e `changed: false` mentia para quem clicou. 409 com código próprio, sem gravar.
   */
  it('esgotou as tentativas sem gravar: 409 TRIP_STATUS_WRITE_CONFLICT', async () => {
    const world = buildStartRepository({
      rereadStatus: 'dispatched',
      updates: [false, false, false, false],
    })

    await expectApiError(
      startFieldTrip({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        repository: world.repository,
        step: 'confirmLoad',
        target: await resolveTarget('dispatched'),
      }),
      'TRIP_STATUS_WRITE_CONFLICT',
    )
    expect(world.updates).toHaveLength(3)
  })

  it('a viagem sumiu entre a leitura e a gravação: TRIP_NOT_FOUND', async () => {
    const world = buildStartRepository({ updates: [false] })

    await expectApiError(
      startFieldTrip({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        repository: world.repository,
        step: 'confirmLoad',
        target: await resolveTarget('dispatched'),
      }),
      'TRIP_NOT_FOUND',
    )
  })
})

describe('o localizador não se forja (spec 156 T3, R3 e R4)', () => {
  it('só resolveFieldTripTarget constrói o alvo resolvido, e motorista e alvo não andam juntos', async () => {
    const forged = {
      kind: 'trip',
      onBehalfOfDriverId: DRIVER_ID,
      tripId: TRIP_ID,
      tripStatus: 'dispatched',
    } as const
    // @ts-expect-error R4: um literal não tem a marca que só o resolvedor põe.
    const forgedTarget: ResolvedTripFieldTarget = forged
    expect(forgedTarget.tripId).toBe(TRIP_ID)

    const target = await resolveTarget('dispatched')
    // @ts-expect-error R3: o motorista logado e o alvo do escritório são exclusivos.
    const both: FieldTripLocator = { driverId: DRIVER_ID, target }
    expect('target' in both).toBe(true)
  })
})
