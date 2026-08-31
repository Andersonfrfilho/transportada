/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type Page, type Route } from '@playwright/test'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}
const SMOKE_AUTH_ME_STORAGE_KEY = 'transportada.smoke-auth-me'

const RULE = {
  createdAt: '2026-07-22T19:00:00.000Z',
  currentVersion: '1',
  description: 'Percentual padrao da operacao',
  id: '00000000-0000-4000-8000-000000000301',
  name: 'Regra padrao',
  priority: '10',
  status: 'draft',
  type: 'percentage_of_invoice_total',
  updatedAt: '2026-07-22T19:00:00.000Z',
} as const

const BASE_SIMULATION = {
  adjustments: [],
  baseAmount: '10000.0000',
  calculatedAmount: '350.0000',
  calculationDetails: {
    formula: 'invoiceTotalAmount * percentage',
    roundingMode: 'half_up',
    scale: 4,
  },
  correlationId: 'freight-http-correlation',
  createdAt: '2026-07-22T19:00:00.000Z',
  freightRuleId: '00000000-0000-4000-8000-000000000301',
  freightRuleVersionId: '00000000-0000-4000-8000-000000000302',
  id: '00000000-0000-4000-8000-000000000303',
  maximumAmount: null,
  minimumAmount: null,
  nfeDocumentId: '00000000-0000-4000-8000-000000000304',
  percentage: '0.035000',
  ruleSnapshot: {
    freightRuleId: '00000000-0000-4000-8000-000000000301',
    freightRuleVersionId: '00000000-0000-4000-8000-000000000302',
    maximumAmount: null,
    minimumAmount: null,
    percentage: '0.035000',
    ruleVersion: '1',
    type: 'percentage_of_invoice_total',
    validFrom: '2026-07-01T00:00:00.000Z',
    validUntil: null,
  },
  ruleVersion: '1',
  status: 'snapshotted',
  totalAmount: '350.0000',
  updatedAt: '2026-07-22T19:00:00.000Z',
} as const

type AdjustmentMode = 'maximum' | 'minimum' | 'none'
type MockPermissions = readonly ('freight.simulate' | 'settings.manage')[]

type MockState = {
  failures: string[]
  ruleCreations: number
  simulations: number
}

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

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: { ...CORS_HEADERS, 'access-control-allow-origin': '*' },
    status,
  })
}

async function fulfillOptions(route: Route): Promise<void> {
  await route.fulfill({
    headers: { ...CORS_HEADERS, 'access-control-allow-origin': '*' },
    status: 204,
  })
}

function createSimulation(adjustment: AdjustmentMode) {
  if (adjustment === 'minimum') {
    return {
      ...BASE_SIMULATION,
      adjustments: [
        { amount: '50.0000', description: 'Minimum applied', type: 'minimum_amount' as const },
      ],
      totalAmount: '400.0000',
    }
  }
  if (adjustment === 'maximum') {
    return {
      ...BASE_SIMULATION,
      adjustments: [
        { amount: '25.0000', description: 'Maximum applied', type: 'maximum_amount' as const },
      ],
      totalAmount: '325.0000',
    }
  }
  return BASE_SIMULATION
}

/**
 * O cabeçalho busca a foto da pessoa em toda página — o claim `picture` do token aponta para esta
 * mesma rota autenticada, e `<img src>` não manda o `Authorization`. Sem este mock a requisição
 * escapa para a API real, que não sobe no smoke, e o `requestfailed` entra em `failures()`.
 *
 * 404 é a resposta certa para quem não tem foto: o cliente a trata como ausência, e a tela desenha
 * as iniciais.
 */
async function registerUserPictureMock(page: Page): Promise<void> {
  await page.route('**/company-users/*/picture', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    await route.fulfill({ headers: CORS_HEADERS, status: 404 })
  })
}

async function registerIdentityMock(
  input: Readonly<{ page: Page; permissions: MockPermissions }>,
): Promise<void> {
  await input.page.addInitScript(
    ({ permissions, storageKey }) => {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          data: {
            company: { id: '00000000-0000-4000-8000-000000000001' },
            identity: { userId: '00000000-0000-4000-8000-000000000002' },
            permissions,
            roles: ['viewer'],
          },
        }),
      )
    },
    { permissions: input.permissions, storageKey: SMOKE_AUTH_ME_STORAGE_KEY },
  )
  await input.page.route('**/auth/me', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        headers: { ...CORS_HEADERS, 'access-control-allow-origin': '*' },
        status: 204,
      })
      return
    }
    await fulfillJson(route, {
      data: {
        company: { id: '00000000-0000-4000-8000-000000000001' },
        identity: { userId: '00000000-0000-4000-8000-000000000002' },
        permissions: input.permissions,
        roles: ['viewer'],
      },
    })
  })
}

async function registerFreightMocks(
  input: Readonly<{ adjustment: AdjustmentMode; page: Page; state: MockState }>,
): Promise<void> {
  const simulation = createSimulation(input.adjustment)
  await input.page.route(/\/freight-rules(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    if (route.request().method() === 'POST') {
      input.state.ruleCreations += 1
      await fulfillJson(route, { data: RULE }, 201)
      return
    }
    await fulfillJson(route, { data: [RULE], page: { nextCursor: null } })
  })
  await input.page.route(/\/freight-calculations$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    input.state.simulations += 1
    await fulfillJson(route, { data: simulation }, 201)
  })
  await input.page.route(
    /\/nfe-documents\/[^/]+\/freight-calculations(?:\?.*)?$/,
    async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await fulfillOptions(route)
        return
      }
      await fulfillJson(route, { data: [simulation], page: { nextCursor: null } })
    },
  )
}

export async function mockFreightWorkspaceApi(
  input: Readonly<{ adjustment?: AdjustmentMode; page: Page; permissions: MockPermissions }>,
): Promise<
  Readonly<{
    failures: () => readonly string[]
    ruleCreations: () => number
    simulations: () => number
  }>
> {
  const state: MockState = { failures: [], ruleCreations: 0, simulations: 0 }
  input.page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText
    if (isDiscardedByNavigation(errorText)) return
    if (new URL(request.url()).origin === 'http://localhost:53001') {
      state.failures.push(`${request.url()} ${errorText}`)
    }
  })
  await Promise.all([
    registerIdentityMock(input),
    registerUserPictureMock(input.page),
    registerFreightMocks({
      adjustment: input.adjustment ?? 'none',
      page: input.page,
      state,
    }),
  ])
  return {
    failures: () => state.failures,
    ruleCreations: () => state.ruleCreations,
    simulations: () => state.simulations,
  }
}
