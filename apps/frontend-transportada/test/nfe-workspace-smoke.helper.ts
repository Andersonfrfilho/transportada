/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type Page, type Route } from '@playwright/test'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key, Accept',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-origin': 'http://localhost:53000',
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
      emitterName: 'Emitente Transportada',
      id: '4c596f2c-388e-4820-8e49-0fa5916f5cb0',
      issuedAt: '2026-07-22T10:00:00.000Z',
      recipientName: 'Destinatario Cliente',
      status: 'authorized',
      totalAmount: '1234.5600',
      variant: 'complete',
    },
  ],
  page: { nextCursor: null },
} as const

export const SYNTHETIC_NFE_XML = '<nfeProc versao="4.00"><NFe>synthetic-smoke-nfe</NFe></nfeProc>'
export const SYNTHETIC_NFE_FILE_NAME = 'synthetic-smoke-nfe.xml'

type MockState = {
  failures: string[]
  importRequests: number
  reprocessRequests: number
  distributionRequests: number
  xmlDownloads: number
}

type MockPermissions = readonly ('invoices.import' | 'invoices.read')[]

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS_HEADERS,
    status,
  })
}

async function registerIdentityMock(
  input: Readonly<{ page: Page; permissions: MockPermissions }>,
): Promise<void> {
  await input.page.route('**/auth/me', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
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

async function registerNfeMocks(input: Readonly<{ page: Page; state: MockState }>): Promise<void> {
  await input.page.route(/\/nfe-imports\/xml$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    input.state.importRequests += 1
    await fulfillJson(route, { data: IMPORT_SUMMARY }, 202)
  })
  await input.page.route(/\/nfe-imports\/distribution$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
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
  await input.page.route(/\/nfe-documents(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, DOCUMENT_PAGE)
  })
  await input.page.route(/\/nfe-documents\/[^/]+\/xml$/, async (route) => {
    input.state.xmlDownloads += 1
    await route.fulfill({
      body: SYNTHETIC_NFE_XML,
      contentType: 'application/xml',
      headers: CORS_HEADERS,
    })
  })
}

export async function mockNfeWorkspaceApi(
  input: Readonly<{ page: Page; permissions: MockPermissions }>,
): Promise<
  Readonly<{
    distributionRequests: () => number
    failures: () => readonly string[]
    importRequests: () => number
    reprocessRequests: () => number
    xmlDownloads: () => number
  }>
> {
  const state: MockState = {
    distributionRequests: 0,
    failures: [],
    importRequests: 0,
    reprocessRequests: 0,
    xmlDownloads: 0,
  }
  input.page.on('requestfailed', (request) => {
    if (new URL(request.url()).origin === 'http://localhost:53001') {
      state.failures.push(`${request.url()} ${request.failure()?.errorText}`)
    }
  })
  await Promise.all([registerIdentityMock(input), registerNfeMocks({ page: input.page, state })])
  return {
    distributionRequests: () => state.distributionRequests,
    failures: () => state.failures,
    importRequests: () => state.importRequests,
    reprocessRequests: () => state.reprocessRequests,
    xmlDownloads: () => state.xmlDownloads,
  }
}
