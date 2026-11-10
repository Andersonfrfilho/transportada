/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Prints do bloco "WhatsApp" na edição de usuário (administrador grava o número já verificado): claro e escuro,
 * desktop e celular. Dados sintéticos, rotas dubladas em memória, sem API nem banco. Rodam por fora do smoke da CI.
 */
import { resolve } from 'node:path'

import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'

const PRINTS_DIRECTORY = resolve(process.env.WA_ADMIN_PRINTS_DIRECTORY ?? '/tmp/wa-admin-prints')
const SMOKE_AUTH_ME_STORAGE_KEY = 'transportada.smoke-auth-me'
const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ADMIN_ID = '00000000-0000-4000-8000-000000000002'
const TARGET_ID = '00000000-0000-4000-8000-000000000053'
const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}
const VIEWPORTS = {
  desktop: { height: 1000, width: 1440 },
  celular: { height: 812, width: 375 },
} as const
const THEMES = { claro: 'light', escuro: 'dark' } as const
const PERMISSIONS = ['users.manage', 'fleet.read']

const USER = {
  contact: { channel: 'email', masked: 'ma****@alfa.example.test' },
  email: 'ma****@alfa.example.test',
  emails: [],
  hasPicture: false,
  id: TARGET_ID,
  jobTitle: 'Atendente',
  membershipId: '00000000-0000-4000-8000-000000000054',
  name: 'Marina Souza',
  phone: '(16) *****-1234',
  roles: ['operator'],
  status: 'active',
  taxId: '***.***.***-00',
  username: 'marina.souza',
}

async function fulfill(route: Route, body: unknown, status = 200): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({ headers: CORS_HEADERS, status: 204 })
  }
  return route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS_HEADERS,
    status,
  })
}

async function mockUsersApi(page: Page, state: { phone: null | string }): Promise<void> {
  const identity = {
    company: { id: COMPANY_ID },
    identity: { userId: ADMIN_ID },
    permissions: PERMISSIONS,
    roles: ['company-admin'],
  }
  await page.addInitScript(
    ({ data, storageKey }) => window.sessionStorage.setItem(storageKey, JSON.stringify({ data })),
    { data: identity, storageKey: SMOKE_AUTH_ME_STORAGE_KEY },
  )
  await page.route('**/auth/me', (route) => fulfill(route, { data: identity }))
  await page.route('**/company-users/*/picture', (route) =>
    route.fulfill({ headers: CORS_HEADERS, status: 404 }),
  )
  await page.route(/\/company-users(?:\?.*)?$/, (route) =>
    fulfill(route, { data: [USER], page: { nextCursor: null } }),
  )
  await page.route(/\/company-users\/[^/]+\/whatsapp-phone$/, async (route) => {
    const method = route.request().method()
    if (method === 'PUT') {
      state.phone = '+55 16 *****-1234'
      return route.fulfill({ headers: CORS_HEADERS, status: 204 })
    }
    if (method === 'DELETE') {
      state.phone = null
      return route.fulfill({ headers: CORS_HEADERS, status: 204 })
    }
    return fulfill(route, {
      data:
        state.phone === null
          ? { status: 'none' }
          : {
              expiresAt: '2027-02-08T12:00:00.000Z',
              phone: state.phone,
              status: 'verified',
              verifiedAt: '2026-11-10T12:00:00.000Z',
            },
    })
  })
  for (const pattern of [
    /\/company-users\/reconciliation/,
    /\/company-groups/,
    /\/access-profiles/,
    /\/roles/,
  ]) {
    await page.route(pattern, (route) => fulfill(route, { data: [], page: { nextCursor: null } }))
  }
}

async function openEditDialog(page: Page, state: { phone: null | string }): Promise<void> {
  await mockUsersApi(page, state)
  await loginAsLocalUser(page)
  await page.evaluate(() => {
    window.history.pushState({}, '', '/usuarios')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.getByRole('button', { name: 'Editar', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'WhatsApp' })).toBeVisible()
}

for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
  for (const [themeName, colorScheme] of Object.entries(THEMES)) {
    for (const stage of ['sem-vinculo', 'verificado'] as const) {
      test(`print: bloco WhatsApp ${stage}, ${viewportName}, ${themeName}`, async ({ page }) => {
        await page.setViewportSize(viewport)
        await page.emulateMedia({ colorScheme })
        const state = { phone: stage === 'verificado' ? '+55 16 *****-1234' : null }
        await openEditDialog(page, state)
        const panel = page
          .locator('div')
          .filter({ has: page.getByRole('heading', { name: 'WhatsApp' }) })
          .last()
        await panel.scrollIntoViewIfNeeded()
        await expect(panel).toBeVisible()
        await panel.screenshot({
          path: resolve(PRINTS_DIRECTORY, `whatsapp-${stage}-${viewportName}-${themeName}.png`),
        })
      })
    }
  }
}
