/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1: os casos de uso levam o relógio injetado ao repositório sem que ele o conheça. "Hoje" é o
 * dia civil de São Paulo (D7, desligar só de hoje em diante); o horizonte do status é o ano corrente e o
 * seguinte (D8); o mês do orçamento é o do dia de hoje de São Paulo.
 */
import { describe, expect, test } from 'bun:test'

import type { BusinessCalendarActor } from '../../src/business-calendar/application/business-calendar-actor.types.js'
import type {
  HolidayImportStatusPort,
  HolidayImportSuppressionPort,
} from '../../src/business-calendar/application/holiday-import.port.js'
import { createHolidayImportUseCases } from '../../src/business-calendar/application/holiday-import.use-case.js'
import type { StateHolidayPort } from '../../src/business-calendar/application/state-holiday.port.js'
import { createStateHolidaysUseCases } from '../../src/business-calendar/application/state-holidays.use-case.js'

const ACTOR: BusinessCalendarActor = {
  companyId: '11111111-1111-4111-8111-111111111111',
  correlationId: 'holiday-import-use-cases',
  ipAddress: '10.0.0.9',
  userId: '33333333-3333-4333-8333-333333333333',
}
const HOLIDAY_ID = '66666666-6666-4666-8666-666666666666'
const SUPPRESSION_ID = '77777777-7777-4777-8777-777777777777'
const EMPTY_STATUS = {
  failures: [],
  isEnabled: true,
  lastFetchedAt: null,
  month: '2026-10-01',
  monthlyRequests: 0,
  pairs: { done: 0, failed: 0, notCovered: 0, pending: 0, quotaExhausted: 0, total: 0 },
  removedByProvider: [],
  totalCities: 0,
} as const

function recordingPorts() {
  const calls: { readonly input: unknown; readonly name: string }[] = []
  const statusRepository: HolidayImportStatusPort = {
    listCities: async (input) => {
      calls.push({ input, name: 'listCities' })
      return { items: [], total: 0 }
    },
    readStatus: async (input) => {
      calls.push({ input, name: 'readStatus' })
      return EMPTY_STATUS
    },
  }
  const suppressionRepository: HolidayImportSuppressionPort = {
    disable: async (input) => {
      calls.push({ input, name: 'disable' })
      return {
        holidayOn: '2026-11-20',
        ibgeCode: '3509502',
        id: SUPPRESSION_ID,
        scope: 'city',
        suppressedAt: new Date('2026-10-09T12:00:00.000Z'),
      }
    },
    list: async (input) => {
      calls.push({ input, name: 'list' })
      return []
    },
    restore: async (input) => {
      calls.push({ input, name: 'restore' })
    },
  }
  return { calls, statusRepository, suppressionRepository }
}

function useCasesAt(instant: string) {
  const ports = recordingPorts()
  const useCases = createHolidayImportUseCases({ now: () => new Date(instant), ...ports })
  return { calls: ports.calls, useCases }
}

describe('os casos de uso da gestão da importação de feriados (spec 252 T4.1)', () => {
  test('o status lê o ano corrente e o seguinte e o mês de hoje, no fuso de São Paulo', async () => {
    const { calls, useCases } = useCasesAt('2026-10-09T15:00:00.000Z')

    await useCases.status.execute({ companyId: ACTOR.companyId })

    expect(calls).toEqual([
      {
        input: {
          companyId: ACTOR.companyId,
          month: '2026-10-01',
          years: { fromYear: 2026, toYear: 2027 },
        },
        name: 'readStatus',
      },
    ])
  })

  test('01h UTC do dia 1º ainda é o mês anterior em São Paulo', async () => {
    const { calls, useCases } = useCasesAt('2026-10-01T01:00:00.000Z')

    await useCases.status.execute({ companyId: ACTOR.companyId })

    expect(calls[0]?.input).toMatchObject({ month: '2026-09-01' })
  })

  test('01h UTC do dia 1º de janeiro ainda é o ano anterior em São Paulo', async () => {
    const { calls, useCases } = useCasesAt('2027-01-01T01:00:00.000Z')

    await useCases.cities.execute({ companyId: ACTOR.companyId, page: 2, perPage: 10 })

    expect(calls).toEqual([
      {
        input: {
          companyId: ACTOR.companyId,
          page: 2,
          perPage: 10,
          years: { fromYear: 2026, toYear: 2027 },
        },
        name: 'listCities',
      },
    ])
  })

  test('desligar leva o ano corrente e o dia de hoje de São Paulo', async () => {
    const { calls, useCases } = useCasesAt('2026-10-10T01:30:00.000Z')

    const suppression = await useCases.disable.execute({
      ...ACTOR,
      holidayId: HOLIDAY_ID,
      scope: 'city',
    })

    expect(suppression.id).toBe(SUPPRESSION_ID)
    expect(calls).toEqual([
      {
        input: {
          ...ACTOR,
          currentYear: 2026,
          holidayId: HOLIDAY_ID,
          scope: 'city',
          today: '2026-10-09',
        },
        name: 'disable',
      },
    ])
  })

  test('restaurar e listar passam direto, só com o que a empresa e o ator definem', async () => {
    const { calls, useCases } = useCasesAt('2026-10-09T15:00:00.000Z')

    await useCases.restore.execute({ ...ACTOR, id: SUPPRESSION_ID })
    await useCases.suppressions.execute({ companyId: ACTOR.companyId })

    expect(calls).toEqual([
      { input: { ...ACTOR, id: SUPPRESSION_ID }, name: 'restore' },
      { input: { companyId: ACTOR.companyId }, name: 'list' },
    ])
  })
})

describe('apagar um feriado estadual leva o dia de hoje (spec 252 T4.1, D7)', () => {
  test('o caso de uso do feriado estadual passa "hoje" de São Paulo ao repositório', async () => {
    const calls: unknown[] = []
    const repository: StateHolidayPort = {
      create: async () => {
        throw new Error('not used')
      },
      list: async () => [],
      remove: async (input) => {
        calls.push(input)
      },
      update: async () => null,
    }
    const useCases = createStateHolidaysUseCases({
      now: () => new Date('2027-01-01T01:30:00.000Z'),
      repository,
    })

    await useCases.remove.execute({ ...ACTOR, id: HOLIDAY_ID })

    expect(calls).toEqual([{ ...ACTOR, id: HOLIDAY_ID, today: '2026-12-31' }])
  })
})
