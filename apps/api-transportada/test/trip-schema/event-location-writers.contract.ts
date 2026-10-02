/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0081 §3/§4 / spec 196 T3.3: os escritores das quatro tabelas de evento que o motorista toca
 * gravam o carimbo que a política decidiu — e só ele. Transação de mentira que guarda o que o
 * `INSERT` recebeu: o SQL de verdade é da integração (T3.5), aqui se prova qual valor desce até ele.
 */
import { describe, expect, test } from 'bun:test'

import { EVENT_LOCATION_STATES } from '../../src/database/event-location.schema.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleDriverFieldReportTransaction } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { saveTripOccurrence } from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { recordTripStatusChange } from '../../src/trips/infrastructure/trip-status-event.persistence.js'
import { NO_EVENT_LOCATION_STAMP } from '../../src/trips/domain/event-location-stamp.policy.js'
import type { EventLocationStampColumns } from '../../src/trips/domain/event-location-stamp.types.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'
const STOP_ID = '00000000-0000-4000-8000-000000000005'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000006'

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

const POSITION_KEYS = [
  'accuracyMeters',
  'capturedAt',
  'latitude',
  'locationState',
  'longitude',
] as const

const REPORTED_POINT = {
  accuracyMeters: '12.50',
  capturedAt: '2026-10-02T12:00:00.000Z',
  latitude: '-23.5505200',
  longitude: '-46.6333090',
} as const

type Insert = { readonly values: Record<string, unknown> }

function createFakeTransaction() {
  const inserts: Insert[] = []
  const transaction = {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ values })
        const row = {
          createdAt: new Date('2026-10-02T12:00:00.000Z'),
          id: 'row-1',
          note: '',
          occurrenceTypeId: 'type-1',
          productCode: '',
          stage: 'delivery',
        }
        return { returning: async () => [row] }
      },
    }),
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [{ id: DOCUMENT_ID }] }) }),
    }),
  }

  return { inserts, transaction: transaction as never }
}

function pickPosition(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(POSITION_KEYS.map((key) => [key, values[key]]))
}

describe('recordTripStatusChange grava o carimbo que recebe (T3.3)', () => {
  const base = {
    actorUserId: ACTOR_USER_ID,
    channel: TRIP_FIELD_CHANNELS.driverApp,
    companyId: COMPANY_ID,
    fromStatus: 'route_planned',
    onBehalfOfDriverId: null,
    toStatus: 'dispatched',
    tripId: TRIP_ID,
  } as const

  test.each([
    ['captured', CAPTURED_STAMP],
    ['unavailable', UNAVAILABLE_STAMP],
  ] as const)('o carimbo %s desce até o INSERT', async (_name, stamp) => {
    const { inserts, transaction } = createFakeTransaction()

    await recordTripStatusChange(transaction, { ...base, locationStamp: stamp })

    expect(inserts).toHaveLength(1)
    expect(pickPosition(inserts[0]?.values ?? {})).toEqual(stamp)
  })

  test('sem carimbo — troca derivada, escritório, WhatsApp do operador — nenhuma coluna de posição é escrita', async () => {
    const { inserts, transaction } = createFakeTransaction()

    await recordTripStatusChange(transaction, base)

    expect(pickPosition(inserts[0]?.values ?? {})).toEqual({
      accuracyMeters: undefined,
      capturedAt: undefined,
      latitude: undefined,
      locationState: undefined,
      longitude: undefined,
    })
  })

  test('troca de status que não mudou nada não grava evento, nem carimbo', async () => {
    const { inserts, transaction } = createFakeTransaction()

    await recordTripStatusChange(transaction, {
      ...base,
      locationStamp: CAPTURED_STAMP,
      toStatus: 'route_planned',
    })

    expect(inserts).toHaveLength(0)
  })
})

describe('recordEvent decide o estado pela política de carimbo (T3.3)', () => {
  async function recordEventAs(params: {
    readonly channel: (typeof TRIP_FIELD_CHANNELS)[keyof typeof TRIP_FIELD_CHANNELS]
    readonly location: typeof REPORTED_POINT | null
  }) {
    const { inserts, transaction } = createFakeTransaction()
    const repository = new DrizzleDriverFieldReportTransaction(transaction, 'bucket')

    await repository.recordEvent({
      actorUserId: ACTOR_USER_ID,
      authorship: {
        channel: params.channel,
        onBehalfOfDriverId: params.channel === 'office' ? DRIVER_ID : null,
      },
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      kind: 'delivered',
      location: params.location,
      stopId: STOP_ID,
    })

    return pickPosition(inserts[0]?.values ?? {})
  }

  test('app com ponto grava captured e as quatro colunas', async () => {
    expect(
      await recordEventAs({ channel: TRIP_FIELD_CHANNELS.driverApp, location: REPORTED_POINT }),
    ).toEqual(CAPTURED_STAMP)
  })

  test.each([TRIP_FIELD_CHANNELS.driverApp, TRIP_FIELD_CHANNELS.whatsapp])(
    '%s sem ponto grava unavailable — o motorista tocou',
    async (channel) => {
      expect(await recordEventAs({ channel, location: null })).toEqual(UNAVAILABLE_STAMP)
    },
  )

  test.each([TRIP_FIELD_CHANNELS.office, TRIP_FIELD_CHANNELS.backoffice])(
    '%s grava tudo null, mesmo com ponto na mão',
    async (channel) => {
      for (const location of [REPORTED_POINT, null]) {
        expect(await recordEventAs({ channel, location })).toEqual(NO_EVENT_LOCATION_STAMP)
      }
    },
  )
})

describe('recordOccurrence e saveTripOccurrence gravam o carimbo que recebem (T3.3)', () => {
  async function recordStopOccurrence(stamp: EventLocationStampColumns) {
    const { inserts, transaction } = createFakeTransaction()
    const repository = new DrizzleDriverFieldReportTransaction(transaction, 'bucket')

    await repository.recordOccurrence({
      actorUserId: ACTOR_USER_ID,
      attachmentObjectId: null,
      authorship: { channel: TRIP_FIELD_CHANNELS.driverApp, onBehalfOfDriverId: null },
      companyId: COMPANY_ID,
      description: '',
      distanceMeters: null,
      documentId: null,
      kind: 'other',
      locationStamp: stamp,
      occurrenceTypeId: null,
      stopId: STOP_ID,
    })

    return pickPosition(inserts[0]?.values ?? {})
  }

  async function saveDocumentOccurrence(stamp: EventLocationStampColumns | undefined) {
    const { inserts, transaction } = createFakeTransaction()

    await saveTripOccurrence(transaction, {
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      note: '',
      occurrenceTypeId: 'type-1',
      productCode: '',
      stage: 'delivery',
      tripId: TRIP_ID,
      typeName: 'Recusa',
      ...(stamp === undefined ? {} : { locationStamp: stamp }),
    })

    return pickPosition(inserts[0]?.values ?? {})
  }

  async function saveDocumentOccurrenceThroughRepository(stamp: EventLocationStampColumns) {
    const { inserts, transaction } = createFakeTransaction()
    const repository = new DrizzleDriverFieldReportTransaction(transaction, 'bucket')

    await repository.saveDocumentOccurrence({
      actorUserId: ACTOR_USER_ID,
      attachmentObjectId: null,
      authorship: { channel: TRIP_FIELD_CHANNELS.driverApp, onBehalfOfDriverId: null },
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      locationStamp: stamp,
      note: '',
      occurrenceTypeId: 'type-1',
      productCode: '',
      stage: 'delivery',
      tripId: TRIP_ID,
      typeName: 'Recusa',
    })

    return pickPosition(inserts[0]?.values ?? {})
  }

  test.each([CAPTURED_STAMP, UNAVAILABLE_STAMP])(
    'o repositório do motorista leva o carimbo da ocorrência da nota até o INSERT: %o',
    async (stamp) => {
      expect(await saveDocumentOccurrenceThroughRepository(stamp)).toEqual(stamp)
    },
  )

  test.each([CAPTURED_STAMP, UNAVAILABLE_STAMP, NO_EVENT_LOCATION_STAMP])(
    'a ocorrência da parada grava as cinco colunas do carimbo: %o',
    async (stamp) => {
      expect(await recordStopOccurrence(stamp)).toEqual(stamp)
    },
  )

  test.each([CAPTURED_STAMP, UNAVAILABLE_STAMP])(
    'a ocorrência da nota grava as cinco colunas do carimbo: %o',
    async (stamp) => {
      expect(await saveDocumentOccurrence(stamp)).toEqual(stamp)
    },
  )

  test('a ocorrência da nota sem carimbo — galpão, operador, lote do escritório — não escreve posição', async () => {
    expect(await saveDocumentOccurrence(undefined)).toEqual({
      accuracyMeters: undefined,
      capturedAt: undefined,
      latitude: undefined,
      locationState: undefined,
      longitude: undefined,
    })
  })
})

describe('updateStatus de conferir a carga e iniciar a rota leva o carimbo ao evento de status (T3.3)', () => {
  async function updateStatusWith(
    stamp: EventLocationStampColumns,
    channel: (typeof TRIP_FIELD_CHANNELS)[keyof typeof TRIP_FIELD_CHANNELS],
  ) {
    const { inserts, transaction } = createFakeTransaction()
    const transactionWithUpdate = {
      ...(transaction as object),
      update: () => ({
        set: () => ({ where: () => ({ returning: async () => [{ id: TRIP_ID }] }) }),
      }),
    }
    const database = {
      transaction: async (work: (tx: unknown) => unknown) => work(transactionWithUpdate),
    }
    const repository = new DrizzleCurrentDriverTripRepository(database as never)

    const written = await repository.updateStatus({
      actorUserId: ACTOR_USER_ID,
      channel,
      companyId: COMPANY_ID,
      expectedStatus: 'dispatched',
      locationStamp: stamp,
      onBehalfOfDriverId: channel === 'office' ? DRIVER_ID : null,
      tripId: TRIP_ID,
      tripStatus: 'in_transit',
    })

    return { position: pickPosition(inserts[0]?.values ?? {}), written }
  }

  test.each([CAPTURED_STAMP, UNAVAILABLE_STAMP])(
    'o carimbo do motorista desce até trip_status_events: %o',
    async (stamp) => {
      const { position, written } = await updateStatusWith(stamp, TRIP_FIELD_CHANNELS.driverApp)

      expect(written).toBe(true)
      expect(position).toEqual(stamp)
    },
  )

  test('o do escritório chega vazio e é gravado vazio', async () => {
    const { position } = await updateStatusWith(NO_EVENT_LOCATION_STAMP, TRIP_FIELD_CHANNELS.office)

    expect(position).toEqual(NO_EVENT_LOCATION_STAMP)
  })
})
