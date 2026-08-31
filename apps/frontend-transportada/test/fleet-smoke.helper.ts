/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type Page, type Route } from '@playwright/test'

import { VEHICLE_DETAIL } from './fleet/fleet.fixture'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const SMOKE_AUTH_ME_STORAGE_KEY = 'transportada.smoke-auth-me'
const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'

/** Toda listagem da frota responde vazia: o que este smoke exercita é o formulário, não a tabela. */
const EMPTY_LIST_PATTERNS: readonly RegExp[] = [
  /\/fleet\/drivers(?:\?.*)?$/,
  /\/fleet\/vehicle-catalog\/brands(?:\?.*)?$/,
  /\/fleet\/vehicle-catalog\/models(?:\?.*)?$/,
  /\/freight-regions(?:\?.*)?$/,
  /\/aggregate-applications(?:\?.*)?$/,
]

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

function buildIdentity(permissions: readonly string[]) {
  return {
    company: { id: COMPANY_ID },
    identity: { userId: USER_ID },
    permissions,
    roles: ['viewer'],
  }
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
  input: Readonly<{ page: Page; permissions: readonly string[] }>,
): Promise<void> {
  await input.page.addInitScript(
    ({ identity, storageKey }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ data: identity }))
    },
    { identity: buildIdentity(input.permissions), storageKey: SMOKE_AUTH_ME_STORAGE_KEY },
  )
  await input.page.route('**/auth/me', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: buildIdentity(input.permissions) })
  })
}

/**
 * Spec 048 P2: só a consulta por placa devolve o veículo. A listagem da tela continua vazia, que é o
 * caso que importa — a ficha existente está fora da página carregada, e mesmo assim tem de aparecer.
 */
async function registerVehicleListMock(
  input: Readonly<{ page: Page; registeredPlate?: string }>,
): Promise<void> {
  await input.page.route(/\/fleet\/vehicles(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    const plateContains = new URL(route.request().url()).searchParams.get('plateContains')
    const matches =
      input.registeredPlate !== undefined &&
      plateContains !== null &&
      input.registeredPlate.includes(plateContains)

    await fulfillJson(route, {
      data: matches ? [{ ...VEHICLE_DETAIL, plate: input.registeredPlate }] : [],
      page: { nextCursor: null },
    })
  })
}

/** Um anexo pendente com um campo divergente — é o estado que a aba de revisão existe para mostrar. */
export const PENDING_DOCUMENT = {
  createdAt: '2026-08-26T12:00:00.000Z',
  divergences: [{ declared: '12345678901', extracted: '99999999999', field: 'licenseNumber' }],
  hasExtraction: true,
  id: '00000000-0000-4000-8000-000000000701',
  rejectionReason: '',
  status: 'pending',
  taxId: '12345678901',
  type: 'cnh',
  updatedAt: '2026-08-26T12:00:00.000Z',
} as const

export async function mockFleetWorkspaceApi(
  input: Readonly<{
    documents?: readonly unknown[]
    page: Page
    permissions: readonly string[]
    registeredPlate?: string
  }>,
): Promise<Readonly<{ failures: () => readonly string[]; reviews: () => readonly unknown[] }>> {
  const failures: string[] = []
  const reviews: unknown[] = []
  /**
   * O duplo guarda estado porque é isso que o smoke da T007 mede: aprovar precisa **mudar a tela**,
   * e com lista imutável a linha continuaria "Pendente" enquanto o teste passava por ter visto a
   * requisição sair. Requisição enviada e tela atualizada são coisas diferentes — a segunda depende
   * da invalidação e do refetch, que é justamente o que contrato de componente não alcança.
   */
  const documents = (input.documents ?? []).map((document) => ({ ...(document as object) }))
  input.page.on('requestfailed', (request) => {
    if (new URL(request.url()).origin === 'http://localhost:53001') {
      failures.push(`${request.url()} ${request.failure()?.errorText}`)
    }
  })

  await registerIdentityMock({ page: input.page, permissions: input.permissions })

  await registerUserPictureMock(input.page)
  // A rota específica vem antes da lista: `/aggregate-documents` casaria com o review também.
  await input.page.route(/\/aggregate-documents\/[^/]+\/review$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    const decision = route.request().postDataJSON() as Readonly<{
      decision: string
      rejectionReason: string
    }>
    reviews.push(decision)
    const reviewedId = /\/aggregate-documents\/([^/]+)\/review$/u.exec(route.request().url())?.[1]
    const reviewed = documents.find(
      (document) => (document as Readonly<{ id?: string }>).id === reviewedId,
    ) as { rejectionReason?: string; status?: string } | undefined
    if (reviewed !== undefined) {
      reviewed.status = decision.decision
      reviewed.rejectionReason = decision.rejectionReason
    }
    await fulfillJson(route, { data: {} })
  })
  await input.page.route(/\/aggregate-documents(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: documents })
  })
  await registerVehicleListMock({
    page: input.page,
    ...(input.registeredPlate === undefined ? {} : { registeredPlate: input.registeredPlate }),
  })
  await input.page.route(/\/fleet\/capabilities(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: { plateLookup: false } })
  })
  await Promise.all(
    EMPTY_LIST_PATTERNS.map((pattern) =>
      input.page.route(pattern, async (route) => {
        if (route.request().method() === 'OPTIONS') {
          await fulfillOptions(route)
          return
        }
        await fulfillJson(route, { data: [], page: { nextCursor: null } })
      }),
    ),
  )

  return { failures: () => failures, reviews: () => reviews }
}
