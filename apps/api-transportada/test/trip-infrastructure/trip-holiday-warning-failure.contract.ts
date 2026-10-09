/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T6.1b (ADR-0100 §6): o aviso de feriado é refinamento do detalhe da viagem. Uma falha do calendário
 * (banco, consulta) só tira o aviso — o detalhe responde, e o log leva só código e ids, nunca a mensagem do erro.
 */
import { describe, expect, test } from 'bun:test'

import { readTripStopHolidayWarnings } from '../../src/trips/infrastructure/trip-holiday-warning.support.js'
import type { TripQueryable } from '../../src/trips/infrastructure/trip-queryable.type.js'
import { createRecordingSelectExecutor } from '../fixtures/recording-select-executor.fixture.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const CAMPINAS = '3509502'
const NOW = new Date('2026-10-21T15:00:00.000Z')
const WARNING_MESSAGE = 'trip_holiday_warning_unavailable'
const LEAKY_FAILURE = new Error('relation holidays failed for cpf 123.456.789-09')

type Warning = { readonly message: string; readonly metadata: unknown }

function stop(id: string) {
  return {
    addressKey: `${CAMPINAS}|13000000|10`,
    completedAt: null,
    estimatedArrivalAt: NOW,
    id,
  }
}

function buildParams(tripId: string, warnings: Warning[] | undefined) {
  return {
    addressOf: () => undefined,
    calendars: new Map(),
    companyId: COMPANY_ID,
    ...(warnings === undefined
      ? {}
      : {
          logger: {
            error: () => undefined,
            info: () => undefined,
            warn: (message: string, metadata?: unknown) =>
              void warnings.push({ message, metadata }),
          },
        }),
    now: NOW,
    stops: [stop('stop-1'), stop('stop-2')],
    tripId,
  }
}

describe('spec 252 T6.1b — a falha do aviso não derruba o detalhe da viagem', () => {
  test('o calendário que falha devolve "sem aviso", não a exceção', async () => {
    const { executor } = createRecordingSelectExecutor({ rejectWith: LEAKY_FAILURE })

    const warnings = await readTripStopHolidayWarnings(
      executor as TripQueryable,
      buildParams('trip-failure-1', undefined),
    )

    expect(warnings.size).toBe(0)
  })

  test('o log leva só o código, os ids e a contagem: nada da mensagem do erro', async () => {
    const { executor } = createRecordingSelectExecutor({ rejectWith: LEAKY_FAILURE })
    const logged: Warning[] = []

    await readTripStopHolidayWarnings(
      executor as TripQueryable,
      buildParams('trip-failure-2', logged),
    )

    expect(logged).toEqual([
      {
        message: WARNING_MESSAGE,
        metadata: {
          affectedStopCount: 2,
          code: 'read_failed',
          companyId: COMPANY_ID,
          tripId: 'trip-failure-2',
        },
      },
    ])
    expect(JSON.stringify(logged)).not.toContain('123.456.789-09')
  })

  test('a mesma falha na mesma viagem não repete o aviso a cada leitura', async () => {
    const { executor } = createRecordingSelectExecutor({ rejectWith: LEAKY_FAILURE })
    const logged: Warning[] = []
    const params = buildParams('trip-failure-3', logged)

    await readTripStopHolidayWarnings(executor as TripQueryable, params)
    await readTripStopHolidayWarnings(executor as TripQueryable, params)

    expect(logged).toHaveLength(1)
  })
})
