/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T5.2/T5.3 (`web.md` §15): a API dublada para os prints de revisão de design do bloco "Chave da FeriadosAPI" e do
 * cartão de status — `GET|PUT /holiday-imports/provider-settings`, `DELETE …/token`, `GET|PUT /company-settings/holiday-import`
 * e o status com o ciclo e o uso do mês. Dado fictício e chave SENTINELA: nada aqui lê um banco nem toca um fornecedor.
 * Fora do smoke da CI.
 */
import type { Page } from '@playwright/test'

import { fulfillJson } from './spec-237-prints-smoke.helper'
import { mockSettingsShell } from './spec-238-prints-smoke.helper'
import { mockImportCalendarApi } from './spec-252-prints-smoke.helper'

type Json = Record<string, unknown>

export const FAKE_KEY = 'FAKE-print-sentinel-Q7zK-1234'
const DEFAULT_BUDGET = 4500
const SAVED_AT = '2026-10-09T15:00:00.000Z'
const LAST_RUN_AT = '2026-10-10T13:00:00.000Z'

export type PutFailure =
  | 'hold'
  | Readonly<{
      code: string
      details?: readonly Json[]
      headers?: Record<string, string>
      status: number
    }>

export type ProviderScenario = Readonly<{
  budget?: number
  enablement?: Readonly<{ isEnabled: boolean; origin: 'company' | 'default' }>
  hasToken: boolean
  lastRunOutcome?: string
  monthlyRequests: number
  permissions: readonly string[]
  putFailure?: PutFailure
  /** Quando a chave foi salva; mais novo que o último ciclo, a manchete espera o próximo ciclo (T6.1b). */
  tokenSavedAt?: string
}>

export const CONFIGURE_PERMISSIONS = ['settings.manage', 'holiday-import.configure'] as const
export const READ_ONLY_PERMISSIONS = ['settings.manage'] as const

function settingsOf(scenario: ProviderScenario, version: number): Json {
  return {
    budgetOrigin: scenario.budget === undefined ? 'default' : 'installation',
    monthlyRequestBudget: scenario.budget ?? DEFAULT_BUDGET,
    tokenConfigured: scenario.hasToken,
    tokenHint: scenario.hasToken ? FAKE_KEY.slice(-4) : null,
    tokenUpdatedAt: scenario.hasToken ? (scenario.tokenSavedAt ?? SAVED_AT) : null,
    updatedAt: scenario.hasToken ? SAVED_AT : null,
    version: scenario.hasToken ? String(version) : null,
  }
}

function statusOf(scenario: ProviderScenario): Json {
  const isWaiting = scenario.lastRunOutcome === 'waiting'
  return {
    failures: [],
    isEnabled: true,
    lastFetchedAt: isWaiting ? null : '2026-10-10T09:30:00.000Z',
    lastRun: isWaiting
      ? null
      : { finishedAt: LAST_RUN_AT, outcome: scenario.lastRunOutcome ?? 'succeeded' },
    month: '2026-10-01',
    monthlyRequests: scenario.monthlyRequests,
    pairs: {
      done: isWaiting ? 0 : 8,
      failed: 0,
      notCovered: 0,
      pending: isWaiting ? 10 : 2,
      planRestricted: 0,
      quotaExhausted: 0,
      total: 10,
    },
    removedByProvider: { items: [], truncated: false },
    totalCities: 5,
  }
}

async function fulfillFailure(
  input: Readonly<{
    failure: Exclude<PutFailure, 'hold'>
    route: Parameters<typeof fulfillJson>[0]
  }>,
): Promise<void> {
  const { failure, route } = input
  await route.fulfill({
    body: JSON.stringify({
      error: { code: failure.code, details: failure.details ?? [], message: 'x' },
    }),
    contentType: 'application/json',
    headers: {
      'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      // A API de hoje só expõe `Date` (`CORS_EXPOSE_HEADERS`): sem isto o navegador esconde o `Retry-After` do 429.
      'access-control-expose-headers': 'Retry-After',
      ...failure.headers,
    },
    status: failure.status,
  })
}

/** A configuração e o liga/desliga mudam o estado que a tela relê, como na API; a falha pedida vale para o `PUT` da chave. */
async function mockProviderRoutes(input: Readonly<{ page: Page; scenario: ProviderScenario }>) {
  const { page, scenario } = input
  let current: ProviderScenario = scenario
  let enablement = scenario.enablement ?? { isEnabled: true, origin: 'default' as const }
  let version = 3

  await page.route(/\/holiday-imports\/provider-settings$/, async (route) => {
    const method = route.request().method()
    if (method === 'GET') return fulfillJson(route, { data: settingsOf(current, version) })
    if (method !== 'PUT') return fulfillJson(route, {})
    if (scenario.putFailure === 'hold') return new Promise<void>(() => undefined)
    if (scenario.putFailure !== undefined) {
      return fulfillFailure({ failure: scenario.putFailure, route })
    }
    const body = route.request().postDataJSON() as Json
    version += 1
    current = {
      ...current,
      budget: typeof body.monthlyRequestBudget === 'number' ? body.monthlyRequestBudget : undefined,
      hasToken: current.hasToken || typeof body.token === 'string',
    } as ProviderScenario
    return fulfillJson(route, { data: settingsOf(current, version) })
  })
  await page.route(/\/holiday-imports\/provider-settings\/token$/, async (route) => {
    if (route.request().method() !== 'DELETE') return fulfillJson(route, {})
    current = { ...current, hasToken: false }
    return route.fulfill({ status: 204 })
  })
  await page.route(/\/company-settings\/holiday-import$/, async (route) => {
    if (route.request().method() === 'PUT') {
      enablement = {
        isEnabled: (route.request().postDataJSON() as { isEnabled: boolean }).isEnabled,
        origin: 'company',
      }
    }
    return fulfillJson(route, { data: enablement })
  })
}

/** O calendário e a importação da 252 (a base) mais a configuração da 262 e o status do cenário por cima. */
export async function mockProviderApi(
  input: Readonly<{ page: Page; scenario: ProviderScenario }>,
): Promise<void> {
  const { page, scenario } = input
  await mockSettingsShell(page, { permissions: scenario.permissions })
  await mockImportCalendarApi({ page, scenario: 'healthy' })
  await page.route(/\/holiday-imports\/status$/, (route) =>
    fulfillJson(route, { data: statusOf(scenario) }),
  )
  await mockProviderRoutes({ page, scenario })
}
