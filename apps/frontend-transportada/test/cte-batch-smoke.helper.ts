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

type MockPermissions = readonly ('cte.manage' | 'cte.submit')[]

type BatchStatus = 'cancelled' | 'done' | 'draft' | 'error' | 'in_flight' | 'submitted'

type MockState = {
  batchCreations: number
  batchStatus: BatchStatus
  cancellations: number
  failures: string[]
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
  await input.page.route(/\/cte-batches\/[^/]+\/submit$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    input.state.submissions += 1
    input.state.batchStatus = 'submitted'
    await fulfillJson(route, { data: batchWithStatus('submitted') }, 202)
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
    failures: () => readonly string[]
    listRequests: () => number
    submissions: () => number
  }>
> {
  const state: MockState = {
    batchCreations: 0,
    batchStatus: input.initialStatus ?? 'draft',
    cancellations: 0,
    failures: [],
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
  ])
  return {
    batchCreations: () => state.batchCreations,
    cancellations: () => state.cancellations,
    failures: () => state.failures,
    listRequests: () => state.listRequests,
    submissions: () => state.submissions,
  }
}
