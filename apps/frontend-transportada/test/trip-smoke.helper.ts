/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripDetailContract } from './trip/trip.fixture'
import { type Page, type Route } from '@playwright/test'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
}
const SMOKE_AUTH_ME_STORAGE_KEY = 'transportada.smoke-auth-me'

export const TRIP_ID = '00000000-0000-4000-8000-000000000601'
const VEHICLE_ID = '00000000-0000-4000-8000-000000000602'
const DRIVER_ID = '00000000-0000-4000-8000-000000000603'
export const PENDING_DOCUMENT_ID = '00000000-0000-4000-8000-000000000604'
export const AUTHORIZED_DOCUMENT_ID = '00000000-0000-4000-8000-000000000605'
const NFE_DOCUMENT_ID = '00000000-0000-4000-8000-000000000606'

const BASE_TRIP = {
  companyId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2026-07-28T12:00:00.000Z',
  id: TRIP_ID,
  requiresMdfe: null,
  requiresMdfeReason: null,
  // ADR-0043 substituiu `open|closed` pelos oito estados operacionais; `open` virou `draft`
  status: 'draft',
  updatedAt: '2026-07-28T12:00:00.000Z',
  vehicleId: VEHICLE_ID,
} as const

type DocumentsMode = 'all-authorized' | 'has-pending'

function tripDocument(input: Readonly<{ cteAuthorized: boolean; id: string }>) {
  return {
    createdAt: '2026-07-28T12:05:00.000Z',
    cteAuthorized: input.cteAuthorized,
    deliveredAt: null,
    destinationOrigin: null,
    fiscalStatus: input.cteAuthorized ? 'authorized' : 'unsigned',
    freightCalculationId: null,
    id: input.id,
    // ADR-0043 §1: o eixo da nota, do qual o estado da viagem é derivado
    loadedAt: null,
    nfeDocumentId: NFE_DOCUMENT_ID,
    releasedAt: null,
    returnedAt: null,
    returnReason: null,
    separatedAt: null,
    separationStatus: 'pending',
    stopId: null,
    tripId: TRIP_ID,
    updatedAt: '2026-07-28T12:05:00.000Z',
  } as const
}

/**
 * ⚠️ **Anotado de propósito.** O guard do detalhe usa `hasExactKeys`: campo do corpo ausente aqui
 * reprova a validação inteira em tempo de execução, o detalhe não carrega, e a tela fica sem botão
 * nenhum — o smoke quebra em quatro casos e nenhum contrato de unidade acusa. Sem o tipo, só o
 * Playwright acha (spec 075).
 */
function tripDetail(mode: DocumentsMode): TripDetailContract {
  const documents =
    mode === 'has-pending'
      ? [
          tripDocument({ cteAuthorized: true, id: AUTHORIZED_DOCUMENT_ID }),
          tripDocument({ cteAuthorized: false, id: PENDING_DOCUMENT_ID }),
        ]
      : [tripDocument({ cteAuthorized: true, id: AUTHORIZED_DOCUMENT_ID })]

  return {
    ...BASE_TRIP,
    documents,
    drivers: [
      { driverId: DRIVER_ID, driverName: 'Jose da Silva', driverTaxId: '12345678901', position: 1 },
    ],
    /**
     * Spec 075: o guard do detalhe usa `hasExactKeys` — campo do corpo ausente aqui reprova a
     * validação inteira, o detalhe não carrega e a tela fica sem botão nenhum. `null` é o estado
     * legítimo: veículo sem capacidade conhecida não mostra ocupação.
     */
    cargoLayout: null,
    occupancy: null,
    // ADR-0043 §3: a viagem tem paradas. Vazia é estado legítimo — nota ainda não reconciliada.
    stops: [],
  }
}

type MockPermissions = readonly string[]

type MockState = {
  failures: string[]
  manifestCreations: number
  /** Spec 065 D4c: o que a tela mandou na dispensa — o motivo é a metade que importa. */
  mdfeRequirements: { reason: null | string; requiresMdfe: boolean | null }[]
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
      await fulfillOptions(route)
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

async function registerEmptyListMock(
  input: Readonly<{ page: Page; pattern: RegExp }>,
): Promise<void> {
  await input.page.route(input.pattern, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: [], page: { nextCursor: null } })
  })
}

/**
 * Spec 059: o detalhe da viagem consulta a prontidão ao abrir. Sem este mock a requisição escapa
 * para a API real, que não sobe no smoke — e o `requestfailed` entra em `failures()`.
 */
function fiscalReadiness(mode: DocumentsMode) {
  const authorized = {
    cteAccessKey: '35260700000000000000570010000000011000000017',
    cteFiscalDocumentId: '00000000-0000-4000-8000-000000000607',
    expectedDocument: 'cte',
    nfeDocumentId: NFE_DOCUMENT_ID,
    reason: 'ok',
    rejectionCode: null,
    rejectionMessage: null,
    tripDocumentId: AUTHORIZED_DOCUMENT_ID,
  } as const
  const pending = {
    cteAccessKey: null,
    cteFiscalDocumentId: null,
    expectedDocument: 'cte',
    nfeDocumentId: NFE_DOCUMENT_ID,
    reason: 'no_cte',
    rejectionCode: null,
    rejectionMessage: null,
    tripDocumentId: PENDING_DOCUMENT_ID,
  } as const

  const documents = mode === 'has-pending' ? [authorized, pending] : [authorized]

  return {
    documents,
    manifestableCount: documents.length,
    nfseCount: 0,
    readyCount: 1,
    state: mode === 'has-pending' ? 'incomplete' : 'ready',
    totalCount: documents.length,
  } as const
}

async function registerTripMocks(
  input: Readonly<{ mode: DocumentsMode; page: Page; state: MockState }>,
): Promise<void> {
  await input.page.route(/\/trips\/[^/]+\/mdfe-requirement$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    const body = route.request().postDataJSON() as {
      reason: null | string
      requiresMdfe: boolean | null
    }
    input.state.mdfeRequirements.push(body)
    await fulfillJson(route, {
      data: {
        effectiveRequiresMdfe: body.requiresMdfe ?? true,
        manifestableCount: 1,
        reason: body.reason,
        requiresMdfe: body.requiresMdfe,
      },
    })
  })
  await input.page.route(/\/trips(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: [BASE_TRIP], page: { nextCursor: null } })
  })
  await input.page.route(/\/trips\/[^/]+\/fiscal-readiness$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: fiscalReadiness(input.mode) })
  })
  await input.page.route(/\/trips\/[^/]+$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: tripDetail(input.mode) })
  })
}

async function registerMdfeManifestMocks(
  input: Readonly<{ page: Page; state: MockState }>,
): Promise<void> {
  await registerEmptyListMock({ page: input.page, pattern: /\/mdfe-manifests(?:\?.*)?$/ })
  await input.page.route(/\/trips\/[^/]+\/mdfe-manifests$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    input.state.manifestCreations += 1
    await fulfillJson(route, { data: {} }, 201)
  })
}

export async function mockTripWorkspaceApi(
  input: Readonly<{ mode: DocumentsMode; page: Page; permissions: MockPermissions }>,
): Promise<
  Readonly<{
    failures: () => readonly string[]
    manifestCreations: () => number
    mdfeRequirements: () => readonly MockState['mdfeRequirements'][number][]
  }>
> {
  const state: MockState = { failures: [], manifestCreations: 0, mdfeRequirements: [] }
  input.page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText
    if (isDiscardedByNavigation(errorText)) return
    if (new URL(request.url()).origin === 'http://localhost:53001') {
      state.failures.push(`${request.url()} ${errorText}`)
    }
  })
  await Promise.all([
    registerIdentityMock({ page: input.page, permissions: input.permissions }),
    registerUserPictureMock(input.page),
    registerTripMocks({ mode: input.mode, page: input.page, state }),
    registerMdfeManifestMocks({ page: input.page, state }),
    registerEmptyListMock({ page: input.page, pattern: /\/fleet\/vehicles(?:\?.*)?$/ }),
    registerEmptyListMock({ page: input.page, pattern: /\/fleet\/drivers(?:\?.*)?$/ }),
  ])
  return {
    failures: () => state.failures,
    manifestCreations: () => state.manifestCreations,
    mdfeRequirements: () => state.mdfeRequirements,
  }
}
