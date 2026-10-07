/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1: o cliente HTTP do calendário fala o contrato das rotas da T1.3 (ADR-0096 §6): verbo, caminho,
 * corpo, 201 × 200 da escrita idempotente e o erro que carrega código, status e `details`.
 */
import { describe, expect, test } from 'bun:test'

import {
  createBusinessCalendarClient,
  type BusinessCalendarClient,
} from '@/modules/company-settings/shared/businessCalendarClient.service'
import { BUSINESS_CALENDAR_ERROR } from '@/modules/company-settings/shared/businessCalendar.constant'
import { BusinessCalendarRequestError } from '@/modules/company-settings/shared/businessCalendarRequest.service'

import {
  buildHoliday,
  buildOnceStateHoliday,
  buildRule,
  buildSavedHoliday,
  buildSettings,
  buildYearlyStateHoliday,
  envelope,
  RULE_ID,
} from '../fixtures/businessCalendar.fixture'

type Recorded = { body: string; headers: Headers; method: string; url: string }

function setup(response: () => Response): {
  calls: Recorded[]
  client: BusinessCalendarClient
} {
  const calls: Recorded[] = []
  const client = createBusinessCalendarClient({
    apiBaseUrl: 'http://api.test',
    fetch: async (request) => {
      calls.push({
        body: await request.clone().text(),
        headers: request.headers,
        method: request.method,
        url: request.url,
      })
      return response()
    },
    getAccessToken: () => Promise.resolve('token-123'),
  })
  return { calls, client }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

async function failureOf(run: () => Promise<unknown>): Promise<BusinessCalendarRequestError> {
  try {
    await run()
  } catch (error) {
    if (error instanceof BusinessCalendarRequestError) return error
    throw error
  }
  throw new Error('NOT_REJECTED')
}

describe('configuração do sábado', () => {
  test('GET lê o caminho certo com o token e sem cache', async () => {
    const { calls, client } = setup(() => json(envelope(buildSettings())))

    expect(await client.getSettings()).toEqual(buildSettings())
    expect(calls[0]?.url).toBe('http://api.test/company-settings/business-calendar')
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer token-123')
  })

  test('PUT manda só `saturdayIsBusinessDay`', async () => {
    const saved = buildSettings({ origin: 'company', saturdayIsBusinessDay: true })
    const { calls, client } = setup(() => json(envelope(saved)))

    expect(await client.saveSettings(true)).toEqual(saved)
    expect(calls[0]?.method).toBe('PUT')
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ saturdayIsBusinessDay: true })
    expect(calls[0]?.headers.get('content-type')).toBe('application/json')
  })
})

describe('regras "todo ano"', () => {
  test('POST 201 é criação e 200 é a regra idêntica que já existia', async () => {
    const fields = { cityIbgeCode: '3509502', day: 14, kind: 'city_anniversary', month: 7 } as const
    const created = setup(() => json(envelope(buildRule()), 201))
    const existing = setup(() => json(envelope(buildRule()), 200))

    const first = await created.client.createRule({ ...fields, name: 'Aniversário de Campinas' })
    const second = await existing.client.createRule({ ...fields, name: 'Aniversário de Campinas' })

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(created.calls[0]?.url).toBe('http://api.test/municipal-holiday-rules')
    expect(JSON.parse(created.calls[0]?.body ?? '')).toEqual({
      ...fields,
      name: 'Aniversário de Campinas',
    })
  })

  test('PATCH leva só o que mudou e devolve typedHolidaysKept', async () => {
    const { calls, client } = setup(() => json(envelope(buildRule({ typedHolidaysKept: 2 }))))

    const rule = await client.updateRule({ changes: { day: 15, month: 7 }, id: RULE_ID })

    expect(rule.typedHolidaysKept).toBe(2)
    expect(calls[0]?.method).toBe('PATCH')
    expect(calls[0]?.url).toBe(`http://api.test/municipal-holiday-rules/${RULE_ID}`)
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ day: 15, month: 7 })
  })

  test('DELETE resolve no 204, sem corpo', async () => {
    const { calls, client } = setup(() => new Response(null, { status: 204 }))

    await client.deleteRule(RULE_ID)

    expect(calls[0]?.method).toBe('DELETE')
    expect(calls[0]?.url).toBe(`http://api.test/municipal-holiday-rules/${RULE_ID}`)
  })

  test('"Gerar próximos anos" é um POST sem corpo e sem content-type', async () => {
    const { calls, client } = setup(() =>
      json(envelope({ holidaysCreated: 22, rulesProcessed: 2 })),
    )

    expect(await client.materialize()).toEqual({ holidaysCreated: 22, rulesProcessed: 2 })
    expect(calls[0]?.url).toBe('http://api.test/municipal-holiday-rules/materializations')
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.body).toBe('')
    expect(calls[0]?.headers.get('content-type')).toBeNull()
  })

  test('a lista lê a resposta como lista de regras', async () => {
    const { client } = setup(() => json(envelope([buildRule(), buildRule({ id: 'x' })])))

    expect(await client.listRules()).toHaveLength(2)
  })
})

describe('datas fixas do município', () => {
  test('POST devolve `adoptedFromRuleId` para a tela avisar a adoção', async () => {
    const adopted = buildSavedHoliday({ adoptedFromRuleId: RULE_ID })
    const { calls, client } = setup(() => json(envelope(adopted), 201))

    const saved = await client.saveMunicipalHoliday({
      cityIbgeCode: '3509502',
      holidayOn: '2026-07-14',
      kind: 'holiday',
      name: 'Aniversário',
    })

    expect(saved.adoptedFromRuleId).toBe(RULE_ID)
    expect(calls[0]?.url).toBe('http://api.test/municipal-holidays')
    expect(calls[0]?.method).toBe('POST')
  })

  test('PATCH muda só nome e tipo; DELETE vai pelo id', async () => {
    const { calls, client } = setup(() => json(envelope(buildHoliday())))

    await client.updateMunicipalHoliday({ changes: { name: 'Outro nome' }, id: 'abc' })

    expect(calls[0]?.url).toBe('http://api.test/municipal-holidays/abc')
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ name: 'Outro nome' })
  })

  test('a lista aceita data gerada e digitada', async () => {
    const { client } = setup(() =>
      json(envelope([buildHoliday(), buildHoliday({ generatedByRuleId: RULE_ID, id: 'g' })])),
    )

    expect(await client.listMunicipalHolidays()).toHaveLength(2)
  })
})

describe('feriados estaduais', () => {
  test('POST 200 é idêntico à existente e 201 é novo', async () => {
    const fields = {
      day: 9,
      month: 7,
      name: 'Revolução Constitucionalista',
      recurrence: 'yearly',
      stateIbgeCode: '35',
    } as const
    const created = setup(() => json(envelope(buildYearlyStateHoliday()), 201))
    const existing = setup(() => json(envelope(buildYearlyStateHoliday()), 200))

    expect((await created.client.createStateHoliday(fields)).created).toBe(true)
    expect((await existing.client.createStateHoliday(fields)).created).toBe(false)
    expect(created.calls[0]?.url).toBe('http://api.test/state-holidays')
  })

  test('PATCH leva a recorrência junto', async () => {
    const { calls, client } = setup(() => json(envelope(buildOnceStateHoliday())))

    await client.updateStateHoliday({
      changes: { name: 'Novo nome', recurrence: 'once' },
      id: 'abc',
    })

    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ name: 'Novo nome', recurrence: 'once' })
    expect(calls[0]?.url).toBe('http://api.test/state-holidays/abc')
  })
})

describe('recusas', () => {
  test('o erro carrega código, status e os campos recusados', async () => {
    const { client } = setup(() =>
      json(
        {
          error: {
            code: 'INVALID_REQUEST',
            details: [
              { field: 'day', message: 'The day does not exist in the month' },
              { field: 'name', message: 'Too small' },
            ],
            message: 'Invalid request',
          },
        },
        400,
      ),
    )

    const error = await failureOf(() => client.materialize())

    expect(error.message).toBe('INVALID_REQUEST')
    expect(error.code).toBe('INVALID_REQUEST')
    expect(error.status).toBe(400)
    expect(error.details.map((detail) => detail.field)).toEqual(['day', 'name'])
  })

  test('409 de data gerada chega com o código estável', async () => {
    const { client } = setup(() =>
      json({ error: { code: 'MUNICIPAL_HOLIDAY_GENERATED_BY_RULE', message: 'x' } }, 409),
    )

    const error = await failureOf(() => client.deleteMunicipalHoliday('abc'))

    expect(error.code).toBe('MUNICIPAL_HOLIDAY_GENERATED_BY_RULE')
    expect(error.status).toBe(409)
    expect(error.details).toEqual([])
  })

  test('detalhe malformado é ignorado, e corpo sem JSON vira recusa genérica', async () => {
    const malformed = setup(() =>
      json({ error: { code: 'INVALID_REQUEST', details: [{ field: 1 }, 'x', null] } }, 400),
    )
    const empty = setup(() => new Response('<html>', { status: 502 }))

    expect((await failureOf(() => malformed.client.getSettings())).details).toEqual([])
    expect((await failureOf(() => empty.client.getSettings())).code).toBe(
      BUSINESS_CALENDAR_ERROR.REQUEST_FAILED,
    )
  })

  test('falha de rede tem código próprio', async () => {
    const client = createBusinessCalendarClient({
      apiBaseUrl: 'http://api.test',
      fetch: () => Promise.reject(new Error('offline')),
      getAccessToken: () => Promise.resolve('t'),
    })

    expect((await failureOf(() => client.getSettings())).code).toBe(BUSINESS_CALENDAR_ERROR.NETWORK)
  })

  test('resposta com chave a mais é recusada, nunca repassada', async () => {
    const { client } = setup(() =>
      json(envelope({ ...buildSettings(), companyId: 'company-1' }), 200),
    )

    expect((await failureOf(() => client.getSettings())).code).toBe(
      BUSINESS_CALENDAR_ERROR.RESPONSE_INVALID,
    )
  })

  test('lista com um item de forma errada é recusada inteira', async () => {
    const { client } = setup(() => json(envelope([buildRule(), { id: 'sem-o-resto' }])))

    expect((await failureOf(() => client.listRules())).code).toBe(
      BUSINESS_CALENDAR_ERROR.RESPONSE_INVALID,
    )
  })
})
