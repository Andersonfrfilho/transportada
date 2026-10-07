/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2c, CA5: a leitura do prazo de entrega de uma viagem, sem banco. O que a contagem de
 * consultas promete (+0 sem chegada, +6 com candidata, em série) e o que a degradação promete (erro do
 * calendário vira "sem prazo" com aviso só de ids e código; falha de banco propaga).
 */
import { describe, expect, test } from 'bun:test'

import { stateHolidays } from '../../src/database/state-holiday.schema.js'
import { deliveryAddressOverrides, tripStopEvents } from '../../src/database/trip.schema.js'
import { readTripDeliveryDeadlines } from '../../src/trips/infrastructure/trip-delivery-deadline.support.js'
import type {
  DeliveryDeadlineNote,
  ReadTripDeliveryDeadlinesParams,
} from '../../src/trips/infrastructure/trip-delivery-deadline.support.js'
import type { TripQueryable } from '../../src/trips/infrastructure/trip-queryable.type.js'
import { createRecordingSelectExecutor } from '../fixtures/recording-select-executor.fixture.js'

const COMPANY_ID = '0e0c0c10-0000-4000-8000-000000000001'
const TRIP_ID = '0e0c0c10-0000-4000-8000-0000000000aa'
const SAO_PAULO = '3550308'
const CAMPINAS = '3509502'
/** Quarta-feira 14/10/2026 12:00 em São Paulo. */
const NOW = new Date('2026-10-14T15:00:00.000Z')
const SERIAL_QUERY_COUNT = 6

type Warning = { readonly message: string; readonly metadata: Record<string, unknown> | undefined }

function note(overrides: Partial<DeliveryDeadlineNote> = {}): DeliveryDeadlineNote {
  return {
    arrivedAt: new Date('2026-10-13T15:00:00.000Z'),
    deadlineBusinessDays: 3,
    documentDeliveredAt: null,
    nfeDocumentId: 'nfe-1',
    outcomeKind: 'pending',
    tripDocumentId: 'doc-1',
    ...overrides,
  }
}

function addressIn(cityCode: string | null) {
  return { components: { cityCode } }
}

function buildInput(
  overrides: Partial<ReadTripDeliveryDeadlinesParams> = {},
  warnings: Warning[] = [],
): ReadTripDeliveryDeadlinesParams {
  return {
    companyId: COMPANY_ID,
    context: {
      clock: { now: () => NOW },
      logger: {
        error: () => undefined,
        info: () => undefined,
        warn: (message, metadata) => void warnings.push({ message, metadata }),
      },
    },
    notes: [note()],
    stopAddresses: new Map([['nfe-1', addressIn(SAO_PAULO)]]),
    tripId: TRIP_ID,
    ...overrides,
  }
}

function read(executor: unknown, input: ReadTripDeliveryDeadlinesParams) {
  return readTripDeliveryDeadlines(executor as TripQueryable, input)
}

describe('spec 236 T1.2c — a leitura do prazo de entrega, sem banco', () => {
  test('sem nenhuma chegada não faz consulta alguma (+0)', async () => {
    const { executor, stats } = createRecordingSelectExecutor()

    const result = await read(executor, buildInput({ notes: [note({ arrivedAt: null })] }))

    expect(result.size).toBe(0)
    expect(stats.queryCount).toBe(0)
  })

  test('chegada sem prazo copiado também não paga consulta', async () => {
    const { executor, stats } = createRecordingSelectExecutor()

    await read(executor, buildInput({ notes: [note({ deadlineBusinessDays: null })] }))

    expect(stats.queryCount).toBe(0)
  })

  test('com candidata: desvio, entrega e as quatro do calendário, uma de cada vez (+6)', async () => {
    const { executor, stats } = createRecordingSelectExecutor()

    const result = await read(executor, buildInput())

    expect(stats.queryCount).toBe(SERIAL_QUERY_COUNT)
    expect(stats.maxInFlight).toBe(1)
    expect(result.get('doc-1')).toEqual({
      businessDaysRemaining: 2,
      dueOn: '2026-10-16',
      state: 'on_time',
    })
  })

  test('uma nota ou duzentas, uma cidade ou quarenta: as mesmas seis consultas', async () => {
    const notes = Array.from({ length: 200 }, (_, index) =>
      note({ nfeDocumentId: `nfe-${String(index)}`, tripDocumentId: `doc-${String(index)}` }),
    )
    const stopAddresses = new Map(
      notes.map((entry, index) => [
        entry.nfeDocumentId ?? '',
        addressIn(String(3500000 + (index % 40))),
      ]),
    )
    const { executor, stats } = createRecordingSelectExecutor()

    await read(executor, buildInput({ notes, stopAddresses }))

    expect(stats.queryCount).toBe(SERIAL_QUERY_COUNT)
    expect(stats.maxInFlight).toBe(1)
  })

  test('o desvio manual com cidade manda mais que o endereço da nota', async () => {
    const overrides = new Map([
      [deliveryAddressOverrides, [{ newCityCode: CAMPINAS, tripDocumentId: 'doc-1' }]],
    ])
    const { executor, stats } = createRecordingSelectExecutor({ rowsByTable: overrides })

    await read(executor, buildInput())

    expect(stats.queryCount).toBe(SERIAL_QUERY_COUNT)
  })

  test('o desvio manual sem cidade deixa a nota sem prazo e sem calendário (+2)', async () => {
    const overrides = new Map([
      [deliveryAddressOverrides, [{ newCityCode: null, tripDocumentId: 'doc-1' }]],
    ])
    const { executor, stats } = createRecordingSelectExecutor({ rowsByTable: overrides })

    const result = await read(executor, buildInput())

    expect(result.size).toBe(0)
    expect(stats.queryCount).toBe(2)
  })

  test.each([null, '', 'abc', '99'])(
    'cidade %p do destino físico: sem prazo (+2)',
    async (city) => {
      const { executor, stats } = createRecordingSelectExecutor()

      const result = await read(
        executor,
        buildInput({ stopAddresses: new Map([['nfe-1', addressIn(city)]]) }),
      )

      expect(result.size).toBe(0)
      expect(stats.queryCount).toBe(2)
    },
  )

  test('nota sem endereço de destino resolvido: sem prazo', async () => {
    const { executor } = createRecordingSelectExecutor()

    const result = await read(executor, buildInput({ stopAddresses: new Map() }))

    expect(result.size).toBe(0)
  })

  test('a entrega é medida pelo momento da 234, em dia civil de São Paulo', async () => {
    /** 23:30 de quinta em São Paulo é 02:30 de sexta em UTC: no prazo (vence quinta 15/10). */
    const delivered = new Map([
      [
        tripStopEvents,
        [{ deliveredAt: new Date('2026-10-16T02:30:00.000Z'), tripDocumentId: 'doc-1' }],
      ],
    ])
    const { executor } = createRecordingSelectExecutor({ rowsByTable: delivered })

    const result = await read(
      executor,
      buildInput({
        notes: [note({ deadlineBusinessDays: 2, outcomeKind: 'delivered' })],
      }),
    )

    expect(result.get('doc-1')).toEqual({
      deliveredOn: '2026-10-15',
      dueOn: '2026-10-15',
      state: 'delivered_on_time',
    })
  })

  test('entregue sem evento usa a hora gravada na nota; sem nenhuma, fica sem prazo', async () => {
    const { executor } = createRecordingSelectExecutor()

    const withMoment = await read(
      executor,
      buildInput({
        notes: [
          note({
            documentDeliveredAt: new Date('2026-10-14T15:00:00.000Z'),
            outcomeKind: 'delivered',
          }),
        ],
      }),
    )
    const withoutMoment = await read(
      executor,
      buildInput({ notes: [note({ outcomeKind: 'delivered' })] }),
    )

    expect(withMoment.get('doc-1')?.state).toBe('delivered_on_time')
    expect(withoutMoment.size).toBe(0)
  })

  test('nota devolvida, cancelada ou liberada não aparece; as outras da viagem seguem', async () => {
    const { executor } = createRecordingSelectExecutor()

    const result = await read(
      executor,
      buildInput({
        notes: [
          note({ outcomeKind: 'cancelled', tripDocumentId: 'doc-cancelled' }),
          note({ outcomeKind: 'returned_to_contractor', tripDocumentId: 'doc-returned' }),
          note({ tripDocumentId: 'doc-open' }),
        ],
      }),
    )

    expect([...result.keys()]).toEqual(['doc-open'])
  })

  test('o erro do calendário vira "sem prazo" com aviso só de ids e código, sem derrubar a leitura', async () => {
    const warnings: Warning[] = []
    const corrupt = new Map([
      [
        stateHolidays,
        [{ day: 1, month: 1, name: 'Dado ruim', recurrence: 'yearly', stateIbgeCode: '99' }],
      ],
    ])
    const { executor } = createRecordingSelectExecutor({ rowsByTable: corrupt })

    const result = await read(executor, buildInput({}, warnings))

    expect(result.size).toBe(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.metadata).toEqual({
      code: 'BUSINESS_CALENDAR_UNKNOWN_STATE',
      companyId: COMPANY_ID,
      tripDocumentIds: ['doc-1'],
      tripId: TRIP_ID,
    })
  })

  test('a falha do banco propaga: a leitura da viagem cai como as outras', async () => {
    const failure = new Error('DATABASE_UNAVAILABLE')
    const { executor } = createRecordingSelectExecutor({ rejectWith: failure })

    await expect(read(executor, buildInput())).rejects.toBe(failure)
  })
})
