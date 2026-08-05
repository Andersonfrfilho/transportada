/* Copyright (c) 2026 Ada Technology. MIT License. */
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
  status: 'open',
  updatedAt: '2026-07-28T12:00:00.000Z',
  vehicleId: VEHICLE_ID,
} as const

type DocumentsMode = 'all-authorized' | 'has-pending'

function tripDocument(input: Readonly<{ cteAuthorized: boolean; id: string }>) {
  return {
    createdAt: '2026-07-28T12:05:00.000Z',
    cteAuthorized: input.cteAuthorized,
    deliveredAt: null,
    fiscalStatus: input.cteAuthorized ? 'authorized' : 'unsigned',
    freightCalculationId: null,
    id: input.id,
    nfeDocumentId: NFE_DOCUMENT_ID,
    releasedAt: null,
    tripId: TRIP_ID,
    updatedAt: '2026-07-28T12:05:00.000Z',
  } as const
}

function tripDetail(mode: DocumentsMode) {
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
    drivers: [{ driverId: DRIVER_ID, driverName: 'Jose da Silva', driverTaxId: '12345678901', position: 1 }],
  }
}

type MockPermissions = readonly string[]

type MockState = {
  failures: string[]
  manifestCreations: number
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

async function registerEmptyListMock(input: Readonly<{ page: Page; pattern: RegExp }>): Promise<void> {
  await input.page.route(input.pattern, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: [], page: { nextCursor: null } })
  })
}

async function registerTripMocks(
  input: Readonly<{ mode: DocumentsMode; page: Page }>,
): Promise<void> {
  await input.page.route(/\/trips(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: [BASE_TRIP], page: { nextCursor: null } })
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
): Promise<Readonly<{ failures: () => readonly string[]; manifestCreations: () => number }>> {
  const state: MockState = { failures: [], manifestCreations: 0 }
  input.page.on('requestfailed', (request) => {
    if (new URL(request.url()).origin === 'http://localhost:53001') {
      state.failures.push(`${request.url()} ${request.failure()?.errorText}`)
    }
  })
  await Promise.all([
    registerIdentityMock({ page: input.page, permissions: input.permissions }),
    registerTripMocks({ mode: input.mode, page: input.page }),
    registerMdfeManifestMocks({ page: input.page, state }),
    registerEmptyListMock({ page: input.page, pattern: /\/fleet\/vehicles(?:\?.*)?$/ }),
    registerEmptyListMock({ page: input.page, pattern: /\/fleet\/drivers(?:\?.*)?$/ }),
  ])
  return {
    failures: () => state.failures,
    manifestCreations: () => state.manifestCreations,
  }
}
