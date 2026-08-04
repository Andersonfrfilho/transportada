/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type Page, type Route } from '@playwright/test'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}
const SMOKE_AUTH_ME_STORAGE_KEY = 'transportada.smoke-auth-me'

const BATCH_ID = '00000000-0000-4000-8000-000000000501'

const BASE_BATCH = {
  correlationId: 'cte-batch-smoke-correlation',
  createdAt: '2026-07-22T20:00:00.000Z',
  id: BATCH_ID,
  itemCount: 1,
  name: 'Lote CT-e julho',
  status: 'draft',
  updatedAt: '2026-07-22T20:00:00.000Z',
  version: '1',
} as const

const EVENT = {
  batchId: BATCH_ID,
  createdAt: '2026-07-22T20:00:00.000Z',
  eventName: 'created',
  id: '00000000-0000-4000-8000-000000000503',
  payload: { itemCount: 1, status: 'draft' },
} as const

const CTE_ACCESS_KEY = '35260700000000000000570010000000010000000010'
const NFE_ACCESS_KEY = '35260700000000000000550010000000020000000020'

export const CTE_EXPORT_FILE_NAME = 'cte-xml-20260722-210000.zip'

/** ZIP real de uma entrada, gerado com fflate e congelado aqui — o frontend não depende do pacote. */
const SYNTHETIC_CTE_ARCHIVE_BASE64 =
  'UEsDBBQAAAAAAACon1unYwHxGAAAABgAAAAwAAAAMzUyNjA3MDAwMDAwMDAwMDAwMDA1NzAwMTAwMDAwMDAwMTAwMDAwMDAwMTAueG1sPGN0ZVByb2M+c21va2U8L2N0ZVByb2M+UEsBAhQAFAAAAAAAAKifW6djAfEYAAAAGAAAADAAAAAAAAAAAAAAAAAAAAAAADM1MjYwNzAwMDAwMDAwMDAwMDAwNTcwMDEwMDAwMDAwMDEwMDAwMDAwMDEwLnhtbFBLBQYAAAAAAQABAF4AAABmAAAAAAA='

export const SYNTHETIC_CTE_ARCHIVE_BYTES = Buffer.from(SYNTHETIC_CTE_ARCHIVE_BASE64, 'base64')

export const CTE_ITEM_ID = '00000000-0000-4000-8000-000000000504'

const CTE_ITEM = {
  accessKey: CTE_ACCESS_KEY,
  authorizationProtocol: '135260000000001',
  authorizedAt: '2026-07-22T21:00:00.000Z',
  baseAmount: '1234.5600',
  batchId: BATCH_ID,
  batchName: BASE_BATCH.name,
  billingStatus: 'pending',
  charges: [],
  createdAt: '2026-07-22T20:00:00.000Z',
  documents: [
    {
      accessKey: NFE_ACCESS_KEY,
      id: '00000000-0000-4000-8000-000000000506',
      number: '1',
      position: '1',
      series: '1',
      totalAmount: '1234.5600',
    },
  ],
  fiscalAmount: '55.5500',
  fiscalDocumentId: '00000000-0000-4000-8000-000000000505',
  fiscalNumber: '5000',
  fiscalSeries: '1',
  id: CTE_ITEM_ID,
  lastErrorCode: null,
  position: '1',
  status: 'authorized',
  totalAmount: '1290.1100',
} as const

type MockPermissions = readonly ('cte.manage' | 'cte.submit')[]

type BatchStatus = 'cancelled' | 'done' | 'draft' | 'error' | 'in_flight' | 'submitted'

type MockState = {
  batchCreations: number
  batchStatus: BatchStatus
  cancellations: number
  exportBodies: string[]
  failures: string[]
  itemListRequests: number
  listRequests: number
  submissions: number
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

function batchWithStatus(status: BatchStatus) {
  return { ...BASE_BATCH, status }
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

async function registerCteBatchMocks(
  input: Readonly<{ initialStatus: BatchStatus; page: Page; state: MockState }>,
): Promise<void> {
  input.state.batchStatus = input.initialStatus
  await input.page.route(/\/cte-batches(?:\?.*)?$/, async (route) => {
    if (route.request().url().includes('/cte-batches') && route.request().method() === 'GET') {
      input.state.listRequests += 1
    }
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    if (route.request().method() === 'POST') {
      input.state.batchCreations += 1
      input.state.batchStatus = 'draft'
      await fulfillJson(route, { data: batchWithStatus('draft') }, 201)
      return
    }
    await fulfillJson(route, {
      data: [batchWithStatus(input.state.batchStatus)],
      page: { nextCursor: null },
    })
  })
  // A transmissão em lote passa pelo cliente de emissão: `POST /cte-batches/:id/issue`, não `/submit`.
  await input.page.route(/\/cte-batches\/[^/]+\/issue$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    input.state.submissions += 1
    input.state.batchStatus = 'submitted'
    await fulfillJson(
      route,
      {
        data: {
          batchId: BATCH_ID,
          requestedAt: '2026-07-22T21:00:00.000Z',
          status: 'requested',
        },
      },
      202,
    )
  })
  await input.page.route(/\/cte-batches\/[^/]+\/cancel$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    input.state.cancellations += 1
    input.state.batchStatus = 'cancelled'
    await fulfillJson(route, { data: batchWithStatus('cancelled') })
  })
  await input.page.route(/\/cte-batches\/[^/]+\/events(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: [EVENT], page: { nextCursor: null } })
  })
  await input.page.route(/\/cte-batches\/[^/]+$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: batchWithStatus(input.state.batchStatus) })
  })
}

async function registerCteItemMocks(
  input: Readonly<{ page: Page; state: MockState }>,
): Promise<void> {
  await input.page.route(/\/cte-batch-items(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    input.state.itemListRequests += 1
    await fulfillJson(route, { data: [CTE_ITEM], page: { nextCursor: null } })
  })
  await input.page.route(/\/cte-batches\/items\/export$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    input.state.exportBodies.push(route.request().postData() ?? '')
    // Sem expor o content-disposition o cliente cai no nome de fallback: o header é cross-origin.
    await route.fulfill({
      body: SYNTHETIC_CTE_ARCHIVE_BYTES,
      contentType: 'application/zip',
      headers: {
        ...CORS_HEADERS,
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'Content-Disposition',
        'content-disposition': `attachment; filename="${CTE_EXPORT_FILE_NAME}"`,
      },
      status: 200,
    })
  })
}

export async function mockCteBatchWorkspaceApi(
  input: Readonly<{
    initialStatus?: BatchStatus
    page: Page
    permissions: MockPermissions
  }>,
): Promise<
  Readonly<{
    batchCreations: () => number
    cancellations: () => number
    exportBodies: () => readonly string[]
    failures: () => readonly string[]
    itemListRequests: () => number
    listRequests: () => number
    submissions: () => number
  }>
> {
  const state: MockState = {
    batchCreations: 0,
    batchStatus: input.initialStatus ?? 'draft',
    cancellations: 0,
    exportBodies: [],
    failures: [],
    itemListRequests: 0,
    listRequests: 0,
    submissions: 0,
  }
  input.page.on('requestfailed', (request) => {
    if (new URL(request.url()).origin === 'http://localhost:53001') {
      state.failures.push(`${request.url()} ${request.failure()?.errorText}`)
    }
  })
  await Promise.all([
    registerIdentityMock(input),
    registerCteBatchMocks({
      initialStatus: input.initialStatus ?? 'draft',
      page: input.page,
      state,
    }),
    registerCteItemMocks({ page: input.page, state }),
  ])
  return {
    batchCreations: () => state.batchCreations,
    cancellations: () => state.cancellations,
    exportBodies: () => state.exportBodies,
    failures: () => state.failures,
    itemListRequests: () => state.itemListRequests,
    listRequests: () => state.listRequests,
    submissions: () => state.submissions,
  }
}
