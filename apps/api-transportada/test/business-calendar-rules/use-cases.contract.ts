/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: os casos de uso só repassam; o que eles decidem é o relógio (o ano corrente, no
 * fuso de São Paulo, injetado) e a ausência (404 na edição, no-op na exclusão).
 */
import { describe, expect, test } from 'bun:test'

import type { BusinessCalendarActor } from '../../src/business-calendar/application/business-calendar-actor.types.js'
import { createMunicipalHolidayRulesUseCases } from '../../src/business-calendar/application/municipal-holiday-rules.use-case.js'
import type {
  MunicipalHolidayRuleOverview,
  MunicipalHolidayRulePort,
} from '../../src/business-calendar/application/municipal-holiday-rule.port.js'

const ACTOR: BusinessCalendarActor = {
  companyId: '11111111-1111-4111-8111-111111111111',
  correlationId: 'use-cases-contract',
  ipAddress: '10.0.0.9',
  userId: '33333333-3333-4333-8333-333333333333',
}
const RULE_ID = '55555555-5555-4555-8555-555555555555'

const RULE: MunicipalHolidayRuleOverview = {
  cityIbgeCode: '3509502',
  createdAt: new Date('2026-10-07T12:00:00.000Z'),
  day: 14,
  id: RULE_ID,
  kind: 'city_anniversary',
  materializedThroughYear: 2036,
  month: 7,
  name: 'Aniversário de Campinas',
  typedHolidaysKept: 1,
  updatedAt: new Date('2026-10-07T12:00:00.000Z'),
}
const NOW = new Date('2026-10-07T15:00:00.000Z')

function recordingRulePort(overrides: Partial<MunicipalHolidayRulePort> = {}) {
  const calls: { readonly name: string; readonly input: unknown }[] = []
  const port: MunicipalHolidayRulePort = {
    create: async (input) => {
      calls.push({ input, name: 'create' })
      return { created: true, rule: RULE }
    },
    list: async (input) => {
      calls.push({ input, name: 'list' })
      return [RULE]
    },
    materialize: async (input) => {
      calls.push({ input, name: 'materialize' })
      return { holidaysCreated: 0, rulesProcessed: 1 }
    },
    remove: async (input) => {
      calls.push({ input, name: 'remove' })
    },
    update: async (input) => {
      calls.push({ input, name: 'update' })
      return RULE
    },
    ...overrides,
  }
  return { calls, port }
}

describe('os casos de uso das regras "todo ano" (spec 238 T1.3)', () => {
  test('a escrita leva o ano corrente de São Paulo, do relógio injetado', async () => {
    const { calls, port } = recordingRulePort()
    const useCases = createMunicipalHolidayRulesUseCases({
      now: () => new Date('2027-01-01T02:30:00.000Z'),
      repository: port,
    })

    await useCases.create.execute({
      ...ACTOR,
      cityIbgeCode: '3509502',
      day: 14,
      kind: 'city_anniversary',
      month: 7,
      name: 'Aniversário de Campinas',
    })
    await useCases.update.execute({ ...ACTOR, changes: { name: 'Novo' }, id: RULE_ID })
    await useCases.materialize.execute(ACTOR)

    expect(calls.map((call) => (call.input as { currentYear: number }).currentYear)).toEqual([
      2026, 2026, 2026,
    ])
  })

  test('virou o ano em São Paulo: o horizonte avança', async () => {
    const { calls, port } = recordingRulePort()
    const useCases = createMunicipalHolidayRulesUseCases({
      now: () => new Date('2027-01-01T03:00:00.000Z'),
      repository: port,
    })

    await useCases.materialize.execute(ACTOR)

    expect(calls).toEqual([{ input: { ...ACTOR, currentYear: 2027 }, name: 'materialize' }])
  })

  test('a leitura filtra pela empresa e pela cidade, e leva o ano corrente para contar as digitadas', async () => {
    const { calls, port } = recordingRulePort()
    const useCases = createMunicipalHolidayRulesUseCases({
      now: () => NOW,
      repository: port,
    })

    const rules = await useCases.list.execute({
      cityIbgeCode: '3509502',
      companyId: ACTOR.companyId,
    })

    expect(rules).toEqual([RULE])
    expect(calls).toEqual([
      {
        input: { cityIbgeCode: '3509502', companyId: ACTOR.companyId, currentYear: 2026 },
        name: 'list',
      },
    ])
  })

  test('editar o que não existe é 404 com código estável', async () => {
    const { port } = recordingRulePort({ update: async () => null })
    const useCases = createMunicipalHolidayRulesUseCases({
      now: () => new Date(),
      repository: port,
    })

    const failure = await useCases.update
      .execute({ ...ACTOR, changes: { name: 'x' }, id: RULE_ID })
      .then(
        () => undefined,
        (error: unknown) => error as { code: string; status: number },
      )

    expect(failure).toMatchObject({ code: 'MUNICIPAL_HOLIDAY_RULE_NOT_FOUND', status: 404 })
  })

  test('apagar o que não existe não falha, e leva o ano corrente para contar as digitadas', async () => {
    const { calls, port } = recordingRulePort()
    const useCases = createMunicipalHolidayRulesUseCases({
      now: () => NOW,
      repository: port,
    })

    await expect(useCases.remove.execute({ ...ACTOR, id: RULE_ID })).resolves.toBeUndefined()
    expect(calls).toEqual([{ input: { ...ACTOR, currentYear: 2026, id: RULE_ID }, name: 'remove' }])
  })
})
