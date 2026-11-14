/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T5.3: os prints da revisão de design (`web.md` §15) — o painel "Rateio das contas" em Configurações, em
 * tema claro e escuro, no desktop (1440) e no celular (375). Fora do smoke da CI: rodar com
 * `PLAYWRIGHT_TEST_MATCH=spec-325-rateio-prints.smoke.spec.ts`.
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
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, OPTIONS',
  'access-control-allow-origin': '*',
}

const CATEGORIES = [
  ['Aluguel', 'administrative', false],
  ['Impostos', 'administrative', false],
  ['Folha', 'administrative', false],
  ['Seguro', 'vehicle_fixed', false],
  ['Manutenção', 'per_km', false],
  ['Combustível', 'per_km', false],
  ['Pagamento de motorista/agregado', 'in_trip', true],
  ['Outros', 'administrative', false],
].map(([name, costGroup, requiresDriver], index) => ({
  active: true,
  costGroup,
  id: `00000000-0000-4000-8000-0000000002${String(index).padStart(2, '0')}`,
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
    test(`print: rateio das contas (${theme}, ${viewport})`, async ({ page }) => {
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
      await page.route(/\/expense-allocation-settings(?:\?.*)?$/, (route) =>
        fulfill(route, {
          data: { administrative: 'per_revenue', per_km: 'per_km', vehicle_fixed: 'per_km' },
        }),
      )
      await page.route(/\/expense-out-of-pattern-settings(?:\?.*)?$/, (route) =>
        fulfill(route, { data: { thresholdPercent: 10 } }),
      )
      await loginAsLocalUser(page)
      await page.evaluate(() => {
        window.history.pushState({}, '', '/company-settings')
        window.dispatchEvent(new PopStateEvent('popstate'))
      })
      await page.getByRole('tab', { name: 'Rateio das contas' }).click()
      await expect(page.getByRole('heading', { level: 2, name: 'Rateio das contas' })).toBeVisible()
      await expect(page.getByText('Pagamento de motorista/agregado')).toBeVisible()
      await page.screenshot({
        fullPage: true,
        path: resolve(PRINTS_DIRECTORY, `rateio-${theme}-${viewport}.png`),
      })
    })
  }
}
