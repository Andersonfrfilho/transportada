/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: o caso de uso das datas fixas leva o ano corrente (é ele que limita a regeneração da
 * data da regra) e trata a ausência na edição como 404.
 */
import { describe, expect, test } from 'bun:test'

import type { BusinessCalendarActor } from '../../src/business-calendar/application/business-calendar-actor.types.js'
import type { MunicipalHolidayPort } from '../../src/business-calendar/application/municipal-holiday.port.js'
import { createMunicipalHolidaysUseCases } from '../../src/business-calendar/application/municipal-holidays.use-case.js'

const ACTOR: BusinessCalendarActor = {
  companyId: '11111111-1111-4111-8111-111111111111',
  correlationId: 'use-cases-contract',
  ipAddress: '10.0.0.9',
  userId: '33333333-3333-4333-8333-333333333333',
}

describe('os casos de uso das datas fixas (spec 238 T1.3)', () => {
  const HOLIDAY_ID = '66666666-6666-4666-8666-666666666666'

  function recordingHolidayPort(overrides: Partial<MunicipalHolidayPort> = {}) {
    const calls: { readonly name: string; readonly input: unknown }[] = []
    const port: MunicipalHolidayPort = {
      list: async (input) => {
        calls.push({ input, name: 'list' })
        return []
      },
      remove: async (input) => {
        calls.push({ input, name: 'remove' })
      },
      save: async (input) => {
        calls.push({ input, name: 'save' })
        return {
          adoptedFromRuleId: null,
          holiday: {
            cityIbgeCode: '3509502',
            generatedByRuleId: null,
            holidayOn: '2026-07-14',
            id: HOLIDAY_ID,
            kind: 'holiday',
            name: 'Feriado',
          },
        }
      },
      update: async (input) => {
        calls.push({ input, name: 'update' })
        return null
      },
      ...overrides,
    }
    return { calls, port }
  }

  test('apagar leva o ano corrente: é ele que limita a regeneração da data da regra', async () => {
    const { calls, port } = recordingHolidayPort()
    const useCases = createMunicipalHolidaysUseCases({
      now: () => new Date('2026-10-07T15:00:00.000Z'),
      repository: port,
    })

    await useCases.remove.execute({ ...ACTOR, id: HOLIDAY_ID })

    expect(calls).toEqual([
      { input: { ...ACTOR, currentYear: 2026, id: HOLIDAY_ID }, name: 'remove' },
    ])
  })

  test('editar o que não existe é 404 com código estável', async () => {
    const { port } = recordingHolidayPort()
    const useCases = createMunicipalHolidaysUseCases({ now: () => new Date(), repository: port })

    const failure = await useCases.update
      .execute({ ...ACTOR, changes: { name: 'x' }, id: HOLIDAY_ID })
      .then(
        () => undefined,
        (error: unknown) => error as { code: string; status: number },
      )

    expect(failure).toMatchObject({ code: 'MUNICIPAL_HOLIDAY_NOT_FOUND', status: 404 })
  })
})
