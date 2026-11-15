/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T2.3: os prints da revisão de design (`web.md` §15) — o painel "Categorias de contas" em Configurações, em
 * tema claro e escuro, no desktop (1440) e no celular (375). Fora do smoke da CI: rodar com
 * `PLAYWRIGHT_TEST_MATCH=spec-325-categorias-prints.smoke.spec.ts`.
 */
import { resolve } from 'node:path'

import { expect, test, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { COMPANY_SETTINGS_RESPONSE } from './company-settings/company-settings.fixture'
import { mockOccurrenceDetailPrintsApi } from './spec-183-prints-smoke.helper'

test.use({ serviceWorkers: 'block' })

const PRINTS_DIRECTORY =
  process.env.SPEC_325_PRINTS_DIRECTORY ??
  resolve(process.cwd(), '../../specs/325-contas-fixas-e-variaveis/prints')
const VIEWPORTS = [
  ['desktop', { height: 900, width: 1440 }],
  ['mobile', { height: 844, width: 375 }],
] as const
const THEMES = ['light', 'dark'] as const
const CORS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
  'access-control-allow-origin': '*',
}

const CATEGORIES = [
  ['Aluguel', true, false],
  ['Folha', true, false],
  ['Impostos', true, false],
  ['Seguro', true, false],
  ['Manutenção', true, false],
  ['Combustível', true, false],
  ['Pagamento de motorista/agregado', true, true],
  ['Outros', true, false],
  ['Internet do escritório', false, false],
].map(([name, active, requiresDriver], index) => ({
  active,
  id: `00000000-0000-4000-8000-0000000001${String(index).padStart(2, '0')}`,
  name,
  requiresDriver,
}))

async function fulfill(route: Route, body: unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ headers: CORS, status: 204 })
    return
  }
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS,
    status: 200,
  })
}

for (const theme of THEMES) {
  for (const [viewport, size] of VIEWPORTS) {
    test(`print: categorias de contas (${theme}, ${viewport})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize(size)
      await mockOccurrenceDetailPrintsApi({
        page,
        permissions: ['settings.manage', 'expenses.read', 'expenses.manage'],
      })
      await page.route(/\/company-settings$/, (route) => fulfill(route, COMPANY_SETTINGS_RESPONSE))
      await page.route(/\/company-settings\/logo$/, (route) =>
        route.fulfill({ headers: CORS, status: 404 }),
      )
      await page.route(/\/digital-certificates(\?.*)?$/, (route) =>
        fulfill(route, { data: [], page: { nextCursor: null } }),
      )
      await page.route(/\/expense-categories(?:\?.*)?$/, (route) =>
        fulfill(route, { data: CATEGORIES }),
      )
      await loginAsLocalUser(page)
      await page.evaluate(() => {
        window.history.pushState({}, '', '/company-settings')
        window.dispatchEvent(new PopStateEvent('popstate'))
      })
      await page.getByRole('tab', { name: 'Categorias de contas' }).click()
      await expect(
        page.getByRole('heading', { level: 2, name: 'Categorias de contas' }),
      ).toBeVisible()
      await expect(page.getByText('Internet do escritório')).toBeVisible()
      await page.screenshot({
        fullPage: true,
        path: resolve(PRINTS_DIRECTORY, `categorias-${theme}-${viewport}.png`),
      })
    })
  }
}
