/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.2 (ADR-0100 §6, RF10, CA13): `POST /business-calendar/day-checks`, a consulta da montagem — até
 * 200 `{ cityIbgeCode, date }`, corpo `.strict()`, `fleet.read`, a empresa só do contexto, e só os dias
 * que fecham por feriado na resposta. O caso de uso junta a mesma cidade e data numa só consulta.
 */
import { describe, expect, test } from 'bun:test'

import type {
  HolidayWarningPort,
  HolidayWarningsResult,
} from '../../src/business-calendar/application/holiday-warning.port.js'
import { createDayChecksUseCase } from '../../src/business-calendar/application/day-checks.use-case.js'
import type { HolidayWarning } from '../../src/business-calendar/domain/holiday-warning.policy.js'
import { createDayChecksRoutes } from '../../src/business-calendar/presentation/day-checks.routes.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  COMPANY_CONTEXT,
  createHttpHandler,
  FORBIDDEN_BODY_KEYS,
  jsonRequest,
  recordingUseCase,
  responseApiError,
  responseData,
  type RecordedCalls,
} from '../fixtures/business-calendar-http.fixture.js'

const PATH = '/business-calendar/day-checks'
const CAMPINAS = '3509502'
const SANTOS = '3548500'
const WARNING: HolidayWarning = {
  cityIbgeCode: 3509502,
  date: '2026-07-14',
  reasons: [{ name: 'Aniversário de Campinas', origin: 'imported', scope: 'municipal' }],
}
const ITEM = { cityIbgeCode: CAMPINAS, date: '2026-07-14' } as const
const READ_ONLY: CompanyContext['permissions'] = new Set(['fleet.read'])
const NO_FLEET: CompanyContext['permissions'] = new Set(['trip.read', 'invoices.read'])

function createFixture(permissions?: CompanyContext['permissions']) {
  const calls: RecordedCalls = {}
  const routes = createDayChecksRoutes({
    dayChecks: recordingUseCase(calls, 'dayChecks', [WARNING]),
  })
  return {
    calls,
    handle: createHttpHandler({ routes, ...(permissions === undefined ? {} : { permissions }) }),
  }
}

describe('POST /business-calendar/day-checks (spec 252 T4.2)', () => {
  test('consulta com a empresa do contexto e devolve só os avisos, no formato único', async () => {
    const { calls, handle } = createFixture(READ_ONLY)

    const response = await handle(
      jsonRequest({ body: { items: [ITEM] }, method: 'POST', path: PATH }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(calls.dayChecks).toEqual([{ companyId: COMPANY_CONTEXT.companyId, items: [ITEM] }])
    expect(await responseData(response)).toEqual([
      {
        cityIbgeCode: 3509502,
        date: '2026-07-14',
        reasons: [{ name: 'Aniversário de Campinas', origin: 'imported', scope: 'municipal' }],
      },
    ])
  })

  test('200 itens passam; 201, zero ou ausente são 400 (CA13)', async () => {
    const { calls, handle } = createFixture()
    const items = (count: number) =>
      Array.from({ length: count }, (_unused, index) => ({
        cityIbgeCode: index % 2 === 0 ? CAMPINAS : SANTOS,
        date: '2026-07-14',
      }))
    const post = (body: unknown) => handle(jsonRequest({ body, method: 'POST', path: PATH }))

    expect((await post({ items: items(200) })).status).toBe(200)
    expect((await post({ items: items(201) })).status).toBe(400)
    expect((await post({ items: [] })).status).toBe(400)
    expect((await post({})).status).toBe(400)
    expect(calls.dayChecks).toHaveLength(1)
  })

  test('campo desconhecido no corpo ou no item é 400, e a empresa nunca vem do corpo (CA13)', async () => {
    const { calls, handle } = createFixture()
    const bodies = [
      { items: [ITEM], extra: true },
      { items: [{ ...ITEM, cityName: 'Campinas' }] },
      ...FORBIDDEN_BODY_KEYS.flatMap((forbidden) => [
        { items: [ITEM], ...forbidden },
        { items: [{ ...ITEM, ...forbidden }] },
      ]),
    ]

    for (const body of bodies) {
      expect((await handle(jsonRequest({ body, method: 'POST', path: PATH }))).status).toBe(400)
    }
    expect(calls.dayChecks).toEqual([])
  })

  test('cidade fora do padrão ou de UF que não existe e data impossível são 400', async () => {
    const { calls, handle } = createFixture()
    const invalid = [
      { cityIbgeCode: '3509', date: '2026-07-14' },
      { cityIbgeCode: '35095020', date: '2026-07-14' },
      { cityIbgeCode: '3400000', date: '2026-07-14' },
      { cityIbgeCode: 3509502, date: '2026-07-14' },
      { cityIbgeCode: CAMPINAS, date: '2026-02-30' },
      { cityIbgeCode: CAMPINAS, date: '14/07/2026' },
      { cityIbgeCode: CAMPINAS, date: '2026-7-14' },
      { cityIbgeCode: CAMPINAS },
      { date: '2026-07-14' },
    ]

    for (const item of invalid) {
      const response = await handle(
        jsonRequest({ body: { items: [item] }, method: 'POST', path: PATH }),
      )

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).code).toBeDefined()
    }
    expect(calls.dayChecks).toEqual([])
  })

  test('é leitura de frota: quem não tem fleet.read recebe 403 e o caso de uso não roda', async () => {
    const { calls, handle } = createFixture(NO_FLEET)

    const response = await handle(
      jsonRequest({ body: { items: [ITEM] }, method: 'POST', path: PATH }),
    )

    expect(response.status).toBe(403)
    expect(calls.dayChecks).toEqual([])
  })
})

describe('o caso de uso do day-checks (spec 252 T4.2)', () => {
  function portReturning(result: HolidayWarningsResult) {
    const calls: unknown[] = []
    const port: HolidayWarningPort = {
      read: async (params) => {
        calls.push(params)
        return result
      },
    }
    return { calls, port }
  }

  test('a mesma cidade e data juntas viram uma consulta; a resposta segue a ordem do pedido', async () => {
    const second: HolidayWarning = { ...WARNING, cityIbgeCode: 3548500 }
    const { calls, port } = portReturning({
      refusals: new Map(),
      warnings: new Map([
        [`${CAMPINAS}:2026-07-14`, WARNING],
        [`${SANTOS}:2026-07-14`, second],
      ]),
    })
    const useCase = createDayChecksUseCase({ repository: port })

    const warnings = await useCase.execute({
      companyId: COMPANY_CONTEXT.companyId,
      items: [
        { cityIbgeCode: SANTOS, date: '2026-07-14' },
        ITEM,
        { cityIbgeCode: SANTOS, date: '2026-07-14' },
        { cityIbgeCode: CAMPINAS, date: '2026-07-15' },
      ],
    })

    expect(warnings).toEqual([second, WARNING])
    expect(calls).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        items: [
          { cityIbgeCode: SANTOS, date: '2026-07-14', key: `${SANTOS}:2026-07-14` },
          { cityIbgeCode: CAMPINAS, date: '2026-07-14', key: `${CAMPINAS}:2026-07-14` },
          { cityIbgeCode: CAMPINAS, date: '2026-07-15', key: `${CAMPINAS}:2026-07-15` },
        ],
      },
    ])
  })

  test('calendário recusado vira a recusa tipada 422 com o código, nunca "sem feriado"', async () => {
    const { port } = portReturning({
      refusals: new Map([[CAMPINAS, 'BUSINESS_CALENDAR_TOO_MANY_RULES' as const]]),
      warnings: new Map(),
    })
    const useCase = createDayChecksUseCase({ repository: port })

    const failure = await useCase
      .execute({ companyId: COMPANY_CONTEXT.companyId, items: [ITEM] })
      .then(
        () => undefined,
        (error: unknown) => error as { code: string; status: number },
      )

    expect(failure).toMatchObject({ code: 'BUSINESS_CALENDAR_TOO_MANY_RULES', status: 422 })
  })
})
