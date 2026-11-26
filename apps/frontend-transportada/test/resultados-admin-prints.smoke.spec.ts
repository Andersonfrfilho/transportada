/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Prints do menu e da página Resultados por perfil: o administrador (`financial-results.read`) vê o item e a tela;
 * o financeiro (só `trip.financials`) não vê o item e a rota cai na parede. Tema claro e escuro, desktop (1440) e
 * celular (390). Fora do smoke da CI: rodar com `PLAYWRIGHT_TEST_MATCH=resultados-admin-prints.smoke.spec.ts`.
 */
import { resolve } from 'node:path'

import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

test.use({ serviceWorkers: 'block' })

const PRINTS_DIRECTORY =
  process.env.RESULTADOS_PRINTS_DIRECTORY ?? resolve(process.cwd(), '../../tmp/resultados-prints')
const VIEWPORTS = {
  desktop: { height: 900, width: 1440 },
  mobile: { height: 844, width: 390 },
} as const
const THEMES = ['light', 'dark'] as const
const CORS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}

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

const SUMMARY = {
  costTotal: '41200.00',
  groups: [
    {
      costTotal: '22000.00',
      groupId: 'p1',
      groupLabel: 'Semana 1',
      isComplete: true,
      netAmount: '9000.00',
      revenueAmount: '34000.00',
      taxTotal: '3000.00',
      tripCount: 6,
    },
  ],
  isComplete: true,
  marginRate: '0.2150',
  netAmount: '18800.00',
  payrollAmount: null,
  revenueAmount: '68000.00',
  taxTotal: '8000.00',
  tripCount: 12,
}

async function goToResultados(page: Page): Promise<void> {
  await page.waitForTimeout(600)
  const close = page.getByRole('button', { name: 'Fechar menu' })
  if (await close.isVisible()) await close.dispatchEvent('click')
  await page.evaluate(() => {
    window.history.pushState({}, '', '/resultados')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.waitForTimeout(500)
  if (await close.isVisible()) await close.dispatchEvent('click')
}

const PROFILES = {
  admin: ['financial-results.read', 'trip.financials', 'fleet.read', 'billing.read'],
  finance: ['trip.financials', 'fleet.read', 'billing.read'],
} as const

for (const theme of THEMES) {
  for (const [viewport, size] of Object.entries(VIEWPORTS)) {
    for (const [profile, permissions] of Object.entries(PROFILES)) {
      test(`print: Resultados como ${profile} (${theme}, ${viewport})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme })
        await page.setViewportSize(size)
        await mockTripWorkspaceApi({ mode: 'all-authorized', page, permissions })
        await page.route(/\/financial-results(?:\?.*)?$/, (route) =>
          fulfill(route, { data: SUMMARY }),
        )
        await loginAsLocalUser(page)
        await page.waitForTimeout(600)

        // Menu aberto no grupo Fiscal: o item Resultados só existe para o administrador.
        const expand = page.getByRole('button', { name: 'Expandir menu' })
        if (await expand.isVisible()) await expand.dispatchEvent('click')
        const menuItem = page
          .getByRole('navigation', { name: 'Módulos' })
          .getByText('Resultados', { exact: true })
        // O grupo do workspace atual já abre sozinho; só abre à mão quando estiver fechado.
        if (profile === 'admin' && !(await menuItem.isVisible())) {
          await page.getByRole('button', { name: 'Fiscal' }).first().dispatchEvent('click')
        }
        await page.waitForTimeout(300)
        if (profile === 'admin') await expect(menuItem).toBeVisible()
        else await expect(menuItem).toHaveCount(0)
        await page.screenshot({
          path: resolve(PRINTS_DIRECTORY, `menu-${profile}-${theme}-${viewport}.png`),
        })

        await goToResultados(page)
        if (profile === 'admin') {
          await expect(page.getByText('Semana 1')).toBeVisible()
        } else {
          await expect(page.getByText('Semana 1')).toHaveCount(0)
        }
        await page.screenshot({
          path: resolve(PRINTS_DIRECTORY, `pagina-${profile}-${theme}-${viewport}.png`),
        })
      })
    }
  }
}
