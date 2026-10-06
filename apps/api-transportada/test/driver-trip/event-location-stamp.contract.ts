/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0081 §3/§4 / spec 196 T3.3: o ponto do toque chega até a porta que grava. Só o toque do
 * motorista carimba; o escritório, a troca derivada e o toque repetido sem efeito não.
 */
import { describe, expect, test } from 'bun:test'

import { EVENT_LOCATION_STATES } from '../../src/database/event-location.schema.js'
import type { TripStatus } from '../../src/database/trip.schema.js'
import type { ResolvedTripFieldTarget } from '../../src/trips/application/field-trip-target.types.js'
import { dispatchDriverTrip } from '../../src/trips/application/dispatch-driver-trip.use-case.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import { reportStopOccurrence } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import { resolveFieldTripTarget } from '../../src/trips/application/resolve-field-trip-target.use-case.js'
import {
  FIELD_TRIP_STEP,
  startFieldTrip,
  type FieldTripStep,
  type StartFieldTripPort,
} from '../../src/trips/application/start-field-trip.use-case.js'
import { NO_EVENT_LOCATION_STAMP } from '../../src/trips/domain/event-location-stamp.policy.js'
import type { EventLocationStampColumns } from '../../src/trips/domain/event-location-stamp.types.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import { createFieldReportState, createFieldReportUnitOfWork } from './field-report.double.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'
const STOP_ID = '00000000-0000-4000-8000-000000000005'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000006'
const OCCURRENCE_TYPE_ID = '00000000-0000-4000-8000-0000000000e1'

const POINT = {
  accuracyMeters: '12.50',
  capturedAt: '2026-10-02T12:00:00.000Z',
  latitude: '-23.5505200',
  longitude: '-46.6333090',
} as const

const CAPTURED_STAMP: EventLocationStampColumns = {
  accuracyMeters: '12.50',
  capturedAt: new Date('2026-10-02T12:00:00.000Z'),
  latitude: '-23.5505200',
  locationState: EVENT_LOCATION_STATES.captured,
  longitude: '-46.6333090',
}

const UNAVAILABLE_STAMP: EventLocationStampColumns = {
  ...NO_EVENT_LOCATION_STAMP,
  locationState: EVENT_LOCATION_STATES.unavailable,
}

async function resolveOfficeTarget(tripStatus: TripStatus): Promise<ResolvedTripFieldTarget> {
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

describe('o despacho do motorista leva o carimbo (T3.3)', () => {
  async function dispatchWith(location: typeof POINT | null) {
    const requests: Array<{ readonly locationStamp: EventLocationStampColumns }> = []
    await dispatchDriverTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      dispatch: async (request) => {
        requests.push(request)
        return { tripStatus: 'dispatched' }
      },
      driverId: DRIVER_ID,
      linkage: { findCrewRole: async () => 'driver' },
      location,
      tripId: TRIP_ID,
    })

    return requests
  }

  test('com ponto, o despacho recebe captured e as quatro colunas', async () => {
    expect((await dispatchWith(POINT)).map((request) => request.locationStamp)).toEqual([
      CAPTURED_STAMP,
    ])
  })

  test('sem ponto, o despacho recebe unavailable — ele tocou e a posição não veio', async () => {
    expect((await dispatchWith(null)).map((request) => request.locationStamp)).toEqual([
      UNAVAILABLE_STAMP,
    ])
  })
})

describe('conferir a carga e iniciar a rota levam o carimbo (T3.3)', () => {
  function buildRepository(tripStatus: TripStatus) {
    const written: Array<{ readonly locationStamp?: EventLocationStampColumns }> = []
    const repository: StartFieldTripPort = {
      readCurrent: async () => ({ role: 'driver', tripId: TRIP_ID, tripStatus }),
      readStatus: async () => tripStatus,
      updateStatus: async (input) => {
        written.push(input)
        return true
      },
    }

    return { repository, written }
  }

  const STEPS: FieldTripStep[] = [FIELD_TRIP_STEP.confirmLoad, FIELD_TRIP_STEP.startRoute]
  const STATUS_BEFORE_STEP = { confirmLoad: 'dispatched', startRoute: 'in_transit' } as const

  test.each(STEPS)('%s do motorista com ponto grava captured', async (step) => {
    const { repository, written } = buildRepository(STATUS_BEFORE_STEP[step])

    await startFieldTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      location: POINT,
      repository,
      step,
    })

    expect(written.map((input) => input.locationStamp)).toEqual([CAPTURED_STAMP])
  })

  test.each(STEPS)('%s do motorista sem ponto grava unavailable', async (step) => {
    for (const location of [null, undefined]) {
      const { repository, written } = buildRepository(STATUS_BEFORE_STEP[step])

      await startFieldTrip({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        driverId: DRIVER_ID,
        ...(location === undefined ? {} : { location }),
        repository,
        step,
      })

      expect(written.map((input) => input.locationStamp)).toEqual([UNAVAILABLE_STAMP])
    }
  })

  test.each(STEPS)('%s pelo escritório não leva carimbo, mesmo com ponto na mão', async (step) => {
    const { repository, written } = buildRepository(STATUS_BEFORE_STEP[step])

    await startFieldTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      location: POINT,
      repository,
      step,
      target: await resolveOfficeTarget(STATUS_BEFORE_STEP[step]),
    })

    expect(written).toHaveLength(1)
    expect(written[0]?.locationStamp).toBeUndefined()
  })

  test('o toque repetido sem efeito não grava evento, então não carimba', async () => {
    const { repository, written } = buildRepository('in_transit')

    const result = await startFieldTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      location: POINT,
      repository,
      step: FIELD_TRIP_STEP.confirmLoad,
    })

    expect(result.changed).toBe(false)
    expect(written).toHaveLength(0)
  })
})

describe('a ocorrência da parada leva o carimbo (T3.3)', () => {
  function buildWorld() {
    const state = createFieldReportState()
    state.stops.set(STOP_ID, {
      arrivedAt: null,
      estimatedArrivalAt: null,
      tripId: TRIP_ID,
      tripStatus: 'in_transit',
    })
    state.stopOccurrenceTypes.set(`${COMPANY_ID}:${OCCURRENCE_TYPE_ID}`, { stopKind: 'other' })

    return { state, unitOfWork: createFieldReportUnitOfWork(state) }
  }

  const COMMON = {
    actorUserId: ACTOR_USER_ID,
    attachmentObjectId: null,
    companyId: COMPANY_ID,
    description: '',
    distanceMeters: null,
    documentId: null,
    kind: 'other',
    stopId: STOP_ID,
  } as const

  test('app com ponto grava captured; sem ponto grava unavailable', async () => {
    for (const [location, expected] of [
      [POINT, CAPTURED_STAMP],
      [null, UNAVAILABLE_STAMP],
    ] as const) {
      const { state, unitOfWork } = buildWorld()

      await reportStopOccurrence({
        ...COMMON,
        driverId: DRIVER_ID,
        idempotencyKey: 'chave-app',
        location,
        unitOfWork,
      })

      expect(state.occurrenceStamps).toEqual([expected])
    }
  })

  test('a ocorrência sem o campo location (item antigo da fila) grava unavailable', async () => {
    const { state, unitOfWork } = buildWorld()

    await reportStopOccurrence({
      ...COMMON,
      driverId: DRIVER_ID,
      idempotencyKey: 'chave-antiga',
      unitOfWork,
    })

    expect(state.occurrenceStamps).toEqual([UNAVAILABLE_STAMP])
  })

  test('o motorista pelo WhatsApp grava unavailable — canal que pede posição e não a recebe', async () => {
    const { state, unitOfWork } = buildWorld()

    await reportStopOccurrence({
      ...COMMON,
      channel: TRIP_FIELD_CHANNELS.whatsapp,
      driverId: DRIVER_ID,
      idempotencyKey: 'chave-whatsapp',
      location: null,
      unitOfWork,
    })

    expect(state.occurrenceStamps).toEqual([UNAVAILABLE_STAMP])
  })

  test('o escritório grava tudo null, mesmo com ponto na mão', async () => {
    const { state, unitOfWork } = buildWorld()

    await reportStopOccurrence({
      ...COMMON,
      idempotencyKey: 'chave-escritorio',
      location: POINT,
      target: await resolveOfficeTarget('in_transit'),
      unitOfWork,
    })

    expect(state.occurrenceStamps).toEqual([NO_EVENT_LOCATION_STAMP])
  })

  test('o reenvio da mesma chave não grava segundo carimbo', async () => {
    const { state, unitOfWork } = buildWorld()
    const input = {
      ...COMMON,
      driverId: DRIVER_ID,
      idempotencyKey: 'chave-reenvio',
      location: POINT,
      unitOfWork,
    }

    await reportStopOccurrence(input)
    await reportStopOccurrence(input)

    expect(state.occurrenceStamps).toEqual([CAPTURED_STAMP])
  })
})

describe('a ocorrência da nota leva o carimbo (T3.3)', () => {
  const readPort = {
    findConfirmedUpload: async () => null,
    findOccurrenceType: async () => ({
      active: true,
      allowsMultipleItems: true,
      emailBody: '',
      emailSubject: '',
      emailTemplateKey: null,
      id: OCCURRENCE_TYPE_ID,
      name: 'Recusa',
      notifies: false,
      stage: 'delivery' as const,
    }),
    findOccurrenceTypeOverrides: async () => ({ contractorOverrides: [], recipientOverrides: [] }),
    findReachableDocument: async () => ({ tripId: TRIP_ID }),
    listDocumentProducts: async () => [{ code: 'ZG-4410', description: 'CAIXA' }],
  }

  function buildUnitOfWork() {
    const state = createFieldReportState({
      documents: new Map([
        [
          DOCUMENT_ID,
          { separationStatus: 'loaded', stopId: null, tripId: TRIP_ID, tripStatus: 'in_transit' },
        ],
      ]),
    })

    return { state, unitOfWork: createFieldReportUnitOfWork(state) }
  }

  async function register(params: {
    readonly channel?: typeof TRIP_FIELD_CHANNELS.whatsapp
    readonly location?: typeof POINT | null
  }) {
    const { state, unitOfWork } = buildUnitOfWork()
    await registerDriverOccurrence({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      driverId: DRIVER_ID,
      idempotencyKey: 'chave-nota',
      note: 'recusou',
      occurrenceTypeId: OCCURRENCE_TYPE_ID,
      productCode: '',
      repository: readPort,
      unitOfWork,
      ...(params.channel === undefined ? {} : { channel: params.channel }),
      ...(params.location === undefined ? {} : { location: params.location }),
    })

    return state.documentOccurrenceStamps
  }

  test('app com ponto grava captured; sem ponto grava unavailable', async () => {
    expect(await register({ location: POINT })).toEqual([CAPTURED_STAMP])
    expect(await register({ location: null })).toEqual([UNAVAILABLE_STAMP])
    expect(await register({})).toEqual([UNAVAILABLE_STAMP])
  })

  test('o motorista pelo WhatsApp grava unavailable', async () => {
    expect(await register({ channel: TRIP_FIELD_CHANNELS.whatsapp, location: null })).toEqual([
      UNAVAILABLE_STAMP,
    ])
  })
})
