/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type Page, type Route } from '@playwright/test'

const SMOKE_AUTH_ME_STORAGE_KEY = 'transportada.smoke-auth-me'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key, Accept',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}

const IMPORT_SUMMARY = {
  correlationId: 'corr-smoke-nfe',
  counters: {
    duplicated: '0',
    failed: '0',
    imported: '1',
    invalid: '0',
    processed: '1',
    received: '1',
    rejected: '0',
  },
  createdAt: '2026-07-22T12:00:00.000Z',
  id: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e91',
  idempotencyKey: 'smoke-idempotency-key',
  source: 'upload',
  status: 'completed',
  terminalError: null,
  updatedAt: '2026-07-22T12:01:00.000Z',
  version: '1',
} as const

const DOCUMENT_PAGE = {
  data: [
    {
      accessKey: '35190730290856000160550010000000011000000010',
      cteBlockReason: null,
      emitterAddress: 'Rua das Cargas, 100',
      emitterCity: 'Sao Paulo',
      emitterCityCode: '3550308',
      emitterName: 'Emitente Transportada',
      emitterState: 'SP',
      emitterTaxId: '11222333000181',
      id: '4c596f2c-388e-4820-8e49-0fa5916f5cb0',
      issuedAt: '2026-07-22T10:00:00.000Z',
      nfseInvoiceId: null,
      nfseInvoiceNumber: null,
      number: '1',
      recipientAddress: 'Avenida do Destino, 200',
      recipientCity: 'Campinas',
      recipientCityCode: '3509502',
      recipientName: 'Destinatario Cliente',
      recipientState: 'SP',
      recipientTaxId: '11222333000181',
      series: '1',
      status: 'authorized',
      totalAmount: '1234.5600',
      // Spec 065 D4b: a nota saiu numa viagem, e continua livre para entrar no lote.
      tripId: '00000000-0000-4000-8000-000000000a11',
      tripStatus: 'in_transit',
      variant: 'complete',
    },
  ],
  page: { nextCursor: null },
} as const

function buildDocumentPage(
  input: Readonly<{ blockedDocumentCount: number; documentCount: number }>,
): unknown {
  const template = DOCUMENT_PAGE.data[0]
  return {
    data: Array.from({ length: input.documentCount }, (_unused, index) => ({
      ...template,
      accessKey: `${template.accessKey.slice(0, -3)}${String(index).padStart(3, '0')}`,
      cteBlockReason: index < input.blockedDocumentCount ? MISSING_WEIGHT_REASON : null,
      id: `${template.id.slice(0, -3)}${String(index).padStart(3, '0')}`,
      number: String(index + 1),
    })),
    page: { nextCursor: null },
  }
}

/** A tela abre em "sem CT-e emitido": nota bloqueada por vínculo sai do recorte e some da tabela. */
const MISSING_WEIGHT_REASON = 'CTE_BATCH_DOCUMENT_MISSING_WEIGHT'

const DISTRIBUTION_STATUS = {
  data: {
    canPull: true,
    environment: 'homologation',
    lastPulledAt: null,
    maxNsu: '0',
    nextAllowedAt: null,
    pullInProgress: false,
    ultNsu: '0',
  },
} as const

const EMISSION_PROFILE_ID = '00000000-0000-4000-8000-000000000905'

const EMISSION_PROFILE_PAGE = {
  data: [
    {
      cargoInsuranceDeclared: false,
      cfopInternal: '5353',
      cfopInterstate: '6353',
      chargeComponentLabel: 'Frete',
      components: [],
      createdAt: '2026-07-22T12:00:00.000Z',
      deliveryDays: '0',
      freightRule: {
        maximumAmount: null,
        minimumAmount: null,
        percentage: '0.045000',
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: null,
      },
      freightRuleId: '00000000-0000-4000-8000-000000000906',
      groupingMode: 'per_invoice',
      icmsBaseReductionRate: '0.000000',
      icmsCst: '90',
      icmsRate: '0.000000',
      id: EMISSION_PROFILE_ID,
      matchers: [{ matchRole: 'sender', taxId: '11222333000181' }],
      matchMode: 'sender_tax_id',
      modal: '01',
      name: 'Perfil de emissao smoke',
      observations: '',
      operationNature: 'Prestacao de servico de transporte',
      pickupDetails: '',
      pickupIndicator: '1',
      predominantProductMode: 'highest_value',
      predominantProductName: '',
      priority: '1',
      receiverIeIndicator: '1',
      serviceType: '0',
      status: 'active',
      taker: '0',
      updatedAt: '2026-07-22T12:00:00.000Z',
      version: '1',
    },
  ],
  page: { nextCursor: null },
} as const

const BATCH_PREVIEW = {
  blocked: [],
  projections: [
    {
      baseAmount: '1234.5600',
      documents: [
        {
          accessKey: DOCUMENT_PAGE.data[0].accessKey,
          documentId: DOCUMENT_PAGE.data[0].id,
          number: '1',
          series: '1',
          totalAmount: '1234.5600',
        },
      ],
      fiscalAmount: '55.5552',
      fiscalComponents: [],
      percentage: '0.045000',
      profile: {
        groupingMode: 'per_invoice',
        id: EMISSION_PROFILE_ID,
        matchedBy: 'sender_tax_id',
        name: 'Perfil de emissao smoke',
        resolvedBy: 'auto',
      },
      recipientTaxId: '11222333000181',
      senderTaxId: '11222333000181',
    },
  ],
  summary: {
    blockedCount: 0,
    documentCount: 1,
    projectedCount: 1,
    totalAmount: '55.5552',
  },
} as const

export const SYNTHETIC_NFE_XML = '<nfeProc versao="4.00"><NFe>synthetic-smoke-nfe</NFe></nfeProc>'
export const SYNTHETIC_NFE_FILE_NAME = 'synthetic-smoke-nfe.xml'

type MockState = {
  failures: string[]
  importRequests: number
  previewRequests: number
  reprocessRequests: number
  distributionRequests: number
  xmlDownloads: number
}

type MockPermissions = readonly (
  | 'cte.manage'
  | 'invoices.import'
  | 'invoices.read'
  /** Spec 058 P2: a distribuição multi-veículo lê a frota e escreve viagem. */
  | 'fleet.read'
  | 'settings.manage'
  | 'trip.manage'
)[]

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
  const origin = (await route.request().headerValue('origin')) ?? 'http://localhost:53000'
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: { ...CORS_HEADERS, 'access-control-allow-origin': origin },
    status,
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
      const origin = (await route.request().headerValue('origin')) ?? 'http://localhost:53000'
      await route.fulfill({
        headers: { ...CORS_HEADERS, 'access-control-allow-origin': origin },
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

async function registerNfeMocks(
  input: Readonly<{
    blockedDocumentCount: number
    documentCount: number
    page: Page
    state: MockState
  }>,
): Promise<void> {
  await input.page.route(/\/nfe-imports\/xml$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      const origin = (await route.request().headerValue('origin')) ?? 'http://localhost:53000'
      await route.fulfill({
        headers: { ...CORS_HEADERS, 'access-control-allow-origin': origin },
        status: 204,
      })
      return
    }
    input.state.importRequests += 1
    await fulfillJson(route, { data: IMPORT_SUMMARY }, 202)
  })
  await input.page.route(/\/nfe-imports\/distribution$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      const origin = (await route.request().headerValue('origin')) ?? 'http://localhost:53000'
      await route.fulfill({
        headers: { ...CORS_HEADERS, 'access-control-allow-origin': origin },
        status: 204,
      })
      return
    }
    if (route.request().method() === 'GET') {
      await fulfillJson(route, DISTRIBUTION_STATUS)
      return
    }
    input.state.distributionRequests += 1
    await fulfillJson(route, { data: { ...IMPORT_SUMMARY, source: 'distribution' } }, 202)
  })
  await input.page.route(/\/nfe-imports\/[^/]+\/reprocess$/, async (route) => {
    input.state.reprocessRequests += 1
    await fulfillJson(route, { data: IMPORT_SUMMARY }, 202)
  })
  await input.page.route(/\/nfe-imports(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, { data: [IMPORT_SUMMARY], page: { nextCursor: null } })
  })
  const documentPage = buildDocumentPage({
    blockedDocumentCount: input.blockedDocumentCount,
    documentCount: input.documentCount,
  })
  await input.page.route(/\/nfe-documents(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, documentPage)
  })
  await input.page.route(/\/nfe-documents\/[^/]+\/xml$/, async (route) => {
    input.state.xmlDownloads += 1
    await route.fulfill({
      body: SYNTHETIC_NFE_XML,
      contentType: 'application/xml',
      headers: CORS_HEADERS,
    })
  })
  await input.page.route(/\/cte-emission-profiles(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, EMISSION_PROFILE_PAGE)
  })
  await input.page.route(/\/cte-batches\/preview$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      const origin = (await route.request().headerValue('origin')) ?? 'http://localhost:53000'
      await route.fulfill({
        headers: { ...CORS_HEADERS, 'access-control-allow-origin': origin },
        status: 204,
      })
      return
    }
    input.state.previewRequests += 1
    await fulfillJson(route, { data: BATCH_PREVIEW })
  })
  await input.page.route(/\/view-preferences(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      const origin = (await route.request().headerValue('origin')) ?? 'http://localhost:53000'
      await route.fulfill({
        headers: { ...CORS_HEADERS, 'access-control-allow-origin': origin },
        status: 204,
      })
      return
    }
    await fulfillJson(route, { data: null })
  })
}

export async function mockNfeWorkspaceApi(
  input: Readonly<{
    blockedDocumentCount?: number
    documentCount?: number
    page: Page
    permissions: MockPermissions
  }>,
): Promise<
  Readonly<{
    distributionRequests: () => number
    failures: () => readonly string[]
    importRequests: () => number
    previewRequests: () => number
    reprocessRequests: () => number
    xmlDownloads: () => number
  }>
> {
  const state: MockState = {
    distributionRequests: 0,
    failures: [],
    importRequests: 0,
    previewRequests: 0,
    reprocessRequests: 0,
    xmlDownloads: 0,
  }
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
    registerNfeMocks({
      blockedDocumentCount: input.blockedDocumentCount ?? 0,
      documentCount: input.documentCount ?? 1,
      page: input.page,
      state,
    }),
  ])
  return {
    distributionRequests: () => state.distributionRequests,
    failures: () => state.failures,
    importRequests: () => state.importRequests,
    previewRequests: () => state.previewRequests,
    reprocessRequests: () => state.reprocessRequests,
    xmlDownloads: () => state.xmlDownloads,
  }
}
