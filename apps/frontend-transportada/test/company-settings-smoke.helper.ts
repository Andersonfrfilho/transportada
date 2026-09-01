/* Copyright (c) 2026 Ada Technology. MIT License. */
import { expect, type Page, type Route } from '@playwright/test'

const SAFE_CERTIFICATE = {
  expiresAt: '2030-01-01T00:00:00.000Z',
  id: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e91',
  purpose: 'cte',
  status: 'active',
  validFrom: '2026-01-01T00:00:00.000Z',
  version: '1',
}

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, PATCH, POST, OPTIONS',
  'access-control-allow-origin': 'http://localhost:53000',
}

const COMPANY_SETTINGS = {
  data: {
    cte: { environment: 'homologation', nextNumber: '1', series: '1', version: '1' },
    profile: {
      city: 'Ribeirao Preto',
      cityIbgeCode: '3543402',
      cnpj: '12345678000199',
      complement: '',
      district: 'Centro',
      email: 'fiscal@example.test',
      legalName: 'Transportadora Sintética LTDA',
      municipalRegistration: '',
      number: '1',
      phone: '1600000000',
      postalCode: '14000000',
      rntrc: '58151044',
      state: 'SP',
      stateRegistration: '154336693112',
      street: 'Rua Sintética',
      taxRegime: '3',
      tradeName: 'Transportadora Sintética',
      version: '1',
    },
  },
}

type MockState = {
  boundary?: Readonly<{ body: unknown; origin: string; status: number }>
  certificateActive: boolean
  failures: string[]
  mutationCount: number
}

/**
 * O cabeçalho busca a foto da pessoa em toda página — o claim `picture` do token aponta para esta
 * mesma rota autenticada, e `<img src>` não manda o `Authorization`. Sem este mock a requisição
 * escapa para a API real, que não sobe no smoke, e o `requestfailed` entra em `failures()`.
 *
 * 404 é a resposta certa para quem não tem foto: o cliente a trata como ausência, e a tela desenha
 * as iniciais.
 */
/**
 * Requisição **abortada** não é chamada que falhou: é a que o navegador descartou porque a página
 * mudou embaixo dela. O cabeçalho busca a foto assim que a sessão resolve, e o login navega logo
 * depois — a corrida é normal e não tem consequência nenhuma em produção.
 *
 * O que esta asserção existe para pegar continua pego: rota sem mock escapa para a API real, que não
 * sobe no smoke, e isso vira `ERR_FAILED`/`ERR_CONNECTION_REFUSED`. O `abort` deliberado do smoke do
 * motorista usa `internetdisconnected`, que também não passa por aqui.
 */
function isDiscardedByNavigation(errorText: string | undefined): boolean {
  return errorText === 'net::ERR_ABORTED'
}

async function registerUserPictureMock(page: Page): Promise<void> {
  await page.route('**/company-users/*/picture', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    await route.fulfill({ headers: CORS_HEADERS, status: 404 })
  })
}

async function registerIdentityMock(page: Page): Promise<void> {
  await page.route('**/auth/me', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    await route.fulfill({
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify({
        data: {
          company: { id: '00000000-0000-4000-8000-000000000001' },
          identity: { userId: '00000000-0000-4000-8000-000000000002' },
          permissions: ['settings.manage'],
          roles: ['viewer'],
        },
      }),
    })
  })
}

async function registerSettingsMock(
  input: Readonly<{ page: Page; state: MockState }>,
): Promise<void> {
  await input.page.route('**/company-settings', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    if (route.request().method() === 'PATCH') input.state.mutationCount += 1
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(COMPANY_SETTINGS),
      headers: CORS_HEADERS,
    })
  })
}

async function fulfillRealBoundary(
  input: Readonly<{ route: Route; state: MockState }>,
): Promise<void> {
  const response = await input.route.fetch()
  const body: unknown = await response.json()
  input.state.boundary = {
    body,
    origin: new URL(input.route.request().url()).origin,
    status: response.status(),
  }
  await input.route.fulfill({ response })
}

async function registerCertificateMock(
  input: Readonly<{ certificateStatus: 201 | undefined; page: Page; state: MockState }>,
): Promise<void> {
  await input.page.route(/\/digital-certificates(?:\?.*)?$/, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    if (request.method() === 'POST') {
      const status = input.certificateStatus
      if (status === undefined) {
        await fulfillRealBoundary({ route, state: input.state })
        return
      }
      input.state.mutationCount += 1
      input.state.certificateActive = true
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: SAFE_CERTIFICATE }),
        headers: CORS_HEADERS,
        status,
      })
      return
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: input.state.certificateActive ? [SAFE_CERTIFICATE] : [],
        page: { nextCursor: null },
      }),
      headers: CORS_HEADERS,
    })
  })
}

export async function mockCompanySettingsApi(
  input: Readonly<{ certificateStatus: 201 | undefined; page: Page }>,
): Promise<
  Readonly<{
    boundary: () => MockState['boundary']
    failures: () => readonly string[]
    mutations: () => number
  }>
> {
  const state: MockState = { certificateActive: false, failures: [], mutationCount: 0 }
  const { page } = input
  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText
    if (isDiscardedByNavigation(errorText)) return
    if (new URL(request.url()).origin === 'http://localhost:53001')
      state.failures.push(`${request.url()} ${errorText}`)
  })
  await Promise.all([
    registerIdentityMock(page),
    registerUserPictureMock(page),
    registerSettingsMock({ page, state }),
    registerCertificateMock({
      certificateStatus: input.certificateStatus,
      page,
      state,
    }),
  ])
  return {
    boundary: () => state.boundary,
    failures: () => state.failures,
    mutations: () => state.mutationCount,
  }
}

export async function ensureServiceWorkerControl(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready)
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) {
    await page.reload()
  }
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true)
}
