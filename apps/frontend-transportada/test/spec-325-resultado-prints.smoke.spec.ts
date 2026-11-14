/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T5.2/T5.2b: os prints da revisão de design (`web.md` §15) da página `/contas/resultado` — claro e escuro,
 * desktop (1440) e celular (390). Fora do smoke da CI: rodar com
 * `PLAYWRIGHT_TEST_MATCH=spec-325-resultado-prints.smoke.spec.ts`.
 */
import { resolve } from 'node:path'

import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

test.use({ serviceWorkers: 'block' })

const PRINTS_DIRECTORY =
  process.env.SPEC_325_PRINTS_DIRECTORY ??
  resolve(process.cwd(), '../../specs/325-contas-fixas-e-variaveis/prints')
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

const BY_TRIP = [
  ['a1b2c3d4', '6200.00', '3050.00', '207.02', '560.14', '2382.84'],
  ['b2c3d4e5', '3100.00', '1480.00', '103.51', '280.07', '1236.42'],
  ['c3d4e5f6', '9800.00', '4620.00', '327.22', '885.38', '3967.40'],
  ['d4e5f6a7', '2250.00', '980.00', '50.08', '203.28', '1016.64'],
  ['e5f6a7b8', '11400.00', '5900.00', '414.03', '1029.93', '4056.04'],
].map(([id, revenue, cost, vehicleShare, generalShare, margin]) => ({
  cost,
  generalShare,
  id,
  margin,
  revenue,
  vehicleShare,
}))

function result(revenue: string, profit: string) {
  return {
    data: {
      byCustomer: [
        { ...BY_TRIP[0], id: 'Distribuidora Alfa' },
        { ...BY_TRIP[1], id: 'Mercantil Norte' },
        { ...BY_TRIP[2], id: 'sem-cliente' },
      ],
      byTrip: BY_TRIP,
      byVehicle: [
        { ...BY_TRIP[0], id: 'ABC1D23' },
        { ...BY_TRIP[1], id: 'DEF4G56' },
        { ...BY_TRIP[3], id: 'sem-veiculo' },
      ],
      settings: { administrative: 'per_revenue', per_km: 'per_km', vehicle_fixed: 'per_km' },
      totals: { expensesTotal: '12829.90', profit, revenue, tripCost: '51000.00' },
      unallocatedItems: [],
      unallocatedTotal: '0.00',
    },
  }
}

async function openResult(page: Page): Promise<void> {
  await page.waitForTimeout(600)
  const close = page.getByRole('button', { name: 'Fechar menu' })
  if (await close.isVisible()) await close.dispatchEvent('click')
  await page.evaluate(() => {
    window.history.pushState({}, '', '/contas/resultado')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.waitForTimeout(400)
  if (await close.isVisible()) await close.dispatchEvent('click')
}

for (const theme of THEMES) {
  for (const [viewport, size] of Object.entries(VIEWPORTS)) {
    test(`print: Resultado (${theme}, ${viewport})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize(size)
      await mockTripWorkspaceApi({
        mode: 'all-authorized',
        page,
        permissions: ['expenses.read', 'expenses.manage', 'fleet.read'],
      })
      let exportRequest: string | null = null
      await page.route(/\/expense-result\/export(?:\?.*)?$/, async (route) => {
        exportRequest = route.request().url()
        await route.fulfill({
          body: 'a;b',
          headers: {
            ...CORS,
            'content-disposition': 'attachment; filename="resultado.csv"',
            'content-type': 'text/csv',
          },
          status: 200,
        })
      })
      await page.route(/\/expense-unit-costs(?:\?.*)?$/, (route) =>
        fulfill(route, {
          calculatedAt: new Date().toISOString(),
          data: {
            general: {
              costPerKm: '5.4100',
              expensesShare: '12829.90',
              kilometers: '11800.0000',
              totalCost: '63829.90',
              tripCost: '51000.00',
              vehicleId: null,
            },
            perVehicle: [],
          },
        }),
      )
      await page.route(/\/expense-result(?:\?.*)?$/, (route) => {
        const from = new URL(route.request().url()).searchParams.get('from') ?? ''
        const current = from.endsWith('-01') && from >= new Date().toISOString().slice(0, 7)
        return fulfill(route, {
          calculatedAt: new Date().toISOString(),
          ...(current ? result('98400.00', '34570.10') : result('91250.00', '30540.00')),
        })
      })
      await page.route(/\/expense-categories(?:\?.*)?$/, (route) =>
        fulfill(route, {
          data: [{ active: true, id: 'cat-1', name: 'Seguro', requiresDriver: false }],
        }),
      )
      await loginAsLocalUser(page)
      await openResult(page)
      await expect(page.getByRole('heading', { level: 1, name: 'Resultado do mês' })).toBeVisible()
      await expect(page.getByText('Faturamento de fretes')).toBeVisible()
      await page.screenshot({
        fullPage: true,
        path: resolve(PRINTS_DIRECTORY, `resultado-${theme}-${viewport}.png`),
      })

      await page.getByRole('tab', { name: 'Por veículo' }).click()
      await expect(page.getByText('ABC1D23')).toBeVisible()
      await page.getByRole('button', { name: 'Exportar planilha (CSV)' }).click()
      await expect.poll(() => exportRequest).toContain('format=csv')
    })
  }
}
