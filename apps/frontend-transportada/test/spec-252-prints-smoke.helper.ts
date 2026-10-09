/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T5.2/T5.3 (`web.md` §15): a API dublada para os prints de revisão de design — a aba Calendário com a origem de
 * cada feriado e a gestão da importação (`/holiday-imports/*`, no formato REAL da T4.1), a montagem com o aviso por parada
 * (`POST /business-calendar/day-checks`) e o detalhe com o selo. Dado fictício; nada aqui lê um banco. Fora do smoke da CI.
 */
import type { Page } from '@playwright/test'

import { buildCalendarState, mockCalendarApi } from './spec-238-prints-smoke.helper'
import { fulfillJson } from './spec-237-prints-smoke.helper'

type Json = Record<string, unknown>

export type ImportScenario =
  | 'disabled'
  | 'error'
  | 'failing'
  | 'healthy'
  | 'malformed'
  | 'planRestricted'
  | 'unauthorized'
  | 'unreachable'
  | 'waiting'

const CAMPINAS = '3509502'
const CURITIBA = '4106902'
const IMPORTED_CAMPINAS_ID = 'imported-campinas-1120'
const IMPORTED_CURITIBA_ID = 'imported-curitiba-1208'
const IMPORTED_STATE_ID = 'state-pr'
const FRESH_PAIRS = {
  done: 8,
  failed: 0,
  notCovered: 0,
  pending: 2,
  planRestricted: 0,
  quotaExhausted: 0,
  total: 10,
}
const LAST_RUN_AT = '2026-10-09T13:00:00.000Z'
const NOTHING_FETCHED = {
  lastFetchedAt: null,
  monthlyRequests: 0,
  pairs: { ...FRESH_PAIRS, done: 0, pending: 10 },
}

function importedHoliday(
  input: Readonly<{ city: string; date: string; id: string; name: string }>,
): Json {
  return {
    cityIbgeCode: input.city,
    generatedByRuleId: null,
    holidayOn: input.date,
    id: input.id,
    kind: 'holiday',
    name: input.name,
    origin: 'imported',
  }
}

function statusOf(input: Readonly<{ scenario: ImportScenario; removed: readonly Json[] }>): Json {
  const base = {
    failures: [] as Json[],
    isEnabled: true,
    lastFetchedAt: '2026-10-09T09:30:00.000Z',
    lastRun: { finishedAt: LAST_RUN_AT, outcome: 'succeeded' },
    month: '2026-10-01',
    monthlyRequests: 42,
    pairs: FRESH_PAIRS,
    removedByProvider: { items: input.removed, truncated: false },
    totalCities: 5,
  }
  switch (input.scenario) {
    case 'disabled':
      return { ...base, isEnabled: false }
    case 'failing':
      return {
        ...base,
        failures: [
          { errorCode: 'provider_unreachable', pairs: 2 },
          { errorCode: 'provider_unauthorized', pairs: 1 },
        ],
        pairs: { ...FRESH_PAIRS, done: 5, failed: 3, pending: 2 },
      }
    case 'planRestricted':
      return {
        ...base,
        failures: [{ errorCode: 'provider_plan_restricted', pairs: 2 }],
        pairs: { ...FRESH_PAIRS, done: 6, failed: 2, planRestricted: 2 },
      }
    case 'unauthorized':
      return {
        ...base,
        ...NOTHING_FETCHED,
        lastRun: { finishedAt: LAST_RUN_AT, outcome: 'provider_unauthorized' },
      }
    case 'unreachable':
      return {
        ...base,
        ...NOTHING_FETCHED,
        lastRun: { finishedAt: LAST_RUN_AT, outcome: 'provider_unreachable' },
      }
    case 'malformed':
      return {
        ...base,
        lastRun: { finishedAt: LAST_RUN_AT, outcome: 'malformed_response' },
      }
    case 'waiting':
      return { ...base, ...NOTHING_FETCHED, lastRun: null }
    default:
      return base
  }
}

export type ImportMock = { disableFailsWith: string | undefined }

/** Registra o calendário da 238 (a base) e, por cima, a origem de cada linha e as rotas da importação. */
export async function mockImportCalendarApi(
  input: Readonly<{ page: Page; scenario: ImportScenario }>,
): Promise<ImportMock> {
  const { page, scenario } = input
  const base = await mockCalendarApi({ page, scenario: { hasShortHorizon: false } })
  const mock: ImportMock = { disableFailsWith: undefined }
  const holidays: Json[] = [
    ...buildCalendarState({ hasShortHorizon: false }).holidays.map((row) =>
      row.generatedByRuleId === null ? { ...row, origin: 'typed' } : row,
    ),
    importedHoliday({
      city: CAMPINAS,
      date: '2026-11-20',
      id: IMPORTED_CAMPINAS_ID,
      name: 'Consciência Negra',
    }),
    importedHoliday({
      city: CURITIBA,
      date: '2026-12-08',
      id: IMPORTED_CURITIBA_ID,
      name: 'Nossa Senhora da Conceição',
    }),
  ]
  let stateHolidays: Json[] = base.stateHolidays.map((row) =>
    row.id === IMPORTED_STATE_ID ? { ...row, origin: 'imported' } : { ...row, origin: 'typed' },
  )
  let suppressions: Json[] = [
    {
      holidayOn: '2026-12-24',
      ibgeCode: CAMPINAS,
      id: 'suppression-1',
      scope: 'city',
      suppressedAt: '2026-10-08T14:00:00.000Z',
    },
    {
      holidayOn: '2026-12-31',
      ibgeCode: '35',
      id: 'suppression-2',
      scope: 'state',
      suppressedAt: '2026-10-07T18:30:00.000Z',
    },
  ]
  const removed: Json[] = [
    {
      holidayId: IMPORTED_CURITIBA_ID,
      holidayOn: '2026-12-08',
      ibgeCode: CURITIBA,
      name: 'Nossa Senhora da Conceição',
      scope: 'city',
    },
  ]
  let rows = holidays

  await page.route(/\/municipal-holidays(?:\?.*)?$/, (route) =>
    route.request().method() === 'GET' ? fulfillJson(route, { data: rows }) : route.fallback(),
  )
  await page.route(/\/state-holidays(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: stateHolidays }),
  )
  await page.route(/\/holiday-imports\/status$/, (route) =>
    scenario === 'error'
      ? fulfillJson(route, { error: { code: 'DATABASE_UNAVAILABLE', message: 'x' } }, 503)
      : fulfillJson(route, {
          data: statusOf({ removed: scenario === 'healthy' ? removed : [], scenario }),
        }),
  )
  await page.route(/\/holiday-imports\/suppressions(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, {
        data: suppressions,
        pagination: { page: 1, perPage: 20, total: suppressions.length },
      })
      return
    }
    if (mock.disableFailsWith !== undefined) {
      await fulfillJson(route, { error: { code: mock.disableFailsWith, message: 'x' } }, 409)
      return
    }
    const body = route.request().postDataJSON() as Json
    rows = rows.filter((row) => row.id !== body.holidayId)
    stateHolidays = stateHolidays.filter((row) => row.id !== body.holidayId)
    const created = {
      holidayOn: '2026-11-20',
      ibgeCode: CAMPINAS,
      id: 'suppression-new',
      scope: body.scope,
      suppressedAt: '2026-10-09T15:00:00.000Z',
    }
    suppressions = [created, ...suppressions]
    await fulfillJson(route, { data: created }, 201)
  })
  await page.route(/\/holiday-imports\/suppressions\/[^/]+$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillJson(route, {})
      return
    }
    suppressions = suppressions.filter((row) => !route.request().url().endsWith(String(row.id)))
    await route.fulfill({ status: 204 })
  })
  return mock
}

/** A resposta de `day-checks`: Finados (2/11) vale nacional nas duas cidades; Ribeirão Preto ainda tem um local cadastrado. */
export const DAY_CHECK_WARNINGS: readonly Json[] = [
  {
    cityIbgeCode: 3543402,
    date: '2026-11-02',
    reasons: [
      { name: 'all_souls_day', origin: 'code', scope: 'national' },
      { name: 'Feriado local', origin: 'typed', scope: 'municipal' },
    ],
  },
  {
    cityIbgeCode: 3526902,
    date: '2026-11-02',
    reasons: [
      { name: 'all_souls_day', origin: 'code', scope: 'national' },
      { name: 'Dia da Padroeira', origin: 'imported', scope: 'municipal' },
    ],
  },
]
