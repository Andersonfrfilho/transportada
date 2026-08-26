/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type Page, type Route } from '@playwright/test'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const SMOKE_AUTH_ME_STORAGE_KEY = 'transportada.smoke-auth-me'
const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'

/** Toda listagem da frota responde vazia: o que este smoke exercita é o formulário, não a tabela. */
const EMPTY_LIST_PATTERNS: readonly RegExp[] = [
  /\/fleet\/vehicles(?:\?.*)?$/,
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

export async function mockFleetWorkspaceApi(
  input: Readonly<{ page: Page; permissions: readonly string[] }>,
): Promise<Readonly<{ failures: () => readonly string[] }>> {
  const failures: string[] = []
  input.page.on('requestfailed', (request) => {
    if (new URL(request.url()).origin === 'http://localhost:53001') {
      failures.push(`${request.url()} ${request.failure()?.errorText}`)
    }
  })

  await registerIdentityMock({ page: input.page, permissions: input.permissions })
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

  return { failures: () => failures }
}
