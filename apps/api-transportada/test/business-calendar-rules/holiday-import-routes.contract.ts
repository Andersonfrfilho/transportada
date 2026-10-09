/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1 (ADR-0100 §4, RF9): as rotas da gestão da importação de feriados. `settings.manage` ler e
 * escrever; corpo `.strict()`; a empresa e o ator só do contexto; a resposta é lista branca de campos —
 * nunca uma linha do cache global.
 */
import { describe, expect, test } from 'bun:test'

import type {
  HolidayImportCitiesPage,
  HolidayImportStatus,
  HolidayImportSuppression,
} from '../../src/business-calendar/application/holiday-import.port.js'
import { createHolidayImportRoutes } from '../../src/business-calendar/presentation/holiday-import.routes.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  COMPANY_CONTEXT,
  createHttpHandler,
  FLEET_ONLY_PERMISSIONS,
  FORBIDDEN_BODY_KEYS,
  HOLIDAY_ID,
  jsonRequest,
  RESOLVED_IP,
  recordingUseCase,
  responseData,
  type RecordedCalls,
} from '../fixtures/business-calendar-http.fixture.js'

const PATH = '/holiday-imports'
const SUPPRESSION_ID = '00000000-0000-4000-8000-000000000b01'
const ACTOR = {
  companyId: COMPANY_CONTEXT.companyId,
  correlationId: 'freight-regions-http-correlation',
  ipAddress: RESOLVED_IP,
  userId: COMPANY_CONTEXT.userId,
}
const SUPPRESSION: HolidayImportSuppression = {
  holidayOn: '2026-11-20',
  ibgeCode: '3509502',
  id: SUPPRESSION_ID,
  scope: 'city',
  suppressedAt: new Date('2026-10-09T12:00:00.000Z'),
}
const STATUS: HolidayImportStatus = {
  failures: [{ errorCode: 'provider_unreachable', pairs: 1 }],
  isEnabled: true,
  lastFetchedAt: new Date('2026-10-01T10:00:00.000Z'),
  month: '2026-10-01',
  monthlyRequests: 37,
  pairs: { done: 1, failed: 1, notCovered: 0, pending: 2, quotaExhausted: 0, total: 4 },
  removedByProvider: {
    items: [
      {
        holidayId: HOLIDAY_ID,
        holidayOn: '2026-11-20',
        ibgeCode: '3509502',
        name: 'Removido',
        scope: 'city',
      },
    ],
    truncated: false,
  },
  totalCities: 2,
}
const CITIES: HolidayImportCitiesPage = {
  items: [
    {
      cityIbgeCode: '3509502',
      documentCount: 10,
      lastSeenAt: new Date('2026-10-09T09:00:00.000Z'),
      years: [
        {
          attempts: 1,
          errorCode: null,
          fetchedAt: new Date('2026-10-01T10:00:00.000Z'),
          nextAttemptAt: null,
          status: 'done',
          year: 2026,
        },
      ],
    },
  ],
  total: 1,
}

function createFixture(permissions?: CompanyContext['permissions']) {
  const calls: RecordedCalls = {}
  const routes = createHolidayImportRoutes({
    cities: recordingUseCase(calls, 'cities', CITIES),
    disable: recordingUseCase(calls, 'disable', SUPPRESSION),
    resolveClientIp: () => RESOLVED_IP,
    restore: recordingUseCase(calls, 'restore', undefined),
    status: recordingUseCase(calls, 'status', STATUS),
    suppressions: recordingUseCase(calls, 'suppressions', { items: [SUPPRESSION], total: 1 }),
  })
  return {
    calls,
    handle: createHttpHandler({ routes, ...(permissions === undefined ? {} : { permissions }) }),
  }
}

describe('GET /holiday-imports/status (spec 252 T4.1)', () => {
  test('devolve a lista branca de campos e lê só a empresa do contexto', async () => {
    const { calls, handle } = createFixture()

    const response = await handle(jsonRequest({ method: 'GET', path: `${PATH}/status` }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(calls.status).toEqual([{ companyId: COMPANY_CONTEXT.companyId }])
    const data = await responseData<Record<string, unknown>>(response)
    expect(Object.keys(data).sort()).toEqual([
      'failures',
      'isEnabled',
      'lastFetchedAt',
      'month',
      'monthlyRequests',
      'pairs',
      'removedByProvider',
      'totalCities',
    ])
    expect(data).toMatchObject({
      lastFetchedAt: '2026-10-01T10:00:00.000Z',
      monthlyRequests: 37,
      pairs: { done: 1, failed: 1, notCovered: 0, pending: 2, quotaExhausted: 0, total: 4 },
      removedByProvider: { truncated: false },
    })
  })

  test('query desconhecida é 400: a rota não tem filtro (L12)', async () => {
    const { calls, handle } = createFixture()

    for (const query of ['x=1', 'companyId=22222222-2222-4222-8222-222222222222']) {
      const response = await handle(jsonRequest({ method: 'GET', path: `${PATH}/status?${query}` }))

      expect(response.status).toBe(400)
    }
    expect(calls.status).toEqual([])
  })

  test('sem busca registrada, a data da última busca é null', async () => {
    const calls: RecordedCalls = {}
    const handle = createHttpHandler({
      routes: createHolidayImportRoutes({
        cities: recordingUseCase(calls, 'cities', CITIES),
        disable: recordingUseCase(calls, 'disable', SUPPRESSION),
        resolveClientIp: () => RESOLVED_IP,
        restore: recordingUseCase(calls, 'restore', undefined),
        status: recordingUseCase(calls, 'status', { ...STATUS, lastFetchedAt: null }),
        suppressions: recordingUseCase(calls, 'suppressions', { items: [], total: 0 }),
      }),
    })

    const response = await handle(jsonRequest({ method: 'GET', path: `${PATH}/status` }))

    expect(await responseData(response)).toMatchObject({ lastFetchedAt: null })
  })
})

describe('GET /holiday-imports/cities (spec 252 T4.1)', () => {
  test('paginação padrão 1 × 50, com o envelope de lista e sem id do cache', async () => {
    const { calls, handle } = createFixture()

    const response = await handle(jsonRequest({ method: 'GET', path: `${PATH}/cities` }))

    expect(response.status).toBe(200)
    expect(calls.cities).toEqual([{ companyId: COMPANY_CONTEXT.companyId, page: 1, perPage: 50 }])
    const body = (await response.json()) as {
      readonly data: readonly Record<string, unknown>[]
      readonly pagination: unknown
    }
    expect(body.pagination).toEqual({ page: 1, perPage: 50, total: 1 })
    expect(Object.keys(body.data[0] ?? {}).sort()).toEqual([
      'cityIbgeCode',
      'documentCount',
      'lastSeenAt',
      'years',
    ])
    expect(
      Object.keys((body.data[0]?.years as readonly Record<string, unknown>[])[0] ?? {}).sort(),
    ).toEqual(['attempts', 'errorCode', 'fetchedAt', 'nextAttemptAt', 'status', 'year'])
  })

  test('page e perPage vão ao caso de uso; fora do limite, repetido ou desconhecido é 400', async () => {
    const { calls, handle } = createFixture()

    expect(
      (await handle(jsonRequest({ method: 'GET', path: `${PATH}/cities?page=3&perPage=100` })))
        .status,
    ).toBe(200)
    expect(calls.cities).toEqual([{ companyId: COMPANY_CONTEXT.companyId, page: 3, perPage: 100 }])
    for (const query of [
      'page=0',
      'page=-1',
      'page=1.5',
      'page=x',
      'perPage=0',
      'perPage=101',
      'perPage=x',
      'page=1&page=2',
      'companyId=22222222-2222-4222-8222-222222222222',
      'limit=10',
    ]) {
      const response = await handle(jsonRequest({ method: 'GET', path: `${PATH}/cities?${query}` }))

      expect(response.status).toBe(400)
    }
    expect(calls.cities).toHaveLength(1)
  })
})

describe('GET /holiday-imports/suppressions (spec 252 T4.1)', () => {
  test('lista as supressões da empresa, paginadas como as cidades, com a data em ISO (L3)', async () => {
    const { calls, handle } = createFixture()

    const response = await handle(jsonRequest({ method: 'GET', path: `${PATH}/suppressions` }))

    expect(response.status).toBe(200)
    expect(calls.suppressions).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, page: 1, perPage: 50 },
    ])
    expect(await response.json()).toEqual({
      data: [
        {
          holidayOn: '2026-11-20',
          ibgeCode: '3509502',
          id: SUPPRESSION_ID,
          scope: 'city',
          suppressedAt: '2026-10-09T12:00:00.000Z',
        },
      ],
      pagination: { page: 1, perPage: 50, total: 1 },
    })
  })

  test('page e perPage vão ao caso de uso; fora do limite ou desconhecido é 400', async () => {
    const { calls, handle } = createFixture()
    const get = (query: string) =>
      handle(jsonRequest({ method: 'GET', path: `${PATH}/suppressions?${query}` }))

    expect((await get('page=2&perPage=100')).status).toBe(200)
    expect(calls.suppressions).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, page: 2, perPage: 100 },
    ])
    for (const query of ['page=0', 'perPage=101', 'perPage=x', 'page=1&page=2', 'limit=10']) {
      expect((await get(query)).status).toBe(400)
    }
    expect(calls.suppressions).toHaveLength(1)
  })
})

describe('POST /holiday-imports/suppressions: desligar (spec 252 T4.1, CA5)', () => {
  test('desliga com a empresa e o ator do contexto e responde 201', async () => {
    const { calls, handle } = createFixture()

    const response = await handle(
      jsonRequest({
        body: { holidayId: HOLIDAY_ID, scope: 'city' },
        method: 'POST',
        path: `${PATH}/suppressions`,
      }),
    )

    expect(response.status).toBe(201)
    expect(calls.disable).toEqual([{ ...ACTOR, holidayId: HOLIDAY_ID, scope: 'city' }])
    expect(await responseData(response)).toMatchObject({ id: SUPPRESSION_ID, scope: 'city' })
  })

  test('corpo estrito: campo desconhecido, empresa, escopo ou id inválidos são 400', async () => {
    const { calls, handle } = createFixture()
    const bodies = [
      {},
      { scope: 'city' },
      { holidayId: HOLIDAY_ID },
      { holidayId: HOLIDAY_ID, scope: 'national' },
      { holidayId: HOLIDAY_ID, scope: 'CITY' },
      { holidayId: 'not-a-uuid', scope: 'city' },
      { holidayId: HOLIDAY_ID, scope: 'city', holidayOn: '2026-11-20' },
      ...FORBIDDEN_BODY_KEYS.map((forbidden) => ({
        holidayId: HOLIDAY_ID,
        scope: 'city',
        ...forbidden,
      })),
    ]

    for (const body of bodies) {
      const response = await handle(
        jsonRequest({ body, method: 'POST', path: `${PATH}/suppressions` }),
      )

      expect(response.status).toBe(400)
    }
    expect(calls.disable).toEqual([])
  })
})

describe('DELETE /holiday-imports/suppressions/:id: restaurar (spec 252 T4.1, CA5)', () => {
  test('restaura com a empresa e o ator do contexto e responde 204 sem corpo', async () => {
    const { calls, handle } = createFixture()

    const response = await handle(
      jsonRequest({ method: 'DELETE', path: `${PATH}/suppressions/${SUPPRESSION_ID}` }),
    )

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(calls.restore).toEqual([{ ...ACTOR, id: SUPPRESSION_ID }])
  })

  test('id que não é UUID não chega ao caso de uso', async () => {
    const { calls, handle } = createFixture()

    const response = await handle(
      jsonRequest({ method: 'DELETE', path: `${PATH}/suppressions/not-a-uuid` }),
    )

    expect(response.status).toBe(404)
    expect(calls.restore).toEqual([])
  })
})

describe('permissão da gestão da importação (spec 252 T4.1)', () => {
  test('tudo é settings.manage: quem só cuida da frota recebe 403 em ler e em escrever', async () => {
    const { calls, handle } = createFixture(FLEET_ONLY_PERMISSIONS)
    const attempts = [
      jsonRequest({ method: 'GET', path: `${PATH}/status` }),
      jsonRequest({ method: 'GET', path: `${PATH}/cities` }),
      jsonRequest({ method: 'GET', path: `${PATH}/suppressions` }),
      jsonRequest({
        body: { holidayId: HOLIDAY_ID, scope: 'city' },
        method: 'POST',
        path: `${PATH}/suppressions`,
      }),
      jsonRequest({ method: 'DELETE', path: `${PATH}/suppressions/${SUPPRESSION_ID}` }),
    ]

    for (const attempt of attempts) expect((await handle(attempt)).status).toBe(403)
    expect(Object.values(calls).flat()).toEqual([])
  })
})
