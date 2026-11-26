/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Prints da revisão de design (`web.md` §15) de `/contas/resultado` com os interruptores de custo (gastos das vans, fatura do
 * cartão) e as linhas do que ficou fora do cálculo — claro e escuro, desktop (1440) e celular (390). Fora do smoke da CI: rodar com
 * `PLAYWRIGHT_TEST_MATCH=resultados-custos-prints.smoke.spec.ts`.
 */
import { resolve } from 'node:path'

import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { VEHICLE_DETAIL } from './fleet/fleet.fixture'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

test.use({ serviceWorkers: 'block' })

const PRINTS_DIRECTORY =
  process.env.RESULTADOS_CUSTOS_PRINTS_DIRECTORY ??
  resolve(process.cwd(), '../../tmp/resultados-custos-prints')
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

const VEHICLES = [
  ['v-1', 'QNF0I62', 'Volvo', 'FH 540', 2021, '8049.49', '3995.40', '0.00', '8534.10'],
  ['v-2', 'EPJ5E96', 'Mercedes-Benz', 'Actros 2651', 2019, '533.57', '200.00', '0.00', '565.95'],
  ['v-3', 'HIC2C79', 'Fiat', 'Fiorino', 0, '3759.22', '3043.77', '0.00', '3986.53'],
  ['v-4', 'IUZ9D73', '', '', 0, '10457.65', '4950.14', '480.00', '11162.13'],
] as const

const LINES = VEHICLES.map(([id, , , , , revenue, cost, vehicleShare, generalShare]) => ({
  cost,
  generalShare,
  id,
  margin: String(
    (Number(revenue) - Number(cost) - Number(vehicleShare) - Number(generalShare)).toFixed(2),
  ),
  revenue,
  vehicleShare,
}))

const RESULT = {
  data: {
    byCustomer: [],
    byTrip: LINES.map((line, index) => ({
      ...line,
      id: `trip-${String(index)}`,
      trip: {
        customerId: 'sem-cliente',
        distanceMeters: 100_000,
        route: { destination: 'CAMPINAS', origin: 'RIBEIRAO PRETO' },
        vehicleId: line.id,
      },
    })),
    byVehicle: LINES,
    excluded: { aggregateVehicles: '340.00', category: '600.00', tripCosts: '0.00' },
    settings: { administrative: 'per_revenue', per_km: 'per_km', vehicle_fixed: 'per_km' },
    totals: { expensesTotal: '0.00', profit: '0.00', revenue: '22800.00', tripCost: '11189.31' },
    unallocatedItems: [],
    unallocatedTotal: '0.00',
  },
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
    test(`print: Margem por veículo (${theme}, ${viewport})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize(size)
      await mockTripWorkspaceApi({
        mode: 'all-authorized',
        page,
        permissions: ['expenses.read', 'expenses.manage', 'fleet.read'],
      })
      await page.route(/\/fleet\/vehicles(?:\?.*)?$/, (route) =>
        fulfill(route, {
          data: VEHICLES.map(([id, plate, brand, model, modelYear]) => ({
            ...VEHICLE_DETAIL,
            brand,
            id,
            model,
            modelYear,
            ownership: id === 'v-2' ? 'aggregate' : 'own',
            owner:
              id === 'v-2'
                ? {
                    name: 'José da Silva',
                    rntrc: '12345678',
                    state: 'SP',
                    taxId: '12345678000195',
                    taxRegime: '1',
                  }
                : null,
            plate,
          })),
          page: { nextCursor: null },
        }),
      )
      await page.route(/\/expense-forecast(?:\?.*)?$/, (route) =>
        fulfill(route, {
          data: {
            forecast: null,
            monthsOfData: 0,
            month: '2026-11',
            nextMonth: '2026-12',
            nextMonthBusinessDays: 22,
            outOfPattern: [],
            recurringExpenses: '0.00',
            status: 'unavailable',
            thresholdPercent: 10,
          },
        }),
      )
      await page.route(/\/expense-unit-costs(?:\?.*)?$/, (route) =>
        fulfill(route, {
          data: {
            general: {
              costPerKm: null,
              expensesShare: '0.00',
              kilometers: '0.000',
              totalCost: '0.00',
              tripCost: '0.00',
              vehicleId: null,
            },
            perVehicle: [],
          },
        }),
      )
      // A API dublada segue a regra: a fatura só sai (e volta em `excluded.category`) com `excludeCardInvoice=true`.
      await page.route(/\/expense-result(?:\?.*)?$/, (route) => {
        const dropped = route.request().url().includes('excludeCardInvoice=true')
        return fulfill(route, {
          calculatedAt: new Date().toISOString(),
          data: {
            ...RESULT.data,
            excluded: { ...RESULT.data.excluded, category: dropped ? '600.00' : '0.00' },
          },
        })
      })
      await page.route(/\/expense-categories(?:\?.*)?$/, (route) =>
        fulfill(route, {
          data: [
            { active: true, id: 'cat-card', name: 'Cartão de crédito', requiresDriver: false },
          ],
        }),
      )
      await loginAsLocalUser(page)
      await openResult(page)

      const urls: string[] = []
      page.on('request', (request) => {
        if (/\/expense-result\?/.test(request.url())) urls.push(request.url())
      })
      await expect(
        page.getByText(/Contas de veículos agregados ou de terceiros: R\$\s340,00/),
      ).toBeVisible()
      await expect(page.getByText(/Fatura do cartão de crédito: R\$/)).toHaveCount(0)
      await page.screenshot({
        fullPage: true,
        path: resolve(PRINTS_DIRECTORY, `resultado-custos-${theme}-${viewport}.png`),
      })

      await page.getByRole('checkbox', { name: 'Contar a fatura do cartão de crédito' }).uncheck()
      await expect(page.getByText(/Fatura do cartão de crédito: R\$\s600,00/)).toBeVisible()
      await expect
        .poll(() => urls.some((url) => url.includes('excludeCardInvoice=true')))
        .toBe(true)
      await page.screenshot({
        fullPage: true,
        path: resolve(PRINTS_DIRECTORY, `resultado-custos-sem-fatura-${theme}-${viewport}.png`),
      })
      await page.getByRole('checkbox', { name: 'Contar os gastos lançados nas viagens' }).uncheck()
      await expect.poll(() => urls.some((url) => url.includes('excludeTripCosts=true'))).toBe(true)
    })
  }
}
